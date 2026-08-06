import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import {
    access,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile
} from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const packageRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const packageJson = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8")
);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

async function run(file, args, cwd) {
    try {
        return await execFile(file, args, {
            cwd,
            encoding: "utf8",
            maxBuffer: 16 * 1024 * 1024
        });
    } catch (error) {
        const output = [error.stdout, error.stderr].filter(Boolean).join("\n");
        throw new Error(
            `Command failed: ${basename(file)} ${args.join(" ")}\n${output}`,
            { cause: error }
        );
    }
}

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function waitForServer(child): Promise<string> {
    const lines = createInterface({ input: child.stdout });
    return await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
            lines.close();
            reject(new Error("Timed out waiting for the packaged UI server."));
        }, 10_000);
        const finish = (callback, value) => {
            clearTimeout(timeout);
            lines.close();
            callback(value);
        };
        lines.on("line", (line) => {
            const match = line.match(/Workfile → (http:\/\/\S+)/);
            if (match) finish(resolve, match[1]);
        });
        child.once("error", (error) => finish(reject, error));
        child.once("exit", (code) => {
            if (code !== null) {
                finish(
                    reject,
                    new Error(`Packaged UI server exited before startup with code ${code}.`)
                );
            }
        });
    });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "workfile-package-"));
const packDirectory = join(temporaryRoot, "pack");
const consumer = join(temporaryRoot, "consumer");

