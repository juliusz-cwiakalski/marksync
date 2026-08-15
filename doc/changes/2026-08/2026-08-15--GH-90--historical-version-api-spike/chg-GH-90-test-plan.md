---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/juliuszcwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-90-test-plan
status: Proposed
created: 2026-08-15
last_updated: 2026-08-15
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0003, spike, priority:critical]
version_impact: none
summary: "Live-API spike test plan: verify Confluence Cloud historical-version body fetch (v1 status=historical + v2 forms) against the demo sandbox via the spec §5.1 10-case matrix, with redacted evidence pack, redaction sweep, and a GO / GO-with-limitations / NO-GO verdict recorded as TDR-0011 — zero src/ changes, no CI tier applies"
links:
  change_spec: ./chg-GH-90-spec.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - Spike: Confluence historical version API — verify fetch-body-at-version-N (v1 + v2), record TDR-0011

## 1. Scope and Objectives

This plan operationalizes the GH-90 spike (MS3-E0-S1). The "tests" **are** scripted one-shot live-API verifications against the existing demo sandbox tenant plus artifact checks on what they produce: every case in the spec §5.1 matrix is executed as an ordered curl-driven procedure, captured raw to git-ignored scratch, redacted into this change folder's `evidence/` pack, swept for secrets, and assessed into a pre-committed verdict (GO / GO-with-limitations / NO-GO, spec DEC-5) recorded as TDR-0011.

Objectives, in execution order:

1. **Prove or refute the TO-CONFIRM assumption** — Confluence Cloud can fetch a page's Storage body at historical version N — on the v1 `status=historical&version={n}` form (never exercised) and fresh-re-validated v2 forms (P5-05/P5-06 baseline, 2026-07-03).
2. **Verify deleted/trashed-page fetch behavior** (pre/post trash, both forms) and **document version-metadata availability** (author, timestamp, message) per endpoint form.
3. **Contain the spike** — one disposable sandbox page, ≤ ~20 requests, trash as the cleanup floor — and leave **zero secrets** in any committed artifact (NFR-1) and **zero `src/` diffs** (NFR-4).

There is no shipped code (spec NG-1); nothing enters any CI test suite. This plan is executed literally, once, during delivery phase 6.

### 1.1 In Scope

- Fixture provisioning: one disposable page in the sandbox space, bumped to ≥3 versions with distinct synthetic Storage bodies and distinct version messages where supported (API-4)
- Execution of all 10 §5.1 matrix cases (V1-HIST, V1-CURR, V1-META, V1-TRASHED, V1-NOVER, V2-HIST, V2-VERSLIST, V2-VERSN, V2-TRASHED, V2-NOVER) with redacted request-line + status + body captures (API-1..API-3, NFR-3)
- Redaction sweep over every new artifact + manifest indexing every case (AC-F6-1, NFR-1, NFR-6)
- Verdict determination and TDR-0011 authoring + `00-index.md` registration (AC-F7-1, AC-F7-2)
- Cleanup-mode recording and change-diff audit (AC-NFR2-1, AC-NFR4-1)

### 1.2 Out of Scope & Known Gaps

- Any new automated test at any CI tier — nothing new enters the suites (spec Appendix A; decision D-TST-1, §7.1)
- Contract fixtures / mock-server wiring derived from these captures — deferred to the MS3-E2 implementation change (spec §7.3)
- Mutating any sandbox or production content other than the spike's own page (spec NG-5); purge-endpoint permission probing beyond the spike's own page (spec §7.3)
- Editing frozen history — prior decision records and MS-0001 evidence are cited, never modified (spec NG-6)

## 2. References

- Change specification: `chg-GH-90-spec.md` — authoritative for the §5.1 case matrix, §8.4 API forms, §9 NFRs, §17 ACs, §21 security, Appendix A tier applicability
- PM notes: `chg-GH-90-pm-notes.yaml` — DEC-1..DEC-4 provenance, evidence-naming pattern
- Testing strategy: `.ai/rules/testing-strategy.md` — tier definitions; tier-mapping conclusion in §4 below
- TDR-0001 (`doc/decisions/TDR-0001-confluence-api-validation-spike.md`) — spike evidence pattern this plan inherits: C-1 disposable sandbox, C-2 redacted captures, C-3 durable records
- PDR-0002 — TO-CONFIRM row, revisit trigger #3 (NO-GO fallback wording), Decision §2 (`resolve` base-version diff)
- `doc/inception/integration-scenarios/08-page-versions.md` — P5-05/P5-06 prior evidence (delta baseline)
- `doc/guides/security-baseline.md` — secret/redaction posture backing NFR-1
- No implementation plan exists by design — docs-only spike (spec §25); this plan carries the execution procedure

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | v1 `status=historical&version={n}&expand=body.storage` captured for non-current N; TDR-0011 records whether the version-N body returns | TC-HIST-002, TC-HIST-013 | Covered |
| AC-F2-1 | v2 `pages/{id}?version={n}&body-format=storage` re-validated fresh (2026-08); TDR-0011 records agreement/delta vs P5-06 | TC-HIST-006, TC-HIST-013 | Covered |
| AC-F3-1 | Metadata availability (author, timestamp, message) documented per endpoint form from V1-META, V2-VERSLIST, V2-VERSN captures | TC-HIST-004, TC-HIST-007, TC-HIST-008, TC-HIST-013 | Covered |
| AC-F4-1 | Post-trash historical + current fetch behavior captured on both API-1 and API-2 forms, documented in TDR-0011 | TC-HIST-010, TC-HIST-013 | Covered |
| AC-F5-1 | Nonexistent-version (99) behavior captured on both forms | TC-HIST-005, TC-HIST-009 | Covered |
| AC-F6-1 | Manifest maps every case → file → endpoint → result; redaction sweep finds 0 secrets | TC-HIST-012 | Covered |
| AC-F7-1 | TDR-0011 verdict is exactly one of GO / GO-with-limitations / NO-GO per §5.1 scale; NO-GO or material limitation names the fallback (snapshot base body in lock/cache) | TC-HIST-013 | Covered |
| AC-F7-2 | TDR-0011 links its evidence files; row exists in `doc/decisions/00-index.md` | TC-HIST-013 | Covered |
| AC-NFR2-1 | Exactly one spike page created/modified/cleaned; cleanup mode (trash, or trash + own-page purge) recorded | TC-HIST-001, TC-HIST-011 | Covered |
| AC-NFR4-1 | Zero `src/` file changes in the change diff; no version bump | TC-HIST-014 | Covered |

