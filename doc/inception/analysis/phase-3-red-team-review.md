---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: PHASE-3-RED-TEAM-REVIEW
status: Draft
created: 2026-07-04
last_updated: 2026-07-04
owners: [Juliusz Ćwiąkalski]
area: inception
document_classification: review-output
links:
  related_pr: "https://github.com/juliusz-cwiakalski/marksync/pull/4"
  related_decisions: [ADR-0001, ADR-0002, ADR-0006, ADR-0010]
  related_changes: []
summary: "Coordinated red-team assessment of Phase 3 inception artifacts: technology stack, architecture overview, ADR migration, new ADRs, and open-question resolution."
ai_assistance: "AI-assisted synthesis of specialist red-team reviews; final approval remains with Juliusz Ćwiąkalski."
---

# Phase 3 Red-Team Review — Technology Stack & Architecture

This document synthesizes the specialist red-team reviews for Phase 3 / PR #4.
It is a coordination artifact: the coordinator does not replace specialist
judgement, but normalizes severity, identifies consensus, and turns the combined
review into actionable gate recommendations.

## Red Team Review Plan

**Material:** Phase 3 inception artifacts in PR #4 — technology stack,
architecture overview, FSE audit, NFR updates, ADR migration to `doc/decisions/`,
ADR-0006 through ADR-0010, and Phase 3 open-question resolution.

**Type:** mixed — architecture docs, technical decisions, product-scope decisions,
documentation, legal/privacy implications, and future implementation controls.

### Selected Reviewers

| Reviewer | Reason | Focus Scope |
|---|---|---|
| `red-team-cto` | Architecture/design docs require architectural review. | Load-bearing decisions, stack coherence, scalability, technology-risk cascade. |
| `red-team-typescript-dev` | Phase 3 chooses TypeScript/Bun and TS ecosystem dependencies. | Bun compile reality, package fit, native modules, TypeScript implementation risks. |
| `red-team-devops-engineer` | Phase 3 makes CI/CD, signing, release, and cross-compile claims. | CI/CD absence, release pipeline, SBOM/signing/notarization, build automation. |
| `red-team-sre` | Architecture includes concurrency, rate limits, write amplification, recovery. | Reliability, operational safety, stale plans, burst limits, observability. |
| `red-team-security-officer` | Code/architecture decisions touch auth, secrets, provenance, dependencies. | Secret exposure, token handling, supply chain, unsafe defaults, privacy controls. |
| `red-team-qa-engineer` | Phase 3 defines acceptance-critical behavior and future test strategy. | Testability, edge-case coverage, acceptance criteria gaps, regression matrix. |
| `red-team-product-manager` | ADR-0010 and stack decisions affect MVP/MLP scope and trust wedge. | Scope discipline, milestone alignment, user value, acceptance criteria. |
| `red-team-business-analyst` | Inception artifacts must stay traceable and process-consistent. | Requirements traceability, stale references, register consistency, change management. |
| `red-team-domain-expert` | Sync state and Confluence metadata are core domain concepts. | Domain terminology, state model integrity, bounded language consistency. |
| `red-team-technical-writer` | Phase 3 is documentation-heavy and becomes current truth. | Clarity, contradictions, stale text, reader guidance, cross-reference quality. |
| `red-team-legal-counsel` | Third-party services, dependencies, Confluence history, commit metadata, privacy. | IP/licensing, personal data exposure, trademark/privacy risks, regulatory concerns. |

### Not Selected (with rationale)

| Reviewer | Why Not |
|---|---|
| `red-team-ceo` | Phase 3 is architecture/stack gating, not a new strategy or market-positioning decision; product-manager/BA covered scope alignment. |
| `red-team-cfo` | No pricing, budget, or material spend decision beyond ordinary OSS tooling; DevOps covered release-cost implications. |
| `red-team-customer-success` | No user-facing workflow copy or onboarding flow changed in this phase; PM/technical writer covered future adoption risks. |
| `red-team-marketing` | No launch messaging or public positioning changed beyond existing MarkSync naming. |
| `red-team-sales` | No commercial packaging, objection-handling, or buyer-facing demo material changed. |
| `red-team-ux-designer` | No UI/interaction design change beyond CLI architecture; CLI UX will need review when command/help flows exist. |
| `red-team-java-dev` | No Java code or JVM ecosystem decision. |
| `red-team-python-dev` | No Python code or Python ecosystem decision. |
| `red-team-go-dev` | Go was explicitly rejected by ADR-0001; no Go implementation remains to review. |
| `red-team-bash-dev` | No shell script artifacts or CI scripts exist yet. |
| `red-team-data-engineer` | No database, analytics, ETL, or data-pipeline design; metadata/state concerns covered by CTO/SRE/security/domain. |

