---
id: CHG-0088
title: A listing says which cards are archived
type: fixed
area: mcp
visibility: public
created: 2026-08-02
updated: 2026-08-02
---
`project_card_list` returns archived cards alongside live ones, and nothing in
the row said which was which:

```
T-0001 Viva       status=backlog archived=undefined path=.project/cards/T-0001-viva.md
T-0002 Archivada  status=done    archived=undefined path=.project/cards/archive/T-0002-archivada.md
```

The only tell was `/archive/` inside `path`, a convention nothing declares.
`status` was not one either: a card can be done and still live, and an archived
card keeps whichever terminal status it had. So an agent listing work could
pick up something that had been deliberately put away.

Listings now carry `archived`, explicitly `false` on a live card rather than
absent — "no such key" and "not archived" read the same to a caller, and one of
them was the bug.

The rows are unchanged: archived cards are still listed. Hiding them would have
left `project_card_reopen` with nothing to find, since moving an archived card
back into the backlog starts with seeing it.
