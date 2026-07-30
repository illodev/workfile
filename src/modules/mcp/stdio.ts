import { createInterface } from "node:readline";
import { once } from "node:events";

import { createMcpProtocolServer } from "./server.js";

async function writeMessage(output, message) {
    if (!message) return;
    const line = `${JSON.stringify(message)}\n`;
    if (!output.write(line, "utf8")) await once(output, "drain");
}

export function startMcpStdioServer(
    workspace,
    {
        input = process.stdin,
        output = process.stdout,
        errorOutput = process.stderr,
        maxMessageBytes,
        ...options
    }: any = {}
) {
    const protocol = createMcpProtocolServer(workspace, options);
    const maximum =
        maxMessageBytes || workspace.config.mcp.maxMessageBytes || 1024 * 1024;
    const lines = createInterface({ input, crlfDelay: Infinity });
    let chain = Promise.resolve();
    let closedResolve;
    let closedReject;
    const closed = new Promise((resolve, reject) => {
        closedResolve = resolve;
        closedReject = reject;
    });

    lines.on("line", (line) => {
        chain = chain
            .then(async () => {
                if (!line.trim()) return;
                if (Buffer.byteLength(line, "utf8") > maximum) {
                    await writeMessage(output, {
                        jsonrpc: "2.0",
                        id: null,
                        error: {
                            code: -32600,
                            message: `MCP message exceeds ${maximum} bytes.`
                        }
                    });
                    return;
                }
                let message;
                try {
                    message = JSON.parse(line);
                } catch {
                    await writeMessage(output, {
                        jsonrpc: "2.0",
                        id: null,
                        error: { code: -32700, message: "Parse error" }
                    });
                    return;
                }
                await writeMessage(output, await protocol.handle(message));
            })
            .catch(async (error) => {
                errorOutput.write(
                    `[workfile:mcp] ${error?.stack || error}\n`
                );
                await writeMessage(output, {
                    jsonrpc: "2.0",
                    id: null,
                    error: { code: -32603, message: "Internal error" }
                }).catch(() => undefined);
            });
    });
    lines.on("close", () => {
        chain.then(closedResolve, closedReject);
    });
    lines.on("error", closedReject);
    return {
        protocol,
        closed,
        close() {
            lines.close();
        }
    };
}
