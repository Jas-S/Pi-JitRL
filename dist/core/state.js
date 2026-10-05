/** Minimize stored text; this is best-effort redaction, not a secret detector. */
export function normalize(text) {
    return text
        .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, " redacted ")
        .replace(/\bBearer\s+[\w.+/-]+/gi, " redacted ")
        .replace(/\b(?:sk-[\w-]{12,}|gh[pousr]_[\w]{12,}|github_pat_[\w_]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, " redacted ")
        .replace(/\b(?:api[_-]?key|token|password|secret|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, " redacted ")
        .replace(/https?:\/\/\S+/gi, " url ")
        .toLowerCase().replace(/\b\d+\b/g, " number ")
        .replace(/[^\p{L}\p{N}_./-]+/gu, " ").trim().slice(0, 1200);
}
export function ngrams(text, n = 2) {
    // Han characters need boundaries even when a task contains no spaces.
    const tokens = text.match(/\p{Script=Han}|[\p{L}\p{N}_./-]+/gu) ?? [];
    const grams = new Set();
    for (let size = 1; size <= n; size++) {
        for (let i = 0; i + size <= tokens.length; i++)
            grams.add(tokens.slice(i, i + size).join(" "));
    }
    return [...grams];
}
export function encodeState(task, history, dirty, lastOutcome, ngram = 2) {
    const normalized = normalize(task);
    const recent = history.slice(-6);
    return {
        task: normalized, history: recent, dirty, lastOutcome,
        features: [
            ...ngrams(normalized, ngram).map(g => `task:${g}`),
            `dirty:${dirty}`, `outcome:${lastOutcome}`,
            ...recent.map((a, i) => `history:${recent.length - i}:${a}`),
        ],
    };
}
export function jaccard(a, b) {
    const left = new Set(a), right = new Set(b);
    if (!left.size || !right.size)
        return 0;
    let intersection = 0;
    for (const feature of left)
        if (right.has(feature))
            intersection++;
    return intersection / (left.size + right.size - intersection);
}
