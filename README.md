# MarkSync for Confluence

> A CLI tool that synchronizes a Git-tracked Markdown corpus to Atlassian
> Confluence Cloud — deterministically, safely, and with a clear audit trail.

[![CI](https://github.com/juliusz-cwiakalski/marksync/actions/workflows/ci.yml/badge.svg)](https://github.com/juliusz-cwiakalski/marksync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What it does

MarkSync reads Markdown files from a Git repository, converts them to
Confluence Storage Format (including rendered Mermaid diagrams), and publishes
them to Confluence Cloud. It treats **Git as the source of truth**: every sync
is deterministic, idempotent, and auditable. Confluence page history carries
clear provenance so you always know which Git state produced each version.

- **One-way publish** (MVP) — Markdown → Confluence, safely.
- **Mermaid in-process** — diagrams rendered deterministically via official
  Mermaid, no external rendering service.
- **Atomic, idempotent sync** — document identity via UUID v7; committed lock
  file tracks state; disposable cache for efficiency.
- **Provenance trail** — Confluence page versions record the Git commit that
  produced them.

## Why

Teams that manage documentation in Markdown (engineers, AI agents, CI) need it
visible on Confluence for the rest of the organization. Existing tools either
require manual copy-paste, lose formatting, or lack the safety guarantees
(determinism, no silent overwrites, audit trail) that make automation
trustworthy. MarkSync is the **safe one-way bridge** that earns trust first,
before any bidirectional sync is attempted.

## Current status

**MS-0002 in progress** — the MVP safe one-way publisher. The project has
completed its inception phase (north star, roadmap, architecture, domain model,
conventions, quality baseline, ADOS framework integration) and a Confluence API
validation spike (`MS-0001`). The project scaffolding is now in place: strict
TypeScript + Bun toolchain, Biome lint/format, dependency-cruiser boundary
enforcement, commitlint + husky, and the ports-and-adapters module skeleton.

See the [roadmap](doc/overview/02-roadmap.md) for milestone details.

## How it works

```
Git repository (Markdown + Mermaid)
        │
        ▼
   MarkSync CLI
   ├── remark/HAST pipeline → Confluence Storage Format
   ├── Mermaid renderer → deterministic SVG
   ├── UUID v7 identity + lock file + disposable cache
   └── Confluence adapter (v2 REST API)
        │
        ▼
  Confluence Cloud
```

**Architecture:** Ports-and-adapters. The domain logic (Markdown processing,
identity, state management) is isolated from the Confluence adapter behind a
`TargetSystem` port. This keeps the Confluence-specific code swappable and
allows future adapters for other wiki platforms.

See the [architecture overview](doc/overview/architecture-overview.md) for C4
diagrams and the full component map.

## Tech stack

| Layer | Choice | Decision |
|-------|--------|----------|
| Language / runtime | TypeScript + Bun (single-binary) | [ADR-0001](doc/decisions/ADR-0001-implementation-language-and-runtime.md) |
| Markdown pipeline | remark / HAST | — |
| Write target | Confluence Storage Format | [ADR-0005](doc/decisions/ADR-0005-page-body-representation-storage-not-adf.md) |
| Diagram rendering | Official Mermaid, in-process, deterministic | [ADR-0002](doc/decisions/ADR-0002-mermaid-rendering-strategy.md) |
| State model | UUID v7 + committed lock + disposable cache | [ADR-0006](doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md) |
| CLI framework | Cliffy | [TDR-0002](doc/decisions/TDR-0002-cli-framework.md) |
| Testing | bun:test + @cucumber/cucumber (BDD) | [TDR-0004](doc/decisions/TDR-0004-testing-runner.md) / [TDR-0007](doc/decisions/TDR-0007-gherkin-bdd-runner.md) |
| Linting / formatting | Biome | [TDR-0005](doc/decisions/TDR-0005-linter-and-formatter.md) |
| Import boundaries | dependency-cruiser | [TDR-0006](doc/decisions/TDR-0006-import-boundary-enforcement.md) |

## Getting started

> The CLI is not yet installable — domain logic lands in subsequent `MS-0002`
> stories. The scaffolding (toolchain, module skeleton, shared primitives) is
> in place.

**Quick dev loop:**

```bash
bun install             # install devDeps
bun run check           # lint + format:check + typecheck + test + check:boundaries
bun run src/cli/index.ts # prints "marksync 0.0.0" (placeholder entrypoint)
```

**For contributors**, see the [dev environment guide](doc/guides/dev-environment.md)
for prerequisites, setup, and scripts.

**For AI agents**, start with [AGENTS.md](AGENTS.md) — the delivery system
bootstrap.

## Documentation

| What | Where |
|------|-------|
| Product vision & metrics | [North Star](doc/overview/01-north-star.md) |
| Milestone roadmap | [Roadmap](doc/overview/02-roadmap.md) |
| Architecture & C4 diagrams | [Architecture](doc/overview/architecture-overview.md) |
| Domain language | [Glossary](doc/overview/glossary.md) · [Ubiquitous Language](doc/overview/ubiquitous-language.md) |
| NFRs (performance, security, reliability) | [Nonfunctional Spec](doc/spec/nonfunctional.md) |
| Coding conventions | [TypeScript](.ai/rules/typescript.md) · [Testing](.ai/rules/testing-strategy.md) |
| All decision records | [Decisions](doc/decisions/00-index.md) |
| Full doc index | [doc/00-index.md](doc/00-index.md) |

## Contributing

This project uses [Agentic Delivery OS (ADOS)](https://github.com/juliusz-cwiakalski/agentic-delivery-os)
— a spec-driven delivery system where AI agents turn tickets into reviewed,
tested PRs through an 11-phase workflow. Every change starts with a change spec
and flows through definition-of-ready, implementation, review, and quality gates.

- **Report a bug or request a feature:** [GitHub Issues](https://github.com/juliusz-cwiakalski/marksync/issues)
- **Delivery process:** [Change Lifecycle](doc/guides/change-lifecycle.md)
- **Decision records:** [ADR/PDR/TDR registry](doc/decisions/00-index.md)
- **Commits:** Conventional Commits (enforced by commitlint + husky)

## License

[MIT](LICENSE) — © 2026 Juliusz Ćwiąkalski