Ticket-AC ↔ spec-AC mapping is spec Appendix B; not restated here.

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No MarkSync-owned API or event surface (spec §8.1/§8.2: N/A). External endpoints under verification (spec §8.4) and documentation artifacts (spec §8.3):

| Interface ID | Description | TC ID(s) | Status |
|--------------|-------------|----------|--------|
| API-1 | v1 content form: `GET /wiki/rest/api/content/{id}` + `status`/`version`/`expand` | TC-HIST-002, TC-HIST-003, TC-HIST-004, TC-HIST-005, TC-HIST-010 | Covered |
| API-2 | v2 pages form: `GET /wiki/api/v2/pages/{id}?version={n}&body-format=storage` | TC-HIST-006, TC-HIST-009, TC-HIST-010 | Covered |
| API-3 | v2 versions forms: `GET …/versions` (list) and `GET …/versions/{n}` | TC-HIST-007, TC-HIST-008 | Covered |
| API-4 | Page create/update + trash; optional own-page purge | TC-HIST-001, TC-HIST-010, TC-HIST-011 | Covered |
| DM-1 | Evidence pack + manifest in this change folder's `evidence/` | TC-HIST-002..TC-HIST-010, TC-HIST-012 | Covered |
| DM-2 | TDR-0011 decision record | TC-HIST-013 | Covered |
| DM-3 | `doc/decisions/00-index.md` registry row | TC-HIST-013 | Covered |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status |
|--------|-------------|----------|--------|
| NFR-1 | 0 secrets (token / email / Authorization value) in any committed artifact; accountIds masked with stable placeholders | TC-HIST-012 | Covered |
| NFR-2 | Writes to exactly 1 created page + its own bumps + its own trash (purge optional); 0 other mutations | TC-HIST-001, TC-HIST-011 | Covered |
| NFR-3 | 100% of §5.1 matrix cases captured (request line + status + body), manifest-indexed | TC-HIST-002..TC-HIST-010, TC-HIST-012 | Covered |
| NFR-4 | 0 `src/` file changes in the change diff | TC-HIST-014 | Covered |
| NFR-5 | ≤ ~20 API requests total, sequential | TC-HIST-001 (budget accounting, §6.2) | Covered |
| NFR-6 | Each capture valid, verbatim-reviewable, named per §5.1 pattern | TC-HIST-012 | Covered |

## 4. Test Types and Layers

Tier applicability per `.ai/rules/testing-strategy.md`, stated honestly per spec Appendix A: this change modifies no `src/` code, so **no CI-gated tier receives anything new**. The spike's verifications are one-shot live-API procedures — **kin to the E2E (live-sandbox) tier in spirit** (real API, real tenant, secrets kept out of artifacts) but explicitly **not wired into CI and not repeatable as a gate**. Their durable form is the evidence pack (DM-1) + TDR-0011 (DM-2).

| Tier (strategy) | Applies? | One-line reason |
|------|----------|-----------------|
| Unit | No | No domain logic touched; nothing new enters `tests/unit/` |
| Integration | No | No adapter code touched; nothing new enters `tests/integration/` |
| Golden fixture | No | Renderer output unchanged; no new snapshots |
| Golden adversarial | No | Corpus/classification unchanged |
| Mermaid-DOM | No | Renderer unchanged |
| Gherkin / BDD | No | Lifecycle invariants unaffected — zero code delta |
| E2E (mock) | No | Full-pipeline mock suite unchanged |
| E2E (live-sandbox) | **Kin, not member** | The spike's captures share the tier's spirit (real API, secrets-free artifacts) but run once, operator-driven, session-bounded — never as a CI gate |
| **Live-API verification (this plan)** | **Yes — the test itself** | 14 TC-HIST scenarios: scripted curl verifications + artifact checks, executed once in delivery phase 6 |

