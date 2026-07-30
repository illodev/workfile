import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Assembles the distributable plugin from the sources of truth.
 *
 * Nothing here is hand-maintained. The hook runtime is copied byte for byte
 * from `src/runtime/claude/`, and the slash commands are rendered by the same
 * function that writes them into a consuming repository — so the plugin and
 * `project claude install` cannot drift into offering different behaviour,
 * which is precisely the failure mode a second copy invites.
 */
const root = new URL("../", import.meta.url);
const plugin = new URL("plugins/workfile/", root);
const version = JSON.parse(
    await readFile(new URL("package.json", root), "utf8")
).version;

await mkdir(new URL("runtime/", plugin), { recursive: true });
await cp(
    new URL("packages/workfile/src/runtime/claude/hooks.mjs", root),
    new URL("runtime/hooks.mjs", plugin)
);

const { claudeCommandFiles, claudeSkillFile } = await import(
    new URL("packages/workfile/dist/src/modules/claude/index.js", root).href
);

await mkdir(new URL("commands/", plugin), { recursive: true });
for (const command of claudeCommandFiles()) {
    await writeFile(
        new URL(`commands/${command.name}.md`, plugin),
        command.content
    );
}

await mkdir(new URL("skills/workfile/", plugin), { recursive: true });
await writeFile(
    new URL("skills/workfile/SKILL.md", plugin),
    claudeSkillFile()
);

// The manifests carry the package version, so a release cannot ship a plugin
// that claims to be an older one.
for (const path of [
    new URL(".claude-plugin/plugin.json", plugin),
    new URL(".claude-plugin/marketplace.json", root)
]) {
    const manifest = JSON.parse(await readFile(path, "utf8"));
    if (manifest.version) manifest.version = version;
    if (Array.isArray(manifest.plugins)) {
        for (const entry of manifest.plugins) entry.version = version;
    }
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(`plugin assembled at v${version}`);
