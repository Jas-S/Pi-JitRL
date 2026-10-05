import { type Action, type Config, type Policy, type Reward, type State, type Trajectory, type TrajectoryStore } from "./types.js";
export declare class LearningEngine {
    readonly store: TrajectoryStore;
    readonly project: string;
    config: Config;
    trajectory?: Trajectory;
    task: string;
    dirty: boolean;
    outcome: State["lastOutcome"];
    history: Action[];
    constructor(store: TrajectoryStore, project: string, config?: Config);
    start(task: string, session: string): void;
    state(): State;
    record(callId: string, state: State, action: Action, reward: Reward): void;
    policy(actions?: readonly Action[]): Policy;
    finish(status?: "completed" | "aborted"): string | undefined;
    feedback(id: string, value: number): void;
    private persist;
}
