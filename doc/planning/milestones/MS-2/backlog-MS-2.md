---
ados_distribution: project-generated
id: BACKLOG-MS-2
status: Draft
created: 2026-07-06
last_updated: 2026-07-06
owners: [Juliusz Ćwiąkalski]
area: planning
summary: "Ranked delivery backlog for MS-0002 (MVP safe one-way publisher). 5 epics, 22 stories."
---

# MS-0002 Backlog — "Safe one-way publisher" (the trust wedge)

> Ranked delivery queue. Top = highest priority. Git files are authoritative;
> GitHub Issues are the tracking mechanism. See
> [backlog-convention.md](../backlog-convention.md) for ID scheme and structure.

## Spike epic (must complete before feature locks)

| # | ID | Title | Pri | Status | Blocks | File |
|---|---|---|---|---|---|---|
| 1 | MS2-E1-S1 | Mermaid headless-render spike | critical | todo | E4-S1 | [file](MS2-E1--spikes/MS2-E1-S1--mermaid-render-spike.md) |
| 2 | MS2-E1-S2 | version.message length limit spike | high | todo | E3-S6 | [file](MS2-E1--spikes/MS2-E1-S2--version-message-limit.md) |
| 3 | MS2-E1-S3 | Bun single-binary cross-compile smoke | high | todo | E5-S4 | [file](MS2-E1--spikes/MS2-E1-S3--bun-cross-compile-smoke.md) |

## Foundation epic

| # | ID | Title | Pri | Status | Blocks | File |
|---|---|---|---|---|---|---|
| 4 | MS2-E2-S1 | Project scaffolding | critical | todo | All | [file](MS2-E2--foundation/MS2-E2-S1--scaffolding.md) |
| 5 | MS2-E2-S2 | Config system | critical | todo | E3 | [file](MS2-E2--foundation/MS2-E2-S2--config-system.md) |
| 6 | MS2-E2-S3 | CLI framework + CommandResult&lt;T&gt; | critical | todo | E3, E5-S2 | [file](MS2-E2--foundation/MS2-E2-S3--cli-framework.md) |
| 7 | MS2-E2-S4 | Auth provider | critical | todo | E3-S4 | [file](MS2-E2--foundation/MS2-E2-S4--auth-provider.md) |

## Core domain epic — safe publish (the trust wedge)

| # | ID | Title | Pri | Status | Blocks | File |
|---|---|---|---|---|---|---|
| 8 | MS2-E3-S1 | Document identity (UUID v7) | critical | todo | E3-S2,S5,S6 | [file](MS2-E3--safe-publish-core/MS2-E3-S1--document-identity.md) |
| 9 | MS2-E3-S2 | State manager (lock + cache) | critical | todo | E3-S5,S6 | [file](MS2-E3--safe-publish-core/MS2-E3-S2--state-manager.md) |
| 10 | MS2-E3-S3 | Markdown pipeline | critical | todo | E3-S6 | [file](MS2-E3--safe-publish-core/MS2-E3-S3--markdown-pipeline.md) |
| 11 | MS2-E3-S4 | Confluence adapter | critical | todo | E3-S5,S6 | [file](MS2-E3--safe-publish-core/MS2-E3-S4--confluence-adapter.md) |
| 12 | MS2-E3-S5 | Drift classifier | critical | todo | E3-S6 | [file](MS2-E3--safe-publish-core/MS2-E3-S5--drift-classifier.md) |
| 13 | MS2-E3-S6 | Sync engine | critical | todo | — | [file](MS2-E3--safe-publish-core/MS2-E3-S6--sync-engine.md) |
| 14 | MS2-E3-S7 | Concurrency control | high | todo | — | [file](MS2-E3--safe-publish-core/MS2-E3-S7--concurrency-control.md) |

## Features epic

| # | ID | Title | Pri | Status | Blocks | File |
|---|---|---|---|---|---|---|
| 15 | MS2-E4-S1 | Mermaid rendering | high | todo | — | [file](MS2-E4--features/MS2-E4-S1--mermaid-rendering.md) |
| 16 | MS2-E4-S2 | Attachments & images | high | todo | — | [file](MS2-E4--features/MS2-E4-S2--attachments-images.md) |
| 17 | MS2-E4-S3 | Provenance | high | todo | — | [file](MS2-E4--features/MS2-E4-S3--provenance.md) |
| 18 | MS2-E4-S4 | Minimal repair | medium | todo | — | [file](MS2-E4--features/MS2-E4-S4--minimal-repair.md) |

## Quality & ops epic

| # | ID | Title | Pri | Status | Blocks | File |
|---|---|---|---|---|---|---|
| 19 | MS2-E5-S1 | Quality gate wiring | high | todo | — | [file](MS2-E5--quality-and-ops/MS2-E5-S1--quality-gate-wiring.md) |
| 20 | MS2-E5-S2 | Doctor health-check | medium | todo | — | [file](MS2-E5--quality-and-ops/MS2-E5-S2--doctor.md) |
| 21 | MS2-E5-S3 | Adversarial public corpus | medium | todo | — | [file](MS2-E5--quality-and-ops/MS2-E5-S3--adversarial-corpus.md) |
| 22 | MS2-E5-S4 | Cross-platform binary builds | medium | todo | — | [file](MS2-E5--quality-and-ops/MS2-E5-S4--binary-builds.md) |

## Dependency chain

```
E1-S1 (Mermaid spike) ──► E4-S1 (Mermaid rendering)
E1-S2 (version.message) ──► E3-S6 (sync engine)
E1-S3 (Bun smoke) ──► E5-S4 (binary builds)

E2-S1 (scaffolding) ──► everything
E2-S2 (config) ──► E3 (all core domain)
E2-S3 (CLI framework) ──► E3, E5-S2
E2-S4 (auth) ──► E3-S4 (adapter)

E3-S1 (identity) ──► E3-S2 (state), E3-S5 (drift), E3-S6 (sync)
E3-S2 (state) ──► E3-S5 (drift), E3-S6 (sync)
E3-S3 (Markdown) ──► E3-S6 (sync)
E3-S4 (adapter) ──► E3-S5 (drift), E3-S6 (sync)
E3-S5 (drift) ──► E3-S6 (sync)
```

## Deferred to later milestones

| Item | Milestone | Trigger |
|---|---|---|
| Guided init / doctor DX polish | MS-0003 | MS-0002 beta feedback |
| Migration / existing-corpus adoption | MS-0003 | A-VAL-3 validated |
| macOS platform | MS-0003+ | — |
| keytar OS keychain | MS-0002 (deferred, OPEN-Q8) | Env-token path proven first |
| Reverse sync / drift capture | MS-0004+ | Trust wedge proven |
| OAuth 3LO | Post-MS-0002 | Browser-based feature |
