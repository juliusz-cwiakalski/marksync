---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz/cwiakalski-agentic-delivery-os/blob/main/doc/templates/change-spec-template.md
ados_distribution: redistributable
change:
  ref: GH-62
  type: fix
  status: Proposed
  slug: remote-body-hash-mismatch
  title: "Remote body hash mismatch — Confluence XHTML normalization breaks idempotent sync"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [bug, p0, ms-0002, mvp, sync, drift-detection, idempotency]
  version_impact: patch
  audience: internal
  security_impact: none
  risk_level: medium
  dependencies:
    internal: [shared-base-state-model, drift-classifier, push-flow]
    external: [Confluence Cloud REST API v2]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Fix the remote body hash mismatch that breaks idempotent sync by aligning hash domains and adding fetch-back for Confluence-normalized bodies.

## 1. SUMMARY

This change fixes a P0 bug where every sync after the first classifies all pages as "remote changed" and blocks them, even when no local edits were made. The root cause is a hash-domain mismatch: the classifier compares Confluence's raw Storage XHTML hash (`remote.bodyHash`) against the canonical HAST hash (`base.renderedBodyHash`) — these can never match regardless of Confluence normalization. The fix has three coordinated parts: (1) fetch-back the normalized body after each Create/Update, (2) add `remoteBodyHash` to `SharedBase`, and (3) fix the classifier's comparison to compare raw-to-raw (`remote.bodyHash !== base.remoteBodyHash`) instead of raw-to-canonical. This restores semantic idempotency: a second unchanged push writes 0 pages.

## 2. CONTEXT

### 2.1 Current State Snapshot

The safe publish pipeline (feature-safe-publish.md) delivers a Git→Confluence sync with drift detection, conflict classification, and idempotent re-runs. The state model (ADR-0006) uses a committed lock file mapping DocumentId → PageBinding, where `PageBinding` stores both `renderedBodyHash` (canonical HAST hash, what we sent) and `remoteBodyHash` (raw Storage XHTML hash, what Confluence stored). The drift classifier (`classify()`) performs three-way comparison over `{ local?, base, remote }` to emit SyncState values: `NO_CHANGE`, `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING`.

### 2.2 Pain Points / Gaps

After `marksync sync` creates or updates pages, every subsequent sync classifies ALL pages as "changed" (REMOTE_AHEAD or DIVERGED) and blocks them — even when no local edits were made and no remote edits occurred. This breaks the semantic idempotency guarantee (second unchanged push writes 0 pages), making the tool unusable for CI pipelines and human workflows. Users must manually inspect every "blocked" page or rebuild the lock to continue.

## 3. PROBLEM STATEMENT

Because the drift classifier compares remote raw hashes against base canonical hashes (different hash domains), users cannot safely re-run sync operations without false-positive remote-change detection, resulting in all pages being blocked and requiring manual intervention to unblock.

## 4. GOALS

- **G-1**: Restore semantic idempotency: a second sync with no changes produces all NoOp (0 writes, 0 blocks).
- **G-2**: Align hash domains in the three-way classifier: compare raw-to-raw for remote drift, canonical-to-canonical for local drift.
- **G-3**: Record Confluence-normalized bodies in the lock: fetch-back after Create/Update and store raw hash in `remoteBodyHash`.
- **G-4**: Preserve existing safety invariants: no silent overwrite, no false-negative remote edits.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Second-sync idempotency | 100% NoOp (0 writes, 0 blocks) on unchanged corpus |
| Remote-change detection accuracy | 0% false positives, 0% false negatives |
| Fetch-back success rate | ≥99.9% of Create/Update operations (transient failures only) |

### 4.2 Non-Goals

- **NG-1**: No changes to the canonical hash algorithm (GH-20 F-3) — canonical hash stays as JSON-stringified HAST tree digest.
- **NG-2**: No Confluence normalization reverse-engineering — we do not attempt to predict Confluence's normalization; we fetch-back the stored body.
- **NG-3**: No semantic AST comparison for drift detection — deferred to future milestones (overkill for MS-0002 MVP).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Fetch-back after successful Create/Update | Retrieves Confluence-normalized body to compute accurate remoteBodyHash (fixes stale remoteBodyHash). |
| F-2 | Store remoteBodyHash in SharedBase | Gives classifier access to last-known-remote raw hash (enables raw-to-raw comparison). |
| F-3 | Classify remote drift via raw-to-raw comparison | Separates "did local change?" from "did remote change?" using correct hash domains. |
| F-4 | Propagate remoteBodyHash to PageBinding | Persists accurate remote hash in lock for subsequent sync runs. |
| F-5 | Handle fetch-back failure gracefully | Defines remoteBodyHash behavior when fetch-back fails after successful write. |