Note: `bun run check` / CI still execute at quality gates (phase 9) as an unchanged regression net — trivially green on a zero-`src/` diff and carrying **no AC evidence** for this change.

Verification methods: scripted live HTTP captures (curl; optional throwaway bun script), grep-based redaction sweep, git diff audit, document artifact checks (TDR/index/manifest). No mocks anywhere — mocked responses are never a substitute for these captures (spec RSK-6).

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-HIST-001 | Fixture provisioning: one disposable page at ≥3 distinct-body versions | Happy Path | Manual | High | AC-NFR2-1 (setup half) |
| TC-HIST-002 | V1-HIST: v1 historical fetch at non-current version N | Happy Path | Manual | High | AC-F1-1 |
| TC-HIST-003 | V1-CURR: v1 current-state baseline fetch | Happy Path | Manual | High | AC-F1-1 (baseline), NFR-3 |
| TC-HIST-004 | V1-META: v1 metadata expand (version.by / when / message) | Happy Path | Manual | High | AC-F3-1 |
| TC-HIST-005 | V1-NOVER: v1 fetch of nonexistent version 99 | Negative | Manual | Medium | AC-F5-1 |
| TC-HIST-006 | V2-HIST: v2 historical fetch, fresh re-validation vs P5-06 | Happy Path | Manual | High | AC-F2-1 |
| TC-HIST-007 | V2-VERSLIST: v2 versions list with inline bodies, newest-first | Happy Path | Manual | High | AC-F2-1, AC-F3-1 |
| TC-HIST-008 | V2-VERSN: v2 single-version metadata (authorId / createdAt / message) | Happy Path | Manual | Medium | AC-F3-1 |
| TC-HIST-009 | V2-NOVER: v2 fetch of nonexistent version 99 | Negative | Manual | Medium | AC-F5-1 |
| TC-HIST-010 | Trash phase: post-trash historical + current fetches, both forms | Corner Case | Manual | High | AC-F4-1 |
| TC-HIST-011 | Cleanup and cleanup-mode recording (trash floor, optional own-page purge) | Happy Path | Manual | High | AC-NFR2-1 |
| TC-HIST-012 | Redaction sweep + evidence manifest completeness | Negative | Semi-automated | High | AC-F6-1, NFR-1, NFR-3, NFR-6 |
| TC-HIST-013 | Verdict determination, TDR-0011 authoring, index registration | Happy Path | Manual | High | AC-F7-1, AC-F7-2 |
| TC-HIST-014 | Change-diff audit: zero src/ diffs, no version bump | Negative | Semi-automated | High | AC-NFR4-1 |

### 5.2 Scenario Details

#### TC-HIST-001 - Fixture provisioning: one disposable page at ≥3 distinct-body versions

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: API-4, NFR-2, NFR-5, G-5, DEC-3
**Test Type(s)**: Manual
**Automation Level**: Manual (curl; scripted helper allowed per §7 conventions)
**Target Layer / Location**: Live sandbox tenant — sandbox space resolved from `tmp/marksync-demo/marksync.yml` (`spaceKey`, `parentPageId`)
**Tags**: @api, @sandbox

**Preconditions**:

- Creds sourced from `tmp/marksync-demo/.env` (git-ignored): `MARKSYNC_CONFLUENCE_BASE_URL`, `MARKSYNC_USER_EMAIL`, `MARKSYNC_API_TOKEN` — Basic auth, header value held only in a shell variable, never written to any file
- Scratch dir `tmp/gh-90-spike/` created (git-ignored via `.gitignore` `tmp/`)

**Steps**:

1. Create ONE page (v1) via `POST /wiki/rest/api/content` — type `page`, unique title `GH-90 spike fixture <YYYYMMDD-HHMM>`, sandbox `space.key` from `marksync.yml`, synthetic Storage body `<p>GH-90 spike fixture — body v1 (synthetic)</p>`, version message on create only if the form supports it
2. Record the returned page `id` and initial `version.number` (expect 1) into the scratch notes
3. Update to v2 via `PUT /wiki/rest/api/content/{id}` — body `<p>GH-90 spike fixture — body v2 (synthetic)</p>`, `version: {number: 2, message: "GH-90 spike bump v2"}`
4. Update to v3 the same way — body `…body v3 (synthetic)`, `version: {number: 3, message: "GH-90 spike bump v3"}`
5. Confirm final state: page id + latest version = 3, three distinct bodies, distinct messages where supported

**Expected Outcome**:

- Exactly one page exists, at version 3, with three distinguishable Storage bodies and version messages — the fixture every capture case reads
- 3 write requests consumed (NFR-5 budget, §6.2); no other content touched (NFR-2)

---

#### TC-HIST-002 - V1-HIST: v1 historical fetch at non-current version N

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-1, API-1, NFR-3
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: Live sandbox — API-1 form; evidence `evidence/V1-HIST-v2.json`
**Tags**: @api

