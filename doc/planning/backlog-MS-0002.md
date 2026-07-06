---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: BACKLOG-MS-0002
status: Draft
created: 2026-07-06
last_updated: 2026-07-06
owners: [Juliusz Ćwiąkalski]
area: planning
document_classification: current-truth
links:
  related_artifacts:
    - doc/overview/02-roadmap.md
    - doc/inception/analysis/backlog-reconciliation.md
    - doc/spec/features/feature-safe-publish.md
    - doc/spec/features/feature-confluence-adapter.md
    - doc/spec/features/feature-mermaid-rendering.md
    - doc/spec/features/feature-cli.md
summary: "Ranked delivery backlog for MS-0002 (MVP safe one-way publisher). Drives GitHub Issue creation. Top = highest priority."
---

# MS-0002 Backlog — "Safe one-way publisher" (the trust wedge)

> **Purpose:** ranked delivery queue for the MS-0002 milestone. GitHub Issues is
> the canonical tracker; this file is the ranked plan that drives issue creation
> and delivery sequence. Top item = highest priority. Dependencies must resolve
> before dependent items start.
>
> **Planning IDs** (`MS02-<NN>`) are replaced by `GH-<number>` workItemRefs when
> GitHub Issues are created. The `MS02-<NN>` ID stays as a stable cross-reference
> in this file.

## Spike phase (must complete before feature locks)

These are load-bearing unknowns that gate downstream work. They run first.

| # | ID | Title | Status | Priority | Blocks | Feature spec | Cross-cutting |
|---|---|---|---|---|---|---|---|
| 1 | MS02-S1 | **Mermaid headless-render spike** — prove official library renders deterministically in-process (ADR-0002). If it fails, language decision is revisited. | todo | critical | MS02-12, MS02-19 | feature-mermaid-rendering | R-FEA-1; A-FEA-1 |
| 2 | MS02-S2 | **version.message length limit spike** — live API test; Atlassian docs don't specify maxLength (OPEN-Q6). | todo | high | MS02-10 | feature-safe-publish (ADR-0010) | — |
| 3 | MS02-S3 | **Bun single-binary cross-compile smoke** — clean-OS install + size/startup budget verification. | todo | high | MS02-19 | — | A-FEA-2; A-FEA-10 |

## Foundation (must complete before core domain)

Project scaffolding and infrastructure that everything else depends on.

| # | ID | Title | Status | Priority | Blocks | Feature spec | Cross-cutting |
|---|---|---|---|---|---|---|---|
| 4 | MS02-01 | **Project scaffolding** — package.json, tsconfig (verbatimModuleSyntax, isolatedModules), Biome (TDR-0005), dependency-cruiser (TDR-0006), bunfig.toml, commitlint+husky (TDR-0008), CI unguard removal (OPEN-Q9). | todo | critical | All | — | CI baseline; conventions |
| 5 | MS02-02 | **Config system** — repository-owned YAML config (file selection, hierarchy mirroring, document overrides, JSON Schema validation). | todo | critical | MS02-05..10 | feature-cli | — |
| 6 | MS02-03 | **CLI framework + CommandResult&lt;T&gt;** — Cliffy (TDR-0002) command structure, `CommandResult<T>` output (ADR-0011), centralized redaction layer, JSON/NDJSON renderers, exit codes. | todo | critical | MS02-05..10, MS02-17 | feature-cli | INV-SEC-1; NFR-A11Y-1 |
| 7 | MS02-04 | **Auth provider** — API-token (email + token) from env vars; `MARKSYNC_CONFLUENCE_*`. OS keyring via keytar is OPEN-Q8 (deferred). | todo | critical | MS02-08 | feature-cli | R-SEC-1 |

## Core domain — the trust wedge

The heart of MS-0002. These items together deliver the safe-publish pipeline.

| # | ID | Title | Status | Priority | Blocks | Feature spec | Cross-cutting |
|---|---|---|---|---|---|---|---|
| 8 | MS02-05 | **Document identity** — UUID v7 assignment, front-matter management, duplicate-UUID fatal-before-write. | todo | critical | MS02-06, MS02-09, MS02-10 | feature-safe-publish | INV-SAFE-2; ADR-0006 |
| 9 | MS02-06 | **State manager** — committed (versioned) lock file (read/write/merge), disposable `.marksync/cache/`, content-property cross-check. | todo | critical | MS02-09, MS02-10 | feature-safe-publish | ADR-0006; R-FEA-3 |
| 10 | MS02-07 | **Markdown pipeline** — remark/HAST → Confluence Storage Format for canonical GFM subset (ADR-0005). Conversion fidelity = 100%. | todo | critical | MS02-10 | feature-safe-publish | ADR-0005; R-FEA-9 |
| 11 | MS02-08 | **Confluence adapter** — `TargetSystem` port impl: v2 page CRUD + content properties; v1 attachments/labels/search/restrictions; 409 optimistic concurrency parsing; 403 warn+skip; rate-limit backoff. | todo | critical | MS02-09, MS02-10 | feature-confluence-adapter | R-FEA-6; R-FEA-10 |
| 12 | MS02-09 | **Drift classifier** — canonical semantic hashing (raw + canonical + normalized + attachment); 5-state classification (NO_CHANGE / REMOTE_BEHIND / REMOTE_AHEAD / DIVERGED / REMOTE_MISSING); block unsafe overwrites by default. | todo | critical | MS02-10 | feature-safe-publish | INV-SAFE-1; drift 100%; FP <5% |
| 13 | MS02-10 | **Sync engine** — plan → apply orchestration; create/update/no-op/move per document; per-document isolation; journal-based apply + replay; squash provenance via version.message (ADR-0010). | todo | critical | — | feature-safe-publish | INV-SAFE-1; INV-SAFE-3; idempotency |
| 14 | MS02-11 | **Concurrency control** — decentralized: Confluence 409 on stale version.number + operation-ID dedup + stale-plan expiry + CI concurrency-group templates. | todo | high | — | feature-safe-publish | INV-SAFE-3; R-FEA-7 |

