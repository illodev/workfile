// Builds ui/src/demo-data.json by snapshotting this repository's OWN
// Workfile workspace (.project/ + indexed docs) through the real
// HTTP server — the hosted demo shows the actual development of the
// project. Requires a prior `pnpm run build:core`.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorkspace } from "../dist/src/index.js";
import { createProjectServer } from "../dist/src/server/http.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..");
const OUT = resolve(HERE, "../ui/src/demo-data.json");

async function main() {
    const workspace = await loadWorkspace({ root: ROOT });
    const server = createProjectServer(workspace);
    await new Promise((done, fail) => {
        server.once("error", fail);
        server.listen(0, "127.0.0.1", done);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (path) => {
        const response = await fetch(`${base}${path}`);
        if (!response.ok)
            throw new Error(`GET ${path} → ${response.status}`);
        return response.json();
    };
    const collect = (path) => request(`${path}?limit=500&offset=0`);
    const data = {
        generatedAt: new Date().toISOString(),
        tasks: await request("/api/tasks"),
        health: await request("/api/health"),
        // The demo exists to show what the project looks like in use, and who
        // is working on what is the part of that nothing else conveys. Without
        // it the presence strip has no claims and hides itself, so the hosted
        // demo silently drops the feature it is meant to advertise.
        activity: await request("/api/v2/activity"),
        docs: await collect("/api/v2/docs"),
        changelog: await collect("/api/v2/changelog"),
        memory: await collect("/api/v2/memory"),
        changelogRender: {
            public: (
                await request("/api/v2/changelog/render?visibility=public")
            ).content,
            internal: (
                await request("/api/v2/changelog/render?visibility=internal")
            ).content
        }
    };
    // The browser demo has no local checkout: hide the build machine's
    // path and point file links at the repository web UI instead.
    data.tasks.repoRoot = "/demo/workfile";
    data.tasks.repoUrl = "https://github.com/illodev/workfile";
    await new Promise((done) => server.close(done));
    await writeFile(OUT, `${JSON.stringify(data, null, 4)}\n`);
    // Presence is the one part of the snapshot that is transient: a build taken
    // at a quiet moment records no claims, and the strip then hides itself, so
    // the hosted demo drops the feature without any build step failing.
    // Inventing a claim is not the answer — the point of replaying the real
    // workspace was to stop showing things that never happened — so say so.
    if (!data.activity.claims.length) {
        console.warn(
            "warning: no card is claimed, so the demo will show no presence.\n" +
                "         Claim one first if the strip should appear:\n" +
                "           workfile card claim T-XXXX --actor agent:claude"
        );
    }
    console.log(
        `demo-data.json written from the real workspace: ` +
            `${data.tasks.tasks.length} cards, ${data.docs.total} docs, ` +
            `${data.activity.claims.length} claims, ` +
            `${data.changelog.total} history, ${data.memory.total} memory records`
    );
}

await main();
