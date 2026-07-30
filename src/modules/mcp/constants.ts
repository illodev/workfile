export const MCP_PROTOCOL_VERSION = "2026-07-28";
export const MCP_LEGACY_PROTOCOL_VERSION = "2025-11-25";
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
    MCP_PROTOCOL_VERSION,
    MCP_LEGACY_PROTOCOL_VERSION,
    "2025-06-18",
    "2025-03-26",
    "2024-11-05"
]);

export const MCP_SERVER_NAME = "workfile";
export const MCP_SERVER_TITLE = "Workfile";

export const MCP_META_KEYS = Object.freeze({
    protocolVersion: "io.modelcontextprotocol/protocolVersion",
    clientInfo: "io.modelcontextprotocol/clientInfo",
    clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
    serverInfo: "io.modelcontextprotocol/serverInfo"
});
