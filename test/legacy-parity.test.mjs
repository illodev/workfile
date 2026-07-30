import assert from "node:assert/strict";
import test from "node:test";

import * as legacy from "./fixtures/legacy-v1/board/backlog-lib.mjs";
import { parseCard, parseValue, serializeValue } from "../dist/src/index.js";

const sample = `---\nid: T-0042\ntitle: Compatibilidad v1\nstatus: doing\ntype: task\npriority: high\narea: api\ntags: [one, "two, three"]\nclaimed_by: abc\nclaimed_at: 2026-07-24\ncreated: 2026-07-24\nupdated: 2026-07-24\n---\n\nBody`;

test("v2 frontmatter codec preserves v1 supported values", () => {
    for (const value of ["Plain", 'a: b # c', '"Quoted"']) {
        assert.equal(serializeValue("title", value), legacy.serializeValue("title", value));
        assert.equal(parseValue("title", legacy.serializeValue("title", value)), value);
    }
    assert.deepEqual(
        parseCard("T-0042-compat.md", sample),
        legacy.parseTask("T-0042-compat.md", sample)
    );
});
