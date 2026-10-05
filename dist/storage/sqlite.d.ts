import type { Trajectory, TrajectoryStore } from "../core/types.js";
export declare class SqliteTrajectoryStore implements TrajectoryStore {
    private db;
    constructor(path: string);
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
