---
id: LRN-0026
title: A test that reads source as text must normalise line endings, or it only fails on Windows
status: active
confidence: high
related: [LRN-0021, T-0198]
tags: [ci, testing]
created: 2026-08-05
updated: 2026-08-05
---

This suite has a house pattern for asserting things JSX cannot be imported to
prove: read the file as text and match against it. `design-system.test.ts`,
`documentation.test.ts`, `filter-search.test.ts` and `shell.test.ts` all do it.

A regex in one of them that anchors on `\n` matches nothing on a Windows
checkout, where the same file is `\r\n`. `shell.test.ts` used
`/function NavTooltip\([\s\S]*?\n}\n/` to grab a function body, and on
windows-latest it reported "NavTooltip is gone from main.tsx" about code sitting
right there in the diff. Both Node versions failed; every other platform passed.

The pattern that survives is to normalise once, in the helper that reads:

```ts
const read = async (name: string) =>
    (await readFile(url(name), "utf8")).replaceAll("\r\n", "\n");
```

Not per assertion. The next regex someone adds to that file inherits it, which
is the whole point — the author of that regex will be on a machine where the bug
cannot reproduce.

**Why:** the failure is invisible locally, and its message actively misleads. It
names the symptom of a deleted function, so the first instinct is to look for a
bad merge or a lost edit rather than at the bytes between the lines.

**How to apply:** when a test opens a source file and matches against its
contents, normalise in the reader. When one fails on Windows only and claims
something is missing from a file, check the line endings before checking the
file. See [[workfile-ci-runs-windows]] for the general rule this is an instance
of.
