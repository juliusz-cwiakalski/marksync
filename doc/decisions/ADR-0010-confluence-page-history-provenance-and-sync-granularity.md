---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0010
decision_type: adr
status: Proposed
created: 2026-07-04
decision_date: null
last_updated: 2026-07-05
summary: "Squash by default: one Confluence page version per sync with a compact provenance summary in version.message. Commit-by-commit sync (Confluence history mirrors Git history) is deferred to a future milestone as an opt-in option. Rationale: simplicity of implementation, reduced rate-limit/burst risk, and sufficient end-user value (detailed history remains in Git)."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: moderate
review_date: null
business_impact: "Determines whether Confluence page history is a lightweight sync trail (squash) or a full Git-history mirror (commit-by-commit). Choosing squash keeps MS-0002 simpler, safer, and within rate limits."
customer_impact: "Each sync creates one Confluence version with a clear MarkSync prefix and compact commit summary. Direct Confluence edits are identifiable by the absence of the MarkSync prefix. Detailed per-commit history remains in Git."
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
  contributors: [external-researcher, red-team-review]
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
  - "Users express strong demand for commit-by-commit history mirroring in Confluence."
  - "The Confluence version.message length limit proves too small for even a compact squash summary."
  - "Atlassian changes page version/history APIs so version.message is removed, hidden, or no longer returned consistently."
  - "Reverse-sync or drift-detection requirements need a different per-version provenance shape."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: ["../inception/system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: [ADR-0005, ADR-0006, TDR-0003]
  experiments: ["../inception/integration-scenarios/05-page-update-delete.md", "../inception/integration-scenarios/08-page-versions.md"]
  metrics: [NFR-REL-9, NFR-REL-5]
  roadmap_items: [MS-0002]
---

# ADR-0010: Confluence page history provenance and sync granularity — squash by default, commit-by-commit deferred

## Context

MarkSync synchronizes Git-authored Markdown into Confluence Cloud. ADR-0006 established that MarkSync records source provenance in Confluence page history using the page update API's `version.message` field, because content properties are per-page/current state rather than per-version history.

FACT: the Confluence Cloud page update request includes `version: { number, message }`, and the returned page version includes `message` (`doc/inception/integration-scenarios/05-page-update-delete.md`). FACT: page-version history returns version metadata including `message`, which MarkSync can use to identify MarkSync-authored versions vs. direct Confluence edits (`doc/inception/integration-scenarios/08-page-versions.md`).

This ADR was originally written (2026-07-04) with commit-by-commit as the default and squash as opt-in. After owner review, PR #4 comments, and the Phase 3 red-team report (`doc/inception/analysis/phase-3-red-team-review.md`), the owner reversed the decision:

> **"after thinking about it I'd like to revert the strategy, let's use squash by default (and for MS-0002 this should be the only way to proceed)."**

Rationale for the reversal (from PR comments and the owner's review):

1. **Simplicity of implementation** — one version per sync is the simplest provenance model; commit-by-commit requires commit-graph traversal, per-commit body reconstruction, and N sequential writes.
2. **Reduced rate-limit/burst risk** — squash produces 1 write per changed page per sync, not N writes per page; this avoids Confluence burst-limit friction and page-history UI bloat.
3. **Questionable end-user value** — if users want detailed per-commit history, they can inspect Git directly; Confluence page history does not need to mirror Git history to be useful.
4. **Privacy/safety** — squash publishes a compact summary, not full commit messages, reducing the risk of leaking sensitive metadata (internal ticket URLs, customer names, incident details) into a broader Confluence audience.
5. **Scope discipline** — commit-by-commit history mirroring adds implementation and test scope that is not part of the safe one-way publisher wedge (`MS-0002`).

Commit-by-commit sync remains a valid future option — it is deferred, not permanently rejected. A future milestone can add it as an explicit opt-in (`--commit-by-commit` flag) if user demand justifies the added complexity.

## Problem Framing (Clarified)

The question is: **how should MarkSync encode Git provenance into Confluence page history so history is auditable by default, direct Confluence edits remain distinguishable, and sync is simple, safe, and rate-limit-friendly?**

FACT: `version.message` is the correct per-version vehicle for provenance. FACT: MarkSync's safety model depends on ADR-0006 drift detection and no-silent-overwrite behavior, not on page-history messages alone. TO CONFIRM: the exact maximum usable length of Confluence page-version messages/history descriptions.

## Constraints (Hard Requirements)

### C-1: MarkSync-applied versions are machine-distinguishable

- **Statement:** Every MarkSync-applied Confluence page version must be distinguishable from direct Confluence edits using a clear, machine-parseable prefix in `version.message`.
- **Source:** ADR-0006 provenance model; NFR-REL-9.
- **Verification:** Page-version history contains a stable MarkSync prefix for MarkSync writes; a direct Confluence edit lacks that prefix and is classified as non-MarkSync-authored.
- **Negotiable:** no.

### C-2: Squash mode records a compact included-commit summary

- **Statement:** Squashed mode must record the target/head commit plus a compact summary of included commits — commit ID plus subject at minimum — subject to the verified Confluence version-message length limit.
- **Source:** Owner direction (PR #4 comments).
- **Verification:** A squashed sync over multiple commits creates one Confluence version whose message starts with a MarkSync/Git squash prefix and includes the target/head commit plus a deterministic compact list or summary of included commits within the verified limit.
- **Negotiable:** no.

### C-3: Write strategy remains rate-limit and burst-limit safe

- **Statement:** The default strategy must produce minimal writes (one version per changed page per sync) and include backoff, retry-after handling, and no blind fast write loops.
- **Source:** External research on Confluence rate limits; NFR-REL-5; ADR-0006 concurrency and safe-write model.
- **Verification:** Apply execution uses bounded concurrency/serialization, honors retry-after/backoff signals, reports rate-limit diagnostics.
- **Negotiable:** no.

### C-4: Provenance strategy does not weaken drift detection or no-silent-overwrite behavior

- **Statement:** The strategy must not weaken ADR-0006 drift detection, Confluence 409 conflict handling, operation-ID deduplication, lock/property cross-checks, or no-silent-overwrite behavior.
- **Source:** ADR-0006; NFR-REL-1, NFR-REL-2, NFR-REL-5.
- **Verification:** Remote-edit and stale-plan fixtures still block writes before mutation; provenance message generation is metadata on a safe update, not a bypass around version checks.
- **Negotiable:** no.

### C-5: Commit-by-commit is deferred, not permanently rejected

- **Statement:** Commit-by-commit sync (one Confluence version per Git commit) is explicitly out of scope for `MS-0002`. It may be added as an opt-in feature in a future milestone if user demand justifies it.
- **Source:** Owner direction (PR #4 comments): "in future milestones we can add option to sync commit by commit if users wants (ignore for MVP)."
- **Verification:** `MS-0002` scope includes only squash; the roadmap records commit-by-commit as a future option.
- **Negotiable:** no (for `MS-0002`).

## Decision Drivers

**Product / user drivers:**
- Confluence page history should be useful to humans as an audit trail showing when MarkSync synced and what commits were included.
- Direct Confluence edits should be easy to identify later: a page-history entry without a MarkSync/Git prefix is suspect/non-MarkSync-authored.
- Detailed per-commit history remains available in Git; Confluence does not need to duplicate it.

**Technical drivers:**
- Per-version provenance belongs in `version.message`, while `marksync.metadata` remains the current/latest state cross-check.
- The message format should be deterministic and machine-parseable so future tooling can classify versions reliably.
- One write per changed page per sync is the simplest and safest default.

**Operational drivers:**
- Keep write volume minimal and diagnosable under Confluence burst limits.
- Preserve ADR-0006's safety model: no blind retries, no stale overwrites.
- Minimize implementation and test scope for `MS-0002`.

## Mental Models & Techniques Used

- **First Principles:** A Confluence page version is the unit that users inspect in history; therefore Git provenance should be attached to that unit via `version.message`. One version per sync is the minimal sufficient provenance.
- **Inversion:** "How could provenance become misleading?" → missing prefix, overly verbose messages leaking sensitive metadata, or silent truncation. Each risk becomes a constraint.
- **Opportunity Cost:** Commit-by-commit maximizes auditability but adds implementation complexity, write volume, and privacy risk. Squash is sufficient for the `MS-0002` trust wedge; commit-by-commit can be added later if demanded.
- **Subtraction (premortem discipline):** the failure premortem warns against scope explosion. Commit-by-commit history mirroring is a nice-to-have, not part of the safe publisher wedge.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via accepted cost.

|          | C-1 (prefix) | C-2 (squash summary) | C-3 (rate/burst safe) | C-4 (no weakened safety) | C-5 (commit-by-commit deferred) |
|----------|--------------|----------------------|------------------------|---------------------------|----------------------------------|
| Alt 0 — Commit-by-commit default | ✅ | ❌ | ⚠️ | ✅ | ❌ |
| Alt 1 — Squash default, commit-by-commit deferred | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 2 — HEAD-only, no included-commit list | ✅ | ❌ | ✅ | ✅ | ✅ |
| Alt 3 — Detailed provenance only in content property | ❌ | ❌ | ✅ | ⚠️ | ✅ |

### Alternative 0 — Commit-by-commit default with squash opt-in (ORIGINAL DECISION, NOW REVERSED)

- **Summary:** By default, MarkSync creates one Confluence page version per relevant Git commit; squash is the opt-in.
- **Pros:** Maximum Confluence page-history fidelity; mirrors Git history.
- **Cons:** Write amplification (N writes per page); rate/burst-limit risk; page-history UI bloat; privacy exposure from full commit messages; significant implementation and test scope for `MS-0002`.
- **Constraint compliance:** C-1 ✅; C-2 ❌; C-3 ⚠️; C-4 ✅; C-5 ❌.
- **Why rejected:** The owner reversed this decision after review (PR #4 comments, red-team report). Simplicity, rate-limit safety, and scope discipline outweigh the marginal end-user value of per-commit Confluence history.

### Alternative 1 — Squash default, commit-by-commit deferred (RECOMMENDED)

- **Summary:** By default, MarkSync creates **one Confluence page version per sync** with a compact provenance summary in `version.message`. Commit-by-commit sync is deferred to a future milestone as an explicit opt-in.
- **Pros:** Simplest implementation; minimal writes (1 per changed page per sync); rate-limit safe; direct edits identifiable; sufficient auditability for the trust wedge; reduced privacy exposure (compact summary, not full commit messages); aligns with owner direction.
- **Cons:** Confluence page history does not mirror Git history one-to-one; users must inspect Git for per-commit detail.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅; C-5 ✅.
- **Why chosen:** It is the only alternative that satisfies all hard requirements while keeping `MS-0002` simple, safe, and within scope.

### Alternative 2 — HEAD-only, no included-commit list

- **Summary:** Each sync creates one Confluence version recording only the HEAD/target commit, with no summary of intermediate commits.
- **Pros:** Simplest possible message format; minimal length pressure.
- **Cons:** Loses information about which commits were included in the sync; if a sync covers 10 commits, the Confluence version message only shows the final commit, making it harder to trace what changed.
- **Constraint compliance:** C-1 ✅; C-2 ❌; C-3 ✅; C-4 ✅; C-5 ✅.
- **Why rejected:** Fails C-2. The owner explicitly wants a compact included-commit summary so the sync trail is useful without going to Git.

### Alternative 3 — Store detailed provenance only in content property or page body, not `version.message`

- **Summary:** Keep Confluence page-history messages generic or empty; store Git provenance in `marksync.metadata` or page content.
- **Pros:** Avoids version-message length pressure; richer metadata in content properties.
- **Cons:** Content properties are per-page/current, not per-version; page-body provenance is content, not history metadata; direct edit detection from history becomes weaker; users inspecting page history do not see Git provenance where they expect it.
- **Constraint compliance:** C-1 ❌; C-2 ❌; C-3 ✅; C-4 ⚠️; C-5 ✅.
- **Why rejected:** Fails the core per-version provenance requirement. `marksync.metadata` and plan output remain useful complements, not substitutes for `version.message`.

## Decision

**Recommendation: choose Alternative 1 — squash by default; one Confluence page version per sync with a compact provenance summary; commit-by-commit deferred to a future milestone as opt-in.**

For each sync, MarkSync creates **one Confluence page version** per changed page. The `version.message` starts with a clear MarkSync/Git prefix (e.g. `marksync:squash commit=<head-sha>`) and includes:

1. The target/head commit SHA.
2. A compact summary of included commits — commit ID plus subject at minimum — subject to the verified Confluence version-message length limit.
3. If the included-commit list is too long for `version.message`, MarkSync writes a deterministic truncated summary (e.g. first N commit subjects + "+M more") with an explicit truncation marker. The same truncation policy applies to `marksync.metadata` — store only the head SHA + commit count + truncation marker, **not** the full commit-subject list — to prevent the full included-commit list (which may contain sensitive subjects: internal ticket URLs, customer names, incident IDs) from being published to a broader Confluence audience via a different channel. The full list is available only in local plan/apply output (terminal/JSON), never in Confluence.

Before implementation, MarkSync must run a small verification spike to determine the actual usable Confluence `version.message` / history-description length limit. This ADR intentionally does **not** guess a number.

**Commit-by-commit sync** (one Confluence version per Git commit, with full commit messages) is explicitly **out of scope for `MS-0002`**. It may be added in a future milestone as `--commit-by-commit` opt-in if user demand justifies the implementation, testing, and rate-limit-management effort. The roadmap should record this as a future option.

### Constraint Compliance Attestation

- **C-1 — ✅:** Squash mode requires a stable MarkSync/Git prefix in `version.message`, making MarkSync-applied versions distinguishable from direct Confluence edits.
- **C-2 — ✅:** Squash mode records the head/target commit and a compact deterministic summary of included commits (minimum: commit ID + subject when length permits).
- **C-3 — ✅:** One write per changed page per sync is the minimal write strategy; execution uses bounded writes, backoff, retry-after handling.
- **C-4 — ✅:** Provenance messages are attached to otherwise safe page updates and do not bypass ADR-0006 lock/property checks, Confluence 409 handling, operation-ID deduplication, or stale-plan protection.
- **C-5 — ✅:** Commit-by-commit is deferred; `MS-0002` scope includes only squash.

## Trade-offs & Consequences

### Positive Outcomes

- Simplest implementation path for `MS-0002` provenance.
- Minimal write volume (1 per changed page per sync) — rate-limit and burst-limit friendly.
- Direct Confluence edits are identifiable by the absence of the MarkSync/Git prefix.
- Reduced privacy exposure: compact summary, not full commit messages.
- Scope discipline: keeps `MS-0002` focused on the safe publisher wedge.

### Negative Outcomes

- Confluence page history does not mirror Git history one-to-one; users must inspect Git for per-commit detail.
- The implementation still needs deterministic message formatting, length probing, and trimming logic.
- Commit-by-commit demand may materialize later, requiring a future-milestone addition.

### Unresolved Questions

- [ ] What is the verified usable length limit for Confluence `version.message` / page-history description entries? (owner: Juliusz Ćwiąkalski; required before implementation)
- [ ] What deterministic truncation format should be used for over-limit squash commit lists? (owner: Juliusz Ćwiąkalski)
- [ ] Should the canonical machine prefix be human-first (`MarkSync Git sync:`) or compact-first (`marksync:squash commit=<sha>`), or both? (owner: Juliusz Ćwiąkalski)
- [ ] Which future milestone should track commit-by-commit opt-in if demand arises? (owner: Juliusz Ćwiąkalski)

## Implementation Plan

1. Verify the Confluence page-version message / history-description length limit with a small API spike before implementing trimming.
2. Define canonical `version.message` format for squash mode: prefix + head commit + compact included-commit list + truncation marker.
3. Implement squash as the **only** sync granularity for `MS-0002`.
4. Ensure the push executor applies page updates with bounded write behavior, backoff, retry-after handling, and clear diagnostics.
5. Keep ADR-0006 safety controls authoritative: plan from the shared base, write with current `version.number`, treat 409 as drift/concurrency signal, and update lock/property state only after successful apply.
6. Include full provenance (all included commits) in plan/apply output and `marksync.metadata` when `version.message` must be compact or truncated.
7. Record commit-by-commit opt-in as a future-milestone candidate in the roadmap.

## Verification Criteria

- **Metric: Version-message length verified** — Target: documented spike result for maximum usable `version.message` / history-description length; no guessed limit in implementation — Window: before `MS-0002` implementation.
- **Metric: Squash provenance** — Target: a sync over N commits produces 1 Confluence page version with squash prefix, head/target commit, and compact included-commit list/summary — Window: `MS-0002` acceptance tests.
- **Metric: Deterministic trimming** — Target: over-limit squash lists are trimmed deterministically with an explicit truncation marker — Window: `MS-0002` acceptance tests.
- **Metric: Direct-edit classification** — Target: a direct Confluence edit is identifiable in version history by absence of the MarkSync/Git prefix — Window: `MS-0002` acceptance tests.
- **Metric: Rate-limit safety** — Target: a high-change sync uses bounded writes/backoff and reports actionable diagnostics — Window: `MS-0002` integration tests.
- **Metric: Drift safety preserved** — Target: stale-plan and remote-edit fixtures still block with no silent overwrite while provenance messages are enabled — Window: `MS-0002` integration tests.

## Confidence Rating

**Medium-High.** Confidence is high that squash is the correct `MS-0002` default: it is the simplest, safest, and most scope-disciplined option, and it directly addresses the red-team's write-amplification and privacy concerns. Confidence remains medium on the exact Confluence version-message length limit (unverified) and on whether commit-by-commit demand will materialize.

## Revision History

| Date | Change | Source |
|---|---|---|
| 2026-07-04 | Original decision: commit-by-commit default, squash opt-in. | OPEN-Q6 owner answer. |
| 2026-07-05 | **Reversed:** squash default for `MS-0002`, commit-by-commit deferred to future milestone. Rationale: simplicity, rate-limit safety, scope discipline, reduced privacy exposure. | Owner PR #4 comments + Phase 3 red-team report. |

## References

- `ADR-0006` — Document identity and shared-base state model; records per-version Git provenance.
- `ADR-0005` — Storage body representation; every page update sends full Storage body plus version metadata.
- `TDR-0003` — Git adapter; source of commit IDs/messages comes from the Git port.
- `../inception/open-questions/phase-3-open-questions.md` — OPEN-Q6 owner answer (original commit-by-commit direction, now superseded by the reversal).
- `../inception/analysis/phase-3-red-team-review.md` — red-team findings on write amplification, privacy, and scope that informed the reversal.
- `../inception/integration-scenarios/05-page-update-delete.md` — page update API uses `version.message` and 409 optimistic concurrency.
- `../inception/integration-scenarios/08-page-versions.md` — page version history returns version `message`.
- `../spec/nonfunctional.md` — NFR-REL-9 per-version provenance; NFR-REL-5 concurrency safety.
