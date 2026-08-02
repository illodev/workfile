---
id: CHG-0074
title: A patch can no longer take a card another actor holds
type: fixed
area: core
visibility: public
created: 2026-08-02
updated: 2026-08-02
cards: [T-0117]
---
Claims are how two agents working one checkout stay out of each other's way,
and a patch walked around them.

`card patch`, the HTTP PATCH routes and `project_card_patch` write frontmatter
directly, and `claimed_by` is a frontmatter field. `card claim` refuses a card
someone else holds unless you force it and say why; `card transition` and
`card release` refuse it too. A patch refused nothing:

```
$ workfile card claim T-0001 --actor alice
$ echo '{"claimed_by":"mallory"}' | workfile card patch T-0001 ...
T-0001 updated
```

The card changed hands and its own trail still named alice. A patch that
cleared the claim alongside a status change did the same thing from the other
side — dropping someone's claim and moving their card, with no force and no
reason.

All three doors now share one ownership check, so a patch touching `status`,
`claimed_by` or `claimed_at` is refused for a card another actor holds.
Patching a field none of them ever defended — a priority, a title — is
unchanged. Taking a claim over deliberately still works through
`card claim --force --reason`, which still writes the reason into the card.

A patch that does legitimately hand over or let go of a card now records it in
the activity trail, which previously depended on which command you used rather
than on what happened.
