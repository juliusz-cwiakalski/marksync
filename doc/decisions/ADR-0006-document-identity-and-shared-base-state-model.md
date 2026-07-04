---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0006
decision_type: adr
status: Proposed
created: 2026-07-04
decision_date: null
last_updated: 2026-07-04
summary: "Document identity = immutable source-side UUID (v4); shared base = committed versioned lock file; cache = disposable; duplicate-UUID is fatal before any write. Establishes the safety foundation for drift detection, concurrency control, and reverse sync."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: hard
review_date: null
business_impact: "The state model is load-bearing for the entire safety promise (no silent overwrite, drift detection, CI concurrency). Getting it wrong is a brand-defining failure (R-VAL-4)."
customer_impact: "Determines whether remote edits are protected, whether CI runs are safe under concurrency, and whether a re-clone recovers a clean state."
classification:
  domains: [architecture, security, reliability]
  archetype: design
  environment: complicated
  rigor: R2
  reversibility: hard
  stakes: high
  urgency: high
  uncertainty: medium
  blast_radius: team
  recurrence: one-off
governance:
  driver: Juliusz Ćwiąkalski
  decider: Juliusz Ćwiąkalski
  contributors: []
  reviewers: []
  performers: [Juliusz Ćwiąkalski]
  informed: []
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: true
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "The committed lock file causes unworkable merge conflicts for the target team sizes."
  - "Confluence content properties become unreliable for cross-checking the lock."
  - "Reverse sync (`MS-0005+`) requires a base representation the lock cannot express."
  - "CI concurrency proves unachievable with a committed lock + lease alone."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: ["../inception/system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: [ADR-0001, ADR-0004, ADR-0005]
  experiments: ["../inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md"]
  metrics: [NFR-REL-1, NFR-REL-5, NFR-REL-8]
  roadmap_items: [MS-0002]
---

# ADR-0006: Document identity and shared-base state model — source-side UUID + committed lock + disposable cache

## Context

MarkSync's entire safety promise — no silent overwrite, drift detection, CI
concurrency control, and eventually reverse sync — rests on a correct **shared
base**: a way for two clones, two CI runs, or a workstation and a pipeline to
agree on "what was last published" and "what is the durable identity of this
document."

The failure premortem identifies "wrong state model" as a top feasibility risk
(§4, §5.1, §5.2): relying on cache/timestamps/titles/paths for decisions that
require durable identity and a shared base. The Phase 2 red-team escalated this
(C2/H2) and the backlog-reconciliation explicitly flagged a state-model ADR as
**must materialize in Phase 3**.

The spec (§9.3) sketches a lock file + remote property (`marksync.metadata`) +
disposable `.marksync/` cache, but leaves several load-bearing questions open
(§2.5: "commit lock vs remote-only state"). The `MS-0001` spike has now verified
the Confluence side: **v2 content properties** reliably carry
`marksync.metadata` (A-FEA-4, validated), and the **version-conflict 409** is
reliable for drift detection (A-FEA-5, validated).

FACT: content properties survive across page updates (spike E1–E3, ~8.4 KB
accepted; v1 deprecated). FACT: `version.number = current+1` on update yields a
machine-parseable 409 (spike G1). FACT: the `.marksync/` cache is local-only and
gitignored in every reference implementation.

## Problem Framing (Clarified)

The question is **not** "lock vs remote-only state" (the spec's framing). It is:
*what is the durable identity, what is the shared base, and what is disposable?*
These are three separable concerns that the premortem (§5.1) insists on
separating:

1. **Identity** — what makes a document "the same document" across clones/branches/CI, independent of path/title/page-ID?
2. **Shared base** — how do operators agree on the last-synced state, so drift and concurrency can be reasoned about?
3. **Cache** — what is purely a local performance optimization and must never be needed for correctness?

## Constraints (Hard Requirements)

### C-1: Identity survives clones, branches, renames, and CI

- **Statement:** A document's durable identity must be immutable, source-side, and independent of filesystem path, title, or Confluence page ID (all of which are mutable attributes).
- **Source:** Premortem §5.2 ("Wrong state model"); spec §9.3.
- **Verification:** A document moved/renamed in Git retains its identity; a re-clone recovers the binding; title-based discovery never silently binds.
- **Negotiable:** no.

### C-2: The shared base is version-controlled and mergeable

- **Statement:** The record of "what was last published" must live in the repository (committed, reviewed, branched) — not in a local cache or a remote-only store — so two operators share it.
- **Source:** Premortem §5.1; spec §9.3 ("lock may be committed").
- **Verification:** A second clone has the shared base without any network call; CI and local agree on the base.
- **Negotiable:** no.

### C-3: The cache is never needed for correctness

- **Statement:** Deleting `.marksync/` must change no plan. Correctness depends only on Git + lock + Confluence.
- **Source:** Premortem §5.1; spec §9.3 ("cache is never needed for correctness").
- **Verification:** Delete cache, rerun plan — identical output.
- **Negotiable:** no.

### C-4: Duplicate identity is fatal before any write

- **Statement:** Two source documents with the same UUID must halt the entire plan before any mutation.
- **Source:** Premortem §5.2, §17 #4; INV-SAFE-3.
- **Verification:** A fixture with a duplicated UUID aborts the plan with a clear diagnostic and zero writes.
- **Negotiable:** no.

### C-5: CI concurrency cannot let a stale plan overwrite a newer one

- **Statement:** Two overlapping CI runs against the same target must not allow the older plan's apply to overwrite the newer plan's result.
- **Source:** Premortem §5.8; R-FEA-7; A-FEA-7.
- **Verification:** A concurrency integration test: two overlapping plans, the older must not overwrite the newer.
- **Negotiable:** no.

## Decision Drivers

**Safety drivers:**
- The zero-silent-overwrite brand promise (R-VAL-4) is unrealizable without a correct shared base.
- CI-first operation makes concurrency a first-class concern, not an edge case (R-FEA-7).

**Technical drivers:**
- Identity must be durable across re-clone (so not a local cache) and across rename (so not a path).
- The shared base must be available offline and in CI without a network call (so committed, not remote-only).

**Operational drivers:**
- A committed lock file must not cause unworkable merge conflicts for typical team sizes.
- Recovery from a lost/partial state must be possible from Git + Confluence alone.

## Mental Models & Techniques Used

- **Separation of concerns:** identity ≠ shared base ≠ cache (premortem §5.1).
- **Inversion:** "how could a silent overwrite happen?" → stale cache mistaken for the base; two CI runs racing on a stale base; title-based binding grabbing the wrong page. Each is closed by a distinct control below.
- **Defense in depth:** the lock is the primary base, but the remote `marksync.metadata` content property is a cross-check that survives a lost/corrupted lock.
- **Evidence weighting:** A-FEA-4 and A-FEA-5 are `validated` by the spike; the lock/lease design is `unvalidated` and must be acceptance-tested (A-FEA-7, A-FEA-9).

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes with accepted cost.

|          | C-1 (identity) | C-2 (committed base) | C-3 (cache disposable) | C-4 (dup fatal) | C-5 (concurrency) |
|----------|----------------|----------------------|------------------------|-----------------|-------------------|
| Alt 0    | ❌ (path/title = mutable) | ❌ (local cache only) | ✅ | ❌ | ❌ |
| Alt 1    | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 2    | ✅ | ⚠️ (remote-only; offline/CI gap) | ✅ | ✅ | ⚠️ (depends on remote lease) |

### Alternative 0 — Path/title/cache-based identity (do nothing / spec-as-misread)

- **Summary:** Use filesystem path or page title as identity; use the local `.marksync/` cache as the shared base.
- **Cons:** Fails every safety constraint: renames break identity; re-clone loses the base; two CI runs race on independent caches.
- **Constraint compliance:** C-1 ❌; C-2 ❌; C-3 ✅; C-4 ❌; C-5 ❌.
- **Why rejected:** This is exactly the premortem's "wrong state model" failure (§5.1, §5.2).

### Alternative 1 — Source-side UUID + committed lock + disposable cache (RECOMMENDED)

- **Summary:**
  - **Identity:** an immutable UUID generated in source front-matter at `marksync init`/first-publish; stored in the Markdown file; never changes. Confluence page ID = remote identity (mutable attribute, recorded in the lock).
  - **Shared base:** a committed, versioned **lock file** mapping document UUID → `{ pageId, parentPageId, pageVersion, sourceCommit, sourceContentHash, renderedBodyHash, remoteBodyHash, synchronizedAt, toolVersion }` (spec §9.3 schema). The lock contains no secrets and is committed to the repo.
  - **Cache:** `.marksync/` (rendered bodies, asset cache, journal, conflict workspaces) is gitignored and disposable. Correctness depends only on Git + lock + Confluence.
  - **Cross-check:** the remote `marksync.metadata` content property (A-FEA-4) mirrors the lock's key fields; a lost/corrupted lock can be rebuilt from Confluence. Lock and property agree after a successful sync.
  - **Duplicate-UUID detection:** fatal before any write (C-4, INV-SAFE-3).
  - **Concurrency control:** per-target serialization + repo/target lease + operation-ID dedup + stale-plan expiry (C-5; A-FEA-7).
- **Pros:** Satisfies all constraints; separates identity/base/cache; offline-capable; recovery from Git+Confluence.
- **Cons:** A committed lock file can cause merge conflicts when two branches publish to the same target concurrently (mitigated by the lease + serialized apply + a mergeable line-oriented format).
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅; C-5 ✅.
- **Why chosen:** The only alternative that satisfies all five constraints with a recovery path.

### Alternative 2 — Remote-only state (content property as the sole base)

- **Summary:** Use the `marksync.metadata` content property as the only shared base; no committed lock.
- **Cons:** Requires a network call to establish the base (fails offline/CI-readiness); CI concurrency relies solely on a remote lease; a permissions gap (R-FEA-10) can hide the base.
- **Constraint compliance:** C-1 ✅; C-2 ⚠️ (not committed; offline gap); C-3 ✅; C-4 ✅; C-5 ⚠️.
- **Why rejected as primary:** Fails the offline/CI-readiness expectation and weakens concurrency. The content property is retained as a **cross-check**, not the primary base.

## Decision

**Recommendation: Alternative 1 — source-side immutable UUID + committed versioned lock file + disposable cache, with the remote content property as a cross-check and a lease-based concurrency control.**

### Identity

- Each managed document has an immutable **UUID** (v4) generated at first publish and stored in source front-matter (`marksync.uuid`). It survives clones, branches, renames, and moves.
- The Confluence **page ID** is the remote identity (mutable attribute recorded in the lock).
- Title and path are mutable attributes, never identity.
- **Duplicate-UUID detection is fatal before any write** (INV-SAFE-3, C-4).

### Shared base (lock)

- A committed, versioned lock file records, per target, the mapping: `UUID → { pageId, parentPageId, pageVersion, sourceCommit, sourceContentHash, renderedBodyHash, remoteBodyHash, synchronizedAt, toolVersion }`.
- The lock contains **no secrets** and is committed to the repo.
- Lock updates are staged and written **atomically** after a successful apply.
- The remote `marksync.metadata` content property mirrors key lock fields as a cross-check; lock and property agree after success. A lost lock can be rebuilt from Confluence + Git.

### Cache (disposable)

- `.marksync/` holds rendered bodies, asset cache, the apply journal (`<run-id>.jsonl`), and conflict workspaces. It is gitignored.
- **Deleting the cache changes no plan.** Correctness depends only on Git + lock + Confluence.

### Concurrency control (C-5)

- Per-target serialization + a repo/target lease + operation-ID deduplication + stale-plan expiry + CI concurrency-group templates (A-FEA-7). Two overlapping CI plans can never let the older overwrite the newer.

### Repair surface (`MS-0002`)

- `repair-state` handles stale locks and interrupted-apply journal replay (R-USA-3; premortem §14 beachhead).

> **AI-assistance disclosure:** This analysis is AI-assisted and is
> **evidence-backed** for the Confluence side (A-FEA-4, A-FEA-5 validated). The
> lock/lease design itself is `unvalidated` and requires acceptance tests
> (A-FEA-7, A-FEA-9). The human decider (Juliusz Ćwiąkalski) has **not yet**
> confirmed. `status: Proposed` until human confirmation.

### Constraint Compliance Attestation

- **C-1 — ✅:** UUID is source-side, immutable, path/title-independent.
- **C-2 — ✅:** Lock is committed and versioned; available offline/CI without a network call.
- **C-3 — ✅:** Cache is gitignored; deleting it changes no plan.
- **C-4 — ✅:** Duplicate-UUID detection halts the plan before any write.
- **C-5 — ✅:** Lease + serialization + operation-ID dedup + stale-plan expiry (acceptance-tested in `MS-0002`).

## Trade-offs & Consequences

### Positive Outcomes

- A correct shared base makes drift detection, concurrency control, and reverse sync reasoning sound.
- Re-clone recovers a clean state from Git + lock + Confluence.
- The content-property cross-check survives a corrupted lock.

### Negative Outcomes

- A committed lock can cause merge conflicts when two branches publish concurrently to the same target. Mitigation: line-oriented mergeable format + the lease + serialized apply + `repair-state`.
- UUID generation adds a first-publish step (`marksync init`/adopt).
- The lock/lease design is `unvalidated` until `MS-0002` acceptance tests pass.

### Unresolved Questions

- [ ] **UUID version:** v4 (random) is the default; v7 (time-ordered) could improve lock-file locality/mergeability. (owner: JC — see OPEN-Q5)
- [ ] **Lock-file granularity:** single repo-wide lock vs per-target lock files. Per-target reduces merge conflicts but adds file count. (owner: JC — see OPEN-Q5)
- [ ] **Lease backend:** filesystem lockfile in the repo vs an external lease store. Repo-local is simpler and CI-friendly; an external store is needed only for cross-runner serialization beyond a single repo. (owner: JC)
- [ ] **Stale-plan expiry window:** how long before a planned-but-unapplied operation is considered stale. (owner: JC)

## Implementation Plan

1. **`marksync init` / first-publish** generates a UUID per document and writes it to front-matter.
2. **Lock file** implemented per spec §9.3 schema v1; atomic write; line-oriented format for mergeability.
3. **Content property** `marksync.metadata` written after a successful body update (cross-check).
4. **Concurrency control** implemented in the push executor: lease acquisition, operation-ID dedup, stale-plan expiry.
5. **`repair-state`** for stale locks + journal replay (R-USA-3).
6. **Acceptance tests:** clone/CI/concurrency (A-FEA-9), duplicate-UUID fatal (INV-SAFE-3), cache-disposable (C-3), REMOTE_DELETED invariant (INV-SAFE-2).

## Verification Criteria

- **Metric: Cache-disposable** — Target: delete `.marksync/`, rerun plan → identical output — Window: `MS-0002`.
- **Metric: Duplicate-UUID fatal** — Target: duplicated-UUID fixture aborts with 0 writes — Window: `MS-0002`.
- **Metric: Concurrency** — Target: two overlapping CI plans, older does not overwrite newer — Window: `MS-0002` (A-FEA-7).
- **Metric: Re-clone recovery** — Target: a fresh clone reproduces the shared base from lock + Confluence — Window: `MS-0002`.
- **Metric: REMOTE_DELETED invariant** — Target: a remotely-deleted managed page is never silently re-created — Window: `MS-0002` (INV-SAFE-2).

## Confidence Rating

**Medium-High** on the identity + cache-separation principles (well-grounded in
the premortem and spec). **Medium** on the lock/lease design specifics
(`unvalidated`; requires `MS-0002` acceptance tests). The Confluence-side
cross-check is `validated` (A-FEA-4, A-FEA-5).

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- `../inception/system-specification-draft-from-ai-brainstorm.md` — §2.5 (state model open question), §9.3 (lock/property/cache), §9.8 (push engine, operation key), §11.5 (state machine).
- `../inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md` — §4, §5.1, §5.2, §5.8, §14, §17 #4.
- `../inception/analysis/assumptions.md` — A-FEA-4, A-FEA-5, A-FEA-7, A-FEA-9.
- `../inception/analysis/risks.md` — R-VAL-4, R-FEA-3, R-FEA-4, R-FEA-7, R-USA-3.
- `../inception/analysis/backlog-reconciliation.md` — "State model ADR (recommended, not yet written) — Must materialize in Phase 3."
- Spike findings: `../inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md` (content properties, 409 conflict).
- Related decisions: ADR-0001 (TS runtime), ADR-0004 (the spike), ADR-0005 (Storage body — the rendered hash input).