**Preconditions**:

- TC-HIST-001 complete (fixture at v3, page id known)

**Steps**:

1. Issue `GET /wiki/rest/api/content/{id}?status=historical&version=2&expand=body.storage` (non-current N = 2)
2. Save raw status + body immediately to scratch (`V1-HIST-v2.raw`)
3. Assess: does `body.storage.value` equal the exact v2 fixture body (and differ from v3)? Is `version.number` 2? Note the finding
4. Derive the redacted evidence file `evidence/V1-HIST-v2.json` (request line + status + body; accountId values masked per §6.3)

**Expected Outcome**:

- A redacted capture exists (whatever the API returned — success or error is a finding, not a failure of this test)
- The manifest records whether the version-2 body was returned; this feeds the verdict (TC-HIST-013). If the parameter is ignored or the semantics differ, that is the RSK-2 finding — captured, not patched around

---

#### TC-HIST-003 - V1-CURR: v1 current-state baseline fetch

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F1-1 (baseline), API-1, NFR-3
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: Live sandbox — API-1 form; evidence `evidence/V1-CURR.json`
**Tags**: @api

**Preconditions**:

- TC-HIST-001 complete

**Steps**:

1. Issue `GET /wiki/rest/api/content/{id}?status=current&expand=body.storage`
2. Save raw immediately; derive `evidence/V1-CURR.json`
3. Assess: body equals the v3 fixture body; `version.number` = 3

**Expected Outcome**:

- Current-state baseline capture exists — the comparison anchor proving TC-HIST-002's version-2 body is genuinely non-current (and not a cached current body)

---

#### TC-HIST-004 - V1-META: v1 metadata expand (version.by / when / message)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-3, AC-F3-1, API-1
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: Live sandbox — API-1 form; evidence `evidence/V1-META-v2.json`
**Tags**: @api

**Preconditions**:

- TC-HIST-001 complete

**Steps**:

1. Issue `GET /wiki/rest/api/content/{id}?status=historical&version=2&expand=version` (a combined `expand=body.storage,version` may substitute/add if it clarifies — count stays within budget)
2. Save raw immediately; derive `evidence/V1-META-v2.json` — `version.by` (author) masked with a stable placeholder
3. Assess and note per-field availability: `version.by`, `version.when`, `version.message` — present or absent

**Expected Outcome**:

