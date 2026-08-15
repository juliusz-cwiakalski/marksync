---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliuszcwiakalski | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-90-historical-version-api-spike
status: Proposed
created: 2026-08-15T00:00:00Z
last_updated: 2026-08-15T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0003, spike, priority:critical]
links:
  change_spec: ./chg-GH-90-spec.md
  test_plan: ./chg-GH-90-test-plan.md
  pm_notes: ./chg-GH-90-pm-notes.yaml
summary: "Live-API spike (MS3-E0-S1): verify Confluence Cloud historical-version body fetch — v1 status=historical&version={n} (never exercised) plus fresh 2026-08 re-validation of the v2 forms (P5-05/P5-06 baseline) — against the demo sandbox via the spec §5.1 10-case matrix, with a redacted evidence pack + manifest in evidence/, and record the GO / GO-with-limitations / NO-GO verdict as TDR-0011 (registered in doc/decisions/00-index.md). Zero src/ changes, no version bump."
version_impact: none
---

# IMPLEMENTATION PLAN — GH-90: Spike: Confluence historical version API — verify fetch-body-at-version-N (v1 + v2), record TDR-0011

## Context and Goals

This plan operationalizes the GH-90 spike: convert PDR-0002's TO-CONFIRM assumption — "Confluence Cloud API can fetch a page body at historical version N" — into a verified fact backed by fresh, redacted live evidence, and record the verdict as TDR-0011 so the MS3-E2-S1 `resolve` design can lock (or redesign per the pre-committed fallback: snapshot the base body in the committed lock / disposable cache at publish time).

The MS-0001 inception spike (2026-07-03, TDR-0001) already proved the v2 forms live (evidence P5-05/P5-06). GH-90 delivers the **delta**: (1) the v1 form `GET /wiki/rest/api/content/{id}?status=historical&version={n}&expand=body.storage`, (2) deleted/trashed-page version-fetch behavior, (3) documented version-metadata availability, (4) a fresh 2026-08 live re-validation of the v2 forms, and (5) the TDR-0011 verdict with limitations and the base-version-capture consequence.

**Key goals (spec §4):**

- **G-1**: Fresh, evidence-backed verdict (GO / GO-with-limitations / NO-GO) for fetch-body-at-version-N — v1 `status=historical` form verified, v2 forms re-validated (F-1, F-2 → AC-F1-1, AC-F2-1).
- **G-2**: Deleted/trashed-page version-fetch behavior verified pre/post trash on both API forms (F-4 → AC-F4-1).
- **G-3**: Version-metadata availability (author, timestamp, message) documented per endpoint form (F-3 → AC-F3-1).
- **G-4**: Verdict recorded as **TDR-0011** per repo decision-record conventions, with limitations, consequences (incl. the snapshot fallback where applicable), evidence links, and revisit triggers; registered in `doc/decisions/00-index.md` (F-7 → AC-F7-1, AC-F7-2).
- **G-5**: Spike containment — one disposable sandbox page (created, bumped ≥3 versions, trashed after capture), ≤ ~20 requests, zero `src/` changes, no version bump (→ AC-NFR2-1, AC-NFR4-1).

**Execution model:** session-bounded (spec DEC-1). The coder executes the phases below sequentially; the PM checkpoints around each phase; each phase ends in a commit (coder commits via `@committer`, Conventional Commits per TDR-0008, `docs` type). The test plan's 14 TC-HIST scenarios are the procedure — this plan sequences them; the spec §5.1 matrix is the case authority.

**Verified environment facts (checked 2026-08-15 on this branch):**

- Branch `docs/GH-90/historical-version-api-spike` checked out; `tmp/marksync-demo/.env` and `tmp/marksync-demo/marksync.yml` exist (contents never read into any artifact).
- Scratch home `tmp/gh-90-spike/` is git-ignored via `.gitignore:49` (`tmp/`) — confirmed with `git check-ignore`; also `doc/**/tmp/` at line 48.
- `evidence/` directory exists in this change folder as an empty, untracked scaffold — populate it in Phase 1.
- Next TDR number is 0011 (highest existing: TDR-0010) — the spec's naming holds.

**Open questions**: none — spec §14 is empty (PM clarify_scope resolved time-box, evidence home, sandbox posture, delivery shape); test plan §8.3 has none blocking (in-plan conventions: scratch home, N=2, manifest = `evidence/README.md`). No `@decision-advisor` consult is needed for the plan itself; the verdict follows mechanically from evidence against the pre-committed scale (spec DEC-5).

## Scope

### In Scope

- Fixture provisioning: ONE disposable page in the sandbox space (spaceKey/parentPageId from `tmp/marksync-demo/marksync.yml`), bumped to ≥3 versions with distinct synthetic Storage bodies and distinct version messages where supported (API-4, TC-HIST-001).
- Execution of all 10 spec §5.1 matrix cases (V1-HIST, V1-CURR, V1-META, V1-TRASHED, V1-NOVER, V2-HIST, V2-VERSLIST, V2-VERSN, V2-TRASHED, V2-NOVER) with redacted request-line + status + body captures (API-1..API-3, NFR-3, TC-HIST-002..010).
- Cleanup: trash (soft-delete) as the floor; optional purge of the spike's own page only if strictly page-scoped and available; cleanup mode recorded (TC-HIST-011, AC-NFR2-1).
- Redaction sweep over every new artifact + manifest (`evidence/README.md`) indexing every case → file → endpoint → status → result, plus the request ledger and cleanup mode (TC-HIST-012, AC-F6-1, NFR-1/NFR-6).
- Verdict determination and TDR-0011 authoring + registration row in `doc/decisions/00-index.md` (TC-HIST-013, AC-F7-1, AC-F7-2, DM-2, DM-3).
- Ticket-AC → evidence mapping recorded for the PR body; change-diff audit; execution-log population; spec reconciliation sign-off (TC-HIST-014, AC-NFR4-1).

