/** Current Pi exposes structured exit_code; older Pi emits nonzero status text. */
export function shellExitCode(event: { isError: boolean; structuredContent?: unknown; details?: unknown; content: { type: string; text?: string }[] }): number | undefined {
  for (const value of [event.structuredContent, event.details]) {
    if (!value || typeof value !== "object") continue;
    const object = value as Record<string, unknown>;
    const code = object.exit_code ?? object.exitCode;
    if (typeof code === "number" && Number.isFinite(code)) return code;
  }
  if (event.isError) return undefined;
  const output = event.content.filter(c => c.type === "text").map(c => c.text ?? "").join("\n");
  // Legacy built-in bash reports nonzero exits in a trailing status line.
  const status = output.match(/(?:^|\n)Command exited with code (\d+)\s*$/);
  if (status) return Number(status[1]);
  if (/(?:^|\n)Command (?:timed out|aborted)\b/.test(output)) return undefined;
  return 0;
}
