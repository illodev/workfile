---
id: CHG-0009
title: sharp overridden to 0.35.0, clearing high-severity libvips CVEs
type: security
area: infra
visibility: public
cards: [T-0023]
created: 2026-07-30
updated: 2026-07-30
---

transformers.js pins sharp ^0.34.5, which inherits high-severity libvips CVEs (CVE-2026-33327/33328/35590/35591). A pnpm override forces ^0.35.0 (patched). Workfile's text-embedding path never loads sharp; the override exists so installs and audits are clean.