### Out of Scope

- [OUT] Any `src/`, `tests/`, config, `.github/`, or `package.json` change — zero diffs by design, **no version bump** (spec NG-1, DEC-4, NFR-4).
- [OUT] Implementing the `resolve` flow, base-version capture, or the reverse converter (spec NG-2) — GH-90 only unblocks their design.
- [OUT] The MS3-E0-S2 in-process Mermaid spike (spec NG-3) and the MS-3 story file (NG-4).
- [OUT] Any mutation of sandbox or production content other than the spike's own page (NG-5); purge-permission probing beyond the spike's own page (spec §7.3).
- [OUT] Contract fixtures / mock-server wiring derived from the captures — deferred to the MS3-E2 implementation change (spec §7.3, test plan D-TST-1).
- [OUT] Editing frozen history — prior decision records (PDR-0002, TDR-0001, TDR-0010) and MS-0001 evidence are cited, never modified (NG-6).
- [OUT] Phase-7 doc reconciliation itself (`08-page-versions.md` extension, PDR-0002 TO-CONFIRM resolution link, roadmap outcome note) — flagged for `@doc-syncer`; the coder only lists the flags, never authors those edits (spec §7.1, pm-notes `doc_risks`).
- [OUT] Issue #90 body edits and PR creation — owned by the PM (lifecycle phases 10–11); the coder supplies the AC-evidence map.

### Constraints

- **Zero-code invariant (NFR-4):** `git diff main --name-only | grep -E '^(src|tests)/'` must be empty and `package.json` untouched at every commit boundary. Any pressure toward a code edit is an abort condition (A-3), not a task.
- **Secret discipline (NFR-1, RSK-3):** creds load from `tmp/marksync-demo/.env` at runtime only; the `Authorization` header value lives in shell memory only — never in any file, capture, log, the manifest, or the TDR. Raw captures land only in git-ignored `tmp/gh-90-spike/`; committed `evidence/` files are redacted **before** staging (test plan §6.3).
- **Redaction contract (spec §20):** author identifiers (`accountId`/`authorId`/`version.by`) masked with stable placeholders (e.g., `«account-1»`) preserving presence, shape, and distinctness; emails redacted outright; numeric page/space IDs are not a redaction target.
- **Sandbox containment (NFR-2, DEC-3):** writes are page-scoped to the spike's own disposable page inside the sandbox space — create, version bumps, trash, optional own-page purge. Nothing else.
- **Request budget (NFR-5):** ≤ ~20 sequential API requests (expected 16–18 per test plan §6.2); on a 429: back off, retry the single call, note it in the manifest (RSK-5).
- **Evidence-first ordering:** the trash phase (TC-HIST-010) is irreversible for the fixture's live state — it runs only after every pre-trash capture is saved raw (test plan TC-HIST-010 precondition).
- **Decision-record conventions:** `doc/guides/decision-records-management.md` + TDR-0010 skeleton govern TDR-0011 (naming `TDR-0011-confluence-historical-version-api-spike.md`, flat `doc/decisions/`, front matter, section order, `status: Proposed` pre-merge).
- **Commit shape (TDR-0008):** Conventional Commits enforced by commitlint + husky; completion signals below are commit-message-shaped accordingly.

### Risks

From spec §11 and test plan §8.1 (full tables there); the delivery-critical subset:

- **RSK-3 / R-TST-1** — Redaction leak (token/email/auth header value in a committed artifact). Mitigated by capture discipline (headers never captured; raw only in git-ignored scratch), the four TC-HIST-012 sweeps **before** staging, and reviewer re-check at review_fix. Residual: L.
- **RSK-4 / R-TST-4** — Purge endpoint unavailable or scope-uncertain. Mitigated: purge only on certainty of page-scope; trash is the accepted, recorded cleanup floor (TC-HIST-011). Residual: L.
- **RSK-5 / R-TST-5** — 429/throttle mid-capture. Mitigated: sequential, ~16–18 requests; back off and retry the single call; note in manifest. Residual: L.
- **RSK-6 / R-TST-3** — Creds unavailable or token lacks create/update/trash permission mid-session. Mitigated: abort A-1 — record the gap per the TDR-0001 precedent; **never substitute mocked responses as evidence**. Residual: L.
- **R-TST-2** — Scratch files accidentally staged. Mitigated: everything lives under git-ignored `tmp/`; TC-HIST-014 step 4 asserts no `tmp/` path in the diff. Residual: L.
- **RSK-P1** (plan) — A sweep pattern false-negative/false-positive from unloaded env vars (`rg -F ""` matches everything). Mitigated: Task 1.9 asserts both vars non-empty before sweeping.

