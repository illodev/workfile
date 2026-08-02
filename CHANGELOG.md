# Changelog

## 0.5.0 — 2026-08-02

### Added

- Both READMEs show how to point an MCP client at the server (T-0139)
- Every release publishes its notes to GitHub (T-0137)

### Fixed

- Installed commands and skills carry their frontmatter again (T-0135)
- Slash commands carry their description and their tool grant again (T-0134)
- The landing footer no longer links a directory that does not exist (T-0110)
- Every file that states the version rides in the bump (T-0132)

## 0.4.0 — 2026-08-02

### Added

- Cards carry a second classification axis, declared per project (T-0102)
- doctor and card list understand declared axes (T-0103)
- Workfile publishes itself to the official MCP Registry on release (T-0114)
- A document carries its outline (T-0120)
- A Flow column collapses to a strip (T-0124)
- The timeline draws what happened, not only what was planned (T-0121)
- The timeline groups by any axis the project declares (T-0104)

### Changed

- The landing takes the v2 editorial design (T-0110)
- A memory record opens in the drawer, like a card (T-0118)
- History reads at a measure, like Docs (T-0119)
- Scrollbars take the theme (T-0126)
- The interface wears its own mark and its own blue (T-0122, T-0123, ADR-0009)
- The timeline remembers how you grouped it (T-0129)

### Fixed

- A body write no longer erases a card's trail and notes (T-0115)
- A patch can no longer take a card another actor holds (T-0117)
- Declared axes survive the listings agents read (T-0128)
- The activity trail records moves, not commands (T-0108)
- The watcher no longer reports itself unavailable because a runner was busy (T-0109)
- A version bump carries server.json with it (T-0131)
- A listing says which cards are archived (T-0130)
- The marketplace plugin registers an MCP server that actually starts (T-0116)
- Escape closes the dialog, not the record behind it (T-0118)
- The board keeps polling until the server says it is watching (T-0112)
- The bulk bar stops shouting (T-0125)

### Removed

- The next dist-tag is gone; every release is on latest (T-0107)

## 0.3.0 — 2026-08-02

### Added

- --verbose names the workspace a command resolved (T-0097)
- A release cut with the wrong date can be corrected (T-0071)
- Acceptance criteria are addressable, and done refuses while they are unproven (T-0084)
- The README states the boundary against agent configurators (T-0075)
- The cost gate counts filesystem operations, not only bytes (T-0083)

### Fixed

- A claim can be live: the session heartbeat gets a producer (T-0082)
- A command word now answers for its own subcommand before anything else (T-0095, T-0100)
- card patch could close a card with unproven acceptance criteria (T-0086)
- Claiming a card no longer arms the edit guard against your own session (T-0099)
- Claims are enforced for real: one actor identity, no duplicate IDs, no silent force (T-0076, T-0077, T-0078, T-0079, T-0080, T-0081)
- Claims work on Windows (T-0105)
- Filters returned an empty set instead of refusing a value they could not parse (T-0092)
- Reopening a card straight into doing works again, on every surface (T-0073)
- Scoped memory records reach the agent bundle when no scope is in focus (T-0087)
- Subcommands accepted their siblings' flags and silently ignored them (T-0091)
- The scope guard read a board that was only ever written at session start (T-0089)
- Two agents claiming the same card at the same moment both succeeded (T-0085)
- Two hook matchers enumerated selectors their handlers never read (T-0090, T-0093)
- Docs name workfile as the binary, including the spec header and the locked decision (T-0096)
- SPEC no longer teaches five commands the binary rejects (T-0088)
- The CLI reference stated a global-options contract the binary stopped honouring (T-0098)
- A second project's board no longer has to displace the first (T-0101)

## 0.2.0 — 2026-07-31

### Added

- doctor learns a baseline: --new gates on what you just broke (T-0058)
- doctor reports card filenames that outlived their titles (T-0054)
- wf is a shorter way to type workfile (T-0069)
- workfile next: what to pick up now, and why (T-0057)

### Changed

- Enum errors name the values they accept (T-0055)
- card create shows the one-call form that writes a body (T-0056)
- The protocol says where durable knowledge goes (T-0059)
- Cards take a size, and their spacing stops overruling the call site (T-0063)
- Reading views get a measure, and the memory panel stops shouting (T-0065)
- Status colour leaves the border, and the corners come back (T-0062)

### Fixed

- A boolean flag no longer swallows the flag after it (T-0058)
- card create keeps --parent, and reaches every field the card accepts (T-0052)
- doctor --severity filters the headline and the rule breakdown too (T-0053)
- The interface works on a narrow screen (T-0066, T-0067)
- The Overview and the Explorer follow the rest of the app onto a phone (T-0068)
- The record counter no longer spins a loader that never finishes (T-0064)

## 0.1.9 — 2026-07-31

### Added

- A density toggle: comfortable rows finally reachable (T-0044)

### Changed

- The Overview becomes the landing view (T-0048)

### Fixed

- CLI usage documents release --title and --date (T-0037)

## 0.1.8 — 2026-07-31

### Added

- The Overview states the workspace: one verdict, three proofs and the trail (T-0047)

## 0.1.7 — 2026-07-31

### Added

- Search names its mode in the palette and accepts /pattern/flags regex (T-0043)
- The sidebar collapses to an icon rail (T-0045)

### Changed

- The Inspector is an overlay drawer: expandable, denser body, no more stolen width (T-0041, T-0042, T-0045)

## 0.1.6 — 2026-07-31

### Changed

- The interface rides shadcn/ui: zinc look, compact tables, same behaviour (T-0038)

## 0.1.5 — 2026-07-31

### Fixed

- The CLI and the docs no longer teach the removed project binary (T-0035)
- The interface doc describes the design system that actually ships (T-0036)

## 0.1.4 — 2026-07-30

### Added

- workfile upgrade: one command resyncs every generated surface after a bump (T-0029)

### Fixed

- Syncing over nested-era files sweeps orphan managed markers (T-0025)

## 0.1.3 — 2026-07-30

### Fixed

- Hybrid search picks provider candidates by lexical relevance, not index order
- The first embedding pass batches, persists per batch and caps ONNX at half the cores
- search-local docs teach the guarded config import; first-party provider documented in the README

## 0.1.2 — 2026-07-30

### Added

- Duplicate card IDs after a merge now heal deterministically (T-0019)
- First-party local embeddings search provider: @illodev/workfile-search-local (T-0018)
- Semantic search providers now load from project.config.mjs on every surface (T-0020)

### Changed

- Workspace packages version and release in lockstep with the core (T-0022)

### Security

- sharp overridden to 0.35.0, clearing high-severity libvips CVEs (T-0023)

## 0.1.1 — 2026-07-30

### Changed

- The README introduces the Claude Code plugin and the MCP inventory lists all 30 tools (T-0005)

### Fixed

- Releasing a claim keeps the card status; only doing returns to next (T-0004)
- The watcher survives Windows 8.3 short paths and idle macOS processes (T-0002)
- A scalar scope no longer crashes the board: list keys normalize in every mutation (T-0007)
