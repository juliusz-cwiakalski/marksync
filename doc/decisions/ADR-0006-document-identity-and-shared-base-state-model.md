---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0006
decision_type: adr
status: Accepted
created: 2026-07-04
decision_date: null
last_updated: 2026-07-15
summary: "Document identity = immutable source-side UUID v7; shared base = committed versioned lock file; cache = disposable (single CI-cacheable dir); duplicate-UUID is fatal before any write; decentralized coordination via Confluence 409 + operation-ID dedup (no shared service); commit ID recorded per Confluence page version; sync restricted to configured branches. Establishes the safety foundation for drift detection, concurrency control, and reverse sync."
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
  - "CI concurrency proves unachievable with a committed lock + optimistic 409 concurrency alone."
links:
  related_changes: [GH-19, GH-21, GH-22, GH-24, GH-28, GH-62]
  supersedes: []
  superseded_by: []
  spec: ["../inception/system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: [ADR-0001, TDR-0001, ADR-0005]
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
the Confluence side: **content properties** reliably carry
`marksync.metadata` (A-FEA-4, validated), and the **version-conflict 409** is
reliable for drift detection (A-FEA-5, validated).

FACT: content properties survive across page updates (spike E1–E3, ~8.4 KB
accepted). FACT: `version.number = current+1` on update yields a
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

### C-6: Decentralized — no shared coordination service

- **Statement:** Coordination/locking must work with multiple operators/CI runners syncing to the same target **without any shared service** — all exchange and locking lives purely in Git + Confluence.
- **Source:** Owner directive (OPEN-Q5): "multiple people could sync and no shared service is required — all exchange/locking lives purely in git/confluence."
- **Verification:** Two runners on separate machines, no shared service, both sync to the same Confluence target → no silent overwrite (409 gates the stale write).
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
- **Evidence weighting:** A-FEA-4 and A-FEA-5 are `validated` by the spike; the lock/concurrency design is `unvalidated` and must be acceptance-tested (A-FEA-7, A-FEA-9).

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes with accepted cost.

|          | C-1 (identity) | C-2 (committed base) | C-3 (cache disposable) | C-4 (dup fatal) | C-5 (concurrency) | C-6 (decentralized) |
|----------|----------------|----------------------|------------------------|-----------------|-------------------|---------------------|
| Alt 0    | ❌ (path/title = mutable) | ❌ (local cache only) | ✅ | ❌ | ❌ | ❌ |
| Alt 1    | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Alt 2    | ✅ | ⚠️ (remote-only; offline/CI gap) | ✅ | ✅ | ⚠️ (depends on remote-only coordination) | ✅ |

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
  - **Concurrency control:** decentralized optimistic concurrency — Confluence 409 on stale `version.number` + operation-ID dedup + stale-plan expiry (C-5; A-FEA-7).
- **Pros:** Satisfies all constraints; separates identity/base/cache; offline-capable; recovery from Git+Confluence.
- **Cons:** A committed lock file can cause merge conflicts when two branches publish to the same target concurrently (mitigated by serialized apply + a mergeable line-oriented format).
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅; C-4 ✅; C-5 ✅.
- **Why chosen:** The only alternative that satisfies all five constraints with a recovery path.

### Alternative 2 — Remote-only state (content property as the sole base)

- **Summary:** Use the `marksync.metadata` content property as the only shared base; no committed lock.
- **Cons:** Requires a network call to establish the base (fails offline/CI-readiness); CI concurrency relies solely on a remote lease; a permissions gap (R-FEA-10) can hide the base.
- **Constraint compliance:** C-1 ✅; C-2 ⚠️ (not committed; offline gap); C-3 ✅; C-4 ✅; C-5 ⚠️.
- **Why rejected as primary:** Fails the offline/CI-readiness expectation and weakens concurrency. The content property is retained as a **cross-check**, not the primary base.

## Decision

**Recommendation: Alternative 1 — source-side immutable UUID + committed versioned lock file + disposable cache, with the remote content property as a cross-check and optimistic 409-based concurrency control.**

### Identity

- Each managed document has an immutable **UUID v7** generated at first publish and stored in source front-matter (`marksync.uuid`). It survives clones, branches, renames, and moves. **v7 chosen over v4** for time-sortable prefixes (improves lock-file locality and reduces merge conflicts when two branches add documents concurrently); **KSUID was considered** but rejected because the TS/JS library ecosystem is weak (the original `ksuid` npm package is unmaintained; `@langwatch/ksuid`/`@owpz/ksuid` are unproven), whereas UUID v7 has the same 36-char shape as v4 (zero schema-change cost) and solid library support (`uuid` v9+, RFC 9562).
- The Confluence **page ID** is the remote identity (mutable attribute recorded in the lock).
- Title and path are mutable attributes, never identity.
- **Duplicate-UUID detection is fatal before any write** (INV-SAFE-3, C-4).

### Shared base (lock)

- A committed, versioned lock file records, per target, the mapping: `UUID → { pageId, parentPageId, pageVersion, sourceCommit, sourceContentHash, renderedBodyHash, remoteBodyHash, synchronizedAt, toolVersion }`.
- The lock contains **no secrets** and is committed to the repo.
- Lock updates are staged and written **atomically** after a successful apply.
- The two body-hash fields record different hash domains, kept strictly apart
  by the drift classifier: `renderedBodyHash` is the **canonical** hash
  (JSON-stringified HAST digest of what marksync rendered locally); `remoteBodyHash`
  is the **raw** hash (sha256 of the Confluence-stored Storage XHTML, refreshed via
  a post-write fetch-back after each Create/Update). Separating these domains is
  what makes Confluence body normalization invisible to an idempotent rerun.
- The remote `marksync.metadata` content property mirrors key lock fields as a cross-check; lock and property agree after success. A lost lock can be rebuilt from Confluence + Git.

### Cache (disposable, single CI-cacheable dir)

- A single cache root (default `.marksync/`, overridable via `MARKSYNC_CACHE_DIR`) holds:
  - `.marksync/cache/` — **CI-cacheable** (rendered bodies, Mermaid renders, asset metadata, discovered remote graph). Safe to persist across CI runs; every entry is reconstructable from Git + Confluence.
  - `.marksync/journal/<run-id>.jsonl` — **run-specific**, never cached (apply journal).
  - `.marksync/conflicts/<target>/<uuid>/` — **run-specific**, never cached (reverse-sync workspaces).
- The whole tree is gitignored. **Deleting the cache changes no plan.** Correctness depends only on Git + lock + Confluence (C-3). Splitting `cache/` from `journal/`+`conflicts/` lets CI cache only the reconstructable subtree (e.g. GitHub Actions `actions/cache` on `.marksync/cache`).

### Concurrency control (C-5) — decentralized, no shared service

- **No shared service is required.** All coordination lives in Git (committed lock) + Confluence (page version 409). Confluence's server-enforced **409 CONFLICT on stale `version.number`** is the hard gate: any write that does not know the current page version is rejected. Combined with:
  - **operation-ID deduplication** — each plan carries a unique operation ID; the `marksync.metadata` content property records the last-applied operation ID; a replay of an already-applied plan sees a mismatch and aborts;
  - **stale-plan expiry** — a plan unapplied beyond a configurable window (default 15 min) is treated as stale and must be regenerated;
  - **CI concurrency-group templates** — GitHub Actions `concurrency:` etc. to reduce overlap at the source.
- This is **optimistic concurrency**, not pessimistic leasing. At MarkSync's target scale (≤500 pages, ≤10 concurrent runners) the 409-retry rate is manageable; pessimistic leasing (git refs / external lease store) adds crash-recovery complexity for no additional safety. Two overlapping CI plans can never let the older overwrite the newer because the 409 rejects the stale-version write.
- **Delivered (GH-24):** the write-time gates are pure domain functions under `src/domain/state/` — `assertOperationFresh` (operation-ID freshness via UUID-v7 time-prefix comparison), `assertPlanNotExpired` (stale-plan expiry, default 15 min, conservative boundary), and `decideOnConflict` (409 re-fetch-once: reapply vs block over the `SyncState` matrix) — plus the `uuidV7Timestamp` extractor (`src/domain/identity/uuid.ts`, derives the plan timestamp from `runId` with no new `Plan` field). They are wired into `applyPlan`/`processEntry` at `src/app/push-flow.ts` before each document write, with per-document isolation and a max-1-re-fetch + max-1-reapply policy on `Conflict`. The two-runner overlap integration test (separate `FakeTarget` instances sharing a backing map, no shared coordination service) proves NFR-REL-5 (older plan never overwrites newer) and NFR-REL-10 (decentralized).

### Provenance in Confluence page history

- The **commit ID + source path + revision** are recorded in each Confluence page **version's `message` field** (e.g. `marksync:squash commit=<sha> branch=<branch> path=<path>`), which is visible in the Confluence page-history UI and machine-parseable.
- **Default sync granularity = squash** for `MS-0002` (revised per owner PR review and recorded in ADR-0010): each sync creates **one Confluence page version** per changed page, carrying the head commit SHA and a compact included-commit summary in `version.message` with a clear MarkSync/Git prefix. This lets direct Confluence edits be identified later (a version entry **without** a MarkSync/Git marker = direct edit). Commit-by-commit sync (one version per Git commit, mirroring Git history in Confluence) is deferred to a future milestone as an opt-in option. See ADR-0010 for the full decision and revision history.
- Content properties are per-page (not per-version), so `version.message` is the per-version provenance vehicle; `marksync.metadata` carries the latest-sync summary.

### Branch restriction (deployment-gate)

- Sync is restricted to configured branches via `sync.allowBranches` (default `["main"]`), treating Markdown synchronization as a documentation "deployment". A sync attempted from a non-allowed branch exits non-zero with a clear diagnostic. Override via `MARKSYNC_ALLOW_BRANCHES` env var for feature-branch previews. The source branch is recorded in `version.message` and `marksync.metadata.sourceBranch`. CI detached-HEAD is handled via `GITHUB_REF_NAME`/`CI_COMMIT_BRANCH`.

### Repair surface (`MS-0002`)

- `repair-state` handles stale locks and interrupted-apply journal replay (R-USA-3; premortem §14 beachhead).

> **AI-assistance disclosure:** This analysis is AI-assisted and is
> **evidence-backed** for the Confluence side (A-FEA-4, A-FEA-5 validated). The
> lock/concurrency design itself is `unvalidated` and requires acceptance tests
> (A-FEA-7, A-FEA-9). The human decider (Juliusz Ćwiąkalski) has **not yet**
> confirmed. `status: Proposed` until human confirmation.

### Constraint Compliance Attestation

- **C-1 — ✅:** UUID v7 is source-side, immutable, path/title-independent.
- **C-2 — ✅:** Lock is committed and versioned; available offline/CI without a network call.
- **C-3 — ✅:** Cache is gitignored; deleting it changes no plan.
- **C-4 — ✅:** Duplicate-UUID detection halts the plan before any write.
- **C-5 — ✅:** Confluence 409 + operation-ID dedup + stale-plan expiry (optimistic concurrency; acceptance-tested in `MS-0002`).
- **C-6 — ✅:** No shared service — coordination lives in Git (lock) + Confluence (409); two runners on separate machines cannot silently overwrite.

## Trade-offs & Consequences

### Positive Outcomes

- A correct shared base makes drift detection, concurrency control, and reverse sync reasoning sound.
- Re-clone recovers a clean state from Git + lock + Confluence.
- The content-property cross-check survives a corrupted lock.

### Negative Outcomes

- A committed lock can cause merge conflicts when two branches publish concurrently to the same target. Mitigation: line-oriented mergeable format + serialized apply + `repair-state`.
- UUID generation adds a first-publish step (`marksync init`/adopt).
- The lock/concurrency design is `unvalidated` until `MS-0002` acceptance tests pass.

### Unresolved Questions

- [x] **UUID version:** resolved → **UUID v7** (time-sortable; KSUID considered, rejected on TS-library weakness). See Identity section.
- [x] **Lease backend:** resolved → **optimistic concurrency via Confluence 409 + operation-ID dedup + stale-plan expiry** (no pessimistic lease / no shared service; C-6). See Concurrency control section.
- [x] **Stale-plan expiry window:** resolved → **default 15 min** (`sync.stalePlanMinutes`, pre-staged in GH-15), wired and tested in GH-24 with conservative boundary semantics (at/over the window = expired).
- [x] **Lock-file granularity:** resolved → **a single repo-wide `marksync.lock.yml`** with a per-target `targets:` map (per-target organization inside one committed file). Decided in GH-19 DEC-1; the line-oriented, UUID-ordered, UUID-keyed format keeps cross-branch merges clean (a real `git merge-file` of two branches adding different-UUID documents merges with no manual conflict — AC-MERGE-1).
- [x] **Default sync granularity:** resolved → **squash by default for `MS-0002`**; commit-by-commit deferred to a future milestone. See ADR-0010 (revised).

## Implementation Plan

1. **`marksync init` / first-publish** generates a UUID per document and writes it to front-matter.
2. **Lock file** — delivered (GH-19): `marksync.lock.yml` schema v1 (`src/domain/config/lock-schema.json`), loader/saver/merger (`loadLock`/`saveLock`/`mergeBindings`, `src/app/lock.ts`), atomic write via temp + `fs.rename` (`src/infra/lock/store.ts`), line-oriented UUID-ordered format for mergeability. The disposable cache layout (`src/app/cache.ts`) and the pure content-property cross-check (`src/domain/state/reconcile.ts`) landed alongside it.
3. **Content property** `marksync.metadata` written after a successful body update (cross-check).
4. **Concurrency control** — delivered (GH-24): pure domain gates `assertOperationFresh`/`assertPlanNotExpired`/`decideOnConflict` (`src/domain/state/`) + `uuidV7Timestamp` (`src/domain/identity/uuid.ts`) wired into `applyPlan`/`processEntry` (`src/app/push-flow.ts`); optimistic 409 check, operation-ID dedup, stale-plan expiry, re-fetch-once policy.
5. **`repair-state`** — delivered (GH-28): `runRepair` (`src/app/repair.ts`) recovers stale/dirty locks (rebuild from the remote `marksync.metadata` property) and interrupted applies (idempotent completion for post-transaction interruption; remote rebuild for the mid-transaction crash window); dry-run by default, `--apply` executes; emits a `RepairReport` with stable diagnostic codes (R-USA-3).
6. **Version-message provenance** implemented per ADR-0010: squash default for `MS-0002`, clear MarkSync/Git prefix, compact included-commit summary, deterministic trimming after verifying Confluence message length.
7. **Acceptance tests:** clone/CI/concurrency (A-FEA-9), duplicate-UUID fatal (INV-SAFE-3), cache-disposable (C-3), REMOTE_MISSING invariant (INV-SAFE-2), squash history messages (ADR-0010).

## Verification Criteria

- **Metric: Cache-disposable** — Target: delete `.marksync/`, rerun plan → identical output — Window: `MS-0002`.
- **Metric: Duplicate-UUID fatal** — Target: duplicated-UUID fixture aborts with 0 writes — Window: `MS-0002`.
- **Metric: Concurrency** — Target: two overlapping CI plans, older does not overwrite newer — Window: `MS-0002` (A-FEA-7).
- **Metric: Decentralized concurrency** — Target: two runners on separate machines (no shared service) sync to the same target; the stale-version write is 409-rejected — Window: `MS-0002` (C-6).
- **Metric: Per-version provenance** — Target: each MarkSync-applied page version carries a clear MarkSync/Git prefix, head commit id, and compact commit summary in `version.message` subject to verified length/trimming rules; a direct Confluence edit produces a version without that marker — Window: `MS-0002` (ADR-0010).
- **Metric: Branch restriction** — Target: a sync from a non-allowed branch exits non-zero; `MARKSYNC_ALLOW_BRANCHES` override works — Window: `MS-0002`.
- **Metric: Cache layout** — Target: `.marksync/cache/` is CI-cacheable and reconstructable; deleting it changes no plan — Window: `MS-0002`.
- **Metric: Re-clone recovery** — Target: a fresh clone reproduces the shared base from lock + Confluence — Window: `MS-0002`.
- **Metric: REMOTE_MISSING invariant** — Target: a remotely-deleted managed page is never silently re-created — Window: `MS-0002` (INV-SAFE-2).

## Confidence Rating

**Medium-High** on the identity + cache-separation principles (well-grounded in
the premortem and spec). **Medium** on the lock/concurrency design specifics
(`unvalidated`; requires `MS-0002` acceptance tests). The Confluence-side
cross-check is `validated` (A-FEA-4, A-FEA-5).

## Lessons Learned (Retrospective)

- The shared-base lock (`marksync.lock.yml`) landed in GH-19 as a single
  repo-wide file with a per-target `targets:` map, resolving the open
  granularity question: a line-oriented, UUID-ordered, UUID-keyed format lets two
  branches adding different-UUID documents merge cleanly (verified with a real
  `git merge-file`) without manual conflict resolution.
- **The Confluence adapter (GH-21) validated the load-bearing controls against
  real traffic over a `Bun.serve` mock:** the **409 optimistic-concurrency gate**
  (C-5/C-6) parses as designed — `errors[0].code:"CONFLICT"` plus the
  version-laden title yields a typed `Conflict` with correctly extracted version
  numbers (never swapped); the **content-property cross-check** is wired through
  the v1 `PropertyService` (key-based access, GH-66; the `marksync.metadata` string round-trips
  byte-for-byte, incl. ~8 KB — spike H2); and the **403 → warn+skip (never
  delete+recreate)** obligation (INV-SAFE-1) is enforced — a 403 produces
  `Forbidden` and the path issues zero delete/recreate operations. The 409 gate,
  the property cross-check, and the 403 policy now exist as code, not just as
  this decision's text; their live-tenant confirmation is wired for E5-S1.
- **The pure drift classifier (GH-22) landed the pre-write three-way
  comparison** this decision's safety invariants rest on:
  `classify({ local?, base?, remote }) → Result<SyncState, MarkSyncError>` is a
  pure domain function under `src/domain/state/` (zero infrastructure imports),
  producing exactly the six Ubiquitous-Language `SyncState` values and an
  `Action` mapping that blocks `REMOTE_AHEAD`/`DIVERGED` (→ `Conflict`) and
  `REMOTE_MISSING` (→ `RemoteMissing`) by default — enforcing INV-SAFE-1 /
  INV-SAFE-2 at the decision point, ahead of the write-time 409 backstop
  (E3-S7). Its `ContentHash` snapshot delegates `canonicalHash` to the GH-20
  `contentHash(canonicalize(hast))` digest (a single canonicalization
  authority), so the local-drift false-positive guard tracks that module
  automatically. Remote drift compares raw-to-raw
  (`remote.bodyHash !== base.remoteBodyHash`), and after each successful
  Create/Update the write path fetches the page back and stores
  `rawHash(fetchedBody)` as `remoteBodyHash`, so Confluence's Storage XHTML
  normalization is invisible to an idempotent rerun (GH-62).
- **The decentralized concurrency backstop (GH-24) landed the write-time
  defense-in-depth that completes C-5/C-6.** Three pure domain gates under
  `src/domain/state/` — `assertOperationFresh` (operation-ID freshness via
  UUID-v7 time-prefix comparison), `assertPlanNotExpired` (stale-plan expiry,
  conservative boundary), and `decideOnConflict` (409 re-fetch-once: reapply vs
  block over the `SyncState` matrix) — plus the `uuidV7Timestamp` extractor at
  `src/domain/identity/uuid.ts` (DEC-7: derives the plan timestamp from `runId`,
  no new `Plan` field) are wired into the existing `applyPlan`/`processEntry`
  write path at `src/app/push-flow.ts`. The pre-staged `StalePlan` error arm, the
  `operationId` field, and the `stalePlanMinutes` config meant **no error-model
  change, no config change, no identity change** — only gates + wiring. The 409
  policy is re-fetch + re-classify ONCE (max 1 re-fetch + 1 reapply, no loop),
  with per-document isolation (a `StalePlan` aborts only that document). The
  two-runner overlap integration test — two separate `FakeTarget` instances
  sharing a backing map, modeling two runners on separate machines with no
  shared coordination service — proves NFR-REL-5 (older plan never overwrites
  newer) and NFR-REL-10 (decentralized). CI concurrency-group templates under
  `examples/ci/` reduce overlap at the source.

## References

- `../inception/system-specification-draft-from-ai-brainstorm.md` — §2.5 (state model open question), §9.3 (lock/property/cache), §9.8 (push engine, operation key), §11.5 (state machine).
- `../inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md` — §4, §5.1, §5.2, §5.8, §14, §17 #4.
- `../inception/analysis/assumptions.md` — A-FEA-4, A-FEA-5, A-FEA-7, A-FEA-9.
- `../inception/analysis/risks.md` — R-VAL-4, R-FEA-3, R-FEA-4, R-FEA-7, R-USA-3.
- `../inception/analysis/backlog-reconciliation.md` — "State model ADR" — now materialized as this record (ADR-0006).
- Spike findings: `../inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md` (content properties, 409 conflict).
- `../inception/open-questions/phase-3-open-questions.md` — OPEN-Q5 (state-model refinements) and OPEN-Q6 (sync granularity, answered).
- External research (2026-07-04): UUID v7 vs KSUID vs ULID; decentralized locking via 409; Confluence version limits + `version.message` provenance; commit-by-commit feasibility.
- Related decisions: ADR-0001 (TS runtime), TDR-0001 (the spike), ADR-0005 (Storage body — the rendered hash input), TDR-0002 (CLI framework), TDR-0003 (Git adapter), TDR-0004 (testing runner), ADR-0010 (Confluence page history provenance and sync granularity).