**Risks during delivery (posture note):**

- **API drift is a finding, not a blocker** (RSK-1/RSK-2, R-TST-6): fresh captures are authoritative and supersede P5-05/P5-06; any delta vs the baseline or any v1-parameter surprise is captured as a limitation with its design consequence — the verdict scale (GO-with-limitations / NO-GO) absorbs it. The spike never "fails" on an unexpected API response; it records it.
- **Trash/purge availability:** trash via `DELETE /wiki/rest/api/content/{id}` is the known-good floor; the optional purge is skipped on any uncertainty (RSK-4) — the manifest records which mode happened either way (AC-NFR2-1).
- **Request budget:** the ledger in the manifest tracks every request; if a retry pushes past ~20, note it — the budget is a politeness bound (NFR-5), not an AC, and a single noted 429-retry does not reopen the plan.

### Abort Criteria

On any trigger: **STOP, leave the tree clean, report to PM** with the command output. Do not improvise.

- **A-1 — Creds/permission failure:** `tmp/marksync-demo/.env` missing/unreadable, vars empty, or the token cannot create/update/trash in the sandbox space. STOP — never mock evidence (RSK-6); the gap is recorded by the PM per the TDR-0001 precedent.
- **A-2 — Secret already committed:** a redaction sweep hits **after** a phase commit (pre-commit hits are fixed in-place and re-swept — normal work). STOP and report immediately — this is secret-rotation territory, not a quiet amend.
- **A-3 — Scope pressure:** anything suggesting a `src/`/`tests/`/`.github/`/`package.json` edit, a write to content other than the spike's own page, or editing frozen history. STOP and report; never silently scope in (spec §7.2, NG-5, NG-6).

**Not an abort:** a §5.1 case that cannot be executed as specified (e.g., a route-level 404 on an endpoint form) — that is a captured finding the verdict scale absorbs; the spec needs no reopening for it (test plan §8.3).

**Rollback:** the spike is disposable by design — before any commit, `git restore`/delete the untracked `evidence/` files; the sandbox fixture is re-provisionable with a fresh timestamped title (test plan §6.3). No code, config, or persisted product state is ever touched.

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| §5.1 matrix cases captured with redacted request + response evidence | 100% (10/10) | Spec §4.1, NFR-3, AC-F6-1 |
| Secrets (token / email / auth-header value) in any committed artifact | 0 (four sweeps, 0 matches each) | NFR-1, TC-HIST-012 |
| `src/` file changes in the change diff | 0 | NFR-4, AC-NFR4-1, TC-HIST-014 |
| Sandbox content created/modified other than the spike's own page | 0 | NFR-2, AC-NFR2-1 |
| TDR-0011 verdict recorded + evidence-linked + registered in `00-index.md` | 1 record + 1 index row | AC-F7-1, AC-F7-2, TC-HIST-013 |
| Cleanup mode recorded (trash vs trash + own-page purge) | recorded | AC-NFR2-1, TC-HIST-011 |
| Total API requests | ≤ ~20 (expected 16–18) | NFR-5, TC-HIST-001 ledger |
| Version bump | none (explicit no-op attestation) | DEC-4, TC-HIST-014 |

## Phases

> Three phases — a docs-only spike: no scaffolding, integration, or post-review-fix phases apply (skip/merge per plan-writer contract). Phase 1 = PM's "live verification & evidence capture" (TC-HIST-001..012); Phase 2 = analysis + TDR-0011 (TC-HIST-013); Phase 3 = finalize — ticket-AC evidence map, diff audit, reconciliation (TC-HIST-014). The PM checkpoints around each phase; each phase ends in one commit by the coder. Scratch scripts/captures live in `tmp/gh-90-spike/` (git-ignored, verified) — **never staged**; `evidence/` holds only redacted captures + the manifest (test plan D-TST-2).

### Phase 1: Live verification & evidence capture

**Goal**: Provision the disposable fixture, execute the full spec §5.1 case matrix against the demo sandbox (pre-trash, trash, post-trash), clean up, and land a complete, redacted, manifest-indexed evidence pack in `evidence/` — proving (or refuting, as a finding) fetch-body-at-version-N on both API forms. Implements F-1, F-2, F-4, F-5, F-6; satisfies TC-HIST-001..012; sets up AC-F1-1, AC-F2-1, AC-F4-1, AC-F5-1, AC-F6-1, AC-NFR2-1.

**Tasks**:

- [ ] **1.1** Preconditions: on branch `docs/GH-90/historical-version-api-spike`; `tmp/marksync-demo/.env` and `tmp/marksync-demo/marksync.yml` exist; `git check-ignore tmp/gh-90-spike` resolves via `.gitignore:49` (`tmp/`). Create the scratch dir: `mkdir -p tmp/gh-90-spike`. Read `spaceKey` (and `parentPageId` if the fixture needs a parent) from `marksync.yml` — runtime only, never hardcoded into a committed artifact. (TC-HIST-001 preconditions)
- [ ] **1.2** Session setup — creds in shell memory only (test plan §7):

  ```bash
  set -a; source tmp/marksync-demo/.env; set +a
  [ -n "$MARKSYNC_API_TOKEN" ] && [ -n "$MARKSYNC_USER_EMAIL" ] && [ -n "$MARKSYNC_CONFLUENCE_BASE_URL" ] || echo "ABORT A-1: creds incomplete"
  AUTH="Authorization: Basic $(printf '%s:%s' "$MARKSYNC_USER_EMAIL" "$MARKSYNC_API_TOKEN" | base64)"
  ```

  Never echo `$AUTH`, never write it to any file; curl `-H` flags are not echoed into captures. Failure here → **abort A-1**.
