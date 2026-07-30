import { readFile } from "node:fs/promises";

import { NotFoundError, ValidationError } from "../../core/errors.js";
import { findProjectRecord } from "../records/public.js";
import { runDoctor } from "../health/doctor.js";
import { boundedInteger, requiredString } from "./values.js";
import { exists } from "../../core/fs-utils.js";


function encodeCursor(offset) {
    return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(value) {
    if (!value) return 0;
    try {
        const parsed = Number(Buffer.from(String(value), "base64url").toString("utf8"));
        if (!Number.isInteger(parsed) || parsed < 0) throw new Error("invalid");
        return parsed;
    } catch {
        throw new ValidationError("MCP_CURSOR_INVALID", "Invalid resource cursor.");
    }
}

function recordUri(id) {
    return `project://record/${encodeURIComponent(id)}`;
}

function recordDescription(record) {
    return [record.kind, record.recordType, record.status, record.area]
        .filter(Boolean)
        .join(" · ");
}

function recordResource(record) {
    return {
        uri: recordUri(record.id),
        name: record.id,
        title: `${record.id} — ${record.title}`,
        description: recordDescription(record),
        mimeType: "text/markdown",
        annotations: {
            audience: ["user", "assistant"],
            priority: record.kind === "card" && record.status === "doing" ? 0.9 : 0.6,
            ...(record.updated
                ? { lastModified: `${record.updated}T00:00:00.000Z` }
                : {})
        }
    };
}

export function renderRecordResource(record) {
    const metadata = {
        id: record.id,
        kind: record.kind,
        recordType: record.recordType,
        title: record.title,
        status: record.status,
        area: record.area,
        path: record.path,
        revision: record.revision,
        outgoing: (record.outgoing || []).map((item) => item.id),
        incoming: (record.incoming || []).map((item) => item.id)
    };
    return [
        "---",
        ...Object.entries(metadata)
            .filter(([, value]) => value != null && (!Array.isArray(value) || value.length))
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.join(", ")}]` : value}`),
        "---",
        "",
        `# ${record.id} — ${record.title}`,
        "",
        record.body || ""
    ]
        .join("\n")
        .trimEnd();
}

export async function listMcpResources(context, params: any = {}) {
    const index = await context.indexStore.get();
    const limit = boundedInteger(params.limit, {
        name: "limit",
        fallback: context.workspace.config.mcp.resourcePageSize,
        maximum: 500
    });
    const offset = decodeCursor(params.cursor);
    const fixed = [
        {
            uri: "project://workspace",
            name: "workspace",
            title: "Project workspace",
            description: "Effective Workfile workspace and schema.",
            mimeType: "application/json",
            annotations: { audience: ["user", "assistant"], priority: 1 }
        },
        {
            uri: "project://health",
            name: "health",
            title: "Project health",
            description: "Current Workfile doctor report.",
            mimeType: "application/json",
            annotations: { audience: ["user", "assistant"], priority: 0.9 }
        }
    ];
    if (await exists(context.workspace.paths.agentProtocol)) {
        fixed.push({
            uri: "project://protocol",
            name: "protocol",
            title: "Canonical agent protocol",
            description: "Instructions shared by humans and software agents.",
            mimeType: "text/markdown",
            annotations: { audience: ["assistant"], priority: 1 }
        });
    }
    const resources = [...fixed, ...index.records.map(recordResource)];
    const page = resources.slice(offset, offset + limit);
    return {
        resources: page,
        ...(offset + limit < resources.length
            ? { nextCursor: encodeCursor(offset + limit) }
            : {})
    };
}

export function listMcpResourceTemplates() {
    return {
        resourceTemplates: [
            {
                uriTemplate: "project://record/{id}",
                name: "project-record",
                title: "Project record by ID",
                description:
                    "Read any card, managed/indexed document, changelog fragment, release or memory record by stable ID.",
                mimeType: "text/markdown"
            }
        ]
    };
}

export async function readMcpResource(context, params: any = {}) {
    const uri = requiredString(params.uri, "uri");
    if (uri === "project://workspace") {
        return {
            contents: [
                {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(
                        {
                            name: context.workspace.config.name,
                            root: context.workspace.root,
                            version: context.workspace.version,
                            schema: context.workspace.schema,
                            readOnly: Boolean(context.readOnly || context.workspace.readOnly)
                        },
                        null,
                        2
                    )
                }
            ]
        };
    }
    if (uri === "project://health") {
        return {
            contents: [
                {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(await runDoctor(context.workspace), null, 2)
                }
            ]
        };
    }
    if (uri === "project://protocol") {
        try {
            return {
                contents: [
                    {
                        uri,
                        mimeType: "text/markdown",
                        text: await readFile(context.workspace.paths.agentProtocol, "utf8")
                    }
                ]
            };
        } catch {
            throw new NotFoundError(
                "MCP_RESOURCE_NOT_FOUND",
                "Canonical agent protocol has not been generated. Run workfile agents sync."
            );
        }
    }
    const match = uri.match(/^project:\/\/record\/(.+)$/);
    if (match) {
        let id;
        try {
            id = decodeURIComponent(match[1]);
        } catch {
            throw new ValidationError("MCP_RESOURCE_URI_INVALID", "Invalid record resource URI.");
        }
        const index = await context.indexStore.get();
        const record = findProjectRecord(index, id);
        if (!record) {
            throw new NotFoundError(
                "MCP_RESOURCE_NOT_FOUND",
                `Project record not found: ${id}`
            );
        }
        return {
            contents: [
                {
                    uri,
                    mimeType: "text/markdown",
                    text: renderRecordResource(record)
                }
            ]
        };
    }
    throw new NotFoundError("MCP_RESOURCE_NOT_FOUND", `Unknown resource URI: ${uri}`);
}
