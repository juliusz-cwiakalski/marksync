---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliuszcwiakalski | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-90-historical-version-api-spike
status: Updated
created: 2026-08-15T00:00:00Z
last_updated: 2026-08-15T05:06:36Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0003, spike, priority:critical]
links:
  change_spec: ./chg-GH-90-spec.md
  test_plan: ./chg-GH-90-test-plan.md
  pm_notes: ./chg-GH-90-pm-notes.yaml
summary: "Live-API spike (MS3-E0-S1): verify Confluence Cloud historical-version body fetch — v1 status=historical&version={n} (never exercised) plus fresh 2026-08 re-validation of the v2 forms (P5-05/P5-06 baseline) — via a CEO-waiver-authorized CI probe workflow (Amendment 1, 2026-08-15: local creds revoked; evidence captured in the e2e sandbox space using the repo's valid Actions E2E secrets) executing the spec §5.1 10-case matrix, with a redacted evidence pack + manifest in evidence/, and record the GO / GO-with-limitations / NO-GO verdict as TDR-0011 (registered in doc/decisions/00-index.md). Zero src/ changes, no version bump; the only non-change-folder additions are the spike-branch probe workflow + probe script."
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

**Execution model:** session-bounded (spec DEC-1). The coder executes the phases below sequentially; the PM checkpoints around each phase; each phase ends in a commit (Phase 1, as amended, in two: commit A = probe workflow + script, commit B = evidence pack — the probe run cannot trigger before the workflow is pushed, so the evidence necessarily lands second). The test plan's 14 TC-HIST scenarios are the procedure — this plan sequences them; the spec §5.1 matrix is the case authority. **Amendment 1 (2026-08-15) changed only the execution vehicle (local curl → CI probe); the matrix, redaction contract, and verdict scale are unchanged.**

**Verified environment facts (checked 2026-08-15 on this branch):**

- Branch `docs/GH-90/historical-version-api-spike` checked out.
- Local creds `tmp/marksync-demo/.env` exist but the token is **REVOKED** (403 "Current user not permitted to use Confluence", 2026-08-15 — see Execution Log phase 1). The file is retained ONLY as the source of the sweep literals (task 1.18); it is never committed and no longer used for captures.
- Repo GitHub Actions E2E secrets are **VALID**: `E2E_CONFLUENCE_BASE_URL`, `E2E_USER_EMAIL`, `E2E_API_TOKEN`, `E2E_SPACE_KEY`, `E2E_PARENT_PAGE_ID` — proven by `run-e2e.yml` success 2026-08-15T03:18Z, run 31861445358 (CEO resolution, pm-notes).
- GitHub trigger constraint: `workflow_dispatch` requires the workflow file on the **default** branch (the CEO waiver forbids that pre-merge) → the probe workflow triggers on `push` to this branch with a `paths:` filter (task 1.12).
- `gh` CLI authenticated (verified `gh auth status`) — used for run watch/download/list.
- Scratch home `tmp/gh-90-spike/` is git-ignored via `.gitignore:49` (`tmp/`) — confirmed with `git check-ignore`; now also holds `raw-artifacts/` (downloaded CI artifact).
- `evidence/` directory exists in this change folder as an empty, untracked scaffold — populate it in Phase 1.
- Next TDR number is 0011 (highest existing: TDR-0010) — the spec's naming holds.