- Capture exists; the manifest records author / timestamp / message availability for the v1 form (feeds AC-F3-1's per-endpoint finding table, written up in TC-HIST-013)

---

#### TC-HIST-005 - V1-NOVER: v1 fetch of nonexistent version 99

**Scenario Type**: Negative
**Impact Level**: Minor
**Priority**: Medium
**Related IDs**: F-5, AC-F5-1, API-1
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: Live sandbox — API-1 form; evidence `evidence/V1-NOVER.json`
**Tags**: @api

**Preconditions**:

- TC-HIST-001 complete

**Steps**:

1. Issue `GET /wiki/rest/api/content/{id}?status=historical&version=99&expand=body.storage`
2. Save raw immediately (status + body — error bodies are the payload here); derive `evidence/V1-NOVER.json`
3. Record the exact status code and error contract

**Expected Outcome**:

- Capture exists documenting the error contract (expected 404-class, not assumed — whatever returns is the finding)

---

#### TC-HIST-006 - V2-HIST: v2 historical fetch, fresh re-validation vs P5-06

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-1, API-2, NFR-3, RSK-1
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: Live sandbox — API-2 form; evidence `evidence/V2-HIST-v2.json`
**Tags**: @api

**Preconditions**:

- TC-HIST-001 complete

**Steps**:

1. Issue `GET /wiki/api/v2/pages/{id}?version=2&body-format=storage`
2. Save raw immediately; derive `evidence/V2-HIST-v2.json`
3. Assess: version-2 body returned exactly? Compare shape and semantics against the P5-06 baseline (`08-page-versions.md`) — agreement or delta noted for TDR-0011

**Expected Outcome**:

- Fresh 2026-08 capture exists; agreement/delta vs P5-06 explicitly recorded (drift is a finding per RSK-1, not a failure)

---

#### TC-HIST-007 - V2-VERSLIST: v2 versions list with inline bodies, newest-first

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, F-3, AC-F2-1, AC-F3-1, API-3
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: Live sandbox — API-3 list form; evidence `evidence/V2-VERSLIST.json`
**Tags**: @api

**Preconditions**:

- TC-HIST-001 complete

**Steps**:

1. Issue `GET /wiki/api/v2/pages/{id}/versions?body-format=storage`
2. Save raw immediately; derive `evidence/V2-VERSLIST.json` (mask author identifiers)
3. Assess: are all 3 versions present with inline Storage bodies, newest-first? Which metadata fields (author / createdAt / message) accompany each entry?

**Expected Outcome**:

- Capture exists; manifest records body-inline presence, ordering, and per-version metadata availability (re-validating P5-05 semantics + feeding AC-F3-1)

---

#### TC-HIST-008 - V2-VERSN: v2 single-version metadata

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, AC-F3-1, API-3
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: Live sandbox — API-3 single form; evidence `evidence/V2-VERSN-2.json`
**Tags**: @api

**Preconditions**:

- TC-HIST-001 complete

**Steps**:

1. Issue `GET /wiki/api/v2/pages/{id}/versions/2`
2. Save raw immediately; derive `evidence/V2-VERSN-2.json` (`authorId` masked)
3. Assess: `authorId`, `createdAt`, `message` — present/absent; does the bump message from TC-HIST-001 survive?

**Expected Outcome**:

- Capture exists; per-field metadata availability recorded for the single-version form

---

#### TC-HIST-009 - V2-NOVER: v2 fetch of nonexistent version 99

**Scenario Type**: Negative
**Impact Level**: Minor
**Priority**: Medium
**Related IDs**: F-5, AC-F5-1, API-2
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: Live sandbox — API-2 form; evidence `evidence/V2-NOVER.json`
**Tags**: @api

**Preconditions**:

- TC-HIST-001 complete

**Steps**:

1. Issue `GET /wiki/api/v2/pages/{id}?version=99&body-format=storage`
2. Save raw immediately; derive `evidence/V2-NOVER.json`
3. Record the exact status code and error contract

**Expected Outcome**:

- Capture exists documenting the v2 error contract; comparable with TC-HIST-005's v1 contract

---

#### TC-HIST-010 - Trash phase: post-trash historical + current fetches, both forms

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, API-1, API-2, API-4, NFR-3
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: Live sandbox; evidence `evidence/V1-TRASHED-hist.json`, `V1-TRASHED-curr.json`, `V2-TRASHED-hist.json`, `V2-TRASHED-curr.json`
**Tags**: @api

**Preconditions**:

- All pre-trash captures (TC-HIST-002..009) are saved raw — this step is irreversible for the fixture's live state

**Steps**:

1. Trash the page: `DELETE /wiki/rest/api/content/{id}` (soft-delete)
2. Re-issue the v1 historical fetch (`status=historical&version=2&expand=body.storage`) → `V1-TRASHED-hist`
3. Re-issue the v1 current fetch (`status=current&expand=body.storage`) → `V1-TRASHED-curr`
4. Optionally probe `status=trashed` on the v1 form if supported → note in manifest either way
5. Re-issue the v2 historical fetch (`?version=2&body-format=storage`) → `V2-TRASHED-hist`
6. Re-issue the v2 current fetch (`GET /wiki/api/v2/pages/{id}`) → `V2-TRASHED-curr`
7. Save each raw immediately; derive the four redacted evidence files
8. Assess: statuses + bodies per form — does historical fetch still return the version-N body post-trash? What do the current fetches return?

**Expected Outcome**:

- Four post-trash captures exist (plus optional trashed-status probe); post-delete behavior per form is documented for TDR-0011 — this is the `resolve`-edge evidence (AC-F4-1)

---

#### TC-HIST-011 - Cleanup and cleanup-mode recording

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: NFR-2, AC-NFR2-1, API-4, DEC-3, RSK-4
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: Live sandbox; recorded in the evidence manifest
**Tags**: @sandbox

**Preconditions**:

- TC-HIST-010 complete (page already trashed)

**Steps**:

1. Decide purge: perform it **only** if the purge endpoint form is available to this token and strictly page-scoped to the spike's own page (e.g., the v1 delete-with-`status=trashed` form). If availability or scope is uncertain — stop at trash (RSK-4)
2. Record the cleanup mode in the manifest: `trash` or `trash + own-page purge`
3. Confirm containment: the only content created/modified/deleted this session is the spike's own page (verify by listing recent content in the sandbox space if cheap, else by construction — every request this session is logged in the manifest's request ledger)

**Expected Outcome**:

- Sandbox contains no live spike page; the manifest names the cleanup mode explicitly (AC-NFR2-1); 0 mutations of any other content (NFR-2)

---

#### TC-HIST-012 - Redaction sweep + evidence manifest completeness

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, AC-F6-1, DM-1, NFR-1, NFR-3, NFR-6, RSK-3
**Test Type(s)**: Manual
**Automation Level**: Semi-automated (grep sweep — §7 commands)
**Target Layer / Location**: All new artifacts: `evidence/**`, `evidence/README.md` (manifest), TDR-0011, `00-index.md` row, this change folder's docs
**Tags**: @security

**Preconditions**:

- All evidence files derived and redacted (accountIds → stable placeholders like `«account-1»`, distinctness preserved; any emails redacted outright)

**Steps**:

