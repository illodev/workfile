import assert from "node:assert/strict";
import test from "node:test";

import { ConfigError, DEFAULT_CONFIG, defineProject } from "../dist/src/index.js";

test("docs.layout defaults to kind and only accepts known layouts", () => {
    assert.equal(DEFAULT_CONFIG.docs.layout, "kind");
    assert.equal(
        defineProject({ schemaVersion: 2, name: "Layout", cards: { areas: ["api"] } })
            .docs.layout,
        "kind"
    );
    assert.equal(
        defineProject({
            schemaVersion: 2,
            name: "Layout",
            cards: { areas: ["api"] },
            docs: { layout: "flat" }
        }).docs.layout,
        "flat"
    );
    assert.throws(
        () =>
            defineProject({
                schemaVersion: 2,
                name: "Layout",
                cards: { areas: ["api"] },
                docs: { layout: "by-year" }
            }),
        (error) => {
            assert.equal(error.code, "CONFIG_DOC_LAYOUT_INVALID");
            assert.equal(error.details.issues[0].path, "docs.layout");
            return true;
        }
    );
});

test("configuration failures expose stable diagnostic codes", () => {
    assert.throws(
        () =>
            defineProject({
                schemaVersion: 2,
                name: "Broken",
                cards: { areas: ["api", "api"] }
            }),
        (error) => {
            assert.ok(error instanceof ConfigError);
            assert.equal(error.code, "CONFIG_CARDS_AREA_DUPLICATE");
            assert.equal(error.exitCode, 2);
            assert.equal(error.details.issues[0].path, "cards.areas");
            return true;
        }
    );
});

test("configuration rejects unsupported agent and CI targets", () => {
    assert.throws(
        () =>
            defineProject({
                schemaVersion: 2,
                name: "Broken agents",
                cards: { areas: ["api"] },
                agents: { targets: ["unknown-agent"] }
            }),
        (error) => {
            assert.equal(error.code, "CONFIG_AGENT_TARGET_UNSUPPORTED");
            return true;
        }
    );
    assert.throws(
        () =>
            defineProject({
                schemaVersion: 2,
                name: "Broken CI",
                cards: { areas: ["api"] },
                ci: { targets: ["jenkins"] }
            }),
        (error) => {
            assert.equal(error.code, "CONFIG_CI_TARGET_UNSUPPORTED");
            return true;
        }
    );
});
