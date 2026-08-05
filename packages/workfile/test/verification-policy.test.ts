import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createTestWorkspace } from "./support/workspace.ts";

import {
    bulkPatchCards,
    createCard,
    createMcpProtocolServer,
    diagnoseCards,
    loadCards,
    loadWorkspace,
    MCP_LEGACY_PROTOCOL_VERSION,
    patchCard,
    patchCardBody,
    releaseCard,
    runDoctor,
    setCardAcceptance,
    startProjectServer,
    transitionCard
} from "../dist/src/index.js";
import { defineProject } from "../dist/src/config/define-project.js";

const BODY = [
    "Prose the author wrote.",
    "",
    "## Acceptance criteria",
    "",
    "- [ ] The policy refuses a method the area does not accept.",
    ""
].join("\n");

const AREAS = ["api", "web", "infra", "docs"];

/**
 * The golden fixture with a stated policy, loaded through the real loader.
 *
 * Written as a config file rather than assembled in memory, for the reason
 * `verify-allowlist.test.ts` gives: every claim in this suite is that the gate
 * reads *what the project declares*, and a hand-built `workspace.config` would
 * prove it against an object this file made up instead of one `loadWorkspace`
 * produced. `undefined` writes no `verification` key at all, which is the
 * default every existing project is on.
 *
 * Called a second time on the same root to tighten a policy after cards have
 * closed under it, which is the only way to reach the doctor's two findings.
 */
async function declarePolicy(root: string, methods: unknown, areas = AREAS) {
    await writeFile(
        join(root, "project.config.mjs"),
        `export default ${JSON.stringify(
            {
                schemaVersion: 2,
                name: "Golden workspace",
                cards: {
                    areas,
                    ...(methods === undefined ? {} : { verification: { methods } })
                }
            },
            null,
            4
        )};\n`
    );
    return loadWorkspace({ root });
}

async function workspaceAccepting(methods: unknown, areas = AREAS) {
    const { root, cleanup } = await createTestWorkspace();
    return { root, cleanup, workspace: await declarePolicy(root, methods, areas) };
}

/** A card with one criterion, proven, one call away from `done`. */
async function provenCard(workspace, area = "api", title = "A card to close") {
    const { id } = await createCard(workspace, { title, area });
    await patchCardBody(workspace, id, { body: BODY });
    await setCardAcceptance(workspace, id, { check: [1] });
    return id;
}

async function reload(workspace, id): Promise<any> {
    const { cards } = await loadCards(workspace);
    return cards.find((card: any) => card.id === id);
}

/**
 * The reported policy, read off an untyped workspace.
 *
 * `EffectiveProjectSchema["cards"]` does not describe `verification` yet — the
 * shared `src/types.ts` is edited by the rest of this batch — so the value is
 * reached the same way `load-workspace.ts` builds it. See the note on
 * `verificationSchema` there.
 */
function reportedVerification(workspace): any {
    return workspace.schema.cards.verification;
}

function errorOf(promise) {
    return promise.then(
        () => null,
        (error) => error
    );
}

/**
 * The incumbent behaviour, pinned before anything else.
 *
 * This is the criterion the card states as a defence rather than as a feature:
 * every project written before `cards.verification.methods` existed declares
 * nothing, and a gate that read "declares nothing" as "declares nothing
 * acceptable" would refuse every close in every existing repository on upgrade.
 * The three doors are all exercised because that is the failure this module
 * keeps having — a rule enforced at one entrance of four.
 */