1. Sweep 1 — API token: `rg -F "$MARKSYNC_API_TOKEN"` over the change folder + `doc/decisions/TDR-0011*` → **expect 0 matches**
2. Sweep 2 — email: `rg -F "$MARKSYNC_USER_EMAIL"` over the same paths → **expect 0 matches**
3. Sweep 3 — header leakage: `rg -n 'Authorization|Basic [A-Za-z0-9+/=]{8,}'` over `evidence/` + TDR-0011 → **expect 0 matches** (captures are request-line-only by construction; this is belt-and-braces)
4. Sweep 4 — unmasked accountIds: `rg -n '[0-9a-f]{32}'` over `evidence/` → **expect 0 matches** (32-hex accountIds masked; numeric page/space IDs are not a redaction target)
5. Manifest completeness: `evidence/README.md` maps **every** §5.1 case → file → endpoint form → HTTP status → one-line result; plus the request ledger (total count, NFR-5) and the cleanup mode (from TC-HIST-011); any 429/backoff noted (RSK-5)
6. Every capture file is named per the §5.1 pattern and opens as valid JSON/verbatim HTTP (NFR-6)

**Expected Outcome**:

- 0 secrets across all committed artifacts (NFR-1); 10/10 matrix cases manifest-indexed (NFR-3); the sweep commands and their clean outputs are the evidence AC-F6-1 cites. Re-verified by the reviewer at review_fix (spec §21)

---

#### TC-HIST-013 - Verdict determination, TDR-0011 authoring, index registration

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-7, AC-F7-1, AC-F7-2, DM-2, DM-3, DEC-5
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: `doc/decisions/TDR-0011-confluence-historical-version-api-spike.md` + `doc/decisions/00-index.md`
**Tags**: @docs

**Preconditions**:

- All captures + manifest complete and swept clean (TC-HIST-012)

**Steps**:

1. Determine the verdict from the captured findings, exactly per the spec §5.1 scale (DEC-5):
   - **GO** — at least one API form returns the exact version-N Storage body for a current (non-deleted) page, freshly verified; no material caveats
   - **GO-with-limitations** — base case works but with material caveats (e.g., only one form works; trashed-page semantics constrain a `resolve` edge; metadata gaps) — **each limitation named with its design consequence**
   - **NO-GO** — no form returns the version-N body; the PDR-0002 revisit trigger #3 fallback applies: **snapshot the base body in the committed lock / disposable cache at publish time** instead of fetching at resolve time
2. Author TDR-0011 per repo decision-record conventions (TDR-0010 structure): verdict, per-form findings (v1 / v2 / trashed / metadata tables), limitations, base-version-capture consequence (fallback named on NO-GO **or** any material limitation), links to every evidence file, revisit triggers (e.g., Atlassian deprecating the v1 `status=historical` form or the v2 `version` parameter)
3. Add the TDR-0011 row to `doc/decisions/00-index.md`
4. Include the agreement/delta statement vs P5-05/P5-06 (from TC-HIST-006/007 assessments)

**Expected Outcome**:

- TDR-0011 exists with exactly one verdict per the scale, every limitation carrying its design consequence, and evidence links that resolve; the registry row exists (AC-F7-1, AC-F7-2) — the artifact MS3-E2-S1 consumes to lock (or redesign per the fallback)

---

#### TC-HIST-014 - Change-diff audit: zero src/ diffs, no version bump

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: NFR-4, AC-NFR4-1, DEC-4, NG-1
**Test Type(s)**: Manual
**Automation Level**: Semi-automated (git diff inspection — §7 commands)
**Target Layer / Location**: Change branch diff vs `main`
**Tags**: @docs

**Preconditions**:

- All artifacts staged on `docs/GH-90/historical-version-api-spike`

**Steps**:

1. `git diff main --stat` — assert the changed-file set is exactly: this change folder's docs + `evidence/**` + `doc/decisions/TDR-0011-*` + the `00-index.md` row
2. Assert **zero** files under `src/` or `tests/` in the diff (NFR-4)
3. Assert `package.json` version field is untouched — no version bump (DEC-4)
4. Assert no file under `tmp/` is staged (scratch never commits)

**Expected Outcome**:

- Surgical docs-only diff; the spike shipped knowledge, not code — the AC-NFR4-1 evidence

## 6. Environments and Test Data

### 6.1 Environments

- **Live sandbox tenant** (the existing demo tenant, same as the MS-0001 spike and live e2e regression): resolved at runtime from `tmp/marksync-demo/.env` (git-ignored) — `MARKSYNC_CONFLUENCE_BASE_URL`, `MARKSYNC_USER_EMAIL`, `MARKSYNC_API_TOKEN`; Basic auth (`Authorization: Basic base64(email:token)`), computed in-shell, never written to any file
- **Sandbox space**: `spaceKey` / `parentPageId` read from `tmp/marksync-demo/marksync.yml` at runtime — not hardcoded into any committed artifact
- **Operator machine**: repo worktree on branch `docs/GH-90/historical-version-api-spike`, `curl` available (a throwaway bun script is an acceptable alternative — §7 conventions); outbound network to the tenant
- **Scratch area**: `tmp/gh-90-spike/` — git-ignored (`.gitignore` line 49, `tmp/`); holds raw captures and any throwaway script; **never staged**

### 6.2 Test Data and Request Budget (NFR-5)

Fixture: ONE synthetic page — `GH-90 spike fixture <timestamp>` — bodies `<p>GH-90 spike fixture — body v1|v2|v3 (synthetic)</p>`, version messages `GH-90 spike bump v2|v3` where supported. No real content, no third-party data (spec §20).

