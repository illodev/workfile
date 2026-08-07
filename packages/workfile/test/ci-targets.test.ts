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

/**
 * The pin T-0188 left for the next card, kept and made precise.
 *
 * It read `doesNotMatch(/card verify/)` and `doesNotMatch(/\$\{\{/)` on every
 * target, and T-0189 is the card it was left for — so it is worth saying exactly
 * what it was protecting and what it was not.
 *
 * It was protecting two things. A `verify[].run` is an argument vector precisely
 * so that no shell parses it, and writing one into a YAML `run:` block would hand
 * it back to one and make the allowlist a claim about a string again. And a
 * `\${{ }}` inside a `run:` block is expanded by Actions *before* the shell sees
 * it, so a branch name or a PR title interpolated there is code.
 *
 * Neither is what invoking the runner does. `card verify --changed` is a fixed
 * argument vector of the tool's own flags; the card's command never appears in
 * the workflow, and the tool spawns it with no shell — which is the property
 * T-0188 actually bought. So the two blanket assertions are replaced by the two
 * rules they stood for, and the second is now checked where it matters rather
 * than everywhere: inside `run:` scripts only, since `env:` and `if:` are where
 * an expression belongs.
 */
test("no generated target hands a card's command, or an expression, to a shell", async () => {
    for (const [id, body] of Object.entries(await bodies())) {
        // Nothing composes a command out of card data. The workflow names the
        // tool and its flags; what the tool then runs it reads off the card and
        // spawns as a vector.
        assert.doesNotMatch(
            body,
            /verify\[|\.run\b|criteria:/,
            `${id} reads a card's verify block into the template`
        );

        // And no Actions expression reaches a shell. Scanned by indentation
        // rather than by one regex over the whole file: a `run: |` block is its
        // opening line plus every following line indented past it, and the
        // continuation lines are exactly where an interpolation would hide. The
        // first version of this check used a single lookahead pattern, and a
        // mutation that put `\${{ github.base_ref }}` on a continuation line
        // passed it — the assertion was the broken half, and a pin that does not
        // bite is worse than no pin.
        const lines = body.split("\n");
        const shellLines: string[] = [];
        // The generic target is a shell script end to end, so every line of it
        // that is not a comment already is one.
        if (id === "generic") {
            shellLines.push(
                ...lines.filter((line) => line.trim() && !line.trimStart().startsWith("#"))
            );
        }
        for (let index = 0; index < lines.length; index += 1) {
            // `run:` on GitHub, `script:` on GitLab — the same thing under two
            // names, and both hand their contents to a shell.
            const opening = /^(\s*)(?:-\s+)?(?:run|script):(.*)$/.exec(lines[index]);
            if (!opening) continue;
            const indent = opening[1].length;
            // `run: something` on one line is itself a shell line.
            if (opening[2].trim() && !/^[|>]/.test(opening[2].trim())) {
                shellLines.push(lines[index]);
                continue;
            }
            for (let next = index + 1; next < lines.length; next += 1) {
                const line = lines[next];
                if (!line.trim()) continue;
                const width = line.length - line.trimStart().length;
                if (width <= indent) break;
                shellLines.push(line);
            }
        }
        // A floor per target, because the three formats carry different amounts
        // of shell: GitHub has four `run:` steps across two jobs, GitLab has a
        // two-line `script:`, and the generic file is shell throughout. Set at
        // all so a scan that silently stops matching fails loudly instead of
        // reporting a clean sweep over nothing.
        const floor = id === "gitlab" ? 2 : id === "generic" ? 3 : 8;
        assert.ok(
            shellLines.length >= floor,
            `${id}: found ${shellLines.length} shell lines, expected at least ` +
                `${floor} — the scan stopped matching rather than the shell going away`
        );
        for (const line of shellLines) {
            assert.doesNotMatch(
                line,
                /\$\{\{/,
                `${id} interpolates an Actions expression into a shell: ${line.trim()}`
            );
        }
    }
});

/**
 * And the two-job split, which is the whole safety of T-0189.
 *
 * One job runs commands a pull request declared and holds nothing. Another holds
 * a write token and runs no repository code — not even Workfile, because every
 * Workfile command `import()`s `project.config.mjs` from the checkout. A change
 * that merges them, or that teaches the write job to run the tool, is the one
 * mistake here that would not look like a mistake.
 */
test("the job that runs card commands and the job that writes are not the same job", async () => {
    const github = (await bodies()).github;
    const job = (name: string) => {
        const start = github.indexOf(`\n  ${name}:\n`);
        assert.notEqual(start, -1, `the ${name} job is gone`);
        const rest = github.slice(start + 1);
        const next = rest.search(/\n {2}\w+:\n/);
        return next === -1 ? rest : rest.slice(0, next);
    };

    const cards = job("cards");
    assert.match(cards, /^ {4}permissions: \{\}$/m, "the card runner holds a scope");
    assert.match(cards, /card verify --changed/);
    assert.match(cards, /persist-credentials: false/);
    // Without the full history there is no merge base, and a card diff taken
    // against nothing is the failure this whole feature must not have.
    assert.match(cards, /fetch-depth: 0/);

    const record = job("record");
    assert.match(record, /^ {4}permissions:\n {6}contents: write$/m);
    assert.doesNotMatch(
        record,
        /@illodev\/workfile/,
        "the write-scoped job invokes Workfile, which imports the checkout's config"
    );
    // A patch out of the untrusted job is applied here, so its reach is bounded
    // before it is applied rather than trusted because of where it came from.
    assert.match(record, /refusing a patch that reaches outside/);
    assert.match(record, /git apply --check/);
    // Fork pull requests never start this job. The token would be read-only
    // anyway; the condition is what says so.
    assert.match(record, /head\.repo\.full_name == github\.repository/);
});