test("a project that declares no policy accepts every method, on every door", async () => {
    const { workspace, cleanup } = await workspaceAccepting(undefined);
    try {
        assert.deepEqual(reportedVerification(workspace), {
            commands: [],
            // Not empty, and it cannot be: a command that never exits has to
            // be given up on eventually, so `card verify` always has a number
            // and the schema reports the one it will use.
            timeoutSeconds: 600,
            methods: {}
        });

        const bare = await provenCard(workspace, "api", "Closed with no method");
        await transitionCard(workspace, bare, "done", { actor: "alvaro" });
        assert.equal((await reload(workspace, bare)).verified.method, "local");

        const named = await provenCard(workspace, "api", "Closed as ci");
        await transitionCard(workspace, named, "done", {
            actor: "alvaro",
            method: "ci",
            run: "https://ci.example/runs/1"
        });
        assert.equal((await reload(workspace, named)).verified.method, "ci");

        const patched = await provenCard(workspace, "web", "Closed by patch");
        await patchCard(workspace, patched, { status: "done" }, {
            actor: "alvaro",
            method: "manual",
            evidence: "Looked at it in staging."
        });
        assert.equal((await reload(workspace, patched)).verified.method, "manual");

        const released = await provenCard(workspace, "docs", "Closed by release");
        await releaseCard(workspace, released, {
            actor: "alvaro",
            status: "done"
        });
        assert.equal((await reload(workspace, released)).verified.method, "local");

        // And nothing in the doctor has an opinion either.
        const report = await diagnoseCards({
            ...(await loadCards(workspace)),
            workspace
        });
        assert.deepEqual(
            report.issues.filter((issue: any) =>
                issue.code.startsWith("verification-")
            ),
            []
        );
    } finally {
        await cleanup();
    }
});

test("the policy is reported by workfile schema, both halves of it", async () => {
    // Criterion 1. Reported through `effectiveSchema`, which is what
    // `workfile schema`, `GET /api/v2/schema` and `project_workspace` all
    // print — so an agent can read the rule instead of meeting it as a refusal.
    const { workspace, cleanup } = await workspaceAccepting({
        api: ["ci"],
        "*": ["ci", "manual"]
    });
    try {
        assert.deepEqual(reportedVerification(workspace).methods, {
            api: ["ci"],
            "*": ["ci", "manual"]
        });
        // Both halves of `cards.verification`, because reporting one under that
        // name would misdescribe the key it claims to report.
        assert.deepEqual(reportedVerification(workspace).commands, []);
    } finally {
        await cleanup();
    }
});

test("done is refused when the area does not accept the method, and names what it does", async () => {
    // Criterion 2, on the door a human uses.
    const { workspace, cleanup } = await workspaceAccepting({ api: ["ci"] });
    try {
        const id = await provenCard(workspace);
        const error = await errorOf(
            transitionCard(workspace, id, "done", {
                actor: "alvaro",
                method: "manual",
                evidence: "I read it."
            })
        );
        assert.equal(error.code, "CARD_VERIFICATION_METHOD_REFUSED");
        assert.equal(error.status, 409);
        assert.match(error.message, /accepts ci/);
        assert.deepEqual(error.details.accepted, ["ci"]);
        assert.equal(error.details.area, "api");

        // Refused *before* any byte is written: the card is where it was, with
        // no verification and no trail line about a move that did not happen.
        const after = await reload(workspace, id);
        assert.equal(after.status, "backlog");
        assert.equal(after.verified, undefined);

        // And the method the area does accept still closes it.
        await transitionCard(workspace, id, "done", {
            actor: "alvaro",
            method: "ci",
            run: "https://ci.example/runs/7"
        });
        assert.equal((await reload(workspace, id)).verified.method, "ci");
    } finally {
        await cleanup();
    }
});

/**
 * The decision the critique asked to be made explicitly rather than inherited.
 *
 * "No method recorded, therefore nothing to check" is a policy, and it is the
 * permissive one: it would let an agent close a `core` card under
 * `{ core: ["ci"] }` by supplying no method at all. T-0186 resolves an unnamed
 * method to `local`, so the strict reading is available and this is it — a gate
 * you get past by typing less is not a gate.
 */
test("naming no method is judged as local, not exempted", async () => {
    const { workspace, cleanup } = await workspaceAccepting({ api: ["ci"] });
    try {
        const id = await provenCard(workspace);
        const error = await errorOf(
            transitionCard(workspace, id, "done", { actor: "alvaro" })
        );
        assert.equal(error.code, "CARD_VERIFICATION_METHOD_REFUSED");
        assert.equal(error.details.method, "local");
        assert.match(error.message, /would be verified by local/);
    } finally {
        await cleanup();
    }
});

