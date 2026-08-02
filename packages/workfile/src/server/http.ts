import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildAgentContext,
    checkAgentInstructions,
    syncAgentInstructions
} from "../modules/agents/index.js";
import { checkCiTemplates, syncCiTemplates } from "../modules/ci/index.js";

import {
    archiveCard,
    buildActivitySnapshot,
    bulkPatchCards,
    claimCard,
    createCard,
    loadCards,
    patchCard,
    reopenCard,
    transitionCard
} from "../modules/cards/index.js";
import {
    createManagedDocument,
    patchManagedDocument
} from "../modules/docs/index.js";
import {
    createChangeFragment,
    createRelease,
    patchChangeFragment,
    previewRelease,
    renderChangelog,
    writeRenderedChangelog
} from "../modules/changelog/index.js";
import {
    createMemoryRecord,
    graduateLearning,
    patchMemoryRecord,
    supersedeMemoryRecord
} from "../modules/memory/index.js";
import {
    createProjectIndexStore,
    findProjectRecord,
    recordFromCard,
    recordFromChange,
    recordFromDocument,
    recordFromMemory,
    recordFromRelease,
    searchProjectRecords
} from "../modules/records/public.js";
import { resolveActor } from "../core/actor.js";
import { runDoctor } from "../modules/health/doctor.js";
import { searchProjectRecordsHybrid } from "../modules/search/index.js";
import { createIntegrationRegistry } from "../modules/integrations/registry.js";
import { inspectMcpServer, mcpClientConfiguration } from "../modules/mcp/index.js";
import {
    ForbiddenError,
    NotFoundError,
    UnsupportedMediaTypeError,
    ValidationError,
    normalizeError
} from "../core/errors.js";
import { ensureWritable } from "../core/guards.js";
import { createWorkspaceWatcher } from "../core/watcher.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_UI_DIR = resolve(HERE, "../../ui");
const MIME = {
    html: "text/html; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain; charset=utf-8",
    md: "text/plain; charset=utf-8",
    csv: "text/csv; charset=utf-8",
    zip: "application/zip",
    // Font formats the UI bundle can reference. Served without one, a browser
    // gets `application/octet-stream`, refuses the font, and falls back to a
    // system face — a silent visual regression with nothing in the console.
    woff2: "font/woff2",
    woff: "font/woff"
};

// Types served inline from /assets/*. Everything else is downloaded as an
// opaque attachment: `text/html` and `image/svg+xml` both execute script in
// the very origin that serves the API, so an uploaded attachment would be
// stored XSS with full read and write access to the workspace.
const INLINE_ASSET_TYPES = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "pdf",
    "txt",
    "md",
    "csv"
]);

// Extensions refused at upload time. Blocking them at rest as well as at
// serve time means a future change to the serving rules cannot resurrect the
// vector on files that are already on disk.
const ACTIVE_ASSET_TYPES = new Set([
    "html",
    "htm",
    "xhtml",
    "xml",
    "svg",
    "js",
    "mjs",
    "cjs",
    "wasm"
]);

function extension(path) {
    return path.includes(".") ? path.split(".").pop().toLowerCase() : "";
}

// Below this, framing and the compressor's own header cost more than they save.
const COMPRESSION_THRESHOLD = 1_400;

function negotiatedEncoding(request) {
    const accepted = String(request?.headers?.["accept-encoding"] || "");
    // gzip only. Brotli compresses ~14% better on this JSON but costs roughly
    // an order of magnitude more CPU, and this server has one thread.
    return /\bgzip\b/.test(accepted) ? "gzip" : null;
}

function sendJson(response, status, payload, headers = {}, request = null) {
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const encoding =
        body.length >= COMPRESSION_THRESHOLD ? negotiatedEncoding(request) : null;
    const finalBody = encoding ? gzipSync(body) : body;
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        // `no-store` forbade even revalidation, so a poll could never answer
        // 304. `no-cache` still requires a round trip but allows the response
        // body to be skipped when nothing changed.
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": finalBody.length,
        ...(encoding ? { "Content-Encoding": encoding, Vary: "Accept-Encoding" } : {}),
        ...headers
    });
    response.end(finalBody);
}

/**
 * Answers 304 when the client already holds this exact representation.
 *
 * ETags were emitted on fourteen routes and `If-None-Match` was read on none,
 * so the header was decoration. Returns true when the response has been sent.
 */
