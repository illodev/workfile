#!/usr/bin/env node
/**
 * Fube Backlog board — local API + Vite-built UI over the MD cards.
 * Spec: .planning/backlog/SPEC.md
 *
 *   pnpm board   (builds the UI, then starts this server)
 *   → http://localhost:4747
 */
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
    AREAS,
    diagnoseBacklog,
    EFFORTS,
    loadBacklog,
    parseTask,
    PRIORITIES,
    serializeValue,
    STATUSES,
    TYPES
} from "./backlog-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const TASKS_DIR = resolve(__dirname, "../tasks");
const ARCHIVE_DIR = resolve(__dirname, "../archive");
const ASSETS_DIR = resolve(__dirname, "../assets");
const CHANGELOG_DIR = resolve(__dirname, "../../changelog");
const LEARNINGS_DIR = resolve(__dirname, "../../learnings");
const DIST_DIR = resolve(__dirname, "dist");
const PORT = Number(process.env.PORT || 4747);

const PATCHABLE = [
    "title",
    "status",
    "type",
    "priority",
    "area",
    "parent",
    "depends",
    "milestone",
    "source",
    "tags",
    "effort",
    "scope",
    "claimed_by",
    "claimed_at",
    "start",
    "due"
];
const ENUMS = {
    status: STATUSES,
    type: TYPES,
    priority: PRIORITIES,
    area: AREAS,
    effort: EFFORTS
};
const MIME = {
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
    json: "application/json; charset=utf-8",
    html: "text/html; charset=utf-8",
    zip: "application/zip"
};

// ---------- frontmatter ----------
// serializeValue lives in backlog-lib.mjs next to parseValue: the two must stay
// exact inverses or every save degrades the cards that carry quotes.

async function loadDir(dir, archived) {
    let files;
    try {
        files = await readdir(dir);
    } catch {
        return [];
    }
    const tasks = [];
    for (const f of files.filter((f) => f.endsWith(".md")).sort()) {
        try {
            const t = parseTask(
                f,
                await readFile(join(dir, f), "utf8"),
                archived
            );
            if (t?.id && t?.title) tasks.push(t);
        } catch {
            /* unreadable file: skip */
        }
    }
    return tasks;
}

async function loadAssets() {
    const map = {};
    let dirs;
    try {
        dirs = await readdir(ASSETS_DIR);
    } catch {
        return map;
    }
    for (const d of dirs.filter((d) => /^T-\d+$/.test(d))) {
        try {
            map[d] = (await readdir(join(ASSETS_DIR, d))).sort();
        } catch {
            /* not a dir: skip */
        }
    }
    return map;
}

async function loadTasks() {
    const [live, archived, assets] = await Promise.all([
        loadDir(TASKS_DIR, false),
        loadDir(ARCHIVE_DIR, true),
        loadAssets()
    ]);
    const tasks = [...live, ...archived];
    for (const t of tasks) t.assets = assets[t.id] || [];
    return tasks;
}

// ---------- knowledge ----------

function parseDocumentFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return { metadata: {}, body: content.trim() };
    const metadata = {};
    for (const line of match[1].split(/\r?\n/)) {
        const field = line.match(/^([a-z_]+):\s*(.*?)\s*$/);
        if (!field) continue;
        let value = field[2];
        if (value.startsWith('"') && value.endsWith('"')) {
            try {
                value = JSON.parse(value);
            } catch {
                value = value.slice(1, -1);
            }
        } else if (value === "true" || value === "false") {
            value = value === "true";
        } else if (/^\d+$/.test(value)) {
            value = Number(value);
        } else if (value === "null") {
            value = null;
        }
        metadata[field[1]] = value;
    }
    return {
        metadata,
        body: content.slice(match[0].length).trim()
    };
}

async function listMarkdownFiles(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
    const nested = await Promise.all(
        entries.map(async (entry) => {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) return listMarkdownFiles(path);
            if (
                entry.isFile() &&
                entry.name.endsWith(".md") &&
                entry.name !== "_INDEX.md"
            )
                return [path];
            return [];
        })
    );
    return nested.flat();
}

