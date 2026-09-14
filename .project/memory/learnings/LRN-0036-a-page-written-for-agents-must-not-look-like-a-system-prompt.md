---
id: LRN-0036
title: A page written for agents must not look like a system prompt
status: active
created: 2026-09-14
updated: 2026-09-14
---

The site concept of 2026-09-14 addressed the agent reading the page, and the first draft opened with `<system>You are an agent…`. That is the shape of a prompt injection. Agents are trained to treat instructions inside fetched content as untrusted, so a page wearing system-prompt tags gives its reader a reason to warn its human about the page instead of weighing what it says — the opposite of what a page written for agents is for.

The shipped landing keeps the prompt structure with neutral tags (`<context>`, `<question>`, `<tldr>`), speaks declaratively ("You are probably an agent"), and says outright that nothing on it is an instruction. The owner confirmed the change over the literal `<system>` on the same day.

## How to apply

- Any agent-facing surface — a landing, `llms.txt`, a Markdown twin, a README section meant for agents — describes and never commands.
- A summary offered for an agent to relay is stated as a dated fact, not as text it is told to repeat.
- Tags and headings may borrow prompt structure; they must not borrow the names of instruction channels (`system`, `instructions`, `developer`).

Related: [[T-0259]].
