---
id: CHG-0100
title: The edit guard names the tools that write the record it stopped
type: fixed
area: core
visibility: public
created: 2026-08-03
updated: 2026-08-03
---
Editing a `.md` under the protocol root asks first, so the write goes
through the lock and the revision check instead of around them. The reason it
gave named `project_card_patch`, `project_card_write` and `project_card_note`
for every record — so an agent stopped while writing a doc, a memory record or
a changelog fragment was handed three tools that cannot open it, and reached
for the direct edit again.

A hook's `ask` outranks `bypassPermissions` by design, so there was nothing to
switch off: it looked like the permission mode had stopped working.

The guard now names the tools for the record it actually stopped, with the
matching `workfile <noun> patch` form, and sends the generated agent surface to
`workfile agents sync` rather than to a record tool that could never open it.
