---
id: LRN-0011
title: A containment assertion passes on a wrong generated file
status: active
created: 2026-08-02
updated: 2026-08-02
---
When a file is generated, assert it equals the generator's output. Anything
weaker passes on a file that is wrong.

The plugin's `.mcp.json` was checked with `args.includes("${CLAUDE_PROJECT_DIR}")`.
The registration was broken in a different position of the same array — it
named the `workfile-mcp` bin, which npx cannot select from a package spec — so
the placeholder was present, the assertion passed on every run, and every
marketplace install shipped a server that printed the CLI help down stdout
instead of speaking JSON-RPC. See [[T-0116]].

The containment check was not too lax by accident. It was written for a file
that had no generator, and it stayed correct-looking after one appeared
elsewhere. `claudeHooksFile` had already been through this exact failure with
the hook matchers, which is why `build-plugin.ts` says nothing in the plugin
is hand-maintained — the sentence was true of everything the script wrote and
silently false of the one file it did not.

So the rule is about the pair, not the assertion: a hand-maintained copy of
something generated elsewhere is the defect, and a containment assertion is
what lets it live. Generate the copy, then compare byte for byte and let the
message name the command that regenerates it.

A test that has never been seen failing is not evidence. Reintroduce the bug,
watch it go red, restore it.
