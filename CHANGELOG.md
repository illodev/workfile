# Changelog

## 0.9.2 — 2026-09-03

### Changed

- The record graph keeps following links quoted in code, and now says why

### Fixed

- Doc links read balanced parentheses and the angle-bracket form
- The scope guard stops prompting you about your own claim
- The stale-filename warning names the scoped fix, not the workspace-wide one

## 0.9.1 — 2026-08-27

### Fixed

- A re-wrapped scope: no longer makes a card unclaimable (T-0225)

## 0.9.0 — 2026-08-08

### Added

- A card says whether a person reported it or an agent derived it (T-0210)
- CI runs the checks a card declares and records what they proved (T-0189, T-0161)
- Every kind of record can be read in sequence, not only cards (T-0207)

### Changed

- Every doctor finding says which module produced it (T-0218, T-0223)

### Fixed

- An explicit --root is checked the way a discovered one always was (T-0160)
- The scope guard sees two agents that share an actor (T-0219)
- The MCP byte ceiling stops overwriting a tool's own truncation flag (T-0147)
- The hosted demo matches a search the way a real workspace does (T-0202)
- The record views' filters survive a reload (T-0201)

### Security

- A trailing strip over an uncapped body no longer backtracks (T-0224)
- search-local runs on onnxruntime-web, clearing four high advisories it used to ship (T-0221, ADR-0021)

## 0.8.1 — 2026-08-07

### Added

- Documentation trees can declare that their links are routes (T-0217)

### Fixed

- --help lists every flag a subcommand accepts (T-0215)
- Patching a body keeps the blank line under the frontmatter (T-0216)

## 0.8.0 — 2026-08-06

### Added

- workfile ui gains --read-only and --allowed-host, so a board can be published for reading

## 0.7.0 — 2026-08-05

### Added

- A criterion can name the command that proves it, and stops being yours to check (T-0185)
- done records how it was proved, and a card can only run what the project permits (T-0186, T-0187, T-0188, T-0203)
- The filter every view had behind it now has a control in front of it (T-0195)
- The footer's claim count opens into the claims it was counting (T-0196)

### Changed

- A card's context bundle carries the memory that is about that card
- A forced transition records which gate it walked past, and why (T-0184)
- Accepted decisions past the context limit are listed by title instead of dropped
- Archiving a card records who filed it and when
- Frontmatter holds one level of nesting, and refuses the rest by name (T-0200)
- init says when it applied the defaults instead of asking (T-0171)
- A collapsed sidebar says where each icon goes, and settings have a home (T-0198)

### Fixed

- A card body write reaches everything below the protocol sections (T-0157, ADR-0011)
- A duplicate id heals for every kind of record, not only for cards (T-0199)
- A generated file that lost its trailing newline can be repaired
- A note quoting a trail entry is no longer filed as one
- A record body can no longer stall the doctor or choose a link scheme
- A record with no id is reported, not fatal (T-0204)
- A regex search pattern can no longer hang the process
- init --dry-run counts what init creates (T-0173)
- The acceptance gate stops mistaking a heading it does not know for a card with nothing to prove
- The demo film opened on a skeleton, and every still was two minor versions old (T-0163, T-0164)
- claude check compares the generated JSON instead of counting the file (T-0177)
- The hooks reach the package in a workspace that does not carry it (T-0178)
- The MCP server and the hooks run the same copy of the package
- A filter strip scrolls under your thumb, and the controls agree on a size (T-0193, T-0194)
- Every filter bar is shaped the same, and the controls in it agree on a corner (T-0211, T-0212)
- Leaving a document no longer opens an empty inspector over the list (T-0192)
- Reading a changelog fragment no longer covers the fragment (T-0197)
- The board names who moved a card, and claiming from it no longer locks you out
- The Workflow view applies the filters it draws (T-0191)

### Removed

- The protocol surface is English everywhere, and config.language stops meaning anything

## 0.6.0 — 2026-08-04

### Added

- A card declares which record it came out of (T-0154)
- A record shows what it came out of and what it produced (T-0155)
- A Workflow view draws the record graph, with a filter per relationship (T-0156, ADR-0010)

### Changed

- A graph edge says which field declared it, and a pair can hold several (T-0159)

### Fixed

- The CLI reference names every command and alias the binary accepts (T-0151)
- The security policy links a threat model that exists (T-0149)
- The spec names the MCP tools and the API that actually ship (T-0150)
- The MCP guide states the registration the install actually writes (T-0153)

### Removed

- The schema stops offering a ui.defaultView nothing ever read (T-0152)

## 0.5.4 — 2026-08-03

### Added

- The README carries the Glama score and card badges

### Changed

- Every MCP tool declares its parameters, its defaults and its reply shape

## 0.5.3 — 2026-08-03

### Fixed

- The edit guard names the tools that write the record it stopped (T-0144)

## 0.5.2 — 2026-08-03

### Fixed

- A watcher that loses a directory says so instead of reporting health (T-0143)

## 0.5.1 — 2026-08-03

### Fixed

- Creating records concurrently on Windows waits its turn instead of failing (T-0140)
- Writing a record while something reads it no longer fails on Windows (T-0142)

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