### Coverage Gaps

- There is no dedicated Bun runtime/release-engineering specialist; TypeScript and
  DevOps reviewers partially cover this, but Bun `build --compile` behavior,
  cross-compilation, and native-module packaging remain a specific coverage gap.
- There is no Atlassian-platform specialist. The Confluence API spike reduces the
  gap, but version-history limits, content property size/permissions, and UI
  performance still need live validation before implementation.

## Red Team Collective Assessment

### Overall Verdict: BLOCK → RESOLVED (pending final human review)

> **Resolution update (2026-07-05).** After the owner's detailed PR review and
> the red-team findings, all P0 and most P1 items have been addressed:
>
> | Finding | Resolution |
> |---|---|
> | Consensus #1 (provenance over-specified) | **RESOLVED** — ADR-0010 reversed to squash default for `MS-0002`; commit-by-commit deferred. |
> | Consensus #2 (spike gates not operationalized) | **RESOLVED** — ADR-0002 amended with two-layer decision, stop criteria, expanded fallback ladder; architecture UNCERT flags now say "plan spike early in backlog." |
> | Consensus #3 (stale/contradictory docs) | **MOSTLY RESOLVED** — README Go CLI fixed (line 154); backlog-reconciliation state-model ADR updated; ADR-0006 lease wording fixed; content-property key standardized. **Partial:** README line 361 still said "Go" (fixed in round-2 propagation); REMOTE_DELETED→REMOTE_MISSING was initially incomplete (fixed in round-2 propagation). See round-2 report. |
> | Consensus #4 (test matrices not enumerable) | **PARTIALLY ADDRESSED** — acceptance-test matrix to be created in Phase 4 / `MS-0002` planning; risk register enhanced with permission-asymmetry detection. |
> | P0 #1 (provenance policy) | **RESOLVED** — squash default eliminates full-commit-message exposure. |
> | P0 #2 (fix stale docs) | **RESOLVED** — all stale references fixed. |
> | P0 #3 (operationalize spike gates) | **RESOLVED** — ADR-0002 two-layer + TDR-0002 compile-smoke gate + UNCERT spike-planning note. |
> | P1 #4 (downgrade keytar) | **RESOLVED** — tech-stack updated: keytar spike-gated, env-token is guaranteed `MS-0002` path. |
> | P1 #5 (acceptance-test matrix) | **DEFERRED** — to Phase 4 / `MS-0002` planning. |
> | P1 #6 (separate aspirational DevOps) | **DEFERRED** — to Phase 4 CI baseline. |
> | P1 #7 (rate/write-volume guardrails) | **RESOLVED** — squash default produces 1 write/page/sync. |
>
> The original BLOCK verdict is lifted; the remaining items (acceptance-test
> matrix, CI baseline) are Phase 4 / implementation concerns, not Phase 3 gate
> blockers.

### Original Verdict: BLOCK

~~Block Phase 3 approval **as current truth** until the P0/P1 documentation and
decision issues below are resolved.~~ (All P0 items now resolved — see table above.)

The architecture direction is promising and well aligned with the trust wedge.
The original artifacts contained several load-bearing contradictions and unsafe
defaults that would have carried forward into `MS-0002` implementation if merged
unchanged. These have been addressed in the 2026-07-05 revision.

This is not a rejection of the strategy; it was a gate to keep Phase 3 from
cementing ambiguity around provenance privacy, Mermaid feasibility, release
claims, concurrency behavior, and domain terminology.

## Consensus Findings (flagged by 2+ reviewers)

### 1. Commit-by-commit provenance is over-specified as the default without enough safety policy

**Flagged by:** `red-team-sre`, `red-team-security-officer`, `red-team-legal-counsel`, `red-team-product-manager`, `red-team-qa-engineer`

- **Impact:** ADR-0010 improves auditability but introduces write amplification,
  page-history UI bloat, rate/burst pressure, stale-plan interactions, and
  privacy/IP exposure via full Git commit messages in Confluence history. This
  can expand `MS-0002` beyond the safe one-way publisher wedge and create an
  avoidable legal/security incident if sensitive commit metadata is published.
- **Action:** Keep provenance, but add a mandatory provenance policy before
  implementation: redaction rules, configurable inclusion level, default-safe
  message shape, guardrails for write count/version count, and explicit tests
  for rate-limit/stale-plan behavior.

