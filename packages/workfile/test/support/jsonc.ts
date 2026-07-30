import { readFile } from "node:fs/promises";

/**
 * Parses a `tsconfig.json` — which is JSONC, whatever the extension says.
 *
 * The obvious two-regex version is wrong in a way that only shows up here: the
 * `paths` entry contains `"@/*"` and `include` contains `"src/**\/*.ts"`, so a
 * block-comment pattern opens inside the first string and closes inside the
 * second, deleting everything between them and leaving JSON that fails to
 * parse several lines away from anything that looks like a comment.
 *
 * So this walks the text and only treats `//` and `/*` as comments when they
 * are not inside a string.
 */
export function stripJsonComments(text) {
    let out = "";
    let index = 0;
    let inString = false;
    while (index < text.length) {
        const char = text[index];
        if (inString) {
            out += char;
            if (char === "\\") {
                out += text[index + 1] ?? "";
                index += 2;
                continue;
            }
            if (char === '"') inString = false;
            index += 1;
            continue;
        }
        if (char === '"') {
            inString = true;
            out += char;
            index += 1;
            continue;
        }
        if (char === "/" && text[index + 1] === "/") {
            const end = text.indexOf("\n", index);
            index = end === -1 ? text.length : end;
            continue;
        }
        if (char === "/" && text[index + 1] === "*") {
            const end = text.indexOf("*/", index + 2);
            index = end === -1 ? text.length : end + 2;
            continue;
        }
        out += char;
        index += 1;
    }
    // Trailing commas are legal in tsconfig and not in JSON.
    return out.replace(/,(\s*[}\]])/g, "$1");
}

export async function readJsonc(url) {
    return JSON.parse(stripJsonComments(await readFile(url, "utf8")));
}
