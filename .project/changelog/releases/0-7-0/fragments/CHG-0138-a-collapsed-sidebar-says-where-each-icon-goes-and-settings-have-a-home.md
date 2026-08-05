---
id: CHG-0138
title: A collapsed sidebar says where each icon goes, and settings have a home
type: changed
area: ui
visibility: public
cards: [T-0198]
tags: [navigation]
created: 2026-08-05
updated: 2026-08-05
---

Collapsed to icons, the sidebar gave no way to identify a destination but to
expand it again or click and find out. Every item now names itself on hover and
on keyboard focus, and only while collapsed — a label that is already visible
does not need a second copy floating beside it.

The row-density and theme switches have moved out of the app header into a
settings dialog. They are settings rather than navigation, more of them are
coming, and both still persist exactly as before.

The tooltip is mounted only while the rail is collapsed rather than rendered
hidden, because an open tooltip is a dismissable layer: rendered-but-hidden, it
still opened on hover and quietly took the Escape key away from whatever the
reader actually had open.
