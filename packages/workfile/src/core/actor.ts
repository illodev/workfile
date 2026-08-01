/**
 * Who a mutation is attributed to, resolved once.
 *
 * Claims exist to keep two agents out of the same files, and for that to work
 * every surface has to arrive at the same string. Three of them did not: the
 * CLI fell back to `$USER@$HOSTNAME`, the MCP server derived `mcp:<client>`,
 * and the Claude hook compared a session UUID — so the guard rail asked about
 * your own claim while two parallel sessions on one machine, sharing a
 * username, never collided at all. Wrong in both directions simultaneously.
 *
 * All three now call this.
 *
 * The session discriminator is the part worth explaining. It is tempting to
 * leave it out and let `claimed_by` be a plain `alvaro@local`, which reads
 * beautifully in a diff — but two Claude sessions in one checkout are two
 * agents, and if they resolve to one string the claim protects nothing between
 * them. `CARD_SCOPE_OVERLAP` does not cover the gap: it is a warning, not a
 * refusal. So the session is appended, short and readable, and only when a
 * session actually exists. A plain terminal keeps the plain name.
 *
 * What this deliberately is not is an opaque identifier. The documentation used
 * to suggest inventing things like `agent-56a30d1b` by hand, and the result was
 * that nobody claimed anything. `alvaro@local#e55eab30` still says who and
 * where; the suffix only says which of their concurrent sessions.
 */

/** The environment variable a caller sets to name itself outright. */
const ACTOR_ENV = "WORKFILE_ACTOR";

/**
 * Session id sources, most specific first.
 *
 * `CLAUDE_SESSION_ID` was read in three places and set by nothing — Claude Code
 * exports `CLAUDE_CODE_SESSION_ID`. It is kept here as a trailing fallback
 * rather than deleted so that anything already exporting it by hand keeps
 * working, but it is no longer the name anything relies on.
 */
const SESSION_ENVS = [
    "WORKFILE_SESSION_ID",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_SESSION_ID"
];

/** How many characters of a session id survive into an actor name. */
const SESSION_PREFIX_LENGTH = 8;

export interface ResolveActorOptions {
    /** An actor supplied explicitly by the caller. Wins over everything. */
    provided?: string | null;
    /** An MCP client's own name, which stands in for the username. */
    clientName?: string | null;
    /** A session id the host already knows, preferred over the environment. */
    sessionId?: string | null;
    /** Environment to read. Defaults to the process environment. */
    env?: Record<string, string | undefined>;
}

export interface ResolvedActor {
    /** The actor string, or `undefined` when nothing could be resolved. */
    actor: string | undefined;
    /** Which rung produced it — reported by `agents whoami`. */
    source: string;
    /** The session id, for ledger keys. Never part of durable identity alone. */
    sessionId: string | undefined;
}

/** The session id for this process, for use as a ledger key. */
export function resolveSessionId(
    options: Pick<ResolveActorOptions, "sessionId" | "env"> = {}
): string | undefined {
    const env = options.env || (process.env as Record<string, string | undefined>);
    const explicit = trimmed(options.sessionId);
    if (explicit) return explicit;
    for (const name of SESSION_ENVS) {
        const value = trimmed(env[name]);
        if (value) return value;
    }
    return undefined;
}

/**
 * Resolve the actor every surface should agree on.
 *
 * Order: an explicit argument, then `$WORKFILE_ACTOR`, then a derived identity
 * — the MCP client's name if there is one, otherwise `user@host` — discriminated
 * by the current session when one exists.
 */
export function resolveActor(options: ResolveActorOptions = {}): ResolvedActor {
    const env = options.env || (process.env as Record<string, string | undefined>);
    const sessionId = resolveSessionId({ sessionId: options.sessionId, env });

    const provided = trimmed(options.provided);
    if (provided) return { actor: provided, source: "argument", sessionId };

    const configured = trimmed(env[ACTOR_ENV]);
    if (configured) return { actor: configured, source: `env:${ACTOR_ENV}`, sessionId };

    const client = trimmed(options.clientName);
    const base = client
        ? `mcp:${client}`
        : trimmed(env.USER)
          ? `${trimmed(env.USER)}@${trimmed(env.HOSTNAME) || "local"}`
          : undefined;
    if (!base) return { actor: undefined, source: "unresolved", sessionId };

    const suffix = sessionDiscriminator(sessionId);
    return {
        actor: suffix ? `${base}#${suffix}` : base,
        source: client
            ? suffix
                ? "mcp-client+session"
                : "mcp-client"
            : suffix
              ? "user@host+session"
              : "user@host",
        sessionId
    };
}

/**
 * The readable tail of a session id.
 *
 * A UUID's first block is already distinct enough to separate the handful of
 * sessions that can share one checkout, and it stays short enough that the
 * actor is still a name rather than a token.
 */
function sessionDiscriminator(sessionId: string | undefined): string | undefined {
    if (!sessionId) return undefined;
    const cleaned = sessionId.replace(/[^A-Za-z0-9]/g, "");
    if (!cleaned) return undefined;
    return cleaned.slice(0, SESSION_PREFIX_LENGTH).toLowerCase();
}

function trimmed(value: string | null | undefined): string | undefined {
    if (typeof value !== "string") return undefined;
    const next = value.trim();
    return next ? next : undefined;
}
