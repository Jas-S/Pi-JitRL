import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateConfig, type Config } from "../core/index.js";

export function configPath(cwd: string): string { return join(cwd, ".pi", "jitrl", "config.json"); }
export function readConfig(cwd: string): Config {
  const path = configPath(cwd);
  return validateConfig(existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {});
}
export function writeConfig(cwd: string, config: Config): void {
  const path = configPath(cwd);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(validateConfig(config), null, 2) + "\n", { mode: 0o600 });
  renameSync(temp, path);
}
