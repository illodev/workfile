/**
 * Reading a Markdown inline link, in one place, because it was written in two.
 *
 * `modules/docs/validation.ts` follows links to report the broken ones;
 * `modules/records/index.ts` follows the same links to build the `markdown`
 * relation between records. They had a copy each of the same pattern and the
 * same target normalisation, and the copies had drifted: one was bounded and
 * the other was not, and **both truncated the destination at the first `)`**.
 * So a link into a parenthesised directory was validated against a path nobody
 * wrote *and* recorded as a relationship to a path nobody wrote — one defect,
 * reported once (T-0232), fixable only twice.
 *
 * This is the third spelling in the package of the shape `T-0224` is about, so
 * it lands as a shared module rather than as a third copy. It sits in `core`
 * because it is pure string work with no dependency on either module, which is
 * also what keeps `docs` and `records` from having to import each other.
 */

/**
 * How far a destination is read before the link is abandoned as unterminated.
 *
 * The bound is what keeps the scan linear. `([^)]+)` — the spelling this
 * replaces in `records` — ran to the end of the body on every `](` with no
 * closing paren after it, so a body made of `[a](` repeated cost one full scan
 * per repetition. Measured on this machine over 128,000 repetitions: **37.6s**
 * inside that regex, against **350ms** for the scan below over the same input.
 *
 * The bound is also true of a Markdown link independently of that argument: a
 * destination does not span lines and is not longer than any path a filesystem
 * will hold — POSIX caps a path at 4096 and a component at 255. The cost is
 * that a destination past this length stops being read, and the only targets
 * that reach it are `data:` URIs, which every caller skips by scheme anyway.
 */
export const MAX_LINK_TARGET = 1024;

/**
 * The label half, bounded for the same reason and in the same spirit: `[`
 * repeated is the label's version of the quadratic above — `[^\]]*` runs to the
 * end of the body looking for a `]` that never comes, once per `[`.
 *
 * A label is not a paragraph, so it does not cross a line either.
 */
const LABEL = /\[[^\]\n]{0,512}\]\(/g;

/**
 * The destination of a link, read the way CommonMark defines it.
 *
 * Two forms, and the reason both are here is that the repository under
 * measurement uses both and neither worked:
 *
 * - **bare**, counting depth, so parentheses **balanced** inside the
 *   destination belong to it and the first **unbalanced** `)` ends it. This is
 *   what makes `[x](../a/(private)/b.tsx)` resolve. Next.js App Router route
 *   groups are parenthesised directories — `(private)`, `(portal)`, `(app)` —
 *   which is how half of such an application is laid out; 182 links in the
 *   consuming repository have parentheses in the destination and not one of
 *   them was validated.
 * - **angle-bracketed**, `<…>`, which CommonMark defines for exactly this and
 *   which may hold anything but `<`, `>` and a newline. Eight links in that
 *   repository are written that way by somebody who tried it and got nothing,
 *   because the old pattern did not know the form and truncated it the same
 *   way.
 *
 * A backslash escapes the next byte in both, so `\)` is a literal parenthesis
 * rather than a terminator — which is how a destination with an *odd* number of
 * them is written.
 *
 * `null` when there is nothing to read — unterminated, empty, or crossing a
 * line — and the caller then treats the `](` as ordinary text, which is what a
 * renderer does too.
 */
function readDestination(body: string, start: number) {
    if (body[start] === "<") {
        for (let index = start + 1; index < body.length; index += 1) {
            if (index - start > MAX_LINK_TARGET) return null;
            const char = body[index];
            if (char === "\n" || char === "<") return null;
            if (char === "\\") {
                index += 1;
                continue;
            }
            if (char !== ">") continue;
            // The angle form is a destination only if the link closes on it.
            return body[index + 1] === ")"
                ? { target: body.slice(start + 1, index), end: index + 2 }
                : null;
        }
        return null;
    }
    let depth = 0;
    for (let index = start; index < body.length; index += 1) {
        if (index - start > MAX_LINK_TARGET) return null;
        const char = body[index];
        if (char === "\n") return null;
        if (char === "\\") {
            index += 1;
            continue;
        }
        if (char === "(") {
            depth += 1;
            continue;
        }
        if (char !== ")") continue;
        if (depth > 0) {
            depth -= 1;
            continue;
        }
        return index === start
            ? null
            : { target: body.slice(start, index), end: index + 1 };
    }
    return null;
}

/**
 * Every `[label](destination)` in a body, in order, with the offset of its `[`.
 *
 * The label stays a pattern and the destination is scanned, because a regular
 * expression cannot count parentheses. The offset yielded is the `[` rather
 * than the destination, so a caller holding a code mask consults it about the
 * byte the link starts at — matching first and discarding what falls inside
 * code, never blanking code and matching after, which changes *what matches*.
 */
export function* markdownLinks(body: string) {
    LABEL.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = LABEL.exec(body))) {
        const destination = readDestination(body, LABEL.lastIndex);
        if (!destination) continue;
        yield { index: match.index, target: destination.target };
        LABEL.lastIndex = destination.end;
    }
}

/**
 * A raw destination reduced to the local path it names, or `null` for the ones
 * no caller follows: empty, a bare fragment, or anything with a scheme.
 *
 * Both callers did these four steps identically and independently, which is the
 * other half of why this module exists. A malformed percent escape is kept as a
 * literal path rather than throwing — a link nobody can decode is still a link
 * somebody wrote, and reporting it as written is what lets them find it.
 */
export function localLinkTarget(raw: string): string | null {
    const trimmed = String(raw ?? "").trim();
    if (
        !trimmed ||
        trimmed.startsWith("#") ||
        /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ) {
        return null;
    }
    const withoutQuery = trimmed.split(/[?#]/, 1)[0];
    if (!withoutQuery) return null;
    try {
        return decodeURIComponent(withoutQuery) || null;
    } catch {
        return withoutQuery;
    }
}
