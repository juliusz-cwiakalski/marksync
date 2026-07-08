---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-17-readiness-iter-2
status: complete
created: 2026-07-09T00:05:00Z
reviewer: readiness-reviewer
work_item: GH-17
iteration: 2
verdict: NOT_READY
pause_required: false
---

# Readiness Review Iteration 2

Verdict: NOT_READY
Work Item: GH-17
Date: 2026-07-09
Pause Required: no

## Facet Summary

- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Iter-1 must-fix verification (all 3 CLOSED)

1. **[CRITICAL→closed] test-plan 4-arms shape.** VERIFIED FIXED. Zero top-level
   `error.kind === "MissingCredentials"|"InvalidBaseUrl"|"InvalidCredentials"|"AuthUnreachable"`
   remain (grep → 0). 11 assertions now read `error.kind === "Auth" && error.authKind === "…"`.
   Counts corrected to `13+1=14` / `13→14`; the surviving "13→17" mentions are all negation
   ("NOT 13→17") or revision-log reconciliation prose. OQ-TP-1/2/3 marked RESOLVED. The
   exhaustiveness test (TC-ERRMAP-001/003) is re-scoped to the single `Auth` arm + the nested
   `authKind` sub-switch with its own `never`-check (RSK-8).
2. **[MAJOR→closed] v1 `user/current` fallback contradiction.** VERIFIED FIXED. PM decided
   v2-only; spec dropped v1 in-scope (NG-8 added; F-2/DEC-5/RSK-6/§8.1/§8.4/§7.2/§7.3 all
   rewritten; RSK-6 "both paths tested" claim retracted). Plan states v2 is the SOLE endpoint
   (open-question, Out-of-Scope bullet, task 2.2). Test-plan §1.2 marks v1 DROPPED; TC-VALIDATE
   covers v2 200/401/403/429/network only. Every remaining `user/current` occurrence is in
   deferred/out-of-scope/revision-log context — none claims an in-scope, tested v1 fallback.
3. **[MAJOR→closed] dep-cruiser enforcement overstatement.** VERIFIED FIXED. Zero
   "check:boundaries enforces"/"dep-cruiser enforces" DEC-1 claims remain. The plan now states
   plainly (front-matter, DEC-1 consequences, Constraints, RSK-3, Phases intro, Phase-1/6 ACs)
   that the live `.dependency-cruiser.cjs` ships only 4 rules and that the `rg '#infra'
   src/app/credentials.ts → empty` check (tasks 2.2/6.1) is the load-bearing DEC-1 guard; 14
   references to that `rg` check are present.

## Blocking Findings (MUST-FIX before delivery)

### 1. [major] cross_artifact_consistency / plan_coverage — plan#DEC-2 type listing (L132, L135–139) + task 1.3 (L420) + summary (L52) vs spec#F-3/DM-2/DEC-2 + test-plan#9 assertions

**Gap:** The three artifacts agree that there is ONE `Auth` arm with a discriminated
`authKind`, but they **disagree on whether `authKind` sits flat on the arm or nested under an
`auth` wrapper property** — and the access paths are not interchangeable.

- **Spec (FLAT — contract authority):** `{ kind: "Auth"; authKind: "…" \| …; …payload }`
  (F-3 L114, DM-2 L212, DEC-2 L295, §10 L244). Story notation maps to
  `{ kind:"Auth", authKind:"MissingCredentials", missing:[] }` (DEC-2 L295).
- **Test-plan (FLAT):** nine executable assertions check `error.authKind === "…"` directly
  (TC-CRED-002/003/004/005/006/007, TC-VALIDATE-002/003/005 — L344/377/408/436/467/499/621/652/717);
  DM-AUTH-2 (L182) and §1.1 (L72) describe the flat shape.
- **Plan (NESTED — outlier):** `| { kind: "Auth"; auth: AuthErrorDetail }` (L132) with a
  separate `AuthErrorDetail` type holding `authKind` (L135–139); task 1.3 instructs an
  exhaustive sub-switch over `err.auth.authKind` (L420); summary repeats `{ kind: "Auth"; auth:
  AuthErrorDetail }` (L52).

**Why this blocks (same failure class as iter-1 Finding 1):** if a coder implements the plan's
nested shape verbatim, `error.authKind` is `undefined` (the value lives at `error.auth.authKind`),
and the test-plan's 9 `error.authKind === "…"` assertions all **fail**. Conversely, if the coder
implements the spec's flat shape, plan task 1.3's `err.auth.authKind` is a type error. The coder
receives two contradictory concrete instructions.

**Decisive evidence the FLAT shape is correct and the plan is the lone divergent artifact:**
- The plan justifies its shape as "mirrors the GH-15 `ConfigError` precedent" (L141–162, L56).
  The **live `src/domain/errors.ts` `InvalidConfig` arm (L59–64) is FLAT** — `kind:
  "InvalidConfig"` is followed directly by `path`, `ajvErrors: ConfigAjvError[]`, `humanMessage`,
  with NO wrapper property. The plan's nested `auth: AuthErrorDetail` does **not** mirror the
  cited precedent; the plan-writer's rationale is factually wrong against the live code.
- The plan itself declares the spec the contract authority that "wins on contract matters (AC
  wording, DEC table)" (L84–87) — and the spec is flat.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Reconcile the plan's `AuthError` type to the FLAT shape used by the spec,
