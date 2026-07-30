import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { buildScreenshotWorkspace } from "./screenshot-workspace.mjs";
import {
    loadWorkspace,
    recordAgentSignal,
    startProjectServer
} from "../dist/src/index.js";

/**
 * A scripted tour of the interface, recorded as video.
 *
 * Same curated corpus as the screenshots, driven by a staged pointer: video
 * recordings never capture the OS cursor, so one is injected into the page
 * and follows the real mouse events Playwright dispatches. Captions live in
 * the frame because the audience watches muted. The output is the source for
 * launch posts — regenerate it after a redesign the same way the stills are.
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

// Installed via init script so an in-tour navigation cannot lose the pointer.
const overlay = () => {
    const install = () => {
        if (document.getElementById("demo-cursor")) return;
        const cursor = document.createElement("div");
        cursor.id = "demo-cursor";
        cursor.innerHTML =
            '<svg width="22" height="22" viewBox="0 0 24 24">' +
            '<path d="M4 2 L20 13 L13 14 L17 21.5 L14.2 23 L10.5 15.4 L4 20 Z" ' +
            'fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
        Object.assign(cursor.style, {
            position: "fixed",
            left: "0px",
            top: "0px",
            zIndex: "2147483647",
            pointerEvents: "none",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,.45))"
        });
        const caption = document.createElement("div");
        caption.id = "demo-caption";
        Object.assign(caption.style, {
            position: "fixed",
            left: "50%",
            bottom: "30px",
            transform: "translateX(-50%)",
            zIndex: "2147483646",
            pointerEvents: "none",
            background: "rgba(15,17,24,0.92)",
            color: "#fff",
            font: "500 17px/1.45 system-ui, -apple-system, sans-serif",
            letterSpacing: "-0.01em",
            padding: "11px 20px",
            borderRadius: "11px",
            opacity: "0",
            transition: "opacity 280ms ease",
            maxWidth: "78%",
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
                const pulse = document.createElement("div");
                Object.assign(pulse.style, {
                    position: "fixed",
                    left: `${event.clientX - 14}px`,
                    top: `${event.clientY - 14}px`,
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    border: "2.5px solid #3149D4",
                    zIndex: "2147483645",
                    pointerEvents: "none",
                    animation: "demo-pulse 450ms ease-out forwards"
                });
                document.body.append(pulse);
                setTimeout(() => pulse.remove(), 500);
            },
            true
        );
        const style = document.createElement("style");
        style.textContent =
            "@keyframes demo-pulse { from { transform: scale(.5); opacity: .9 } " +
            "to { transform: scale(1.9); opacity: 0 } }";
        document.head.append(style);
        window.__caption = (text) => {
            caption.style.opacity = "0";
            setTimeout(() => {
                caption.textContent = text;
                caption.style.opacity = "1";
            }, 300);
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

async function glide(target, pause = 400) {
    const box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
        steps: 48
    });
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

const snap = (name) =>
    page.screenshot({ path: `${outDir}${name}.png` });

try {
    const nav = page.locator('nav[aria-label="Primary"]');

    // Flow: the board, two live claims in the presence bar.
    await page.goto(`${server.url}/?view=flow`, { waitUntil: "networkidle" });
    await sleep(900);
    await caption(
        "Work, docs, history and memory — versioned Markdown in your repo",
        2800
    );
    await caption(
        "Two agents are on this board right now — claims are part of the protocol",
        500
    );
    await glide(page.getByText(signalCardId, { exact: true }).first(), 700);
    await snap("scene1-flow");
    await click();
    await sleep(1000);
    await caption("An agent holds this card — with an explicit file scope", 2500);
    await snap("scene2-inspector");

    // Timeline: spans and dependency arcs.
    await glide(nav.getByText("Timeline", { exact: true }), 350);
    await click();
    await sleep(1100);
    await caption(
        "Scheduled spans and dependencies, straight from frontmatter",
        800
    );
    await page.mouse.move(980, 540, { steps: 70 });
    await sleep(1600);
    await snap("scene3-timeline");

    // History: fragments and the release button.
    await glide(nav.getByText("History", { exact: true }), 350);
    await click();
    await sleep(1100);
    await caption("Changes are typed fragments — releases cut themselves", 900);
    await glide(page.getByText("Prepare release").first(), 1500);
    await snap("scene4-history");

    // Search: one grammar across every collection.
    await glide(page.locator(".searchbtn"), 300);
    await click();
    await caption("One search across everything", 350);
    await page.keyboard.type("watcher", { delay: 135 });
    await sleep(2000);
    await snap("scene5-search");
    await page.keyboard.press("Escape");
    await sleep(400);

    // Close where it started, with the call to action.
    await glide(nav.getByText("Flow", { exact: true }), 300);
    await click();
    await sleep(900);
    await caption(
        "The repository is the database — npx @illodev/workfile init",
        3400
    );
    await snap("scene6-close");
    await sleep(700);
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