## Features (build on core domain)

| # | ID | Title | Status | Priority | Blocks | Feature spec | Cross-cutting |
|---|---|---|---|---|---|---|---|
| 15 | MS02-12 | **Mermaid rendering** — in-process official library, `securityLevel: strict`, `deterministicIds: true`, SVG sanitization, content-hashed attachments, fallback ladder. **Gated by MS02-S1 spike.** | todo | high | — | feature-mermaid-rendering | R-FEA-1; NFR-SEC-5 |
| 16 | MS02-13 | **Attachments & images** — local images: path-safe, content-hashed, reused when unchanged; v1 attachment upload/update/download. | todo | high | — | feature-safe-publish | — |
| 17 | MS02-14 | **Provenance** — visible panel/footer (source path + Git revision + last-sync) + machine content-property metadata. | todo | high | — | feature-safe-publish | traceability 100%; Persona 5 |
| 18 | MS02-15 | **Minimal repair** — `repair-state` for stale locks + interrupted-apply journal replay (premortem §14 beachhead requirement). | todo | medium | — | feature-safe-publish | R-USA-3 |

## Quality, diagnostics & ops

| # | ID | Title | Status | Priority | Blocks | Feature spec | Cross-cutting |
|---|---|---|---|---|---|---|---|
| 19 | MS02-16 | **Quality gate wiring** — unit + integration (mocked Confluence) + golden fixtures mandatory; live-sandbox E2E on dedicated test space; Gherkin BDD for lifecycle invariants (@cucumber/cucumber, TDR-0007). | todo | high | — | — | testing-strategy; R-FEA-5 |
| 20 | MS02-17 | **Doctor health-check** — auth, base URL, space access, permissions, config validity, capability discovery. | todo | medium | — | feature-cli | R-USA-1; premortem §4.2 |
| 21 | MS02-18 | **Adversarial public corpus** — sanitized design-partner pages; test drift/fidelity against real content (macros, nested tables, app content). | todo | medium | — | — | A-VAL-2; R-FEA-9 |
| 22 | MS02-19 | **Cross-platform binary builds** — Bun `--compile` for Linux + Windows (amd64/arm64); clean-OS smoke; signing spike. **macOS deferred to MS-0003.** | todo | medium | — | — | A-FEA-2; A-FEA-10 |

## Backlog readiness checklist

From `backlog-reconciliation.md` — verified against this backlog:

- [x] Every `Must materialize` assumption row has a ticket (MS02-05 A-FEA-9, MS02-11 A-FEA-7, MS02-S1 A-FEA-1, MS02-18 A-VAL-2, MS02-19 A-FEA-2, MS02-08 A-FEA-6, MS02-19 A-FEA-10).
- [x] Every open assumption has a validation trigger and owner.
- [x] Every deferred decision has a trigger captured in an ADR or backlog item.
- [x] Every north-star guardrail and NFR has explicit backlog representation.
- [x] Stable planning IDs (`MS02-<NN>`) used throughout.
- [x] Cross-cutting concerns: zero silent overwrite (MS02-09/10), drift detection (MS02-09), concurrency (MS02-11), secret redaction (MS02-03), provenance (MS02-14), Mermaid security (MS02-12), adapter isolation (MS02-08), accessibility (MS02-03).

## Deferred to later milestones

| Item | Milestone | Trigger |
|---|---|---|
| Guided init / doctor DX polish | MS-0003 | MS-0002 beta feedback |
| Migration / existing-corpus adoption | MS-0003 | A-VAL-3 validated |
| macOS platform | MS-0003 or later | — |
| keytar OS keychain | MS-0002 (deferred, OPEN-Q8) | Env-token path proven first |
| Reverse sync / drift capture | MS-0004+ | Trust wedge proven |
| OAuth 3LO | Post-MS-0002 | Browser-based feature |
| Commit-by-commit provenance | Post-MS-0002 | ADR-0010 opt-in |
