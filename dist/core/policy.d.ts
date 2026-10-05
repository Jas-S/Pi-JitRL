import { type Action, type Config, type Match, type Policy, type State, type Trajectory } from "./types.js";
export declare function retrieve(state: State, trajectories: Trajectory[], config: Config): Match[];
/** pi0 is explicit; Pi's provider action probabilities are not exposed. */
export declare function estimatePolicy(matches: Match[], config: Config, actions?: readonly Action[], prior?: Partial<Record<Action, number>>): Policy;
export declare function formatGuidance(policy: Policy): string;
