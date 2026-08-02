---
id: CHG-0078
title: Escape closes the dialog, not the record behind it
type: fixed
area: ui
visibility: public
cards: [T-0118]
created: 2026-08-02
updated: 2026-08-02
---

One Escape reached two levels at once: dismissing a form raised over a record also cleared the selection underneath, so the record the form belonged to left the screen with it. Escape now belongs to the topmost overlay — press it again and the record closes, as before.
