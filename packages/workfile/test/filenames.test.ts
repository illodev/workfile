import assert from "node:assert/strict";
import test from "node:test";

import {
    expectedRecordFileName,
    staleFilenames
} from "../dist/src/modules/health/filenames.js";

/**
 * A retitled record keeps a filename describing work it no longer describes, and
 * until T-0223 only cards noticed.
 *
 * Found by doing it: LRN-0033 was retitled through `memory patch` and sat under
 * `LRN-0033-a-card-outlives-the-decision-it-was-filed-under-…` with `doctor`
 * reporting 0 errors and 0 warnings. The filename is the handle people and agents
 * grep by — which is the argument the card rule already made, and it is not an
 * argument about cards.
 */

const record = (fields: Record<string, unknown>) => ({
    id: "X-0001",
    title: "A title",
    kind: "card",
    path: ".project/cards/X-0001-a-title.md",
    ...fields
});

test("the per-kind length caps stay different, because they have to", () => {
    // A card slugs to 50 characters, a document to 60, a memory record and a
    // fragment to 70. That is load-bearing rather than tidy-up work waiting to
    // happen: unifying them would rename every existing record whose title
    // crosses the new bound, in one sweep, on the next `--fix`.
    const long =
        "A title long enough to reach past fifty characters and keep going after that";
    const card = expectedRecordFileName(record({ kind: "card", title: long }));
    const memory = expectedRecordFileName(record({ kind: "memory", title: long }));
    const doc = expectedRecordFileName(
        record({ kind: "doc", managed: true, title: long })
    );
    assert.ok(card && memory && doc);
    assert.ok(
        card.length < doc.length && doc.length < memory.length,
        `the caps collapsed: card ${card.length}, doc ${doc.length}, memory ${memory.length}`
    );
});

test("what the rule refuses to have an opinion about", () => {
    // An indexed document is somebody's README, outside the protocol directory
    // and read-only through the protocol. Renaming it would be this tool editing
    // a repository's own tree to match a title it does not own.
    assert.equal(
        expectedRecordFileName(
            record({ kind: "doc", managed: false, path: "README.md" })
        ),
        null
    );

    // A released fragment is published history, and the protocol already refuses
    // to retitle one — so this covers the fragment edited by hand.
    assert.equal(
        expectedRecordFileName(
            record({
                kind: "change",
                released: true,
                path: ".project/changelog/releases/0-1-0/fragments/X-0001-a.md"
            })
        ),
        null
    );
    assert.equal(
        expectedRecordFileName(
            record({
                kind: "change",
                released: false,
                path: ".project/changelog/releases/0-1-0/fragments/X-0001-a.md"
            })
        ),
        null,
        "a fragment inside a release directory is history whatever its flag says"
    );
    assert.ok(
        expectedRecordFileName(
            record({
                kind: "change",
                released: false,
                path: ".project/changelog/unreleased/X-0001-a.md"
            })
        ),
        "an unreleased fragment is in scope"
    );

    // A release is named after its version, so the comparison does not apply.
    assert.equal(expectedRecordFileName(record({ kind: "release" })), null);

    // And a record with no title has nothing to derive from.
    assert.equal(expectedRecordFileName(record({ title: "" })), null);
});

test("a filename that does not start with the id is a different fault", () => {
    // `filename-mismatch` is that one, and renumbering rather than renaming is
    // its repair. Reporting both would offer two repairs for one file.
    assert.deepEqual(
        staleFilenames([
            record({ path: ".project/cards/wandered-off.md", title: "Something else" })
        ]),
        []
    );
});

test("each finding is attributed to the module that owns the record", () => {
    const stale = staleFilenames([
        record({ kind: "card", title: "Renamed", path: ".project/cards/X-0001-old.md" }),
        record({
            kind: "memory",
            title: "Renamed",
            path: ".project/memory/learnings/X-0001-old.md"
        }),
        record({
            kind: "doc",
            managed: true,
            title: "Renamed",
            path: ".project/docs/X-0001-old.md"
        }),
        record({
            kind: "change",
            released: false,
            title: "Renamed",
            path: ".project/changelog/unreleased/X-0001-old.md"
        })
    ]);
    // T-0218's field, so a reader can tell where a finding came from — and the
    // one case it exists for is an integration, which is not one of these.
    assert.deepEqual(
        stale.map((entry) => entry.module),
        ["cards", "memory", "docs", "changelog"]
    );
    for (const entry of stale) {
        assert.equal(entry.current, "X-0001-old.md");
        assert.equal(entry.expected, "X-0001-renamed.md");
    }
});
