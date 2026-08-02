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
import type { Dirent } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const check = process.argv.includes("--check");
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
        console.log(`server.json: ${stale.join(", ")} → ${root.version}`);
    }
}

if (drift.length) {
    console.error(
        `Workspace versions drifted from the root:\n  ${drift.join("\n  ")}\nRun \`node ./scripts/sync-workspace-versions.ts\` to align them.`
    );
    process.exit(1);
}
