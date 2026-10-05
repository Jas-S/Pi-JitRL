export const DEFAULT_CONFIG = {
    mode: "guide", gamma: 0.9, beta: 0.5, topK: 20, minSimilarity: 0.15,
    minSamples: 2, maxCandidates: 500, maxTrajectories: 2000, ngram: 2,
};
export function validateConfig(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Config must be an object");
    const raw = value;
    for (const key of Object.keys(raw))
        if (!(key in DEFAULT_CONFIG))
            throw new Error(`Unknown config key: ${key}`);
    const config = { ...DEFAULT_CONFIG, ...raw };
    if (!["guide", "observe", "off"].includes(config.mode))
        throw new Error("mode must be guide, observe or off");
    const ranges = {
        gamma: [0, 1, false], beta: [0.01, 100, false], topK: [1, 1000, true],
        minSimilarity: [0, 1, false], minSamples: [1, 1000, true],
        maxCandidates: [1, 10000, true], maxTrajectories: [1, 100000, true], ngram: [1, 4, true],
    };
    for (const [key, [min, max, integer]] of Object.entries(ranges)) {
        const v = config[key];
        if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
            throw new Error(`${key} must be ${integer ? "an integer" : "a number"} in [${min}, ${max}]`);
        }
    }
    return config;
}
