/**
 * The demo stage, authored as browser code because that is what it is.
 *
 * This used to live inside `demo-video.ts` as a function handed to
 * `addInitScript`. It never ran in Node, but it was typechecked as Node — so
 * every `document` in it was an unresolved name, and the strict ratchet had
 * thirty-two of them written down as permanent debt it would never read again.
 * That is also how a real defect hid in here: the stage buried every overlay
 * the app portals to `document.body`, and no check could have said so.
 *
 * Loaded by path rather than imported, following `src/runtime/claude/hooks.mjs`
 * — a file the package ships and deliberately keeps out of the TypeScript
 * program, for the same reason.
 */
(() => {
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
            // Hidden until it has somewhere to be. The element is created at
            // 0,0 and only moves when Playwright dispatches its first
            // mousemove, which is three scenes in — so it used to sit pinned
            // to the top-left corner through the whole opening.
            opacity: "0",
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

        /*
         * Radix portals every overlay to `document.body` — the inspector sheet,
         * the command palette — and `document.body` is outside the stage. The
         * stage is a fixed, opaque layer at z-index 2147483000, so a portal's
         * `z-50` paints underneath it and the overlay is not hidden so much as
         * buried: the film showed a breadcrumb reading `cards / T-0028` with no
         * inspector on screen, and a "one search across everything" caption
         * over a search that was never visible. Both were recorded, shipped and
         * watched without anyone noticing that the frame was simply missing its
         * subject.
         *
         * Moving each portal into the scaler puts it back inside the browser
         * window, where its `position: fixed` resolves against the transformed
         * box exactly as the app's own layout does. Installed after the cursor
         * and caption are attached, and still guarded, because those two are
         * body-level on purpose — they belong above the frame, not inside it.
         */
        const scaler = stage.querySelector("#demo-scaler");

        /*
         * React removes a portal from the container it was given, not from
         * wherever the node ended up. Relocating one therefore makes its
         * unmount call `body.removeChild(node)` on a node body no longer owns,
         * which throws inside React's cleanup and takes the tree with it —
         * closing the palette left the app dead and the nav unreachable.
         *
         * Making the removal tolerant is the standard repair for this, and it
         * belongs here rather than in the app: relocating the portal is the
         * stage's lie, so the stage pays for it.
         */
        const detach = Node.prototype.removeChild;
        Node.prototype.removeChild = function (child) {
            if (child && child.parentNode && child.parentNode !== this) {
                return detach.call(child.parentNode, child);
            }
            return detach.call(this, child);
        };

        new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (node === stage || node === cursor || node === caption)
                        continue;
                    // Re-parenting blurs whatever the moved subtree had
                    // focused, and these overlays autofocus on purpose — the
                    // palette put its caret in the search box and the move
                    // took it back out, so the tour typed into nothing.
                    const focused = document.activeElement;
                    scaler.append(node);
                    if (focused && node.contains(focused)) focused.focus();
                }
            }
        }).observe(document.body, { childList: true });

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
        // `__cursor(true)` arms the pointer for the rest of the tour; a camera
        // push hides it and asks for it back with `__cursorRestore`, which
        // stays silent until the tour has armed it. Without the distinction the
        // first push would end by revealing a pointer that has never moved.
        let armed = false;
        window.__cursor = (visible) => {
            if (visible) armed = true;
            cursor.style.opacity = visible ? "1" : "0";
        };
        window.__cursorRestore = () => {
            if (armed) cursor.style.opacity = "1";
        };
        /*
         * Camera: centre (tx, ty) — screen coordinates at rest — at scale s.
         *
         * Clamped so the pushed frame always covers the screen. Centring on a
         * point near an edge used to slide the window off it and fill the rest
         * with backdrop, which is how a shot ended up holding on empty gradient
         * with a caption over it. A target that cannot be centred is now framed
         * as close as the edge allows, so the worst case is an off-centre
         * subject rather than no subject at all.
         */
        const frame = stage.querySelector("#demo-window");
        let rest = null;
        const clamp = (value, low, high) =>
            low > high
                ? (low + high) / 2
                : Math.min(Math.max(value, low), high);
        window.__zoomTo = (tx, ty, s) => {
            if (!rest) rest = frame.getBoundingClientRect();
            const dx = innerWidth / 2 - rest.left - s * (tx - rest.left);
            const dy = innerHeight / 2 - rest.top - s * (ty - rest.top);
            frame.style.transform = `translate(${clamp(
                dx,
                innerWidth - rest.left - s * rest.width,
                -rest.left
            )}px, ${clamp(
                dy,
                innerHeight - rest.top - s * rest.height,
                -rest.top
            )}px) scale(${s})`;
        };
        window.__zoomOut = () => {
            frame.style.transform = "";
        };
    };
    if (document.body) install();
    else document.addEventListener("DOMContentLoaded", install);
})();
