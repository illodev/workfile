#!/usr/bin/env node
/**
 * Keeps every workspace package at the root version.
 *
 * The packages ship as one ecosystem: a provider tested against core X is
 * published as X, and "install matching versions" stays the whole upgrade
 * story. Wired as the root `version` lifecycle hook, so `npm version X`
 * carries `packages/*` inside the same bump commit — and `--check` lets CI
 * and the test suite refuse any commit where the versions drift apart.
 */
import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const check = process.argv.includes("--check");
/**
 * Stage what was written, for the `version` lifecycle hook.
 *
 * The hook used to name the files itself — `git add packages/*​/package.json` —
 * which was already wrong by the time `server.json` joined the outputs: the
 * bump rewrote it and committed without it. A second list of what this script
 * touches is a list that drifts the first time it gains a third output, so the
 * writer stages what it wrote and nobody keeps a copy. Off by default, because
 * a maintainer aligning versions by hand should not have their index written.
 */
const stage = process.argv.includes("--stage");
const written: string[] = [];
const root = JSON.parse(await readFile("package.json", "utf8"));

let entries: Dirent[] = [];
try {
    entries = (await readdir("packages", { withFileTypes: true })).filter(
        (entry) => entry.isDirectory()
    );
} catch {
    // No workspace packages is not "nothing to do": the manifests below state
    // the version too, and exiting here made their check contingent on a
    // readdir that has nothing to do with them.
}

const drift: string[] = [];
for (const entry of entries) {
    const path = join("packages", entry.name, "package.json");
    let raw;
    try {
        raw = await readFile(path, "utf8");
    } catch {
        continue;
    }
    const pkg = JSON.parse(raw);
    if (pkg.version === root.version) continue;
    if (check) {
        drift.push(`${pkg.name} is ${pkg.version}, root is ${root.version}`);
        continue;
    }
    // A targeted replacement instead of re-serializing, so the file keeps its
    // formatting and key order untouched.
    await writeFile(
        path,
        raw.replace(
            `"version": "${pkg.version}"`,
            `"version": "${root.version}"`
        )
    );
    written.push(path);
    console.log(`${pkg.name}: ${pkg.version} → ${root.version}`);
}

/**
 * The files that state the version outside `packages/*`, where the loop above
 * cannot see them.
 *
 * `server.json` says it twice — once for the MCP server, once for the npm
 * package it resolves to — and the MCP Registry refuses a version npm does not
 * serve yet, so a stale copy does not publish something slightly wrong, it
 * fails the release after npm has already been written to.
 *
 * The two plugin manifests are the ones this list was missing. `build-plugin`
 * stamps them from the same root version, but it runs under `check` rather
 * than under the bump, so the version moved as a side effect of testing and
 * nothing verified the committed result. At 0.3.0 that meant a stamp commit
 * after the tag; the marketplace advertised a version behind and no step
 * failed.
 */
const MANIFESTS = [
    "server.json",
    ".claude-plugin/marketplace.json",
    "plugins/workfile/.claude-plugin/plugin.json"
];

interface Versioned {
    version?: string;
    plugins?: Versioned[];
    packages?: Versioned[];
}

/** Every node in a manifest that carries a version of its own. */
const bearers = (json: Versioned): Versioned[] => [
    json,
    ...(json.plugins || []),
    ...(json.packages || [])
];

for (const path of MANIFESTS) {
    let manifest;
    try {
        manifest = await readFile(path, "utf8");
    } catch {
        continue;
    }
    const stale = [
        ...new Set(
            bearers(JSON.parse(manifest))
                .map((node) => node.version)
                .filter(Boolean)
                .filter((version) => version !== root.version)
        )
    ];
    if (!stale.length) continue;
    if (check) {
        drift.push(`${path} is ${stale.join(", ")}, root is ${root.version}`);
        continue;
    }
    let next = manifest;
    for (const version of stale) {
        next = next.replaceAll(
            `"version": "${version}"`,
            `"version": "${root.version}"`
        );
    }
    await writeFile(path, next);
    written.push(path);
    console.log(`${path}: ${stale.join(", ")} → ${root.version}`);
}

if (stage && written.length) {
    await promisify(execFile)("git", ["add", ...written]);
    console.log(`staged: ${written.join(", ")}`);
}

if (drift.length) {
    console.error(
        `Workspace versions drifted from the root:\n  ${drift.join("\n  ")}\nRun \`node ./scripts/sync-workspace-versions.ts\` to align them.`
    );
    process.exit(1);
}
