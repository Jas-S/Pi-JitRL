import type { Action, Reward, Step } from "./types.js";
export declare function toolReward(action: Action, isError: boolean, exitCode: number | undefined, repeatedError?: boolean): Reward;
export declare function discountedReturns(steps: Step[], gamma: number, feedback?: number): Step[];
