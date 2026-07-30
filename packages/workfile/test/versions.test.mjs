import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("workspace packages stay version-locked to the root", async () => {
    // The same check the release workflow runs; failing here stops the drift
    // at the commit that introduced it instead of at tag time.
    await assert.doesNotReject(() =>
        execute(
            process.execPath,
            ["./scripts/sync-workspace-versions.mjs", "--check"],
            { cwd: repoRoot }
        )
    );
});
