---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-17-readiness-iter-3
status: complete
created: 2026-07-09T00:30:00Z
reviewer: readiness-reviewer
work_item: GH-17
iteration: 3
verdict: READY
pause_required: false
---

# Readiness Review Iteration 3

Verdict: READY
Work Item: GH-17
Date: 2026-07-09
Pause Required: no

## Facet Summary

- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: PASS
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Iter-2 must-fix verification (CLOSED)

1. **[MAJOR→closed] plan NESTED vs spec/test-plan FLAT `AuthError` shape.** VERIFIED
   FIXED. Targeted grep for `err\.auth\.authKind|error\.auth\.authKind|auth:\s*AuthErrorDetail|auth:\s*\{`
   across `chg-GH-17-plan.md` → **0 matches**. The plan's `AuthError` type is now FLAT
   everywhere it is load-bearing:
   - **DEC-2 code listing (L143–146):** four flat union members —
     `{ kind: "Auth"; authKind: "MissingCredentials"; missing: readonly string[] }` /
     `{ kind: "Auth"; authKind: "InvalidBaseUrl"; baseUrl: string }` /
     `{ kind: "Auth"; authKind: "InvalidCredentials"; status: number }` /
     `{ kind: "Auth"; authKind: "AuthUnreachable"; cause: string }`.
   - **task 1.3 (L445–453):** the mapper's `case "Auth":` narrows on `err.authKind` as a
     **direct** property; the nested never-check is `default: const _exhaustive: never = err.authKind`.
   - **task 2.2 (L557–576):** error literals built as `{ kind:"Auth", authKind:"…", …payload }`.
   - The `AuthErrorDetail` wrapper type is removed — its 2 surviving mentions (L140, L436) are
     both explicit negations ("NO `auth:` wrapper and NO separate `AuthErrorDetail` type").
   - **Precedent now correctly cited:** the plan claims the flat shape "exactly mirrors the live
     `InvalidConfig` arm `{ kind: "InvalidConfig"; path; ajvErrors; humanMessage }`". Verified
     against live `src/domain/errors.ts` L59–64 — `InvalidConfig` IS flat (all siblings of `kind`,
     no wrapper). The plan's rationale is now factually correct (it was wrong in iter-2, which is
     what flagged the nested shape).
   - **Convergence:** the plan's flat shape now matches the test-plan's 9 executable assertions
     (`error.authKind === "…"` direct-property access — TC-CRED-002/003/004/005/006/007,
     TC-VALIDATE-002/003/005) and the spec's F-3/DM-2/DEC-2. No access-path divergence remains.

## Iter-1 + iter-2 carry-forward non-blocking items (all RESOLVED this round)

2. **[minor→resolved] `cause` field ambiguity (iter-1 F5 / iter-2 F2).** RESOLVED. The plan now
   states explicitly (RSK-1 L343–349, task 2.2 L576–581) that `AuthUnreachable.cause: string` is a
   stored field for internal/logging context — consistent with the **live `RenderUnavailable.cause:
   string`** (`src/domain/errors.ts` L49, verified) — but is **never** interpolated into the surfaced
   `error.message` (DEC-5 redaction-at-source; the Phase-1 mapper omits `cause` entirely). The
   Phase-5 INV-SEC-1 capture-and-grep remains the backstop for any token-shaped leak in `cause`. The
   type listing (L146) and task 2.2 now agree.

3. **[nit→resolved] `resolveCredentials` unused-fetch param (iter-1 F6 / iter-2 F3).** RESOLVED.
   `resolveCredentials()` now takes **no** `fetch` param — pure env logic (Context L71, DEC-1 L103,
   D-5 L243–244, task 2.2 L553, TS-13 L909 all aligned). Only `validateCredentials(creds, { fetch? })`
   accepts the injectable `fetch`. The two signatures are now internally consistent with TS-13.

## Full cross-cutting convergence checklist (all PASS)

1. **DEC-1 — injected `fetch` on `validateCredentials` ONLY.** PASS. `resolveCredentials()` is pure
   env logic (no fetch param); `validateCredentials(creds, { fetch? }: AuthProviderOptions)` is the
   sole network seam. `src/app/credentials.ts` imports `#domain/*` only. The load-bearing guard is
   the explicit `rg '#infra' src/app/credentials.ts → empty` check (plan tasks 2.2/6.1, TS-12,
   Phase-2/6 ACs) — correctly stated as NOT a dep-cruiser rule (the live `.dependency-cruiser.cjs`
   ships only 4 rules; `app→infra` is not among them). Verified consistent across all 3 artifacts.