test("every door to done passes the policy, and the ones that are not closes do not", async () => {
    // The module's recurring failure, checked for the third gate: `patch`,
    // `release` and `bulk` are the doors an agent reaches for, and they were
    // the leaky ones for the acceptance gate.
    const { workspace, cleanup } = await workspaceAccepting({ "*": ["ci"] });
    try {
        const doors: Array<[string, (id: string) => Promise<unknown>]> = [
            ["patch", (id) => patchCard(workspace, id, { status: "done" }, { actor: "a" })],
            ["release", (id) => releaseCard(workspace, id, { actor: "a", status: "done" })],
            ["transition", (id) => transitionCard(workspace, id, "done", { actor: "a" })]
        ];
        for (const [name, close] of doors) {
            const id = await provenCard(workspace, "api", `Door: ${name}`);
            const error = await errorOf(close(id));
            assert.equal(
                error?.code,
                "CARD_VERIFICATION_METHOD_REFUSED",
                `${name} closed past the policy`
            );
            assert.equal((await reload(workspace, id)).status, "backlog");
        }

        // `bulkPatchCards` reports per id rather than throwing, which is the
        // whole of what a bulk close does under a policy: the same refusal,
        // delivered as a failed row instead of an exception. It passes no
        // force and no reason, so a bulk close cannot waive the gate — the
        // caller has to name a method the area accepts, or close the cards one
        // at a time.
        const bulk = await provenCard(workspace, "api", "Door: bulk");
        const refused: any = await bulkPatchCards(workspace, [bulk], {
            status: "done"
        });
        assert.equal(refused.failed, 1);
        assert.equal(
            refused.results[0].error.code,
            "CARD_VERIFICATION_METHOD_REFUSED"
        );
        assert.equal((await reload(workspace, bulk)).status, "backlog");

        const accepted: any = await bulkPatchCards(workspace, [bulk], {
            status: "done"
        }, { method: "ci", run: "https://ci.example/runs/9" });
        assert.equal(accepted.updated, 1);
        assert.equal((await reload(workspace, bulk)).verified.method, "ci");

        // A write that is not a close is not gated. `review` has no
        // verification to judge, and gating it would refuse the very status the
        // protocol tells an agent to use while verification is pending.
        const open = await provenCard(workspace, "api", "Moved to review");
        await transitionCard(workspace, open, "review", { actor: "a" });
        assert.equal((await reload(workspace, open)).status, "review");
    } finally {
        await cleanup();
    }
});

test("a card already done is not re-gated by a write that does not close it", async () => {
    // A close records its verification once. Releasing or patching a card that
    // is already `done` writes no new block, so there is nothing for the policy
    // to judge — and gating it would leave a forced close's own claim stuck.
    const { root, workspace, cleanup } = await workspaceAccepting(undefined);
    try {
        const id = await provenCard(workspace);
        await transitionCard(workspace, id, "done", { actor: "alvaro" });
        assert.equal((await reload(workspace, id)).verified.method, "local");

        const strict = await declarePolicy(root, { api: ["ci"] });
        await releaseCard(strict, id, { actor: "alvaro" });
        const after = await reload(strict, id);
        assert.equal(after.status, "done");
        assert.equal(after.verified.method, "local");
    } finally {
        await cleanup();
    }
});

/**
 * The gate is waivable, like the two beside it, and the record says so.
 *
 * The interesting half is the second assertion. A forced close records
 * `forced` — not the method that was refused — because T-0186 made `forced`
 * derived from what was waived, and this gate feeds the same closure. So the
 * escape and the record agree: the card does not claim a `manual` verification
 * the project rejected, it says the policy was set aside and the trail carries
 * the reason.
 */