async function loadKnowledgeIndex() {
    const [changelogFiles, learningFiles] = await Promise.all([
        listMarkdownFiles(CHANGELOG_DIR),
        listMarkdownFiles(LEARNINGS_DIR)
    ]);
    const [changelogs, learnings] = await Promise.all([
        Promise.all(
            changelogFiles.map(async (path) => {
                const { metadata, body } = parseDocumentFrontmatter(
                    await readFile(path, "utf8")
                );
                const date = String(metadata.date || basename(path, ".md"));
                return {
                    kind: "changelog",
                    path: relative(CHANGELOG_DIR, path),
                    repoPath: relative(REPO_ROOT, path),
                    id: date,
                    title: date,
                    date,
                    entries: [...body.matchAll(/^###\s+/gm)].length
                };
            })
        ),
        Promise.all(
            learningFiles.map(async (path) => {
                const { metadata } = parseDocumentFrontmatter(
                    await readFile(path, "utf8")
                );
                const relativePath = relative(LEARNINGS_DIR, path);
                return {
                    kind: "learning",
                    path: relativePath,
                    repoPath: relative(REPO_ROOT, path),
                    id: String(metadata.id || basename(path, ".md")),
                    title: String(
                        metadata.title || metadata.id || basename(path, ".md")
                    ),
                    category: String(
                        metadata.category || dirname(relativePath)
                    ),
                    date: metadata.created ? String(metadata.created) : null,
                    severity: metadata.severity
                        ? String(metadata.severity)
                        : null,
                    graduated: metadata.graduated === true,
                    occurrences:
                        typeof metadata.occurrences === "number"
                            ? metadata.occurrences
                            : null
                };
            })
        )
    ]);
    changelogs.sort((left, right) => right.date.localeCompare(left.date));
    learnings.sort(
        (left, right) =>
            String(right.date || "").localeCompare(String(left.date || "")) ||
            left.id.localeCompare(right.id, undefined, { numeric: true })
    );
    return { changelogs, learnings };
}

async function loadKnowledgeDocument(kind, requestedPath) {
    const root =
        kind === "changelog"
            ? CHANGELOG_DIR
            : kind === "learning"
              ? LEARNINGS_DIR
              : null;
    if (!root || !requestedPath || !requestedPath.endsWith(".md")) return null;
    const path = resolve(root, requestedPath);
    if (path !== root && !path.startsWith(`${root}${sep}`)) return null;
    try {
        const { metadata, body } = parseDocumentFrontmatter(
            await readFile(path, "utf8")
        );
        return {
            kind,
            path: relative(root, path),
            repoPath: relative(REPO_ROOT, path),
            metadata,
            body
        };
    } catch {
        return null;
    }
}

/** Rewrites only the changed frontmatter keys, preserving the body byte for byte.
 *  A null/empty value removes the key's line. */
async function patchTaskFile(dir, fileName, changes) {
    const path = join(dir, fileName);
    const content = await readFile(path, "utf8");
    const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!m) throw new Error("frontmatter not found");
    let lines = m[1].split(/\r?\n/);
    const today = new Date().toISOString().slice(0, 10);
    for (const [key, value] of Object.entries({ ...changes, updated: today })) {
        const empty =
            value == null ||
            value === "" ||
            (Array.isArray(value) && value.length === 0);
        const idx = lines.findIndex((l) => l.startsWith(`${key}:`));
        if (empty) {
            if (idx !== -1) lines.splice(idx, 1);
        } else {
            const line = `${key}: ${serializeValue(key, value)}`;
            if (idx !== -1) lines[idx] = line;
            else lines.push(line);
        }
    }
    await writeFile(
        path,
        `---\n${lines.join("\n")}\n---\n` + content.slice(m[0].length),
        "utf8"
    );
}

// ---------- create ----------

function slugify(title) {
    return (
        title
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 50) || "card"
    );
}