### 2. Load-bearing spike gates are documented but not operationalized enough

**Flagged by:** `red-team-cto`, `red-team-typescript-dev`, `red-team-devops-engineer`, `red-team-qa-engineer`

- **Impact:** ADR-0002 Mermaid rendering and Bun single-binary distribution are
  not ordinary implementation details; they justify the TypeScript+Bun stack.
  The current docs name the uncertainty but do not define a crisp go/no-go,
  timebox, fallback decision tree, or release-blocking evidence bundle.
- **Action:** Add a Phase 4/`MS-0002` spike gate checklist with objective pass/fail
  criteria for Mermaid determinism, binary packaging, dependency bundling,
  signing/notarization, and fallback scope.

### 3. Current-truth docs contain stale or contradictory statements

**Flagged by:** `red-team-business-analyst`, `red-team-domain-expert`, `red-team-technical-writer`, `red-team-cto`

- **Impact:** Phase 3 is intended to become the architecture/current-truth base
  for implementation. Stale references to a Go CLI, obsolete ADR locations, an
  already-materialized state-model ADR, and contradictory lease vs optimistic
  concurrency wording will cause implementers and reviewers to follow different
  contracts.
- **Action:** Fix stale references and terminology before merge. In particular,
  update `doc/inception/README.md`, `backlog-reconciliation.md`, ADR-0006
  concurrency language, and the content-property/state terminology splits.

### 4. Test matrices are not yet enumerable enough for the safety promise

**Flagged by:** `red-team-qa-engineer`, `red-team-sre`, `red-team-security-officer`, `red-team-product-manager`

- **Impact:** The docs assert safety controls — no silent overwrite, remote-edit
  detection, decentralized concurrency, provenance classification — but several
  cases remain described conceptually rather than as enumerable fixtures. This
  risks AI-generated false confidence and misses the premortem's primary failure
  modes.
- **Action:** Add an acceptance-test matrix before implementation starts,
  including remote edit, stale plan, concurrent CI, permission asymmetry,
  commit-message redaction, length truncation, squashed mode, and rate-limit
  pressure.

## Critical Findings by Domain

### Architecture / CTO

- **Critical:** ADR-0002 Mermaid rendering is a stack-level gate, not a minor
  dependency choice. If in-process Mermaid fails, ADR-0001's TypeScript/Bun
  rationale weakens materially. Add an explicit go/no-go/timebox/fallback tree.
- **High:** ADR-0006 and architecture docs mix "lease" wording with an optimistic
  409-based model. The docs must use one coherent concurrency model.

### TypeScript / Runtime

- **Critical:** `keytar` is a native module and may conflict with Bun
  `build --compile`, cross-compilation, and the single-binary promise. Treat it
  as spike-gated or move OS-keyring support behind an optional adapter with env
  token support as the guaranteed `MS-0002` path.
- **High:** `jsdom` + Mermaid determinism and packaging must be proven across the
  target OS/arch matrix, not assumed from ecosystem fit.

### DevOps / Release Engineering

- **Critical:** The docs describe GitHub Actions, release matrices, signing,
  notarization, SBOM, checksums, and cross-compile outputs, but no CI/CD pipeline
  exists yet. These are aspirational until a minimal pipeline lands.
- **High:** Signing/notarization should be treated as a release-readiness gate,
  not only a future nice-to-have, because unsigned binaries undermine the MLP
  trust story.

### SRE / Reliability

- **Critical:** Commit-by-commit default can multiply writes and interact badly
  with stale-plan expiry, rate/burst limits, and page-history UI performance.
  Guardrails must be designed before implementation.
- **High:** Decentralized concurrency needs concrete failure-mode tests for two
  runners, stale plans, operation-ID replay, and interrupted apply.

### Security / Legal

- **Critical:** Full Git commit messages and metadata in Confluence
  `version.message` can expose secrets, personal data, internal incident details,
  customer names, ticket URLs, or third-party IP to a broader Confluence audience.
  Add a default-safe redaction/policy model before approving ADR-0010 as current
  truth.
- **High:** Supply-chain controls are named but not yet turned into enforceable
  checks: dependency review, SBOM, license policy, and redaction tests.

### QA

- **Critical:** Remote-edit and decentralized-concurrency scenarios are not yet
  enumerable enough to be acceptance-ready.
- **High:** Version-message length, deterministic truncation, squashed provenance,
  and direct-edit classification need explicit fixtures.

### Product / Business Analysis