test("force waives the policy, names it on the trail, and records forced", async () => {
    const { workspace, cleanup } = await workspaceAccepting({ api: ["ci"] });
    try {
        const id = await provenCard(workspace);
        // A reason is demanded, because a gate was actually waived.
        const bare = await errorOf(
            transitionCard(workspace, id, "done", { actor: "alvaro", force: true })
        );
        assert.equal(bare.code, "CARD_FORCE_REASON_REQUIRED");
        assert.match(bare.message, /api's verification policy/);

        await transitionCard(workspace, id, "done", {
            actor: "alvaro",
            force: true,
            reason: "CI has been down since Tuesday and the release is today."
        });
        const after = await reload(workspace, id);
        assert.equal(after.verified.method, "forced");
        assert.match(
            after.body,
            /review|backlog → done \(forced past api's verification policy: CI has been down/
        );
    } finally {
        await cleanup();
    }
});

test("a forced close may not also name a method", async () => {
    // The record has one answer for how a card was proved, and on a forced
    // close that answer is `forced`. Naming a method as well would leave the
    // frontmatter and the trail line free to disagree, which is the rule
    // T-0186 already enforces for a waived acceptance gate — the message tells
    // the caller which of the two to drop.
    const { workspace, cleanup } = await workspaceAccepting({ api: ["ci"] });
    try {
        const id = await provenCard(workspace);
        const error = await errorOf(
            transitionCard(workspace, id, "done", {
                actor: "alvaro",
                method: "manual",
                evidence: "I looked.",
                force: true,
                reason: "Nothing else can prove this one."
            })
        );
        assert.equal(error.code, "CARD_VERIFICATION_METHOD_CONFLICT");
        assert.match(error.message, /its method is `forced`/);
    } finally {
        await cleanup();
    }
});

test("a close already forced past the criteria is not judged twice", async () => {
    // `forced` is not a method any project declares, and the reason it was
    // forced is already on the trail. Asking the policy about it would be
    // asking whether the project accepts being forced, which `--force` has
    // answered.
    const { workspace, cleanup } = await workspaceAccepting({ api: ["ci"] });
    try {
        const { id } = await createCard(workspace, {
            title: "Unproven and forced",
            area: "api"
        });
        await patchCardBody(workspace, id, { body: BODY });
        await transitionCard(workspace, id, "done", {
            actor: "alvaro",
            force: true,
            reason: "The last criterion needs hardware CI does not have."
        });
        const after = await reload(workspace, id);
        assert.equal(after.verified.method, "forced");
        // One gate named, not two: the policy never ran.
        assert.match(after.body, /forced past 1 unproven criterion:/);
        assert.doesNotMatch(after.body, /verification policy/);
    } finally {
        await cleanup();
    }
});

test("the policy falls back to * and covers areas declared after it was written", async () => {
    const { workspace, cleanup } = await workspaceAccepting({
        docs: ["manual"],
        "*": ["ci"]
    });
    try {
        // `docs` is named, so it gets its own rule.
        const prose = await provenCard(workspace, "docs", "A written page");
        await transitionCard(workspace, prose, "done", {
            actor: "alvaro",
            method: "manual",
            evidence: "Read the rendered page end to end."
        });
        assert.equal((await reload(workspace, prose)).verified.method, "manual");

        // `web` is not, so `*` answers for it — which is the whole point: an
        // area added after the policy was written does not escape it.
        const app = await provenCard(workspace, "web", "A screen");
        const error = await errorOf(
            transitionCard(workspace, app, "done", {
                actor: "alvaro",
                method: "manual",
                evidence: "Clicked it."
            })
        );
        assert.equal(error.code, "CARD_VERIFICATION_METHOD_REFUSED");
        assert.deepEqual(error.details.accepted, ["ci"]);
    } finally {
        await cleanup();
    }
});

test("a patch that moves and closes a card is judged by the area it lands in", async () => {
    // `area` is patchable, so one write can do both. The area the card ends up
    // in is the one that answers: that is where the `verified` block will sit
    // and where anyone auditing the close will look for the rule it was held
    // to. Judging the area it left would let a card escape a policy by moving
    // out of it in the same call that closes it.
    const { workspace, cleanup } = await workspaceAccepting({ docs: ["manual"] });
    try {
        const leaving = await provenCard(workspace, "docs", "Leaving docs");
        await patchCard(workspace, leaving, { status: "done", area: "web" }, {
            actor: "alvaro"
        });
        const moved = await reload(workspace, leaving);
        assert.equal(moved.area, "web");
        assert.equal(moved.verified.method, "local");

        const arriving = await provenCard(workspace, "web", "Arriving in docs");
        const error = await errorOf(
            patchCard(workspace, arriving, { status: "done", area: "docs" }, {
                actor: "alvaro"
            })
        );
        assert.equal(error.code, "CARD_VERIFICATION_METHOD_REFUSED");
        assert.equal(error.details.area, "docs");
    } finally {
        await cleanup();
    }
});

test("an area named toString falls through to * instead of a prototype member", async () => {
    // `declared[area]` on a plain object answers `toString` with a function,
    // which `Array.isArray` would reject and the reader would then treat as no
    // policy at all — a silent hole opened by naming an area badly.
    const { workspace, cleanup } = await workspaceAccepting(
        { "*": ["ci"] },
        ["toString", "api"]
    );
    try {
        const id = await provenCard(workspace, "toString", "An awkward area");
        const error = await errorOf(
            transitionCard(workspace, id, "done", { actor: "alvaro" })
        );
        assert.equal(error.code, "CARD_VERIFICATION_METHOD_REFUSED");
        assert.deepEqual(error.details.accepted, ["ci"]);
    } finally {
        await cleanup();
    }
});

test("doctor reports a done card whose method the policy no longer accepts", async () => {
    // Criterion 4, and the shape of it matters: reported, never re-gated. A
    // project that declares a policy on a repository with two hundred closed
    // cards gets a list to work through and a baseline to accept, not two
    // hundred cards it can no longer touch.
    const { root, workspace, cleanup } = await workspaceAccepting(undefined);
    try {
        const id = await provenCard(workspace);
        await transitionCard(workspace, id, "done", { actor: "alvaro" });
        // Unproven on purpose: `force` only records `forced` when it actually
        // waived something, so a card with every box ticked would close as
        // `local` however hard it was forced.
        const { id: forced } = await createCard(workspace, {
            title: "Forced closed",
            area: "api"
        });
        await patchCardBody(workspace, forced, { body: BODY });
        await transitionCard(workspace, forced, "done", {
            actor: "alvaro",
            force: true,
            reason: "Nothing here can be proved by a command."
        });

        const strict = await declarePolicy(root, { api: ["ci"] });
        const report = await diagnoseCards({
            ...(await loadCards(strict)),
            workspace: strict
        });
        const found: any[] = report.issues.filter(
            (issue: any) => issue.code === "verification-method-unaccepted"
        );
        assert.equal(found.length, 1);
        const [reported] = found;
        assert.equal(reported.severity, "warning");
        assert.equal(reported.id, id);
        assert.deepEqual(reported.details.accepted, ["ci"]);
        // A warning, so the run still passes: closed work is not invalidated by
        // a rule written after it shipped.
        assert.equal(report.ok, true);

        // And the exemptions, which are why the count above is 1 and not 3. The
        // forced card is silent — its waiver is on its own trail line, and
        // `forced` is not a method any policy names — and so is every card in
        // the golden fixture, closed before a `verified` block existed at all.
        assert.equal(
            (await reload(strict, forced)).verified.method,
            "forced"
        );
        assert.ok(
            (await loadCards(strict)).cards.some(
                (card: any) => card.status === "done" && !card.verified
            ),
            "the fixture no longer carries a done card with no verified block"
        );
    } finally {
        await cleanup();
    }
});

/**
 * Removing an area must not brick the workspace.
 *
 * The alternative — refusing the config — would mean that deleting an area from
 * `cards.areas` takes `doctor`, `card list` and the UI down until somebody
 * finds the second place that named it, and the command that would have
 * explained the failure is one of the casualties. So it loads, and the doctor
 * says the policy applies to nothing, beside the identical finding for a
 * `search.provider` that resolves to no integration.
 */
test("a policy naming an area the project dropped loads, and doctor says so", async () => {
    const { root, workspace, cleanup } = await workspaceAccepting(
        { legacy: ["ci"], api: ["ci"] },
        ["api", "web", "infra", "docs"]
    );
    try {
        assert.deepEqual(reportedVerification(workspace).methods.legacy, ["ci"]);
        const report = await runDoctor(workspace, { checkGit: false });
        const found = report.issues.filter(
            (issue: any) => issue.code === "verification-policy-area-unknown"
        );
        assert.equal(found.length, 1);
        assert.equal(found[0].severity, "warning");
        assert.deepEqual(found[0].details.areas, ["legacy"]);
        assert.match(found[0].message, /applies to no card/);
        assert.equal(report.counts.error, 0);
        void root;
    } finally {
        await cleanup();
    }
});

test("the config refuses a method no project can declare", async () => {
    const configure = (cards: any) =>
        defineProject({ schemaVersion: 2, name: "Bad", cards });
    const cases: Array<[string, unknown]> = [
        // A typo silently matches nothing, so it is refused rather than left to
        // refuse every close in the area it names.
        ["CONFIG_CARDS_VERIFICATION_METHOD_INVALID", { api: ["cy"] }],
        ["CONFIG_CARDS_VERIFICATION_METHOD_INVALID", { api: ["forced"] }],
        // Empty reads as "unrestricted" and would mean "impossible". Say `*`.
        ["CONFIG_LIST_EMPTY", { api: [] }],
        ["CONFIG_LIST_INVALID", { api: "ci" }],
        ["CONFIG_CARDS_VERIFICATION_METHODS_INVALID", ["ci"]]
    ];
    for (const [code, methods] of cases) {
        assert.throws(
            () => configure({ areas: ["api"], verification: { methods } }),
            (error: any) => {
                assert.equal(error.code, code);
                assert.match(
                    error.details.issues[0].path,
                    /^cards\.verification\.methods/
                );
                return true;
            },
            `${code}: ${JSON.stringify(methods)}`
        );
    }

    // `forced` earns a sentence of its own, because refusing it is a statement
    // about what the record means rather than a spelling check.
    const forced = await errorOf(
        Promise.resolve().then(() =>
            configure({ areas: ["api"], verification: { methods: { api: ["forced"] } } })
        )
    );
    assert.match(forced.details.issues[0].message, /not declarable/);

    // An area the project does not declare is *not* refused here. See the
    // doctor test above for why.
    assert.doesNotThrow(() =>
        configure({ areas: ["api"], verification: { methods: { gone: ["ci"] } } })
    );
    // And the two halves of `cards.verification` stay independent: declaring
    // only a policy must not require an allowlist, or the key could never be
    // adopted one half at a time.
    assert.doesNotThrow(() =>
        configure({ areas: ["api"], verification: { methods: { api: ["ci"] } } })
    );
});

test("the refusal reaches the HTTP and MCP surfaces", async () => {
    // The gate lives under the mutation, so every surface inherits it — but
    // "inherits it" is exactly the claim this module has been wrong about
    // before, and neither route can carry a method the caller never sent.
    const { workspace, cleanup } = await workspaceAccepting({ "*": ["ci"] });
    const http = await startProjectServer(workspace, { port: 0 });
    try {
        const id = await provenCard(workspace);
        const response = await fetch(`${http.url}/api/v2/cards/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                status: "done",
                actor: "alvaro",
                method: "manual",
                evidence: "I read it."
            })
        });
        assert.equal(response.status, 409);
        const body: any = await response.json();
        assert.equal(body.error.code, "CARD_VERIFICATION_METHOD_REFUSED");

        const schema = await fetch(`${http.url}/api/v2/schema`);
        const reported: any = await schema.json();
        assert.deepEqual(reported.cards.verification.methods, { "*": ["ci"] });

        // MCP, where the refusal is final: no tool there carries force or a
        // reason, so an agent meets the policy and has to satisfy it.
        const server = createMcpProtocolServer(workspace, { version: "0.6.0" });
        await server.handle({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
                protocolVersion: MCP_LEGACY_PROTOCOL_VERSION,
                capabilities: {},
                clientInfo: { name: "test-client", version: "1.0.0" }
            }
        });
        await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" });
        const result: any = await server.handle({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
                name: "project_card_transition",
                arguments: { id: await provenCard(workspace, "api", "Over MCP"), status: "done" }
            }
        });
        assert.equal(result.result.isError, true);
        assert.match(
            JSON.stringify(result.result.content),
            /CARD_VERIFICATION_METHOD_REFUSED/
        );
    } finally {
        await http.close();
        await cleanup();
    }
});
