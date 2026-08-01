import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { buildScreenshotWorkspace } from "./screenshot-workspace.ts";
import {
    loadCards,
    loadWorkspace,
    recordAgentSignal,
    startProjectServer,
    transitionCard
} from "../packages/workfile/dist/src/index.js";

/**
 * A scripted tour of the interface, recorded as video.
 *
 * Same curated corpus as the screenshots, staged like a product film: the app
 * runs inside an injected browser-window frame over a gradient backdrop, a
 * pointer follows the real mouse events Playwright dispatches (recordings
 * never capture the OS cursor), and "camera" pushes are CSS transforms on the
 * framed window — the presence bar with two live agent locks gets the
 * closest shot. Captions live in the frame because launch-post audiences
 * watch muted. Regenerate after a redesign the same way the stills are.
 */

const exec = promisify(execFile);

let chromium;
try {
    ({ chromium } = await import("playwright"));
} catch {
    process.stderr.write("playwright is not installed.\n");
    process.exit(1);
}

const root = fileURLToPath(new URL("../artifacts/demo-workspace/", import.meta.url));
const outDir = fileURLToPath(new URL("../artifacts/demo-video/", import.meta.url));
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const { signalCardId } = await buildScreenshotWorkspace(root);
const workspace = await loadWorkspace({ root });
await recordAgentSignal(workspace, {
    sessionId: "session-staged",
    actor: "agent:claude",
    cardId: signalCardId,
    files: ["src/modules/records/index.ts"]
});
const server = await startProjectServer(workspace, { port: 0 });


/**
 * The controls `demo-stage.mjs` installs on the page.
 *
 * Every `page.evaluate` below runs in the browser, where these exist; this file
 * is typechecked as Node, where `window` does not — so each call site was an
 * unresolved name the strict ratchet had written down and stopped looking at.
 * Declaring the handle with real signatures rather than reaching for `any`
 * turns them back into checked calls: a wrong argument to `__zoomTo` now fails
 * the build instead of failing the recording two minutes in.
 */
declare const window: {
    __caption(text: string): void;
    __cursor(visible: boolean): void;
    __cursorRestore(): void;
    __zoomTo(x: number, y: number, scale: number): void;
    __zoomOut(): void;
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    // English months, same reason as the stills: the app formats through
    // `Intl` with no locale, so an August capture on a Spanish machine wrote
    // "1 ago" into the trail — which reads as a word, not a date.
    locale: "en-US",
    recordVideo: { dir: outDir, size: { width: 1440, height: 900 } }
});
const page = await context.newPage();
await page.addInitScript({
    path: fileURLToPath(new URL("./demo-stage.mjs", import.meta.url))
});