the test-plan, and the live `InvalidConfig` precedent. Specifically: change the DEC-2 type
listing (L132, L135–139) and the summary (L52) from `{ kind: "Auth"; auth: AuthErrorDetail }`
to `{ kind: "Auth"; authKind: …; …payload }` (either inline per-kind members on the arm, or —
if a named detail type is desired for readability — keep `AuthErrorDetail` but spread/inline it
so `authKind` is a direct property of the `Auth` arm, matching how `InvalidConfig` carries
`ajvErrors[]` flat). Update task 1.3 (L420) from `err.auth.authKind` to `err.authKind`, and the
Phase-1 exhaustiveness `default: const _exhaustive: never = err.auth` (L434) accordingly. This
makes the plan's type listing and the test-plan's assertions agree on the access path. Small,
localized edit; no phase/AC changes.

> **Note on iteration budget:** this is iteration 2 of a ~3 cap. If this same shape-class gap
> persists into iter-3, escalate to the human rather than looping.

## Non-Blocking Findings (carry-forward from iter-1; still non-blocking)

### 2. [minor, persistent] plan executability — plan#task 2.2 vs plan#DEC-2 type (L139)

The DEC-2 type listing still declares `AuthUnreachable` with `cause: string` (a stored field)
while task 2.2 builds it with `cause: <redacted/omitted>`. The Phase-5 INV-SEC-1 capture-and-grep
catches any token-shaped leak in `cause`, and the Phase-1 mapper never interpolates `cause`, so
this is not security-blocking. Persisted from iter-1 Finding 5; unchanged by the iter-1
remediation.

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Decide once (drop `cause` from the arm, or keep it as a stored
generic/redacted transport label — never raw fetch text) and align the type listing with task
2.2. Can be folded into the Finding-1 reconciliation.

### 3. [nit, persistent] spec_completeness — spec#F-1/G-1/DEC-1 + plan#task 2.2

`resolveCredentials` does no network I/O (env read + base64 + mask) yet both spec DEC-1/F-5 and
plan task 2.2 give it an injectable `fetch` param via `AuthProviderOptions`. The `fetch` is
unused on the resolve path. Spec↔plan are consistent, so not a contradiction. Persisted from
iter-1 Finding 6. Optional: restrict `AuthProviderOptions { fetch? }` to `validateCredentials`.

**Suggested remediation target phase:** specification

## What passes (confirmation)

- **Iter-1 remediation:** all 3 must-fix gaps verified closed by targeted grep (see "Iter-1
  must-fix verification" above).
- **Cross-cutting convergence (holds):** DEC-1 injected fetch (app imports `#domain/*` only,
  load-bearing `rg` guard); single `Auth` arm (union 13→14, NOT 4 kinds); stable `AUTH_`-prefixed
  codes (`AUTH_MISSING_CREDENTIALS`/`AUTH_INVALID_BASE_URL`/`AUTH_INVALID_CREDENTIALS`/
  `AUTH_UNREACHABLE` → `EXIT_AUTH`=20; only `AUTH_UNREACHABLE` retryable) present and consistent
  across all 3 artifacts with zero unprefixed literals; v2 `user/by-me` sole validation endpoint;
  INV-SEC-1 validated at **Integration** level (TC-SEC-001 captures every `CommandResult` JSON +
  error message string and asserts the fake-token substring absent — NOT mock-only, guardrail-
  compliant); tier placement correct (Unit resolve/masking/header/error-map/exit-codes,
  Integration `Bun.serve` validateCredentials + INV-SEC-1); atomic Phase-1 ordering (extend
  `MarkSyncError` + all exhaustive sites in one typecheck-green commit BEFORE the provider).
- **Live-source verification:** `EXIT_AUTH = 20` and the `ConfigError = Extract<…>` narrowed-
  channel precedent confirmed in `src/domain/errors.ts`; the 4-rule live `.dependency-cruiser.cjs`
  reality confirmed (plan wording now matches). The `InvalidConfig` FLAT shape confirms the spec/
  test-plan shape is the repo norm — and is the basis for Finding 1.
- **spec_completeness / ac_quality / dod_defined:** unchanged from iter-1 — all 6 story ACs
  present, testable, non-overlapping, mapped to AC-F1-1..AC-F3-1; DoD = the 6 ACs; scope IN/OUT
  crisp (NG-8 now covers v1).
- **decision_capture:** DEC-1..5 in spec §15; PM notes capture DEC-1/DEC-2 + the two PM
  decisions (AUTH_ codes, v2-only). All change-scoped; no ADR needed.
- **plan_doc_update_coverage / plan_code_area_coverage:** Phase 6.3 lists `feature-cli.md` §3.3,
  `security-baseline.md`, `ubiquitous-language.md`, `nonfunctional.md` NFR-SEC-6, `typescript.md`
  for lifecycle phase 7; affected code areas named per phase; blast radius explicit.

## Next remediation target (reopen)

1. **delivery_planning** — reconcile the plan's `AuthError` type to the FLAT shape (Finding 1,
   major — the only blocker). Optionally fold in the `cause` decision (Finding 2) in the same
   edit.
2. *(optional)* **specification** — narrow `fetch` to `validateCredentials` (Finding 3, nit).

Re-run this gate after the plan is reconciled. This is iteration 2; one more re-run is within the
~3 cap — if the shape-class gap persists into iter-3, escalate to the human.
