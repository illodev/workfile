#!/usr/bin/env node
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { diagnoseBacklog, loadBacklog } from "./backlog-lib.mjs";

const execFileAsync = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../..");
const tasksDir = resolve(currentDir, "../tasks");
const archiveDir = resolve(currentDir, "../archive");
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
    console.log(`Usage: pnpm backlog:doctor [--changed] [--json]

  --changed  Report issues only for cards changed against HEAD
  --json     Emit machine-readable JSON
`);
    process.exit(0);
}

const backlog = await loadBacklog({ tasksDir, archiveDir });
let report = await diagnoseBacklog({
    ...backlog,
    repoRoot,
    checkPaths: true
});

if (args.has("--changed")) {
    const { stdout } = await execFileAsync(
        "git",
        ["status", "--short", "--untracked-files=all"],
        { cwd: repoRoot, maxBuffer: 4 * 1024 * 1024 }
    );
    const changedFiles = new Set(
        stdout
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => line.slice(3).split(" -> ").pop())
            .filter((file) =>
                /^\.planning\/backlog\/(tasks|archive)\/.+\.md$/.test(file)
            )
            .map((file) => file.split("/").pop())
    );
    report = {
        ...report,
        issues: report.issues.filter((entry) => changedFiles.has(entry.file))
    };
    report.counts = { error: 0, warning: 0, info: 0 };
    for (const entry of report.issues) report.counts[entry.severity] += 1;
    report.ok = report.counts.error === 0;
    report.changedCards = changedFiles.size;
}

if (args.has("--json")) {
    console.log(JSON.stringify(report, null, 2));
} else {
    const scope = args.has("--changed")
        ? `${report.changedCards} changed cards`
        : `${report.cards} cards`;
    console.log(
        `Backlog doctor · ${scope} · ${report.counts.error} errors · ${report.counts.warning} warnings`
    );
    for (const entry of report.issues) {
        const location = entry.id || entry.file || "backlog";
        console.log(
            `${entry.severity.toUpperCase().padEnd(7)} ${location} [${entry.code}] ${entry.message}`
        );
    }
}

process.exitCode = report.ok ? 0 : 1;