function notModified(request, response, etag, headers = {}) {
    const provided = String(request?.headers?.["if-none-match"] || "");
    if (!provided || !etag) return false;
    const matches = provided
        .split(",")
        .map((value) => value.trim().replace(/^W\//, ""))
        .includes(etag);
    if (!matches) return false;
    response.writeHead(304, {
        ETag: etag,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        ...headers
    });
    response.end();
    return true;
}

/** A stable ETag for a collection: its size and the revisions it contains. */
function collectionEtag(records) {
    const hash = createHash("sha256");
    hash.update(String(records.length));
    for (const record of records) {
        hash.update("\u0000");
        hash.update(String(record.id));
        hash.update(String(record.revision || ""));
    }
    return `"${hash.digest("hex").slice(0, 32)}"`;
}

function sendBuffer(response, status, buffer, contentType, headers = {}) {
    response.writeHead(status, {
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": buffer.length,
        "X-Content-Type-Options": "nosniff",
        ...headers
    });
    response.end(buffer);
}

function sendError(response, error) {
    const normalized = normalizeError(error);
    sendJson(response, normalized.status, {
        error: {
            code: normalized.code,
            message: normalized.message,
            ...(normalized.details ? { details: normalized.details } : {})
        }
    });
}

async function readRaw(request, { limit = 1_048_576 }: any = {}) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > limit) {
            throw new ValidationError(
                "REQUEST_BODY_TOO_LARGE",
                `Request body exceeds ${limit} bytes.`
            );
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function readJson(request, options: any = {}): Promise<any> {
    const buffer = await readRaw(request, options);
    if (!buffer.length) return {};
    try {
        return JSON.parse(buffer.toString("utf8"));
    } catch {
        throw new ValidationError("REQUEST_JSON_INVALID", "Invalid JSON request body.");
    }
}

function cleanRevision(value) {
    if (!value) return undefined;
    return String(value).replace(/^W\//, "").replace(/^"|"$/g, "");
}

function expectedRevision(request, body: any = {}) {
    return cleanRevision(request.headers["if-match"]) || body.expectedRevision;
}

function integerQuery(value, { fallback, min = 0, max = Number.MAX_SAFE_INTEGER }) {
    if (value == null || value === "") return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
        throw new ValidationError(
            "REQUEST_QUERY_INVALID",
            `Expected an integer query value, received: ${value}`
        );
    }
    return Math.min(max, Math.max(min, parsed));
}


/**
 * Reads `?view=` and `?fields=` for a listing.
 *
 * `full` stays the default on purpose. The Docs, Memory and History panels all
 * render `active.body` out of the array that feeds their *list* — they never
 * fetch the individual record — so flipping the default would blank three
 * detail views. Callers that want the cheap shape ask for it; the default
 * changes once those panels fetch what they display.
 */
function projectionFrom(url) {
    const view = url.searchParams.get("view") || "full";
    if (!["full", "summary", "list"].includes(view)) {
        throw new ValidationError(
            "REQUEST_QUERY_INVALID",
            `Unknown view: ${view}. Expected full, summary or list.`
        );
    }
    const fields = url.searchParams.get("fields");
    return {
        view,
        fields: fields
            ? fields.split(",").map((field) => field.trim()).filter(Boolean)
            : null
    };
}

/**
 * Server-sent events, not WebSocket.
 *
 * The flow is one-way: mutations already have REST routes with `If-Match`, so
 * a duplex channel buys nothing and `ws` would be the package's first runtime
 * dependency. `EventSource` reconnects on its own and carries `Last-Event-ID`,
 * which is what makes catch-up possible without inventing a protocol.
 */
function createEventHub({ bufferSize = 512 } = {}) {
    const clients = new Set<any>();
    const buffer = [];
    let nextId = 1;
    const serverId = createHash("sha256")
        .update(String(process.pid))
        .update(String(Date.now()))
        .digest("hex")
        .slice(0, 16);

    function write(response, event) {
        // Back-pressure: a client that cannot keep up is dropped rather than
        // allowed to grow an unbounded socket buffer in the server.
        if (response.writableLength > 1_000_000) {
            clients.delete(response);
            response.end();
            return;
        }
        response.write(
            `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
        );
    }

    return {
        serverId,
        get size() {
            return clients.size;
        },
        publish(type, data) {
            const event = { id: nextId++, type, data };
            buffer.push(event);
            if (buffer.length > bufferSize) buffer.shift();
            for (const response of [...clients]) write(response, event);
        },
        subscribe(request, response) {
            response.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
                // Proxies that buffer would defeat the entire point.
                "X-Accel-Buffering": "no",
                "X-Content-Type-Options": "nosniff"
            });
            response.flushHeaders?.();
            clients.add(response);

            // `hello` first, so a client can tell a reconnection to the same
            // process from one to a restarted process whose ids began again.
            response.write(
                `event: hello\ndata: ${JSON.stringify({ serverId, lastEventId: nextId - 1 })}\n\n`
            );

            const since = Number(request.headers["last-event-id"]);
            if (Number.isInteger(since)) {
                const missed = buffer.filter((event) => event.id > since);
                // Falling off the ring buffer means the client cannot be caught
                // up event by event, so it is told to resynchronize instead.
                if (missed.length < buffer.length && since < (buffer[0]?.id ?? 1) - 1) {
                    write(response, {
                        id: nextId - 1,
                        type: "sync.reset",
                        data: { reason: "cursor-too-old" }
                    });
                } else {
                    for (const event of missed) write(response, event);
                }
            }

            const heartbeat = setInterval(() => {
                // An SSE comment: keeps intermediaries from timing the
                // connection out without producing an event for the client.
                if (clients.has(response)) response.write(": ping\n\n");
            }, 25_000);
            heartbeat.unref?.();

            const close = () => {
                clearInterval(heartbeat);
                clients.delete(response);
            };
            request.on("close", close);
            response.on("error", close);
        },
        closeAll() {
            for (const response of clients) response.end();
            clients.clear();
        }
    };
}

/**
 * Request logging, off unless asked for.
 *
 * There was not one `console.*` in the whole server, and `sendError` reported a
 * code to the client while discarding the stack — so when the interface showed
 * an error there was nothing anywhere to diagnose it from. That matters more
 * now that responses can outlive a round trip and latency is something the
 * project makes claims about.
 */
function createRequestLog({ enabled }) {
    const counters = new Map();
    const durations = [];
    return {
        get enabled() {
            return enabled;
        },
        record(request, response, startedAt, bytes) {
            const ms = Number((performance.now() - startedAt).toFixed(1));
            const route = `${request.method} ${String(request.url || "/").split("?")[0]}`;
            counters.set(route, (counters.get(route) || 0) + 1);
            // A bounded window: enough for a percentile, never a memory leak.
            durations.push(ms);
            if (durations.length > 1000) durations.shift();
            if (enabled) {
                process.stderr.write(
                    `${route} ${response.statusCode} ${ms}ms ${bytes ?? "-"}b\n`
                );
            }
        },
        fault(error) {
            // The stack is the point: a 5xx with only a code is a dead end.
            process.stderr.write(
                `project server fault: ${error?.stack || error?.message || error}\n`
            );
        },
        snapshot() {
            const sorted = [...durations].sort((left, right) => left - right);
            const at = (fraction) =>
                sorted.length
                    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
                    : 0;
            return {
                requests: [...counters].map(([route, count]) => ({ route, count })),
                total: [...counters.values()].reduce((sum, count) => sum + count, 0),
                latencyMs: { p50: at(0.5), p95: at(0.95) },
                sampled: sorted.length
            };
        }
    };
}

function workspacePayload(workspace) {
    return {
        name: workspace.config.name,
        root: workspace.root,
        readOnly: workspace.readOnly,
        // The runtime schema rides along: it is small, it is static for the
        // life of the process, and including it means a client boots in two
        // requests instead of three.
        schema: workspace.schema,
        schemaVersion: workspace.schema.schemaVersion,
        version: workspace.version,
        modules: workspace.schema.modules,
        agents: { targets: workspace.config.agents.targets },
        ci: { targets: workspace.config.ci.targets }
    };
}

async function getUniqueCard(workspace, id) {
    const { cards } = await loadCards(workspace);
    const matches = cards.filter((card) => card.id === id);
    if (!matches.length) {
        throw new NotFoundError("CARD_NOT_FOUND", `Card not found: ${id}`);
    }
    if (matches.length > 1) {
        throw new ValidationError(
            "CARD_ID_AMBIGUOUS",
            `Card ID ${id} appears in multiple files.`,
            { files: matches.map((card) => card.file) }
        );
    }
    return matches[0];
}

function v2CardRoute(pathname) {
    return pathname.match(
        /^\/api\/v2\/cards\/([A-Z][A-Z0-9]{0,7}-\d{4,})(?:\/(claim|transition|archive|reopen))?$/
    );
}

function legacyCardRoute(pathname) {
    return pathname.match(
        /^\/api\/tasks\/([A-Z][A-Z0-9]{0,7}-\d{4,})(?:\/(archive|unarchive|assets))?$/
    );
}

async function compatibilityPatch(workspace, id, changes, options: any = {}) {
    const current = await getUniqueCard(workspace, id);
    if (changes.status === "doing") {
        return transitionCard(workspace, id, "doing", {
            actor: changes.claimed_by || current.claimed_by || "ui-local",
            scope: changes.scope,
            expectedRevision: options.expectedRevision
        });
    }
    const normalized = { ...changes };
    if (
        normalized.status &&
        normalized.status !== "doing" &&
        (current.claimed_by || current.claimed_at)
    ) {
        normalized.claimed_by = null;
        normalized.claimed_at = null;
    }
    return patchCard(workspace, id, normalized, options);
}

async function serveUi(response, uiDir, path) {
    try {
        const buffer = await readFile(path);
        sendBuffer(
            response,
            200,
            buffer,
            MIME[extension(path)] || "application/octet-stream",
            { "Cache-Control": path.includes("/static/") ? "no-cache" : "no-store" }
        );
        return true;
    } catch (error: any) {
        // "The UI is not built" and "the UI is built but unreadable" produce
        // the same fallback, and the second one is a bug. ENOENT is the
        // expected case and stays quiet; anything else is worth knowing about.
        if (error?.code !== "ENOENT" || process.env.PROJECT_LOG) {
            process.emitWarning(
                `serveUi could not read ${path}: ${error?.code || error?.message}`
            );
        }
        return false;
    }
}

function decodePathSegment(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        throw new ValidationError(
            "REQUEST_PATH_INVALID",
            "URL path contains invalid percent encoding."
        );
    }
}

function sanitizeAssetName(value) {
    const name = basename(String(value || "")).replace(/[^\w.\-()\[\] ]+/g, "_");
    return name && !name.startsWith(".") ? name : null;
}

const LOOPBACK_HOSTS = Object.freeze(["127.0.0.1", "localhost", "::1"]);

/** Strips brackets and the port from a Host or Origin authority. */
function hostnameOf(authority) {
    const value = String(authority || "").trim();
    if (!value) return "";
    const bracketed = value.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (bracketed) return bracketed[1].toLowerCase();
    return value.split(":")[0].toLowerCase();
}

function portOf(authority) {
    const value = String(authority || "").trim();
    const bracketed = value.match(/^\[[^\]]+\](?::(\d+))?$/);
    if (bracketed) return bracketed[1] || "";
    const parts = value.split(":");
    return parts.length === 2 ? parts[1] : "";
}

/**
 * Cross-origin and rebinding guard, applied before routing.
 *
 * The server holds unauthenticated read and write access to the repository, so
 * the browser's own origin rules are the entire security model — and three
 * gaps made them not apply:
 *
 *  - `Host` was discarded when building the URL, so DNS rebinding put an
 *    attacker page on the same origin and let it *read* every record.
 *  - `Origin` and `Sec-Fetch-Site` were never inspected, so any page could
 *    POST blind.
 *  - `readJson` ignored `Content-Type`, so mutations qualified as CORS
 *    "simple requests" and skipped preflight entirely.
 *
 * Non-browser clients are unaffected: curl sends no Origin and no
 * Sec-Fetch-Site, and its Host is the loopback address it dialled.
 */
function assertRequestAllowed(request, url, allowedHosts) {
    const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
    const forbidden = (message) => {
        throw new ForbiddenError("REQUEST_ORIGIN_FORBIDDEN", message);
    };

    if (!allowed.has("*")) {
        const host = request.headers.host;
        if (!host) {
            forbidden("Requests must carry a Host header.");
        }
        if (!allowed.has(hostnameOf(host))) {
            forbidden(
                `Host ${hostnameOf(host)} is not allowed; the server answers only to ${[...allowed].join(", ")}.`
            );
        }
        const port = portOf(host);
        const bound = request.socket?.localPort;
        if (port && bound && Number(port) !== bound) {
            forbidden("The Host header port does not match the listening port.");
        }

        const site = request.headers["sec-fetch-site"];
        if (site && site !== "same-origin" && site !== "none") {
            forbidden(`Cross-origin requests are refused (Sec-Fetch-Site: ${site}).`);
        }

        const origin = request.headers.origin;
        if (origin && origin !== "null") {
            let originHost = "";
            try {
                originHost = new URL(origin).hostname.toLowerCase();
            } catch {
                forbidden("Malformed Origin header.");
            }
            if (!allowed.has(originHost.replace(/^\[|\]$/g, ""))) {
                forbidden(`Origin ${origin} is not allowed.`);
            }
        }
    }

    // Mutations must not be CORS-simple. `application/json` and binary upload
    // types both force a preflight, which this server never answers.
    if (request.method && MUTATING_METHODS.has(request.method)) {
        const type = String(request.headers["content-type"] || "")
            .split(";")[0]
            .trim()
            .toLowerCase();
        if (SIMPLE_REQUEST_TYPES.has(type) || !type) {
            throw new UnsupportedMediaTypeError(
                "REQUEST_CONTENT_TYPE_INVALID",
                `Mutations require an explicit Content-Type (application/json for the JSON API); received ${type || "none"}.`
            );
        }
    }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SIMPLE_REQUEST_TYPES = new Set([
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data"
]);

export function createProjectServer(
    workspace,
    { uiDir = DEFAULT_UI_DIR, allowedHosts, ...options }: any = {}
) {
    const indexStore = createProjectIndexStore(workspace);
    // Resolved once: integrations come from project.config.mjs, and a config
    // change already requires restarting the server to be seen.
    const searchProvider = createIntegrationRegistry(
        workspace.integrations || []
    ).semanticSearchProvider(workspace.config.search.provider || undefined);
    const events = createEventHub();
    // The filesystem is the bus. The CLI and the MCP server write files and the
    // watcher sees them, exactly as it sees git, an editor or another agent —
    // an IPC channel between our own processes would miss all three.
    const watcher = createWorkspaceWatcher(workspace, {
        onChange(change) {
            indexStore.invalidate();
            events.publish(
                change.type === "reset" ? "sync.reset" : "records.changed",
                {
                    epoch: indexStore.epoch,
                    count: change.count,
                    paths: change.paths
                }
            );
            // Claims live in card frontmatter, so any card write may have
            // changed who is working on what.
            if (
                change.type === "reset" ||
                change.paths.some((path) => path.includes("/cards/"))
            ) {
                events.publish("activity.changed", { epoch: indexStore.epoch });
            }
        }
    });
    // Started on the first subscriber, not at boot. The watcher exists to
    // *push*; freshness is already guaranteed by the index revalidating against
    // the filesystem, so a server nobody is streaming from has no reason to
    // hold hundreds of watch descriptors.
    let watching = null;
    const ensureWatching = () => {
        if (!watching) watching = watcher.start();
        return watching;
    };
    const hosts =
        allowedHosts && allowedHosts.length
            ? [...allowedHosts]
            : [...LOOPBACK_HOSTS];
    const log = createRequestLog({
        enabled: Boolean(options.verbose || process.env.PROJECT_LOG)
    });
    const server = createServer(async (request, response) => {
        const startedAt = performance.now();
        response.on("finish", () =>
            log.record(request, response, startedAt, response.getHeader("content-length"))
        );
        try {
            const url = new URL(request.url || "/", "http://project.local");
            const method = request.method || "GET";
            assertRequestAllowed(request, url, hosts);

            if (
                method === "GET" &&
                (url.pathname === "/" || url.pathname === "/index.html")
            ) {
                if (await serveUi(response, uiDir, join(uiDir, "index.html"))) {
                    return;
                }
                return sendJson(response, 200, {
                    name: "Workfile",
                    api: "/api/v2",
                    workspace: workspacePayload(workspace),
                    ui: "not-built"
                });
            }

            const staticAsset = url.pathname.match(/^\/static\/([^/]+)$/);
            if (method === "GET" && staticAsset && !staticAsset[1].includes("..")) {
                if (
                    await serveUi(
                        response,
                        uiDir,
                        join(uiDir, "static", staticAsset[1])
                    )
                ) {
                    return;
                }
                throw new NotFoundError("UI_ASSET_NOT_FOUND", "UI asset not found.");
            }

            const cardAsset = url.pathname.match(
                /^\/assets\/([A-Z][A-Z0-9]{0,7}-\d{4,})\/([^/]+)$/
            );
            if (method === "GET" && cardAsset && !cardAsset[2].includes("..")) {
                const name = sanitizeAssetName(decodePathSegment(cardAsset[2]));
                if (!name) {
                    throw new ValidationError("ASSET_NAME_INVALID", "Invalid asset name.");
                }
                try {
                    const buffer = await readFile(
                        join(workspace.paths.assets, cardAsset[1], name)
                    );
                    const type = extension(name);
                    const inline = INLINE_ASSET_TYPES.has(type);
                    return sendBuffer(
                        response,
                        200,
                        buffer,
                        inline
                            ? MIME[type] || "application/octet-stream"
                            : "application/octet-stream",
                        {
                            "Content-Disposition": inline
                                ? `inline; filename="${name}"`
                                : `attachment; filename="${name}"`,
                            "Content-Security-Policy": "default-src 'none'; sandbox",
                            "Cache-Control": "no-store"
                        }
                    );
                } catch {
                    throw new NotFoundError("ASSET_NOT_FOUND", "Asset not found.");
                }
            }

            if (method === "GET" && url.pathname === "/api/v2/events") {
                void ensureWatching();
                return events.subscribe(request, response);
            }
            if (method === "GET" && url.pathname === "/api/v2/metrics") {
                return sendJson(
                    response,
                    200,
                    {
                        ...log.snapshot(),
                        indexEpoch: indexStore.epoch,
                        eventClients: events.size,
                        watcher: {
                            mode: watcher.mode,
                            directories: watcher.watchedDirectories
                        }
                    },
                    {},
                    request
                );
            }
            if (method === "GET" && url.pathname === "/api/v2/activity") {
                const { cards } = await loadCards(workspace);
                return sendJson(
                    response,
                    200,
                    await buildActivitySnapshot(workspace, cards),
                    {},
                    request
                );
            }
            if (method === "GET" && url.pathname === "/api/v2/workspace") {
                return sendJson(response, 200, workspacePayload(workspace));
            }
            if (method === "GET" && url.pathname === "/api/v2/schema") {
                return sendJson(response, 200, workspace.schema);
            }
            if (method === "GET" && url.pathname === "/api/v2/health") {
                return sendJson(
                    response,
                    200,
                    await runDoctor(workspace, {
                        index: await indexStore.get({ diagnose: true })
                    })
                );
            }
            if (method === "GET" && url.pathname === "/api/v2/mcp") {
                return sendJson(
                    response,
                    200,
                    inspectMcpServer(workspace, {
                        readOnly: !workspace.config.mcp.allowMutations
                    })
                );
            }
            if (method === "GET" && url.pathname === "/api/v2/mcp/config") {
                return sendJson(
                    response,
                    200,
                    mcpClientConfiguration(workspace, {
                        readOnly: !workspace.config.mcp.allowMutations
                    })
                );
            }
            if (
                method === "GET" &&
                (url.pathname === "/api/v2/records" ||
                    url.pathname === "/api/v2/search")
            ) {
                const index = await indexStore.get();
                const query = url.searchParams.get("q") || "";
                const kinds = url.searchParams.getAll("kind");
                const limit = integerQuery(url.searchParams.get("limit"), {
                    fallback: 100,
                    min: 1,
                    max: 500
                });
                const offset = integerQuery(url.searchParams.get("offset"), {
                    fallback: 0,
                    min: 0
                });
                // Listings under /records stay lexical; only /search consults
                // the semantic provider, and ?mode=lexical opts back out.
                const provider =
                    url.pathname === "/api/v2/search" &&
                    url.searchParams.get("mode") !== "lexical"
                        ? searchProvider
                        : null;
                const result = await searchProjectRecordsHybrid(
                    index.records,
                    query,
                    {
                        provider,
                        kinds,
                        limit,
                        offset,
                        semanticWeight: workspace.config.search.semanticWeight,
                        maxProviderRecords:
                            workspace.config.search.maxProviderRecords,
                        ...projectionFrom(url)
                    }
                );
                const etag = collectionEtag(result.records);
                if (notModified(request, response, etag)) return;
                return sendJson(
                    response,
                    200,
                    {
                        ...result,
                        generatedAt: index.generatedAt,
                        modules: index.modules
                    },
                    { ETag: etag },
                    request
                );
            }
            const recordMatch = url.pathname.match(
                /^\/api\/v2\/records\/([^/]+)$/
            );
            if (method === "GET" && recordMatch) {
                const index = await indexStore.get();
                const id = decodePathSegment(recordMatch[1]);
                const record = findProjectRecord(index, id);
                if (!record) {
                    throw new NotFoundError(
                        "RECORD_NOT_FOUND",
                        `Project record not found: ${id}`
                    );
                }
                return sendJson(
                    response,
                    200,
                    { record },
                    { ETag: `"${record.revision}"` }
                );
            }
            if (method === "GET" && url.pathname === "/api/v2/docs") {
                const index = await indexStore.get();
                const query = url.searchParams.get("q") || "";
                const managed = url.searchParams.get("managed");
                let candidates = index.records.filter(
                    (record) => record.kind === "doc"
                );
                if (managed === "1" || managed === "0") {
                    candidates = candidates.filter(
                        (record) => record.managed === (managed === "1")
                    );
                }
                const result = searchProjectRecords(candidates, query, {
                    ...projectionFrom(url),
                    limit: integerQuery(url.searchParams.get("limit"), {
                        fallback: 200,
                        min: 1,
                        max: 500
                    }),
                    offset: integerQuery(url.searchParams.get("offset"), {
                        fallback: 0,
                        min: 0
                    })
                });
                const listEtag = collectionEtag(result.records);
                if (notModified(request, response, listEtag)) return;
                return sendJson(response, 200, result, { ETag: listEtag }, request);
            }
            if (method === "POST" && url.pathname === "/api/v2/docs") {
                const result = await createManagedDocument(
                    workspace,
                    await readJson(request)
                );
                indexStore.invalidate();
                return sendJson(
                    response,
                    201,
                    { record: recordFromDocument(result.document) },
                    { ETag: `"${result.revision}"` }
                );
            }
            const documentRoute = url.pathname.match(
                /^\/api\/v2\/docs\/([^/]+)$/
            );
            if (documentRoute) {
                const id = decodePathSegment(documentRoute[1]);
                if (method === "GET") {
                    const index = await indexStore.get();
                    const record = findProjectRecord(index, id);
                    if (!record || record.kind !== "doc") {
                        throw new NotFoundError(
                            "DOC_NOT_FOUND",
                            `Document not found: ${id}`
                        );
                    }
                    return sendJson(
                        response,
                        200,
                        { record },
                        { ETag: `"${record.revision}"` }
                    );
                }
                if (method === "PATCH") {
                    const body = await readJson(request);
                    const changes =
                        body.changes ||
                        Object.fromEntries(
                            Object.entries(body).filter(
                                ([key]) => key !== "expectedRevision"
                            )
                        );
                    const result = await patchManagedDocument(
                        workspace,
                        id,
                        changes,
                        { expectedRevision: expectedRevision(request, body) }
                    );
                    indexStore.invalidate();
                    return sendJson(
                        response,
                        200,
                        { record: recordFromDocument(result.document) },
                        { ETag: `"${result.revision}"` }
                    );
                }
            }
            if (method === "GET" && url.pathname === "/api/v2/changelog") {
                const index = await indexStore.get();
                const query = url.searchParams.get("q") || "";
                const visibility = url.searchParams.get("visibility");
                const state = url.searchParams.get("state");
                let candidates = index.records.filter((record) =>
                    ["change", "release"].includes(record.kind)
                );
                if (visibility) {
                    candidates = candidates.filter(
                        (record) =>
                            record.kind === "release" ||
                            record.visibility === visibility
                    );
                }
                if (state === "unreleased") {
                    candidates = candidates.filter(
                        (record) => record.kind === "change" && !record.released
                    );
                } else if (state === "released") {
                    candidates = candidates.filter(
                        (record) =>
                            record.kind === "release" ||
                            (record.kind === "change" && record.released)
                    );
                }
                const result = searchProjectRecords(candidates, query, {
                    ...projectionFrom(url),
                    limit: integerQuery(url.searchParams.get("limit"), {
                        fallback: 500,
                        min: 1,
                        max: 1000
                    }),
                    offset: integerQuery(url.searchParams.get("offset"), {
                        fallback: 0,
                        min: 0
                    })
                });
                const listEtag = collectionEtag(result.records);
                if (notModified(request, response, listEtag)) return;
                return sendJson(response, 200, result, { ETag: listEtag }, request);
            }
            if (method === "POST" && url.pathname === "/api/v2/changelog") {
                const result = await createChangeFragment(
                    workspace,
                    await readJson(request)
                );
                indexStore.invalidate();
                return sendJson(
                    response,
                    201,
                    { record: recordFromChange(result.fragment) },
                    { ETag: `"${result.revision}"` }
                );
            }
            if (
                method === "POST" &&
                url.pathname === "/api/v2/changelog/releases/preview"
            ) {
                const body = await readJson(request);
                const result = await previewRelease(workspace, body);
                return sendJson(response, 200, {
                    ...result,
                    fragments: result.fragments.map(recordFromChange)
                });
            }
            if (
                method === "POST" &&
                url.pathname === "/api/v2/changelog/releases"
            ) {
                const body = await readJson(request);
                const result = await createRelease(workspace, body);
                indexStore.invalidate();
                return sendJson(response, 201, {
                    record: recordFromRelease(result.release),
                    fragments: result.fragments.map(recordFromChange)
                });
            }
            if (
                method === "GET" &&
                url.pathname === "/api/v2/changelog/render"
            ) {
                const visibility = url.searchParams.get("visibility") || "public";
                const content = await renderChangelog(workspace, { visibility });
                return sendJson(response, 200, { visibility, content });
            }
            if (
                method === "POST" &&
                url.pathname === "/api/v2/changelog/render"
            ) {
                const body = await readJson(request);
                const result = await writeRenderedChangelog(workspace, body);
                return sendJson(response, 200, {
                    path: result.path,
                    content: result.content
                });
            }
            const changeRoute = url.pathname.match(
                /^\/api\/v2\/changelog\/([A-Z][A-Z0-9]{0,7}-\d{4,})$/
            );
            if (changeRoute) {
                const id = changeRoute[1];
                if (method === "GET") {
                    const index = await indexStore.get();
                    const record = findProjectRecord(index, id);
                    if (!record || !["change", "release"].includes(record.kind)) {
                        throw new NotFoundError(
                            "CHANGELOG_RECORD_NOT_FOUND",
                            `Changelog record not found: ${id}`
                        );
                    }
                    return sendJson(
                        response,
                        200,
                        { record },
                        { ETag: `"${record.revision}"` }
                    );
                }
                if (method === "PATCH") {
                    const body = await readJson(request);
                    const changes =
                        body.changes ||
                        Object.fromEntries(
                            Object.entries(body).filter(
                                ([key]) => key !== "expectedRevision"
                            )
                        );
                    const result = await patchChangeFragment(
                        workspace,
                        id,
                        changes,
                        { expectedRevision: expectedRevision(request, body) }
                    );
                    indexStore.invalidate();
                    return sendJson(
                        response,
                        200,
                        { record: recordFromChange(result.fragment) },
                        { ETag: `"${result.revision}"` }
                    );
                }
            }
            if (method === "GET" && url.pathname === "/api/v2/memory") {
                const index = await indexStore.get();
                const query = url.searchParams.get("q") || "";
                const collection = url.searchParams.get("collection");
                const status = url.searchParams.get("status");
                let candidates = index.records.filter(
                    (record) => record.kind === "memory"
                );
                if (collection) {
                    candidates = candidates.filter(
                        (record) => record.collection === collection
                    );
                }
                if (status) {
                    candidates = candidates.filter(
                        (record) => record.status === status
                    );
                }
                const result = searchProjectRecords(candidates, query, {
                    ...projectionFrom(url),
                    limit: integerQuery(url.searchParams.get("limit"), {
                        fallback: 500,
                        min: 1,
                        max: 1000
                    }),
                    offset: integerQuery(url.searchParams.get("offset"), {
                        fallback: 0,
                        min: 0
                    })
                });
                const listEtag = collectionEtag(result.records);
                if (notModified(request, response, listEtag)) return;
                return sendJson(response, 200, result, { ETag: listEtag }, request);
            }
            if (method === "POST" && url.pathname === "/api/v2/memory") {
                const body = await readJson(request);
                const result = await createMemoryRecord(
                    workspace,
                    body.collection,
                    body
                );
                indexStore.invalidate();
                return sendJson(
                    response,
                    201,
                    { record: recordFromMemory(result.record) },
                    { ETag: `"${result.revision}"` }
                );
            }
            const memoryRoute = url.pathname.match(
                /^\/api\/v2\/memory\/([A-Z][A-Z0-9]{0,7}-\d{4,})(?:\/(graduate|supersede))?$/
            );
            if (memoryRoute) {
                const [, id, action] = memoryRoute;
                if (method === "GET" && !action) {
                    const index = await indexStore.get();
                    const record = findProjectRecord(index, id);
                    if (!record || record.kind !== "memory") {
                        throw new NotFoundError(
                            "MEMORY_NOT_FOUND",
                            `Memory record not found: ${id}`
                        );
                    }
                    return sendJson(
                        response,
                        200,
                        { record },
                        { ETag: `"${record.revision}"` }
                    );
                }
                if (method === "PATCH" && !action) {
                    const body = await readJson(request);
                    const changes =
                        body.changes ||
                        Object.fromEntries(
                            Object.entries(body).filter(
                                ([key]) => key !== "expectedRevision"
                            )
                        );
                    const result = await patchMemoryRecord(
                        workspace,
                        id,
                        changes,
                        { expectedRevision: expectedRevision(request, body) }
                    );
                    indexStore.invalidate();
                    return sendJson(
                        response,
                        200,
                        { record: recordFromMemory(result.record) },
                        { ETag: `"${result.revision}"` }
                    );
                }
                if (method === "POST" && action === "graduate") {
                    const body = await readJson(request);
                    const result = await graduateLearning(
                        workspace,
                        id,
                        body.targets,
                        { expectedRevision: expectedRevision(request, body) }
                    );
                    indexStore.invalidate();
                    return sendJson(response, 200, {
                        record: recordFromMemory(result.record)
                    });
                }
                if (method === "POST" && action === "supersede") {
                    const body = await readJson(request);
                    const result = await supersedeMemoryRecord(
                        workspace,
                        id,
                        body.replacementId,
                        { expectedRevision: expectedRevision(request, body) }
                    );
                    indexStore.invalidate();
                    return sendJson(response, 200, {
                        record: recordFromMemory(result.record)
                    });
                }
            }

            if (method === "GET" && url.pathname === "/api/v2/agents") {
                return sendJson(response, 200, await checkAgentInstructions(workspace));
            }
            if (method === "POST" && url.pathname === "/api/v2/agents/sync") {
                const body = await readJson(request);
                return sendJson(
                    response,
                    200,
                    await syncAgentInstructions(workspace, {
                        targets: body.targets,
                        force: Boolean(body.force),
                        dryRun: Boolean(body.dryRun)
                    })
                );
            }
            if (
                method === "GET" &&
                url.pathname === "/api/v2/agents/context"
            ) {
                return sendJson(
                    response,
                    200,
                    await buildAgentContext(workspace, {
                        index: await indexStore.get(),
                        cardId: url.searchParams.get("card") || undefined,
                        limit: integerQuery(url.searchParams.get("limit"), {
                            fallback: 20,
                            min: 1,
                            max: 50
                        })
                    })
                );
            }
            if (method === "GET" && url.pathname === "/api/v2/ci") {
                return sendJson(response, 200, await checkCiTemplates(workspace));
            }
            if (method === "POST" && url.pathname === "/api/v2/ci/sync") {
                const body = await readJson(request);
                return sendJson(
                    response,
                    200,
                    await syncCiTemplates(workspace, {
                        targets: body.targets,
                        force: Boolean(body.force),
                        dryRun: Boolean(body.dryRun)
                    })
                );
            }

            if (method === "GET" && url.pathname === "/api/v2/cards") {
                // Was the one list route that ignored `q`, `limit` and `offset`
                // and carried no ETag, which is why the UI stayed on the legacy
                // endpoint: it could not express what it needed here.
                const index = await indexStore.get();
                const result = searchProjectRecords(
                    index.records.filter((record) => record.kind === "card"),
                    url.searchParams.get("q") || "",
                    {
                        ...projectionFrom(url),
                        limit: integerQuery(url.searchParams.get("limit"), {
                            fallback: 500,
                            min: 1,
                            max: 1000
                        }),
                        offset: integerQuery(url.searchParams.get("offset"), {
                            fallback: 0,
                            min: 0
                        })
                    }
                );
                const cardsEtag = collectionEtag(result.records);
                if (notModified(request, response, cardsEtag)) return;
                return sendJson(response, 200, result, { ETag: cardsEtag }, request);
            }
            if (method === "POST" && url.pathname === "/api/v2/cards") {
                const result = await createCard(workspace, await readJson(request));
                indexStore.invalidate();
                return sendJson(
                    response,
                    201,
                    { record: recordFromCard(workspace, result.card) },
                    { ETag: `"${result.revision}"` }
                );
            }
            if (method === "POST" && url.pathname === "/api/v2/cards/bulk") {
                const input = await readJson(request);
                const result = await bulkPatchCards(
                    workspace,
                    input.ids,
                    input.changes,
                    { expectedRevisions: input.expectedRevisions }
                );
                indexStore.invalidate();
                const listEtag = collectionEtag(result.records);
                if (notModified(request, response, listEtag)) return;
                return sendJson(response, 200, result, { ETag: listEtag }, request);
            }

            const cardRoute = v2CardRoute(url.pathname);
            if (cardRoute) {
                const [, id, action] = cardRoute;
                if (method === "PATCH" && !action) {
                    const body = await readJson(request);
                    const changes =
                        body.changes ||
                        Object.fromEntries(
                            Object.entries(body).filter(
                                ([key]) => key !== "expectedRevision"
                            )
                        );
                    const result = await patchCard(workspace, id, changes, {
                        expectedRevision: expectedRevision(request, body),
                        actor: body.actor ?? resolveActor().actor,
                        force: body.force === true
                    });
                    indexStore.invalidate();
                    return sendJson(
                        response,
                        200,
                        { record: recordFromCard(workspace, result.card) },
                        { ETag: `"${result.revision}"` }
                    );
                }
                if (method === "POST" && action === "claim") {
                    const body = await readJson(request);
                    const result = await claimCard(workspace, id, {
                        ...body,
                        expectedRevision: expectedRevision(request, body)
                    });
                    indexStore.invalidate();
                    return sendJson(
                        response,
                        200,
                        {
                            record: recordFromCard(workspace, result.card),
                            warnings: result.warnings
                        },
                        { ETag: `"${result.revision}"` }
                    );
                }
                if (method === "POST" && action === "transition") {
                    const body = await readJson(request);
                    const result = await transitionCard(
                        workspace,
                        id,
                        body.status,
                        {
                            // Omitting the field must not be a way past the
                            // ownership guard: it reads `claimed_by && actor`,
                            // so an absent actor deleted the check. T-0079
                            // fixed this on the CLI and left the HTTP route.
                            actor: body.actor ?? resolveActor().actor,
                            scope: body.scope,
                            now: body.now,
                            force: body.force === true,
                            expectedRevision: expectedRevision(request, body)
                        }
                    );
                    indexStore.invalidate();
                    return sendJson(
                        response,
                        200,
                        { record: recordFromCard(workspace, result.card) },
                        { ETag: `"${result.revision}"` }
                    );
                }
                if (method === "POST" && action === "archive") {
                    const body = await readJson(request);
                    const result = await archiveCard(workspace, id, {
                        expectedRevision: expectedRevision(request, body)
                    });
                    indexStore.invalidate();
                    return sendJson(response, 200, {
                        record: recordFromCard(workspace, result.card)
                    });
                }
                if (method === "POST" && action === "reopen") {
                    const body = await readJson(request);
                    const result = await reopenCard(workspace, id, {
                        status: body.status,
                        actor: body.actor ?? resolveActor().actor,
                        expectedRevision: expectedRevision(request, body)
                    });
                    indexStore.invalidate();
                    return sendJson(response, 200, {
                        record: recordFromCard(workspace, result.card)
                    });
                }
            }

            // v1 UI compatibility adapter. Domain behavior still lives in v2 services.
            if (method === "GET" && url.pathname === "/api/tasks") {
                const { cards } = await loadCards(workspace);
                // The UI polls this every thirty seconds and it is the whole
                // card corpus. With a collection ETag the steady state — which
                // is almost always "nothing changed" — costs a header exchange
                // instead of megabytes of JSON re-serialized and re-parsed.
                const etag = collectionEtag(cards);
                if (notModified(request, response, etag)) return;
                return sendJson(
                    response,
                    200,
                    {
                        repoRoot: workspace.root,
                        projectName: workspace.config.name,
                        schema: workspace.schema,
                        tasks: cards
                    },
                    { ETag: etag },
                    request
                );
            }
            if (method === "GET" && url.pathname === "/api/health") {
                const report = await runDoctor(workspace, {
                    index: await indexStore.get({ diagnose: true })
                });
                return sendJson(response, 200, {
                    ...report,
                    cards: report.modules.cards || 0
                });
            }
            if (
                method === "GET" &&
                url.pathname === "/api/knowledge/document"
            ) {
                throw new NotFoundError(
                    "DOCUMENT_NOT_FOUND",
                    "Knowledge compatibility documents are not available yet."
                );
            }
            if (method === "POST" && url.pathname === "/api/tasks") {
                const result = await createCard(workspace, await readJson(request));
                indexStore.invalidate();
                return sendJson(response, 201, {
                    id: result.id,
                    file: result.file,
                    revision: result.revision
                });
            }
            if (method === "POST" && url.pathname === "/api/tasks/bulk") {
                const body = await readJson(request);
                const ids = [...new Set<string>(body.ids || [])];
                const results = [];
                let updated = 0;
                for (const id of ids) {
                    try {
                        const result = await compatibilityPatch(
                            workspace,
                            id,
                            body.changes || {},
                            {
                                expectedRevision: body.expectedRevisions?.[id]
                            }
                        );
                        updated += 1;
                        results.push({ id, ok: true, revision: result.revision });
                    } catch (error: any) {
                        // One bad card used to abort the batch after writing the
                        // ones before it, and the response said only how many
                        // "succeeded" — never which one stopped it.
                        results.push({
                            id,
                            ok: false,
                            error: {
                                code: error?.code || "CARD_PATCH_FAILED",
                                message: error?.message
                            }
                        });
                    }
                }
                indexStore.invalidate();
                return sendJson(response, 200, {
                    ok: results.every((entry) => entry.ok),
                    updated,
                    failed: results.length - updated,
                    results
                });
            }

            const legacyRoute = legacyCardRoute(url.pathname);
            if (legacyRoute) {
                const [, id, action] = legacyRoute;
                if (method === "PATCH" && !action) {
                    const result = await compatibilityPatch(
                        workspace,
                        id,
                        await readJson(request),
                        { expectedRevision: expectedRevision(request) }
                    );
                    indexStore.invalidate();
                    return sendJson(response, 200, {
                        ok: true,
                        task: result.card
                    });
                }
                if (method === "POST" && action === "archive") {
                    await archiveCard(workspace, id, {
                        expectedRevision: expectedRevision(request)
                    });
                    indexStore.invalidate();
                    return sendJson(response, 200, { ok: true });
                }
                if (method === "POST" && action === "unarchive") {
                    await reopenCard(workspace, id, {
                        status: "backlog",
                        actor: resolveActor().actor,
                        expectedRevision: expectedRevision(request)
                    });
                    indexStore.invalidate();
                    return sendJson(response, 200, { ok: true });
                }
                if (method === "POST" && action === "assets") {
                    ensureWritable(workspace);
                    await getUniqueCard(workspace, id);
                    const name = sanitizeAssetName(url.searchParams.get("name"));
                    if (!name) {
                        throw new ValidationError(
                            "ASSET_NAME_INVALID",
                            "Invalid asset name."
                        );
                    }
                    if (ACTIVE_ASSET_TYPES.has(extension(name))) {
                        throw new ValidationError(
                            "ASSET_TYPE_NOT_ALLOWED",
                            `Assets of type .${extension(name)} can execute script and are not accepted.`
                        );
                    }
                    const buffer = await readRaw(request, {
                        limit: 25 * 1024 * 1024
                    });
                    if (!buffer.length) {
                        throw new ValidationError(
                            "ASSET_BODY_EMPTY",
                            "Asset body is empty."
                        );
                    }
                    const directory = join(workspace.paths.assets, id);
                    await mkdir(directory, { recursive: true });
                    await writeFile(join(directory, name), buffer, { flag: "wx" });
                    indexStore.invalidate();
                    return sendJson(response, 201, { ok: true, name });
                }
            }

            throw new NotFoundError("ROUTE_NOT_FOUND", "Route not found.");
        } catch (error) {
            // The error path itself can fail — headers already sent, socket
            // gone — and an exception escaping this handler takes the whole
            // process down with it. That becomes far more likely once responses
            // outlive a single round trip.
            if (normalizeError(error).status >= 500) log.fault(error);
            try {
                if (error?.code === "EEXIST") {
                    return sendError(
                        response,
                        new ValidationError(
                            "ASSET_ALREADY_EXISTS",
                            "An asset with that name already exists."
                        )
                    );
                }
                sendError(response, error);
            } catch {
                if (!response.headersSent) {
                    try {
                        response.writeHead(500, {
                            "Content-Type": "application/json; charset=utf-8",
                            "X-Content-Type-Options": "nosniff"
                        });
                    } catch {
                        // The socket is unusable; nothing left to say on it.
                    }
                }
                response.end();
            }
        }
    });
    // Exposed so a caller shutting the server down can also stop the watcher
    // and hang up the open streams; an unref'd watcher would otherwise keep a
    // test process alive.
    (server as any).projectEvents = events;
    (server as any).projectWatcher = watcher;
    return server;
}

/** How far past the configured port to look before giving up. */
const PORT_SEARCH_LIMIT = 20;

/**
 * Who holds a port, when the answer is another Workfile UI.
 *
 * `EADDRINUSE` cannot tell a second board apart from an unrelated process, and
 * the two want different advice. One probe of the API the UI serves answers
 * it, and lets the message name the project the user is already looking at.
 */
async function heldBy(host: string, port: number) {
    const reachable = ["0.0.0.0", "::", ""].includes(host) ? "127.0.0.1" : host;
    try {
        const response = await fetch(
            `http://${reachable}:${port}/api/v2/workspace`,
            { signal: AbortSignal.timeout(750) }
        );
        if (!response.ok) return null;
        const body: any = await response.json();
        return typeof body?.root === "string"
            ? { name: body.name as string, root: body.root as string }
            : null;
    } catch {
        return null;
    }
}

function listenOnce(server, port: number, host: string) {
    return new Promise<void>((resolve, reject) => {
        const onStartupError = (error) => {
            server.off("error", onStartupError);
            reject(error);
        };
        server.once("error", onStartupError);
        server.listen(port, host, () => {
            // The startup listener has to come off once we are listening.
            // Leaving it registered meant a later socket error called `reject`
            // on a settled promise: a silent no-op, and an unhandled 'error'
            // event on the server if nothing else was listening.
            server.off("error", onStartupError);
            server.on("error", (error) => {
                process.emitWarning(
                    `project server error: ${error?.message || error}`
                );
            });
            resolve();
        });
    });
}

export async function startProjectServer(
    workspace,
    {
        host = workspace.config.ui.host,
        port = workspace.config.ui.port,
        uiDir = DEFAULT_UI_DIR,
        allowedHosts,
        verbose = false,
        /**
         * Move to the next free port when this one is taken.
         *
         * On for the configured default and off for an explicit `--port`,
         * because those are different requests. `ui.port` is 4747 in every
         * workspace, so the second project a user opens collides by
         * construction and the failure said `INTERNAL_ERROR: listen
         * EADDRINUSE` — the reaction it invited was to kill the first board.
         * A port somebody typed is a port they want, and moving off it
         * silently would be its own surprise.
         */
        searchForFreePort = false
    }: any = {}
) {
    // Binding to a non-loopback address is deliberate, so that address has to
    // be an acceptable Host too — otherwise `--host 0.0.0.0` would answer the
    // TCP connection and then refuse every request it received.
    const resolvedHosts =
        allowedHosts && allowedHosts.length
            ? allowedHosts
            : [
                  ...LOOPBACK_HOSTS,
                  ...(host && !["0.0.0.0", "::"].includes(host) ? [host] : [])
              ];
    const server = createProjectServer(workspace, {
        uiDir,
        allowedHosts: resolvedHosts,
        verbose
    });
    // A malformed request or a socket that dies mid-response must not be able
    // to end the process. `clientError` in particular fires outside the request
    // handler, so nothing else would catch it.
    server.on("clientError", (_error, socket: any) => {
        if (socket?.writable) {
            socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        }
        socket?.destroy?.();
    });
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 70_000;
    server.requestTimeout = 300_000;
    let displaced: { port: number; holder: Awaited<ReturnType<typeof heldBy>> } | null =
        null;
    for (let attempt = 0; ; attempt += 1) {
        const candidate = port + attempt;
        try {
            await listenOnce(server, candidate, host);
            break;
        } catch (error) {
            if ((error as { code?: string })?.code !== "EADDRINUSE") throw error;
            // Asked once, on the port the caller actually named: the holder of
            // 4759 after nine hops is noise, and the probe costs a round trip.
            if (!displaced) {
                displaced = { port: candidate, holder: await heldBy(host, candidate) };
            }
            const exhausted = attempt >= PORT_SEARCH_LIMIT || candidate >= 65_535;
            if (!searchForFreePort || exhausted) {
                const who = displaced.holder
                    ? ` by the Workfile UI for ${displaced.holder.root}`
                    : "";
                throw new ValidationError(
                    "UI_PORT_IN_USE",
                    exhausted && searchForFreePort
                        ? `Ports ${port} to ${candidate} are all in use. Pass ` +
                              "--port, or set ui.port in project.config.mjs."
                        : `${host}:${port} is already in use${who}. Pass a ` +
                              "different --port, or set ui.port in " +
                              "project.config.mjs."
                );
            }
        }
    }
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    return {
        server,
        host,
        port: actualPort,
        requested: port,
        /** The port that was taken, and who had it — null when none was. */
        displaced: actualPort === port ? null : displaced,
        url: `http://${host}:${actualPort}`,
        events: (server as any).projectEvents,
        close: () =>
            new Promise<void>((resolve, reject) => {
                (server as any).projectWatcher?.close();
                (server as any).projectEvents?.closeAll();
                server.close((error) => (error ? reject(error) : resolve()));
            })
    };
}