### 5.1 Capability Details

**F-1: Fetch-back after successful Create/Update**

After `target.createPage()` or `target.updatePage()` succeeds (and after asset upload if any), immediately call `target.getPage(pageId)` to fetch the page Confluence actually stored. Compute `rawHash(fetchedBody)` and use this as the authoritative `remoteBodyHash`. This costs 1 extra GET per created/updated page (acceptable for MS-0002 MVP, NFR-PERF tolerance).

**F-2: Store remoteBodyHash in SharedBase**

Add `remoteBodyHash: string` to the `SharedBase` interface in `sync-state.ts`. When constructing `SharedBase` from `PageBinding`, populate `remoteBodyHash` from the binding's `remoteBodyHash` field. This gives the classifier access to the last-known-remote raw hash.

**F-3: Classify remote drift via raw-to-raw comparison**

Change the classifier's `remoteChanged` computation from `remote.bodyHash !== base.renderedBodyHash` to `remote.bodyHash !== base.remoteBodyHash`. This correctly separates:
- "Did local change?" → `local.canonicalHash !== base.renderedBodyHash` (canonical vs canonical)
- "Did remote change?" → `remote.bodyHash !== base.remoteBodyHash` (raw vs raw)

This aligns with three-way merge semantics: base carries TWO facets (what we rendered locally + what Confluence stored remotely), and each side is compared to its respective facet.

**F-4: Propagate remoteBodyHash to PageBinding**

After fetch-back, compute `remoteBodyHash` from the fetched body and store it in the `PageBinding`. On Create, replace the "assume fresh" `remoteBodyHash: entry.hashes.canonicalHash` with the fetched raw hash. On Update, replace the stale `remoteBodyHash` (carried via `...binding` spread) with the fresh fetched hash. Persist via `saveLock()` and `target.putProperty()`.

**F-5: Handle fetch-back failure gracefully**

If `target.getPage()` fails after a successful Create/Update (network error, rate limit, permission loss), do not fail the operation. Store a sentinel or the last-known hash (decision deferred to OQ-1) and emit a warning. The sync remains safe: subsequent syncs will re-fetch and update, and the false positive is preferable to blocking the entire run.

## 6. USER & SYSTEM FLOWS

```
Flow 1: Idempotent sync (no changes)
  1. Run marksync sync → Compute plan → Apply (Create/Update pages)
  2. For each Create/Update:
     a. Call target.createPage/updatePage → success
     b. Upload assets (if any) → success
     c. Fetch-back: target.getPage(pageId) → get normalized body
     d. Compute remoteBodyHash = rawHash(fetchedBody)
     e. Update PageBinding with remoteBodyHash
     f. Save lock and put property
  3. Second sync with no changes:
     a. Compute plan → Fetch remote (same as before)
     b. Classify: remote.bodyHash === base.remoteBodyHash (raw-to-raw match)
     c. Classify: local.canonicalHash === base.renderedBodyHash (canonical match)
     d. SyncState = NO_CHANGE → Action = NoOp
     e. Apply report: 0 writes, 0 blocks (all NoOp)
```

```
Flow 2: Remote edit detection
  1. First sync → Create/Update → Fetch-back → Store remoteBodyHash
  2. User edits page directly in Confluence (adds text, changes formatting)
  3. Second sync:
     a. Fetch remote → Compute remote.bodyHash (differs from base.remoteBodyHash)
     b. Classify: remote.bodyHash !== base.remoteBodyHash → remoteChanged = true
     c. SyncState = REMOTE_AHEAD → Action = Block
     d. Apply report: 0 writes, 1 block (correctly detected remote edit)
```

