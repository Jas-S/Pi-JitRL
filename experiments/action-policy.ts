import { DEFAULT_CONFIG, encodeState, estimatePolicy, formatGuidance, retrieve, type Action, type Trajectory } from "../src/core/index.js";

// Deliberately synthetic: this checks policy mechanics, not agent performance.
const state = encodeState("fix typescript api bug", ["READ", "EDIT"], true, "success");
const memory: Trajectory[] = [];
for (const [action, reward] of [["TEST", 0.8], ["EDIT", -0.5]] as [Action, number][]) {
  for (let i = 0; i < 3; i++) {
    memory.push({
      id: `${action}-${i}`, project: "demo", session: `${i}`, createdAt: i,
      status: "completed", gamma: DEFAULT_CONFIG.gamma, feedback: 0,
      steps: [{ callId: `${i}`, state, action, reward: { tool: 0, verification: reward, repetition: 0, total: reward }, return: reward }],
    });
  }
}
const policy = estimatePolicy(retrieve(state, memory, DEFAULT_CONFIG), DEFAULT_CONFIG, ["READ", "EDIT", "TEST"]);
console.log("Synthetic action-policy experiment (no model calls, no performance claim)");
console.table(policy.rows);
console.log(formatGuidance(policy));
