---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: redistributable
id: NONFUNCTIONAL
status: Draft
created: 2026-07-04
last_updated: 2026-07-04
owners: [Juliusz Ćwiąkalski]
area: engineering
document_classification: current-truth
links:
  related_artifacts:
    - doc/overview/02-roadmap.md
    - doc/overview/architecture-overview.md
    - doc/inception/analysis/risks.md
  summary: "Non-functional requirements — performance, security, reliability, operability, compatibility, privacy, maintainability, accessibility for MS-0002 and beyond."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Non-Functional Requirements (NFRs)

_NFRs for MarkSync. IDs use the `NFR-<AREA>-<N>` form from
`id-prefix-catalog.md`. Each NFR is tagged to the milestone where it becomes
binding. `MS-0002` NFRs are release-blocking guardrails unless marked
`informational`._

## Performance & scale (`MS-0002` binding unless noted)

| ID | Requirement | Target | Source / rationale |
|---|---|---|---|
| NFR-PERF-1 | Binary size | ~90 MB per OS/arch (**desired**, not hard — larger acceptable if the job gets done) | ADR-0001 accepted tradeoff; owner direction (PR #4) |
| NFR-PERF-2 | Cold-start time | ~2 s on reference hardware (**desired**, not hard — longer acceptable for intermittent CLI / async CI) | Owner direction (PR #4) |
| NFR-PERF-3 | Managed-page scale | ≤ ~500 managed pages per target in `MS-0002` | A-FEA-10; correctness first; large-repo incremental deferred |
| NFR-PERF-4 | Idempotent rerun | A second semantically-unchanged push performs 0 writes | Roadmap metric; R-FEA-8 |
| NFR-PERF-5 | Conversion latency | Per-page Markdown→Storage render ≤ 200 ms (p95) at ≤500 pages | informational; validates subset performance |

## Security (`MS-0002` binding — release-blocking)

| ID | Requirement | Target | Source / rationale |
|---|---|---|---|
| NFR-SEC-1 | No secrets in any output | 0 secrets/tokens in logs, plans, state, diagnostics, error messages | R-SEC-1; premortem §17 #10; INV-SEC-1 |
| NFR-SEC-2 | Secret redaction by construction | Every output path passes a redaction layer; tested per path | R-SEC-1; CC-SEC-1 |
| NFR-SEC-3 | No outbound telemetry | Default config sends no data to any remote endpoint except the configured Confluence target | A-VIA-1; privacy |
| NFR-SEC-4 | Supply-chain baseline | SBOM + automated dependency/license/vuln scan on every release | R-SEC-1 |
| NFR-SEC-5 | Converter injection safety | Malicious Markdown cannot inject `<ac:structured-macro>` server-side; macro-escape property tests | R-SEC-1; spec converter requirements |
| NFR-SEC-6 | Credential storage | Tokens in OS keyring or env; never in project files; `logout` removes material | spec §9.10 |

## Reliability & safety (`MS-0002` binding — release-blocking)

| ID | Requirement | Target | Source / rationale |
|---|---|---|---|
| NFR-REL-1 | Zero silent overwrites | 0 incidents where a remote edit is overwritten without an explicit conflict | INV-SAFE-1; R-VAL-4; roadmap guardrail |
| NFR-REL-2 | Drift-detection effectiveness | 100% of supported remote-edit scenarios detected & blocked | Roadmap guardrail |
| NFR-REL-3 | Conflict false-positive rate | < 5% | Roadmap guardrail; R-FEA-8 |
| NFR-REL-4 | Conversion fidelity | 100% of canonical GFM fixtures survive Markdown→Storage round-trip | Roadmap guardrail; ADR-0005 |
| NFR-REL-5 | Concurrency safety | Two overlapping CI plans never let the older overwrite the newer | A-FEA-7; R-FEA-7 |
| NFR-REL-6 | REMOTE_DELETED invariant | A remotely-deleted managed page is never silently re-created | INV-SAFE-2; roadmap invariant |
| NFR-REL-7 | Partial-apply recoverability | An interrupted apply is recoverable via journal replay / `repair-state` without duplicates | R-FEA-4; spec §9.3/§9.8 |
| NFR-REL-8 | Duplicate-UUID fatal | Two source docs with the same UUID halt before any write | INV-SAFE-3; ADR-0006 |
| NFR-REL-9 | Per-version provenance | Each MarkSync-applied page version carries a clear MarkSync/Git prefix, head commit id, and compact commit summary in `version.message`; direct Confluence edits are identifiable (no marker). **Squash mode only for `MS-0002`**; commit-by-commit deferred to a future milestone. | ADR-0006; ADR-0010 (revised) |
| NFR-REL-10 | Decentralized concurrency | Two runners on separate machines (no shared service) cannot silently overwrite (409 gates stale write) | ADR-0006 C-6 |
| NFR-REL-11 | Version-message length handling | Confluence `version.message` / history-description length limit is verified before implementation; commit-by-commit and squashed messages trim deterministically with a clear marker when required | ADR-0010 |

## Operability & diagnostics (`MS-0002` binding unless noted)

| ID | Requirement | Target | Source / rationale |
|---|---|---|---|
| NFR-OBS-1 | Stable exit codes | Documented, machine-parseable exit codes per error class | North star guardrail; spec §9.1 |
| NFR-OBS-2 | Structured output | JSON/NDJSON output with stable schema; run ID on every result | North star; AI-agent operability |
| NFR-OBS-3 | Diagnostic codes | Stable machine-readable codes for known failure classes; human remediation text | `MS-0003` target; `MS-0002` informational |
| NFR-OBS-4 | `doctor` health-check | Capability + permission + visibility discovery before any create/adopt | R-FEA-10; spec §9.1; `MS-0002` minimal, `MS-0003` full |
| NFR-OBS-5 | Plan/diff before write | Dry-run is first-class; no mutation without a reviewable plan | North star; spec §9.1 |

## Compatibility & portability (`MS-0002` binding)

| ID | Requirement | Target | Source / rationale |
|---|---|---|---|
| NFR-COMP-1 | Cross-OS support | **`MS-0002`: Linux + Windows** (amd64 + arm64 where supported). **macOS deferred to `MS-0003` or later.** | ADR-0001 C-3; owner direction (PR #4) |
| NFR-COMP-2 | Single binary, no runtime | Clean-OS image runs the binary with no Node/Bun/Deno installed | ADR-0001 C-2; clean-OS smoke |
| NFR-COMP-3 | Confluence Cloud only (`MS-0002`) | Data Center deferred (`MS-0009`) | Roadmap; R-VIA-1 |
| NFR-COMP-4 | Git CLI prerequisite | Git is an explicit external prereq (read-only); `doctor` verifies it on `$PATH` | spec §9.4; TDR-0003 |
| NFR-COMP-5 | Branch restriction | Sync restricted to configured `allowBranches` (default `["main"]`); override via `MARKSYNC_ALLOW_BRANCHES` | ADR-0006; OPEN-Q5 |
| NFR-COMP-6 | CI-cacheable cache dir | Single cache root `.marksync/` (**gitignored**; overridable via `MARKSYNC_CACHE_DIR`); `.marksync/cache/` is CI-cacheable; deleting it changes no plan | ADR-0006 C-3; owner direction (PR #4) |

## Privacy (`MS-0002` binding)

| ID | Requirement | Target | Source / rationale |
|---|---|---|---|
| NFR-PRIV-1 | Local-first | No hosted backend for core value | A-VIA-1; north star |
| NFR-PRIV-2 | Remote rendering opt-in | Any path sending diagram content to a remote service is off by default with a warning | ADR-0002 C-3; spec FR-AST-007 |
| NFR-PRIV-3 | No population telemetry | No outbound analytics; metrics are CLI-derivable | North star measurement note |

## Maintainability (`MS-0002` binding unless noted)

| ID | Requirement | Target | Source / rationale |
|---|---|---|---|
| NFR-MAINT-1 | Adapter isolation | All Confluence REST v2/v1 distinctions isolated behind `ConfluenceClient` | A-FEA-6; R-FEA-6 |
| NFR-MAINT-2 | Narrow `MS-0002` matrix | Cloud × one auth path × one subtree; beachhead-critical vs validation-apparatus tagging | R-VIA-1; roadmap |
| NFR-MAINT-3 | Contributor seams | Hexagonal ports enable adapter swaps/contributions without core changes | R-VIA-1; architecture |
| NFR-MAINT-4 | Patch-release SLA | Documented before `MS-0002` release | R-FEA-6 |

## Accessibility & output (`MS-0002` binding)

| ID | Requirement | Target | Source / rationale |
|---|---|---|---|
| NFR-A11Y-1 | No color dependency | Output readable without color; `--no-color`/`--color` flag respected; **non-interactive/scripted env (CI) auto-detected → color disabled by default** | North star / spec NFR; owner direction (PR #4) |
| NFR-A11Y-2 | Plain-log compatible | Screen-reader/plain-text output mode | North star / spec NFR |
| NFR-A11Y-3 | Visible provenance | Every managed page shows source path + Git revision + last-sync (panel/footer) | North star; A-USA-3 |

## Trademark & legal (binding before `MS-0008`)

| ID | Requirement | Target | Source / rationale |
|---|---|---|---|
| NFR-LEGAL-1 | Nominative use only | "Confluence" appears only as a descriptor; non-affiliation notice present | PDR-0001; A-VIA-4 |
| NFR-LEGAL-2 | Formal trademark review | Completed before `MS-0008` public launch | A-VIA-4 |

## Traceability to risks/assumptions

| NFR group | Primary risk/assumption |
|---|---|
| NFR-SEC-* | R-SEC-1, A-VIA-1 |
| NFR-REL-1..3,6 | R-VAL-4, R-FEA-7, R-FEA-8, INV-SAFE-* |
| NFR-REL-4 | ADR-0005, A-FEA-3 |
| NFR-REL-5 | A-FEA-7, R-FEA-7 |
| NFR-REL-7 | R-FEA-4 |
| NFR-PERF-1..3 | A-FEA-10, ADR-0001 |
| NFR-MAINT-1,4 | A-FEA-6, R-FEA-6 |
| NFR-MAINT-2 | R-VIA-1, A-VIA-2 |
| NFR-LEGAL-* | PDR-0001, A-VIA-4 |