try {
    await mkdir(packDirectory, { recursive: true });
    await run(
        npm,
        ["pack", "--pack-destination", packDirectory, "--silent"],
        packageRoot
    );
    const tarballs = (await readdir(packDirectory))
        .filter((entry) => entry.endsWith(".tgz"));
    assert.equal(tarballs.length, 1, "npm pack must produce exactly one tarball");
    const tarball = join(packDirectory, tarballs[0]);

    await mkdir(consumer, { recursive: true });
    await writeFile(
        join(consumer, "package.json"),
        `${JSON.stringify({ name: "workfile-pilot", private: true }, null, 2)}\n`
    );
    await writeFile(join(consumer, "README.md"), "# Package pilot\n");
    await run(
        npm,
        [
            "install",
            tarball,
            "--ignore-scripts",
            "--no-audit",
            "--no-fund",
            "--package-lock=false"
        ],
        consumer
    );

    const installedRoot = join(
        consumer,
        "node_modules",
        "@illodev",
        "workfile"
    );
    assert.equal(
        await exists(join(installedRoot, "dist", "ui", "index.html")),
        true,
        "the tarball must contain the precompiled UI"
    );
    assert.equal(
        await exists(join(consumer, "node_modules", "react")),
        false,
        "precompiled UI dependencies must not be installed at runtime"
    );

    await writeFile(
        join(consumer, "typed-consumer.ts"),
        `import { defineProject, type ProjectConfig } from "@illodev/workfile";
import { createSemanticSearchProvider } from "@illodev/workfile/search";

const config: ProjectConfig = defineProject({
    schemaVersion: 2,
    name: "Installed type consumer",
    cards: { areas: ["general"] }
});

const provider = createSemanticSearchProvider({
    id: "installed-types",
    async search({ records }) {
        return records.map((record) => ({ id: record.id, score: 1 }));
    }
});

void config;
void provider;
`
    );
    await writeFile(
        join(consumer, "tsconfig.json"),
        `${JSON.stringify(
            {
                compilerOptions: {
                    target: "ES2022",
                    module: "NodeNext",
                    moduleResolution: "NodeNext",
                    strict: true,
                    noEmit: true,
                    skipLibCheck: false,
                    types: ["node"]
                },
                include: ["typed-consumer.ts"]
            },
            null,
            2
        )}\n`
    );
    const tsc = join(
        packageRoot,
        "node_modules",
        ".bin",
        process.platform === "win32" ? "tsc.cmd" : "tsc"
    );
    await run(tsc, ["-p", "tsconfig.json"], consumer);

    const project = join(
        consumer,
        "node_modules",
        ".bin",
        process.platform === "win32" ? "workfile.cmd" : "workfile"
    );
    const version = await run(project, ["version"], consumer);
    assert.equal(version.stdout.trim(), packageJson.version);

    /*
     * `wf` is the same entry point under a second name, so the only thing worth
     * proving is that npm really installs the shim and that the CLI can tell
     * which name reached it. It reads `process.argv[1]`, which Node leaves as
     * the executed path rather than resolving it — true of the symlink npm
     * writes on POSIX, not of the `.cmd` shim it writes on Windows, where the
     * target path arrives instead and the help falls back to the canonical
     * name. Both are correct; only the first is assertable here.
     */
    const short = join(
        consumer,
        "node_modules",
        ".bin",
        process.platform === "win32" ? "wf.cmd" : "wf"
    );
    assert.equal(await exists(short), true, "`wf` was not installed as a bin");
    const shortVersion = await run(short, ["version"], consumer);
    assert.equal(shortVersion.stdout.trim(), packageJson.version);
    if (process.platform !== "win32") {
        const help = await run(short, ["card", "--help"], consumer);
        assert.match(help.stdout, /^ {2}wf card list/m);
        assert.doesNotMatch(help.stdout, /^ {2}workfile /m);
    }

    await run(
        project,
        [
            "init",
            "--root",
            consumer,
            "--yes",
            "--areas",
            "general",
            "--agents",
            "agents-md",
            "--ci",
            "generic",
            "--json"
        ],
        consumer
    );
    const card = JSON.parse(
        (
            await run(
                project,
                [
                    "card",
                    "create",
                    "--root",
                    consumer,
                    "--title",
                    "Verify packaged Work",
                    "--area",
                    "general",
                    "--json"
                ],
                consumer
            )
        ).stdout
    );
    const document = JSON.parse(
        (
            await run(
                project,
                [
                    "doc",
                    "create",
                    "--root",
                    consumer,
                    "--title",
                    "Packaged Docs",
                    "--status",
                    "current",
                    "--related",
                    card.id,
                    "--json"
                ],
                consumer
            )
        ).stdout
    );
    const change = JSON.parse(
        (
            await run(
                project,
                [
                    "changelog",
                    "add",
                    "--root",
                    consumer,
                    "--title",
                    "Verify packaged History",
                    "--area",
                    "general",
                    "--cards",
                    card.id,
                    "--json"
                ],
                consumer
            )
        ).stdout
    );
    const memory = JSON.parse(
        (
            await run(
                project,
                [
                    "memory",
                    "add",
                    "learning",
                    "--root",
                    consumer,
                    "--title",
                    "Packaged Memory works",
                    "--related",
                    card.id,
                    "--json"
                ],
                consumer
            )
        ).stdout
    );

    assert.match(card.id, /^T-/);
    assert.match(document.id, /^DOC-/);
    assert.match(change.id, /^CHG-/);
    assert.match(memory.id, /^LRN-/);

    const search = JSON.parse(
        (
            await run(
                project,
                ["search", "packaged", "--root", consumer, "--json"],
                consumer
            )
        ).stdout
    );
    assert.ok(search.total >= 3, "unified search must see packaged records");

    // Regex search runs the user's pattern in a worker, resolved out of the
    // installed tree with `import.meta.url` — so it is exactly the kind of
    // thing that works from a checkout and not from a tarball. Nothing in
    // `pnpm run check` loads the package the way a consumer does (T-0182), so
    // the assertion belongs here.
    const regex = JSON.parse(
        (
            await run(
                project,
                ["search", "/packaged/i", "--root", consumer, "--json"],
                consumer
            )
        ).stdout
    );
    assert.equal(regex.mode, "regex", "the /pattern/ form has to reach regex mode");
    assert.ok(regex.total >= 1, "the packaged worker must return matches");

    const doctor = JSON.parse(
        (
            await run(project, ["doctor", "--root", consumer, "--json"], consumer)
        ).stdout
    );
    assert.equal(doctor.counts.error, 0);

    const mcp = JSON.parse(
        (
            await run(
                project,
                ["mcp", "inspect", "--root", consumer, "--json"],
                consumer
            )
        ).stdout
    );
    // The published tool surface, by name rather than by count. A bare count
    // says "22 !== 21" and leaves you to work out which tool moved; it also
    // cannot see a RENAMED tool, which is the change most likely to break a
    // consumer's config. Adding a tool is the same one-line edit either way.
    assert.deepEqual(
        mcp.tools.map((tool) => tool.name).sort(),
        [
            "project_agent_context",
            "project_card_archive",
            "project_card_claim",
            "project_card_create",
            "project_card_list",
            "project_card_note",
            "project_card_patch",
            "project_card_release",
            "project_card_reopen",
            "project_card_transition",
            "project_card_write",
            "project_changelog_add",
            "project_changelog_list",
            "project_changelog_patch",
            "project_changelog_preview",
            "project_changelog_release",
            "project_doc_create",
            "project_doc_list",
            "project_doc_move",
            "project_doc_patch",
            "project_doctor",
            "project_get_record",
            "project_memory_add",
            "project_memory_graduate",
            "project_memory_list",
            "project_memory_patch",
            "project_memory_supersede",
            "project_next",
            "project_search",
            "project_workspace"
        ]
    );
    assert.equal(mcp.server.version, packageJson.version);

    const mcpConfig = JSON.parse(
        (
            await run(
                project,
                ["mcp", "config", "--root", consumer, "--json"],
                consumer
            )
        ).stdout
    );
    assert.equal(await exists(mcpConfig.args[0]), true);
    // The dedicated MCP entry point, not the general CLI. `project.js` loads
    // the whole command surface before it can answer a handshake; the split
    // binary exists so an editor spawning this on every session does not pay
    // for that. Both are declared in `bin`, so both must survive packing.
    assert.match(mcpConfig.args[0], /dist[\\/]bin[\\/]workfile-mcp\.js$/);
    assert.equal(
        await exists(join(consumer, "node_modules/@illodev/workfile/dist/bin/workfile.js")),
        true
    );

    const server = spawn(
        project,
        ["ui", "--root", consumer, "--host", "127.0.0.1", "--port", "0"],
        { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] }
    );
    try {
        const url = await waitForServer(server);
        const [indexResponse, workspaceResponse] = await Promise.all([
            fetch(url),
            fetch(`${url}/api/v2/workspace`)
        ]);
        assert.equal(indexResponse.status, 200);
        assert.match(await indexResponse.text(), /<div id="root"><\/div>/);
        assert.equal(workspaceResponse.status, 200);
        assert.equal((await workspaceResponse.json()).schemaVersion, 2);
    } finally {
        server.kill();
    }

    // A published board: read-only, bound to every interface, answering to a
    // name that is not its bind address. Every part of that combination is a
    // flag, and all three have to hold at once for the deployment to work —
    // `--host 0.0.0.0` alone made the origin guard refuse the very name the
    // board was published under.
    const published = spawn(
        project,
        [
            "ui",
            "--root",
            consumer,
            "--host",
            "0.0.0.0",
            "--port",
            "0",
            "--read-only",
            "--allowed-host",
            "board.example"
        ],
        { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] }
    );
    try {
        const url = await waitForServer(published);
        const port = Number(new URL(url).port);

        const write = await fetch(`${url}/api/v2/cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Refused", area: "api" })
        });
        assert.equal(write.status, 409);
        assert.equal((await write.json()).error.code, "WORKSPACE_READ_ONLY");

        // `fetch` drops a manually set Host, so the allowlist needs a socket.
        const status = (host: string) =>
            new Promise<string>((done) => {
                const socket = connect(port, "127.0.0.1", () => {
                    socket.write(
                        `GET /api/v2/workspace HTTP/1.1\r\nHost: ${host}\r\n` +
                            "Connection: close\r\n\r\n"
                    );
                });
                let buffer = "";
                socket.on("data", (chunk) => (buffer += chunk));
                socket.on("end", () => done(buffer.split("\r\n")[0]));
            });

        assert.match(await status("board.example"), /^HTTP\/1\.1 200/);
        // Named hosts add to the loopback set instead of replacing it, or the
        // container healthcheck of a published board would 403.
        assert.match(await status(`127.0.0.1:${port}`), /^HTTP\/1\.1 200/);
        assert.match(await status("attacker.example"), /^HTTP\/1\.1 403/);
    } finally {
        published.kill();
    }

    console.log(
        `Package smoke passed: ${packageJson.name}@${packageJson.version} ` +
            "(install, init, Work, Docs, History, Memory, MCP, UI, read-only board)"
    );
} finally {
    await rm(temporaryRoot, { recursive: true, force: true });
}
