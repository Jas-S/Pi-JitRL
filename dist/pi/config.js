import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateConfig } from "../core/index.js";
export function configPath(cwd) { return join(cwd, ".pi", "jitrl", "config.json"); }
export function readConfig(cwd) {
    const path = configPath(cwd);
    return validateConfig(existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {});
}
export function writeConfig(cwd, config) {
    const path = configPath(cwd);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(validateConfig(config), null, 2) + "\n", { mode: 0o600 });
    renameSync(temp, path);
}
