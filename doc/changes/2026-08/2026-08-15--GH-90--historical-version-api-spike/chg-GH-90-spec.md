---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/juliuszcwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
change:
  ref: GH-90
  type: docs
  status: Proposed
  slug: historical-version-api-spike
  title: "Spike: Confluence historical version API — verify fetch-body-at-version-N (v1 + v2), record TDR-0011"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0003, spike, priority:critical]
  version_impact: none
  audience: internal
  security_impact: low
  risk_level: low
  dependencies:
    internal: []
    external: [Atlassian Confluence Cloud REST API v1 + v2 (existing demo sandbox tenant)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Convert PDR-0002's TO-CONFIRM assumption — "Confluence Cloud API can fetch a page body at historical version N" — into a verified fact backed by fresh, redacted live evidence, and record the verdict as TDR-0011 so the MS3-E2-S1 `resolve` design can lock (or redesign per the pre-committed fallback).

## 1. SUMMARY

This is a load-bearing, session-bounded verification spike (MS3-E0-S1, `priority:critical`). The MS-0001 inception spike (2026-07-03) already proved the **v2** historical-fetch forms live (evidence P5-05/P5-06); GH-90 delivers the **delta beyond that baseline**: (1) the v1 form `GET /wiki/rest/api/content/{id}?status=historical&version={n}&expand=body.storage`, (2) deleted/trashed-page version-fetch behavior, (3) documented version-metadata availability, (4) a fresh 2026-08 live re-validation of the v2 forms, and (5) a TDR-0011 verdict (GO / GO-with-limitations / NO-GO) with limitations and the fallback consequence (snapshot base body in lock/cache). Deliverables are redacted evidence captures in this change folder's `evidence/` directory plus TDR-0011 and its registry row — **zero `src/` changes, no version bump**.

## 2. CONTEXT

### 2.1 Current State Snapshot

- `MS-0002` shipped 2026-07-26; `MS-0003` is re-scoped per [PDR-0002](../../../decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md) to "Company Adoption MVP". Epic E2's `resolve` patch flow diffs (a) the Confluence version that originated from the last marksync publish (base version, recorded in the committed lock, ADR-0006) against (b) the current Confluence version — both reverse-converted to Markdown (PDR-0002 Decision §2). That design **presumes the API can fetch the Storage body at the recorded base version N**.
- PDR-0002's evidence table carries this as **TO-CONFIRM** ("Confluence Cloud API can fetch a page body at historical version N", confidence Med, impact if false: "base-version capture redesigned — snapshot base body in lock/cache"), and revisit trigger #3 fires exactly on its disproof.
- Prior live evidence exists: the MS-0001 API-validation spike (2026-07-03, TDR-0001) proved against the same sandbox tenant that `GET /wiki/api/v2/pages/{id}?version={n}&body-format=storage` returns the version-n body under current metadata (P5-06), and `GET /wiki/api/v2/pages/{id}/versions?body-format=storage` returns per-version bodies inline, newest-first (P5-05); `versions/{n}` returns metadata (`authorId`, `message`, `createdAt`). See [08-page-versions.md](../../../inception/integration-scenarios/08-page-versions.md).
- The sandbox tenant (demo sandbox; creds pattern `tmp/marksync-demo/.env` — base URL, user email, API token, Basic auth) is the same tenant/space used by the MS-0001 spike and the live e2e regression; it exists and is operational.
- TDR-0001 established the spike pattern this change inherits: C-1 disposable sandbox (never production), C-2 captured **redacted** request/response evidence, C-3 results recorded as durable decision records.

### 2.2 Pain Points / Gaps

- **Design lock blocked.** MS3-E2-S1 (`resolve` patch flow) and MS3-E5-S2 (read-permission check design) cannot lock while the base-version fetch is TO-CONFIRM (ticket dependencies).
- **v1 form never exercised.** The `status=historical&version={n}` v1 content form is unverified — including whether the version parameter is honored at all in that combination.
- **Deleted-page behavior unknown.** No prior capture shows what historical/current fetch returns for a trashed (soft-deleted) page, on either API form.
- **Metadata availability undocumented.** Which endpoints return author / timestamp / version message (v1 `expand=version` → `version.by`/`version.when`/`version.message`; v2 `versions` endpoints) has no recorded finding.
- **Prior evidence is aging.** P5-05/P5-06 are ~6 weeks old (2026-07-03); sandbox/API behavior may have drifted (the v2 `user/by-me` 400 documented in TDR-0010 shows drift happens). A fresh capture is required before a design locks onto it.

## 3. PROBLEM STATEMENT

Because the load-bearing assumption behind the `resolve` base-version diff — that Confluence Cloud can fetch a page's Storage body at a specific historical version N across the relevant API forms and page states — remains TO-CONFIRM with stale and partial evidence, MS3-E2-S1 cannot lock its design, risking costly rework of base-version capture (or a silent redesign toward the snapshot fallback) after implementation begins.

## 4. GOALS

- **G-1**: Produce a fresh, evidence-backed verdict (GO / GO-with-limitations / NO-GO) for fetch-body-at-version-N, covering the v1 `status=historical` form and re-validating the v2 forms live.
- **G-2**: Verify and document deleted/trashed-page version-fetch behavior (before/after trash) on both API forms.
- **G-3**: Document version-metadata availability (author, timestamp, message) for every endpoint form under test that returns it.
- **G-4**: Record the verdict as **TDR-0011** per repo decision-record conventions, with limitations, the base-version-capture consequence (including the snapshot-in-lock/cache fallback if any limitation is found), and links to the evidence files; register it in the decision index.
- **G-5**: Contain the spike: one disposable sandbox page (created, bumped ≥3 versions, trashed after capture), zero `src/` changes, no product behavior or config change, no version bump.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| §5.1 matrix cases captured with redacted request + response evidence | 100% |
| Secrets (token / email / Authorization header values) in any committed artifact | 0 |
| `src/` file changes in the change diff | 0 |
| Sandbox content created/modified other than the spike's own page | 0 |
| TDR-0011 verdict recorded + evidence-linked + registered in `00-index.md` | 1 record + 1 index row |
| Cleanup mode recorded (trash vs purge of the spike page) | recorded |

### 4.2 Non-Goals

- **NG-1**: No `src/`, test-suite, config, or shipped-product change of any kind (docs-only deliverable).
- **NG-2**: No implementation of the `resolve` flow, base-version capture, or the reverse converter — GH-90 only unblocks their design.
- **NG-3**: Not the MS3-E0-S2 in-process Mermaid spike (parallel deliverable, independent).
- **NG-4**: No creation of the MS-3 story file (`doc/planning/milestones/MS-3/` — added later, per the ticket).
- **NG-5**: No writes outside the sandbox space, and within it, no writes to any content other than the spike's own disposable page.
- **NG-6**: No edits to frozen history (prior decision records, MS-0001 evidence) — cited, never rewritten; PDR-0002's TO-CONFIRM row is resolved by linking TDR-0011 (phase-7 reconciliation), not by rewriting PDR-0002's history.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | v1 historical body fetch at version N is verified live (the primary TO-CONFIRM delta) | The `resolve` design's assumed mechanism has only ever been proven on v2; v1 `status=historical&version={n}` is the ticket's first-listed scope item. |
| F-2 | v2 historical body fetch is re-validated fresh (2026-08) | P5-06 is 6 weeks old; API drift is documented in this tenant's history (TDR-0010); a design lock needs current evidence. |
| F-3 | Version-metadata availability (author, timestamp, message) is documented per endpoint | Ticket AC-2; needed to attribute versions (MarkSync vs human edits) in future `resolve`/drift UX. |
| F-4 | Deleted/trashed-page version-fetch behavior is verified (pre/post trash, both forms) | Ticket AC-1 "deleted/edge" state; the `resolve` flow must know what the base-version fetch returns when the page has been trashed remotely. |
| F-5 | Nonexistent-version edge behavior is captured (both forms) | Cheap adversarial case; documents error contracts (expected 404-class) for the future adapter. |
| F-6 | A redacted, manifest-indexed evidence pack exists in the change folder | TDR-0001 C-2 pattern; makes every finding independently checkable and review-safe. |
| F-7 | TDR-0011 records verdict + limitations + base-version consequence, registered in the index | TDR-0001 C-3 pattern; the durable artifact MS3-E2-S1 design lock consumes. |

### 5.1 Capability Details — verification case matrix

Sandbox fixture: **one** disposable page in the sandbox space, bumped to ≥3 versions (v1/v2/v3) with distinct Storage bodies and distinct version messages where supported. All captures = redacted request line + response status + response body (see §21 and the redaction contract in DEC-2/NG notes). Naming pattern per PM: `V1-HIST-v2.json`, `V2-TRASHED-hist.json`, etc.; a manifest (`README` or equivalent) maps case → file → endpoint → result.

| Case | Form (API ID, §8.4) | Request shape | Scenario | Evidence file (pattern) |
|------|---------------------|---------------|----------|--------------------------|
| V1-HIST | API-1 | `GET /wiki/rest/api/content/{id}?status=historical&version={n}&expand=body.storage` | Fetch non-current version N (n < latest) | `V1-HIST-v{n}.json` |
| V1-CURR | API-1 | `…?status=current&expand=body.storage` | Current-state baseline | `V1-CURR.json` |
| V1-META | API-1 | `…?status=historical&version={n}&expand=version` (and/or combined expand) | Metadata fields (`version.by`, `version.when`, `version.message`) | `V1-META-v{n}.json` |
| V1-TRASHED | API-1 | historical + current forms after trash | Post-delete behavior (incl. probing `status=trashed` if supported) | `V1-TRASHED-hist.json` / `V1-TRASHED-curr.json` |
| V1-NOVER | API-1 | `…version=99…` | Version that never existed | `V1-NOVER.json` |
| V2-HIST | API-2 | `GET /wiki/api/v2/pages/{id}?version={n}&body-format=storage` | P5-06 re-validation | `V2-HIST-v{n}.json` |
| V2-VERSLIST | API-3 | `GET /wiki/api/v2/pages/{id}/versions?body-format=storage` | P5-05 re-validation (inline bodies, newest-first) | `V2-VERSLIST.json` |
| V2-VERSN | API-3 | `GET /wiki/api/v2/pages/{id}/versions/{n}` | Single-version metadata (`authorId`, `createdAt`, `message`) | `V2-VERSN-{n}.json` |
| V2-TRASHED | API-2 | historical + current fetches after trash | Post-delete behavior | `V2-TRASHED-hist.json` / `V2-TRASHED-curr.json` |
| V2-NOVER | API-2 | `?version=99&body-format=storage` | Version that never existed | `V2-NOVER.json` |

**Verdict scale (F-7, pre-committed in DEC-5):**

- **GO** — at least one API form returns the exact version-N Storage body for a current (non-deleted) page, freshly verified; no material caveats.
- **GO-with-limitations** — base case works but with material caveats (e.g., only one form works; trashed-page semantics constrain a `resolve` edge; metadata gaps) — each limitation named with its design consequence.
- **NO-GO** — no form returns the version-N body; the PDR-0002 revisit trigger #3 fallback applies: **snapshot the base body in the committed lock / disposable cache at publish time** instead of fetching it at resolve time.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Evidence capture (happy path, session-bounded)
  Operator (owner + delivery agent): load sandbox creds from the established
    local pattern (tmp/marksync-demo/.env — never committed, never captured)
  → create ONE disposable page in the sandbox space (v1, distinct body + message)
  → update to v2, v3 (distinct Storage bodies; version messages where supported)
  → run the §5.1 matrix pre-trash (V1-HIST, V1-CURR, V1-META, V1-NOVER,
     V2-HIST, V2-VERSLIST, V2-VERSN, V2-NOVER), capturing each request/response
  → trash (soft-delete) the page
  → run post-trash cases (V1-TRASHED-*, V2-TRASHED-*)
  → optionally purge the spike's own page if the endpoint is available and
     strictly page-scoped; otherwise trash is the accepted cleanup
  → redact captures → write evidence files + manifest into evidence/

Flow 2 — Verdict & durable record
  Assess findings vs the §5.1 matrix and verdict scale
  → author TDR-0011 (repo decision-record conventions, TDR-0010 structure):
     verdict, limitations, base-version-capture consequence (fallback if any),
     evidence links, revisit triggers
  → add the TDR-0011 row to doc/decisions/00-index.md
  → flag phase-7 reconciliation targets (08-page-versions.md extension,
     PDR-0002 TO-CONFIRM resolution link, roadmap outcome note) for @doc-syncer
  → PM dod_check → PR (docs branch; PM owns commits)
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Live verification against the existing demo sandbox tenant/space (same as MS-0001 spike and live e2e regression), using the established local creds pattern.
- One disposable spike page: create, bump to ≥3 versions with distinct Storage bodies, capture, trash; purge only of the spike's own page and only if feasible/non-destructive to other content; record which cleanup mode was performed.
- Execution of the full §5.1 case matrix (F-1..F-5) with redacted request/response captures.
- Evidence artifacts in this change folder's `evidence/` directory: per-case named captures (JSON or equivalent verbatim HTTP capture) plus a manifest mapping case → file → endpoint → result.
- TDR-0011 (`doc/decisions/TDR-0011-confluence-historical-version-api-spike.md`) per repo decision-record conventions, with verdict, limitations, consequences (incl. fallback), evidence links, revisit triggers; registration row in `doc/decisions/00-index.md`.
- Phase-7 flags (not authored in this spec's delivery phases 1–6): extension of `08-page-versions.md` with the v1 form + deleted behavior + fresh-evidence pointers; resolution link on PDR-0002's TO-CONFIRM row; possible roadmap outcome note — each decided by `@doc-syncer`.

### 7.2 Out of Scope

- [OUT] Any `src/`, test, config, or shipped-code change (NG-1).
- [OUT] Implementing the `resolve` flow, base-version capture, or the reverse converter (NG-2).
- [OUT] The MS3-E0-S2 in-process Mermaid spike (NG-3).
- [OUT] Creating the MS-3 story file under `doc/planning/milestones/MS-3/` (NG-4).
- [OUT] Any mutation of sandbox or production content other than the spike's own page (NG-5).
- [OUT] Version bump or release-branch activity — no shipped-code change exists to ship (PM decision).
- [OUT] Editing frozen history: prior decision records and MS-0001 evidence files are cited, never modified (NG-6).

### 7.3 Deferred / Maybe-Later

- Wiring historical-fetch behavior into the Confluence adapter and mock server (contract fixtures derived from these captures) — belongs to the MS3-E2 implementation change.
- `collaborators[]` and `minorEdit` metadata semantics beyond availability — only if trivially visible in captured responses; not a matrix case.
- Purge-endpoint permission semantics beyond the spike's own page — explicitly not probed (destructive).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — MarkSync adds no HTTP surface. The endpoints under verification are Confluence Cloud's; see the API table in §8.4 and the case matrix in §5.1.

### 8.2 Events / Messages

N/A — no events or messages are produced or consumed.

### 8.3 Data Model Impact

No product data model is touched. New/changed **documentation artifacts** only:

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | Evidence pack + manifest (`evidence/` in this change folder) | **New** — per-case redacted captures; manifest maps case → file → endpoint → result. Frozen history once merged. |
| DM-2 | TDR-0011 decision record | **New** — verdict (GO / GO-with-limitations / NO-GO), limitations, base-version consequence, evidence links, revisit triggers; TDR-0010-conformant structure/front-matter. |
| DM-3 | Decision registry row (`doc/decisions/00-index.md`) | **Updated** — TDR-0011 entry added. |

### 8.4 External Integrations

Read-only verification plus page-scoped lifecycle writes, all against the existing sandbox tenant:

| ID | Confluence Cloud endpoint form | Usage in this spike |
|----|-------------------------------|---------------------|
| API-1 | v1 content: `GET /wiki/rest/api/content/{id}` with `status=historical\|current\|trashed` + `version={n}` + `expand=body.storage,version` | Cases V1-HIST, V1-CURR, V1-META, V1-TRASHED, V1-NOVER (F-1, F-3, F-4, F-5) |
| API-2 | v2 pages: `GET /wiki/api/v2/pages/{id}?version={n}&body-format=storage` | Cases V2-HIST, V2-TRASHED, V2-NOVER (F-2, F-4, F-5) |
| API-3 | v2 versions: `GET /wiki/api/v2/pages/{id}/versions` (list, optional `body-format`) and `GET …/versions/{n}` | Cases V2-VERSLIST, V2-VERSN (F-2, F-3) |
| API-4 | Page create/update + trash (soft-delete); purge of the spike's own page only if available and page-scoped | Fixture provisioning and cleanup (G-5, NFR-2); post-trash captures ride on API-1/API-2 |

No contract of any MarkSync-owned integration changes; the spike produces **knowledge about** these endpoints, not code against them.

### 8.5 Backward Compatibility

Fully backward compatible — zero shipped surface changes (`src/` untouched, no version bump, no config or CLI change). Version impact: **none**.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | Redaction of all committed evidence | 0 occurrences of API token, user email, or Authorization header value in any artifact under `evidence/`, the TDR, or the manifest (grep-swept pre-commit; author identifiers masked with stable placeholders — §21) |
| NFR-2 | Sandbox containment | Writes to exactly 1 created page + its own version bumps + its own trash (and own-page purge if performed); 0 mutations of any other content, in sandbox or production |
| NFR-3 | Evidence coverage | 100% of §5.1 matrix cases captured with request line + response status + response body, each indexed by the manifest |
| NFR-4 | Zero shipped-code delta | 0 `src/` file changes in the change diff |
| NFR-5 | Politeness of the spike | ≤ ~20 API requests total (sequential; trivially below any rate limit) |
| NFR-6 | Evidence integrity | Each capture file is valid, reviewable verbatim (raw HTTP or JSON), and names its case per the §5.1 pattern |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A — no product telemetry, tracing, or alerting is added. The observability surface of this change **is** the evidence pack + manifest (DM-1): durable, reviewable, and linked from TDR-0011.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Sandbox/API behavior has drifted since the 2026-07-03 MS-0001 evidence (v2 forms now behave differently) | M | M | This is the spike's purpose: fresh captures are authoritative and supersede the old evidence; TDR-0011 records any delta vs P5-05/P5-06 explicitly. | L |
| RSK-2 | v1 `status=historical` does not honor `version={n}` as assumed (e.g., param ignored, different expand semantics) | M | M | A **finding, not a blocker**: captured as a limitation with its design consequence; the verdict scale (GO-with-limitations / NO-GO) absorbs it; v2 evidence may still carry a GO. | L |
| RSK-3 | Redaction leak — token/email/auth header value lands in a committed artifact (C-7 / PDR-0002 constraint) | H | L | Redact before writing; deterministic pre-commit sweep for the token, email, and `Authorization` patterns across all new artifacts; reviewer re-checks at review_fix. | L |
| RSK-4 | Purge endpoint unavailable to the token, or destructive beyond the page | L | M | Only the spike's own page is ever a purge candidate; if unavailable or risky, trash (soft-delete) is the accepted, recorded cleanup (AC-NFR2-1 records which mode happened). | L |
| RSK-5 | Rate limiting / throttling interferes with captures | L | L | ~20 sequential requests (NFR-5); back off and retry the individual call if a 429 appears, noting it in the manifest. | L |
| RSK-6 | Sandbox creds unavailable mid-session | M | L | Creds pattern is known-present (`tmp/marksync-demo/.env`); if access breaks, record the gap explicitly per the TDR-0001 precedent rather than proceeding on assumptions — never substitute mocked responses as evidence. | L |

## 12. ASSUMPTIONS

- The demo sandbox tenant/space (same as MS-0001 spike + live e2e regression) is available for the session; creds resolve from the established local pattern (`tmp/marksync-demo/.env`: base URL, user email, API token; Basic auth).
- The sandbox token permits page create/update/trash (and read, obviously) within the sandbox space for both v1 content and v2 pages endpoints; purge permission is **not** assumed (RSK-4).
- The MS-0001 evidence (P5-05/P5-06, and the metadata findings in `08-page-versions.md`) accurately records what was observed on 2026-07-03; it is used only as the delta baseline, never as a substitute for fresh capture.
- No MS-3 story file exists yet; ticket #90 + PDR-0002 are the scope authority (ticket statement).
- Atlassian's documented behavior of the v1 `status`/`version` parameters is a reasonable starting hypothesis — the spike exists precisely because it is unverified for this combination.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | Sandbox tenant availability + local creds pattern | Present per PM intake; no tracker blockers. |
| Depends on | Atlassian Confluence Cloud REST v1/v2 availability | Read endpoints + page-scoped writes (§8.4). |
| Blocks | MS3-E2-S1 — `resolve` patch-flow design lock | Consumes the TDR-0011 verdict; NO-GO triggers the snapshot-base-body redesign (PDR-0002 revisit trigger #3). |
| Blocks | MS3-E5-S2 — read-permission check design | Ticket-declared dependency on this spike's outcome. |
| Parallel | MS3-E0-S2 — in-process Mermaid spike | Independent deliverable; both precede E2/E4 design lock. |

## 14. OPEN QUESTIONS

None at time of writing — the PM clarify_scope pass resolved the ticket's open points: time-box (session-bounded, DEC-1), evidence home (change-folder `evidence/`, DEC-2), sandbox/cleanup posture (own disposable page, trash-after-capture, conditional own-page purge, DEC-3), and delivery shape (docs branch, zero `src/`, no version bump, DEC-4).

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Time-box = **session-bounded**; bound enforced by minimal sandbox footprint (one page, 3 version bumps, capture, trash). | Resolves PDR-0002's unresolved question ("Historical-version spike owner and time-box") and the ticket's "exact box TBD by owner"; the user's end-to-end delivery instruction authorizes in-session completion. PM-decided to unblock. | 2026-08-15 |
| DEC-2 | Evidence lives in the change folder's `evidence/` subdirectory (redacted captures + manifest), not in the inception workspace. | TDR-0001 C-2 pattern applied change-scoped: MS-0001's evidence was inception-workspace material because the spike was inception work; this spike belongs to a tracked change, so its evidence is reviewable in the change folder and linkable from TDR-0011. | 2026-08-15 |
| DEC-3 | Sandbox = existing demo sandbox; the disposable unit is a **page** (created under the sandbox space, trashed after capture), not a space; purge only of the spike's own page and only if feasible. | TDR-0001 C-1 analog: never a production space; a whole space is unnecessary for one fixture page; trash is the acceptable, recorded cleanup floor. | 2026-08-15 |
| DEC-4 | Delivery shape: `docs/` branch, zero `src/` changes, **no version bump**. | The deliverable is evidence + TDR + registry/doc updates; there is no shipped-code change to version or release (unlike GH-88/GH-104 patch precedents). | 2026-08-15 |
| DEC-5 | Verdict scale pre-committed: GO / GO-with-limitations / NO-GO, with NO-GO (and any material limitation) naming the fallback — snapshot base body in the committed lock / disposable cache at publish time. | Inherits PDR-0002 revisit trigger #3 verbatim; pre-committing the scale prevents verdict-shopping and gives MS3-E2-S1 a deterministic consumption contract. | 2026-08-15 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `evidence/` pack + manifest (this change folder) | New — redacted captures, frozen history once merged |
| `doc/decisions/TDR-0011-confluence-historical-version-api-spike.md` | New — verdict record |
| `doc/decisions/00-index.md` | Updated — one registry row |
| `doc/inception/integration-scenarios/08-page-versions.md`, PDR-0002 TO-CONFIRM row, `doc/overview/02-roadmap.md` | Flagged for phase-7 reconciliation (`@doc-syncer` decides scope: v1-form + deleted-behavior extension, resolution link, outcome note) |
| Source code (`src/**`), test suite, config | Unchanged — zero diffs by design (NFR-4) |

## 17. ACCEPTANCE CRITERIA

Ticket AC mapping: AC-F1-1/AC-F2-1/AC-F4-1/AC-F5-1 → ticket AC-1 (≥3 version states, both forms); AC-F3-1 → ticket AC-2; AC-F7-1 → ticket AC-3; AC-F6-1/AC-F7-2 → ticket AC-1/AC-4.

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** the sandbox page at ≥3 versions with distinct Storage bodies, **when** `GET /wiki/rest/api/content/{id}?status=historical&version={n}&expand=body.storage` is issued for a non-current N, **then** a redacted request/response capture exists and TDR-0011 records whether the version-N body is returned, with the evidence file linked. | F-1, API-1, NFR-3 |
| AC-F2-1 | **Given** the same fixture, **when** `GET /wiki/api/v2/pages/{id}?version={n}&body-format=storage` is re-issued (2026-08), **then** a fresh capture exists and TDR-0011 records agreement or delta vs the P5-06 baseline. | F-2, API-2, NFR-3 |
| AC-F3-1 | **Given** the V1-META, V2-VERSLIST, and V2-VERSN captures, **when** metadata availability is assessed, **then** each endpoint form has a documented available/not-available finding for author, timestamp, and version message. | F-3, API-1, API-3 |
| AC-F4-1 | **Given** the spike page has been trashed, **when** historical and current fetches are re-issued on both API-1 and API-2 forms, **then** post-delete behavior (statuses and bodies) is captured for both forms and documented in TDR-0011. | F-4, API-1, API-2, NFR-3 |
| AC-F5-1 | **Given** a version number that never existed (e.g., 99), **when** fetched on both forms, **then** the behavior (expected error status/contract) is captured for both. | F-5, API-1, API-2 |
| AC-F6-1 | **Given** all captures, **when** evidence is stored, **then** a manifest maps every matrix case → file → endpoint → result, and a redaction sweep finds 0 secrets across all artifacts. | F-6, NFR-1, NFR-3, NFR-6 |
| AC-F7-1 | **Given** the findings including any limitations, **when** TDR-0011 is authored, **then** the verdict is exactly one of GO / GO-with-limitations / NO-GO per the §5.1 scale, and NO-GO or any material limitation explicitly names the base-version-capture consequence (fallback: snapshot base body in lock/cache). | F-7, DEC-5 |
| AC-F7-2 | **Given** TDR-0011 is authored per repo decision-record conventions, **then** it links its evidence files and a TDR-0011 row exists in `doc/decisions/00-index.md`. | F-7, DM-2, DM-3 |
| AC-NFR2-1 | **Given** spike completion, **when** the sandbox state and record are inspected, **then** exactly one spike page was created/modified/cleaned up, and the cleanup mode (trash, or trash + own-page purge) is recorded. | NFR-2, DEC-3 |
| AC-NFR4-1 | **Given** the change diff, **when** `src/` is inspected, **then** zero source files changed and no version bump occurred. | NFR-4, DEC-4 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- Single docs-branch PR (`docs/GH-90/historical-version-api-spike`); evidence pack, TDR-0011, and the index row land together — the TDR never merges ahead of its evidence.
- No feature flag, no migration, no release activity (version impact none).
- Downstream consumers: MS3-E2-S1 design lock and MS3-E5-S2 read the TDR-0011 verdict; on NO-GO, the PDR-0002 revisit trigger #3 redesign (snapshot base body) is initiated in that design work, not here.
- Phase-7 reconciliation flags (§7.1) are handed to `@doc-syncer`; PDR-0002's TO-CONFIRM row receives its resolution link without rewriting frozen history.
- Communication: the TDR + registry row are the durable announcement; no broader comms for an internal spike.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no persisted product state is touched. The sandbox fixture page is disposable by design and cleaned up (trash; purge if feasible).

## 20. PRIVACY / COMPLIANCE REVIEW

- Evidence captures originate from the maintainer's own sandbox tenant — no third-party personal data is in scope.
- Redaction contract (NFR-1, TDR-0001 C-2 inheritance): API token, user email, and Authorization header values never appear in any committed artifact. Author identifiers (e.g., `accountId`/`version.by`) that the metadata cases must demonstrate are masked with **stable placeholders** (e.g., `«account-1»`) that preserve presence, shape, and distinctness — the availability finding (AC-F3-1) does not require raw values. Account emails, if present in a response, are redacted outright.
- No other personal data is expected in page bodies (fixture content is synthetic version markers).

## 21. SECURITY REVIEW HIGHLIGHTS

- **Credential handling**: creds load from the established local pattern at runtime only; they are never echoed into captures, logs, or the TDR (RSK-3, NFR-1).
- **Blast-radius control**: all writes are page-scoped to the spike's own disposable page inside the sandbox space (NFR-2, DEC-3); purge, if used, targets only that page (RSK-4).
- **Evidence hygiene**: every artifact is redacted before commit and swept for token/email/Authorization patterns (NFR-1); reviewers re-verify at review_fix.
- **No shipped-surface change**: `security_impact: low` reflects the handling discipline above, not a product change — there is none (NG-1).

## 22. MAINTENANCE & OPERATIONS IMPACT

- Near-zero ongoing load: the evidence pack and TDR are frozen history post-merge; the manifest makes any future re-verification directly comparable.
- TDR-0011 carries revisit triggers (e.g., Atlassian deprecating the v1 `status=historical` form or the v2 `version` parameter) mirroring the TDR-0001/TDR-0010 pattern.
- `08-page-versions.md` (current-truth scenario ref) is the living remainder of this spike — extended at phase 7 with the v1 form, deleted-page behavior, and fresh-evidence pointers, so future work reads the scenario doc, not the frozen captures, first.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Base version | The Confluence page version that originated from the last marksync publish, recorded in the committed lock (ADR-0006); the `resolve` diff's "base" leg. |
| v1 / v2 (Confluence REST) | Atlassian Cloud API generations: `/wiki/rest/api/content/...` (v1) and `/wiki/api/v2/pages/...` (v2); different parameter idioms (`status`/`expand` vs `version`/`body-format`). |
| `status=historical` | v1 content-fetch parameter combination presumed to return a page as of a specific `version={n}`. |
| Trash / purge | Soft-delete (page moves to trash, restorable) vs hard-delete (permanent); the spike's cleanup floor is trash. |
| TO-CONFIRM | PDR-0002 evidence-table label for a claim that must be verified before dependent design locks. |
| Evidence manifest | The index mapping each verification case → capture file → endpoint → result, stored with the captures. |
| TDR | Technology Decision Record (`doc/decisions/`, `decision_type: tdr`); TDR-0011 is this spike's verdict record. |
| P5-05 / P5-06 | MS-0001 spike evidence files (2026-07-03) proving the v2 versions-list and version-body fetch forms — the delta baseline for GH-90. |
| Committed lock | The versioned, Git-committed state file recording page identity, page version, and hashes (ADR-0006). |

## 24. APPENDICES

### A. Test-tier applicability (honesty note)

Per [.ai/rules/testing-strategy.md](../../../../.ai/rules/testing-strategy.md): this change modifies no `src/` code, so CI-gated tiers (unit, integration, golden, adversarial, Mermaid-DOM, BDD, e2e-mock) are **N/A** — nothing new enters those suites. The spike's "tests" **are** the one-shot live verifications against the real sandbox tenant: kin to the E2E (live-sandbox) tier in spirit (real API, real tenant, secrets kept out of artifacts) but explicitly **not** wired into CI and not repeatable as a gate. Their durable form is the evidence pack (DM-1) + TDR-0011 (DM-2), per TDR-0001 C-2/C-3. Mocked responses are never a substitute for these captures (RSK-6).

### B. Ticket AC → spec AC traceability

| Ticket AC | Spec ACs |
|-----------|----------|
| AC-1 — evidence for ≥3 version states (historical N, current, deleted/edge), both forms | AC-F1-1, AC-F2-1, AC-F4-1, AC-F5-1 (current baseline carried by the V1-CURR/V2 captures) |
| AC-2 — version metadata availability documented | AC-F3-1 |
| AC-3 — limitations + verdict with consequences (fallback: snapshot base body in lock/cache) | AC-F7-1 |
| AC-4 — TDR created with evidence links | AC-F6-1, AC-F7-2 |

### C. References

- [PDR-0002 — MS-0003 re-scope: Company Adoption MVP](../../../decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md) — TO-CONFIRM row, revisit trigger #3, Decision §2 (resolve patch flow / base-version diff).
- [TDR-0001 — Confluence API validation spike](../../../decisions/TDR-0001-confluence-api-validation-spike.md) — spike precedent: C-1 disposable sandbox, C-2 redacted evidence, C-3 durable records.
- [TDR-0010 — credential validation v1](../../../decisions/TDR-0010-credential-validation-v1-current-user.md) — current TDR template/conventions; also the in-tenant API-drift precedent motivating fresh capture.
- [08-page-versions.md](../../../inception/integration-scenarios/08-page-versions.md) — prior live evidence (P5-05, P5-06), the delta baseline.
- [02-roadmap.md](../../../overview/02-roadmap.md) — MS-0003 epic E2 and the spike dependency ("if disproved, base-version capture is redesigned").
- [security-baseline.md](../../../guides/security-baseline.md) — redaction/secret posture backing NFR-1.
- GitHub issue #90 ([MS3-E0-S1], `priority:critical`, labels `MS-0003`/`spike`) — scope authority together with PDR-0002.
- `chg-GH-90-pm-notes.yaml` — PM decisions (DEC-1..DEC-4 provenance) and doc-risk flags.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | spec-writer (GH-90) | Initial specification — spike-scoped: v1+v2 historical-fetch verification matrix, evidence & redaction contract, TDR-0011 verdict requirements, pre-committed verdict scale and fallback. |

---

## AUTHORING GUIDELINES

- Authored from the GH-90 planning-session context (PM summary + `chg-GH-90-pm-notes.yaml`) and verified against: ticket #90 (scope authority with PDR-0002), PDR-0002 (TO-CONFIRM row, revisit trigger #3, Decision §2), TDR-0001 (C-1/C-2/C-3 spike constraints), TDR-0010 (current decision-record conventions), `08-page-versions.md` (P5-05/P5-06 prior evidence), and the roadmap's MS-0003 dependency section.
- Deliberately scoped as the **delta** beyond the proven MS-0001 v2 baseline — the spec does not re-litigate what P5-05/P5-06 already prove; it enumerates the five delta items (v1 form, deleted behavior, metadata documentation, fresh re-validation, TDR verdict).
- Spike-tailored per the template's spirit: capabilities are verification cases (§5.1 matrix), not feature restatements; N/A sections are one line; no implementation tasks or step-by-step code instructions (those would belong to the plan, and none are needed for a docs-only spike).
- Test-tier honesty (Appendix A): no CI tier applies to a zero-`src/` change; the live verifications are the evidence itself, explicitly not a CI gate — stated rather than papered over with fabricated test coverage.
- The pre-committed verdict scale (DEC-5) and the PDR-0002 fallback wording are quoted faithfully so the downstream MS3-E2-S1 design consumes a deterministic contract.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-90)
- [x] `owners` has at least one entry (`[Juliusz Ćwiąkalski]`)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..F-7, API-1..API-4, DM-1..DM-3, NFR-1..NFR-6, RSK-1..RSK-6, DEC-1..DEC-5, AC-F1-1..AC-NFR4-1)
- [x] Acceptance criteria reference at least one F-/API-/DM-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no source-code paths, no step-by-step tasks; documented artifact destinations are the deliverables themselves)
- [x] No content duplicated from linked docs (PDR-0002/TDR-0001/prior evidence cited, not restated)
- [x] Front matter validates per front-matter_rules