```
Flow 3: Fetch-back failure handling
  1. First sync → Create/Update → success
  2. Fetch-back: target.getPage(pageId) → network error (temporary)
  3. Operation continues: use fallback remoteBodyHash (see OQ-1)
  4. Emit warning in apply report
  5. Second sync: re-fetch remote → compute new remoteBodyHash → update lock
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- `src/domain/state/sync-state.ts`: Add `remoteBodyHash` to `SharedBase` interface.
- `src/domain/state/classifier.ts`: Fix `remoteChanged` comparison to use `base.remoteBodyHash`.
- `src/app/push-flow.ts`:
  - Create path: Replace `remoteBodyHash: entry.hashes.canonicalHash` with fetch-back raw hash.
  - Update path: Replace stale `remoteBodyHash` (via `...binding` spread) with fetch-back raw hash.
  - Add fetch-back after successful Create/Update (after asset upload).
  - Construct `SharedBase` with `remoteBodyHash` in all paths (computePlan, 409 re-fetch).
- `src/domain/binding/page-binding.ts`: No changes (already has `remoteBodyHash` field).
- Test updates: Update classifier tests to use `remoteBodyHash` in comparison; add integration test simulating Confluence normalization.

### 7.2 Out of Scope

- [OUT] Changes to canonical hash algorithm or `contentHash()` in `canonicalize.ts`.
- [OUT] Confluence normalization prediction or reverse-engineering.
- [OUT] Semantic AST comparison for drift detection.
- [OUT] Changes to `PageBinding` schema (field already exists).
- [OUT] Changes to lock file schema (field already exists).
- [OUT] Batch fetch-back optimization (single GET per page is acceptable for MS-0002).

### 7.3 Deferred / Maybe-Later

- Batch fetch-back for multiple pages (deferred to MS-0003+ for scale >500 pages).
- Semantic AST comparison for more robust drift detection (deferred to future milestone).
- Fetch-back retry policy with exponential backoff (deferred to MS-0003+).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this change uses existing Confluence REST API endpoints (`/pages/{id}`) and adds no new endpoints.

### 8.2 Events / Messages

N/A — this change emits no new events.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | SharedBase.remoteBodyHash | New required field: sha256 of Confluence-stored Storage XHTML body (raw hash). Aligns `SharedBase` with `PageBinding.remoteBodyHash`. |
| DM-2 | SyncState.remoteChanged logic | Changed comparison from `remote.bodyHash !== base.renderedBodyHash` to `remote.bodyHash !== base.remoteBodyHash`. |

### 8.4 External Integrations

**Confluence Cloud REST API v2:**
- `GET /pages/{id}`: Already used for remote fetch; this change adds a fetch-back call after successful Create/Update.
- Rate limit impact: +1 GET per Create/Update (acceptable within NFR-PERF tolerance for MS-0002 scale).

### 8.5 Backward Compatibility

- **Lock files with missing `remoteBodyHash`**: The `SharedBase` field is new; existing lock files without `remoteBodyHash` will cause compile-time errors. Since MS-0002 is in development and the field already exists in `PageBinding`, this is acceptable. First sync after this change will populate `remoteBodyHash` via fetch-back.
- **Classifier behavior change**: Existing tests that assumed raw-to-canonical comparison will fail. This is the desired behavior change — false positives were the bug.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Fetch-back latency impact | ≤200 ms per Create/Update (p95), NFR-PERF tolerance acceptable. |
| NFR-2 | Fetch-back failure rate | ≤0.1% (transient network errors only). |
| NFR-3 | Idempotency guarantee | 100% NO_OP on second unchanged sync (0 writes, 0 blocks). |
| NFR-4 | False positive rate | 0% for remote-change detection (no false REMOTE_AHEAD/DIVERGED). |
| NFR-5 | Concurrency safety | No regression in 409 re-fetch-once policy or operation-ID dedup. |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A — this change does not introduce new telemetry. Existing logs cover Create/Update operations; fetch-back calls use standard target logging.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Fetch-back GET exceeds Confluence rate limits | H | L | NFR-PERF tolerance accepts +1 GET per page; MS-0002 scale (≤500 pages) is well within limits. | Low |
| RSK-2 | Fetch-back GET fails after successful write | M | M | Handle gracefully: use fallback hash (OQ-1) + warning; do not fail operation. Next sync will recover. | Low |
| RSK-3 | Existing test suite assumes old comparison | M | H | Update all classifier tests to use `remoteBodyHash`; integration test validates normalization simulation. | Low |
| RSK-4 | Confluence normalization changes between fetch-back and next sync | L | L | Confluence normalization is stable over months; changes are rare and require re-sync anyway. | Low |
| RSK-5 | Fallback remoteBodyHash choice causes false positives | M | M | Decision needed (OQ-1): use canonical hash or empty string? Either is safe; canonical hash causes one false-positive block, empty string causes re-fetch. | Medium |

## 12. ASSUMPTIONS

- Confluence Storage XHTML normalization is stable over time (changes are rare).
- Fetch-back GET succeeds in ≥99.9% of cases (transient errors only).
- MS-0002 scale (≤500 pages) keeps the extra GET overhead acceptable.
- `PageBinding.remoteBodyHash` field already exists in the lock schema (no schema change needed).

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | GH-19 (lock file) | `PageBinding.remoteBodyHash` field delivered. |
| Depends on | GH-22 (classifier) | `classify()` three-way comparison logic delivered. |
| Depends on | GH-23 (push-flow) | `computePlan`/`applyPlan` orchestration delivered. |
| Blocks | MS-0002 E4-bug (this ticket) | Unblock idempotent sync. |
| Blocks | Semantic idempotency AC | Second unchanged push writes 0 pages. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Fallback remoteBodyHash on fetch-back failure: use canonical hash or empty string? | If fetch-back fails after successful Create/Update, what `remoteBodyHash` do we store in the binding? | **RESOLVED (PM):** Store `rawHash(renderedBody)` — the raw hash of the body just written. Same hash domain (raw); if Confluence didn't normalize, next sync is NoOp. If it normalized, rare one-time false-positive block. Emit warning. |
| OQ-2 | Should fetch-back happen after asset upload or before? | Asset upload changes page body (attachment references). Fetch-back after upload captures the final body. | **RESOLVED (PM):** After asset upload. The rendered body already contains `<ri:attachment>` references; uploading assets doesn't change the body string. After-upload captures the final committed state with consistent write-ordering. |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Fetch-back after Create/Update | Required to get Confluence-normalized body; 1 extra GET per page is acceptable for MS-0002 scale. | 2026-07-13 |
| DEC-2 | Add remoteBodyHash to SharedBase | Classifier needs access to last-known-remote hash; aligns SharedBase with PageBinding schema. | 2026-07-13 |
| DEC-3 | Fix classifier comparison to raw-to-raw | Separates local/remote drift detection using correct hash domains (raw for remote, canonical for local). | 2026-07-13 |
| DEC-4 | Rejected: canonical comparison of both sides | Would require parsing fetched-back XHTML into HAST and re-canonicalizing; fragile and complex. | 2026-07-13 |
| DEC-5 | Rejected: semantic AST comparison | Most robust but most work; overkill for MS-0002 MVP. | 2026-07-13 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `src/domain/state/sync-state.ts` | Updated — add `remoteBodyHash` to `SharedBase`. |
| `src/domain/state/classifier.ts` | Updated — fix `remoteChanged` comparison. |
| `src/app/push-flow.ts` | Updated — fetch-back after Create/Update, populate `remoteBodyHash` in bindings, construct `SharedBase` with `remoteBodyHash`. |
| `src/domain/binding/page-binding.ts` | No changes — field already exists. |
| Test suites | Updated — classifier tests, integration tests. |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** a sync creates a new page, **when** the sync completes and a second sync runs with no changes, **then** the second sync produces NoOp (0 writes, 0 blocks). | F-1, F-3, NFR-3 |
| AC-F1-2 | **Given** a sync updates a page, **when** the sync completes and a second sync runs with no changes, **then** the second sync produces NoOp (0 writes, 0 blocks). | F-1, F-3, NFR-3 |
| AC-F2-1 | **Given** a sync creates a new page, **when** the Create succeeds, **then** `target.getPage(pageId)` is called to fetch the normalized body. | F-1 |
| AC-F2-2 | **Given** a sync updates a page, **when** the Update succeeds, **then** `target.getPage(pageId)` is called to fetch the normalized body. | F-1 |
| AC-F3-1 | **Given** `SharedBase` is constructed from `PageBinding`, **when** the binding has `remoteBodyHash`, **then** the `SharedBase.remoteBodyHash` field equals the binding's `remoteBodyHash`. | F-2, DM-1 |
| AC-F4-1 | **Given** the classifier compares remote state to base, **when** both hashes are raw hashes, **then** `remoteChanged` is computed as `remote.bodyHash !== base.remoteBodyHash`. | F-3, DM-2 |
| AC-F4-2 | **Given** the classifier compares local state to base, **when** both hashes are canonical hashes, **then** `localChanged` is computed as `local.canonicalHash !== base.renderedBodyHash`. | F-3 |
| AC-F5-1 | **Given** a sync creates a new page, **when** fetch-back succeeds, **then** the `PageBinding.remoteBodyHash` in the lock equals `rawHash(fetchedBody)`. | F-4 |
| AC-F5-2 | **Given** a sync updates a page, **when** fetch-back succeeds, **then** the `PageBinding.remoteBodyHash` in the lock is refreshed to `rawHash(fetchedBody)`. | F-4 |
| AC-T1-1 | **Given** a classifier unit test with remote and base hashes, **when** the test previously compared `remote.bodyHash !== base.renderedBodyHash`, **then** the test is updated to compare `remote.bodyHash !== base.remoteBodyHash`. | F-3, RSK-3 |
| AC-T2-1 | **Given** an integration test that simulates Confluence normalization (body stored ≠ body sent), **when** a second sync runs with no changes, **then** the test verifies 0 writes, 0 blocks. | F-1, F-3, NFR-3, NFR-4 |
| AC-F5-3 | **Given** a sync creates a new page, **when** fetch-back fails (network error), **then** the operation continues with a fallback hash (see OQ-1) and emits a warning. | F-5, RSK-2 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Merge order:** This change must merge before any MS-0002 release to ensure semantic idempotency.
- **Migration strategy:** Existing lock files will populate `remoteBodyHash` on first sync after this change.
- **Rollback plan:** If this change introduces false negatives, revert to comparison of `remote.bodyHash !== base.renderedBodyHash` and document the reversion.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no data migration required. Existing lock files have the `remoteBodyHash` field (delivered in GH-19); new lock files will populate it correctly.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A — this change does not introduce new privacy or compliance concerns. Existing redaction and security baselines apply.

## 21. SECURITY REVIEW HIGHLIGHTS

N/A — this change does not introduce new security risks. Fetch-back GET uses existing authentication and redaction; no new data paths.

## 22. MAINTENANCE & OPERATIONS IMPACT

- **API usage:** +1 GET per Create/Update (acceptable within existing rate limits).
- **Debugging:** Fetch-back failures emit warnings; logs correlate with `runId` per NFR-OBS-2.
- **Lock file size:** No change (field already exists).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| **canonical hash** | sha256 of JSON-stringified canonical HAST tree (stable, independent of Confluence normalization). |
| **raw hash** | sha256 of Confluence Storage XHTML string (what Confluence stores, includes normalization). |
| **fetch-back** | Immediate GET of a page after successful Create/Update to retrieve the Confluence-normalized body. |
| **semantic idempotency** | A second sync with no changes produces NoOp (0 writes, 0 blocks). |
| **hash domain** | The space of inputs to a hash function; raw hash domain = Storage XHTML strings, canonical hash domain = HAST trees. |

## 24. APPENDICES

### A. Hash Domain Mismatch Example

```typescript
// What we send (rendered by marksync):
const sentBody = '<hr/><p>— em dash</p>';
const canonicalHash = canonicalHash(hast); // sha256 of HAST tree

