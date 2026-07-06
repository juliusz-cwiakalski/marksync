---
id: MS2-E2
title: Foundation — scaffolding, config, CLI, auth
status: todo
milestone: MS-0002
stories: [MS2-E2-S1, MS2-E2-S2, MS2-E2-S3, MS2-E2-S4]
feature_spec: [doc/spec/features/feature-cli.md]
dependencies: []
---

# Epic MS2-E2 — Foundation

## Goal
Establish the project scaffolding, configuration system, CLI framework, and auth
that all core-domain and feature work depends on.

## Scope
- MS2-E2-S1: Project scaffolding (Biome, dependency-cruiser, commitlint, CI unguard)
- MS2-E2-S2: Config system (YAML + JSON Schema)
- MS2-E2-S3: CLI framework + CommandResult<T> + centralized redaction
- MS2-E2-S4: Auth provider (API token + env vars)

## Success criteria
- `bun run check` passes (lint + typecheck + test + dependency-cruiser)
- Config validates via JSON Schema
- CLI renders CommandResult<T> as JSON/NDJSON; secrets redacted
- Auth resolves token from env vars

## Cross-cutting
- INV-SEC-1 (no secrets in output) — redaction layer in S3
- NFR-A11Y-1 (color auto-detect) — CLI framework in S3
- CI unguard (OPEN-Q9) — scaffolding in S1