async function center(target) {
    const box = await target.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function glide(target, pause = 350) {
    const { x, y } = await center(target);
    await page.mouse.move(x, y, { steps: 52 });
    await sleep(pause);
}

async function click() {
    await page.mouse.down();
    await page.mouse.up();
}

async function caption(text, hold = 0) {
    await page.evaluate((value) => window.__caption(value), text);
    if (hold) await sleep(hold);
}

// A camera push: the pointer steps out of frame, the window drives in on the
// target, the caption lands, and the shot pulls back before the next action.
async function punchIn(point, scale, text, hold) {
    await page.evaluate(() => window.__cursor(false));
    await page.evaluate(
        ({ x, y, s }) => window.__zoomTo(x, y, s),
        { x: point.x, y: point.y, s: scale }
    );
    await sleep(1050);
    if (text) await caption(text, hold);
    await page.evaluate(() => {
        window.__caption("");
        window.__zoomOut();
    });
    await sleep(1050);
    await page.evaluate(() => window.__cursorRestore());
}

/**
 * A push that stays in, so something can happen while the camera holds.
 *
 * `punchIn` is a statement: drive in, read the caption, pull back. This one is
 * a scene — each beat gets its caption and then runs, and the shot does not
 * move until every beat has landed.
 */
async function punchHold(point, scale, beats) {
    await page.evaluate(() => window.__cursor(false));
    await page.evaluate(
        ({ x, y, s }) => window.__zoomTo(x, y, s),
        { x: point.x, y: point.y, s: scale }
    );
    await sleep(1050);
    for (const beat of beats) {
        if (beat.text) await caption(beat.text, beat.settle ?? 900);
        if (beat.run) await beat.run();
        await sleep(beat.hold ?? 1600);
    }
    await page.evaluate(() => {
        window.__caption("");
        window.__zoomOut();
    });
    await sleep(1050);
    await page.evaluate(() => window.__cursorRestore());
}

/**
 * Moves a card in the workspace the server is already serving.
 *
 * The point of the beat is that nothing is faked: this writes Markdown to
 * disk, the watcher notices, `/api/v2/events` pushes, and the shell reloads
 * its cards. Whoever holds the claim is the actor, because transitioning a
 * card claimed by somebody else is exactly what the ownership guard refuses.
 */
async function move(id, status) {
    const { cards } = await loadCards(workspace);
    const card = cards.find((entry) => entry.id === id);
    await transitionCard(workspace, id, status, {
        actor: card?.claimed_by || "agent:claude"
    });
}

const snap = (name) => page.screenshot({ path: `${outDir}${name}.png` });

try {
    const nav = page.locator('nav[aria-label="Primary"]');

    // Open on the board.
    await page.goto(`${server.url}/?view=flow`, { waitUntil: "networkidle" });
    await sleep(900);
    // Park the pointer somewhere plausible before it is ever visible. Playwright
    // starts its mouse at 0,0, so without this the first glide sweeps in from
    // the corner of the screen instead of starting from rest.
    await page.mouse.move(880, 660);
    await caption(
        "Work, docs, history and memory — versioned Markdown in your repo",
        2500
    );

    // The essential shot: two agents holding scoped locks, live.
    const presence = await center(page.getByText("agent:claude").last());
    await snap("scene1-flow");
    await punchIn(
        { x: presence.x + 210, y: presence.y - 80 },
        2.2,
        "Two agents are working right now — each holding a file-scope lock",
        3000
    );

    // The claimed card, then its claim up close. The pointer fades in here, at
    // the rest position seeded above, rather than appearing at the corner.
    await page.evaluate(() => window.__cursor(true));
    await sleep(420);
    await glide(page.getByText(signalCardId, { exact: true }).first(), 500);
    await click();
    // Wait for the drawer rather than a fixed sleep, and read the claim from
    // inside it: an unscoped `getByText("claim")` also matches the presence
    // strip along the footer, which is where the camera was aiming when the
    // inspector was invisible and nobody could tell the difference.
    const inspector = page.locator('[aria-label="Inspector"]');
    await inspector.waitFor({ state: "visible", timeout: 10_000 });
    await sleep(950);
    const claim = await center(inspector.getByText(/^claim$/i).first());
    await snap("scene2-inspector");
    await punchIn(
        { x: claim.x + 90, y: claim.y + 30 },
        2.1,
        "An agent holds this card — explicit scope, live session",
        2700
    );

    // Timeline, with a lighter push over the arcs.
    await glide(nav.getByText("Timeline", { exact: true }), 300);
    await click();
    await sleep(1000);
    await snap("scene3-timeline");
    await punchIn(
        { x: 760, y: 480 },
        1.45,
        "Scheduled spans and dependencies, straight from frontmatter",
        2400
    );

    // History: fragments become releases.
    await glide(nav.getByText("History", { exact: true }), 300);
    await click();
    await sleep(1000);
    const release = await center(page.getByText("Prepare release").first());
    await snap("scene4-history");
    await punchIn(
        { x: release.x, y: release.y + 20 },
        1.9,
        "Changes are typed fragments — releases cut themselves",
        2500
    );

    // One search across every collection. The trigger is the outline Button
    // whose label reads "Search N records…" (shadcn shell, ADR-0005).
    await glide(page.getByRole("button", { name: /Search .*records/ }), 250);
    await click();
    await caption("One search across everything", 300);
    // Typed into the located input rather than at whatever holds focus. The
    // palette autofocuses itself, but the stage moves its portal into the
    // frame a tick later, and a bare `keyboard.type` was landing in the gap.
    const query = page.locator("[data-slot=command-input]");
    await query.waitFor({ state: "visible", timeout: 10_000 });
    await query.pressSequentially("watcher", { delay: 120 });
    await sleep(1700);
    await snap("scene5-search");
    await page.keyboard.press("Escape");
    await sleep(600);

    // Close on the Overview. The tour used to end where it began, on Flow,
    // which spent its last shot repeating its first; the verdict line answers
    // a question none of the earlier scenes do, so the call to action lands
    // over a sentence stating the whole project.
    await glide(nav.getByText("Overview", { exact: true }), 250);
    await click();
    await sleep(1100);
    await caption("However many agents are working — one line tells you where it stands", 2600);
    await snap("scene6-overview");

    /*
     * The live beat, and the only scene where the app is not merely displayed.
     *
     * Cards move on disk while the camera holds, and the sentence rewrites
     * itself. The verdict is a strict ladder, worst first, so the mutations
     * have to clear the worst thing on the board or nothing visible happens:
     * two blocked cards outrank everything, and unblocking them one at a time
     * walks the headline down a rung per beat. The last move closes a card in
     * review, which is what makes the counters tick as well as the prose.
     */
    const { cards } = await loadCards(workspace);
    const stuck = cards
        .filter((card) => card.status === "blocked" && !card.archived)
        .map((card) => card.id);
    const finishing = cards.find(
        (card) => card.status === "review" && !card.archived
    )?.id;
    /*
     * Frame the sentence and the counters together, measured rather than
     * guessed. Both change during the beat and both have to be legible: the
     * first attempt centred on the paragraph, which put its own left edge and
     * the whole "open" tile outside the shot. The scale is whatever fits the
     * union with a margin, capped so the push still reads as a push.
     */
    const sentence = await page
        .locator("p")
        .filter({ hasText: /blocked|in flight|board is clean/ })
        .first()
        .boundingBox();
    const tiles = page.locator("[data-slot=card]");
    const firstTile = await tiles.first().boundingBox();
    const lastTile = await tiles.nth(2).boundingBox();
    const left = Math.min(sentence.x, firstTile.x);
    const right = lastTile.x + lastTile.width;
    const focus = {
        x: (left + right) / 2,
        y: (sentence.y + lastTile.y + lastTile.height) / 2
    };
    const push = Math.min(1.5, (1440 * 0.9) / (right - left));
    await punchHold(focus, push, [
        {
            text: "Nothing here is polled — an agent moves a card",
            run: () => move(stuck[0], "next"),
            hold: 2100
        },
        {
            text: "and the board rewrites the sentence, live",
            run: () => move(stuck[1], "next"),
            hold: 2300
        },
        {
            text: "One less open. The trail keeps the receipt.",
            run: () => (finishing ? move(finishing, "done") : undefined),
            hold: 2600
        }
    ]);
    await snap("scene7-live");

    await punchIn(
        { x: 700, y: 300 },
        1.6,
        "The repository is the database — npx @illodev/workfile init",
        3400
    );
    await snap("scene8-close");
    await sleep(600);
} finally {
    const video = page.video();
    await page.close();
    await context.close();
    const webm = await video.path();
    await browser.close();
    await server.close();
    await rm(root, { recursive: true, force: true });

    // LinkedIn wants H.264; the recording is VP8. yuv420p and faststart keep
    // every player and the feed's transcoder happy.
    await exec("ffmpeg", [
        "-y",
        "-i",
        webm,
        "-c:v",
        "libx264",
        "-crf",
        "20",
        "-preset",
        "slow",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        `${outDir}workfile-demo.mp4`
    ]);
    const { stdout } = await exec("ffprobe", [
        "-v",
        "quiet",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        `${outDir}workfile-demo.mp4`
    ]);
    process.stdout.write(
        `demo video: ${outDir}workfile-demo.mp4 (${Number(stdout).toFixed(1)}s)\n`
    );
}
