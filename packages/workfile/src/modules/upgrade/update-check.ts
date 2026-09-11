import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { stripTrailingSlashes } from "../../core/glob.js";

const PACKAGE_VERSION = JSON.parse(
    await readFile(new URL("../../../../package.json", import.meta.url), "utf8")
).version;

export const UPDATE_PACKAGE = "@illodev/workfile";
export const DEFAULT_REGISTRY = "https://registry.npmjs.org";

/**
 * How long a registry answer is trusted. A day: releases are not hourly, and
 * the two surfaces that read this — `upgrade` and the footer — are opened by
 * a person, not by a loop.
 */
export const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How long a failed attempt is left alone. Cached like an answer, or an
 * offline machine would pay the timeout on every `upgrade` and every board
 * load — which is a change in behaviour the card says it must not be.
 */
export const UPDATE_RETRY_MS = 60 * 60 * 1000;

export const UPDATE_REQUEST_TIMEOUT_MS = 3_000;

const CACHE_FILE = "update-check.json";

export type UpdateStatus = "disabled" | "current" | "behind" | "ahead" | "unknown";

export interface UpdateCheck {
    status: UpdateStatus;
    package: string;
    installed: string;
    latest: string | null;
    registry: string | null;
    checkedAt: string | null;
    nextCheckAt: string | null;
    /** Where the answer came from: the switch, the cache file, or the wire. */
    source: "config" | "cache" | "registry";
}

interface CacheEntry {
    package: string;
    registry: string;
    latest: string | null;
    checkedAt: string;
}

/**
 * The registry npm itself would use, when npm says so.
 *
 * `npm_config_registry` is what npm puts in the environment of every script it
 * runs, and what a mirror or a corporate proxy sets globally; asking anything
 * else from behind one of those is asking a wall. The package is not read from
 * `.npmrc`: that is npm's file to parse, and a check that must never fail a
 * command should not take on a config-file parser to get one URL.
 */
export function registryUrl(env: NodeJS.ProcessEnv = process.env) {
    const configured = (env.npm_config_registry || "").trim();
    return stripTrailingSlashes(configured || DEFAULT_REGISTRY);
}

/**
 * Semver's ordering over the part of it that decides "behind".
 *
 * Numeric core, then a prerelease sorts under its release. Two prereleases
 * compare as strings, which is wrong for `rc.10` against `rc.9` and does not
 * matter here: the registry's `latest` is a release, and the only question a
 * comparison against it has to answer is whether the installed one is older.
 * `null` when either side is not a version, so the caller can say `unknown`
 * rather than guess.
 */
export function compareVersions(left: string, right: string): number | null {
    const parse = (value: string) => {
        const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
            value.trim()
        );
        if (!match) return null;
        return {
            core: [Number(match[1]), Number(match[2]), Number(match[3])],
            prerelease: match[4] ?? null
        };
    };
    const a = parse(left);
    const b = parse(right);
    if (!a || !b) return null;
    for (let index = 0; index < 3; index += 1) {
        if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
    }
    if (a.prerelease === b.prerelease) return 0;
    if (a.prerelease === null) return 1;
    if (b.prerelease === null) return -1;
    return a.prerelease < b.prerelease ? -1 : 1;
}

async function readCache(path: string): Promise<CacheEntry | null> {
    try {
        const entry = JSON.parse(await readFile(path, "utf8"));
        return typeof entry?.checkedAt === "string" && typeof entry?.registry === "string"
            ? entry
            : null;
    } catch {
        return null;
    }
}

