import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, open, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeFileAtomic } from "../dist/src/index.js";

/**
 * TEMPORARY. This file is an experiment, not a guard, and is deleted once its
 * question is answered.
 *
 * [[T-0142]] claims that every durable write in the product ends in a `rename`
 * that Windows can refuse while a reader holds the destination. That claim was
 * reasoned about, never driven, and LRN-0011 exists to refuse exactly that.
 * The probe reports what actually happens, on the platform that decides it.
 *
 * It asserts nothing. A failing assertion would tell me only that I guessed
 * wrong about which case fails; the log tells me which ones do.
 */

const REPORT = "PROBE|";

function report(label: string, outcome: string) {
    console.log(`${REPORT}${label.padEnd(28)} ${outcome}`);
}

async function attempt(label: string, run: () => Promise<unknown>) {
    try {
        await run();
        report(label, "ok");
        return null;
    } catch (error: any) {
        report(label, `${error?.code ?? "?"} ${error?.syscall ?? ""}`.trim());
        return error;
    }
}

/**
 * Holds a file the way something that is not Node holds it. libuv opens with
 * every share flag set, so a Node reader may well be invisible to a rename —
 * an editor, an indexer or a virus scanner is not, and that is the population
 * this is really about.
 */
async function holdFromOutside(path: string, share: string, ready: string) {
    const script = [
        "$ErrorActionPreference='Stop'",
        `$f=[System.IO.File]::Open('${path}','Open','Read','${share}')`,
        `Set-Content -Path '${ready}' -Value 'held'`,
        "Start-Sleep -Seconds 20",
        "$f.Close()"
    ].join("; ");
    const child = spawn(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { stdio: "ignore" }
    );
    for (let waited = 0; waited < 100; waited += 1) {
        try {
            await stat(ready);
            return child;
        } catch {
            await new Promise((done) => setTimeout(done, 100));
        }
    }
    child.kill();
    throw new Error(`the holder never signalled ready for share=${share}`);
}

test(
    "probe: what holding the destination does to writeFileAtomic",
    { skip: process.platform !== "win32" ? "windows only" : false },
    async () => {
        const root = await mkdtemp(join(tmpdir(), "workfile-rename-probe-"));
        try {
            report("platform", `${process.platform} node ${process.version}`);

            // A: a reader opened by Node itself.
            const nodeTarget = join(root, "node-reader.md");
            await writeFile(nodeTarget, "first\n");
            const handle = await open(nodeTarget, "r");
            await attempt("node reader (fs.open r)", () =>
                writeFileAtomic(nodeTarget, "second\n")
            );
            await handle.close();

            // B, C, D: a reader opened by something that is not Node, with
            // each of the share modes that matter.
            for (const share of ["None", "Read", "ReadWrite, Delete"]) {
                const target = join(root, `outside-${share.replace(/\W+/g, "-")}.md`);
                const ready = `${target}.ready`;
                await writeFile(target, "first\n");
                const holder = await holdFromOutside(target, share, ready);
                const failure = await attempt(`outside share=${share}`, () =>
                    writeFileAtomic(target, "second\n")
                );

                holder.kill();
                // Does the same write succeed once the holder is gone? That is
                // the whole question behind retrying: transient or permanent.
                for (let waited = 0; waited < 50; waited += 1) {
                    await new Promise((done) => setTimeout(done, 100));
                    try {
                        await writeFileAtomic(target, "third\n");
                        report(
                            `after release share=${share}`,
                            `ok after ~${(waited + 1) * 100}ms`
                        );
                        break;
                    } catch (error: any) {
                        if (waited === 49) {
                            report(
                                `after release share=${share}`,
                                `still ${error?.code}`
                            );
                        }
                    }
                }
                if (!failure) report(`outside share=${share}`, "no refusal at all");
            }

            // E: the destination marked read-only, which is the permanent case
            // a retry must not be allowed to hide.
            const readOnly = join(root, "read-only.md");
            await writeFile(readOnly, "first\n");
            await new Promise<void>((done) => {
                const child = spawn(
                    "powershell",
                    [
                        "-NoProfile",
                        "-NonInteractive",
                        "-Command",
                        `Set-ItemProperty -Path '${readOnly}' -Name IsReadOnly -Value $true`
                    ],
                    { stdio: "ignore" }
                );
                child.on("exit", () => done());
            });
            await attempt("destination read-only", () =>
                writeFileAtomic(readOnly, "second\n")
            );
        } finally {
            await rm(root, { recursive: true, force: true }).catch(
                () => undefined
            );
        }
    }
);
