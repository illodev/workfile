---
id: LRN-0035
title: "A generator that only writes cannot rename: retire the old artifact by its marker"
status: active
confidence: high
related: [T-0248, CHG-0174, CHG-0100]
tags: [generated-files, claude, plugin]
created: 2026-09-11
updated: 2026-09-11
---

Renaming the generated `/context` command to `/card-context` was one line in `commandDefinitions`. Had it shipped alone, every workspace that had run `claude install` would have kept `context.md` — marker and all — beside the new file, shadowing Claude Code's built-in `/context` exactly as before, and the plugin would have shipped both. `syncManagedFile` writes what it is asked to write and removes nothing; `build-plugin.ts` did the same.

**Why:** a generator's output lives on other people's disks. A change to what it generates is applied there only by the generator itself, and a generator with no notion of what it *used to* write cannot apply a removal. The old file is indistinguishable from a hand-written one by name alone; the marker it carries is what makes it ours to remove.

**How to apply:** when a generated artifact is renamed or dropped, add it to a retired list keyed by the marker kind it carried. The sync removes a file that exists and carries that marker, reports it as `removed`, and leaves a same-named file without the marker alone; the check reports the marked file as stale until it is gone. A build that assembles a distributable from generated files prunes what the generator no longer produces. Test the retirement with the actual bytes the previous version installed.
