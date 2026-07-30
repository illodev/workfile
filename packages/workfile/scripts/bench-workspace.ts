import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Deterministic synthetic workspaces.
 *
 * Every value derives from the record index, so two runs of the same scale
 * produce byte-identical trees. That is what lets a benchmark compare a number
 * to one taken on a different day, and what lets a byte budget be an assertion
 * rather than an approximation.
 */
export const SCALES = {
    S: { cards: 50, docs: 20, changes: 10, memory: 10 },
    M: { cards: 500, docs: 200, changes: 100, memory: 50 },
    L: { cards: 2000, docs: 800, changes: 400, memory: 200 },
    XL: { cards: 8000, docs: 3000, changes: 1500, memory: 600 }
};

const AREAS = ["core", "ui", "docs", "infra", "mcp", "search"];
const STATUSES = [
    "backlog",
    "next",
    "doing",
    "review",
    "blocked",
    "deferred",
    "done",
    "discarded"
];
const TYPES = ["epic", "idea", "feature", "bug", "task", "audit", "docs", "chore"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const KINDS = ["architecture", "product", "runbook", "guide", "reference"];
const CHANGE_TYPES = ["added", "changed", "fixed", "removed", "security"];
const COLLECTIONS = [
    ["learnings", "LRN", "active"],
    ["decisions", "ADR", "accepted"],
    ["incidents", "INC", "resolved"],
    ["conventions", "CONV", "active"],
    ["context", "CTX", "active"]
];

const WORDS = [
    "billing", "invoice", "retry", "queue", "schema", "index", "cache",
    "revision", "protocol", "agent", "workspace", "record", "backlink",
    "release", "fragment", "diseño", "búsqueda", "migración"
];

/** A body whose length varies with the index but never randomly. */
function body(seed, paragraphs = 3) {
    const lines = [];
    for (let p = 0; p < paragraphs; p += 1) {
        const words = [];
        for (let w = 0; w < 24 + ((seed + p) % 40); w += 1) {
            words.push(WORDS[(seed * 7 + p * 3 + w) % WORDS.length]);
        }
        lines.push(words.join(" "));
    }
    // A tenth of the records cite another one, so the backlink graph is real
    // rather than empty.
    if (seed % 10 === 0) lines.push(`Related to T-${String((seed % 97) + 1).padStart(4, "0")}.`);
    // And a third cite T-0001, which makes it the hub every workspace grows:
    // the record everybody links to, and therefore the one whose backlink list
    // decides whether reading a record is affordable.
    if (seed % 3 === 0) lines.push(`Tracked under T-0001.`);
    return lines.join("\n\n");
}

function date(seed) {
    const day = (seed % 28) + 1;
    const month = (seed % 12) + 1;
    return `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A date a fixed number of days after another.
 *
 * `date(index)` and `date(index + 40)` wrap month and day independently, so the
 * second is often *earlier* than the first — which produced 42 invalid ranges
 * in the fixture and a health view that was a wall of self-inflicted errors.
 * A fixture that generates invalid records cannot show anything real.
 */
function dateAfter(iso, days) {
    const moved = new Date(`${iso}T00:00:00Z`);
    moved.setUTCDate(moved.getUTCDate() + days);
    return moved.toISOString().slice(0, 10);
}

export async function buildBenchWorkspace(root, scale = "M") {
    const size = SCALES[scale];
    if (!size) throw new Error(`unknown scale: ${scale}`);
    await rm(root, { recursive: true, force: true });
    for (const directory of [
        ".project/cards",
        ".project/docs/reference",
        ".project/changelog/unreleased",
        ".project/memory/learnings",
        ".project/memory/decisions",
        ".project/memory/incidents",
        ".project/memory/conventions",
        ".project/memory/context",
        ".project/agents"
    ]) {
        await mkdir(join(root, directory), { recursive: true });
    }

    await writeFile(
        join(root, "project.config.mjs"),
        `export default {\n    schemaVersion: 2,\n    name: "Bench ${scale}",\n    cards: { areas: ${JSON.stringify(AREAS)} },\n    docs: { sources: ["docs/**/*.md"] }\n};\n`
    );
    await writeFile(
        join(root, ".project/VERSION"),
        `${JSON.stringify({ schemaVersion: 2, createdWith: "bench" }, null, 2)}\n`
    );

    const writes = [];
    for (let index = 1; index <= size.cards; index += 1) {
        const id = `T-${String(index).padStart(4, "0")}`;
        const front = [
            "---",
            `id: ${id}`,
            `title: Synthetic card ${index}`,
            `status: ${STATUSES[index % STATUSES.length]}`,
            `type: ${TYPES[index % TYPES.length]}`,
            `priority: ${PRIORITIES[index % PRIORITIES.length]}`,
            `area: ${AREAS[index % AREAS.length]}`,
            ...(index % 5 === 0 ? [`tags: [alpha, beta]`] : []),
            // Explicit edges, so the graph has something to tell apart from
            // the IDs that merely appear in prose.
            ...(index > 1 && index % 7 === 0 ? ["parent: T-0001"] : []),
            ...(index > 20 && index % 11 === 0
                ? [`depends: [T-${String(index - 20).padStart(4, "0")}]`]
                : []),
            // Scheduling dates, so the timeline has something to draw. Without
            // them that view rendered its empty state — including in the
            // screenshots, which is how a rewrite of it could go unlooked-at.
            ...(index % 4 === 0
                ? [
                      `start: ${date(index)}`,
                      `due: ${dateAfter(date(index), 20 + (index % 60))}`
                  ]
                : []),
            `created: ${date(index)}`,
            `updated: ${date(index + 3)}`,
            "---",
            ""
        ].join("\n");
        writes.push(
            writeFile(
                join(root, ".project/cards", `${id}-synthetic-card-${index}.md`),
                `${front}${body(index)}\n`
            )
        );
    }

    for (let index = 1; index <= size.docs; index += 1) {
        const id = `DOC-${String(index).padStart(4, "0")}`;
        const front = [
            "---",
            `id: ${id}`,
            `title: Synthetic document ${index}`,
            `kind: ${KINDS[index % KINDS.length]}`,
            "status: current",
            `created: ${date(index)}`,
            `updated: ${date(index + 1)}`,
            "---",
            ""
        ].join("\n");
        writes.push(
            writeFile(
                join(root, ".project/docs/reference", `${id}-synthetic-${index}.md`),
                `${front}${body(index, 5)}\n`
            )
        );
    }

    for (let index = 1; index <= size.changes; index += 1) {
        const id = `CHG-${String(index).padStart(4, "0")}`;
        const front = [
            "---",
            `id: ${id}`,
            `title: Synthetic change ${index}`,
            `type: ${CHANGE_TYPES[index % CHANGE_TYPES.length]}`,
            `area: ${AREAS[index % AREAS.length]}`,
            "visibility: public",
            `created: ${date(index)}`,
            `updated: ${date(index)}`,
            "---",
            ""
        ].join("\n");
        writes.push(
            writeFile(
                join(root, ".project/changelog/unreleased", `${id}-synthetic-${index}.md`),
                `${front}${body(index, 1)}\n`
            )
        );
    }

    for (let index = 1; index <= size.memory; index += 1) {
        const [collection, prefix, status] = COLLECTIONS[index % COLLECTIONS.length];
        const id = `${prefix}-${String(index).padStart(4, "0")}`;
        const front = [
            "---",
            `id: ${id}`,
            `title: Synthetic ${collection} ${index}`,
            `status: ${status}`,
            ...(collection === "incidents"
                ? [`severity: medium`, `resolved_at: ${date(index)}`]
                : []),
            `created: ${date(index)}`,
            `updated: ${date(index)}`,
            "---",
            ""
        ].join("\n");
        writes.push(
            writeFile(
                join(root, ".project/memory", collection, `${id}-synthetic-${index}.md`),
                `${front}${body(index, 2)}\n`
            )
        );
    }

    await Promise.all(writes);
    return { root, scale, size };
}
