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
    process.exit(0);
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

// server.json states the version twice — once for the MCP server and once for
// the npm package it resolves to — and the MCP Registry refuses a version npm
// does not serve yet. So a stale copy here does not publish something slightly
// wrong, it fails the release after npm has already been written to.
let manifest;
try {
    manifest = await readFile("server.json", "utf8");
} catch {
    manifest = null;
}
if (manifest) {
    const server = JSON.parse(manifest);
    const stale = [
        ...new Set(
            [server.version, ...(server.packages || []).map((pkg) => pkg.version)]
                .filter(Boolean)
                .filter((version) => version !== root.version)
        )
    ];
    if (stale.length && check) {
        drift.push(`server.json is ${stale.join(", ")}, root is ${root.version}`);
    } else if (stale.length) {
        let next = manifest;
        for (const version of stale) {
            next = next.replaceAll(
                `"version": "${version}"`,
                `"version": "${root.version}"`
            );
        }
        await writeFile("server.json", next);
        written.push("server.json");
        console.log(`server.json: ${stale.join(", ")} → ${root.version}`);
    }
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
