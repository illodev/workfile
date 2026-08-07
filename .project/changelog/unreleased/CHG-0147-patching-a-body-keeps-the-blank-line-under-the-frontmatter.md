---
id: CHG-0147
title: Patching a body keeps the blank line under the frontmatter
type: fixed
area: core
visibility: public
cards: [T-0216]
created: 2026-08-07
updated: 2026-08-07
---

Patching a record's body no longer moves the body up one line. Creating a
record renders a blank line under the frontmatter and patching it removed that
line, so the first body patch of any changelog fragment, managed document or
memory record produced a diff line nobody asked for.

The four places that did this now share one function, which also takes the
end-of-line from the file: patching a CRLF record used to mix a bare LF into the
one line it was adding. A record that already lost its blank line gets it back
on the next patch.
