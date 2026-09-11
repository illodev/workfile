---
id: CHG-0186
title: The scope guard now reports edits made through Bash after the fact
type: fixed
area: core
visibility: public
cards: [T-0227]
created: 2026-09-11
updated: 2026-09-11
---

The `PreToolUse` guard reads `file_path`, and a `Bash` payload carries `command`, so an edit made with `sed`, a heredoc or `tee` inside another actor's claimed scope was asked nothing — measured on a consuming board with eight panels live, a file inside a held scope changed with zero events in the activity ledger.

After a `Bash` call, the `PostToolUse` hook now walks the scopes other actors hold (bounded, never into `.git`, `node_modules` or `.project`), takes every file whose mtime falls after this session's previous signal and that no typed-tool edit in the ledger accounts for, appends each as a `collision` event to `.project/.cache/activity/events.jsonl`, adds it to the session's `filesTouched`, and tells the agent in `additionalContext` which paths changed inside whose card — and whether the holder's session was signalling in that window. It reports; it prevents nothing, and `PreToolUse` stays off `Bash`.
