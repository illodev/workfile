#!/usr/bin/env node
/**
 * Prints one version's section of CHANGELOG.md, for the GitHub Release body.
 *
 * The section is what `changelog release` already rendered from the fragments,
 * so the release note and the changelog cannot disagree: there is no second
 * copy to keep in step. Refuses rather than prints nothing, because an empty
 * body would publish a release that says the version shipped and nothing else.
 */
import { readFile } from "node:fs/promises";

const version = process.argv[2];
if (!version) {
    console.error("Usage: node ./scripts/release-notes.ts VERSION");
    process.exit(1);
}

const lines = (await readFile("CHANGELOG.md", "utf8")).split("\n");

// `## 0.4.0 — 2026-08-02`. The first token is compared whole, not by prefix:
// `startsWith` would find 0.1.1 inside the heading for 0.1.10 and publish the
// wrong notes on the first release that goes two digits.
const start = lines.findIndex(
    (line) =>
        line.startsWith("## ") &&
        line.slice(3).trim().split(/\s+/)[0] === version
);
if (start === -1) {
    console.error(
        `CHANGELOG.md has no section for ${version}. Run \`workfile changelog release ${version}\` before tagging.`
    );
    process.exit(1);
}

const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => line.startsWith("## "));
const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();

if (!body) {
    console.error(`The ${version} section of CHANGELOG.md is empty.`);
    process.exit(1);
}

console.log(body);
