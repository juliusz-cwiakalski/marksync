---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0010
decision_type: adr
status: Proposed
created: 2026-07-04
decision_date: null
last_updated: 2026-07-04
summary: "Use commit-by-commit sync by default so Confluence page history carries Git provenance per version; provide squash opt-in for large/perf-sensitive syncs, with deterministic version.message prefixes and trimming after verifying Confluence history-message limits."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: moderate
review_date: null
business_impact: "Determines whether Confluence page history remains auditable and useful as a Git provenance trail without making large syncs operationally unsafe."
customer_impact: "Affects page-history readability, ability to distinguish MarkSync writes from direct Confluence edits, and write volume/rate-limit behavior during sync."
classification:
  domains: [architecture, reliability, observability]
  archetype: design
  environment: complicated
  rigor: R2
  reversibility: moderate
  stakes: medium
  urgency: medium
  uncertainty: medium
  blast_radius: team
  recurrence: one-off
governance:
  driver: Juliusz Ćwiąkalski
  decider: Juliusz Ćwiąkalski
  contributors: [external-researcher]
  reviewers: []
  performers: [Juliusz Ćwiąkalski]
  informed: []
ai_assistance:
  used: true
  roles: [repository-analyst, analyst, critic, record-writer]
  external_data_shared: false
  citations_verified: true
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "The Confluence version.message/history-description length limit is too small to carry useful commit provenance even after deterministic trimming."
  - "Commit-by-commit sync creates unacceptable write volume, burst-limit failures, or page-history UI degradation for the MS-0002 target scale."
  - "Atlassian changes page version/history APIs so version.message is removed, hidden, or no longer returned consistently."
  - "Reverse-sync or drift-detection requirements need a different per-version provenance shape."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: ["../inception/system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: [ADR-0005, ADR-0006, ADR-0008]
  experiments: ["../inception/integration-scenarios/05-page-update-delete.md", "../inception/integration-scenarios/08-page-versions.md"]
  metrics: [NFR-REL-9, NFR-REL-5]
  roadmap_items: [MS-0002]
---

# ADR-0010: Confluence page history provenance and sync granularity — commit-by-commit by default, squash opt-in

## Context

MarkSync synchronizes Git-authored Markdown into Confluence Cloud. ADR-0006 established that MarkSync records per-version source provenance in Confluence page history using the page update API's `version.message` field, because content properties are per-page/current state rather than per-version history.

FACT: the Confluence Cloud page update request includes `version: { number, message }`, and the returned page version includes `message` (`doc/inception/integration-scenarios/05-page-update-delete.md`). FACT: page-version history returns version metadata including `message`, which MarkSync can use to identify MarkSync-authored versions vs. direct Confluence edits (`doc/inception/integration-scenarios/08-page-versions.md`). FACT: ADR-0006 currently treats commit-by-commit provenance as a working assumption and records that versions without a `marksync:commit=` marker can be treated as direct Confluence edits.

OPEN-Q6 has now been answered by the owner: default to commit-by-commit, provide a squash option, include Git commit identity and message in Confluence history where feasible, and verify the Confluence history-entry/message length limit before implementation rather than guessing it.

External research gathered for this decision reports that Confluence Cloud has no known hard page-version retention limit, but very high version counts can affect UI performance; API-token Basic-auth traffic is exempt from 2026 points quotas, but burst limits still apply; and a hybrid commit-by-commit default with squash opt-in is feasible.

## Problem Framing (Clarified)

The question is not merely whether MarkSync should write one Confluence version or many. The underlying decision is: **how should MarkSync encode Git provenance into Confluence page history so history is auditable by default, direct Confluence edits remain distinguishable, and high-volume syncs remain operationally safe?**

FACT: `version.message` is the correct per-version vehicle for provenance. FACT: MarkSync's safety model depends on ADR-0006 drift detection and no-silent-overwrite behavior, not on page-history messages alone. ASSUMPTION: most MS-0002 repositories value auditability more than minimizing every Confluence write. TO CONFIRM: the exact maximum usable length of Confluence page-version messages/history descriptions.

## Constraints (Hard Requirements)

### C-1: MarkSync-applied versions are machine-distinguishable

- **Statement:** Every MarkSync-applied Confluence page version must be distinguishable from direct Confluence edits using a clear, machine-parseable prefix in `version.message`.
- **Source:** ADR-0006 provenance model; NFR-REL-9; OPEN-Q5/OPEN-Q6 owner direction.
- **Verification:** Page-version history contains a stable MarkSync prefix for MarkSync writes; a direct Confluence edit lacks that prefix and is classified as non-MarkSync-authored.
- **Negotiable:** no.

### C-2: Commit-by-commit mode preserves Git identity and message as fully as feasible

- **Statement:** Commit-by-commit mode must preserve the Git commit identity and commit message in Confluence history as fully as feasible, trimming only when the verified Confluence version-message length requires it.
- **Source:** OPEN-Q6 owner answer; ADR-0006 provenance requirement.
- **Verification:** For a fixture with multiple commits, each resulting Confluence version message includes a MarkSync/Git prefix, the commit ID, and the full commit message when within the verified limit; over-limit messages are deterministically trimmed with an explicit truncation marker.
- **Negotiable:** no.

### C-3: Squashed mode preserves a compact included-commit list

- **Statement:** Squashed mode must preserve a compact list of included commits — commit ID plus subject at minimum, fuller message if feasible — subject to the verified Confluence version-message length.
- **Source:** OPEN-Q6 owner answer.
- **Verification:** A squashed sync over multiple commits creates one Confluence version whose message starts with a MarkSync/Git squash prefix and includes the target/head commit plus a deterministic compact list or summary of included commits within the verified limit.
- **Negotiable:** no.

### C-4: Write strategy remains rate-limit and burst-limit safe

- **Statement:** The strategy must include backoff, batching/guardrails, and no blind fast write loops; commit-by-commit mode must not overwhelm Confluence burst limits.
- **Source:** External research on Confluence rate limits; NFR-REL-5; ADR-0006 concurrency and safe-write model.
- **Verification:** Apply execution uses bounded concurrency/serialization, honors retry-after/backoff signals, reports rate-limit diagnostics, and can stop before exceeding configured write-count guardrails.
- **Negotiable:** no.

### C-5: Provenance strategy does not weaken drift detection or no-silent-overwrite behavior

- **Statement:** The strategy must not weaken ADR-0006 drift detection, Confluence 409 conflict handling, operation-ID deduplication, lock/property cross-checks, or no-silent-overwrite behavior.
- **Source:** ADR-0006; NFR-REL-1, NFR-REL-2, NFR-REL-5.
- **Verification:** Remote-edit and stale-plan fixtures still block writes before mutation; provenance message generation is metadata on a safe update, not a bypass around version checks.
- **Negotiable:** no.

## Decision Drivers

**Product / user drivers:**
- Confluence page history should be useful to humans as an audit trail that mirrors Git history by default.
- Direct Confluence edits should be easy to identify later: a page-history entry without a MarkSync/Git prefix is suspect/non-MarkSync-authored.
- Large or perf-sensitive syncs need an explicit cheaper mode rather than forcing one version per commit forever.

**Technical drivers:**
- Per-version provenance belongs in `version.message`, while `marksync.metadata` remains the current/latest state cross-check.
- The message format should be deterministic and machine-parseable so future tooling can classify versions reliably.
- Trimming must be deterministic and explicit once the real Confluence length limit is verified.

**Operational drivers:**
- Keep write volume bounded and diagnosable under Confluence burst limits.
- Preserve ADR-0006's safety model: no blind retries, no stale overwrites, no hidden dependency on page-history messages for correctness.
- Minimize cognitive load by making the safe/auditable mode the default and the performance shortcut opt-in.

## Mental Models & Techniques Used

- **First Principles:** A Confluence page version is the unit that users inspect in history; therefore Git provenance should be attached to that unit via `version.message`.
- **Inversion:** "How could provenance become misleading?" → missing prefix, HEAD-only squash hiding intermediate commits, silent truncation, or body/property-only provenance. Each risk becomes a constraint.
- **Second-Order Thinking:** Commit-by-commit improves auditability but increases write volume and version count; the squash option absorbs the operational downside without weakening the default.
- **Opportunity Cost:** Squashed-only saves writes but loses the primary trust benefit of mirrored Git history. Commit-by-commit-only maximizes auditability but removes the operator's escape hatch for large syncs.
- **Defense in Depth:** `version.message` provides per-version human/machine provenance; `marksync.metadata`, lock state, and plan output provide fuller/latest details and safety controls.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only with material operational risk to manage.

|          | C-1 (prefix) | C-2 (commit-by-commit provenance) | C-3 (squash included commits) | C-4 (rate/burst safe) | C-5 (no weakened drift safety) |
|----------|--------------|-----------------------------------|--------------------------------|------------------------|---------------------------------|
| Alt 0 — Squashed-only, HEAD only | ✅ | ❌ | ❌ | ✅ | ✅ |
| Alt 1 — Commit-by-commit default, squash opt-in | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 2 — Commit-by-commit-only | ✅ | ✅ | ❌ | ⚠️ | ✅ |
| Alt 3 — Detailed provenance only in content property/page body | ❌ | ❌ | ❌ | ✅ | ⚠️ |

### Alternative 0 — Squashed-only, one Confluence version per sync with HEAD commit only

- **Summary:** Every sync creates one Confluence page version. The version message records only the target/head commit.
- **Pros:** Lowest write volume; simplest execution; easiest to keep under burst limits.
- **Cons:** Loses intermediate Git commits in Confluence history; does not satisfy the owner's request for default commit-by-commit history; HEAD-only provenance is insufficient for squashed updates because included commits are hidden.
- **Constraint compliance:** C-1 ✅ if prefixed; C-2 ❌; C-3 ❌; C-4 ✅; C-5 ✅.
- **Why rejected:** Optimizes write volume by discarding the auditability goal that motivated OPEN-Q6.

### Alternative 1 — Commit-by-commit default with squash opt-in (RECOMMENDED)

- **Summary:** By default, MarkSync creates one Confluence page version per relevant Git commit. Each `version.message` starts with a clear MarkSync/Git prefix and includes commit ID plus full commit message where feasible. Operators can opt into squashing for large/perf-sensitive syncs; the squashed message includes target/head commit and a compact deterministic list/summary of included commits.
- **Pros:** Makes Confluence history mirror Git history by default; direct edits are identifiable; still provides an operational escape hatch; aligns with the owner's OPEN-Q6 answer; preserves ADR-0006 safety controls.
- **Cons:** More writes and more Confluence versions in the default path; requires a message-length spike and deterministic trimming logic; implementation must guard burst limits carefully.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅ with backoff/guardrails; C-5 ✅.
- **Why chosen:** It is the only alternative that satisfies all hard requirements while balancing auditability and operational safety.

### Alternative 2 — Commit-by-commit-only, no squash option

- **Summary:** Always create one Confluence page version per relevant Git commit; no squashed mode is available.
- **Pros:** Maximum page-history fidelity; simplest provenance model; direct edits are very easy to spot.
- **Cons:** No operator escape hatch for high-volume syncs; higher risk of burst-limit friction and page-history UI degradation; fails the owner's explicit request for a squash option.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ❌ (no squashed mode); C-4 ⚠️ (can back off, but cannot reduce write count by squashing); C-5 ✅.
- **Why rejected:** Over-optimizes audit fidelity and ignores the operational/performance mode requested by the owner.

### Alternative 3 — Store detailed provenance only in content property or page body, not `version.message`

- **Summary:** Keep Confluence page-history messages generic or empty, while storing detailed Git provenance in `marksync.metadata` or in visible page content.
- **Pros:** Avoids version-message length pressure; can store richer current-state metadata in content properties or rendered page body.
- **Cons:** Content properties are per-page/current, not per-version; page-body provenance is content, not history metadata; direct edit detection from history becomes weaker; users inspecting page history do not see the Git provenance where they expect it.
- **Constraint compliance:** C-1 ❌; C-2 ❌; C-3 ❌; C-4 ✅; C-5 ⚠️ because history classification would rely on non-history state.
- **Why rejected:** Fails the core per-version provenance requirement. `marksync.metadata` and plan output remain useful complements, not substitutes for `version.message`.

## Decision

**Recommendation: choose Alternative 1 — commit-by-commit sync by default, with squash opt-in.**

For commit-by-commit sync, MarkSync creates one Confluence page version per relevant Git commit. The page update `version.message` starts with a clear MarkSync/Git prefix, such as `MarkSync Git commit:` or a compact machine-parseable form such as `marksync:commit=<sha>`, and includes the commit ID plus the full Git commit message where feasible. If the verified Confluence version-message length requires trimming, MarkSync trims deterministically and includes a clear truncation marker.

For squashed sync, MarkSync creates one Confluence page version for the sync. The `version.message` starts with a clear prefix such as `MarkSync Git squash:` and includes the target/head commit plus a compact list of included commits: commit ID plus subject at minimum, with fuller messages only when feasible inside the verified length limit. If the included-commit list is too long, MarkSync writes a deterministic summary/truncated list in `version.message` and relies on `marksync.metadata` and plan/apply output for full details.

Before implementation, MarkSync must run a small verification spike to determine the actual usable Confluence `version.message` / history-description length limit. This ADR intentionally does **not** guess a number.

### Constraint Compliance Attestation

- **C-1 — ✅:** Both modes require a stable MarkSync/Git prefix in `version.message`, making MarkSync-applied versions distinguishable from direct Confluence edits.
- **C-2 — ✅:** Commit-by-commit mode records commit ID plus full commit message where feasible, with deterministic trimming only after the Confluence limit is verified.
- **C-3 — ✅:** Squashed mode records the head/target commit and a compact deterministic list/summary of included commits, minimum commit ID plus subject when length permits.
- **C-4 — ✅:** The strategy requires safe execution controls: serialized/bounded writes, backoff, retry-after handling, and configurable guardrails for high write counts.
- **C-5 — ✅:** Provenance messages are attached to otherwise safe page updates and do not bypass ADR-0006 lock/property checks, Confluence 409 handling, operation-ID deduplication, or stale-plan protection.

## Trade-offs & Consequences

### Positive Outcomes

- Confluence page history mirrors Git history by default, strengthening user trust and auditability.
- Direct Confluence edits are identifiable by the absence of the MarkSync/Git prefix in version history.
- Operators retain a squash option for large/perf-sensitive syncs without making low-fidelity history the default.
- `version.message` carries per-version provenance, while `marksync.metadata` remains available for latest-state/full-detail summaries.

### Negative Outcomes

- Commit-by-commit default can create many Confluence writes and many page versions.
- Page-history UI performance may degrade for pages with very high version counts even if no hard retention limit is known.
- The implementation needs deterministic message formatting, length probing, trimming, and rate-limit/backoff behavior.
- Squashed histories necessarily lose one-to-one visual mapping in Confluence history, even though included commits are summarized.

### Unresolved Questions

- [ ] What is the verified usable length limit for Confluence `version.message` / page-history description entries? (owner: Juliusz Ćwiąkalski; required before implementation)
- [ ] What deterministic truncation format should be used for over-limit full commit messages and squash commit lists? (owner: Juliusz Ćwiąkalski)
- [ ] What default guardrail should warn or require confirmation before a commit-by-commit sync creates a very large number of page versions? (owner: Juliusz Ćwiąkalski)
- [ ] Should the canonical machine prefix be human-first (`MarkSync Git commit:`) or compact-first (`marksync:commit=<sha>`), or should the message include both? (owner: Juliusz Ćwiąkalski)

## Implementation Plan

1. Verify the Confluence page-version message/history-description length limit with a small API spike before implementing trimming.
2. Define canonical `version.message` formats for commit and squash modes, including prefix, commit ID, branch/path context where appropriate, full/subject message rules, and truncation marker.
3. Make commit-by-commit the default sync granularity and expose squash as an explicit operator choice for large/perf-sensitive syncs.
4. Ensure the push executor applies commit-derived page updates with bounded write behavior, backoff, retry-after handling, and clear diagnostics for rate/burst-limit pressure.
5. Keep ADR-0006 safety controls authoritative: plan from the shared base, write with current `version.number`, treat 409 as drift/concurrency signal, and update lock/property state only after successful apply.
6. Include full provenance in plan/apply output and `marksync.metadata` when `version.message` must be compact or truncated.

## Verification Criteria

- **Metric: Version-message length verified** — Target: documented spike result for maximum usable `version.message` / history-description length; no guessed limit in implementation — Window: before MS-0002 implementation.
- **Metric: Commit-by-commit provenance** — Target: N relevant Git commits produce N MarkSync-applied Confluence page versions, each with prefix + commit ID + full message when within verified limit — Window: MS-0002 acceptance tests.
- **Metric: Deterministic trimming** — Target: over-limit commit messages and squash lists are trimmed deterministically with an explicit truncation marker — Window: MS-0002 acceptance tests.
- **Metric: Squash provenance** — Target: squashed sync produces one Confluence version with squash prefix, head/target commit, and compact included-commit list/summary — Window: MS-0002 acceptance tests.
- **Metric: Direct-edit classification** — Target: a direct Confluence edit is identifiable in version history by absence of the MarkSync/Git prefix — Window: MS-0002 acceptance tests.
- **Metric: Rate-limit safety** — Target: high-commit fixture uses bounded writes/backoff and reports actionable diagnostics rather than a blind fast write loop — Window: MS-0002 integration tests.
- **Metric: Drift safety preserved** — Target: stale-plan and remote-edit fixtures still block with no silent overwrite while provenance messages are enabled — Window: MS-0002 integration tests.

## Confidence Rating

**Medium.** Confidence is high that `version.message` is the correct per-version provenance vehicle and that the hybrid strategy fits the owner's stated intent. Confidence remains medium overall because the exact Confluence history-message length limit is unverified and commit-by-commit write volume must be validated against burst-limit behavior and page-history UI performance at realistic scale.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- `ADR-0006` — Document identity and shared-base state model; records per-version Git provenance and the prior OPEN-Q6 working assumption.
- `ADR-0005` — Storage body representation; relevant because every page update sends full Storage body plus version metadata.
- `ADR-0008` — Git adapter; source of commit IDs/messages comes from the Git port.
- `../inception/open-questions/phase-3-open-questions.md` — OPEN-Q6 owner answer establishing commit-by-commit default with squash option.
- `../inception/integration-scenarios/05-page-update-delete.md` — page update API uses `version.message` and 409 optimistic concurrency.
- `../inception/integration-scenarios/08-page-versions.md` — page version history returns version `message` and supports history-based provenance classification.
- `../spec/nonfunctional.md` — NFR-REL-9 per-version provenance; NFR-REL-5 concurrency safety.
- External research summary (2026-07-04) — no known hard Confluence page-version retention limit; high version counts may affect UI performance; API-token Basic-auth exempt from 2026 points quotas but burst limits still apply; hybrid default/squash approach feasible.