- [ ] **1.3** TC-HIST-001 — fixture provisioning (3 write requests): create ONE page via `POST /wiki/rest/api/content` (type `page`, unique title `GH-90 spike fixture <YYYYMMDD-HHMM>`, sandbox `space.key`, body `<p>GH-90 spike fixture — body v1 (synthetic)</p>`); record the returned `id` and initial version (expect 1) into `tmp/gh-90-spike/fixture-notes.md`; update to v2 and v3 via `PUT /wiki/rest/api/content/{id}` with distinct bodies and `version: {number: n, message: "GH-90 spike bump vn"}`; confirm final state = one page at version 3, three distinct bodies/messages. Start the request ledger (every request this session is logged — it becomes the manifest's ledger).
- [ ] **1.4** TC-HIST-002..005 — pre-trash v1 captures (API-1). For each: issue the GET, save raw status+body to `tmp/gh-90-spike/*.raw` **immediately** (capture pattern: `curl -sS -w '\nHTTP_STATUS %{http_code}\n' -H "$AUTH" "$BASE/…" > "$SCRATCH/<case>.raw"`), then note the assessment in the fixture notes:
  - TC-HIST-002 `V1-HIST-v2`: `GET /wiki/rest/api/content/{id}?status=historical&version=2&expand=body.storage` — does `body.storage.value` equal the exact v2 body (and differ from v3)? Is `version.number` 2? (RSK-2: parameter-ignored/misbehaved is the finding — captured, never patched around)
  - TC-HIST-003 `V1-CURR`: `…?status=current&expand=body.storage` — baseline anchor proving 002's body is genuinely non-current.
  - TC-HIST-004 `V1-META-v2`: `…?status=historical&version=2&expand=version` (combined `expand=body.storage,version` may substitute) — per-field availability: `version.by` / `version.when` / `version.message`.
  - TC-HIST-005 `V1-NOVER`: `…?status=historical&version=99&expand=body.storage` — exact status + error contract (404-class expected, not assumed).
- [ ] **1.5** TC-HIST-006..009 — pre-trash v2 captures (API-2/API-3), same raw-first discipline:
  - TC-HIST-006 `V2-HIST-v2`: `GET /wiki/api/v2/pages/{id}?version=2&body-format=storage` — version-2 body exact? Record agreement/delta vs the P5-06 baseline (`doc/inception/integration-scenarios/08-page-versions.md`) — drift is a finding (RSK-1).
  - TC-HIST-007 `V2-VERSLIST`: `GET /wiki/api/v2/pages/{id}/versions?body-format=storage` — all 3 versions inline, newest-first? Which metadata accompanies each entry? (re-validates P5-05 + feeds AC-F3-1)
  - TC-HIST-008 `V2-VERSN-2`: `GET /wiki/api/v2/pages/{id}/versions/2` — `authorId` / `createdAt` / `message` present/absent; does the bump message survive?
  - TC-HIST-009 `V2-NOVER`: `GET /wiki/api/v2/pages/{id}?version=99&body-format=storage` — exact status + error contract; comparable with TC-HIST-005.
- [ ] **1.6** TC-HIST-010 — trash phase (irreversible; runs only after 1.4/1.5 raws are all saved): `DELETE /wiki/rest/api/content/{id}` (soft-delete), then re-issue and raw-capture: v1 historical → `V1-TRASHED-hist`, v1 current → `V1-TRASHED-curr`, v2 historical → `V2-TRASHED-hist`, v2 current (`GET /wiki/api/v2/pages/{id}`) → `V2-TRASHED-curr`; optionally probe v1 `status=trashed` (→ `V1-TRASHED-probe`) — note either way. Assess: does historical fetch still return the version-N body post-trash? (AC-F4-1 evidence)
- [ ] **1.7** TC-HIST-011 — cleanup: purge **only** if the purge form is available to this token and strictly page-scoped to the spike's own page; on any uncertainty, stop at trash (RSK-4). Record the cleanup mode (`trash` or `trash + own-page purge`) in the fixture notes for the manifest. Confirm containment via the request ledger (every session write targeted the spike's own page).
- [ ] **1.8** TC-HIST-012 (derivation half) — redact and derive the evidence pack per test plan §6.3: each `evidence/<Case>.json` contains case name, redacted request line (method + path + query — **never headers**), HTTP status, and response body with `accountId`/`authorId`/`version.by` masked as stable placeholders (`«account-1»`, distinctness preserved) and any emails redacted outright. Expected file set (12 captures + manifest): `V1-HIST-v2.json`, `V1-CURR.json`, `V1-META-v2.json`, `V1-NOVER.json`, `V2-HIST-v2.json`, `V2-VERSLIST.json`, `V2-VERSN-2.json`, `V1-TRASHED-hist.json`, `V1-TRASHED-curr.json`, `V2-TRASHED-hist.json`, `V2-TRASHED-curr.json` (+ optional `V1-TRASHED-probe.json`). Write `evidence/README.md` (manifest): every §5.1 case → file → endpoint form → HTTP status → one-line result; the request ledger (total count vs NFR-5); the cleanup mode; any 429/backoff note. **Authoring caution:** the manifest and captures must not contain the literal strings the sweep patterns match (e.g., write "auth header (never captured)", not the header name) — or TC-HIST-012 sweep 3 will hit.
- [ ] **1.9** TC-HIST-012 (sweep half) — redaction sweep, pre-stage, with env vars confirmed non-empty (guard: `[ -n "$MARKSYNC_API_TOKEN" ] && [ -n "$MARKSYNC_USER_EMAIL" ]` — `rg -F ""` matches everything):

  ```bash
  EV="doc/changes/2026-08/2026-08-15--GH-90--historical-version-api-spike"
  rg -F "$MARKSYNC_API_TOKEN"  "$EV" doc/decisions/   # expect: no matches
  rg -F "$MARKSYNC_USER_EMAIL" "$EV" doc/decisions/   # expect: no matches
  rg -n 'Authorization|Basic [A-Za-z0-9+/=]{8,}' "$EV/evidence" doc/decisions/TDR-0011*  # expect: no matches (TDR not yet present in Phase 1 — sweep evidence/ alone)
  rg -n '[0-9a-f]{32}' "$EV/evidence"                  # expect: no matches (accountIds masked)
  ```

  Zero-hit proof: save the four commands + their empty outputs to `tmp/gh-90-spike/sweep-proof.txt` (scratch; cited in the Execution Log) — a hit means fix the redaction and re-sweep **before** staging; a hit after commit → **abort A-2**.
