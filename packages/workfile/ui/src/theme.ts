import type { IssueSeverity, Priority, Status } from "./types";

/**
 * Colour helpers for the bespoke design system (ADR-0010).
 *
 * Every status, priority and severity colour in the interface resolves to a
 * named token from `styles.css`; components apply these inline (`style=`)
 * exactly like the design file does. Nothing else in the codebase names a
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

/** `.project/<collection>` a record id belongs to, for the breadcrumb. */
export function recordCollection(id: string): string {
    if (id.startsWith("T-")) return "cards";
    if (id.startsWith("DOC-") || id.startsWith("PATH-")) return "docs";
    if (id.startsWith("CHG-") || id.startsWith("REL-")) return "changelog";
    return "memory";
}

/** "4 min", "2 h", "3 d" — precision nobody needs is precision nobody reads. */
export function since(hours: number | null | undefined): string {
    if (hours == null) return "";
    if (hours < 1 / 60) return "now";
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 48) return `${Math.round(hours)} h`;
    return `${Math.round(hours / 24)} d`;
}
