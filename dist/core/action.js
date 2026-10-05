export function classifyAction(tool, input) {
    if (["read", "ls"].includes(tool))
        return "READ";
    if (["grep", "find", "search"].includes(tool))
        return "SEARCH";
    if (tool === "edit")
        return "EDIT";
    if (tool === "write")
        return "WRITE";
    if (["delegate", "subagent", "task"].includes(tool))
        return "DELEGATE";
    if (tool !== "bash")
        return "BASH";
    let command = typeof input.command === "string" ? input.command.trim() : "";
    // Do not reward `echo npm test`, masked failures, pipelines or mixed operations.
    if (/[;&|`<>\n]|\$\(/.test(command))
        return "BASH";
    command = command.replace(/^(?:[A-Za-z_]\w*=(?:[^\s]+)\s+)+/, "");
    if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|test:[\w-]+)(?:\s|$)/.test(command) ||
        /^(?:npx\s+)?(?:vitest|jest|mocha|pytest)(?:\s|$)/.test(command) ||
        /^(?:python(?:3)?\s+-m\s+(?:pytest|unittest)|node\s+--test|cargo\s+test|go\s+test)(?:\s|$)/.test(command))
        return "TEST";
    if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:typecheck|check:types)(?:\s|$)/.test(command) ||
        /^(?:npx\s+)?tsc\b.*--noEmit\b/.test(command))
        return "TYPECHECK";
    if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:lint|lint:[\w-]+)(?:\s|$)/.test(command) ||
        /^(?:npx\s+)?(?:eslint|ruff\s+check)(?:\s|$)/.test(command))
        return "LINT";
    if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|build:[\w-]+)(?:\s|$)/.test(command) ||
        /^(?:cargo\s+build|go\s+build|make)(?:\s|$)/.test(command))
        return "BUILD";
    if (/^git(?:\s|$)/.test(command))
        return "GIT";
    if (/^(?:rg|grep|find)(?:\s|$)/.test(command))
        return "SEARCH";
    if (/^(?:cat|head|tail|ls|sed)(?:\s|$)/.test(command))
        return "READ";
    return "BASH";
}
