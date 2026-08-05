---
id: LRN-0023
title: Record the leaves you write into a file you do not own
status: active
created: 2026-08-05
updated: 2026-08-05
---
The Claude Code surface writes seven files. Five are managed Markdown, digested
and compared byte for byte. Two are JSON merged into files the repository also
owns, so they carry no marker to hold a digest — and for four minor versions
they were reported `current` on the strength of existing ([[T-0177]]).

The reason that was tolerable is that it looked total: a file the tool does not
wholly own cannot be compared, so it is not compared. The reason it stopped
being tolerable is [[T-0170]], which made the correct content depend on the
workspace rather than on the version — after which "the file is there" and "the
file is right" are different sentences, and `check` was answering the first
while being asked the second.

**The ownership record was already on disk.** `mergeJson` keeps a ledger so
that a key it stops generating actually gets removed, and that ledger names
precisely the values that are the tool's to compare. It needed one correction to
be usable for either purpose: it recorded top-level keys while the merge is one
level deeper, so `mcpServers` was written down where `mcpServers.workfile` was
meant. At that depth removal was also wrong — ceasing to generate `hooks` would
have deleted a `hooks.Stop` the repository owned.

**Where a generated thing merges into something you do not own, record the
leaves you write.** One list then answers three questions that otherwise get
three implementations: what to compare, what to leave alone, and what to remove.
Recording the parent answers none of them correctly, and the error is invisible
until the day something else in that parent has an owner.

And compare values, not bytes. The file belongs to someone else, so its
formatting and key order are not yours to have an opinion about — whereas for
the five files that *are* wholly yours, bytes are exactly right, down to the
trailing newline [[T-0169]] had to go and find.
