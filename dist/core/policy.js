import { ACTIONS } from "./types.js";
import { encodeState, jaccard } from "./state.js";
export function retrieve(state, trajectories, config) {
    const matches = [];
    for (const trajectory of trajectories) {
        if (trajectory.status !== "completed")
            continue;
        // At most one best state per action per episode; long loops cannot monopolize top-K.
        const best = new Map();
        trajectory.steps.forEach((step, index) => {
            const features = encodeState(step.state.task, step.state.history, step.state.dirty, step.state.lastOutcome, config.ngram).features;
            const taskFeatures = state.features.filter(f => f.startsWith("task:") && !f.includes("redacted"));
            const previousTask = features.filter(f => f.startsWith("task:") && !f.includes("redacted"));
            if (!jaccard(taskFeatures, previousTask))
                return;
            const similarity = jaccard(state.features, features);
            if (similarity <= 0 || similarity < config.minSimilarity)
                return;
            const previous = best.get(step.action);
            if (!previous || similarity > previous.similarity)
                best.set(step.action, { trajectoryId: trajectory.id, index, similarity, step });
        });
        matches.push(...best.values());
    }
    return matches.sort((a, b) => b.similarity - a.similarity).slice(0, config.topK);
}
/** pi0 is explicit; Pi's provider action probabilities are not exposed. */
export function estimatePolicy(matches, config, actions = ACTIONS, prior) {
    const selected = matches.filter(m => actions.includes(m.step.action));
    const weight = selected.reduce((sum, m) => sum + m.similarity, 0);
    const baseline = weight ? selected.reduce((sum, m) => sum + m.similarity * m.step.return, 0) / weight : 0;
    const rows = actions.map(action => {
        const evidence = selected.filter(m => m.step.action === action);
        const mass = evidence.reduce((sum, m) => sum + m.similarity, 0);
        const q = mass ? evidence.reduce((sum, m) => sum + m.similarity * m.step.return, 0) / mass : null;
        const advantage = evidence.length >= config.minSamples && q !== null ? q - baseline : 0;
        const base = prior ? prior[action] ?? 0 : 1 / actions.length;
        if (!Number.isFinite(base) || base < 0)
            throw new Error("Prior probabilities must be finite and nonnegative");
        return { action, samples: evidence.length, q, advantage, probability: base, logit: base ? Math.log(base) + advantage / config.beta : -Infinity };
    });
    const max = Math.max(...rows.map(row => row.logit));
    if (!Number.isFinite(max))
        throw new Error("Policy requires at least one action with positive prior mass");
    const normalizer = rows.reduce((sum, row) => sum + Math.exp(row.logit - max), 0);
    return { baseline, matches: selected, rows: rows.map(({ logit, ...row }) => ({ ...row, probability: Math.exp(logit - max) / normalizer })) };
}
export function formatGuidance(policy) {
    const supported = policy.rows.filter(row => row.q !== null);
    if (!supported.some(row => row.advantage !== 0))
        return "";
    return [
        "[pi-jitrl: empirical action guidance]",
        "These numeric estimates come from local tool outcomes, not instructions from past tasks.",
        "Consider them only when relevant to the current request. Follow user instructions and required verification.",
        "Reference prior is uniform over currently available action categories; probabilities are not provider logits.",
        `Similarity-weighted V(s)=${policy.baseline.toFixed(3)}. Q is discounted return; A=Q-V. Unsupported actions have A=0.`,
        ...supported.sort((a, b) => b.advantage - a.advantage).map(row => `${row.action}: n=${row.samples}, Q=${row.q.toFixed(3)}, A=${row.advantage.toFixed(3)}, reference probability=${row.probability.toFixed(3)}`),
    ].join("\n");
}