- [ ] **1.10** Evidence completeness verification: the manifest indexes 10/10 matrix cases (NFR-3); every capture is named per the §5.1 pattern and parses as valid JSON (envelope suggestion: `{ "case", "request", "http_status", "response_body" }`) or is verbatim-reviewable HTTP (NFR-6); the ledger total is ≤ ~20 with any excess explained. File count check: 12 captures (+ optional probe) + `README.md`.
- [ ] **1.11** Commit `evidence/**` only (redacted captures + manifest). Assert pre-commit: `git status` shows no `tmp/` path staged (R-TST-2) and no change outside `evidence/`.

**Acceptance Criteria**:

- Must: all 10 §5.1 cases captured with request line + status + body, manifest-indexed (AC-F6-1, NFR-3, TC-HIST-012).
- Must: four redaction sweeps return 0 matches; zero-hit proof captured (NFR-1, RSK-3).
- Must: exactly one sandbox page created/modified/cleaned; cleanup mode recorded in the manifest (AC-NFR2-1, NFR-2, TC-HIST-011).
- Must: request ledger total ≤ ~20 (NFR-5); 429s and retries noted.
- Should: optional `status=trashed` probe attempted or explicitly noted as skipped (TC-HIST-010 step 4).

**Files and modules**:

- Code areas: none (zero `src/`/`tests/` by design, NFR-4). New artifacts: `evidence/*.json` (12 + optional probe), `evidence/README.md` (manifest). Scratch (never committed): `tmp/gh-90-spike/` — raws, fixture notes, sweep proof, any throwaway script (D-TST-2).
- System docs: none (phase-7 reconciliation targets are `@doc-syncer`'s, not this phase's).

**Tests**:

- TC-HIST-001 (fixture + ledger), TC-HIST-002..010 (matrix captures), TC-HIST-011 (cleanup recording), TC-HIST-012 (sweep + manifest completeness) — one-shot live verifications per the test plan §5.2 procedures and §7 commands.

**Completion signal**: `docs(GH-90): capture historical-version API spike evidence (10-case matrix, redacted)`

---

### Phase 2: Verdict determination + TDR-0011 + index registration

**Goal**: Assess the captured findings against the pre-committed verdict scale and record the durable verdict as TDR-0011 — verdict, per-form findings, limitations each with its design consequence, the base-version-capture consequence (snapshot fallback on NO-GO or any material limitation), evidence links, revisit triggers — registered in the decision index. Implements F-7, DM-2, DM-3; satisfies TC-HIST-013; sets up AC-F7-1, AC-F7-2.

**Tasks**:

