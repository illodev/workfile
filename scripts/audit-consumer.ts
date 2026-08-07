#!/usr/bin/env node
/**
 * Audits the tree a consumer resolves, which is not the tree `pnpm audit` reads.
 *
 * `pnpm audit` audits this workspace. The workspace has `pnpm.overrides`, and
 * overrides are a workspace-install mechanism: they rewrite resolution here and
 * do not travel inside a published package. So the release gate could read zero
 * high advisories while somebody running `npm i @illodev/workfile-search-local`
 * resolved several — which is exactly what it did. Two of the four overrides,
 * `sharp` and `adm-zip`, sit under `@huggingface/transformers`, a `dependencies`
 * entry of that published package, and the overrides fixed them for nobody but
 * us.
 *
 * This resolves what the *manifests* declare instead. The consumer manifest is
 * the union of every publishable package's `dependencies`, so it describes this
 * branch rather than the last release, needs nothing published, and cannot see
 * the overrides because it is a different install root.
 *
 * `--package-lock-only` resolves without downloading, so this costs a few
 * seconds and no binaries — `sharp` and `onnxruntime-node` would otherwise pull
 * platform builds worth hundreds of megabytes to tell us something the lockfile
 * already knows.
 *
 * Blocking, with no allowlist. That is a deliberate posture, recorded in
 * ADR-0021: a known advisory in a published dependency tree stops the release
 * rather than being carried on a list, even when the fix is not ours to make.
 * The way out is to change what is shipped, not to annotate what is.
 *
 * What this does not cover: only `dependencies` are resolved, because that is
 * what a consumer installs — a vulnerability reachable solely through an
 * `optionalDependencies` path that npm skipped here is invisible. It also reads
 * the manifests, not the tarball, so a dependency added to the published
 * package.json by a build step would not appear.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const THRESHOLD = new Set(["high", "critical"]);

async function publishableDependencies() {
    const packagesDir = join(repoRoot, "packages");
    const dependencies: Record<string, string> = {};
    const sources: Record<string, string[]> = {};
    for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = join(packagesDir, entry.name, "package.json");
        let manifest;
        try {
            manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        } catch {
            continue;
        }
        // A private package ships nothing, so its dependencies reach no consumer.
        if (manifest.private) continue;
        for (const [name, range] of Object.entries(
            (manifest.dependencies || {}) as Record<string, string>
        )) {
            // Two publishable packages asking for different ranges of one
            // dependency is a thing npm would resolve per-consumer; noted rather
            // than merged silently, because the audit result could differ.
            if (dependencies[name] && dependencies[name] !== range) {
                console.warn(
                    `warning: ${name} is declared as ${dependencies[name]} and ${range}; auditing ${range}`
                );
            }
            dependencies[name] = range;
            sources[name] = [...(sources[name] || []), manifest.name];
        }
    }
    return { dependencies, sources };
}

const { dependencies, sources } = await publishableDependencies();
const names = Object.keys(dependencies);
if (!names.length) {
    console.error(
        "No publishable package declares a runtime dependency. Either every " +
            "package is private, or the manifests moved and this is auditing nothing."
    );
    process.exit(1);
}

console.log(
    `Auditing the consumer tree for ${names.length} declared ${
        names.length === 1 ? "dependency" : "dependencies"
    }:`
);
for (const name of names) {
    console.log(`  ${name}@${dependencies[name]}  (from ${sources[name].join(", ")})`);
}

const scratch = await mkdtemp(join(tmpdir(), "workfile-consumer-audit-"));
try {
    await writeFile(
        join(scratch, "package.json"),
        `${JSON.stringify(
            {
                name: "workfile-consumer-audit",
                version: "0.0.0",
                private: true,
                dependencies
            },
            null,
            2
        )}\n`
    );

    // Resolution only. `--ignore-scripts` because nothing here is executed, and
    // a postinstall from a tree we are auditing is the last thing to run.
    await run("npm", ["install", "--package-lock-only", "--ignore-scripts"], {
        cwd: scratch,
        maxBuffer: 32 * 1024 * 1024
    });

    let report;
    try {
        const { stdout } = await run("npm", ["audit", "--json"], {
            cwd: scratch,
            maxBuffer: 64 * 1024 * 1024
        });
        report = JSON.parse(stdout);
    } catch (error) {
        // `npm audit` exits non-zero whenever it finds anything at all, so the
        // findings arrive on this path in the ordinary case.
        const output = `${(error as { stdout?: string }).stdout || ""}`;
        if (!output.trim()) throw error;
        report = JSON.parse(output);
    }

    const blocking = Object.values(
        (report.vulnerabilities || {}) as Record<string, any>
    ).filter((entry) => THRESHOLD.has(entry.severity));

    if (!blocking.length) {
        const counts = report.metadata?.vulnerabilities || {};
        console.log(
            `\nConsumer tree clean at high and above. Below the threshold: ${
                Object.entries(counts)
                    .filter(([level, count]) => level !== "total" && Number(count) > 0)
                    .map(([level, count]) => `${count} ${level}`)
                    .join(", ") || "nothing"
            }.`
        );
        process.exit(0);
    }

    console.error(
        `\n${blocking.length} package(s) at high or above in the tree a consumer resolves:\n`
    );
    for (const entry of blocking.sort((left, right) =>
        String(left.name).localeCompare(String(right.name))
    )) {
        console.error(`  ${entry.name} ${entry.range} — ${entry.severity}`);
        for (const via of entry.via || []) {
            if (typeof via === "string") continue;
            console.error(`    ${via.title}`);
            if (via.url) console.error(`    ${via.url}`);
        }
        const reachedBy = (entry.effects || []).join(", ");
        if (reachedBy) console.error(`    reached through: ${reachedBy}`);
        console.error(
            `    fix available: ${entry.fixAvailable ? "yes" : "no, not upstream"}`
        );
    }
    console.error(
        "\nThis is what a consumer installs. `pnpm audit` does not see it: root\n" +
            "pnpm.overrides rewrite resolution in this workspace only, so an override\n" +
            "silences the workspace gate and reaches no user. Fixing this means\n" +
            "changing what the published packages depend on — see ADR-0021.\n"
    );
    process.exit(1);
} finally {
    await rm(scratch, { recursive: true, force: true });
}
