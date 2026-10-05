import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DefaultResourceLoader, SettingsManager, createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import jitrl from "../src/extension.js";
import { SqliteTrajectoryStore } from "../src/storage/sqlite.js";

test("Pi lifecycle learns across reloads, avoids duplicate guidance and targets branch feedback", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-jitrl-adapter-"));
  const previousDb = process.env.PI_JITRL_DB;
  process.env.PI_JITRL_DB = join(dir, "memory.sqlite");
  const handlers = new Map<string, Function>();
  let command: Function;
  let branch: any[] = [];
  const notifications: string[] = [];
  const api = {
    on: (name: string, handler: Function) => handlers.set(name, handler),
    registerCommand: (_name: string, options: { handler: Function }) => { command = options.handler; },
    appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", customType, data }),
    getActiveTools: () => ["read", "edit", "bash"],
    sendMessage: () => {},
  };
  const ctx = { cwd: dir, hasUI: true, ui: { notify: (text: string) => notifications.push(text), setStatus: () => {} }, sessionManager: { getSessionId: () => "one", getBranch: () => branch } };
  const emit = async (name: string, event: any = {}) => handlers.get(name)!(event, ctx);
  jitrl(api as unknown as ExtensionAPI);
  try {
    await emit("session_start");
    for (let episode = 0; episode < 2; episode++) {
      await emit("before_agent_start", { prompt: "fix api bug" });
      for (const [id, toolName, input, isError, exitCode] of [
        ["a", "edit", {}, false, undefined], ["b", "bash", { command: "npm test" }, false, 0],
        ["c", "edit", {}, true, undefined],
      ] as const) {
        const event = { toolCallId: id, toolName, input, isError, structuredContent: { exit_code: exitCode }, content: [{ type: "text", text: "result" }] };
        await emit("tool_call", event);
        await emit("tool_result", event);
      }
      await emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop" }] });
    }
    await emit("session_shutdown");
    await emit("session_start");
    await emit("before_agent_start", { prompt: "fix api bug" });
    const first = await emit("context", { messages: [] });
    assert.equal(first.messages.length, 1);
    assert.ok(first.messages[0].content.includes("reference probability"));
    const second = await emit("context", { messages: first.messages });
    assert.equal(second.messages.length, 1);
    await emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop" }] });
    await command!("feedback success", ctx);
    assert.ok(notifications.at(-1)!.includes("saved"));
    branch = [];
    await emit("session_tree");
    await command!("feedback success", ctx);
    assert.equal(notifications.at(-1), "No completed trajectory on this branch");
    await command!("config mode observe", ctx);
    await emit("before_agent_start", { prompt: "fix api bug" });
    assert.equal((await emit("context", { messages: first.messages })).messages.length, 0);
    await emit("agent_end", { messages: [] });
    await command!("config mode off", ctx);
    await emit("before_agent_start", { prompt: "off" });
    await emit("tool_call", { toolCallId: "off", toolName: "read", input: {} });
    await emit("tool_result", { toolCallId: "off", toolName: "read", input: {}, isError: false, content: [] });
    await emit("session_shutdown");
    const store = new SqliteTrajectoryStore(join(dir, "memory.sqlite"));
    const rows = store.recent(storeProject(store), 10);
    assert.equal(rows.length, 2);
    assert.equal(rows.filter(r => r.feedback === 1).length, 1);
    store.close();
  } finally {
    if (previousDb === undefined) delete process.env.PI_JITRL_DB; else process.env.PI_JITRL_DB = previousDb;
    rmSync(dir, { recursive: true, force: true });
  }
  // Project identity is the same canonical-path hash used by the adapter.
  function storeProject(_store: SqliteTrajectoryStore): string {
    return createHash("sha256").update(realpathSync(dir)).digest("hex");
  }
});

import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";

test("compiled package loads through Pi's real extension loader", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-jitrl-loader-"));
  try {
    const loader = new DefaultResourceLoader({
      cwd: dir, agentDir: join(dir, "agent"), settingsManager: SettingsManager.inMemory(),
      additionalExtensionPaths: [resolve("dist/extension.js")],
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    });
    await loader.reload();
    const result = loader.getExtensions();
    assert.deepEqual(result.errors, []);
    assert.equal(result.extensions.length, 1);
    assert.ok(result.extensions[0]!.commands.has("jitrl"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("real Pi bash result reports verification exit status without a model call", async () => {
  const tool = createBashToolDefinition(process.cwd(), { exposeSessionEnvironment: false });
  const success = await tool.execute("success", { command: "true" }, undefined, undefined, {} as any);
  const failure = await tool.execute("failure", { command: "false" }, undefined, undefined, {} as any);
  assert.equal((success.structuredContent as any).exit_code, 0);
  assert.equal((failure.structuredContent as any).exit_code, 1);
});