/** Highest id claimed by a file name, including cards `loadDir` had to skip
 *  (unreadable or missing id/title). Reusing their id would create duplicates. */
async function maxIdInDir(dir) {
    let files;
    try {
        files = await readdir(dir);
    } catch {
        return 0;
    }
    return files.reduce((acc, file) => {
        const match = file.match(/^T-(\d{1,6})/);
        const n = match ? Number(match[1]) : 0;
        return n > acc ? n : acc;
    }, 0);
}

async function nextId(tasks) {
    const fromCards = tasks.reduce((acc, t) => {
        const n = Number((t.id || "").replace(/^T-/, ""));
        return Number.isFinite(n) && n > acc ? n : acc;
    }, 0);
    const fromFiles = await Promise.all([
        maxIdInDir(TASKS_DIR),
        maxIdInDir(ARCHIVE_DIR)
    ]);
    const max = Math.max(fromCards, ...fromFiles);
    return `T-${String(max + 1).padStart(4, "0")}`;
}

function validateEnums(input) {
    for (const [key, allowed] of Object.entries(ENUMS)) {
        if (
            input[key] != null &&
            input[key] !== "" &&
            !allowed.includes(input[key])
        )
            return `invalid ${key}: ${input[key]}`;
    }
    for (const key of ["start", "due"]) {
        const v = input[key];
        if (v != null && v !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(v))
            return `invalid ${key}: expected YYYY-MM-DD, got ${v}`;
    }
    if (input.start && input.due && input.start > input.due)
        return `invalid range: start ${input.start} is after due ${input.due}`;
    return null;
}

function validateRelations(input, tasks, currentId = null) {
    if (currentId) {
        for (const key of ["title", "status", "type", "priority", "area"]) {
            if (input[key] == null || input[key] === "")
                return `${key} cannot be empty`;
        }
    }
    if (input.title != null && input.title.trim().length > 80)
        return "title must be at most 80 characters";
    const byId = new Map(tasks.map((task) => [task.id, task]));
    if (input.parent) {
        if (input.parent === currentId) return "card cannot parent itself";
        if (!byId.has(input.parent)) return `parent not found: ${input.parent}`;
        let parent = byId.get(input.parent);
        let depth = 1;
        const seen = new Set([currentId].filter(Boolean));
        while (parent?.parent) {
            if (seen.has(parent.id)) return "parent hierarchy has a cycle";
            seen.add(parent.id);
            depth += 1;
            parent = byId.get(parent.parent);
        }
        if (depth > 2) return "parent hierarchy exceeds maximum depth 2";
    }
    for (const dependency of input.depends || []) {
        if (dependency === currentId) return "card cannot depend on itself";
        if (!byId.has(dependency)) return `dependency not found: ${dependency}`;
    }
    if (Boolean(input.claimed_by) !== Boolean(input.claimed_at))
        return "claimed_by and claimed_at must be set or cleared together";
    if (input.claimed_by && input.status !== "doing")
        return "claimed cards must have status doing";
    return null;
}

async function createTask(input, tasks) {
    const id = await nextId(tasks);
    const today = new Date().toISOString().slice(0, 10);
    const fm = { id, title: input.title.trim() };
    fm.status = input.status || "backlog";
    fm.type = input.type || "task";
    fm.priority = input.priority || "medium";
    fm.area = input.area || "api";
    for (const key of [
        "parent",
        "milestone",
        "source",
        "effort",
        "start",
        "due"
    ]) {
        if (input[key]) fm[key] = input[key];
    }
    for (const key of ["depends", "tags", "scope"]) {
        if (input[key]?.length) fm[key] = input[key];
    }
    fm.created = today;
    fm.updated = today;
    const lines = Object.entries(fm).map(
        ([k, v]) => `${k}: ${serializeValue(k, v)}`
    );
    const file = `${id}-${slugify(input.title)}.md`;
    const body = (input.body || "").trim();
    await mkdir(TASKS_DIR, { recursive: true });
    await writeFile(
        join(TASKS_DIR, file),
        `---\n${lines.join("\n")}\n---\n\n${body}\n`,
        {
            flag: "wx"
        }
    );
    return { id, file };
}

