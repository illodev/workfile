import { availableParallelism } from "node:os";

/**
 * Default width of the I/O pool.
 *
 * Wide enough that the disk stays busy — the cost of loading a workspace is
 * dominated by I/O, not by CPU — and narrow enough that a large repository
 * cannot exhaust the process's file descriptors.
 */
export function defaultConcurrency() {
    const fromEnv = Number(process.env.PROJECT_IO_CONCURRENCY);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
    return Math.min(64, Math.max(16, availableParallelism() * 8));
}

/**
 * `Promise.all(items.map(fn))` with a ceiling.
 *
 * The unbounded form opened one descriptor per record — five thousand at once
 * on a large workspace. Where the hard descriptor limit is low (containers
 * started with `--ulimit nofile`, systemd units with an explicit `LimitNOFILE`)
 * that raises EMFILE, and every caller's `catch` recorded the failure as an
 * unreadable *file*: the index came back short, and nothing in the read path
 * ever looks at the unreadable list.
 *
 * Results keep the order of the input.
 */
export async function mapWithConcurrency(
    items,
    fn,
    { concurrency = defaultConcurrency() }: any = {}
) {
    const list = Array.from(items);
    if (list.length <= 1) {
        return Promise.all(list.map((item, index) => fn(item, index)));
    }
    const results = new Array(list.length);
    const width = Math.max(1, Math.min(concurrency, list.length));
    let cursor = 0;
    const workers = Array.from({ length: width }, async () => {
        while (cursor < list.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await fn(list[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

const RESOURCE_ERRORS = new Set(["EMFILE", "ENFILE", "ENOMEM"]);

/**
 * Whether a failure is about the process running out of room rather than about
 * the file itself.
 *
 * The distinction matters because the two deserve opposite treatment: a
 * malformed record should be reported and skipped, while a descriptor shortage
 * means the whole read is untrustworthy and must not be silently degraded into
 * "this file is unreadable".
 */
export function isResourceExhaustion(error) {
    return Boolean(error?.code && RESOURCE_ERRORS.has(error.code));
}
