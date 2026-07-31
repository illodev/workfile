# Changelog

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