2. **DEC-2 — single flat `Auth` arm discriminated on `authKind`.** PASS. Union grows 13→14 (one
   arm), NOT 13→17. `{ kind: "Auth"; authKind: "MissingCredentials"|"InvalidBaseUrl"|"InvalidCredentials"|
   "AuthUnreachable"; <flat payload> }` — `error.authKind` is the FLAT discriminator everywhere
   (spec F-3/DM-2/DEC-2; test-plan DM-AUTH-2 + 9 assertions; plan DEC-2 listing + task 1.3).
   `AuthError = Extract<MarkSyncError, { kind: "Auth" }>` narrowed alias (mirrors live `ConfigError`
   at `src/domain/errors.ts` L72 — verified). The nested `authKind` sub-switch carries its own
   `never`-check (RSK-8).

3. **Stable `error.code` strings.** PASS. `AUTH_MISSING_CREDENTIALS` / `AUTH_INVALID_BASE_URL` /
   `AUTH_INVALID_CREDENTIALS` / `AUTH_UNREACHABLE` — all → `EXIT_AUTH` (20); only `AUTH_UNREACHABLE`
   is `retryable: true`. Grep for unprefixed literals (`"(MISSING_CREDENTIALS|INVALID_BASE_URL|
   INVALID_CREDENTIALS|UNREACHABLE)"` not preceded by `AUTH_`) → **0 matches** across all 3
   artifacts. Pinned identically in spec DM-4/Appendix-B, test-plan TC-ERRMAP-001/002, plan DEC-2
   table + tasks 1.3/1.4/D-4/TS-9. Verified `EXIT_AUTH = 20` exists live (`exit-codes.ts` L58).

4. **v2 `user/by-me` sole validation endpoint.** PASS. All v1 `user/current` references are in
   deferred / out-of-scope / negation / revision-log context (spec NG-8/§7.2/§7.3/RSK-6/DEC-5/§8.1/
   §8.4; test-plan §1.2 DROPPED; plan open-question/Out-of-Scope/task 2.2). No artifact claims an
   in-scope or tested v1 fallback. Consistent across all 3.

5. **INV-SEC-1 at Integration level.** PASS. TC-SEC-001/002 are Integration-tier; they capture the
   genuine serialized `CommandResult` JSON **and** every error message string produced by the
   provider across the happy path **and** every error path, and assert the raw-token substring
   (`ATATT3xFfGF0SECRET_TOKEN_VALUE_x9`) is absent — NOT a mock asserting "redact was called". Email
   is asserted masked (`j***@cwiakalski.com`) wherever surfaced. TC-SEC-003 verifies the redactor as
   defense-in-depth (meaningful: the chosen token matches the `atlassian-token` redactor pattern).
   Plan Phase 5 (tasks 5.1/5.2) delivers the same capture-and-grep + the `OutputService.emit`
   end-to-end chain. Guardrail-compliant.

6. **Tier placement.** PASS. Unit: `resolveCredentials` / header construction / `maskEmail` /
   `validateCredentials`-via-stub-fetch / error-map (`cli-error-map.test.ts`) / exit-codes
   (`exit-codes.test.ts`) / domain union exhaustiveness (`errors.test.ts`). Integration:
   `validateCredentials` against a `Bun.serve` mock (200/401/403/429/network) + INV-SEC-1 capture.
   E2E explicitly out of scope (adapter E3-S4 concern). Matches `.ai/rules/testing-strategy.md`.

7. **Atomic Phase-1 ordering.** PASS. The `Auth` arm + all 3 exhaustiveness sites
   (`src/domain/errors.ts` union + `assertNeverMarkSyncError`; `src/app/cli-error-map.ts`
   `case "Auth"`; `src/cli/output/exit-codes.ts` `CODE_TO_EXIT`) land in ONE typecheck-green commit
   (Phase 1) BEFORE the provider (Phase 2). Plan Critical ordering constraint (L180–192) is correct;
   adding the arm to `errors.ts` alone would break the mapper's `default: assertNeverMarkSyncError(err)`
   (verified live at `cli-error-map.ts` L197).

8. **All 6 story ACs present + testable + traced.** PASS. AC-1 → TC-CRED-001/006/007/008; AC-2 →
   TC-CRED-002..005; AC-3 → TC-VALIDATE-001..007; AC-4 (INV-SEC-1) → TC-SEC-001/003; AC-5 →
   TC-CRED-009/TC-SEC-002; AC-6 → TC-ERRMAP-001/002/003 + `bun run check`. All 6 mapped to spec
   AC-F1-1..AC-F3-1 (Appendix A) and plan Test Scenarios TS-1..TS-14. DoD = the 6 ACs (spec §17).

9. **No remaining executable contradiction.** PASS. A coder following the plan literally now produces
   code whose `error.authKind` property the test-plan's assertions read directly — no test fails on
   shape, no type-check fails on access path. The plan's type listing, task 1.3's nested sub-switch,
   task 2.2's error literals, and the test-plan's 9 assertions all converge on the same flat access
   path. Codes/exits/retryable are byte-identical across all 3 artifacts. The v2-only scope is
   consistent.

