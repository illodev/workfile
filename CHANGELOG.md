# Changelog

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
