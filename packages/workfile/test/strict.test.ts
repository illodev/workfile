import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { readJsonc } from "./support/jsonc.ts";

const root = fileURLToPath(new URL("../", import.meta.url));


const baseline = JSON.parse(
    await readFile(new URL("../strict-baseline.json", import.meta.url), "utf8")
);

// The ratchet itself runs in `check`. What it cannot notice is a baseline entry
// for a file that no longer exists: deleting a module would leave its allowance
// behind, and a later file at the same path would inherit permission to be
// unsafe. Entries must be earned by a file that is actually there.
test("the strict baseline has no phantom entries", async () => {
    for (const file of Object.keys(baseline)) {
        await assert.doesNotReject(
            access(new URL(file, `file://${root}`)),
            `${file} is in strict-baseline.json but does not exist`
        );
    }
});

test("the strict project enables the flag it is named for", async () => {
    const config = await readJsonc(new URL("../tsconfig.strict.json", import.meta.url));
    assert.equal(config.extends, "./tsconfig.json");
    assert.equal(config.compilerOptions.strictNullChecks, true);

    // The base project must stay lenient until the baseline is empty: turning
    // the flag on in both would make `build:core` fail on the 369 errors the
    // ratchet exists to hold at bay.
    const base = await readJsonc(new URL("../tsconfig.json", import.meta.url));
    const empty = Object.keys(baseline).length === 0;
    assert.equal(
        base.compilerOptions.strictNullChecks ?? false,
        empty,
        empty
            ? "the baseline is empty — move strictNullChecks into tsconfig.json"
            : "tsconfig.json must stay lenient while the baseline is non-empty"
    );
});
