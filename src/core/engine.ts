import { randomUUID } from "node:crypto";
import { DEFAULT_CONFIG } from "./config.js";
import { estimatePolicy, retrieve } from "./policy.js";
import { discountedReturns } from "./reward.js";
import { encodeState } from "./state.js";
import { ACTIONS, type Action, type Config, type Policy, type Reward, type State, type Trajectory, type TrajectoryStore } from "./types.js";

export class LearningEngine {
  trajectory?: Trajectory;
  task = "";
  dirty = false;
  outcome: State["lastOutcome"] = "none";
  history: Action[] = [];
  constructor(readonly store: TrajectoryStore, readonly project: string, public config: Config = { ...DEFAULT_CONFIG }) {}

  start(task: string, session: string): void {
    this.finish("aborted");
    this.task = task;
    this.history = [];
    this.dirty = false;
    this.outcome = "none";
    this.trajectory = { id: randomUUID(), project: this.project, session, createdAt: Date.now(), status: "active", gamma: this.config.gamma, feedback: 0, steps: [] };
  }

  state(): State { return encodeState(this.task, this.history, this.dirty, this.outcome, this.config.ngram); }

  record(callId: string, state: State, action: Action, reward: Reward): void {
    if (!this.trajectory || this.trajectory.steps.some(s => s.callId === callId)) return;
    this.trajectory.steps.push({ callId, state, action, reward, return: 0 });
    this.history.push(action);
    this.history = this.history.slice(-6);
    this.outcome = reward.tool < 0 ? "failure" : "success";
    if (["EDIT", "WRITE"].includes(action) && reward.tool === 0) this.dirty = true;
    // Different verifiers cover different properties; success does not prove all edits verified.
    this.persist();
  }

  policy(actions: readonly Action[] = ACTIONS): Policy {
    const candidates = this.store.candidates(this.project, this.config.maxCandidates, this.trajectory?.id);
    return estimatePolicy(retrieve(this.state(), candidates, this.config), this.config, actions);
  }

  finish(status: "completed" | "aborted" = "completed"): string | undefined {
    const trajectory = this.trajectory;
    if (!trajectory) return;
    trajectory.status = status;
    if (trajectory.steps.length) {
      this.persist();
      this.store.prune(this.project, this.config.maxTrajectories);
    }
    this.trajectory = undefined;
    return trajectory.steps.length ? trajectory.id : undefined;
  }

  feedback(id: string, value: number): void {
    if (!Number.isFinite(value) || value < -1 || value > 1) throw new Error("Feedback must be a number in [-1, 1]");
    const trajectory = this.store.get(id, this.project);
    if (!trajectory || trajectory.status !== "completed") throw new Error("No completed trajectory on this branch");
    trajectory.feedback = value; // Replaces previous feedback; repeated ratings cannot inflate reward.
    trajectory.steps = discountedReturns(trajectory.steps, trajectory.gamma, value);
    this.store.save(trajectory);
  }

  private persist(): void {
    if (!this.trajectory) return;
    this.trajectory.steps = discountedReturns(this.trajectory.steps, this.trajectory.gamma, this.trajectory.feedback);
    this.store.save(this.trajectory);
  }
}
