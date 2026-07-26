---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-88-doctor-credential-v1-endpoint
status: Proposed
created: 2026-07-26T00:00:00Z
last_updated: 2026-07-26T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, doctor, diagnostics, auth, bug]
links:
  change_spec: ./chg-GH-88-spec.md
  test_plan: ./chg-GH-88-test-plan.md
  inception_evidence: ../../../inception/integration-scenarios/01-authentication.md
summary: "Switch the marksync doctor credential-validation probe from the broken v2 /wiki/api/v2/user/by-me endpoint (HTTP 400 → false AuthUnreachable → false DOCTOR_FAIL exit 60) to the inception-proven v1 /wiki/rest/api/user/current endpoint. Fully backward compatible (0.8.0 → 0.8.1): no change to AccountIdentity, AuthError, the report envelope, exit codes, or the secret-isolation contract. Records the endpoint reversal as TDR-0010, superseding GH-17 DEC-5's v2-only choice by taking its deferred v1 fallback."
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-88: fix: doctor credential check false negative — /wiki/api/v2/user/by-me returns 400

## Context and Goals

`marksync doctor` falsely fails its `credentials` check ("Auth endpoint unreachable") and exits `60` (`DOCTOR_FAIL`) for valid credentials, because `validateCredentials` (`src/app/credentials.ts`) probes the v2 `/wiki/api/v2/user/by-me` endpoint, which now returns HTTP 400 in production. The credential provider maps any non-{200,401,403,429} status to `AuthUnreachable`; doctor maps `AuthUnreachable` to `status: "fail"` → `DOCTOR_FAIL` → `EXIT_HEALTH` (60). The inception API-validation spike already observed this exact v2 breakage (`doc/inception/integration-scenarios/01-authentication.md:39` — v2 "undocumented/unstable … returned 400 in the spike"; v1 `/user/current` "proven live"), and GH-17 DEC-5 explicitly deferred the v1 fallback ("add it only if a tenant/credential lacks v2"). Production has now triggered that contingency.

This plan delivers the **endpoint swap** — v2 → v1 — and records the reversal as a TDR. It is **a single-value swap plus comment/cause-string alignment plus test URL-literal alignment plus one new unit test plus a decision record plus a patch version bump**. No type, contract, envelope, exit-code, or secret-isolation change (spec G-3, NFR-3, NG-2/NG-3).

**Key goals (from spec §4):**

- **G-1**: `marksync doctor` reports `credentials` as `pass` with the authenticated identity when credentials are valid, against the real v1 current-user endpoint (AC-1, NFR-1).
- **G-2**: A genuinely bad token (401/403) and a genuinely unreachable host are still reported as `fail` with the correct detail/fix — zero regression in error classification (AC-2, AC-3, NFR-5).
- **G-3**: No change to the credential value type, `AccountIdentity` shape, `AuthError` union, exit-code map, or `CommandResult<DoctorReport>` envelope. Fully backward compatible (AC-4, AC-5, AC-6, NFR-3).
- **G-4**: The endpoint reversal is recorded as TDR-0010 superseding GH-17 DEC-5, grounded in the inception-spike + production-400 evidence (AC-8, DEC-1).

### Resolved design point — the src swap and the URL-literal tests move as one atomic phase (plan-writer decision)

The spec scope and the task brief suggest a "src swap" phase and a "test URL-literal update" phase as separate commits. That split is **not viable green-per-commit**: flipping `USER_BY_ME_PATH` in `src/app/credentials.ts` to v1 immediately breaks every test that asserts the probe URL string — `tests/unit/app/credentials.test.ts:221` (`calls[0]?.url`), `tests/integration/credentials.test.ts:81` (`server.requests[0]?.url`), and the eight doctor mock route handlers in `tests/integration/cli/commands/doctor.test.ts` (lines 115,168,229,264,295,330,371,450) whose `if (path === "/wiki/api/v2/user/by-me")` guard would no longer match the v1 GET the provider now issues. Reversing the order (tests first) is symmetrically red.

This plan therefore merges the **production fix + all URL-literal test updates + the new AC-4 unit test into a single atomic phase (Phase 1)**, so the suite is green at every commit boundary. This adapts the task brief's A/B split to the repo's "each phase typecheck+test green" convention (per `chg-GH-30-plan.md` house style). The TDR (Phase 2) and the version bump + final gate (Phase 3) are genuinely separable and stay separate.

> Decision needed only if `@decision-advisor` objects to the proposed TDR sequence number or slug during delivery: consult `@decision-advisor`. The number is pre-confirmed (see OQ-1 below); no other decision is anticipated — the swap is a single-value change with no tier-boundary or contract ambiguity.

### Resolved open question — OQ-1 / OQ-TST-1 (TDR sequence number)