// ---------- http ----------

function json(res, code, data) {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
}

async function readBody(req, { raw = false } = {}) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    if (raw) return buf;
    return buf.length ? JSON.parse(buf.toString("utf8")) : {};
}

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://localhost:${PORT}`);

        if (
            req.method === "GET" &&
            (url.pathname === "/" || url.pathname === "/index.html")
        ) {
            const html = await readFile(join(DIST_DIR, "index.html"), "utf8");
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            return res.end(html);
        }

        const uiAsset = url.pathname.match(/^\/static\/([^/]+)$/);
        if (req.method === "GET" && uiAsset && !uiAsset[1].includes("..")) {
            try {
                const file = uiAsset[1];
                const buffer = await readFile(join(DIST_DIR, "static", file));
                const extension = file.split(".").pop().toLowerCase();
                res.writeHead(200, {
                    "Content-Type":
                        MIME[extension] ||
                        (extension === "js"
                            ? "text/javascript; charset=utf-8"
                            : extension === "css"
                              ? "text/css; charset=utf-8"
                              : "application/octet-stream"),
                    "Cache-Control": "no-cache"
                });
                return res.end(buffer);
            } catch {
                return json(res, 404, { error: "UI asset not found" });
            }
        }

        // Static assets: /assets/T-0042/file.png (traversal-proof by regex shape)
        const asset = url.pathname.match(/^\/assets\/(T-\d{1,6})\/([^/]+)$/);
        if (req.method === "GET" && asset && !asset[2].includes("..")) {
            try {
                const buf = await readFile(
                    join(ASSETS_DIR, asset[1], asset[2])
                );
                const ext = asset[2].split(".").pop().toLowerCase();
                res.writeHead(200, {
                    "Content-Type": MIME[ext] || "application/octet-stream"
                });
                return res.end(buf);
            } catch {
                return json(res, 404, { error: "asset not found" });
            }
        }

        if (req.method === "GET" && url.pathname === "/api/tasks") {
            return json(res, 200, {
                repoRoot: REPO_ROOT,
                tasks: await loadTasks()
            });
        }

        if (req.method === "GET" && url.pathname === "/api/health") {
            const backlog = await loadBacklog({
                tasksDir: TASKS_DIR,
                archiveDir: ARCHIVE_DIR
            });
            return json(
                res,
                200,
                await diagnoseBacklog({
                    ...backlog,
                    repoRoot: REPO_ROOT,
                    checkPaths: true
                })
            );
        }

        if (req.method === "GET" && url.pathname === "/api/knowledge") {
            return json(res, 200, await loadKnowledgeIndex());
        }

        if (
            req.method === "GET" &&
            url.pathname === "/api/knowledge/document"
        ) {
            const document = await loadKnowledgeDocument(
                url.searchParams.get("kind"),
                url.searchParams.get("path")
            );
            return document
                ? json(res, 200, document)
                : json(res, 404, { error: "document not found" });
        }

        if (req.method === "POST" && url.pathname === "/api/tasks") {
            const input = await readBody(req);
            if (!input.title?.trim())
                return json(res, 400, { error: "title required" });
            const enumErr = validateEnums(input);
            if (enumErr) return json(res, 400, { error: enumErr });
            const tasks = await loadTasks();
            const relationErr = validateRelations(
                {
                    ...input,
                    status: input.status || "backlog"
                },
                tasks
            );
            if (relationErr) return json(res, 400, { error: relationErr });
            return json(res, 201, await createTask(input, tasks));
        }

        if (req.method === "POST" && url.pathname === "/api/tasks/bulk") {
            const input = await readBody(req);
            const ids = [...new Set(input.ids || [])];
            if (!ids.length)
                return json(res, 400, { error: "ids are required" });
            if (ids.length > 5000)
                return json(res, 400, {
                    error: "maximum 5000 cards per batch"
                });
            const changes = {};
            for (const key of PATCHABLE)
                if (key in (input.changes || {}))
                    changes[key] = input.changes[key];
            if (!Object.keys(changes).length)
                return json(res, 400, { error: "nothing to change" });
            const enumErr = validateEnums(changes);
            if (enumErr) return json(res, 400, { error: enumErr });
            const tasks = await loadTasks();
            const selected = ids.map((id) =>
                tasks.find((task) => task.id === id)
            );
            const missing = ids.filter((id, index) => !selected[index]);
            if (missing.length)
                return json(res, 404, {
                    error: `cards not found: ${missing.join(", ")}`
                });
            for (const task of selected) {
                const relationErr = validateRelations(
                    { ...task, ...changes },
                    tasks,
                    task.id
                );
                if (relationErr)
                    return json(res, 400, {
                        error: `${task.id}: ${relationErr}`
                    });
            }
            for (const task of selected) {
                const dir = task.archived ? ARCHIVE_DIR : TASKS_DIR;
                await patchTaskFile(dir, task.file, changes);
            }
            return json(res, 200, { ok: true, updated: selected.length });
        }

        const idMatch = url.pathname.match(
            /^\/api\/tasks\/(T-\d{1,6})(\/[a-z]+)?$/
        );
        if (idMatch) {
            const tasks = await loadTasks();
            const task = tasks.find((t) => t.id === idMatch[1]);
            if (!task) return json(res, 404, { error: "card not found" });
            const dir = task.archived ? ARCHIVE_DIR : TASKS_DIR;
            const action = idMatch[2] || "";

            if (req.method === "PATCH" && !action) {
                const changes = await readBody(req);
                const enumErr = validateEnums(changes);
                if (enumErr) return json(res, 400, { error: enumErr });
                const allowed = {};
                for (const k of PATCHABLE)
                    if (k in changes) allowed[k] = changes[k];
                if (!Object.keys(allowed).length)
                    return json(res, 400, { error: "nothing to change" });
                const relationErr = validateRelations(
                    { ...task, ...allowed },
                    tasks,
                    task.id
                );
                if (relationErr) return json(res, 400, { error: relationErr });
                await patchTaskFile(dir, task.file, allowed);
                return json(res, 200, { ok: true });
            }
            if (
                req.method === "POST" &&
                action === "/archive" &&
                !task.archived &&
                ["done", "discarded"].includes(task.status)
            ) {
                await mkdir(ARCHIVE_DIR, { recursive: true });
                await rename(
                    join(TASKS_DIR, task.file),
                    join(ARCHIVE_DIR, task.file)
                );
                return json(res, 200, { ok: true });
            }
            if (
                req.method === "POST" &&
                action === "/unarchive" &&
                task.archived
            ) {
                await rename(
                    join(ARCHIVE_DIR, task.file),
                    join(TASKS_DIR, task.file)
                );
                return json(res, 200, { ok: true });
            }
            if (req.method === "POST" && action === "/assets") {
                const name = basename(
                    url.searchParams.get("name") || ""
                ).replace(/[^\w.\-()\[\] ]+/g, "_");
                if (!name || name.startsWith("."))
                    return json(res, 400, { error: "bad name" });
                const buf = await readBody(req, { raw: true });
                if (!buf.length) return json(res, 400, { error: "empty body" });
                if (buf.length > 25 * 1024 * 1024)
                    return json(res, 413, {
                        error: "max 25 MB (this is a git repo)"
                    });
                await mkdir(join(ASSETS_DIR, task.id), { recursive: true });
                await writeFile(join(ASSETS_DIR, task.id, name), buf);
                return json(res, 201, { ok: true, name });
            }
        }

        json(res, 404, { error: "not found" });
    } catch (err) {
        json(res, 500, { error: String(err?.message || err) });
    }
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`Fube Backlog board → http://localhost:${PORT}`);
    console.log(`Cards: ${TASKS_DIR}`);
});