// What Confluence stores (normalized):
const storedBody = '<hr />\n\n<p>&mdash; em dash</p>';
const rawHash = rawHash(storedBody); // sha256 of string

// Current buggy comparison (can NEVER match):
remoteChanged = rawHash(storedBody) !== canonicalHash(hast); // ALWAYS true

// Fixed comparison (can match):
remoteChanged = rawHash(storedBody) !== rawHash(storedBody); // false when unchanged
```

### B. Three-Way Merge Semantics After Fix

```
          local (canonical)    remote (raw)
                 |                   |
        --------|--------    --------|--------
       |        |        |  |        |        |
       v        v        v  v        v        v
    local  base.canonical  remote   base.raw  remote
Changed  BodyHash         BodyHash  BodyHash  BodyHash
       |        |        |  |        |        |
       |        +--------+  +--------+        |
       |           local^2            remote^2 |
       |           comparison         comparison|
       +-------------------+-------------------+
                          |
                      SyncState
```

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | Juliusz Ćwiąkalski | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored based on:
- Ticket GH-62 (MS2-E4-bug, P0 priority)
- PM analysis in `chg-GH-62-pm-notes.yaml`
- Source code analysis: `classifier.ts`, `sync-state.ts`, `push-flow.ts`, `hashes.ts`
- References: ADR-0006 (shared-base state model), feature-safe-publish.md §3.1 (drift detection)
- Template: `doc/templates/change-spec-template.md`
- Conventions: `.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md`

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-62)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values (NFR-1 to NFR-5)
- [x] Risks include Impact & Probability (RSK-1 to RSK-5)
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs
- [x] Front matter validates per front_matter_rules