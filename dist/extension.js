import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { ACTIONS, classifyAction, formatGuidance, LearningEngine, normalize, toolReward, validateConfig } from "./core/index.js";
import { SqliteTrajectoryStore } from "./storage/sqlite.js";
import { readConfig, writeConfig } from "./pi/config.js";
import { shellExitCode } from "./pi/results.js";
const ENTRY = "pi-jitrl-trajectory";
const GUIDANCE = "pi-jitrl-guidance";
const hash = (text) => createHash("sha256").update(text).digest("hex");
export default function jitrl(pi) {
    let engine;
    let databasePath = "";
    let lastId;
    let lastPolicy;
    let pending = new Map();
    const errors = new Set();
    let disabled = false;
    function notify(ctx, text, error = false) {
        if (ctx.hasUI)
            ctx.ui.notify(text, error ? "warning" : "info");
        else
            pi.sendMessage({ customType: "pi-jitrl-status", content: text, display: true }, { triggerTurn: false });
    }
    function failed(ctx, error) {
        disabled = true;
        ctx.ui.setStatus("jitrl", "JitRL unavailable");
        notify(ctx, `JitRL paused after an error: ${error instanceof Error ? error.message : String(error)}`, true);
    }
    // Observation must not break a tool invocation or the user's task.
    function safely(ctx, work) {
        if (disabled)
            return;
        try {
            work();
        }
        catch (error) {
            failed(ctx, error);
        }
    }
    function restoreBranch(ctx) {
        lastId = undefined;
        let task = "";
        for (const entry of ctx.sessionManager.getBranch()) {
            if (entry.type === "custom" && entry.customType === ENTRY && entry.data && typeof entry.data === "object") {
                const id = entry.data.id;
                if (typeof id === "string")
                    lastId = id;
            }
            if (entry.type === "message" && entry.message.role === "user") {
                task = typeof entry.message.content === "string" ? entry.message.content : entry.message.content.filter(c => c.type === "text").map(c => c.text).join("\n");
            }
        }
        if (engine)
            engine.task = task;
        lastPolicy = undefined;
        pending.clear();
        errors.clear();
    }
    function initialize(ctx) {
        disabled = false;
        try {
            engine?.finish("aborted");
            engine?.store.close();
            engine = undefined;
            databasePath = process.env.PI_JITRL_DB ? resolve(process.env.PI_JITRL_DB) : join(homedir(), ".pi", "agent", "jitrl", "memory.sqlite");
            const config = readConfig(ctx.cwd);
            const store = new SqliteTrajectoryStore(databasePath);
            engine = new LearningEngine(store, hash(realpathSync(ctx.cwd)), config);
            restoreBranch(ctx);
            ctx.ui.setStatus("jitrl", `JitRL ${config.mode}`);
        }
        catch (error) {
            failed(ctx, error);
        }
    }
    function availableActions() {
        const actions = new Set();
        for (const tool of pi.getActiveTools()) {
            if (tool === "bash")
                for (const action of ["BASH", "READ", "SEARCH", "TEST", "BUILD", "TYPECHECK", "LINT", "GIT"])
                    actions.add(action);
            else
                actions.add(classifyAction(tool, {}));
        }
        return ACTIONS.filter(action => actions.has(action));
    }
    pi.on("session_start", (_event, ctx) => { initialize(ctx); });
    pi.on("session_tree", (_event, ctx) => { safely(ctx, () => { engine?.finish("aborted"); restoreBranch(ctx); }); });
    pi.on("before_agent_start", (event, ctx) => {
        safely(ctx, () => {
            if (!engine || engine.config.mode === "off")
                return;
            engine.start(event.prompt, ctx.sessionManager.getSessionId());
            lastPolicy = undefined;
            pending.clear();
            errors.clear();
        });
    });
    pi.on("input", (event, ctx) => {
        safely(ctx, () => {
            // Streaming steering changes the state, but queued follow-ups belong to the next episode.
            if (engine?.trajectory && event.streamingBehavior === "steer")
                engine.task = event.text;
        });
        return { action: "continue" };
    });
    pi.on("context", (event, ctx) => {
        const messages = event.messages.filter(m => !(m.role === "custom" && m.customType === GUIDANCE));
        let guidance = "";
        safely(ctx, () => {
            const actions = availableActions();
            if (!engine || engine.config.mode === "off" || !actions.length || !engine.task.trim())
                return;
            lastPolicy = engine.policy(actions);
            if (engine.config.mode === "guide")
                guidance = formatGuidance(lastPolicy);
        });
        return { messages: guidance ? [...messages, { role: "custom", customType: GUIDANCE, content: guidance, display: false, timestamp: Date.now() }] : messages };
    });
    pi.on("tool_call", (event, ctx) => {
        safely(ctx, () => {
            if (!engine?.trajectory || engine.config.mode === "off" || event.parentToolCallId)
                return;
            pending.set(event.toolCallId, { state: engine.state(), action: classifyAction(event.toolName, event.input) });
        });
    });
    pi.on("tool_result", (event, ctx) => {
        safely(ctx, () => {
            const entry = pending.get(event.toolCallId);
            pending.delete(event.toolCallId);
            if (!engine || !entry)
                return;
            // Reclassify after other extensions have had a chance to mutate tool input.
            const action = classifyAction(event.toolName, event.input);
            const exitCode = event.toolName === "bash" ? shellExitCode(event) : undefined;
            const isError = event.isError || (exitCode !== undefined && exitCode !== 0);
            const text = event.content.filter(c => c.type === "text").map(c => c.text).join("\n").slice(0, 4000);
            const signature = hash(`${action}:${normalize(text)}`);
            engine.record(event.toolCallId, entry.state, action, toolReward(action, isError, exitCode, isError && errors.has(signature)));
            if (isError)
                errors.add(signature);
        });
    });
    pi.on("turn_end", (_event, ctx) => { safely(ctx, () => { pending.clear(); }); });
    pi.on("agent_end", (event, ctx) => {
        safely(ctx, () => {
            const lastAssistant = event.messages.filter(m => m.role === "assistant").at(-1);
            const interrupted = lastAssistant?.role === "assistant" && ["aborted", "error"].includes(lastAssistant.stopReason);
            const id = engine?.finish(interrupted ? "aborted" : "completed");
            if (id && !interrupted) {
                lastId = id;
                pi.appendEntry(ENTRY, { id });
            }
            pending.clear();
        });
    });
    pi.on("session_shutdown", (_event, ctx) => {
        try {
            engine?.finish("aborted");
        }
        catch (error) {
            if (!disabled)
                failed(ctx, error);
        }
        finally {
            engine?.store.close();
            engine = undefined;
            pending.clear();
        }
    });
    pi.registerCommand("jitrl", {
        description: "Action learning: status, stats, memory, explain, config, feedback",
        handler: async (args, ctx) => {
            const [command = "status", key, value, ...extra] = args.trim().split(/\s+/).filter(Boolean);
            if (command === "status" && (!engine || disabled)) {
                notify(ctx, "JitRL unavailable. Check the earlier error and /reload after fixing it.");
                return;
            }
            if (!engine || disabled) {
                notify(ctx, "JitRL unavailable; /reload after fixing the error.", true);
                return;
            }
            try {
                switch (command) {
                    case "status":
                        notify(ctx, `JitRL v0.1.0 (${engine.config.mode})\nDatabase: ${databasePath}\nCurrent episode: ${engine.trajectory?.steps.length ?? 0} steps\nFeedback target on this branch: ${lastId ?? "none"}`);
                        break;
                    case "stats":
                        notify(ctx, JSON.stringify(engine.store.stats(engine.project), null, 2));
                        break;
                    case "memory": {
                        const limit = key === undefined ? 5 : Number(key);
                        if (!Number.isInteger(limit) || limit < 1 || limit > 50)
                            throw new Error("Use /jitrl memory [1..50]");
                        const rows = engine.store.recent(engine.project, limit);
                        notify(ctx, rows.length ? rows.map(t => `${t.id} | ${t.status} | ${t.steps.length} steps | feedback=${t.feedback}\n  ${t.steps.map(s => s.action).join(" → ")}`).join("\n") : "No trajectories for this project yet.");
                        break;
                    }
                    case "explain": {
                        const actions = availableActions();
                        if (!actions.length) {
                            notify(ctx, "No active tool actions.");
                            break;
                        }
                        lastPolicy = engine.policy(actions);
                        notify(ctx, JSON.stringify({ prior: "uniform reference, not provider probabilities", baseline: lastPolicy.baseline, rows: lastPolicy.rows, evidence: lastPolicy.matches.map(m => ({ trajectory: m.trajectoryId, step: m.index, similarity: m.similarity, return: m.step.return })) }, null, 2));
                        break;
                    }
                    case "feedback": {
                        if (engine.trajectory)
                            throw new Error("Wait until the current agent run finishes before rating it");
                        if (!lastId)
                            throw new Error("No completed trajectory on this branch");
                        const ratings = { success: 1, failure: -1, correction: -0.8, revert: -1 };
                        if (!key || value || extra.length)
                            throw new Error("Use /jitrl feedback success|failure|correction|revert|[-1..1]");
                        const rating = ratings[key] ?? Number(key);
                        engine.feedback(lastId, rating);
                        notify(ctx, `Feedback ${rating} saved for ${lastId}. Returns recomputed.`);
                        break;
                    }
                    case "config": {
                        if (!key) {
                            notify(ctx, JSON.stringify(engine.config, null, 2));
                            break;
                        }
                        if (!value || extra.length)
                            throw new Error("Use /jitrl config <key> <value>");
                        if (engine.trajectory)
                            throw new Error("Change config after the current agent run finishes");
                        const config = validateConfig({ ...engine.config, [key]: key === "mode" ? value : Number(value) });
                        writeConfig(ctx.cwd, config);
                        engine.config = config;
                        lastPolicy = undefined;
                        ctx.ui.setStatus("jitrl", `JitRL ${config.mode}`);
                        notify(ctx, `Saved ${key}=${value}`);
                        break;
                    }
                    default: notify(ctx, "Use /jitrl status|stats|memory [limit]|explain|config [key value]|feedback <rating>");
                }
            }
            catch (error) {
                notify(ctx, error instanceof Error ? error.message : String(error), true);
            }
        },
    });
}
