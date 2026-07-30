import { readFile } from "node:fs/promises";

import { normalizeError, ValidationError } from "../../core/errors.js";
import { createProjectIndexStore } from "../records/public.js";
import { createIntegrationRegistry } from "../integrations/index.js";
import {
    MCP_LEGACY_PROTOCOL_VERSION,
    MCP_META_KEYS,
    MCP_PROTOCOL_VERSION,
    MCP_SERVER_NAME,
    MCP_SERVER_TITLE,
    MCP_SUPPORTED_PROTOCOL_VERSIONS
} from "./constants.js";
import { getMcpPrompt, listMcpPrompts } from "./prompts.js";
import {
    listMcpResources,
    listMcpResourceTemplates,
    readMcpResource
} from "./resources.js";
import { callMcpTool, inspectMcpTools, listMcpTools } from "./tools.js";
import { plainObject, requiredString } from "./values.js";

const PACKAGE_VERSION = JSON.parse(
    await readFile(new URL("../../../../package.json", import.meta.url), "utf8")
).version;
const JSON_RPC = "2.0";
const CACHE_TTL_MS = 30_000;
const PRIVATE_CACHE = "private";
const MODERN_LIST_METHODS = new Set([
    "tools/list",
    "resources/list",
    "resources/templates/list",
    "prompts/list"
]);

function errorResponse(id, code, message, data = null) {
    return {
        jsonrpc: JSON_RPC,
        id: id ?? null,
        error: {
            code,
            message,
            ...(data ? { data } : {})
        }
    };
}

function resultResponse(id, result) {
    return { jsonrpc: JSON_RPC, id, result };
}

function protocolError(error) {
    const normalized = normalizeError(error);
    return {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details ? { details: normalized.details } : {})
    };
}

function selectedLegacyProtocolVersion(requested) {
    if (
        requested !== MCP_PROTOCOL_VERSION &&
        MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ) {
        return requested;
    }
    return MCP_LEGACY_PROTOCOL_VERSION;
}

function unsupportedProtocolVersion(requested) {
    const error = new ValidationError(
        "MCP_UNSUPPORTED_PROTOCOL_VERSION",
        `Unsupported MCP protocol version: ${requested}`
    );
    error.details = {
        supported: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
        requested
    };
    return error;
}

function modernMetadata(params) {
    const meta = plainObject(params?._meta, "params._meta", {});
    const version = meta[MCP_META_KEYS.protocolVersion];
    if (!version) return null;
    if (!MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
        throw unsupportedProtocolVersion(version);
    }
    if (version !== MCP_PROTOCOL_VERSION) return null;
    if (!meta[MCP_META_KEYS.clientInfo]) {
        throw new ValidationError(
            "MCP_CLIENT_INFO_REQUIRED",
            `Modern MCP requests must include params._meta[${JSON.stringify(MCP_META_KEYS.clientInfo)}].`
        );
    }
    if (!meta[MCP_META_KEYS.clientCapabilities]) {
        throw new ValidationError(
            "MCP_CLIENT_CAPABILITIES_REQUIRED",
            `Modern MCP requests must include params._meta[${JSON.stringify(MCP_META_KEYS.clientCapabilities)}].`
        );
    }
    return { version, meta };
}

function modernComplete(method, result) {
    const complete = {
        resultType: "complete",
        ...(result && typeof result === "object" ? result : {})
    };
    if (MODERN_LIST_METHODS.has(method)) {
        if (complete.ttlMs == null) complete.ttlMs = CACHE_TTL_MS;
        if (complete.cacheScope == null) complete.cacheScope = PRIVATE_CACHE;
    }
    if (method === "resources/read") {
        if (complete.ttlMs == null) complete.ttlMs = 1_000;
        if (complete.cacheScope == null) complete.cacheScope = PRIVATE_CACHE;
    }
    return complete;
}

/** A one-line human summary, so `content` need not repeat the whole payload. */
function summarize(value) {
    if (!value || typeof value !== "object") return String(value ?? "");
    if (Array.isArray(value.records)) {
        const shown = value.records.length;
        const total = value.total ?? shown;
        const more =
            total > shown
                ? `; ${total - shown} more, raise limit or pass offset`
                : "";
        return `${total} match${total === 1 ? "" : "es"}, ${shown} returned${more}.`;
    }
    if (value.record?.id) {
        return `${value.record.id} — ${value.record.title ?? ""}`.trim();
    }
    if (value.id) return `${value.id}${value.title ? ` — ${value.title}` : ""}`;
    if (typeof value.ok === "boolean") return value.ok ? "ok" : "failed";
    return Object.keys(value).slice(0, 6).join(", ");
}

/**
 * Serializes a tool result.
 *
 * Three things used to make these far more expensive than they needed to be:
 * the payload was pretty-printed (~29% of pure indentation, paid in tokens),
 * it was sent *twice* — once as `content` text and once as `structuredContent` —
 * and exceeding the size limit failed the call outright with a message telling
 * the caller to "narrow the query", which a get-by-id cannot do.
 *
 * `content` is now a one-line summary; the data travels once, in
 * `structuredContent`. Hosts that only read `content` still get something
 * meaningful and can ask for the record they want.
 */
