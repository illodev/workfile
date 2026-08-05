import type { ActivitySnapshot, ClaimEntry } from "./types.ts";

/**
 * What the footer's claim ledger knows, minus the drawing.
 *
 * Its own module with a type-only import, for the reason `navigation.ts`
 * records: the interface builds under `moduleResolution: Bundler`, which
 * refuses an explicit `.ts` on a value import, and the strict ratchet compiles
 * the tests under `node16`, which demands one. A module that imports nothing
 * but types is erased before either rule applies.
 *
 * That program also has no DOM library, so nothing here may name `document`,
 * `location` or `performance` — the ledger's questions are all answerable from
 * the activity snapshot anyway.
 */

/** One card's share of a claim conflict, seen from that card's row. */
export interface ClaimOverlap {
    /** The other claimed card. */
    other: string;
    /** The scope paths the two claims share, deduplicated and sorted. */
    paths: string[];
}

/**
 * `activity.conflicts` keyed by card.
 *
 * The server emits unordered pairs, which is the right shape for counting and
 * the wrong one for a row: a row knows its own id and needs the other side.
 * Both directions are indexed, and two conflicts naming the same two cards
 * merge into one entry with their paths unioned rather than the second
 * replacing the first.
 *
 * This is the claim-derived set — claimed cards, different actors, shared
 * paths. It is deliberately not `main.tsx`'s `scopeConflicts`, which pairs
 * cards by `status === "doing"` whether or not anybody has claimed them, and
 * so names cards this ledger has no row to hang a warning on.
 */
export function overlapsByCard(
    conflicts: ActivitySnapshot["conflicts"]
): Map<string, ClaimOverlap[]> {
    const byCard = new Map<string, ClaimOverlap[]>();
    const add = (card: string, other: string, paths: string[]) => {
        const rows = byCard.get(card) ?? [];
        const existing = rows.find((row) => row.other === other);
        if (existing) {
            existing.paths = [...new Set([...existing.paths, ...paths])].sort();
        } else {
            rows.push({ other, paths: [...new Set(paths)].sort() });
        }
        byCard.set(card, rows);
    };
    for (const conflict of conflicts) {
        // Every unordered pair, rather than `cards[0]` and `cards[1]`: the
        // producer emits pairs today, and a conflict carrying one id — or
        // three — must not throw or index a card against itself.
        const cards = conflict.cards;
        for (let left = 0; left < cards.length; left += 1) {
            for (let right = left + 1; right < cards.length; right += 1) {
                if (cards[left] === cards[right]) continue;
                add(cards[left], cards[right], conflict.paths);
                add(cards[right], cards[left], conflict.paths);
            }
        }
    }
    return byCard;
}

/**
 * The claims a ledger row can be drawn for.
 *
 * `unclaimed` is in the state union because `claimState()` answers it for a
 * card with no holder, and the snapshot filters those out before they reach
 * the wire. The filter stays because the type still permits one.
 *
 * Written as the one exclusion rather than a list of the four states that
 * pass: a state added to the protocol later should reach the reader wearing
 * the fallback colour, not vanish from a list that claims to be complete.
 */
export function activeClaims(claims: readonly ClaimEntry[]): ClaimEntry[] {
    return claims.filter((entry) => entry.claim.state !== "unclaimed");
}

/**
 * Where a claim sits in the ladder, worst first.
 *
 * The order is the Overview's verdict ladder, restated: a hanging claim
 * preempts a scope collision, and a collision preempts a claim that is merely
 * open. Two surfaces ranking the same claims differently is how a reader
 * learns to trust neither, and the Overview is already reading
 * `activity.claims` and `activity.conflicts` to say the same things.
 *
 * An explicit table, so that reordering anything else cannot quietly reorder
 * this.
 */
export function claimRank(state: string, conflicted: boolean): number {
    if (state === "orphaned") return 0;
    if (state === "stale") return 1;
    if (conflicted) return 2;
    if (state === "held") return 3;
    if (state === "live") return 4;
    return 5;
}

/**
 * Worst first, ties broken by how long the claim has been held and then by id.
 *
 * Total on purpose: the snapshot is refetched on every workspace change, and a
 * comparator with ties left unresolved would reshuffle rows under a reader
 * mid-read. Returns a new array, because `activity.claims` is React state and
 * sorting in place would mutate it.
 */
export function orderClaims(
    claims: readonly ClaimEntry[],
    overlaps: ReadonlyMap<string, ClaimOverlap[]>
): ClaimEntry[] {
    const rank = (entry: ClaimEntry) =>
        claimRank(entry.claim.state, (overlaps.get(entry.id)?.length ?? 0) > 0);
    return [...claims].sort((left, right) => {
        const byRank = rank(left) - rank(right);
        if (byRank) return byRank;
        // A claim whose timestamp did not parse has no age to compare, and it
        // sorts last within its rank rather than passing for the freshest.
        const leftAge = left.claim.ageHours ?? -1;
        const rightAge = right.claim.ageHours ?? -1;
        if (leftAge !== rightAge) return rightAge - leftAge;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
}