async function writeCache(path: string, entry: CacheEntry) {
    try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify(entry, null, 2)}\n`);
    } catch {
        // A read-only checkout still gets its answer; it just asks again next
        // time. The cache is a courtesy to the registry, not a record.
    }
}

/**
 * What the request is, spelled out because the security model promises there
 * is no other: one `GET` for the package's `latest` manifest, no body, no
 * header beyond what Node's `fetch` adds on its own, and nothing that names
 * the workspace. Anything but a 2xx carrying a version string is "no answer".
 */
async function askRegistry(
    fetchImpl: typeof fetch | undefined,
    registry: string,
    timeoutMs: number
): Promise<string | null> {
    if (typeof fetchImpl !== "function") return null;
    try {
        const response = await fetchImpl(
            `${registry}/${UPDATE_PACKAGE.replace("/", "%2F")}/latest`,
            {
                headers: { accept: "application/json" },
                signal: AbortSignal.timeout(timeoutMs)
            }
        );
        if (!response.ok) return null;
        const body: any = await response.json();
        const version = body?.version;
        return typeof version === "string" && compareVersions(version, "0.0.0") !== null
            ? version
            : null;
    } catch {
        return null;
    }
}

function answer(
    base: { package: string; installed: string },
    entry: CacheEntry,
    source: UpdateCheck["source"],
    windowMs: number
): UpdateCheck {
    const comparison = entry.latest ? compareVersions(base.installed, entry.latest) : null;
    const status: UpdateStatus =
        comparison === null
            ? "unknown"
            : comparison < 0
              ? "behind"
              : comparison > 0
                ? "ahead"
                : "current";
    return {
        ...base,
        status,
        latest: entry.latest,
        registry: entry.registry,
        checkedAt: entry.checkedAt,
        nextCheckAt: new Date(Date.parse(entry.checkedAt) + windowMs).toISOString(),
        source
    };
}

/**
 * Whether a newer `@illodev/workfile` is published than the one running.
 *
 * `runUpgrade` resyncs every managed surface once a bump is known to have
 * happened; nothing told anyone one had. The installed version was only ever
 * compared against the stamps inside the workspace, so a repository could sit
 * two releases behind with every check green (T-0208).
 *
 * Where this runs is the whole design, and it was decided rather than assumed:
 * `workfile upgrade` and the interface's footer, and nowhere else. `doctor`
 * runs in CI on every pull request, and a CLI that reaches the network on
 * every invocation hangs on a bad DNS day — so no other command calls this,
 * and the generated CI never does. The switch is `upgrade.check` in the
 * config; off means no request, not a hidden message. Off the wire, the
 * answer is silence: `unknown`, which both surfaces print as nothing.
 *
 * Never throws. Never writes a record: the only file it touches is under the
 * configured `storage.cache`, which `init` gitignores.
 */
export async function checkForUpdate(
    workspace,
    {
        now = new Date(),
        fetch: fetchImpl = globalThis.fetch,
        installed = PACKAGE_VERSION,
        registry = registryUrl(),
        ttlMs = UPDATE_CHECK_TTL_MS,
        retryMs = UPDATE_RETRY_MS,
        timeoutMs = UPDATE_REQUEST_TIMEOUT_MS
    }: {
        now?: Date;
        fetch?: typeof fetch;
        installed?: string;
        registry?: string;
        ttlMs?: number;
        retryMs?: number;
        timeoutMs?: number;
    } = {}
): Promise<UpdateCheck> {
    const base = { package: UPDATE_PACKAGE, installed };
    if (!workspace?.config?.upgrade?.check) {
        return {
            ...base,
            status: "disabled",
            latest: null,
            registry: null,
            checkedAt: null,
            nextCheckAt: null,
            source: "config"
        };
    }
    try {
        // `storage.cache` is configurable and `init` gitignores it, so this is
        // the one directory a workspace has already agreed not to commit.
        const cachePath = join(workspace.paths.cache, CACHE_FILE);
        const cached = await readCache(cachePath);
        if (cached && cached.registry === registry && cached.package === UPDATE_PACKAGE) {
            const age = now.getTime() - Date.parse(cached.checkedAt);
            const windowMs = cached.latest ? ttlMs : retryMs;
            if (Number.isFinite(age) && age >= 0 && age < windowMs) {
                return answer(base, cached, "cache", windowMs);
            }
        }
        const latest = await askRegistry(fetchImpl, registry, timeoutMs);
        const entry: CacheEntry = {
            package: UPDATE_PACKAGE,
            registry,
            latest,
            checkedAt: now.toISOString()
        };
        await writeCache(cachePath, entry);
        return answer(base, entry, "registry", latest ? ttlMs : retryMs);
    } catch {
        return {
            ...base,
            status: "unknown",
            latest: null,
            registry,
            checkedAt: null,
            nextCheckAt: null,
            source: "registry"
        };
    }
}

/**
 * The command that closes the gap, in the manager the workspace already uses.
 *
 * A workspace with no local copy runs the global binary — that is what the
 * `npx` form of the generated registration exists for — so it is told to
 * update that, not to add a dependency it never had.
 */
export function upgradeHint(packageManager: string, { local = true } = {}) {
    if (!local) return `npm install -g ${UPDATE_PACKAGE}@latest, then run \`workfile upgrade\` again`;
    const install =
        {
            pnpm: "pnpm add -D",
            yarn: "yarn add -D",
            bun: "bun add -d",
            npm: "npm install -D"
        }[packageManager] ?? "npm install -D";
    return `${install} ${UPDATE_PACKAGE}@latest, then run \`workfile upgrade\` again`;
}

/** "checked 3 h ago", for the one line that confirms the check happened. */
export function checkedAgo(checkedAt: string | null, now = new Date()) {
    const age = checkedAt ? now.getTime() - Date.parse(checkedAt) : NaN;
    if (!Number.isFinite(age) || age < 0) return "checked just now";
    const minutes = Math.round(age / 60_000);
    if (minutes < 2) return "checked just now";
    if (minutes < 90) return `checked ${minutes} min ago`;
    return `checked ${Math.round(minutes / 60)} h ago`;
}