## Non-blocking carry-forwards (do NOT gate delivery)

### A. [nit] cross_artifact_consistency — plan#task 5.1 (L768) vs test-plan#TC-SEC-001 (L935/948) + §6 (L1046)

**Gap (non-blocking):** the plan's Phase-5 INV-SEC-1 task 5.1 suggests an illustrative synthetic
token `e.g. MARKSYNC_API_TOKEN=SECRET_TOKEN_DO_NOT_LEAK_0123456789abcdef`, while the test-plan
(authoritative for test data) pins `ATATT3xFfGF0SECRET_TOKEN_VALUE_x9` in 4 places (TC-SEC-001
precondition + step 3, TC-SEC-003 step 1, §6 test data). The test-plan's token is the more
rigorous choice: it matches the `atlassian-token` redactor pattern `\bAT(?:ATT|STS)[A-Za-z0-9_-]{8,}`,
so TC-SEC-003's defense-in-depth assertion (`redactString` → `[REDACTED:atlassian-token]`) is
meaningful; the plan's example token does NOT match that pattern, which would make TC-SEC-003
vacuous if used literally.

**Why non-blocking:** the test-plan is the test authority and pins the exact token string in the
executable test steps; a coder following the test-plan literally uses `ATATT3xFfGF0SECRET_TOKEN_VALUE_x9`,
which makes both TC-SEC-001 (construction-layer) and TC-SEC-003 (redaction-layer) meaningful. The
plan's token is explicitly an "e.g." example, not a contract. No failing test, no AC gap.

**Suggested remediation target phase:** delivery (informational note for `@coder`)
**Suggested fix:** use the test-plan's pinned token `ATATT3xFfGF0SECRET_TOKEN_VALUE_x9` (matches the
redactor pattern → both INV-SEC-1 assertions are meaningful). No artifact edit required.

## What passes (confirmation)

- **Iter-2 remediation:** the one blocker (flat-vs-nested shape) is verified closed by targeted grep
  + live-source confirmation. The plan's `AuthError` is now flat, matching the spec, the test-plan,
  and the live `InvalidConfig` precedent it cites.
- **Iter-1 remediation (still holds):** all 3 must-fix gaps (4-arms shape, v1 fallback, dep-cruiser
  overstatement) remain closed from iter-2.
- **Live-source verification:** `EXIT_AUTH = 20` (`exit-codes.ts` L58); `FORBIDDEN → EXIT_AUTH`
  (L79); `ConfigError = Extract<…>` precedent (`errors.ts` L72); flat `InvalidConfig` arm
  (`errors.ts` L59–64); `RenderUnavailable.cause: string` (`errors.ts` L49); 4-rule live
  `.dependency-cruiser.cjs`. All plan/test-plan/spec citations of these are accurate.
- **spec_completeness / ac_quality / dod_defined:** all 6 story ACs present, testable,
  non-overlapping, Given/When/Then, mapped to F-/NFR-/DM- IDs and AC-F1-1..AC-F3-1; DoD = the 6 ACs.
- **decision_capture:** DEC-1..5 in spec §15; PM notes capture DEC-1/DEC-2 + PM-resolved AUTH_ codes
  + v2-only. All change-scoped technical decisions; no precedent-setting item needs an ADR.
- **plan_doc_update_coverage:** Phase 6.3 + spec §18 list the docs to update at lifecycle phase 7
  (`feature-cli.md` §3.3, `security-baseline.md`, `ubiquitous-language.md`, `nonfunctional.md`
  NFR-SEC-6, `typescript.md` error-handling).
- **plan_code_area_coverage:** affected code areas named per phase — `errors.ts`, `cli-error-map.ts`,
  `exit-codes.ts` (the three exhaustive sites, Phase 1); new `src/domain/credentials.ts` +
  `src/app/credentials.ts` (Phase 2); test files (Phases 3/4/5). Blast radius explicit.
- **system_spec_consistency:** no contradiction with existing `doc/spec/**` or system/quality docs;
  the additive `Auth` arm + `EXIT_AUTH` reuse are consistent with the GH-14/GH-15/GH-16 contracts.

## Gate result

**READY.** All 10 DoR facets PASS. The iter-2 blocking gap (flat-vs-nested `AuthError` shape) is
closed and verified against live source; the iter-1/iter-2 non-blocking carry-forwards (`cause`
ambiguity, unused-fetch param) are resolved. The full cross-cutting convergence checklist (DEC-1,
DEC-2, stable codes, v2-only, INV-SEC-1 integration-level, tier placement, atomic Phase-1 ordering,
6-AC coverage, no executable contradiction) passes. The one non-blocking carry-forward (synthetic
token example divergence) is informational for `@coder` and does not gate delivery.

This is iteration 3 (final within the ~3 cap). Delivery (lifecycle phase 6) is unblocked.
