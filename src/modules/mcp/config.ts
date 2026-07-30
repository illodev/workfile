import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MCP_PROTOCOL_VERSION } from "./constants.js";

// The dedicated binary, not `workfile mcp`. The multiplexed entry point reads
// argv[3] as its action, so the emitted command has to be one that parses
// --root and --read-only as flags — which is the whole point of this config.
const PROJECT_MCP_BIN = resolve(
    fileURLToPath(new URL("../../../bin/workfile-mcp.js", import.meta.url))
);

export function mcpClientConfiguration(workspace, options: any = {}) {
    const command = options.command || process.execPath;
    const args = [
        options.projectBin || PROJECT_MCP_BIN,
        "--root",
        workspace.root
    ];
    if (options.readOnly) args.push("--read-only");
    return {
        command,
        args,
        env: {},
        transport: "stdio",
        protocolVersion: MCP_PROTOCOL_VERSION
    };
}
