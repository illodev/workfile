import type { ClaimState, IssueSeverity, Priority, Status } from "./types";

/**
 * Colour helpers for the semantic namespaces (ADR-0005).
 *
 * The three token families that survived the shadcn migration — status,
 * priority, severity — resolve to named tokens from `styles.css`;
 * components apply these inline (`style=`) or through the mapped
 * utilities (`text-status-doing`). Nothing else in the codebase names a
 * colour.
 */

export function statusColor(status: Status | string): string {
    return `var(--status-${status})`;
}

export function priorityColor(priority: Priority | string): string {
    return `var(--priority-${priority})`;
}

export function severityColor(severity: IssueSeverity | string): string {
    return `var(--sev-${severity})`;
}

/**
 * Docs, memory and changelog carry their own lifecycle vocabularies; the
 * design maps them onto the card-status hues (settled → done, in flux →
 * doing, superseded/parked → backlog, refused → discarded) rather than
 * inventing new colours per module.
 */
const RECORD_STATUS_TOKEN: Record<string, string> = {
    // docs
    current: "done",
    draft: "doing",
    stale: "doing",
    superseded: "backlog",
    archived: "backlog",
    indexed: "backlog",
    // memory
    active: "done",
    accepted: "done",
    resolved: "done",
    graduated: "done",
    proposed: "doing",
    open: "doing",
    mitigated: "doing",
    closed: "done",
    rejected: "discarded",
    expired: "backlog",
    deprecated: "backlog",
    // changelog
    released: "done",
    unreleased: "doing"
};

export function recordStatusColor(status: string): string {
    const token = RECORD_STATUS_TOKEN[status];
    if (token) return `var(--status-${token})`;
    // Card statuses pass through; anything unknown reads as parked.
    return `var(--status-${status in CARD_STATUS ? status : "backlog"})`;
}

/**
 * A claim state as a colour. `live` and `held` ride the card-status hues of
 * the statuses they correspond to; `stale` and `orphaned` are severities,
 * because those two are the ones the reader has to act on rather than note.
 *
 * The threshold that turns a hold stale is `cards.claimLeaseHours`, applied
 * server-side and shipped as `claim.state`. Nothing here knows that number and
 * nothing here may learn it: a second copy of a configurable rule in the
 * browser is a rule that drifts from the one the protocol enforces.
 *
 * Exhaustive rather than defaulted, so a state added to the union fails the
 * typecheck instead of rendering as "parked".
 */
export function claimStateColor(state: ClaimState): string {
    switch (state) {
        case "live":
            return statusColor("doing");
        case "held":
            return statusColor("review");
        case "stale":
            return severityColor("warning");
        case "orphaned":
            return severityColor("error");
        case "unclaimed":
            return statusColor("backlog");
    }
}

const CARD_STATUS: Record<string, true> = {
    backlog: true,
    next: true,
    doing: true,
    review: true,
    blocked: true,
    deferred: true,
    done: true,
    discarded: true
};

/** "4 min", "2 h", "3 d" — precision nobody needs is precision nobody reads. */
export function since(hours: number | null | undefined): string {
    if (hours == null) return "";
    if (hours < 1 / 60) return "now";
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 48) return `${Math.round(hours)} h`;
    return `${Math.round(hours / 24)} d`;
}