**Open questions**: none — spec §14 is empty; the A-1 blocker (local creds revoked) was resolved 2026-08-15 by the CEO credential resolution (issue #90 comment 5300646430; pm-notes decisions); the DoR READY verdict stands (scope unchanged). No `@decision-advisor` consult is needed for the amendment; the verdict still follows mechanically from evidence against the pre-committed scale (spec DEC-5).

## Scope

### In Scope

- **CI probe authoring + execution (Amendment 1, CEO waiver)**: exactly ONE additive workflow `.github/workflows/gh-90-historical-probe.yml` + exactly ONE zero-dependency probe script `scripts/gh-90-historical-probe.mjs` — spike branch only, GH-32 precedent, no security controls removed (`ci.yml` / `run-e2e.yml` untouched).
- Fixture provisioning: ONE disposable page in the **e2e sandbox space** (`E2E_SPACE_KEY` / `E2E_PARENT_PAGE_ID` via the probe script; originally the demo-sandbox spaceKey from `tmp/marksync-demo/marksync.yml` — superseded by Amendment 1), bumped to ≥3 versions with distinct synthetic Storage bodies and distinct version messages where supported (API-4, TC-HIST-001).
- Execution of all 10 spec §5.1 matrix cases (V1-HIST, V1-CURR, V1-META, V1-TRASHED, V1-NOVER, V2-HIST, V2-VERSLIST, V2-VERSN, V2-TRASHED, V2-NOVER) by the probe script, with sanitized request-line + status + body captures uploaded as the `gh-90-evidence` workflow artifact (API-1..API-3, NFR-3, TC-HIST-002..010).
- Cleanup: trash (soft-delete) as the floor — no purge probing from CI; cleanup mode recorded (TC-HIST-011, AC-NFR2-1).
- Artifact retrieval (`gh run download` → git-ignored `tmp/gh-90-spike/raw-artifacts/`), local four-sweep redaction verification, derivation of the evidence pack into `evidence/` with spec §5.1 naming, and the manifest (`evidence/README.md`) indexing every case → file → endpoint → status → result, plus the request ledger, cleanup mode, and CI provenance (run id, workflow file, executed commit SHA, date) (TC-HIST-012, AC-F6-1, NFR-1/NFR-6).
- Verdict determination and TDR-0011 authoring + registration row in `doc/decisions/00-index.md`, including the Amendment-1 operational note (local runs need a human-issued token, revoked 2026-08-15) and the CI-artifact evidence provenance (TC-HIST-013, AC-F7-1, AC-F7-2, DM-2, DM-3).
- Ticket-AC → evidence mapping recorded for the PR body; change-diff audit; execution-log population; spec reconciliation sign-off (TC-HIST-014, AC-NFR4-1).

### Out of Scope

- [OUT] Any `src/`, `tests/`, config, or `package.json` change — zero diffs by design, **no version bump** (spec NG-1, DEC-4, NFR-4) — with the **single CEO-waiver exception of Amendment 1**: the additive probe workflow + probe script on this spike branch (GH-32 precedent; no security controls removed). No OTHER `.github/`, `scripts/`, config, or code change.
- [OUT] Implementing the `resolve` flow, base-version capture, or the reverse converter (spec NG-2) — GH-90 only unblocks their design.
- [OUT] The MS3-E0-S2 in-process Mermaid spike (spec NG-3) and the MS-3 story file (NG-4).
- [OUT] Any mutation of sandbox or production content other than the probe's own page (NG-5); purge-permission probing — not attempted from CI at all (spec §7.3, RSK-4).
- [OUT] Wiring the probe into any recurring CI gate — it is a one-shot, spike-branch-only evidence capture (run-e2e.yml / ci.yml untouched).
- [OUT] Contract fixtures / mock-server wiring derived from the captures — deferred to the MS3-E2 implementation change (spec §7.3, test plan D-TST-1).
- [OUT] Editing frozen history — prior decision records (PDR-0002, TDR-0001, TDR-0010) and MS-0001 evidence are cited, never modified (NG-6).
- [OUT] Phase-7 doc reconciliation itself (`08-page-versions.md` extension, PDR-0002 TO-CONFIRM resolution link, roadmap outcome note) — flagged for `@doc-syncer`; the coder only lists the flags, never authors those edits (spec §7.1, pm-notes `doc_risks`).
- [OUT] Issue #90 body edits and PR creation — owned by the PM (lifecycle phases 10–11); the coder supplies the AC-evidence map.

### Constraints

- **Zero-code invariant (NFR-4, as amended by Amendment 1):** `git diff main --name-only | grep -E '^(src|tests)/'` must be empty and `package.json` untouched at every commit boundary; `.github/` gains EXACTLY ONE file (the probe workflow) and `scripts/` EXACTLY ONE (the probe script) — both CEO-waiver-authorized, additive, spike-branch-only. Any pressure toward any other code/config edit is an abort condition (A-3), not a task.
- **Secret discipline (NFR-1, RSK-3, as amended):** the E2E credential values exist only as GitHub Actions secrets → job env (mapping identical to `.github/workflows/run-e2e.yml` lines 48–53) → script memory. The workflow/script source references them only via `${{ secrets.* }}` / `process.env` — never as literals. The `Authorization` header value is computed in memory only — never printed, logged, or written to any file. Captures are sanitized as they are written (spec §20 contract); the in-script self-check hard-fails the run (pre-upload) on any token/email/`Authorization` occurrence; the local four sweeps (test plan §7) gate staging. Downloaded artifacts land only in git-ignored `tmp/gh-90-spike/raw-artifacts/`; committed `evidence/` files are swept **before** staging (test plan §6.3).
- **Redaction contract (spec §20, unchanged):** author identifiers (`accountId`/`authorId`/`version.by`) masked with stable placeholders (e.g., `«account-1»`) preserving presence, shape, and distinctness; emails redacted outright; numeric page/space IDs are not a redaction target.
- **Sandbox containment (NFR-2, DEC-3 as superseded by the CEO resolution):** writes are page-scoped to the probe's own disposable page inside the e2e sandbox space — create, version bumps, trash. Cleanup floor = trash (no purge from CI). Nothing else; the containment principle (TDR-0001 C-1 analog) is unchanged.
- **Request budget (NFR-5):** ≤ ~20 sequential API requests (expected 16–17: 3 writes + 8 pre-trash + 1 trash + 4–5 post-trash); enforced by the script's sequential structure; on a 429: back off, retry the single call, note it in the ledger (RSK-5).
- **Evidence-first ordering:** the trash step (TC-HIST-010) is irreversible for the fixture's live state — the script runs it only after every pre-trash capture is written to the output dir (test plan TC-HIST-010 precondition).
- **Trigger hygiene (Amendment 1):** the probe workflow triggers ONLY on pushes touching the workflow file or the probe script (`paths:` filter) — evidence, TDR, plan, and doc commits must never retrigger it (verified in task 1.22).
- **Decision-record conventions:** `doc/guides/decision-records-management.md` + TDR-0010 skeleton govern TDR-0011 (naming `TDR-0011-confluence-historical-version-api-spike.md`, flat `doc/decisions/`, front matter, section order, `status: Proposed` pre-merge).
- **Commit shape (TDR-0008):** Conventional Commits enforced by commitlint + husky; completion signals below are commit-message-shaped accordingly (commit A type `ci`, commit B type `docs`).

### Risks

From spec §11 and test plan §8.1 (full tables there); the delivery-critical subset:

- **RSK-3 / R-TST-1** — Redaction leak (token/email/auth header value in a committed artifact). Mitigated by capture discipline (headers never captured; sanitization at write time), the **in-script self-check that hard-fails the run before upload**, the four TC-HIST-012 local sweeps **before** staging, and reviewer re-check at review_fix. Residual: L.
- **RSK-4 / R-TST-4** — Purge endpoint unavailable or scope-uncertain. Mitigated (amended): no purge probing from CI at all — trash is the cleanup, recorded as such (TC-HIST-011). Residual: L.
- **RSK-5 / R-TST-5** — 429/throttle mid-capture. Mitigated: sequential, ~16–17 requests; back off and retry the single call; note in ledger. Residual: L.
- **RSK-6 / R-TST-3 (as amended)** — CI-side credential/env failure (missing secret, auth rejected, fixture write denied). Mitigated: abort A-1 — the E2E secrets were verified valid 2026-08-15 (`run-e2e.yml` run 31861445358), so failure means drift; record the gap per the TDR-0001 precedent; **never substitute mocked responses as evidence**. Residual: L.
- **R-TST-2** — Scratch files accidentally staged. Mitigated: everything lives under git-ignored `tmp/`; TC-HIST-014 asserts no `tmp/` path in the diff. Residual: L.
- **RSK-P1** (plan) — A sweep pattern false-negative/false-positive from unloaded env vars (`rg -F ""` matches everything). Mitigation: Task 1.18 asserts both vars non-empty before sweeping.
- **RSK-P2** (plan, Amendment 1) — Workflow misfire/retrigger: probe runs when it should not (evidence/TDR/plan/doc commits) or does not run on commit A. Mitigation: `paths:` filter limited to the workflow + script; task 1.15 asserts the run started on commit A; task 1.22 asserts commit B's push started nothing. A misfire is bounded (a fresh timestamped page is created+trashed; ≤ ~20 requests) but is recorded and the filter tightened. Residual: L.
- **RSK-P3** (plan, Amendment 1) — Artifact download failure (gh CLI issue, artifact unavailable). Mitigation: retry + `gh api`/web-UI fallback; artifacts are default-retained ~90 days; persistent failure → re-run the probe (re-push or post-merge dispatch); report to PM if it persists (nothing secret and nothing committed is at stake). Residual: L.
- **RSK-P4** (plan, Amendment 1) — CI queue latency delays evidence capture. Mitigation: `gh run watch`; the probe's dedicated `gh-90-probe` concurrency group guarantees it neither cancels nor queues behind nightly e2e (`e2e-sandbox` group); overlap with a nightly run is safe (disjoint timestamped scratch page). Residual: L.

**Risks during delivery (posture note):**

- **API drift is a finding, not a blocker** (RSK-1/RSK-2, R-TST-6): fresh captures are authoritative and supersede P5-05/P5-06; any delta vs the baseline or any v1-parameter surprise is captured as a limitation with its design consequence — the verdict scale (GO-with-limitations / NO-GO) absorbs it. The spike never "fails" on an unexpected API response; it records it. The probe script accordingly exits 0 whenever the matrix completed and the self-check passed, whatever the HTTP statuses were.
- **Trash/cleanup:** trash via `DELETE /wiki/rest/api/content/{id}` is the cleanup; no purge is attempted from CI (RSK-4) — the manifest records cleanup mode `trash` (AC-NFR2-1). A mid-run crash may leave the scratch page un-trashed — acceptable disposable sandbox residue, noted in the Execution Log; the next run uses a fresh timestamped page.
- **Request budget:** the ledger in the manifest tracks every request; if a retry pushes past ~20, note it — the budget is a politeness bound (NFR-5), not an AC, and a single noted 429-retry does not reopen the plan.

### Abort Criteria

On any trigger: **STOP, leave the tree clean, report to PM** with the command output. Do not improvise.

- **A-1 — Credential/permission failure (as amended):** the original local-instance FIRED 2026-08-15 (`tmp/marksync-demo/.env` token revoked — 403 on all requests; Execution Log phase 1) and was resolved by the CEO credential resolution. Current trigger: the probe run fails before any capture (missing env var, auth rejected, fixture create/update denied). STOP — never mock evidence (RSK-6); the gap is recorded by the PM per the TDR-0001 precedent.
- **A-2 — Secret already committed:** a redaction sweep hits **after** a phase commit (pre-commit hits are fixed in-place and re-swept — normal work). STOP and report immediately — this is secret-rotation territory, not a quiet amend.
- **A-3 — Scope pressure (as amended):** anything suggesting a `src/`/`tests/`/`package.json` edit, any `.github/` or `scripts/` change **beyond the two waiver-authorized files**, a write to content other than the probe's own page, or editing frozen history. STOP and report; never silently scope in (spec §7.2, NG-5, NG-6).

**Not an abort:** a §5.1 case that cannot be executed as specified (e.g., a route-level 404 on an endpoint form) — that is a captured finding the verdict scale absorbs; the spec needs no reopening for it (test plan §8.3). Also not an abort: a probe script/workflow bug or a self-check hit — fix, commit, push, re-run (tasks 1.15–1.16 loop; the stale run is auto-cancelled by the probe's concurrency group); and a local sweep hit **pre-stage** — fix the sanitizer and re-run the probe (nothing is committed yet; A-2 applies only post-commit).

**Rollback:** the spike is disposable by design — before any commit, `git restore`/delete the untracked workflow/script/`evidence/` files; the probe fixture is re-provisioned per run with a fresh timestamped title; the CI artifact is re-downloadable while retained. No code, config, or persisted product state is ever touched.

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| §5.1 matrix cases captured with redacted request + response evidence | 100% (10/10) | Spec §4.1, NFR-3, AC-F6-1 |
| CI probe run completed green (self-check passed) + artifact downloaded | 1 run (run id recorded in the manifest) | Amendment 1, TC-HIST-012 |
| Secrets (token / email / auth-header value) in any committed artifact | 0 (four sweeps, 0 matches each) | NFR-1, TC-HIST-012 |
| `src/` file changes in the change diff | 0 | NFR-4, AC-NFR4-1, TC-HIST-014 |
| Non-change-folder files added beyond the two waiver-authorized (workflow + script) | 0 | CEO waiver, TC-HIST-014 |
| Sandbox content created/modified other than the probe's own page | 0 | NFR-2, AC-NFR2-1 |
| TDR-0011 verdict recorded + evidence-linked + registered in `00-index.md` | 1 record + 1 index row | AC-F7-1, AC-F7-2, TC-HIST-013 |
| Cleanup mode recorded | recorded (`trash`) | AC-NFR2-1, TC-HIST-011 |
| Total API requests | ≤ ~20 (expected 16–17) | NFR-5, TC-HIST-001 ledger |
| Version bump | none (explicit no-op attestation) | DEC-4, TC-HIST-014 |

## Phases

> Three phases — a docs + one-shot-CI-probe spike: no scaffolding, integration, or post-review-fix phases apply (skip/merge per plan-writer contract). Phase 1 = "live verification & evidence capture" (TC-HIST-001..012), **amended 2026-08-15** to execute via the CI probe (tasks 1.12–1.22 supersede 1.3–1.11); Phase 2 = analysis + TDR-0011 (TC-HIST-013); Phase 3 = finalize — ticket-AC evidence map, diff audit, reconciliation (TC-HIST-014). The PM checkpoints around each phase; Phase 1 ends in two commits (A: workflow + script — triggers the probe run; B: evidence pack), Phases 2–3 one commit each. Scratch (downloaded artifacts, sweep proof, syntax-check output) lives in `tmp/gh-90-spike/` (git-ignored, verified) — **never staged**; `evidence/` holds only sanitized captures + the manifest. The only committed executable/tooling files are the two CEO-waiver-authorized additions (probe workflow + probe script).

### Phase 1: Live verification & evidence capture (AMENDED — CI probe vehicle)

**Goal**: Via the CEO-waiver-authorized CI probe, provision the disposable fixture in the e2e sandbox space, execute the full spec §5.1 case matrix (pre-trash, trash, post-trash), clean up, and land a complete, sanitized, manifest-indexed evidence pack with CI provenance in `evidence/` — proving (or refuting, as a finding) fetch-body-at-version-N on both API forms. Implements F-1, F-2, F-4, F-5, F-6; satisfies TC-HIST-001..012; sets up AC-F1-1, AC-F2-1, AC-F4-1, AC-F5-1, AC-F6-1, AC-NFR2-1.

> **AMENDMENT 1 — 2026-08-15. Authority: CEO credential resolution** (issue #90 comment 5300646430; pm-notes `decisions`, "CEO-AUTHORIZED CREDENTIAL RESOLUTION"; PM reopened `delivery_planning`). Facts: the local `tmp/marksync-demo/.env` token is **revoked** (403; tasks 1.1–1.2 completed, blocker documented in the Execution Log); the repo's GitHub Actions E2E secrets are **valid** (`run-e2e.yml` success 2026-08-15T03:18Z, run 31861445358). **CEO WAIVER**: exactly ONE additive workflow file + its probe script, on this spike branch ONLY (GH-32 precedent; no security controls removed). Tasks 1.3–1.11 (local curl) are **SUPERSEDED** by tasks 1.12–1.22; tasks 1.1–1.2 remain complete as history. Authorized deviations from the test plan's mechanics (matrix, redaction contract, and verdict scale UNCHANGED): D-TST-2's "nothing executable is committed" — the probe script MUST be committed so CI can check it out from the repo; §6.1/§7's local `.env` sourcing for captures — secrets now enter via Actions env, and local sweeps 1–2 cover the locally known literals while the E2E secret values are checked by the in-script self-check inside CI (where the values exist).

**Superseded tasks (retained for history — DO NOT EXECUTE; verbatim originals: `git show 46abd56:doc/changes/2026-08/2026-08-15--GH-90--historical-version-api-spike/chg-GH-90-plan.md`):**

- ~~**1.3** TC-HIST-001 — local-curl fixture provisioning (POST/PUT ×3, scratch notes, ledger start)~~ → SUPERSEDED by **1.13** steps 1–2 (same fixture spec, executed in CI).
- ~~**1.4** TC-HIST-002..005 — local pre-trash v1 captures (V1-HIST-v2 / V1-CURR / V1-META-v2 / V1-NOVER)~~ → SUPERSEDED by **1.13** step 3 (v1 cases) + **1.17–1.19** (retrieval/derivation).
- ~~**1.5** TC-HIST-006..009 — local pre-trash v2 captures (V2-HIST-v2 / V2-VERSLIST / V2-VERSN-2 / V2-NOVER)~~ → SUPERSEDED by **1.13** step 3 (v2 cases) + **1.17–1.19**.
- ~~**1.6** TC-HIST-010 — local trash phase + post-trash captures (4 + optional probe)~~ → SUPERSEDED by **1.13** step 4.
- ~~**1.7** TC-HIST-011 — local cleanup decision + cleanup-mode recording~~ → SUPERSEDED by **1.13** step 4 (trash-only, recorded) + **1.20** (manifest).
- ~~**1.8** TC-HIST-012 derivation half — manual redaction/derivation of `evidence/*.json` + manifest~~ → SUPERSEDED by **1.13** step 5 (in-script sanitization at write time) + **1.19–1.20**.
- ~~**1.9** TC-HIST-012 sweep half — local four-grep sweep with env guard + zero-hit proof~~ → SUPERSEDED by **1.18** + **1.21** (same four sweeps, over CI-artifact-derived files).
- ~~**1.10** evidence completeness verification (manifest 10/10, JSON validity, ledger ≤ ~20)~~ → SUPERSEDED by **1.21**.
- ~~**1.11** commit `evidence/**` only~~ → SUPERSEDED by **1.22** (commit B; commit A in **1.15** carries the workflow + script).

**Tasks** (1.1–1.2 completed pre-blocker; 1.12–1.22 are the live procedure):

- [x] **1.1** Preconditions: on branch `docs/GH-90/historical-version-api-spike`; `tmp/marksync-demo/.env` and `tmp/marksync-demo/marksync.yml` exist; `git check-ignore tmp/gh-90-spike` resolves via `.gitignore:49` (`tmp/`). Create the scratch dir: `mkdir -p tmp/gh-90-spike`. Read `spaceKey` (and `parentPageId` if the fixture needs a parent) from `marksync.yml` — runtime only, never hardcoded into a committed artifact. (TC-HIST-001 preconditions) — VERIFIED: branch correct, files exist, scratch dir created, spaceKey=39223300, parentPageId=39223464
- [x] **1.2** Session setup — creds in shell memory only (test plan §7):

  ```bash
  set -a; source tmp/marksync-demo/.env; set +a
  [ -n "$MARKSYNC_API_TOKEN" ] && [ -n "$MARKSYNC_USER_EMAIL" ] && [ -n "$MARKSYNC_CONFLUENCE_BASE_URL" ] || echo "ABORT A-1: creds incomplete"
  AUTH="Authorization: Basic $(printf '%s:%s' "$MARKSYNC_USER_EMAIL" "$MARKSYNC_API_TOKEN" | base64)"
  ```

  Never echo `$AUTH`, never write it to any file; curl `-H` flags are not echoed into captures. Failure here → **abort A-1**. — ATTEMPTED: creds load successfully (AUTH header length 312 chars), but API returns 403 "Current user not permitted to use Confluence" for both GET and POST requests. **BLOCKER A-1 TRIGGERED**. — RESOLVED 2026-08-15 by the CEO credential resolution (Amendment 1): local token revoked; capture vehicle moved to CI (tasks 1.12–1.22). This task is NOT re-executed.
- [ ] **1.12** Author the probe workflow `.github/workflows/gh-90-historical-probe.yml` — the single CEO-waiver-authorized additive workflow (spike branch only, GH-32 precedent, no security controls removed; `ci.yml`/`run-e2e.yml` untouched). Shaping constraints: `workflow_dispatch` alone cannot work pre-merge (GitHub offers dispatch only for workflows on the default branch, which the waiver forbids) → primary trigger is `on: push` scoped to this branch AND a `paths:` filter limited to the workflow file + the probe script, so evidence/TDR/plan commits never retrigger it; `workflow_dispatch` is ALSO declared (harmless pre-merge; enables manual post-merge re-runs of the same job). Reuse repo conventions: `actions/checkout@v4`, `oven-sh/setup-bun@v2` with `bun-version: "1.2.23"`, `actions/upload-artifact@v4`; env mapping exactly as `.github/workflows/run-e2e.yml` lines 48–53. No `bun install` (zero-dep script). Upload runs only on job success (default) — a sanitization self-check failure must NOT upload anything. Concurrency: dedicated group `gh-90-probe` with `cancel-in-progress: true` — do NOT join `run-e2e.yml`'s `e2e-sandbox` group (the probe must never cancel or queue behind nightly e2e; a separate group confines cancellation to stale probe re-runs; overlap with a nightly run is safe because the probe touches only its own timestamped page). Content:

  ```yaml
  name: GH-90 historical-version probe (spike)
  # CEO-waiver-authorized additive probe (issue #90 comment 5300646430, GH-32
  # precedent): spike-branch-only evidence capture for GH-90. Additive only —
  # no security controls removed; ci.yml / run-e2e.yml untouched.
  on:
    push:
      branches: [docs/GH-90/historical-version-api-spike]
      paths:
        - .github/workflows/gh-90-historical-probe.yml
        - scripts/gh-90-historical-probe.mjs
    workflow_dispatch: {} # usable only once this file reaches the default branch (post-merge re-runs)

  concurrency:
    # NOT the e2e-sandbox group: the probe must never cancel or queue behind
    # nightly e2e. cancel-in-progress cancels only this probe's stale re-runs.
    group: gh-90-probe
    cancel-in-progress: true

  jobs:
    probe:
      name: Historical-version matrix capture (spec §5.1)
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4

        - uses: oven-sh/setup-bun@v2
          with:
            bun-version: "1.2.23"

        - name: Run probe (zero-dependency — no install step)
          run: bun scripts/gh-90-historical-probe.mjs
          env:
            MARKSYNC_E2E_CONFLUENCE_BASE_URL: ${{ secrets.E2E_CONFLUENCE_BASE_URL }}
            MARKSYNC_E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
            MARKSYNC_E2E_API_TOKEN: ${{ secrets.E2E_API_TOKEN }}
            MARKSYNC_E2E_SPACE_KEY: ${{ secrets.E2E_SPACE_KEY }}
            MARKSYNC_E2E_PARENT_PAGE_ID: ${{ secrets.E2E_PARENT_PAGE_ID }}

        - uses: actions/upload-artifact@v4
          with:
            name: gh-90-evidence
            path: gh-90-evidence/
  ```
- [ ] **1.13** Author `scripts/gh-90-historical-probe.mjs` — zero-dependency Bun script (Bun/Node stdlib only: global `fetch`, `node:fs`; NO package.json imports → no `bun install`). It MUST be committed (CI checks it out from the repo — CEO-resolution supersession of test-plan D-TST-2's "nothing executable is committed"; `.mjs` so Bun executes it directly; `scripts/` is the repo's internal-automation home). Required behavior, in order:
  1. **Env contract**: read `MARKSYNC_E2E_CONFLUENCE_BASE_URL`, `MARKSYNC_E2E_USER_EMAIL`, `MARKSYNC_E2E_API_TOKEN`, `MARKSYNC_E2E_SPACE_KEY`, `MARKSYNC_E2E_PARENT_PAGE_ID`; missing/empty → print which variable (never its value) and exit non-zero. Basic-auth header computed in memory only; never printed, logged, or written.
  2. **Fixture (TC-HIST-001, 3 requests)**: create ONE page via `POST /wiki/rest/api/content` — type `page`, title `GH-90 spike fixture <YYYYMMDD-HHMMSS>` (run timestamp → collision-safe), space from `MARKSYNC_E2E_SPACE_KEY`, parent `MARKSYNC_E2E_PARENT_PAGE_ID`, body `<p>GH-90 spike fixture — body v1 (synthetic)</p>`; bump to v2 and v3 via `PUT /wiki/rest/api/content/{id}` with distinct bodies (`…body v2…`, `…body v3…`) and `version: {number: n, message: "GH-90 spike bump vn"}`. Create/update failure → hard exit with a clear log line (nothing to verify — CI-side A-1 analog; report to PM).
  3. **Matrix (TC-HIST-002..009, 8 requests; spec §5.1 is the case authority)**: sequentially issue and capture: `V1-HIST-v2` = `GET /wiki/rest/api/content/{id}?status=historical&version=2&expand=body.storage`; `V1-CURR` = `…?status=current&expand=body.storage`; `V1-META-v2` = `…?status=historical&version=2&expand=version` (combined `expand=body.storage,version` may substitute); `V1-NOVER` = `…?status=historical&version=99&expand=body.storage`; `V2-HIST-v2` = `GET /wiki/api/v2/pages/{id}?version=2&body-format=storage`; `V2-VERSLIST` = `GET /wiki/api/v2/pages/{id}/versions?body-format=storage`; `V2-VERSN-2` = `GET /wiki/api/v2/pages/{id}/versions/2`; `V2-NOVER` = `GET /wiki/api/v2/pages/{id}?version=99&body-format=storage`. A non-2xx is a FINDING, not a failure — capture and continue (RSK-1/RSK-2 posture).
  4. **Trash + post-trash (TC-HIST-010/011, 5–6 requests)**: `DELETE /wiki/rest/api/content/{id}` (soft-delete) — only after every pre-trash capture is written; then capture `V1-TRASHED-hist` (v1 historical re-fetch), `V1-TRASHED-curr` (v1 current re-fetch), optional `V1-TRASHED-probe` (v1 `status=trashed` — capture or note either way), `V2-TRASHED-hist` (v2 `?version=2&body-format=storage`), `V2-TRASHED-curr` (`GET /wiki/api/v2/pages/{id}`). Cleanup mode = `trash` (no purge probing from CI — RSK-4); recorded.
  5. **Capture write (NFR-3/NFR-6)**: each capture is sanitized AS IT IS WRITTEN to `gh-90-evidence/<Case>.json` (spec §5.1 naming) with the envelope `{ "case", "request": { "method", "path" }, "status", "sanitizedBody" }` — request headers are never captured. Sanitization: strip any auth material; mask `accountId`/`authorId`/`version.by` values as stable placeholders (`«account-1»`, distinctness preserved); redact emails outright (spec §20). Also write `gh-90-evidence/ledger.json` (per-request ledger: method + path + status; total count vs the ≤ ~20 budget; any 429/backoff notes) and `gh-90-evidence/provenance.json` (`GITHUB_RUN_ID`, `GITHUB_SHA`, UTC run date, cleanup mode, fixture title).
  6. **Self-check (NFR-1, hard gate BEFORE upload)**: after all writes, re-read EVERY file under `gh-90-evidence/` and hard-fail (exit non-zero → the upload step is skipped) if any file contains the token value, the email value, or the literal string `Authorization`. Progress lines to stdout carry case name + HTTP status only (never bodies, never env values).
  7. **Budget/politeness (NFR-5)**: sequential requests; ≤ ~20 total (expected 16–17); on 429: back off, retry the single call, record it in the ledger. Exit 0 when the matrix completed and the self-check passed, whatever the HTTP statuses were.
- [ ] **1.14** Local static validation (no network): (a) YAML parses — `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/gh-90-historical-probe.yml'))"` (same check `ci.yml`'s doc-yaml-lint job applies); (b) script transpiles — `bun build --target=bun --outdir tmp/gh-90-spike/syntax-check scripts/gh-90-historical-probe.mjs` (works without `bun install` iff truly zero-dep); (c) zero-dep proof — `grep -E "from ['\"]" scripts/gh-90-historical-probe.mjs` shows only `node:`-prefixed/builtin imports; (d) `gh auth status` is authenticated (needed for 1.15–1.17).
- [ ] **1.15** **Commit A** — commit exactly `.github/workflows/gh-90-historical-probe.yml` + `scripts/gh-90-historical-probe.mjs` with message `ci(GH-90): add historical-version probe workflow + script (CEO waiver, spike branch)`; push the branch. The push hits the `paths:` filter → the probe run auto-triggers. Confirm: `gh run list --workflow gh-90-historical-probe.yml --limit 1` shows a run for this commit SHA; record the run id. No run triggered → misfire: verify the branch/paths filters before proceeding (RSK-P2).
- [ ] **1.16** Watch the run to completion: `gh run watch <run-id> --exit-status`. Outcomes: **success** → proceed to 1.17. **Failure on the sanitization self-check** → the artifact was correctly NOT uploaded; fix the sanitizer in the script, commit (`ci(GH-90): fix probe sanitization …`), push (retriggers; the `gh-90-probe` concurrency group cancels the stale run), repeat 1.16. **Failure on env/fixture (CI-side A-1 analog)** → the E2E secrets were verified valid 2026-08-15 (run 31861445358); failure means drift → **abort A-1** (report to PM; never mock). **Failure on a script/workflow bug** → fix, commit, push, repeat 1.16. A mid-run crash may leave the scratch page un-trashed — acceptable disposable residue; note it in the Execution Log.
- [ ] **1.17** Download the artifact: `gh run download <run-id> --name gh-90-evidence --dir tmp/gh-90-spike/raw-artifacts` (git-ignored). Verify contents: 12 case captures (+ optional `V1-TRASHED-probe.json`) + `ledger.json` + `provenance.json`; every file parses as JSON. Download failure → retry; still failing → `gh api` / web-UI fallback; artifact genuinely unavailable → re-run the probe (re-push, or post-merge dispatch); if it persists, report to PM (RSK-P3 — nothing secret and nothing committed is at stake).
- [ ] **1.18** TC-HIST-012 (sweep half, local, part 1 — over the downloaded artifacts) with the env guard (both vars non-empty — `rg -F ""` matches everything):

  ```bash
  set -a; source tmp/marksync-demo/.env; set +a
  [ -n "$MARKSYNC_API_TOKEN" ] && [ -n "$MARKSYNC_USER_EMAIL" ] || echo "ABORT: sweep literals unavailable"
  rg -F "$MARKSYNC_API_TOKEN"  tmp/gh-90-spike/raw-artifacts/   # expect: no matches
  rg -F "$MARKSYNC_USER_EMAIL" tmp/gh-90-spike/raw-artifacts/   # expect: no matches
  rg -n 'Authorization|Basic [A-Za-z0-9+/=]{8,}' tmp/gh-90-spike/raw-artifacts/   # expect: no matches
  rg -n '[0-9a-f]{32}' tmp/gh-90-spike/raw-artifacts/            # expect: no matches (accountIds masked)
  ```

  **Dual-layer note (recorded in the manifest):** sweeps 1–2 cover the locally known `tmp/marksync-demo/.env` literals (revoked 2026-08-15 but still never-commit values); the E2E_* secret values are not locally readable — their authoritative check is the in-script self-check (1.13 step 6) that gated the upload inside CI. Save the commands + empty outputs to `tmp/gh-90-spike/sweep-proof.txt` (cited in the Execution Log). A hit → do NOT copy to `evidence/`: fix the sanitizer (1.13 step 5), re-run the probe (1.15–1.16), re-download, re-sweep.
- [ ] **1.19** Copy the sanitized captures into `evidence/` 1:1 (files already carry spec §5.1 naming): `cp tmp/gh-90-spike/raw-artifacts/*.json <EV>/evidence/` with `EV="doc/changes/2026-08/2026-08-15--GH-90--historical-version-api-spike"`, renaming `ledger.json` → `evidence/ci-ledger.json` and `provenance.json` → `evidence/ci-provenance.json` (their content is also folded into the manifest; keeping them preserves raw CI provenance). Spot-check every file opens as valid JSON.
- [ ] **1.20** Write `evidence/README.md` (manifest): every §5.1 case → file → endpoint form → HTTP status → one-line result; the request ledger (from `ci-ledger.json`: total vs NFR-5, any 429/backoff notes); the cleanup mode (`trash`); **CI provenance** — run id, workflow file path, executed commit SHA, run date (from `ci-provenance.json`); the dual-layer sanitization proof (in-script self-check gated the upload + local four-sweep zero-hit); and the Amendment-1 note that the capture vehicle is the CI probe because the local token was revoked 2026-08-15. **Authoring caution** (DoR iter-1 finding): the manifest and captures must not contain the literal strings the sweep patterns match (e.g., write "auth header (never captured)", not the header name, and no `Basic …` blobs) — or the TC-HIST-012 sweep 3 will hit.
- [ ] **1.21** Evidence completeness verification + pre-stage sweeps: the manifest indexes 10/10 matrix cases (NFR-3); every capture parses as JSON with the `{case, request: {method, path}, status, sanitizedBody}` envelope (NFR-6); file count = 12 captures (+ optional probe) + `ci-ledger.json` + `ci-provenance.json` + `README.md`; ledger total ≤ ~20. Then re-run ALL FOUR test-plan §7 sweeps over `"$EV" doc/decisions/` (the 1.18 commands with `$EV` populated — TDR not yet present in Phase 1, so sweeps 1–2 effectively cover `evidence/` + change-folder docs): zero hits each; append to `tmp/gh-90-spike/sweep-proof.txt`. A hit → fix before staging; a hit after commit → **abort A-2**.
- [ ] **1.22** **Commit B** — stage `evidence/**` only; assert `git status` shows no `tmp/` path staged (R-TST-2) and nothing outside `evidence/` in this commit. Commit message: `docs(GH-90): capture historical-version API spike evidence via CI probe (10-case matrix, redacted)`. Push — this push MUST NOT retrigger the probe (the `paths:` filter excludes `evidence/` and `doc/`): verify via `gh run list --workflow gh-90-historical-probe.yml --limit 1` that no new run started (RSK-P2 misfire check). A retrigger anyway → not data-corrupting (a fresh disposable page would be created + trashed) but report it and tighten the paths filter.

**Acceptance Criteria**:

- Must: the probe run completed green (self-check passed) and its artifact was downloaded; all 10 §5.1 cases captured with request line + status + body, manifest-indexed (AC-F6-1, NFR-3, TC-HIST-012).
- Must: four local redaction sweeps return 0 matches over the downloaded artifacts AND over `evidence/` pre-stage; zero-hit proof captured (NFR-1, RSK-3).
- Must: exactly one scratch page created in the e2e sandbox space (timestamped title), trashed at end; cleanup mode recorded in the manifest (AC-NFR2-1, NFR-2, TC-HIST-011).
- Must: request ledger total ≤ ~20 (NFR-5); 429s and retries noted.
- Must: the only non-change-folder additions in the branch diff are the two waiver-authorized files (probe workflow + probe script).
- Should: optional `status=trashed` probe attempted or explicitly noted as skipped (TC-HIST-010 step 4).

**Files and modules**:

- Code areas: two CEO-waiver-authorized additions — `.github/workflows/gh-90-historical-probe.yml` (new), `scripts/gh-90-historical-probe.mjs` (new, zero-dependency). Zero `src/`/`tests/` by design; `package.json` untouched (NFR-4). New artifacts: `evidence/*.json` (12 + optional probe + `ci-ledger.json` + `ci-provenance.json`), `evidence/README.md` (manifest). Scratch (never committed): `tmp/gh-90-spike/` — `raw-artifacts/`, sweep proof, syntax-check output (D-TST-2 as amended by the waiver).
- System docs: none (phase-7 reconciliation targets are `@doc-syncer`'s, not this phase's).

**Tests**:

- TC-HIST-001 (fixture + ledger), TC-HIST-002..010 (matrix captures), TC-HIST-011 (cleanup recording), TC-HIST-012 (sweep + manifest completeness) — one-shot live verifications executed by the CI probe per the test plan §5.2 procedures (vehicle amended per Amendment 1; per-case steps, §6.3 redaction discipline, §7 sweep commands otherwise apply as written).

**Completion signal**: two commits — `ci(GH-90): add historical-version probe workflow + script (CEO waiver, spike branch)` (commit A, triggers the probe run) and `docs(GH-90): capture historical-version API spike evidence via CI probe (10-case matrix, redacted)` (commit B, evidence pack).

---

### Phase 2: Verdict determination + TDR-0011 + index registration

**Goal**: Assess the captured findings against the pre-committed verdict scale and record the durable verdict as TDR-0011 — verdict, per-form findings, limitations each with its design consequence, the base-version-capture consequence (snapshot fallback on NO-GO or any material limitation), evidence links, revisit triggers — registered in the decision index. Implements F-7, DM-2, DM-3; satisfies TC-HIST-013; sets up AC-F7-1, AC-F7-2.

**Tasks**:

- [ ] **2.1** Determine the verdict from the manifest + assessments, exactly per the spec §5.1 scale (DEC-5 — no verdict-shopping):
  - **GO** — at least one API form returns the exact version-N Storage body for a current (non-deleted) page, freshly verified; no material caveats.
  - **GO-with-limitations** — base case works but with material caveats (only one form works; trashed-page semantics constrain a `resolve` edge; metadata gaps) — **each limitation named with its design consequence**.
  - **NO-GO** — no form returns the version-N body; PDR-0002 revisit trigger #3 applies: snapshot the base body in the committed lock / disposable cache at publish time.
  Assemble the per-form findings tables the TDR consumes: v1 historical (incl. whether `version={n}` was honored at all — RSK-2), v2 historical/list/single (incl. the P5-05/P5-06 agreement/delta statement from TC-HIST-006/007), trashed behavior per form (TC-HIST-010), metadata availability per endpoint (TC-HIST-004/007/008 → AC-F3-1's available/not-available table), error contracts (TC-HIST-005/009).
- [ ] **2.2** Author `doc/decisions/TDR-0011-confluence-historical-version-api-spike.md` per repo decision-record conventions (`doc/guides/decision-records-management.md` + the TDR-0010 skeleton; delegate the record-writing to `@decision-advisor` per the repo decision flow if available, supplying the Phase-1 findings + verdict — otherwise author directly). Required content: front matter (`id: TDR-0011`, `decision_type: tdr`, `status: Proposed`, `created/last_updated: 2026-08-15`, `decision_date: null`, summary, owners, service, `decision_scope: repo`, classification, governance, `ai_assistance`, `revisit_triggers` — e.g., Atlassian deprecating the v1 `status=historical` form or the v2 `version` parameter — and `links.related_changes: ["GH-90"]`, `links.spec` → this change's spec, `links.decisions` → PDR-0002/TDR-0001/TDR-0010); sections in TDR-0010 order (Context, Problem Framing, Constraints, Decision Drivers, Evidence/Assumptions & Unknowns, Alternatives Considered — the verdict options, Decision — verdict + Implementation + Consequences incl. the snapshot-in-lock/cache fallback on NO-GO **or** any material limitation, Risks, Revision History, Appendix citing the evidence). Every evidence file is linked with a resolving relative path. **Amendment 1 additions (required):** (a) a **non-blocking operational note** that LOCAL runs (`tmp/marksync-demo/.env`) need a human-issued token — the standing token was revoked as of 2026-08-15, which moved evidence capture to CI; (b) an **evidence-provenance statement**: captures originate from the CI probe workflow's artifact — cite the run id, workflow file, executed commit SHA, and date (from `evidence/ci-provenance.json`/the manifest) alongside the evidence-file links, naming the dual-layer sanitization proof (in-script self-check + local four-sweep zero-hit). **Phrasing caution** (DoR iter-1 finding): write "auth header (never captured)" — never the literal header name or any `Basic …` blob — so the TC-HIST-012 sweep 3 stays zero-hit over the TDR.
- [ ] **2.3** Register TDR-0011 in `doc/decisions/00-index.md`: one table row after TDR-0010, mirroring the TDR-0010 row shape — `| [TDR-0011](./TDR-0011-confluence-historical-version-api-spike.md) | TDR | <title matching the record> | Proposed | 2026-08-15 | Juliusz Ćwiąkalski |` (status flips to Accepted at merge per the lifecycle, as with prior records).
- [ ] **2.4** TDR lint: the front matter parses as valid YAML; `id`/`decision_type`/`status` match the index row; the verdict string is exactly one of `GO` / `GO-with-limitations` / `NO-GO`; on NO-GO or any material limitation, the snapshot fallback is explicitly named with its design consequence; the Amendment-1 operational note (local-token) and CI provenance statement are present; every evidence link and index link resolves (`test -f` each target).
- [ ] **2.5** Re-run redaction sweeps 1–3 with TDR-0011 now in place (the test plan's sweep commands already target `doc/decisions/` and `doc/decisions/TDR-0011*`): 0 matches each; append to the zero-hit proof. A hit → fix before staging; post-commit hit → **abort A-2**.
- [ ] **2.6** Commit `doc/decisions/TDR-0011-confluence-historical-version-api-spike.md` + the `00-index.md` row.

**Acceptance Criteria**:

- Must: verdict is exactly one of the pre-committed scale; NO-GO or any material limitation explicitly names the base-version-capture consequence (fallback: snapshot base body in lock/cache) (AC-F7-1, DEC-5).
- Must: TDR-0011 links its evidence files (all resolving) with the CI provenance statement (run id + workflow + commit SHA + date) and the local-token operational note, and a row exists in `doc/decisions/00-index.md` (AC-F7-2, DM-2, DM-3).
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

**Goal**: Prove the change surgical (zero `src/`/`tests/`/`package.json` diffs; only the two waiver-authorized additions outside the change folder; no scratch staged), map the captured evidence to the four ticket ACs for the PR body (issue-body edits stay with the PM), populate the execution logs, and sign off the spec AC-by-AC with the explicit no-version-bump attestation. Satisfies TC-HIST-014; ratifies all ACs.

**Tasks**:

- [ ] **3.1** TC-HIST-014 — change-diff audit (semi-automated):

  ```bash
  git diff main --stat                                        # change-folder docs + evidence + TDR + index row + the two waiver files only
  git diff main --name-only | grep -E '^(src|tests)/'         # expect: no matches (NFR-4)
  git diff main --name-only | grep -E '^tmp/'                 # expect: no matches (R-TST-2)
  git diff main --name-only | grep -E '^\.github/'            # expect: exactly gh-90-historical-probe.yml (waiver)
  git diff main --name-only | grep -E '^scripts/'             # expect: exactly gh-90-historical-probe.mjs (waiver)
  git diff main -- package.json                               # expect: empty (no version bump, DEC-4)
  ```

  Assert the changed-file set is exactly: this change folder's docs + `evidence/**` + `doc/decisions/TDR-0011-*` + the `00-index.md` row + `.github/workflows/gh-90-historical-probe.yml` + `scripts/gh-90-historical-probe.mjs` (the two CEO-waiver-authorized additions). Anything else → investigate; additions beyond the two waiver files → **abort A-3**.
- [ ] **3.2** Record the ticket-AC → evidence mapping for the PM's PR body (do **not** edit issue #90 — PM owns tracker writes):

  | Ticket AC | Spec ACs | Evidence |
  |-----------|----------|----------|
  | AC-1 — ≥3 version states (historical N, current, deleted/edge), both forms | AC-F1-1, AC-F2-1, AC-F4-1, AC-F5-1 | `V1-HIST-v2.json`, `V1-CURR.json`, `V2-HIST-v2.json`, `V1/V2-TRASHED-*.json`, `V1/V2-NOVER.json` + manifest results |
  | AC-2 — version metadata availability documented | AC-F3-1 | `V1-META-v2.json`, `V2-VERSLIST.json`, `V2-VERSN-2.json` + TDR-0011 per-endpoint findings table |
  | AC-3 — limitations + verdict with consequences (fallback: snapshot base body in lock/cache) | AC-F7-1 | TDR-0011 Decision + Consequences |
  | AC-4 — TDR created with evidence links | AC-F6-1, AC-F7-2 | TDR-0011 evidence links + CI provenance, `00-index.md` row, `evidence/README.md` manifest |

  Store the table (with one-line results per AC) in this plan's Execution Log notes for phase 10/11 consumption.
- [ ] **3.3** Populate the test plan's §10 Test Execution Log — one row per TC-HIST-001..014 (run date, result, notes; cite the CI run id for TC-HIST-001..010, the zero-hit sweep proof for TC-HIST-012, and the diff-audit outputs for TC-HIST-014) — and this plan's Execution Log below.
- [ ] **3.4** Spec reconciliation sign-off: walk spec §17 AC-by-AC against the delivered state — AC-F1-1 (V1-HIST capture + TDR finding), AC-F2-1 (V2-HIST capture + P5-06 agreement/delta), AC-F3-1 (metadata table), AC-F4-1 (post-trash captures + TDR documentation), AC-F5-1 (NOVER contracts), AC-F6-1 (manifest + 0-secret sweep), AC-F7-1 (verdict per scale + consequence), AC-F7-2 (evidence links + index row), AC-NFR2-1 (containment + cleanup mode), AC-NFR4-1 (zero `src/` + no bump) — record PASS/status for each in the Execution Log.
- [ ] **3.5** No-version-bump attestation (final-phase contract, satisfied by explicit no-op): `version_impact: none` — `git diff main -- package.json` is empty (verified in 3.1) and **no bump is performed** (spec DEC-4: no shipped-code change exists to version or release). Record the attestation in the Execution Log.
- [ ] **3.6** Should — early quality-gate confidence: run `bun run check` once (expected green; the authoritative gate run is lifecycle phase 9 by `@runner` — an unchanged regression net carrying no AC evidence, test plan §4). The probe script lives outside `src/` and is zero-dep; if a lint/format gate covers `scripts/**` and flags it, fixing the script is in-scope normal work (a re-push retriggers the probe — acceptable re-validation). A failure in the code gates on a zero-`src/`-diff → **abort A-3** (something leaked into code).
- [ ] **3.7** Commit the change-folder log updates (this plan's Execution Log + test plan §10 rows + the AC-evidence map).

**Acceptance Criteria**:

- Must: surgical diff — zero `src/`/`tests/`/`package.json` changes; `.github/` and `scripts/` carry exactly the two waiver-authorized additive files (probe workflow + probe script); no `tmp/` path staged (AC-NFR4-1, NFR-4, TC-HIST-014).
- Must: ticket-AC → evidence mapping recorded for the PR body; no issue-body edits made by the coder.
- Must: both execution logs populated (test plan §10; this plan) including the spec §17 AC-by-AC sign-off and the no-version-bump attestation.
- Should: `bun run check` green pre-commit (phase-9 preview).

**Files and modules**:

- Code areas: none.
- System docs: none authored by the coder — phase-7 reconciliation flags handed to `@doc-syncer`: (a) `doc/inception/integration-scenarios/08-page-versions.md` extension (v1 form, deleted behavior, fresh-evidence pointers), (b) PDR-0002 TO-CONFIRM resolution link (frozen history — linked, never rewritten), (c) possible `doc/overview/02-roadmap.md` outcome note (pm-notes `doc_risks`; spec §7.1).

**Tests**:

- TC-HIST-014 (change-diff audit) per test plan §5.2/§7 commands (extended with the two waiver-file assertions above).

**Completion signal**: `docs(GH-90): finalize spike — ticket-AC evidence map, execution logs, reconciliation`

---

## Test Scenarios

All 14 TC-HIST scenarios from the test plan §5.1, mapped to phases and ACs (one-shot live verifications + artifact checks; no CI test tier applies — spec Appendix A, test plan §4). **Vehicle note (Amendment 1):** TC-HIST-001..012 execute via the CI probe (tasks 1.12–1.22, superseding tasks 1.3–1.11); the per-case procedures, §6.3 redaction discipline, and §7 sweep commands of the test plan otherwise apply as written — the sweeps run locally over the downloaded artifacts and the derived `evidence/` files.

| TC ID | Scenario | Phase | AC Coverage |
|-------|----------|-------|-------------|
| TC-HIST-001 | Fixture provisioning: one disposable page at ≥3 distinct-body versions | 1 (Task 1.13 steps 1–2, run via 1.15–1.16; supersedes 1.3) | AC-NFR2-1 (setup), NFR-2, NFR-5 |
| TC-HIST-002 | V1-HIST: v1 historical fetch at non-current version N=2 | 1 (Task 1.13 step 3; evidence via 1.17–1.19; supersedes 1.4) | AC-F1-1 |
| TC-HIST-003 | V1-CURR: v1 current-state baseline fetch | 1 (Task 1.13 step 3; supersedes 1.4) | AC-F1-1 (baseline), NFR-3 |
| TC-HIST-004 | V1-META: v1 metadata expand (version.by/when/message) | 1 (Task 1.13 step 3; supersedes 1.4) | AC-F3-1 |
| TC-HIST-005 | V1-NOVER: v1 fetch of nonexistent version 99 | 1 (Task 1.13 step 3; supersedes 1.4) | AC-F5-1 |
| TC-HIST-006 | V2-HIST: v2 historical fetch, fresh re-validation vs P5-06 | 1 (Task 1.13 step 3; supersedes 1.5) | AC-F2-1 |
| TC-HIST-007 | V2-VERSLIST: v2 versions list, inline bodies, newest-first | 1 (Task 1.13 step 3; supersedes 1.5) | AC-F2-1, AC-F3-1 |
| TC-HIST-008 | V2-VERSN: v2 single-version metadata | 1 (Task 1.13 step 3; supersedes 1.5) | AC-F3-1 |
| TC-HIST-009 | V2-NOVER: v2 fetch of nonexistent version 99 | 1 (Task 1.13 step 3; supersedes 1.5) | AC-F5-1 |
| TC-HIST-010 | Trash phase: post-trash historical + current fetches, both forms | 1 (Task 1.13 step 4; supersedes 1.6) | AC-F4-1 |
| TC-HIST-011 | Cleanup and cleanup-mode recording | 1 (Tasks 1.13 step 4 + 1.20; supersedes 1.7) | AC-NFR2-1 |
| TC-HIST-012 | Redaction sweep (4× zero-hit) + evidence manifest completeness | 1 (Tasks 1.13 step 6, 1.18, 1.20–1.21; supersedes 1.8–1.10), re-run in 2 (Task 2.5) | AC-F6-1, NFR-1, NFR-3, NFR-6 |
| TC-HIST-013 | Verdict determination, TDR-0011 authoring, index registration | 2 | AC-F7-1, AC-F7-2 |
| TC-HIST-014 | Change-diff audit: zero src/ diffs, no version bump, no tmp/ staged | 3 (Task 3.1) | AC-NFR4-1 |

**AC coverage check (spec §17):** AC-F1-1 → TC-HIST-002/003, 013 · AC-F2-1 → TC-HIST-006/007, 013 · AC-F3-1 → TC-HIST-004/007/008, 013 · AC-F4-1 → TC-HIST-010, 013 · AC-F5-1 → TC-HIST-005/009 · AC-F6-1 → TC-HIST-012 · AC-F7-1 → TC-HIST-013 · AC-F7-2 → TC-HIST-013 · AC-NFR2-1 → TC-HIST-001/011 · AC-NFR4-1 → TC-HIST-014. **All 10 spec ACs covered** (mirrors test plan §3.1 — all "Covered").

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification (§5.1 matrix, §8.4 API forms, §17 ACs — authority) | ./chg-GH-90-spec.md | Spec |
| Test plan (14 TC-HIST procedures, §6.3 redaction discipline, §7 commands) | ./chg-GH-90-test-plan.md | Test Plan |
| PM notes (DEC-1..DEC-4 provenance incl. the superseded sandbox note, CEO credential resolution, doc-risk flags) | ./chg-GH-90-pm-notes.yaml | Notes |
| Probe workflow — CEO-waiver-authorized, additive, spike-branch-only | `.github/workflows/gh-90-historical-probe.yml` | CI (new — Phase 1, Amendment 1) |
| Probe script — zero-dependency Bun, committed so CI can check it out | `scripts/gh-90-historical-probe.mjs` | Script (new — Phase 1, Amendment 1) |
| CI evidence artifact (sanitized captures + ledger + provenance; run id recorded in the manifest) | workflow artifact `gh-90-evidence` | Evidence (CI, ephemeral — retained ~90 days) |
| Evidence pack (12 sanitized captures + optional probe + `ci-ledger.json` + `ci-provenance.json`) | ./evidence/*.json | Evidence (new — Phase 1) |
| Evidence manifest (case → file → endpoint → status → result; request ledger; cleanup mode; CI provenance) | ./evidence/README.md | Evidence (new — Phase 1) |
| TDR-0011 — spike verdict record | `doc/decisions/TDR-0011-confluence-historical-version-api-spike.md` | Decision (new — Phase 2) |
| Decision registry (TDR-0011 row) | `doc/decisions/00-index.md` | Decision (updated — Phase 2) |
| TDR skeleton/conventions to follow | `doc/decisions/TDR-0010-credential-validation-v1-current-user.md`, `doc/guides/decision-records-management.md` | Reference (unchanged) |
| Spike precedent (C-1 disposable sandbox, C-2 redacted evidence, C-3 durable records) | `doc/decisions/TDR-0001-confluence-api-validation-spike.md` | Reference (unchanged) |
| TO-CONFIRM row + revisit trigger #3 (fallback wording) + Decision §2 | `doc/decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md` | Reference (unchanged; linked at phase 7) |
| P5-05/P5-06 delta baseline | `doc/inception/integration-scenarios/08-page-versions.md` | Reference (unchanged; extended at phase 7 by @doc-syncer) |
| Redaction/secret posture | `doc/guides/security-baseline.md` | Reference (unchanged) |
| E2E secret mapping precedent (lines 48–53) + valid-secrets proof (run 31861445358, 2026-08-15T03:18Z) | `.github/workflows/run-e2e.yml` | Reference (unchanged) |
| Repo workflow conventions (actions versions, bun pin, concurrency patterns) | `.github/workflows/ci.yml` | Reference (unchanged) |
| Scratch (downloaded artifacts, sweep proof, syntax-check output — never committed) | `tmp/gh-90-spike/` (git-ignored via `.gitignore:49`) | Scratch |
| Local creds (REVOKED 2026-08-15 — retained only as sweep-literal source; never committed) | `tmp/marksync-demo/.env`, `tmp/marksync-demo/marksync.yml` | Secret (never committed) |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | plan-writer (GH-90) | Initial plan. 3 phases (docs-only spike — no scaffolding/integration/review-fix phases apply): (1) live verification & evidence capture — TC-HIST-001..012, fixture → 10-case matrix → trash → cleanup → redaction sweep → manifest; (2) verdict + TDR-0011 per TDR-0010/decision-records-management conventions + 00-index row — TC-HIST-013; (3) finalize — TC-HIST-014 diff audit, ticket-AC evidence map for the PR body, execution logs, spec §17 reconciliation, explicit no-version-bump attestation (DEC-4). Verified environment facts: tmp/ git-ignore at .gitignore:49; creds + marksync.yml present; evidence/ scaffold exists; next TDR number 0011. Abort criteria A-1..A-3 (creds/permission, post-commit secret hit, scope pressure) + "case-unexecutable = finding, not abort" posture per test plan §8.3. |
| 1.1 | 2026-08-15 | plan-writer (GH-90, Amendment 1) | delivery_planning REOPEN (PM; CEO credential resolution — issue #90 comment 5300646430; pm-notes decisions). Phase 1 execution vehicle changed local curl → CI probe after the A-1 blocker (local `.env` token revoked, 403; tasks 1.1–1.2 complete; tasks 1.3–1.11 SUPERSEDED — tombstoned with history pointer `git show 46abd56:…` — by new tasks 1.12–1.22): additive waiver-authorized workflow `.github/workflows/gh-90-historical-probe.yml` (push+branch+paths trigger — `workflow_dispatch` requires the default branch, which the waiver forbids; optional dispatch declared for post-merge re-runs; dedicated `gh-90-probe` concurrency group so nightly e2e is never cancelled/queued) + zero-dep `scripts/gh-90-historical-probe.mjs` (fixture with timestamped title → §5.1 10-case matrix → trash → sanitize-at-write + self-check hard-fail pre-upload → artifact `gh-90-evidence` with ledger + provenance). Coder loop: commit A + push (auto-trigger) → `gh run watch` → `gh run download` to `tmp/gh-90-spike/raw-artifacts/` → local 4-grep sweep (dual-layer note: E2E secret values checked in-CI by the self-check; local literals swept locally) → copy to `evidence/` with §5.1 naming → manifest with CI provenance → commit B (verified non-retriggering). Phase 2 + required TDR-0011 elements: local-token operational note (human-issued token needed; revoked 2026-08-15) + CI-artifact evidence provenance (run id, workflow, commit SHA, date); DoR iter-1 phrasing caution baked in. Phase 3 diff audit extended: exactly-two-waiver-files assertion. Risks += RSK-P2 (misfire/retrigger), RSK-P3 (artifact download), RSK-P4 (queue latency/concurrency isolation); A-1 reframed CI-side; A-3 narrowed to beyond-waiver. Authorized deviation documented: test-plan D-TST-2 "nothing executable is committed" superseded by the CEO waiver (script must be committed for CI checkout). Matrix, redaction contract, verdict scale unchanged; DoR READY stands. |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 1 | BLOCKED → REOPENED (Amendment 1) | 2026-08-15T06:50:00Z | — | — | **ABORT A-1 TRIGGERED (2026-08-15)**: Creds/permission failure. Credentials load correctly (MARKSYNC_CONFLUENCE_BASE_URL, MARKSYNC_USER_EMAIL, MARKSYNC_API_TOKEN all present, AUTH header generated successfully), but Confluence Cloud API returns 403 "Current user not permitted to use Confluence" for all requests (both GET /wiki/rest/api/content?limit=1 and POST /wiki/rest/api/content). Tested with both curl (encountering HTTP/2 error 43) and Python requests library (clean 403 response). Per plan abort criteria A-1: STOP, leave tree clean, report to PM. Gap recorded per TDR-0001 precedent (commits db9a2ac, d017526). **RESOLVED same day — CEO credential resolution** (issue #90 comment 5300646430): local token revoked (do not wait for human refresh); evidence capture moved to CI using valid E2E_* Actions secrets (run-e2e.yml run 31861445358, 2026-08-15T03:18Z). Phase 1 amended (plan v1.1): tasks 1.3–1.11 superseded by 1.12–1.22; tasks 1.1–1.2 remain complete. |
| 2 | Not started | — | — | — | |
| 3 | Not started | — | — | — | |
