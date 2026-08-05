/**
 * The schemes a record body may put in an `href` or a `src`.
 *
 * React 19 replaces a `javascript:` URL with a throwing stub, so this is not
 * the only thing standing between a card body and script execution. It is the
 * only one that belongs to us. The UI renders record bodies, and a record body
 * is written by whichever agent held the card — the same threat model that
 * makes the CI workflow call this package "unauthenticated read and write
 * access to a repository". A defence that lives in a dependency's minor
 * version is a defence you find out about by losing it.
 *
 * Its own module rather than a helper inside `Markdown.tsx` so that a test can
 * reach it: the UI has a typecheck and no test runner, and the node suite
 * already imports `ui/src/timeline.ts` directly.
 */

/** Schemes that may appear in rendered record text. */
const SAFE_SCHEME = /^(?:https?|mailto):/i;

/** Anything of the shape `scheme:`, which RFC 3986 bounds to these characters. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The URL to render, or `null` when the caller must not render a link at all.
 *
 * Relative targets are the common case, carry no scheme, and pass untouched.
 * `data:` is refused deliberately: browsers block top-level navigation to
 * `data:text/html`, but that is again someone else's rule, and no record body
 * needs it.
 */
export function safeUrl(raw: string): string | null {
    const url = raw.trim();
    // Protocol-relative: no scheme to test, and it still leaves the origin.
    if (url.startsWith("//")) return null;
    if (HAS_SCHEME.test(url) && !SAFE_SCHEME.test(url)) return null;
    return url;
}
