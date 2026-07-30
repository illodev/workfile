import { createHash } from "node:crypto";

export function revisionForContent(content) {
    return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}
