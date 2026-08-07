/**
 * The repository, asked three questions and nothing else.
 *
 * A card that records the commit it was verified at needs to know what HEAD is,
 * `doctor` needs to know whether that commit is still reachable, and a CI run
 * that verifies the cards a branch touched needs to know which ones those are.
 * All three are git questions, and this is the first subprocess anything under
 * `src/` spawns — so the shape of it is worth stating rather than inferring.
 *
 * **Git is optional.** Nothing else in this package requires a repository, and
 * a protocol that refused to close a card outside one would be refusing the
 * `mkdtemp` fixture every test in this suite runs in. Git missing from `PATH`, a
 * directory that is not a repository, and a repository with no commits all
 * answer the same way: `null` here, no `commit` in the record, and silence from
 * `doctor`.
 *
 * **Never through a shell.** The commit reaching `isAncestorOfHead` comes out of
 * a card file, and a card is a Markdown file that in a repository taking pull
 * requests can arrive from a fork. `execFile` hands the argument vector to the
 * operating system with nothing parsing it in between, and the value is checked
 * against `COMMIT_SHA` before it is used as an argument at all — which also
 * stops a value beginning with `-` being read as an option.
 *
 * This lives beside the card module rather than in `core/` because the card
 * module is the only thing that asks: hoisting it would publish a general git
 * façade on `@illodev/workfile/core` that nothing else needs.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** An abbreviated or full commit sha, and the only thing passed to git. */
export const COMMIT_SHA = /^[0-9a-f]{7,40}$/;

/** A full commit sha, which is the only thing worth recording on a card. */
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;

/** How long a probe may take before the answer stops being worth waiting for. */
const TIMEOUT_MS = 5_000;

/**
 * The environment a probe runs in, with the repository-selecting variables
 * removed.
 *
 * `workfile` runs from Claude Code hooks and can run from git hooks, and a git
 * hook's environment carries `GIT_DIR` and `GIT_INDEX_FILE` pointing at the
 * repository that invoked it. Inheriting those would answer for a repository
 * other than the workspace the caller named — quietly, and with a plausible sha.
 *
 * The three that are set are about not blocking: no lock files taken for a
 * read, no credential prompt on a terminal nobody is watching, and no system
 * configuration deciding what `HEAD` means.
 */
function gitEnvironment(): NodeJS.ProcessEnv {
    const inherited = { ...process.env };
    delete inherited.GIT_DIR;
    delete inherited.GIT_WORK_TREE;
    delete inherited.GIT_INDEX_FILE;
    delete inherited.GIT_COMMON_DIR;
    return {
        ...inherited,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_NOSYSTEM: "1"
    };
}

interface GitResult {
    ok: boolean;
    stdout: string;
    /** The process exit code, or `null` when git never ran. */
    code: number | null;
}

/**
 * One git invocation, whose failure is an answer rather than an exception.
 *
 * Every caller here treats "git said no" and "git was not there" as information,
 * so raising would only mean catching it one line later in three places.
 */
async function git(root: string, args: string[]): Promise<GitResult> {
    try {
        const { stdout } = await execFileAsync("git", args, {
            cwd: root,
            timeout: TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 1 << 20,
            env: gitEnvironment()
        });
        return { ok: true, stdout: String(stdout).trim(), code: 0 };
    } catch (error: any) {
        // `code` is the exit status when git ran and a string like `ENOENT`
        // when it did not, so only a number is one.
        return {
            ok: false,
            stdout: "",
            code: typeof error?.code === "number" ? error.code : null
        };
    }
}

/**
 * The commit a card closed at, or `null` when there is nothing to record.
 *
 * Deliberately not memoised. A long-lived MCP or HTTP server closes cards
 * minutes apart, and HEAD moves between them; a cached answer would write a
 * commit the card was not verified at, which is a lie of exactly the kind this
 * field exists to prevent. What keeps the cost bounded instead is *where* it is
 * called from — see `commitForClose` in `mutations.ts`.
 */
export async function headCommit(root: string): Promise<string | null> {
    if (!root) return null;
    const result = await git(root, ["rev-parse", "--verify", "HEAD"]);
    return result.ok && FULL_COMMIT_SHA.test(result.stdout) ? result.stdout : null;
}

/**
 * Whether this clone is missing history, in which case ancestry cannot be
 * answered.
 *
 * A CI checkout with `fetch-depth: 1` holds one commit, so every commit a card
 * was ever verified at reads as unreachable. Reporting that would turn the rule
 * into a false alarm on the one machine it most needs to be quiet on.
 */
export async function isShallowRepository(root: string): Promise<boolean> {
    const result = await git(root, ["rev-parse", "--is-shallow-repository"]);
    return result.ok && result.stdout === "true";
}

/**
 * Whether `commit` is reachable from HEAD.
 *
 * `"unknown"` is a first-class answer and covers everything that is not a
 * verdict: git absent, not a repository, an object this clone does not have.
 * `merge-base --is-ancestor` exits 0 for yes and 1 for no, and anything else —
 * including a missing object — is a refusal to answer rather than a "no".
 */
export async function isAncestorOfHead(
    root: string,
    commit: string
): Promise<"yes" | "no" | "unknown"> {
    if (!root || !COMMIT_SHA.test(String(commit))) return "unknown";
    const result = await git(root, [
        "merge-base",
        "--is-ancestor",
        String(commit),
        "HEAD"
    ]);
    if (result.ok) return "yes";
    return result.code === 1 ? "no" : "unknown";
}

/** A ref as this module will pass one to git, which is deliberately narrow. */
const SAFE_REF = /^[0-9A-Za-z._\/-]{1,255}$/;

/**
 * The paths this branch touched, against a base ref.
 *
 * `base...HEAD` with three dots, which diffs from the merge base rather than
 * from the tip of the base branch — the same thing a pull request shows. Two
 * dots would report every file the base moved on since, so a branch that merely
 * fell behind would look like it had touched cards it never opened, and CI would
 * run their commands and write to them.
 *
 * `null` is "cannot answer", and every caller has to treat it as such rather
 * than as "nothing changed". The distinction is the whole safety of the thing
 * this feeds: a shallow CI checkout has no merge base, and reading that as an
 * empty list would report a run that verified nothing as a run that found
 * nothing to verify. Those are opposite claims about the same silence.
 *
 * The ref is checked against `SAFE_REF` before it becomes an argument. Nothing
 * here goes through a shell, so this is not about metacharacters: it is about a
 * value out of the environment beginning with `-` and being read as an option.
 */
export async function changedPaths(
    root: string,
    base: string
): Promise<string[] | null> {
    if (!root || !SAFE_REF.test(String(base))) return null;
    // Resolved first, so a base ref this clone does not have is reported as
    // "cannot answer" rather than as a diff against something else.
    const resolved = await git(root, ["rev-parse", "--verify", `${base}^{commit}`]);
    if (!resolved.ok) return null;
    const result = await git(root, [
        "diff",
        "--name-only",
        "--diff-filter=d",
        `${base}...HEAD`
    ]);
    if (!result.ok) return null;
    return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}