**RESOLVED.** The decision index (`doc/decisions/00-index.md`) tops out at **TDR-0009**; the next free slot is **TDR-0010**, matching spec §13/§14 OQ-1 and test-plan §8.3 OQ-TST-1. The spec §15 note states "DEC-1 is to be ratified as **TDR-0010** (proposed) by `@decision-advisor` during delivery." Phase 2 authors `doc/decisions/TDR-0010-credential-validation-v1-current-user.md` and adds the index entry; `@decision-advisor` finalizes the slug (proposed: `credential-validation-v1-current-user`).

### Known doc-risk — current-truth docs citing v2 (owned by `@doc-syncer`, lifecycle phase 7 — NOT plan tasks)

A repo scan confirms several **current-truth** docs still cite the v2 validation endpoint. Per the task constraints and spec §7.1, these are reconciled by `@doc-syncer` in lifecycle phase 7 (`system_spec_update`), **not** by this plan's delivery tasks. Flagged here for handoff:

- `doc/overview/glossary.md:45` — `AccountIdentity` "parsed from Confluence's v2 `user/by-me` response".
- `doc/overview/ubiquitous-language.md:146` — `AccountIdentity` v2 citation; `:148` — `Credential Provider` "probes Confluence's v2 `user/by-me` endpoint".
- `doc/spec/features/feature-cli.md:71,107,125` — three v2 `user/by-me` references (validation description, AuthProvider row, doctor pre-flight).
- `doc/spec/nonfunctional.md:74` — NFR-OBS-4 doctor row cites "real `GET /user/by-me`".

Historical change docs (`doc/changes/2026-07/2026-07-08--GH-17--auth-provider/**`, GH-21, GH-30, GH-81) and `doc/inception/integration-scenarios/01-authentication.md` are **frozen / already-correct** and explicitly out of scope (spec NG-5, §7.2 [OUT]).

### Open questions

- **TDR slug** (low-risk): the proposed slug `credential-validation-v1-current-user` follows the index convention (`<TYPE>-<zeroPad4>-<slug>.md`); `@decision-advisor` may refine it during Phase 2 authoring. Non-blocking — the index entry uses whatever filename `@decision-advisor` lands on.

## Scope

### In Scope

- Swap the credential-validation probe endpoint v2 `/wiki/api/v2/user/by-me` → v1 `/wiki/rest/api/user/current` in `src/app/credentials.ts` (the `USER_BY_ME_PATH` constant value + its doc comment + the `parseIdentity` "unexpected … response shape" cause string); the retry/backoff loop and status mapping are **unchanged**. (spec §7.1, F-1, F-2)
- Rename the now-misleading `USER_BY_ME_PATH` constant to a self-documenting name (e.g. `USER_CURRENT_PATH`) — a constant named `USER_BY_ME_PATH` holding `/wiki/rest/api/user/current` is a misleading name the code-style rules forbid (typescript.md "Types, names, and structure carry meaning"). Single internal symbol; no exported contract depends on it (spec §8.5).
- Update the `AccountIdentity` doc comment in `src/domain/credentials.ts` (line ~25) to cite the v1 `user/current` endpoint — **no type change**. (spec §7.1, §8.3 DM-1)
- Update all test URL-literal assertions and mock route handlers across tiers to v1: unit credentials, integration credentials, integration doctor (8 references), e2e-mock route handler, e2e-mock smoke probe, e2e-mock create-flow no-call assertion. (spec §7.1, §16)
- Add one new unit test (TC-AUTH-008-EXTRA) feeding the inception-captured v1 body (with extra fields `type`/`accountType`/`publicName`/`_links`) and asserting `Ok({ accountId, displayName })` with extra fields ignored. (spec F-3, AC-4, DM-1)
- Author `doc/decisions/TDR-0010-<slug>.md` recording the reversal of GH-17 DEC-5 (inception-spike + production-400 evidence; framed as taking the deferred v1 fallback, NOT a retroactive condemnation of GH-17), and add the `doc/decisions/00-index.md` entry. (spec §7.1, AC-8, DEC-1)
- Patch version bump `package.json` 0.8.0 → 0.8.1. (spec §8.5, version_impact: patch)

### Out of Scope

- [OUT] A dual v1/v2 fallback path — v2 is retired from credential validation; v1 is the sole probe. (spec NG-1)
- [OUT] Changes to credential resolution, the opaque auth-header / masked-email secret-isolation contract (INV-SEC-1), the 429 retry/backoff policy, the `AuthError` union, the exit-code map, the `DoctorReport` schema, or the check-id set. (spec NG-2, NG-3)
- [OUT] New runtime dependencies or new Confluence endpoints beyond the v1 swap. (spec NG-4)
- [OUT] Editing the frozen GH-17 change documents (or any other historical change docs); GH-17 DEC-5 stands as written and the TDR records the reversal. (spec NG-5)
- [OUT] Editing `doc/inception/integration-scenarios/01-authentication.md` — already correct (v1-ONLY note), cited as evidence. (spec §7.2 [OUT])
- [OUT] Current-truth doc sync (`doc/spec/**`, `doc/overview/glossary.md`, `doc/overview/ubiquitous-language.md`) — owned by `@doc-syncer` in lifecycle phase 7. Flagged above; not plan tasks.
- [OUT] Live-sandbox testing against real Confluence Cloud — secrets-gated, separate CI gate. (test plan §1.2)