| Phase | Requests |
|-------|----------|
| Writes: create v1 + update v2 + update v3 | 3 |
| Pre-trash captures (V1-HIST, V1-CURR, V1-META, V1-NOVER, V2-HIST, V2-VERSLIST, V2-VERSN, V2-NOVER) | 8 |
| Trash | 1 |
| Post-trash captures (4 + optional `status=trashed` probe) | 4–5 |
| Optional own-page purge | 0–1 |
| **Total** | **16–18 ≤ ~20** |

Sequential execution; on a 429: back off, retry the single call, note it in the manifest (RSK-5).

### 6.3 Capture and Redaction Discipline

- **Save raw immediately**: every response (status + body) is written to `tmp/gh-90-spike/*.raw` the moment it arrives — before assessment, before anything else
- **Redact before commit**: the evidence file derived from each raw capture contains only: case name, redacted request line (method + path + query — never headers), HTTP status, response body with `accountId`/`authorId`/`version.by` values masked as stable placeholders (e.g., `«account-1»`, distinctness preserved) and any emails redacted outright
- Nothing outside `tmp/` ever holds an unredacted capture; the `Authorization` header value never enters any file at any point (curl `-H` flags are not echoed to output)
- **Re-run/rollback**: the spike is fully repeatable — re-execute from TC-HIST-001 with a fresh timestamped title; the fixture is disposable by design; nothing persists in the sandbox except trash (and the optional purge removes even that)

## 7. Automation Plan and Implementation Mapping

### 7.1 Decision D-TST-1: no permanent automated tests; no test-suite files touched

**No file under `tests/` or `src/` is created or modified.** Rationale:

- The deliverable is verified knowledge (evidence + TDR), not behavior — there is no code for a suite to assert against
- Contract fixtures / mock-server wiring derived from these captures are explicitly deferred to the MS3-E2 implementation change (spec §7.3); authoring them now would pre-empt that change's design
- Mocked responses are never a substitute for the live captures (spec RSK-6, TDR-0001 C-2) — so there is no "cheap automated proxy" to fall back on
- One-shot curl procedures re-run trivially from this plan (§6.3); a committed script would add review surface and rot for zero durable value

**Convention D-TST-2 (tooling home):** any throwaway script lives in `tmp/gh-90-spike/` (git-ignored) — `evidence/` holds only redacted captures + manifest, per spec DEC-2/§7.1. Nothing executable is committed.

### 7.2 Implementation mapping

| TC ID | Mechanism / File | Implementation Status | Notes |
|-------|------------------|----------------------|-------|
| TC-HIST-001 | Live writes (API-4) + scratch notes | Manual Only | One-shot; fixture ledger feeds manifest |
| TC-HIST-002 | Live GET (API-1) → `evidence/V1-HIST-v2.json` | Manual Only | Raw → redacted per §6.3 |
| TC-HIST-003 | Live GET (API-1) → `evidence/V1-CURR.json` | Manual Only | Raw → redacted per §6.3 |
| TC-HIST-004 | Live GET (API-1) → `evidence/V1-META-v2.json` | Manual Only | Raw → redacted per §6.3 |
| TC-HIST-005 | Live GET (API-1) → `evidence/V1-NOVER.json` | Manual Only | Raw → redacted per §6.3 |
| TC-HIST-006 | Live GET (API-2) → `evidence/V2-HIST-v2.json` | Manual Only | Raw → redacted per §6.3 |
| TC-HIST-007 | Live GET (API-3) → `evidence/V2-VERSLIST.json` | Manual Only | Raw → redacted per §6.3 |
| TC-HIST-008 | Live GET (API-3) → `evidence/V2-VERSN-2.json` | Manual Only | Raw → redacted per §6.3 |
| TC-HIST-009 | Live GET (API-2) → `evidence/V2-NOVER.json` | Manual Only | Raw → redacted per §6.3 |
| TC-HIST-010 | Live DELETE + 4–5 GETs → 4 evidence files | Manual Only | Irreversible phase — runs last among captures |
| TC-HIST-011 | Optional own-page purge + manifest entry | Manual Only | Trash is the floor (RSK-4) |
| TC-HIST-012 | `rg` sweeps + `evidence/README.md` manifest | Manual Only (semi-automated sweeps) | Commands below; outputs cited in TDR |
| TC-HIST-013 | TDR-0011 + `00-index.md` row | Manual Only | Consumes all findings |
| TC-HIST-014 | `git diff main --stat` audit | Manual Only (semi-automated) | Commands below |

### Execution commands

