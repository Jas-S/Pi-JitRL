import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Trajectory, TrajectoryStore } from "../core/types.js";

export class SqliteTrajectoryStore implements TrajectoryStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const existed = path === ":memory:" || existsSync(path);
    this.db = new DatabaseSync(path);
    if (!existed) chmodSync(path, 0o600);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    const version = (this.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (version > 1) { this.db.close(); throw new Error(`Unsupported JitRL database schema: ${version}`); }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trajectories (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, session TEXT NOT NULL,
        created_at INTEGER NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS trajectory_project ON trajectories(project, status, created_at DESC);
      PRAGMA user_version=1;
    `);
  }
  save(trajectory: Trajectory): void {
    this.db.prepare(`INSERT INTO trajectories VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, payload=excluded.payload`).run(
      trajectory.id, trajectory.project, trajectory.session, trajectory.createdAt, trajectory.status, JSON.stringify(trajectory),
    );
  }
  get(id: string, project: string): Trajectory | undefined {
    const row = this.db.prepare("SELECT payload FROM trajectories WHERE id=? AND project=?").get(id, project);
    return row ? JSON.parse(String(row.payload)) as Trajectory : undefined;
  }
  candidates(project: string, limit: number, excludeId = ""): Trajectory[] {
    return this.db.prepare("SELECT payload FROM trajectories WHERE project=? AND status='completed' AND id<>? ORDER BY created_at DESC, id LIMIT ?")
      .all(project, excludeId, limit).map(row => JSON.parse(String(row.payload)) as Trajectory);
  }
  recent(project: string, limit: number): Trajectory[] {
    return this.db.prepare("SELECT payload FROM trajectories WHERE project=? ORDER BY created_at DESC, id LIMIT ?")
      .all(project, limit).map(row => JSON.parse(String(row.payload)) as Trajectory);
  }
  stats(project: string): { trajectories: number; steps: number; active: number; feedback: number } {
    const row = this.db.prepare(`SELECT COUNT(*) AS trajectories,
      COALESCE(SUM(json_array_length(payload, '$.steps')), 0) AS steps,
      COALESCE(SUM(status='active'), 0) AS active,
      COALESCE(SUM(json_extract(payload, '$.feedback')<>0), 0) AS feedback
      FROM trajectories WHERE project=?`).get(project)!;
    return { trajectories: Number(row.trajectories), steps: Number(row.steps), active: Number(row.active), feedback: Number(row.feedback) };
  }
  prune(project: string, limit: number): void {
    this.db.prepare(`DELETE FROM trajectories WHERE project=? AND id IN (
      SELECT id FROM trajectories WHERE project=? AND status<>'active' ORDER BY created_at DESC, id LIMIT -1 OFFSET ?
    )`).run(project, project, limit);
  }
  close(): void { this.db.close(); }
}
