import { ConflictError } from "./errors.js";

/**
 * Single read-only guard for every mutating code path.
 *
 * Kept in core rather than per module on purpose: while this lived as four
 * private copies, three write paths (agent instructions, CI templates and
 * asset uploads) simply never got one, and a read-only workspace happily
 * rewrote AGENTS.md. A guard that must be remembered is a guard that gets
 * forgotten.
 */
export function ensureWritable(workspace) {
    if (workspace?.readOnly) {
        throw new ConflictError(
            "WORKSPACE_READ_ONLY",
            "The workspace is read-only."
        );
    }
}