- [ ] **2.1** Determine the verdict from the manifest + assessments, exactly per the spec §5.1 scale (DEC-5 — no verdict-shopping):
  - **GO** — at least one API form returns the exact version-N Storage body for a current (non-deleted) page, freshly verified; no material caveats.
  - **GO-with-limitations** — base case works but with material caveats (only one form works; trashed-page semantics constrain a `resolve` edge; metadata gaps) — **each limitation named with its design consequence**.
  - **NO-GO** — no form returns the version-N body; PDR-0002 revisit trigger #3 applies: snapshot the base body in the committed lock / disposable cache at publish time.
  Assemble the per-form findings tables the TDR consumes: v1 historical (incl. whether `version={n}` was honored at all — RSK-2), v2 historical/list/single (incl. the P5-05/P5-06 agreement/delta statement from TC-HIST-006/007), trashed behavior per form (TC-HIST-010), metadata availability per endpoint (TC-HIST-004/007/008 → AC-F3-1's available/not-available table), error contracts (TC-HIST-005/009).
- [ ] **2.2** Author `doc/decisions/TDR-0011-confluence-historical-version-api-spike.md` per repo decision-record conventions (`doc/guides/decision-records-management.md` + the TDR-0010 skeleton; delegate the record-writing to `@decision-advisor` per the repo decision flow if available, supplying the Phase-1 findings + verdict — otherwise author directly). Required content: front matter (`id: TDR-0011`, `decision_type: tdr`, `status: Proposed`, `created/last_updated: 2026-08-15`, `decision_date: null`, summary, owners, service, `decision_scope: repo`, classification, governance, `ai_assistance`, `revisit_triggers` — e.g., Atlassian deprecating the v1 `status=historical` form or the v2 `version` parameter — and `links.related_changes: ["GH-90"]`, `links.spec` → this change's spec, `links.decisions` → PDR-0002/TDR-0001/TDR-0010); sections in TDR-0010 order (Context, Problem Framing, Constraints, Decision Drivers, Evidence/Assumptions & Unknowns, Alternatives Considered — the verdict options, Decision — verdict + Implementation + Consequences incl. the snapshot-in-lock/cache fallback on NO-GO **or** any material limitation, Risks, Revision History, Appendix citing the evidence). Every evidence file is linked with a resolving relative path.
- [ ] **2.3** Register TDR-0011 in `doc/decisions/00-index.md`: one table row after TDR-0010, mirroring the TDR-0010 row shape — `| [TDR-0011](./TDR-0011-confluence-historical-version-api-spike.md) | TDR | <title matching the record> | Proposed | 2026-08-15 | Juliusz Ćwiąkalski |` (status flips to Accepted at merge per the lifecycle, as with prior records).
- [ ] **2.4** TDR lint: the front matter parses as valid YAML; `id`/`decision_type`/`status` match the index row; the verdict string is exactly one of `GO` / `GO-with-limitations` / `NO-GO`; on NO-GO or any material limitation, the snapshot fallback is explicitly named with its design consequence; every evidence link and index link resolves (`test -f` each target).
- [ ] **2.5** Re-run redaction sweeps 1–3 with TDR-0011 now in place (the test plan's sweep commands already target `doc/decisions/` and `doc/decisions/TDR-0011*`): 0 matches each; append to the zero-hit proof. A hit → fix before staging; post-commit hit → **abort A-2**.
- [ ] **2.6** Commit `doc/decisions/TDR-0011-confluence-historical-version-api-spike.md` + the `00-index.md` row.

**Acceptance Criteria**:

- Must: verdict is exactly one of the pre-committed scale; NO-GO or any material limitation explicitly names the base-version-capture consequence (fallback: snapshot base body in lock/cache) (AC-F7-1, DEC-5).
- Must: TDR-0011 links its evidence files (all resolving) and a row exists in `doc/decisions/00-index.md` (AC-F7-2, DM-2, DM-3).
- Must: per-endpoint metadata availability documented for author / timestamp / message (AC-F3-1 write-up) and the P5-05/P5-06 agreement/delta statement present (AC-F2-1's TDR half).
- Must: sweeps clean over the TDR + index (NFR-1).
- Should: revisit triggers mirror the TDR-0001/TDR-0010 pattern (spec §22).

**Files and modules**:

- Code areas: none. New: `doc/decisions/TDR-0011-confluence-historical-version-api-spike.md`. Updated: `doc/decisions/00-index.md` (one row).
- System docs: the decision record + registry **are** the deliverables (DM-2, DM-3); `doc/spec/**` untouched — phase-7 flags (08-page-versions.md, PDR-0002 link, roadmap note) are handed to `@doc-syncer`, not authored here.

**Tests**:

- TC-HIST-013 (verdict determination, TDR authoring, registration) per test plan §5.2; sweeps re-run per TC-HIST-012 commands.

**Completion signal**: `docs(GH-90): record TDR-0011 spike verdict and register in decision index`

---

### Phase 3: Finalize — diff audit, ticket-AC evidence map, reconciliation

**Goal**: Prove the change surgical (zero `src/`/`tests/`/`package.json` diffs, no scratch staged), map the captured evidence to the four ticket ACs for the PR body (issue-body edits stay with the PM), populate the execution logs, and sign off the spec AC-by-AC with the explicit no-version-bump attestation. Satisfies TC-HIST-014; ratifies all ACs.

**Tasks**:

- [ ] **3.1** TC-HIST-014 — change-diff audit (semi-automated):

  ```bash
  git diff main --stat                                        # docs + evidence + TDR + index row only
  git diff main --name-only | grep -E '^(src|tests)/'         # expect: no matches (NFR-4)
  git diff main --name-only | grep -E '^tmp/'                 # expect: no matches (R-TST-2)
  git diff main -- package.json                               # expect: empty (no version bump, DEC-4)
  ```

  Assert the changed-file set is exactly: this change folder's docs + `evidence/**` + `doc/decisions/TDR-0011-*` + the `00-index.md` row. Anything else → investigate; scope pressure → **abort A-3**.
- [ ] **3.2** Record the ticket-AC → evidence mapping for the PM's PR body (do **not** edit issue #90 — PM owns tracker writes):

  | Ticket AC | Spec ACs | Evidence |
  |-----------|----------|----------|
  | AC-1 — ≥3 version states (historical N, current, deleted/edge), both forms | AC-F1-1, AC-F2-1, AC-F4-1, AC-F5-1 | `V1-HIST-v2.json`, `V1-CURR.json`, `V2-HIST-v2.json`, `V1/V2-TRASHED-*.json`, `V1/V2-NOVER.json` + manifest results |
  | AC-2 — version metadata availability documented | AC-F3-1 | `V1-META-v2.json`, `V2-VERSLIST.json`, `V2-VERSN-2.json` + TDR-0011 per-endpoint findings table |
  | AC-3 — limitations + verdict with consequences (fallback: snapshot base body in lock/cache) | AC-F7-1 | TDR-0011 Decision + Consequences |
  | AC-4 — TDR created with evidence links | AC-F6-1, AC-F7-2 | TDR-0011 evidence links, `00-index.md` row, `evidence/README.md` manifest |

  Store the table (with one-line results per AC) in this plan's Execution Log notes for phase 10/11 consumption.
- [ ] **3.3** Populate the test plan's §10 Test Execution Log — one row per TC-HIST-001..014 (run date, result, notes; cite the zero-hit sweep proof for TC-HIST-012 and the diff-audit outputs for TC-HIST-014) — and this plan's Execution Log below.
- [ ] **3.4** Spec reconciliation sign-off: walk spec §17 AC-by-AC against the delivered state — AC-F1-1 (V1-HIST capture + TDR finding), AC-F2-1 (V2-HIST capture + P5-06 agreement/delta), AC-F3-1 (metadata table), AC-F4-1 (post-trash captures + TDR documentation), AC-F5-1 (NOVER contracts), AC-F6-1 (manifest + 0-secret sweep), AC-F7-1 (verdict per scale + consequence), AC-F7-2 (evidence links + index row), AC-NFR2-1 (containment + cleanup mode), AC-NFR4-1 (zero `src/` + no bump) — record PASS/status for each in the Execution Log.
- [ ] **3.5** No-version-bump attestation (final-phase contract, satisfied by explicit no-op): `version_impact: none` — `git diff main -- package.json` is empty (verified in 3.1) and **no bump is performed** (spec DEC-4: no shipped-code change exists to version or release). Record the attestation in the Execution Log.
- [ ] **3.6** Should — early quality-gate confidence: run `bun run check` once (expected green on a zero-code diff; the authoritative gate run is lifecycle phase 9 by `@runner` — an unchanged regression net carrying no AC evidence, test plan §4). Any failure → **abort A-3** (a red gate on a docs-only diff means something leaked into code).
- [ ] **3.7** Commit the change-folder log updates (this plan's Execution Log + test plan §10 rows + the AC-evidence map).

**Acceptance Criteria**:

- Must: surgical docs-only diff — zero `src/`/`tests/`/`.github/`/`package.json` changes; no `tmp/` path staged (AC-NFR4-1, NFR-4, TC-HIST-014).
- Must: ticket-AC → evidence mapping recorded for the PR body; no issue-body edits made by the coder.
- Must: both execution logs populated (test plan §10; this plan) including the spec §17 AC-by-AC sign-off and the no-version-bump attestation.
- Should: `bun run check` green pre-commit (phase-9 preview).

**Files and modules**:

- Code areas: none.
- System docs: none authored by the coder — phase-7 reconciliation flags handed to `@doc-syncer`: (a) `doc/inception/integration-scenarios/08-page-versions.md` extension (v1 form, deleted behavior, fresh-evidence pointers), (b) PDR-0002 TO-CONFIRM resolution link (frozen history — linked, never rewritten), (c) possible `doc/overview/02-roadmap.md` outcome note (pm-notes `doc_risks`; spec §7.1).

**Tests**:

- TC-HIST-014 (change-diff audit) per test plan §5.2/§7 commands.

**Completion signal**: `docs(GH-90): finalize spike — ticket-AC evidence map, execution logs, reconciliation`

---

## Test Scenarios

All 14 TC-HIST scenarios from the test plan §5.1, mapped to phases and ACs (one-shot live verifications + artifact checks; no CI tier applies — spec Appendix A, test plan §4):

| TC ID | Scenario | Phase | AC Coverage |
|-------|----------|-------|-------------|
| TC-HIST-001 | Fixture provisioning: one disposable page at ≥3 distinct-body versions | 1 (Task 1.3) | AC-NFR2-1 (setup), NFR-2, NFR-5 |
| TC-HIST-002 | V1-HIST: v1 historical fetch at non-current version N=2 | 1 (Task 1.4) | AC-F1-1 |
| TC-HIST-003 | V1-CURR: v1 current-state baseline fetch | 1 (Task 1.4) | AC-F1-1 (baseline), NFR-3 |
| TC-HIST-004 | V1-META: v1 metadata expand (version.by/when/message) | 1 (Task 1.4) | AC-F3-1 |
| TC-HIST-005 | V1-NOVER: v1 fetch of nonexistent version 99 | 1 (Task 1.4) | AC-F5-1 |
| TC-HIST-006 | V2-HIST: v2 historical fetch, fresh re-validation vs P5-06 | 1 (Task 1.5) | AC-F2-1 |
| TC-HIST-007 | V2-VERSLIST: v2 versions list, inline bodies, newest-first | 1 (Task 1.5) | AC-F2-1, AC-F3-1 |
| TC-HIST-008 | V2-VERSN: v2 single-version metadata | 1 (Task 1.5) | AC-F3-1 |
| TC-HIST-009 | V2-NOVER: v2 fetch of nonexistent version 99 | 1 (Task 1.5) | AC-F5-1 |
| TC-HIST-010 | Trash phase: post-trash historical + current fetches, both forms | 1 (Task 1.6) | AC-F4-1 |
| TC-HIST-011 | Cleanup and cleanup-mode recording | 1 (Task 1.7) | AC-NFR2-1 |
| TC-HIST-012 | Redaction sweep (4× zero-hit) + evidence manifest completeness | 1 (Tasks 1.8–1.10), re-run in 2 (Task 2.5) | AC-F6-1, NFR-1, NFR-3, NFR-6 |
| TC-HIST-013 | Verdict determination, TDR-0011 authoring, index registration | 2 | AC-F7-1, AC-F7-2 |
| TC-HIST-014 | Change-diff audit: zero src/ diffs, no version bump, no tmp/ staged | 3 (Task 3.1) | AC-NFR4-1 |

**AC coverage check (spec §17):** AC-F1-1 → TC-HIST-002/003, 013 · AC-F2-1 → TC-HIST-006/007, 013 · AC-F3-1 → TC-HIST-004/007/008, 013 · AC-F4-1 → TC-HIST-010, 013 · AC-F5-1 → TC-HIST-005/009 · AC-F6-1 → TC-HIST-012 · AC-F7-1 → TC-HIST-013 · AC-F7-2 → TC-HIST-013 · AC-NFR2-1 → TC-HIST-001/011 · AC-NFR4-1 → TC-HIST-014. **All 10 spec ACs covered** (mirrors test plan §3.1 — all "Covered").

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification (§5.1 matrix, §8.4 API forms, §17 ACs — authority) | ./chg-GH-90-spec.md | Spec |
| Test plan (14 TC-HIST procedures, §6.3 redaction discipline, §7 commands) | ./chg-GH-90-test-plan.md | Test Plan |
| PM notes (DEC-1..DEC-4 provenance, doc-risk flags) | ./chg-GH-90-pm-notes.yaml | Notes |
| Evidence pack (12 redacted captures + optional probe) | ./evidence/*.json | Evidence (new — Phase 1) |
| Evidence manifest (case → file → endpoint → status → result; request ledger; cleanup mode) | ./evidence/README.md | Evidence (new — Phase 1) |
| TDR-0011 — spike verdict record | `doc/decisions/TDR-0011-confluence-historical-version-api-spike.md` | Decision (new — Phase 2) |
| Decision registry (TDR-0011 row) | `doc/decisions/00-index.md` | Decision (updated — Phase 2) |
| TDR skeleton/conventions to follow | `doc/decisions/TDR-0010-credential-validation-v1-current-user.md`, `doc/guides/decision-records-management.md` | Reference (unchanged) |
| Spike precedent (C-1 disposable sandbox, C-2 redacted evidence, C-3 durable records) | `doc/decisions/TDR-0001-confluence-api-validation-spike.md` | Reference (unchanged) |
| TO-CONFIRM row + revisit trigger #3 (fallback wording) + Decision §2 | `doc/decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md` | Reference (unchanged; linked at phase 7) |
| P5-05/P5-06 delta baseline | `doc/inception/integration-scenarios/08-page-versions.md` | Reference (unchanged; extended at phase 7 by @doc-syncer) |
| Redaction/secret posture | `doc/guides/security-baseline.md` | Reference (unchanged) |
| Scratch (raws, fixture notes, sweep proof, throwaway script — never committed) | `tmp/gh-90-spike/` (git-ignored via `.gitignore:49`) | Scratch |
| Sandbox creds (runtime only; never captured) | `tmp/marksync-demo/.env`, `tmp/marksync-demo/marksync.yml` | Secret (never committed) |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | plan-writer (GH-90) | Initial plan. 3 phases (docs-only spike — no scaffolding/integration/review-fix phases apply): (1) live verification & evidence capture — TC-HIST-001..012, fixture → 10-case matrix → trash → cleanup → redaction sweep → manifest; (2) verdict + TDR-0011 per TDR-0010/decision-records-management conventions + 00-index row — TC-HIST-013; (3) finalize — TC-HIST-014 diff audit, ticket-AC evidence map for the PR body, execution logs, spec §17 reconciliation, explicit no-version-bump attestation (DEC-4). Verified environment facts: tmp/ git-ignore at .gitignore:49; creds + marksync.yml present; evidence/ scaffold exists; next TDR number 0011. Abort criteria A-1..A-3 (creds/permission, post-commit secret hit, scope pressure) + "case-unexecutable = finding, not abort" posture per test plan §8.3. |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 1 | Not started | — | — | — | |
| 2 | Not started | — | — | — | |
| 3 | Not started | — | — | — | |
