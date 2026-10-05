/** Current Pi exposes structured exit_code; older Pi emits nonzero status text. */
export declare function shellExitCode(event: {
    isError: boolean;
    structuredContent?: unknown;
    details?: unknown;
    content: {
        type: string;
        text?: string;
    }[];
}): number | undefined;