### Constraints

- **Atomic src+test coupling:** the endpoint constant and every URL-literal test assertion / mock route handler must change in one commit, or the suite is transiently red (see "Resolved design point"). Phase 1 is that single commit.
- **Backward-compatibility invariant (spec G-3 / NFR-3):** zero diff to `AccountIdentity`, `AuthError`, the exit-code map, `CommandResult<DoctorReport>`, or the check-id set. The probe path is module-internal (not an exported contract); no external caller can depend on the v2 string (spec §8.5, RSK-2).
- **Secret isolation (INV-SEC-1 / NFR-2) preserved:** the endpoint switch never touches the opaque `authHeader` construction, the masked-email flow, or the `cause`-not-in-message discipline. No raw token in any output path (AC-5).
- **Conventional Commits (TDR-0008):** commitlint + husky enforce `<type>(<scope>): <subject>`; per-phase completion signals below are commit-message-shaped accordingly.
- **Code style (.ai/rules/typescript.md):** self-documenting code, minimal comments, cite the authority once (the constant's doc comment cites the v1 endpoint + GH-88/TDR-0010 once; no scattered tags). File headers ≤ 3 lines. The `USER_BY_ME_PATH` rename is justified by the "names carry meaning" principle.
- **Decision-record convention (pm-instructions):** `<TYPE>-<zeroPad4>-<slug>.md`; TDR sequence is per-type, next free = TDR-0010.
- **Do not edit frozen history:** `doc/changes/2026-07/2026-07-08--GH-17--auth-provider/**` and `doc/inception/integration-scenarios/01-authentication.md` are untouched.

### Risks

- **RSK-1** (spec): The v1 response shape differs subtly from v2. Mitigated: the inception spike captured the v1 200 body — `accountId` and `displayName` are top-level string fields matching `AccountIdentity`; `parseIdentity` already narrows on exactly those two fields and ignores extras. Asserted by TC-AUTH-008 (URL + shape) + TC-AUTH-008-EXTRA (extra-field ignoring). Residual: L.
- **RSK-2** (spec): An external caller depends on the v2 path string. Mitigated: the probe path is module-private (not exported); references are confined to the provider, its tests, and the e2e mock — all updated by Phase 1. Residual: L.
- **RSK-3** (spec): The TDR reversal is misread as "v2 was always wrong". Mitigated: the TDR frames this as taking the previously-deferred v1 fallback (GH-17 DEC-5 / NG-8) because production confirmed the v2 breakage the inception spike already observed — not a retroactive condemnation. The historical GH-17 docs remain frozen. Residual: L.
- **RSK-P1** (plan): A URL literal is missed in an obscure test file, leaving a stale v2 reference. Mitigated: Phase 3 runs `rg "user/by-me" src/ tests/` and asserts it returns empty (ignoring frozen `doc/changes/**` history); TC-URL-008 (`bun run check`) catches any mismatched mock route as a test failure. Residual: L.
- **RSK-P2** (plan): The `USER_BY_ME_PATH` → `USER_CURRENT_PATH` rename touches a symbol referenced only within `src/app/credentials.ts`; a repo-wide grep confirms no external importer. Mitigated: typecheck + the existing unit test (which references the URL via the public `validateCredentials` behavior, not the constant name) catch any breakage. Residual: L.

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| False-negative credential failures for a valid token against reachable Confluence Cloud | 0 | NFR-1 / AC-1 |
| `credentials` check exit code with a valid token (no other failing check) | 0 (was 60) | spec §4.1 / AC-1 |
| Regression in 401/403/unreachable classification | 0 | NFR-5 / AC-2, AC-3 |
| `DoctorReport` envelope / exit-code / check-id schema diffs vs 0.8.0 | 0 | NFR-3 / AC-6 |
| Raw token / raw email occurrences in doctor output | 0 (INV-SEC-1) | NFR-2 / AC-5 |
| `rg "user/by-me" src/ tests/` matches | 0 (frozen `doc/changes/**` excluded) | AC-7 / RSK-P1 |
| `bun run check` (lint + format:check + typecheck + test + check:boundaries) | green | AC-7 / TC-URL-008 |
| TDR-0010 exists and is indexed | yes | AC-8 / TC-TDR-001 |

## Phases

### Phase 1: Atomic endpoint swap (src + test URL literals + new AC-4 unit test)

**Goal**: Land the production fix — switch the credential-validation probe from v2 `/wiki/api/v2/user/by-me` to v1 `/wiki/rest/api/user/current` — atomically with every URL-literal test assertion / mock route handler that would otherwise break, plus the new unit test proving the v1 body (with extra fields) narrows to `AccountIdentity`. The suite is green at this commit (src and URL-asserting tests move together; see "Resolved design point"). Implements F-1, F-2, F-3, DM-1; sets up AC-1, AC-4, AC-7.

**Tasks**:

- [ ] **1.1** In `src/app/credentials.ts` (line 19): replace the `USER_BY_ME_PATH` constant — **rename** it to a self-documenting `USER_CURRENT_PATH` (a constant named `USER_BY_ME_PATH` holding the v1 path is a misleading name per typescript.md) and set its value to `/wiki/rest/api/user/current`. Update its doc comment (line 18) from "v2 'current user' — the sole MS-0002 validation endpoint (no v1 fallback)" to cite the v1 endpoint and the reversal (e.g. `/** v1 current-user — the sole MS-0002 validation endpoint (GH-88 / TDR-0010; supersedes GH-17 DEC-5). */`). The single internal reference at line 95 (`${creds.baseUrl}${USER_BY_ME_PATH}`) is updated to the new name. (F-1)
- [ ] **1.2** In `src/app/credentials.ts` `parseIdentity` (line 172): update the `AuthUnreachable` cause string from `"unexpected user/by-me response shape"` to reflect the v1 endpoint (e.g. `"unexpected user/current response shape"`). No behavior change — the narrowing logic (`accountId` + `displayName` string check) is unchanged. (F-3)
- [ ] **1.3** In `src/domain/credentials.ts` (line ~25): update the `AccountIdentity` doc comment from "parsed from Confluence's `GET /wiki/api/v2/user/by-me` (GH-17 DM-3)" to cite the v1 `GET /wiki/rest/api/user/current` endpoint (GH-88 / TDR-0010). **No type change** — the interface body (`accountId`, `displayName`) is untouched. (DM-1)
- [ ] **1.4** In `tests/unit/app/credentials.test.ts`: flip the probe-target-URL assertion (test name line 216, URL literal line 221) from `${BASE_URL}/wiki/api/v2/user/by-me` to `${BASE_URL}/wiki/rest/api/user/current`, and update the test name accordingly (TC-URL-001, TC-AUTH-008). All other assertions in that test unchanged.
- [ ] **1.5** In `tests/unit/app/credentials.test.ts`: **add** the new unit test TC-AUTH-008-EXTRA — stub `fetch` to return 200 with the inception-captured v1 body including extra fields (`accountId`, `displayName`, plus `type`/`accountType`/`publicName`/`_links`), call `validateCredentials(creds, { fetch })`, assert `result.ok === true`, `result.value.accountId === "abc-123"`, `result.value.displayName === "Jane Operator"`, and that no extra fields are present on the returned identity (the two-field narrowing worked). Body fixture per test plan §6 / spec Appendix. (AC-4, F-3, DM-1)
- [ ] **1.6** In `tests/integration/credentials.test.ts` (line 81): flip the Bun.serve mock URL assertion from `${server.origin}/wiki/api/v2/user/by-me` to `${server.origin}/wiki/rest/api/user/current` (TC-URL-002, TC-INT-AUTH-001). All other integration credentials scenarios (401/403/429/network — TC-INT-AUTH-002..006) unchanged in behavior.
- [ ] **1.7** In `tests/integration/cli/commands/doctor.test.ts`: flip **all eight** v2 mock route handler references (lines 115, 168, 229, 264, 295, 330, 371, 450) from `/wiki/api/v2/user/by-me` to `/wiki/rest/api/user/current` (TC-URL-003). Scenario behaviors unchanged — only the route-handler path literal changes so the mock matches the v1 GET the provider now issues. (TC-DOCTOR-013..016, plus the four additional references at 295/330/371/450 covered by TC-URL-003.)
- [ ] **1.8** In `tests/e2e-mock/mock-confluence-server.ts` (line 169): rename the route handler path from `/wiki/api/v2/user/by-me` to `/wiki/rest/api/user/current` (TC-URL-004). The 200 response body stays `{ accountId, displayName }` (two-field shape sufficient; no extra fields needed in the mock).
- [ ] **1.9** In `tests/e2e-mock/mock-smoke-probe.test.ts` (lines 20–21): update the direct-fetch probe URL to `${server.origin}/wiki/rest/api/user/current` and update the test description to reflect the v1 endpoint (TC-URL-005). Response-shape assertion unchanged.
- [ ] **1.10** In `tests/e2e-mock/create-flow.test.ts` (lines 145–147): update the "No GET /user/by-me" no-call assertion's path filter to `/wiki/rest/api/user/current` and update the comment to reference the v1 path (TC-URL-006). The DEC-1 invariant (validateCredentials never called during a pipeline run) is unchanged — only the expected-path literal moves to v1.
- [ ] **1.11** Verify no other `user/by-me` reference remains in `src/` or `tests/`: `rg "user/by-me" src/ tests/` returns empty. (RSK-P1; final confirmation repeated in Phase 3.)

**Acceptance Criteria**:

- Must: `validateCredentials` issues `GET {baseUrl}/wiki/rest/api/user/current` with the same opaque Basic `authHeader`, single-GET semantics, and unchanged status mapping (AC-1, F-1, F-2, TC-AUTH-008, TC-INT-AUTH-001).
- Must: a v1 200 body with extra fields narrows to `Ok({ accountId, displayName })`; `AccountIdentity` shape unchanged (AC-4, F-3, DM-1, TC-AUTH-008-EXTRA).
- Must: 401/403 → `InvalidCredentials`, 429 → bounded backoff, network/other → `AuthUnreachable` — zero classification regression (AC-2, AC-3, NFR-5, TC-AUTH-009/010/011, TC-INT-AUTH-002..006).
- Must: `bun run check` green — unit, integration credentials, integration doctor, and e2e-mock suites all pass with the v1 URLs (AC-7, TC-URL-001..006, TC-URL-008).
- Should: the `USER_BY_ME_PATH` → `USER_CURRENT_PATH` rename leaves no dangling reference (typecheck + `check:boundaries` green).

**Files and modules**:

- Code areas: `src/app/credentials.ts` (updated — constant value + rename + doc comment + `parseIdentity` cause string; retry/backoff loop and status mapping unchanged); `src/domain/credentials.ts` (updated — `AccountIdentity` doc comment only; no type change).
- Test areas: `tests/unit/app/credentials.test.ts` (updated — URL assertion flip + new TC-AUTH-008-EXTRA test); `tests/integration/credentials.test.ts` (updated — URL assertion flip); `tests/integration/cli/commands/doctor.test.ts` (updated — 8 route-handler path flips); `tests/e2e-mock/mock-confluence-server.ts` (updated — route handler rename); `tests/e2e-mock/mock-smoke-probe.test.ts` (updated — fetch URL + description); `tests/e2e-mock/create-flow.test.ts` (updated — no-call assertion path + comment).
- System docs: none (current-truth doc sync is owned by `@doc-syncer` in lifecycle phase 7 — see "Known doc-risk").

**Tests**:

- TC-AUTH-008 (unit, update URL), TC-AUTH-008-EXTRA (unit, new — AC-4 extra-field narrowing), TC-AUTH-009/010/011/012 (unit, unchanged behavior), TC-INT-AUTH-001 (integration, update URL), TC-INT-AUTH-002..006 (integration, unchanged behavior), TC-DOCTOR-013..016 + the four additional doctor references (integration, update route-handler paths), TC-URL-001..006 (the URL-update meta-tests), TC-URL-008 (full suite green — also re-confirmed in Phase 3).

**Completion signal**: `fix(credentials): probe v1 user/current instead of broken v2 user/by-me (GH-88, TDR-0010)`

---

### Phase 2: Decision record TDR-0010 + decision index entry

**Goal**: Record the endpoint reversal as a decision record superseding GH-17 DEC-5, grounded in the inception-spike + production-400 evidence, and register it in the decision index. Authored by `@decision-advisor` during delivery (spec §13, §15 note). Docs-only — does not affect the test suite. Implements AC-8, DEC-1.

**Tasks**:

- [ ] **2.1** Author `doc/decisions/TDR-0010-credential-validation-v1-current-user.md` (slug finalized by `@decision-advisor`; proposed slug per OQ-1 resolution). Content per the repo decision-record template and spec §15 DEC-1:
  - **Decision**: switch the credential-validation probe from v2 `/wiki/api/v2/user/by-me` to v1 `/wiki/rest/api/user/current`, superseding GH-17 DEC-5's v2-only choice.
  - **Rationale / evidence**: (a) inception spike `doc/inception/integration-scenarios/01-authentication.md:39` recorded v2 as "undocumented/unstable … returned 400 in the spike" and v1 `/user/current` as "proven live" (200 with `accountId` + `displayName`); (b) production confirmed the v2 400 (`INVALID_REQUEST_PARAMETER` for `generic-content-type`); (c) this takes the v1 fallback GH-17 DEC-5 explicitly deferred ("add it only if a tenant/credential lacks v2") — framed as taking the deferred fallback, **not** a retroactive condemnation of GH-17; (d) the v1 response satisfies `AccountIdentity` with no schema change; (e) rejected alternative — degrading the `credentials` check to `warn` when downstream checks pass — does not actually validate credentials and masks genuinely bad tokens.
  - **Supersedes**: GH-17 DEC-5 (v2-only). **Consequences**: v2 retired from credential validation; no dual path; revisit trigger = Atlassian deprecates v1 `/user/current`. (AC-8, DEC-1)
- [ ] **2.2** Add the TDR-0010 entry to `doc/decisions/00-index.md` registry table: `| [TDR-0010](./TDR-0010-credential-validation-v1-current-user.md) | TDR | Credential-validation probe — v1 user/current (supersedes GH-17 DEC-5) | Proposed | 2026-07-26 | Juliusz Ćwiąkalski |`. Sequence confirmed: the index tops out at TDR-0009, so TDR-0010 is the next free per-type slot (spec OQ-1 / test-plan OQ-TST-1). (AC-8, TC-TDR-001)

**Acceptance Criteria**:

- Must: `doc/decisions/TDR-0010-<slug>.md` exists and records the reversal of GH-17 DEC-5 with the inception-spike + production-400 rationale (AC-8, TC-TDR-001).
- Must: the TDR frames the change as taking the deferred v1 fallback, not condemning GH-17; the historical GH-17 docs remain frozen (spec NG-5, RSK-3).
- Must: `doc/decisions/00-index.md` lists TDR-0010 with the correct per-type sequence number (AC-8, TC-TDR-001).

**Files and modules**:

- Code areas: none.
- System docs: `doc/decisions/TDR-0010-credential-validation-v1-current-user.md` (new — decision record); `doc/decisions/00-index.md` (updated — registry entry). Current-truth spec/glossary doc sync remains with `@doc-syncer` (lifecycle phase 7).

**Tests**:

- TC-TDR-001 (manual checklist): verify TDR file exists, records the reversal, cites inception + production-400 evidence, and is listed in the index.

**Completion signal**: `docs(decisions): add TDR-0010 credential-validation v1 user/current (supersedes GH-17 DEC-5)`

---

### Phase 3: Finalize and Release — version bump, quality gate, spec reconciliation

**Goal**: Bump the patch version per repo conventions (0.8.0 → 0.8.1), run the full quality gate green, verify no stale v2 reference survives in `src/`/`tests/`, and sign off spec reconciliation (all ACs met, all plan tasks done). The final release phase per the plan-writer contract. Implements AC-6, AC-7; ratifies AC-1..AC-8.

**Tasks**:

- [ ] **3.1** Bump the version in `package.json` from `0.8.0` to `0.8.1` (patch, per `version_impact: patch`; spec §8.5). If `src/cli/commands/router.ts` carries a `CLI_VERSION` constant that must mirror `package.json` (GH-30 F-5 precedent), update it to `0.8.1` and confirm the drift-prevention test (if present) passes; otherwise no router change. (version_impact)
- [ ] **3.2** Run the full quality gate: `bun run check` (lint + format:check + typecheck + test + check:boundaries) — all green (AC-7, TC-URL-008). Confirm the touched test files are picked up: `tests/unit/app/credentials.test.ts`, `tests/integration/credentials.test.ts`, `tests/integration/cli/commands/doctor.test.ts`, `tests/e2e-mock/mock-smoke-probe.test.ts`, `tests/e2e-mock/create-flow.test.ts`.
- [ ] **3.3** Stale-reference verification: `rg "user/by-me" src/ tests/` returns **empty** (RSK-P1). Matches under `doc/changes/**` are frozen history (GH-17/GH-21/GH-30/GH-81) and MUST NOT be edited; matches under `doc/inception/`, `doc/overview/`, `doc/spec/`, `doc/planning/` are current-truth and are reconciled by `@doc-syncer` in lifecycle phase 7 (flagged in "Known doc-risk") — not blocked here.
- [ ] **3.4** Backward-compatibility diff check: `git diff main -- src/domain/credentials.ts` shows **comment-only** changes (no interface body diff); `git diff main -- src/app/credentials.ts` shows the constant value/rename + comment + cause-string only (retry/backoff loop and status-mapping branches unchanged). Confirms AC-6 / NFR-3 (zero contract diff). (AC-6)
- [ ] **3.5** Spec reconciliation sign-off: re-read spec §17 (AC-1..AC-8) against the delivered behavior + tests and confirm each AC is met (see Test Scenarios AC-coverage check). Confirm spec §15 DEC-1 is ratified as TDR-0010 (Phase 2) and spec §14 OQ-1 is resolved.
- [ ] **3.6** Confirm the change is a single bug-fix PR ready for review: endpoint swap + test alignment + TDR-0010 + patch bump in one PR; no feature flag, no migration, no config change (spec §18). Release-note line: "doctor: credential check no longer false-fails — probe moved to the v1 current-user endpoint."

**Acceptance Criteria**:

- Must: version bumped to `0.8.1`; `CLI_VERSION` (if present) matches `package.json`.
- Must: `bun run check` green (AC-7, TC-URL-008).
- Must: `rg "user/by-me" src/ tests/` empty (AC-7, RSK-P1).
- Must: `AccountIdentity` interface body unchanged; `AuthError` union, exit-code map, `DoctorReport` schema, check-id set unchanged (AC-6, NFR-3).
- Must: all spec ACs met (§17 AC-1..AC-8); DEC-1 ratified as TDR-0010; OQ-1 resolved.

**Files and modules**:

- Code areas: `package.json` (version bump); `src/cli/commands/router.ts` (only if `CLI_VERSION` is present and drifts — verify, do not assume).
- System docs: none in this phase (TDR handled in Phase 2; current-truth doc sync is lifecycle phase 7).

**Tests**:

- `bun run check` (full suite) — TC-URL-008.
- `rg "user/by-me" src/ tests/` empty assertion — RSK-P1.
- Spec §17 AC-by-AC sign-off — AC-1..AC-8.

**Completion signal**: `chore(release): bump version to 0.8.1 (patch) for GH-88 credential-probe v1 endpoint`

---

## Test Scenarios

| TC ID | Scenario | Phases | AC Coverage |
|-------|----------|--------|-------------|
| TC-AUTH-001 | Unit: valid env resolution → Basic header (no URL assertion — unchanged) | 1 (verify) | AC-1 |
| TC-AUTH-008 | Unit: v1 probe 200 → identity (UPDATE URL assertion line 221) | 1 | AC-1, AC-4, F-1, F-3 |
| TC-AUTH-008-EXTRA | Unit: v1 200 with extra fields → identity narrowed (NEW test) | 1 | AC-4, F-3, DM-1 |
| TC-AUTH-009 | Unit: v1 probe 401/403 → InvalidCredentials (behavior unchanged) | 1 (verify) | AC-2, F-2, NFR-5 |
| TC-AUTH-010 | Unit: v1 probe network throw → AuthUnreachable (behavior unchanged) | 1 (verify) | AC-3, F-2, NFR-5 |
| TC-AUTH-011 | Unit: v1 probe 429 backoff → bounded retry (behavior unchanged) | 1 (verify) | AC-3, F-2, NFR-5 |
| TC-AUTH-012 | Unit: INV-SEC-1 guard — no token in errors (unchanged) | 1 (verify) | AC-5, NFR-2 |
| TC-INT-AUTH-001 | Integration: mock server v1 probe 200 → identity (UPDATE URL line 81) | 1 | AC-1, AC-4, F-1, F-3 |
| TC-INT-AUTH-002/003 | Integration: mock v1 401/403 → InvalidCredentials (behavior unchanged) | 1 (verify) | AC-2, F-2, NFR-5 |
| TC-INT-AUTH-004 | Integration: mock v1 429 → backoff + retry (behavior unchanged) | 1 (verify) | AC-3, F-2, NFR-5 |
| TC-INT-AUTH-005 | Integration: mock v1 429 forever → bounded AuthUnreachable (behavior unchanged) | 1 (verify) | AC-3, F-2, NFR-5 |
| TC-INT-AUTH-006 | Integration: mock network error → AuthUnreachable (behavior unchanged) | 1 (verify) | AC-3, F-2, NFR-5 |
| TC-DOCTOR-013 | Integration: doctor healthy pre-flight (UPDATE route path line 115) | 1 | AC-1, AC-6, F-1, NFR-3 |
| TC-DOCTOR-014 | Integration: doctor --json envelope validity (UPDATE route path line 168) | 1 | AC-6, NFR-3 |
| TC-DOCTOR-015 | Integration: doctor credentials rejection no token leak (UPDATE route path line 229) | 1 | AC-5, NFR-2 |
| TC-DOCTOR-016 | Integration: doctor bad token → credentials fail (UPDATE route path line 264) | 1 | AC-2, F-2, NFR-5 |
| TC-DOCTOR-017..020 | Integration: space-access/parent-page/probe-capabilities/permission (UPDATE route paths lines 295/330/371/450 per TC-URL-003) | 1 | AC-7, NFR-3 |
| TC-DOCTOR-022 | Integration: gating fail → worstStatus fail (no URL assertion — unchanged) | 1 (verify) | AC-6, NFR-3 |
| TC-URL-001 | Unit test probe URL assertion v2→v1 | 1 | AC-7, NFR-3 |
| TC-URL-002 | Integration test mock URL assertion v2→v1 | 1 | AC-7, NFR-3 |
| TC-URL-003 | Doctor integration test 8 URL refs v2→v1 (lines 115/168/229/264/295/330/371/450) | 1 | AC-7, NFR-3 |
| TC-URL-004 | E2E mock route handler rename v2→v1 (line 169) | 1 | AC-7, NFR-3 |
| TC-URL-005 | E2E smoke-probe URL v2→v1 (lines 20–21) | 1 | AC-7, NFR-3 |
| TC-URL-006 | E2E create-flow no-call assertion path v2→v1 (lines 145–147) | 1 | AC-7, NFR-3 |
| TC-URL-007 | Doctor envelope/exit-code no-diff assertion (validation) | 1, 3 | AC-6, NFR-3 |
| TC-URL-008 | Full test suite passes (`bun run check`) | 1, 3 | AC-7, NFR-3 |
| TC-TDR-001 | TDR file exists and is indexed (manual checklist) | 2 | AC-8, DEC-1 |

**AC coverage check (spec §17):** AC-1 → TC-AUTH-008, TC-INT-AUTH-001, TC-DOCTOR-013 · AC-2 → TC-AUTH-009, TC-INT-AUTH-002/003, TC-DOCTOR-016 · AC-3 → TC-AUTH-010/011, TC-INT-AUTH-004/005/006 · AC-4 → TC-AUTH-008, TC-AUTH-008-EXTRA · AC-5 → TC-AUTH-012, TC-DOCTOR-015 · AC-6 → TC-DOCTOR-014/022, TC-URL-007 · AC-7 → TC-URL-001..008 · AC-8 → TC-TDR-001. **All ACs covered.**

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-88-spec.md | Spec |
| Test plan | ./chg-GH-88-test-plan.md | Test Plan |
| Inception evidence (v1 proven live, v2 broken) | `doc/inception/integration-scenarios/01-authentication.md` (§1A, line 39) | Evidence (frozen — cited, not edited) |
| TDR-0010 (credential-validation v1 user/current) | `doc/decisions/TDR-0010-credential-validation-v1-current-user.md` (new — Phase 2) | Decision |
| Decision index (TDR-0010 entry added) | `doc/decisions/00-index.md` (updated — Phase 2) | Registry |
| Credential provider (probe swap) | `src/app/credentials.ts` (`USER_CURRENT_PATH`, `validateCredentials`, `parseIdentity`) | Code (updated) |
| AccountIdentity type (doc comment only) | `src/domain/credentials.ts` (`AccountIdentity`) | Code (updated — no type change) |
| Unit credentials test (URL flip + new TC-AUTH-008-EXTRA) | `tests/unit/app/credentials.test.ts` | Test (updated) |
| Integration credentials test (URL flip) | `tests/integration/credentials.test.ts` | Test (updated) |
| Integration doctor test (8 route-path flips) | `tests/integration/cli/commands/doctor.test.ts` | Test (updated) |
| E2E mock server (route rename) | `tests/e2e-mock/mock-confluence-server.ts` | Test (updated) |
| E2E mock smoke probe (URL + description) | `tests/e2e-mock/mock-smoke-probe.test.ts` | Test (updated) |
| E2E mock create-flow (no-call assertion path) | `tests/e2e-mock/create-flow.test.ts` | Test (updated) |
| Version manifest (0.8.0 → 0.8.1) | `package.json` | Code (updated — Phase 3) |
| Prior decision reversed (frozen) | GH-17 DEC-5 (`doc/changes/2026-07/2026-07-08--GH-17--auth-provider/**`) | History (NOT edited) |
| Doctor exit-code map (unchanged consumer) | `src/cli/output/exit-codes.ts` (`DOCTOR_FAIL → EXIT_HEALTH` 60, TDR-0009) | Code (unchanged) |
| Coding rules | `.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md` | Standards |
| Conventional Commits enforcement | `doc/decisions/TDR-0008-conventional-commits-enforcement.md` | Decision |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-26 | plan-writer | Initial plan for GH-88. 3 phases: (1) atomic endpoint swap — src constant value+rename+comments/cause-string, domain doc comment, all test URL-literal updates (unit/integration credentials, 8 doctor route refs, e2e-mock route+smoke-probe+create-flow), and the new TC-AUTH-008-EXTRA unit test, committed together so the suite is green at every boundary (src and URL-asserting tests are coupled — splitting them leaves the suite transiently red); (2) TDR-0010 + decision-index entry (AC-8); (3) finalize — patch bump 0.8.0→0.8.1, `bun run check`, `rg "user/by-me" src/ tests/` empty, spec reconciliation. Resolved OQ-1/OQ-TST-1: TDR-0010 is the next free per-type slot (index tops out at TDR-0009). Flagged current-truth doc sync (glossary.md, ubiquitous-language.md, feature-cli.md, nonfunctional.md) as a doc-risk owned by `@doc-syncer` in lifecycle phase 7 — not plan tasks. Flagged test-plan §7.2 mapping-table gap (omits TC-DOCTOR-017..020 URL updates that §5.2 TC-URL-003 enumerates and the file confirms at lines 295/330/371/450) — non-blocking; plan treats all 8 references as in-scope. |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | ☐ Pending | — | — | — | Atomic endpoint swap (src + test URL literals + new AC-4 unit test) |
| Phase 2 | ☐ Pending | — | — | — | TDR-0010 + decision index entry |
| Phase 3 | ☐ Pending | — | — | — | Version bump 0.8.0→0.8.1 + full gate + spec reconciliation |