```bash
# --- Session setup (creds stay in shell memory only) ---
set -a; source tmp/marksync-demo/.env; set +a
AUTH="Authorization: Basic $(printf '%s:%s' "$MARKSYNC_USER_EMAIL" "$MARKSYNC_API_TOKEN" | base64)"
BASE="$MARKSYNC_CONFLUENCE_BASE_URL"
SCRATCH="tmp/gh-90-spike"; mkdir -p "$SCRATCH"
SPACE_KEY=$(grep -A3 'spaceKey' tmp/marksync-demo/marksync.yml | grep spaceKey | head -1 | sed 's/.*: *"\?\([^"]*\)"\?/\1/')

# --- Capture pattern (every case; example: V1-HIST-v2) ---
curl -sS -w '\nHTTP_STATUS %{http_code}\n' -H "$AUTH" \
  "$BASE/wiki/rest/api/content/$PAGE_ID?status=historical&version=2&expand=body.storage" \
  > "$SCRATCH/V1-HIST-v2.raw"
# then derive evidence/V1-HIST-v2.json (request line + status + redacted body) per §6.3

# --- TC-HIST-012: redaction sweep (every command must return 0 matches) ---
EV="doc/changes/2026-08/2026-08-15--GH-90--historical-version-api-spike"
rg -F "$MARKSYNC_API_TOKEN" "$EV" doc/decisions/            # expect: no matches
rg -F "$MARKSYNC_USER_EMAIL" "$EV" doc/decisions/           # expect: no matches
rg -n 'Authorization|Basic [A-Za-z0-9+/=]{8,}' "$EV/evidence" doc/decisions/TDR-0011*  # expect: no matches
rg -n '[0-9a-f]{32}' "$EV/evidence"                          # expect: no matches (accountIds masked)

# --- TC-HIST-014: diff audit ---
git diff main --stat                                         # docs + evidence + TDR + index row only
git diff main --name-only | grep -E '^(src|tests)/'          # expect: no matches
git diff main -- package.json                                # expect: empty (no version bump)
```

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Probability | Mitigation |
|----|------|--------|-------------|------------|
| R-TST-1 | Redaction leak — token/email/auth value reaches a committed artifact (spec RSK-3) | H | L | Capture discipline §6.3 (headers never captured; raw only in git-ignored scratch); TC-HIST-012 four sweeps before staging; reviewer re-checks at review_fix |
| R-TST-2 | Scratch files (raw captures / throwaway script) accidentally staged | M | L | Everything lives under git-ignored `tmp/`; TC-HIST-014 step 4 asserts no `tmp/` path in the diff |
| R-TST-3 | Sandbox creds unavailable or token lacks create/update/trash permission mid-session (spec RSK-6) | M | L | Record the gap explicitly per the TDR-0001 precedent — never substitute mocked responses as evidence; PM re-tracks |
| R-TST-4 | Purge endpoint unavailable or scope-uncertain (spec RSK-4) | L | M | Trash is the accepted, recorded cleanup floor (TC-HIST-011 step 1); purge only on certainty |
| R-TST-5 | 429/throttle interrupts a capture (spec RSK-5) | L | L | 16–18 sequential requests; back off and retry the single call; note in manifest |
| R-TST-6 | API drift vs P5-05/P5-06 confuses the delta assessment (spec RSK-1) | M | M | Fresh captures are authoritative and supersede; TC-HIST-006/007 record agreement/delta explicitly for TDR-0011 |

### 8.2 Assumptions

- The demo sandbox tenant/space is available for the session; creds resolve from `tmp/marksync-demo/.env` (spec §12)
- The sandbox token permits page create/update/trash within the sandbox space on both v1 and v2 forms; purge permission is **not** assumed
- Version messages on page **create** may not be supported by the API form — "where supported" per spec §5.1; updates (v2/v3) carry the distinct messages that the metadata cases exercise
- v1 create/update/trash via the v1 content API satisfies API-4 (spec does not mandate a v2 write form; v1 is the battle-tested path)

### 8.3 Open Questions

None blocking. In-plan conventions decided (not spec gaps): scratch/script home = git-ignored `tmp/gh-90-spike/` (D-TST-2, evidence/ stays captures+manifest per DEC-2); standard non-current N = 2 of a 3-version fixture; manifest = `evidence/README.md` (spec allows "README or equivalent"). If delivery finds a §5.1 case cannot be executed as specified (e.g., an endpoint form 404s at the route level), the case is still captured as a finding and the verdict scale absorbs it — the spec needs no reopening for that.

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | test-plan-writer (GH-90) | Initial test plan — 14 TC-HIST scenarios tracing all 10 spec ACs; live-API tier mapping per spec Appendix A (no CI tier applies); 10-case matrix procedure, redaction sweep, verdict determination, D-TST-1/D-TST-2 conventions |

## 10. Test Execution Log

Populated during delivery phases 6–10 by `@coder`, `@runner`, and `@pm` (dod_check). One row per TC-HIST scenario; sweep outputs and the manifest link are cited here when TC-HIST-012/014 run.

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| TC-HIST-001 | — | — | |
| TC-HIST-002 | — | — | |
| TC-HIST-003 | — | — | |
| TC-HIST-004 | — | — | |
| TC-HIST-005 | — | — | |
| TC-HIST-006 | — | — | |
| TC-HIST-007 | — | — | |
| TC-HIST-008 | — | — | |
| TC-HIST-009 | — | — | |
| TC-HIST-010 | — | — | |
| TC-HIST-011 | — | — | |
| TC-HIST-012 | — | — | |
| TC-HIST-013 | — | — | |
| TC-HIST-014 | — | — | |