- **Critical:** ADR-0010 may expand `MS-0002` from a narrow safe publisher into a
  history-reconstruction product unless guarded. Keep `MS-0002` focused on safe
  publish + drift detection.
- **High:** `doc/inception/README.md` still describes a Go CLI and old ADR home;
  `backlog-reconciliation.md` still says the state-model ADR has not been
  written. These undermine traceability.

### Domain / Technical Writing

- **Critical:** Content-property key terminology is inconsistent:
  `marksync.metadata` vs `marksync.metadata.v2`. Pick one canonical key and use
  it everywhere, with migration rules if the suffix is retained.
- **High:** State names split between `REMOTE_MISSING` and `REMOTE_MISSING`.
  Choose one ubiquitous-language term or define their distinct meanings.
- **High:** ADR-0006 should remove contradictory lease phrasing now that the
  decision text says optimistic concurrency rather than pessimistic leasing.

## Conflicts and Tensions

- **Auditability vs privacy/safety:** Product and architecture value
  commit-by-commit history because it mirrors Git in Confluence, while security
  and legal flag full commit messages as sensitive metadata exposure. Suggested
  resolution: keep commit identity as the default provenance primitive, but make
  full commit-message publication policy-controlled and redacted by default.
- **Single-binary DX vs native OS integration:** Product/UX value OS keyring
  storage for local setup, while TypeScript/DevOps flag `keytar` as a native
  packaging risk. Suggested resolution: make env/profile token support the
  guaranteed path; keep keyring as optional/spike-gated until Bun packaging is
  proven.
- **Narrow MVP vs rich provenance:** ADR-0010 improves trust, but SRE/PM/QA warn
  that default commit-by-commit semantics create extra implementation and test
  scope. Suggested resolution: explicitly cap `MS-0002` provenance requirements:
  stable prefix + commit ID + safe compact metadata are mandatory; full-message
  fidelity and large-history optimization may slip if they threaten the wedge.

## Prioritized Action Items

1. **P0 — Define safe provenance policy for ADR-0010** (owner: security/legal +
   architecture/product). Decide default fields, redaction rules, full-message
   opt-in/opt-out behavior, deterministic truncation, and write-count guardrails.
2. **P0 — Fix contradictory/stale current-truth docs** (owner: technical writing
   + BA/domain). Update `doc/inception/README.md`, `backlog-reconciliation.md`,
   ADR-0006 concurrency wording, content-property key naming, and sync-state
   terminology.
3. **P0 — Operationalize ADR-0002 and Bun packaging gates** (owner: CTO +
   TypeScript + DevOps). Add pass/fail criteria, timebox, evidence required, and
   fallback decision tree for Mermaid/jsdom and Bun `build --compile`.
4. **P1 — Downgrade or gate `keytar` in the tech stack** (owner: TypeScript +
   security). Treat OS keyring as optional until compiled-binary compatibility is
   proven; document env-token path as the guaranteed MVP fallback.
5. **P1 — Add an acceptance-test matrix for safety-critical scenarios** (owner:
   QA + SRE + security). Cover remote edits, stale plans, concurrent runners,
   operation replay, permission asymmetry, rate limits, provenance redaction,
   length truncation, and direct-edit classification.
6. **P1 — Separate aspirational DevOps from existing controls** (owner: DevOps).
   Either land minimal CI skeletons in the next implementation phase or label
   release/signing/SBOM items as planned gates with explicit milestone ownership.
7. **P1 — Add rate/write-volume guardrails to ADR-0010** (owner: SRE + product).
   Include warning/confirmation thresholds, squash recommendation logic, and
   bounded apply behavior.
8. **P2 — Refresh cross-links and `related_decisions` metadata** (owner: BA +
   technical writer). Ensure Phase 3 artifacts link ADR-0010 where relevant and
   no longer point readers to obsolete ADR homes.

## Coverage Gaps

- Bun-specific compiled-binary and native-module behavior needs direct spike
  evidence; no selected reviewer can fully replace a hands-on packaging spike.
- Confluence history-message limits and page-history UI degradation need live
  tenant validation; no reviewer can infer the exact platform behavior from docs.

## Bottom Line

Phase 3 is directionally strong: the architecture supports the trust wedge,
ports-and-adapters boundaries are sensible, and the Confluence API spike has
meaningfully reduced platform uncertainty. However, the current PR should not be
accepted as current truth until provenance privacy, Mermaid/Bun gates,
concurrency wording, stale references, and domain terminology are corrected. The
highest leadership risk is letting an auditable-history feature silently become a
privacy, reliability, and scope-expansion liability before implementation starts.
