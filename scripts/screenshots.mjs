import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { buildScreenshotWorkspace } from "./screenshot-workspace.mjs";
import {
    loadWorkspace,
    recordAgentSignal,
    startProjectServer
} from "../packages/workfile/dist/src/index.js";

/**
 * Screenshots of every view, in both themes.
 *
 * Migrating a stylesheet of three thousand lines without comparable images is
 * doing it blind: a regression shows up weeks later in a view nobody opened
 * during the change. These are the cheap safety net — and the same images the
 * README needs.
 *
 * The workspace is the deterministic bench fixture rather than a real one, so
 * two runs on different machines produce comparable pictures and nobody's
 * private backlog ends up in a screenshot.
 */
const VIEWS = [
    "explorer",
    "triage",
    "flow",
    "epics",
    "timeline",
    "docs",
    "memory",
    "history",
    "health"
];

const outputDir = fileURLToPath(new URL("../artifacts/screenshots/", import.meta.url));

let chromium;
try {
    ({ chromium } = await import("playwright"));
} catch {
    process.stderr.write(
        "playwright is not installed. Run `pnpm add -D playwright` and " +
            "`pnpm exec playwright install chromium`.\n"
    );
    process.exit(1);
}

const root = fileURLToPath(new URL("../artifacts/screenshot-workspace/", import.meta.url));
// The curated corpus already carries its claims; the session signal is what
// upgrades agent:claude's claim from "held" to visibly live in the frame.
const { signalCardId, inspectCardId } = await buildScreenshotWorkspace(root);
const workspace = await loadWorkspace({ root });
await recordAgentSignal(workspace, {
    sessionId: "session-staged",
    actor: "agent:claude",
    cardId: signalCardId,
    files: ["src/modules/records/index.ts"]
});

const server = await startProjectServer(workspace, { port: 0 });

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
try {
    for (const theme of ["light", "dark"]) {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            deviceScaleFactor: 2,
            colorScheme: theme
        });
        const page = await context.newPage();
        for (const view of VIEWS) {
            await page.goto(`${server.url}/?view=${view}`, {
                waitUntil: "networkidle"
            });
            // Views load on demand, so the first paint may be the fallback.
            await page.waitForSelector(".view-body", {
                timeout: 5000
            }).catch(() => undefined);
            // The inspector answers "who holds this and over what": select
            // the staged card so claim, scope and metadata are in frame.
            if (view === "explorer") {
                await page
                    .getByText(signalCardId, { exact: true })
                    .first()
                    .click()
                    .catch(() => undefined);
                await page.waitForTimeout(300);
            }
            await page.screenshot({
                path: `${outputDir}${view}-${theme}.png`,
                animations: "disabled"
            });
            process.stdout.write(`  ${view}-${theme}.png\n`);
        }
        await context.close();
    }
} finally {
    await browser.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
}

process.stdout.write(`\n${VIEWS.length * 2} screenshots in artifacts/screenshots/\n`);
