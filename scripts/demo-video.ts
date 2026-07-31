import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { buildScreenshotWorkspace } from "./screenshot-workspace.ts";
import {
    loadWorkspace,
    recordAgentSignal,
    startProjectServer
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

// Installed via init script so an in-tour navigation cannot lose the stage.
const overlay = () => {
    const install = () => {
        if (document.getElementById("demo-stage")) return;
        const app = document.getElementById("root");
        if (!app) {
            setTimeout(install, 30);
            return;
        }

        // The stage: gradient backdrop, a browser-window chrome, and the app
        // scaled into it. Fixed elements inside the app become relative to
        // the transformed content box, which conveniently keeps the app's own
        // overlays (the palette) inside the frame.
        const K = 0.85;
        const stage = document.createElement("div");
        stage.id = "demo-stage";
        stage.innerHTML =
            '<div id="demo-window">' +
            '<div id="demo-topbar">' +
            '<span class="demo-dot" style="background:#FF5F57"></span>' +
            '<span class="demo-dot" style="background:#FEBC2E"></span>' +
            '<span class="demo-dot" style="background:#28C840"></span>' +
            '<span id="demo-url">workfile.illodev.com</span>' +
            "</div>" +
            '<div id="demo-content"><div id="demo-scaler"></div></div>' +
            "</div>";
        const style = document.createElement("style");
        style.textContent = `
            #demo-stage { position: fixed; inset: 0; z-index: 2147483000;
                display: flex; align-items: center; justify-content: center;
                background: radial-gradient(1300px 850px at 68% 12%, #2a3161 0%, #14172a 55%, #0b0d17 100%); }
            #demo-window { border-radius: 14px; overflow: hidden;
                box-shadow: 0 40px 90px -20px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.08);
                transform-origin: 0 0;
                transition: transform 950ms cubic-bezier(.45,0,.18,1); }
            #demo-topbar { height: 38px; background: #E9EAEF; display: flex;
                align-items: center; gap: 8px; padding: 0 14px; position: relative; }
            .demo-dot { width: 12px; height: 12px; border-radius: 50%; }
            #demo-url { position: absolute; left: 50%; transform: translateX(-50%);
                background: #fff; color: #4a4d57; border-radius: 6px;
                font: 500 12.5px/1 system-ui, sans-serif; padding: 6px 40px; }
            #demo-content { width: ${1440 * K}px; height: ${900 * K}px; overflow: hidden; }
            #demo-scaler { width: 1440px; height: 900px;
                transform: scale(${K}); transform-origin: 0 0; }
            @keyframes demo-pulse { from { transform: scale(.5); opacity: .9 }
                to { transform: scale(2); opacity: 0 } }
        `;
        document.head.append(style);
        document.body.append(stage);
        stage.querySelector("#demo-scaler").append(app);

        const cursor = document.createElement("div");
        cursor.id = "demo-cursor";
        cursor.innerHTML =
            '<svg width="26" height="26" viewBox="0 0 24 24">' +
            '<path d="M6.6 2.6 L6.6 18.9 L10.6 15.3 L12.9 20.9 L15.9 19.6 L13.5 14.1 L18.7 13.7 Z" ' +
            'fill="#101321" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        Object.assign(cursor.style, {
            position: "fixed",
            left: "0px",
            top: "0px",
            zIndex: "2147483647",
            pointerEvents: "none",
            transition: "opacity 350ms ease, scale 120ms ease",
            filter: "drop-shadow(0 2px 5px rgba(0,0,0,.5))"
        });
        const caption = document.createElement("div");
        caption.id = "demo-caption";
        Object.assign(caption.style, {
            position: "fixed",
            left: "50%",
            bottom: "26px",
            transform: "translateX(-50%)",
            zIndex: "2147483646",
            pointerEvents: "none",
            background: "rgba(16,19,33,0.9)",
            border: "1px solid rgba(255,255,255,.14)",
            color: "#fff",
            font: "500 17.5px/1.45 system-ui, -apple-system, sans-serif",
            letterSpacing: "-0.01em",
            padding: "11px 22px",
            borderRadius: "12px",
            opacity: "0",
            transition: "opacity 280ms ease",
            maxWidth: "76%",
            textAlign: "center"
        });
        document.body.append(cursor, caption);

        document.addEventListener(
            "mousemove",
            (event) => {
                cursor.style.left = `${event.clientX}px`;
                cursor.style.top = `${event.clientY}px`;
            },
            true
        );
        document.addEventListener(
            "mousedown",
            (event) => {
                cursor.style.scale = "0.82";
                const pulse = document.createElement("div");
                Object.assign(pulse.style, {
                    position: "fixed",
                    left: `${event.clientX - 15}px`,
                    top: `${event.clientY - 15}px`,
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    border: "3px solid #6f86ff",
                    zIndex: "2147483645",
                    pointerEvents: "none",
                    animation: "demo-pulse 480ms ease-out forwards"
                });
                document.body.append(pulse);
                setTimeout(() => pulse.remove(), 520);
            },
            true
        );
        document.addEventListener(
            "mouseup",
            () => {
                cursor.style.scale = "1";
            },
            true
        );

        window.__caption = (text) => {
            caption.style.opacity = "0";
            setTimeout(() => {
                if (text) {
                    caption.textContent = text;
                    caption.style.opacity = "1";
                }
            }, 300);
        };
        window.__cursor = (visible) => {
            cursor.style.opacity = visible ? "1" : "0";
        };
        // Camera: center (tx, ty) — screen coordinates at rest — at scale s.
        const frame = stage.querySelector("#demo-window");
        let rest = null;
        window.__zoomTo = (tx, ty, s) => {
            if (!rest) rest = frame.getBoundingClientRect();
            const dx = innerWidth / 2 - rest.left - s * (tx - rest.left);
            const dy = innerHeight / 2 - rest.top - s * (ty - rest.top);
            frame.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
        };
        window.__zoomOut = () => {
            frame.style.transform = "";
        };
    };
    if (document.body) install();
    else document.addEventListener("DOMContentLoaded", install);
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    recordVideo: { dir: outDir, size: { width: 1440, height: 900 } }
});
const page = await context.newPage();
await page.addInitScript(overlay);

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
    await page.evaluate(() => window.__cursor(true));
}

const snap = (name) => page.screenshot({ path: `${outDir}${name}.png` });

try {
    const nav = page.locator('nav[aria-label="Primary"]');

    // Open on the board.
    await page.goto(`${server.url}/?view=flow`, { waitUntil: "networkidle" });
    await sleep(900);
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

    // The claimed card, then its claim up close.
    await glide(page.getByText(signalCardId, { exact: true }).first(), 500);
    await click();
    await sleep(950);
    const claim = await center(page.getByText("claim", { exact: true }).first());
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
    await page.keyboard.type("watcher", { delay: 120 });
    await sleep(1700);
    await snap("scene5-search");
    await page.keyboard.press("Escape");
    await sleep(400);

    // Close on the Overview. The tour used to end where it began, on Flow,
    // which spent its last shot repeating its first; the verdict line answers
    // a question none of the earlier scenes do, so the call to action lands
    // over a sentence stating the whole project.
    await glide(nav.getByText("Overview", { exact: true }), 250);
    await click();
    await sleep(1100);
    await caption("However many agents are working — one line tells you where it stands", 2600);
    await snap("scene6-overview");
    await punchIn(
        { x: 700, y: 300 },
        1.6,
        "The repository is the database — npx @illodev/workfile init",
        3400
    );
    await snap("scene7-close");
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
