import { chmod, cp, mkdir } from "node:fs/promises";

// The Claude Code hook runtime is authored as plain `.mjs` on purpose — it must
// not import the package, so there is nothing for `tsc` to do with it — which
// also means `tsc` does not copy it into `dist`.
await mkdir(new URL("../dist/src/runtime/claude/", import.meta.url), {
    recursive: true
});
await cp(
    new URL("../src/runtime/claude/hooks.mjs", import.meta.url),
    new URL("../dist/src/runtime/claude/hooks.mjs", import.meta.url)
);

if (process.platform !== "win32") {
    await Promise.all([
        chmod(new URL("../dist/bin/workfile.js", import.meta.url), 0o755),
        chmod(new URL("../dist/bin/workfile-mcp.js", import.meta.url), 0o755),
        chmod(
            new URL("../dist/src/runtime/claude/hooks.mjs", import.meta.url),
            0o755
        )
    ]);
}

// The published UI must never be a demo build: it embeds a snapshot of someone
// else's workspace, so `workfile ui` would show a stranger's cards instead of
// the user's own. Cheap to assert, and impossible to notice by eye.
const { readdir, readFile } = await import("node:fs/promises");
const staticDir = new URL("../dist/ui/static/", import.meta.url);
try {
    for (const name of await readdir(staticDir)) {
        if (!name.endsWith(".js")) continue;
        const bundle = await readFile(new URL(name, staticDir), "utf8");
        if (bundle.includes("__PROJECT_DEMO_SNAPSHOT__")) {
            throw new Error(
                `dist/ui/static/${name} is a demo build. Run \`pnpm run build\`.`
            );
        }
    }
} catch (error) {
    if (error?.code !== "ENOENT") throw error;
}
