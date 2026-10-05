import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ACTIONS, DEFAULT_CONFIG, classifyAction, discountedReturns, encodeState, estimatePolicy, formatGuidance, jaccard, LearningEngine, normalize, retrieve, toolReward, validateConfig, type Action, type Match, type Step, type Trajectory } from "../src/core/index.js";
import { SqliteTrajectoryStore } from "../src/storage/sqlite.js";
import { shellExitCode } from "../src/pi/results.js";

function step(action: Action, value: number): Step {
  return { callId: action, action, state: encodeState("fix typescript api bug", ["EDIT"], true, "success"), reward: { tool: 0, verification: value, repetition: 0, total: value }, return: value };
}
function trajectory(id: string, steps: Step[], project = "project"): Trajectory {
  return { id, steps, project, session: "session", createdAt: Date.now(), status: "completed", gamma: 0.9, feedback: 0 };
}

test("state encoding redacts common credentials and tokenizes Chinese tasks", () => {
  const task = normalize("修复接口错误 token=private123 Authorization: Bearer abcd-secret sk-1234567890123456 https://user:pass@host/secret");
  assert.ok(!task.includes("private123"));
  assert.ok(!task.includes("abcd-secret"));
  assert.ok(!task.includes("sk-123"));
  assert.ok(!task.includes("pass@"));
  const state = encodeState(task, [], false, "none");
  assert.ok(state.features.includes("task:修 复"));
  assert.equal(jaccard(["a", "a", "b"], ["a", "c"]), 1 / 3);
  assert.equal(jaccard([], []), 0);
});

test("classifies verification runners, but not echoed commands or masked failures", () => {
  const cases: [string, Action][] = [
    ["npm test", "TEST"], ["pnpm run test:unit --run", "TEST"], ["python3 -m pytest", "TEST"],
    ["cargo test", "TEST"], ["npx tsc --noEmit", "TYPECHECK"], ["npm run build", "BUILD"],
    ["npm run lint", "LINT"], ["git diff", "GIT"], ["rg bug src", "SEARCH"],
    ["echo npm test", "BASH"], ["npm test || true", "BASH"], ["npm test; echo done", "BASH"],
    ["npm test | tee log", "BASH"], ["cd project && npm test", "BASH"],
  ];
  for (const [command, expected] of cases) assert.equal(classifyAction("bash", { command }), expected, command);
});

test("reward uses exit status, failure penalties and repetition instead of output claims", () => {
  assert.equal(toolReward("TEST", false, 0).total, 0.8);
  assert.equal(toolReward("TEST", false, undefined).total, 0);
  assert.equal(toolReward("TEST", false, 1).total, -0.7);
  assert.equal(toolReward("TEST", true, 1, true).total, -1);
  assert.equal(toolReward("READ", false, undefined).total, 0);
  assert.equal(shellExitCode({ isError: false, structuredContent: { exit_code: 1 }, content: [{ type: "text", text: "all tests pass" }] }), 1);
  assert.equal(shellExitCode({ isError: false, content: [{ type: "text", text: "Command exited with code 1" }] }), 1);
});

test("terminal feedback and discounted credit propagate to earlier actions", () => {
  const original = [step("EDIT", 0), step("TEST", 0.8)];
  const result = discountedReturns(original, 0.5, 1);
  assert.deepEqual(result.map(s => s.return), [0.9, 1.8]);
  assert.deepEqual(original.map(s => s.return), [0, 0.8]);
});

test("retrieval uses similar pre-action states and limits repeated actions per trajectory", () => {
  const state = step("TEST", 0).state;
  const good = trajectory("good", [step("TEST", 0.8), step("TEST", 0.8), step("EDIT", -0.2)]);
  const unrelated = trajectory("other", [{ ...step("TEST", 0.8), state: encodeState("configure database migrations", ["EDIT"], true, "success") }]);
  const aborted = { ...trajectory("aborted", [step("TEST", 1)]), status: "aborted" as const };
  const matches = retrieve(state, [good, unrelated, aborted], DEFAULT_CONFIG);
  assert.equal(matches.length, 2);
  assert.ok(matches.every(m => m.trajectoryId === "good"));
});

test("advantage and KL-style correction match a hand calculation", () => {
  const config = { ...DEFAULT_CONFIG, beta: 1 };
  const matches: Match[] = ["a", "b"].flatMap(id => [
    { trajectoryId: id, index: 0, similarity: 1, step: step("TEST", 1) },
    { trajectoryId: id, index: 1, similarity: 1, step: step("EDIT", -1) },
  ]);
  const policy = estimatePolicy(matches, config, ["TEST", "EDIT"]);
  assert.equal(policy.baseline, 0);
  assert.equal(policy.rows[0]!.advantage, 1);
  assert.ok(Math.abs(policy.rows[0]!.probability - Math.exp(1) / (Math.exp(1) + Math.exp(-1))) < 1e-12);
  assert.ok(formatGuidance(policy).includes("A=1.000"));
  const single = estimatePolicy(matches.slice(0, 2), config);
  assert.ok(single.rows.every(row => row.advantage === 0));
  assert.equal(formatGuidance(single), "");
  const cold = estimatePolicy([], config);
  assert.ok(cold.rows.every(row => row.probability === 1 / ACTIONS.length));
  const zeroPrior = estimatePolicy(matches, config, ["TEST", "EDIT"], { TEST: 1, EDIT: 0 });
  assert.equal(zeroPrior.rows[1]!.probability, 0);
});

test("SQLite survives reopening, isolates projects and supports correction of feedback", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-jitrl-core-"));
  try {
    const path = join(dir, "memory.sqlite");
    const store = new SqliteTrajectoryStore(path);
    const engine = new LearningEngine(store, "a", { ...DEFAULT_CONFIG, gamma: 0.5 });
    engine.start("fix api", "one");
    engine.record("edit", engine.state(), "EDIT", toolReward("EDIT", false, undefined));
    engine.record("test", engine.state(), "TEST", toolReward("TEST", false, 0));
    engine.record("test", engine.state(), "TEST", toolReward("TEST", false, 0));
    assert.equal(store.candidates("a", 10).length, 0, "active data must not leak into retrieval");
    const id = engine.finish()!;
    assert.equal(store.get(id, "a")!.feedback, 0, "agent end is not evidence of task success");
    engine.feedback(id, 1);
    engine.feedback(id, 1);
    assert.deepEqual(store.get(id, "a")!.steps.map(s => s.return), [0.9, 1.8]);
    engine.feedback(id, -1);
    assert.deepEqual(store.get(id, "a")!.steps.map(s => s.return), [-0.09999999999999998, -0.19999999999999996]);
    assert.equal(store.get(id, "b"), undefined);
    store.close();
    const reopened = new SqliteTrajectoryStore(path);
    assert.equal(reopened.candidates("a", 10).length, 1);
    assert.equal(reopened.candidates("b", 10).length, 0);
    assert.equal(reopened.stats("a").steps, 2);
    reopened.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("config rejects unknown keys, infinities, invalid modes and unsafe bounds", () => {
  for (const value of [{ beta: 0 }, { gamma: 2 }, { topK: 1.5 }, { topK: Infinity }, { mode: "oops" }, { unknown: 1 }, []]) assert.throws(() => validateConfig(value));
  assert.deepEqual(validateConfig({}), DEFAULT_CONFIG);
});