function toolResult(value, maximumBytes, modern = false) {
    let payload = value;
    let truncated = null;

    const measure = (candidate) =>
        Buffer.byteLength(JSON.stringify(candidate), "utf8");

    if (measure(payload) > maximumBytes) {
        // Degrade by dropping the field that grows without bound, rather than
        // refusing to answer at all.
        if (Array.isArray(payload?.records)) {
            const kept = [];
            let size = measure({ ...payload, records: [] });
            for (const record of payload.records) {
                const cost = measure(record) + 1;
                if (size + cost > maximumBytes) break;
                kept.push(record);
                size += cost;
            }
            truncated = { records: payload.records.length - kept.length };
            payload = { ...payload, records: kept };
        } else if (payload?.record?.body) {
            truncated = { bodyBytes: Buffer.byteLength(payload.record.body, "utf8") };
            payload = {
                ...payload,
                record: {
                    ...payload.record,
                    body: `${payload.record.body.slice(0, 2000)}…`
                }
            };
        }
        if (truncated) payload = { ...payload, truncated };
    }

    const bytes = measure(payload);
    if (bytes > maximumBytes) {
        const error = {
            code: "MCP_TOOL_RESULT_TOO_LARGE",
            message: `Tool result is ${bytes} bytes; the configured limit is ${maximumBytes} bytes.`,
            details: { bytes, maximumBytes }
        };
        return {
            ...(modern ? { resultType: "complete" } : {}),
            isError: true,
            content: [{ type: "text", text: JSON.stringify(error) }],
            structuredContent: { error }
        };
    }
    return {
        ...(modern ? { resultType: "complete" } : {}),
        content: [
            {
                type: "text",
                text: truncated
                    ? `${summarize(payload)} (truncated to fit the result limit)`
                    : summarize(payload)
            }
        ],
        structuredContent: payload
    };
}

function toolError(error, modern = false) {
    const normalized = protocolError(error);
    return {
        ...(modern ? { resultType: "complete" } : {}),
        isError: true,
        content: [
            {
                type: "text",
                text: `${normalized.code}: ${normalized.message}`
            }
        ],
        structuredContent: { error: normalized }
    };
}

function serverCapabilities() {
    return {
        tools: {},
        resources: {},
        prompts: {}
    };
}

function serverInstructions() {
    return "Use read tools before mutations. Claim Work cards before changing their scope. Keep review distinct from runtime-verified done. Workfile never sends repository data to external services unless the host explicitly injects an integration.";
}

export function inspectMcpServer(workspace, options: any = {}) {
    const readOnly = Boolean(options.readOnly || workspace.readOnly);
    const tools = inspectMcpTools();
    const integrationRegistry =
        options.integrationRegistry ||
        createIntegrationRegistry(options.integrations || []);
    return {
        protocolVersion: MCP_PROTOCOL_VERSION,
        legacyProtocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
        supportedProtocolVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
        protocolEra: "dual",
        transport: "stdio",
        server: {
            name: MCP_SERVER_NAME,
            title: MCP_SERVER_TITLE,
            version: options.version || PACKAGE_VERSION
        },
        readOnly,
        tools: tools
            .filter((entry) => !readOnly || !entry.mutating)
            .map((entry) => ({
                name: entry.name,
                title: entry.title,
                mutating: entry.mutating,
                annotations: entry.annotations
            })),
        resources: [
            "project://workspace",
            "project://health",
            "project://protocol",
            "project://record/{id}"
        ],
        prompts: listMcpPrompts().prompts.map((prompt) => prompt.name),
        semanticSearch: Boolean(
            options.searchProvider || integrationRegistry.semanticSearchProvider()
        ),
        integrations: integrationRegistry.list()
    };
}

