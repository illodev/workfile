import assert from "node:assert/strict";
import test from "node:test";

import { createTestWorkspace } from "./support/workspace.ts";

import { renderCiFiles } from "../dist/src/index.js";

/**
 * What the generated CI targets hold, pinned per target.
 *
 * T-0188 audited the three of them for what a card-declared command could
 * reach, and the answers differ enough that a single assertion would say
 * nothing: GitHub has a permission scope and a token that leaks through the
 * checkout, GitLab has neither a scope nor a pipeline until somebody includes
 * the file, and the generic script has no model at all. These are the parts of
 * each answer a template can actually carry.
 */
async function bodies() {
    const { workspace, cleanup } = await createTestWorkspace();
    try {
        const rendered = renderCiFiles(workspace, {
            targets: ["github", "gitlab", "generic"]
        });
        return Object.fromEntries(
            rendered.map((file: any) => [file.id, file.block.body])
        ) as Record<string, string>;
    } finally {
        await cleanup();
    }
}

test("the GitHub workflow grants nothing it does not need", async () => {
    const github = (await bodies()).github;

    // Top-level `{}` rather than `contents: read`: a second job added by hand
    // must start from nothing rather than inherit a scope nobody chose for it.
    assert.match(github, /^permissions: \{\}$/m);
    assert.doesNotMatch(github, /^permissions:\n {2}contents: read$/m);
    assert.match(github, /^ {4}permissions:\n {6}contents: read$/m);

    // actions/checkout defaults to persist-credentials: true, which writes
    // GITHUB_TOKEN into .git/config as an http.extraheader where any later
    // `run:` step can read it. Nothing in this workflow pushes.
    assert.match(github, /persist-credentials: false/);
    assert.match(github, /timeout-minutes: 10/);

    // The trigger is `pull_request`, not `pull_request_target`. That is what
    // makes GitHub withhold the base repository's secrets from a fork, and it
    // is the actual protection here — the permission scope above only bounds
    // the token.
    assert.match(github, /^on:\n {2}pull_request:$/m);
    assert.doesNotMatch(github, /pull_request_target/);
});

test("the GitLab job says what GitLab cannot enforce", async () => {
    const gitlab = (await bodies()).gitlab;

    // There is no `permissions:` equivalent to emit, so what the template can
    // carry is the statement of that plus the two bounds it does have.
    assert.match(gitlab, /interruptible: true/);
    assert.match(gitlab, /timeout: 10m/);
    assert.match(gitlab, /no per-job permission scope/);
    assert.match(gitlab, /protected/);
    // Inert until it is included, which is the failure that reads as "the
    // pipeline passed" when no pipeline ran at all.
    assert.match(gitlab, /include: \{ local: \.gitlab\/workfile\.yml \}/);
});

test("the generic script states the contract it cannot enforce", async () => {
    const generic = (await bodies()).generic;

    assert.match(generic, /^#!\/usr\/bin\/env sh$/m);
    assert.match(generic, /^set -eu$/m);
    assert.match(generic, /inherits the\n# entire environment/);
});

test("every target states that the checkout's own config executes, both hops", async () => {
    // T-0213. The first hop was already stated on GitHub only, and stating it
    // alone reads as "it imports a settings file" — the second hop is that
    // `doctor` then *calls functions the config handed it*, which is what makes
    // this worth pricing. A reader who has to discover that from the source has
    // been told the wrong thing, so it is pinned on all three.
    for (const [id, body] of Object.entries(await bodies())) {
        assert.match(body, /`import\(\)`s project\.config\.mjs/, id);
        assert.match(body, /module body/, id);
        assert.match(body, /healthCheck/, id);
        assert.match(body, /Nothing in Workfile sandboxes it/, id);
    }
});

test("no generated target lowers a card-declared command into a shell", async () => {
    // The pin that keeps the next card honest. A `verify[].run` is an argument
    // vector precisely so that no shell parses it; writing one into a YAML
    // `run:` block or into the generic sh script would hand it straight back to
    // one and make the allowlist a claim about a string again.
    for (const [id, body] of Object.entries(await bodies())) {
        assert.doesNotMatch(body, /card verify/, id);
        assert.doesNotMatch(body, /\$\{\{/, id);
    }
});
