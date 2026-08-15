# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-08-15

### Added
- **Reverse converter library** (Storage Format → Markdown, canonical GFM subset, deterministic) — MS-0003 E1 foundation (GH-92).
- 100% golden round-trip harness with partition-manifest guardrail (26 corpus-A + 6 corpus-B + 5 storage-only + 9 adversarial fixtures).
- Two-class reverse diagnostics with stable codes + line:column locations (blocking `unsupported-construct`, informational `marksync-synthetic-artifact`).
- Provenance-panel strip + K1 read-back tolerance (Confluence-assigned `ac:schema-version`/`ac:macro-id` ignored).
- saxes XML parser dependency (TDR-0012) + hast-util-to-mdast substrate (TDR-0013).
- Library contract: `reverseStorage()` (fast-fail) + `reverseStorageCollectAll()` (enumeration) + `normalizeMarkdown()`.

## [0.7.0] - 2026-07-15

### Added
- **Doctor health-check** (`marksync doctor`): pre-flight validation for Git availability, config validity, credentials (auth + base URL), space access, parent-page existence/writability, permission/visibility advisory, and renderer availability (GH-30).
- Exit code `60` (`EXIT_HEALTH` / `DOCTOR_FAIL`) for doctor health-check failures (TDR-0009).
- `--probe-capabilities` flag for doctor: opt-in write probes (content-property + attachment) with self-cleaning scratch-page behavior.
- Centralized `redactString` for secret redaction across all output paths (INV-SEC-1).
- Structured `DoctorReport` with per-check `pass`/`warn`/`fail`/`skipped` status, human-readable detail, and suggested fixes.
- `src/app/doctor.ts`: health-check orchestration with 9 checks, injectable dependencies, comprehensive test coverage (17 unit tests).
- Integration test skeleton for doctor CLI handler (TC-DOCTOR-013..022) using Bun.serve() mock (WIP).

### Changed
- Updated CLI spec to document doctor command semantics (feature-cli.md).
- Updated nonfunctional spec to reference EXIT_HEALTH code (NFR-OBS-1).

## [0.6.0] - 2026-07-10

### Added
- Provenance panel: `{info}` macro at page footer with source path, Git revision, last-sync (GH-27).
- `marksync repair-state`: recover from interrupted applies idempotently (GH-28).

## [0.5.0] - 2026-07-09

### Added
- Stable exit codes (GH-16): `EXIT_OK` (0), `EXIT_USAGE` (2), `EXIT_CONFIG` (10), `EXIT_AUTH` (20), `EXIT_CONFLICT` (30), `EXIT_REMOTE_MISSING` (40), `EXIT_INVARIANT` (50), `EXIT_RENDER_UNAVAILABLE` (70), `EXIT_INTERNAL` (99).
- `CommandResult<T>` output structure (ADR-0011).
- Dry-run / plan command: preview changes before mutation.

## [0.4.0] - 2026-07-05

### Added
- Core sync workflow: Markdown → Confluence Storage format with drift detection.
- Mermaid diagram rendering with deterministic SVG hashing (ADR-0002).
- Asset reuse-on-exists: no duplicate uploads for unchanged images (GH-26).

## [0.3.0] - 2026-07-04

### Added
- Mermaid in-process rendering (GH-69, GH-76).
- Privacy warning for remote `render` policy (ADR-0002 C-3).

## [0.2.0] - 2026-07-03

### Added
- Configuration file support (`marksync.yml`).
- Branch policy enforcement (`allowBranches`).

## [0.1.0] - 2026-07-02

### Added
- Initial CLI scaffold (GH-15, GH-17, GH-18).
- Basic authentication via env vars.
- `marksync init`, `marksync sync`.