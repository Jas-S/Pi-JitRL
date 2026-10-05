import type { Action, State } from "./types.js";
/** Minimize stored text; this is best-effort redaction, not a secret detector. */
export declare function normalize(text: string): string;
export declare function ngrams(text: string, n?: number): string[];
export declare function encodeState(task: string, history: Action[], dirty: boolean, lastOutcome: State["lastOutcome"], ngram?: number): State;
export declare function jaccard(a: string[], b: string[]): number;
