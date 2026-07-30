# Changelog

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
