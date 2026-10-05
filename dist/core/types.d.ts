export declare const ACTIONS: readonly ["READ", "SEARCH", "EDIT", "WRITE", "BASH", "TEST", "BUILD", "TYPECHECK", "LINT", "GIT", "DELEGATE"];
export type Action = typeof ACTIONS[number];
export interface Config {
    mode: "guide" | "observe" | "off";
    gamma: number;
    beta: number;
    topK: number;
    minSimilarity: number;
    minSamples: number;
    maxCandidates: number;
    maxTrajectories: number;
    ngram: number;
}
export interface State {
    task: string;
    history: Action[];
    dirty: boolean;
    lastOutcome: "none" | "success" | "failure";
    features: string[];
}
export interface Reward {
    tool: number;
    verification: number;
    repetition: number;
    total: number;
}
export interface Step {
    callId: string;
    state: State;
    action: Action;
    reward: Reward;
    return: number;
}
export interface Trajectory {
    id: string;
    project: string;
    session: string;
    createdAt: number;
    status: "active" | "completed" | "aborted";
    gamma: number;
    feedback: number;
    steps: Step[];
}
export interface Match {
    trajectoryId: string;
    index: number;
    similarity: number;
    step: Step;
}
export interface PolicyRow {
    action: Action;
    samples: number;
    q: number | null;
    advantage: number;
    probability: number;
}
export interface Policy {
    baseline: number;
    matches: Match[];
    rows: PolicyRow[];
}
export interface TrajectoryStore {
    save(trajectory: Trajectory): void;
    get(id: string, project: string): Trajectory | undefined;
    candidates(project: string, limit: number, excludeId?: string): Trajectory[];
    recent(project: string, limit: number): Trajectory[];
    stats(project: string): {
        trajectories: number;
        steps: number;
        active: number;
        feedback: number;
    };
    prune(project: string, limit: number): void;
    close(): void;
}
