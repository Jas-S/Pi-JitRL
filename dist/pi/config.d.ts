import { type Config } from "../core/index.js";
export declare function configPath(cwd: string): string;
export declare function readConfig(cwd: string): Config;
export declare function writeConfig(cwd: string, config: Config): void;