export function createMcpProtocolServer(workspace, options: any = {}) {
    const integrationRegistry =
        options.integrationRegistry ||
        createIntegrationRegistry(options.integrations || []);
    const state = {
        initialized: false,
        clientInitialized: false,
        protocolVersion: null,
        legacyProtocolVersion: null,
        modernRequests: 0
    };
    const context = {
        workspace,
        readOnly: Boolean(options.readOnly || workspace.readOnly),
        searchProvider:
            options.searchProvider || integrationRegistry.semanticSearchProvider(),
        integrationRegistry,
        // Filled in when a client identifies itself, so mutations can be
        // attributed without the caller inventing an actor name.
        clientInfo: null as { name?: string; version?: string } | null,
        indexStore:
            options.indexStore ||
            // No time-based expiry: the store revalidates against the
            // filesystem, so a long-lived MCP process keeps a warm index
            // without ever serving a stale one. `indexMaxAgeMs` remains
            // available as an absolute ceiling for callers that want one.
            createProjectIndexStore(workspace, {
                maxAgeMs: options.indexMaxAgeMs || 0
            })
    };
    const version = options.version || PACKAGE_VERSION;
    const maximumBytes =
        options.maxToolResultBytes || workspace.config.mcp.maxToolResultBytes;

    function discoveryResult() {
        return {
            resultType: "complete",
            supportedVersions: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
            capabilities: serverCapabilities(),
            _meta: {
                [MCP_META_KEYS.serverInfo]: {
                    name: MCP_SERVER_NAME,
                    title: MCP_SERVER_TITLE,
                    version
                }
            },
            instructions: serverInstructions(),
            ttlMs: CACHE_TTL_MS,
            cacheScope: PRIVATE_CACHE
        };
    }

    async function handleRequest(message, era) {
        const method = message.method;
        const params = plainObject(message.params, "params", {});
        const modern = era === "modern";
        // Modern requests carry the client on every call rather than once at
        // initialize, so pick it up wherever it arrives.
        const declaredClient = plainObject(params._meta, "_meta", {})[
            MCP_META_KEYS.clientInfo
        ];
        if (declaredClient?.name) context.clientInfo = declaredClient;

        if (method === "server/discover") {
            if (!modern) {
                throw new ValidationError(
                    "MCP_REQUEST_METADATA_REQUIRED",
                    "server/discover requires modern per-request MCP metadata."
                );
            }
            return discoveryResult();
        }
        if (method === "initialize") {
            const requested = requiredString(
                params.protocolVersion,
                "protocolVersion"
            );
            state.initialized = true;
            // Remembered so mutations can be attributed without every call
            // having to invent an actor identifier by hand.
            if (params.clientInfo?.name) {
                context.clientInfo = params.clientInfo;
            }
            state.legacyProtocolVersion = selectedLegacyProtocolVersion(requested);
            state.protocolVersion = state.legacyProtocolVersion;
            return {
                protocolVersion: state.legacyProtocolVersion,
                capabilities: serverCapabilities(),
                serverInfo: {
                    name: MCP_SERVER_NAME,
                    title: MCP_SERVER_TITLE,
                    version,
                    description:
                        "Repository-native Work, Docs, History and project Memory for humans and software agents."
                },
                instructions: serverInstructions()
            };
        }
        if (method === "ping") return modern ? { resultType: "complete" } : {};
        if (!modern && !state.initialized) {
            throw new ValidationError(
                "MCP_NOT_INITIALIZED",
                "Legacy MCP clients must call initialize before using server capabilities. Modern clients use per-request _meta or server/discover."
            );
        }
        if (method === "tools/list") {
            const result = { tools: listMcpTools({ readOnly: context.readOnly }) };
            return modern ? modernComplete(method, result) : result;
        }
        if (method === "tools/call") {
            const name = requiredString(params.name, "name");
            try {
                const value = await callMcpTool(name, params.arguments || {}, context);
                return toolResult(value, maximumBytes, modern);
            } catch (error) {
                return toolError(error, modern);
            }
        }
        if (method === "resources/list") {
            const result = await listMcpResources(context, params);
            return modern ? modernComplete(method, result) : result;
        }
        if (method === "resources/templates/list") {
            const result = listMcpResourceTemplates();
            return modern ? modernComplete(method, result) : result;
        }
        if (method === "resources/read") {
            const result = await readMcpResource(context, params);
            return modern ? modernComplete(method, result) : result;
        }
        if (method === "prompts/list") {
            const result = listMcpPrompts();
            return modern ? modernComplete(method, result) : result;
        }
        if (method === "prompts/get") {
            const result = await getMcpPrompt(context, params);
            return modern ? modernComplete(method, result) : result;
        }
        throw new ValidationError(
            "MCP_METHOD_NOT_FOUND",
            `Unsupported MCP method: ${method}`
        );
    }

    return {
        state,
        context,
        async handle(message) {
            if (!message || typeof message !== "object" || Array.isArray(message)) {
                return errorResponse(null, -32600, "Invalid Request");
            }
            if (message.jsonrpc !== JSON_RPC || typeof message.method !== "string") {
                return errorResponse(message.id, -32600, "Invalid Request");
            }
            const notification = !("id" in message);
            if (notification) {
                if (message.method === "notifications/initialized") {
                    state.clientInitialized = true;
                    return null;
                }
                if (
                    message.method === "notifications/cancelled" ||
                    message.method === "notifications/roots/list_changed"
                ) {
                    return null;
                }
                return null;
            }
            try {
                let era = "legacy";
                if (message.method !== "initialize") {
                    const metadata = modernMetadata(message.params || {});
                    if (metadata) {
                        era = "modern";
                        state.modernRequests += 1;
                        state.protocolVersion = metadata.version;
                    }
                }
                return resultResponse(
                    message.id,
                    await handleRequest(message, era)
                );
            } catch (error) {
                const normalized = protocolError(error);
                if (normalized.code === "MCP_UNSUPPORTED_PROTOCOL_VERSION") {
                    return errorResponse(
                        message.id,
                        -32022,
                        "Unsupported protocol version",
                        normalized.details
                    );
                }
                const code =
                    normalized.code === "MCP_METHOD_NOT_FOUND" ? -32601 : -32602;
                return errorResponse(message.id, code, normalized.message, normalized);
            }
        }
    };
}
