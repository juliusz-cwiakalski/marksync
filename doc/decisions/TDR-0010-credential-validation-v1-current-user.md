---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: TDR-0010
decision_type: tdr
status: Proposed
created: 2026-07-26
decision_date: null
last_updated: 2026-07-26
summary: "Switch the credential-validation probe from v2 `/wiki/api/v2/user/by-me` to v1 `/wiki/rest/api/user/current`, superseding GH-17 DEC-5's v2-only choice. The inception API-validation spike recorded v2 as 'undocumented/unstable … returned 400 in the spike' and v1 as 'proven live'; production has now confirmed the v2 400, taking the v1 fallback GH-17 DEC-5 explicitly deferred ('add it only if a tenant/credential lacks v2'). This is not a retroactive condemnation of GH-17 — it is taking the previously-deferred fallback because the contingency has triggered."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_scope: repo
review_date: null
business_impact: "Direct: restores trust in the `marksync doctor` credentials check by eliminating false-negative failures for valid credentials, unblocking the `marksync doctor && marksync sync` CI gate pattern."
customer_impact: "Users running `marksync doctor` with valid credentials no longer see a false `DOCTOR_FAIL` (exit 60) for the `credentials` check; the report correctly shows `pass` when the token is accepted by Confluence Cloud."
classification:
  domains: [api, observability]
  archetype: design
  environment: clear
  rigor: R2
  reversibility: moderate
  stakes: medium
  urgency: high
  uncertainty: low
  blast_radius: local
  recurrence: one-off
governance:
  driver: decision-advisor
  decider: Juliusz Ćwiąkalski
  contributors: ["pm (GH-88 spec + plan)", "coder (GH-88 delivery)"]
  reviewers: [Juliusz Ćwiąkalski]
  performers: ["coder (GH-88 delivery — implements src swap + test updates)"]
  informed: []
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: true
  human_decider: null
  reviewers: []
revisit_triggers:
  - "Atlassian deprecates v1 `/wiki/rest/api/user/current` — re-evaluate the probe target (likely v3 if available, or add v1/v2 dual-path as a last resort)."
  - "Production observes v1 returning 400/other unexpected status — investigate whether Confluence has re-broken the current-user endpoint."
  - "A tenant/credential combination is found where v1 does not work but v2 does — revisit the 'v2 is retired' assumption and consider a dual v1/v2 fallback path."
links:
  related_changes: ["GH-17", "GH-88"]
  supersedes: ["GH-17 DEC-5"]
  superseded_by: []
  spec:
    - "doc/changes/2026-07/2026-07-26--GH-88--doctor-credential-v1-endpoint/chg-GH-88-spec.md"
    - "doc/changes/2026-07/2026-07-08--GH-17--auth-provider/chg-GH-17-spec.md"
  contracts:
    - "src/app/credentials.ts"
    - "src/domain/credentials.ts"
    - "tests/unit/app/credentials.test.ts"
    - "tests/integration/credentials.test.ts"
    - "tests/integration/cli/commands/doctor.test.ts"
    - "tests/e2e-mock/mock-confluence-server.ts"
    - "tests/e2e-mock/mock-smoke-probe.test.ts"
    - "tests/e2e-mock/create-flow.test.ts"
  diagrams: []
  decisions: []
  experiments: []
  metrics: []
  roadmap_items: ["MS-0002"]
---

# TDR-0010: Credential-validation probe — v1 user/current (supersedes GH-17 DEC-5)

## Context

`marksync doctor`'s `credentials` check falsely fails with status "fail" ("Auth endpoint unreachable") and exits 60 (`DOCTOR_FAIL`) even when the Confluence Cloud API token is valid, because the credential provider's validation probe targets the v2 `/wiki/api/v2/user/by-me` endpoint, which now returns HTTP 400 in production.

The credential provider maps any non-{200,401,403,429} status to `AuthUnreachable`; doctor maps `AuthUnreachable` to `status: "fail"` → `DOCTOR_FAIL` → `EXIT_HEALTH` (60, per TDR-0009). This breaks the `marksync doctor && marksync sync` CI gate pattern even though every downstream check (space-access, parent-page, content-property, attachment) passes with the same valid token.

The inception API-validation spike (`doc/inception/integration-scenarios/01-authentication.md`) already observed this exact v2 breakage: it recorded v2 as "undocumented/unstable … returned 400 in the spike" and v1 `/user/current` as "proven live" (HTTP 200 with `accountId` + `displayName`). GH-17 DEC-5 chose v2 `/user/by-me` as the sole MS-0002 validation endpoint and explicitly deferred a v1 fallback ("add it only if a tenant/credential lacks v2"). Production has now triggered that contingency.

This decision switches the probe to the live-proven v1 `/wiki/rest/api/user/current` endpoint — exactly the deferred fallback GH-17 DEC-5 anticipated — with no change to types, exit codes, the report envelope, or the secret-isolation contract.

## Problem Framing

The credential-validation probe targets an unstable, undocumented v2 endpoint that Confluence Cloud now rejects with HTTP 400 (error code `INVALID_REQUEST_PARAMETER` for `generic-content-type`). This causes a false-negative credential failure: the doctor command reports the `credentials` check as `fail` despite the credentials being valid, because the provider maps the unexpected 400 to `AuthUnreachable`.

**This is a single-value change:** the probe endpoint URL v2 → v1. All other behavior (status mapping, 429 backoff, secret isolation, `AccountIdentity` shape, exit-code contract, `DoctorReport` schema) is unchanged.

The key question is: **which endpoint should the credential-validation probe target?** The options are:

- **Option A:** Switch to the inception-proven v1 `/wiki/rest/api/user/current` endpoint (the deferred fallback from GH-17 DEC-5).
- **Option B:** Keep the broken v2 `/wiki/api/v2/user/by-me` endpoint and accept false negatives (unacceptable — defeats the purpose of a health check).
- **Option C:** Add a dual v1/v2 fallback path (rejected per spec NG-1 — adds a failure mode for no benefit; the v2 endpoint is retired, not conditional).
- **Option D:** Degrade the `credentials` check to `warn` when downstream checks pass (rejected — does not actually validate credentials and masks genuinely bad tokens).

## Constraints

### C-1: No type, contract, envelope, or exit-code change (G-3 / NFR-3)

- **Statement:** The `AccountIdentity` type, `AuthError` union, `DoctorReport` schema, exit-code map, and check-id set are unchanged. The probe path is module-internal (not an exported contract).
- **Source:** Spec G-3, NFR-3, AC-6.
- **Verification:** Diff shows `AccountIdentity` interface body unchanged; only doc comments change. `git diff main -- src/domain/credentials.ts` is comment-only. `git diff main -- src/app/credentials.ts` shows only the constant value/rename + comments, no retry/backoff or status-mapping changes.
- **Negotiable:** no.

### C-2: Secret isolation preserved (INV-SEC-1 / NFR-2)

- **Statement:** No raw token, raw email, or raw `Authorization` value appears in any doctor output path. The endpoint switch never touches the opaque `authHeader` construction, the masked-email flow, or the `cause`-not-in-message discipline.
- **Source:** Spec G-3, NFR-2, AC-5.
- **Verification:** TC-AUTH-012 and TC-DOCTOR-015 assert no token in error objects or JSON output.
- **Negotiable:** no.

### C-3: Zero regression in error classification (NFR-5)

- **Statement:** 401/403 → `InvalidCredentials`; 429 → bounded backoff; network/other → `AuthUnreachable`. No classification regression vs the v2 probe.
- **Source:** Spec G-2, NFR-5, AC-2, AC-3.
- **Verification:** TC-AUTH-009/010/011 and TC-INT-AUTH-002..006 assert status mapping unchanged.
- **Negotiable:** no.

### C-4: Test suite green at every commit (plan house rule)

- **Statement:** `bun run check` (lint + format:check + typecheck + test + check:boundaries) must pass after the endpoint swap. The src constant change and all URL-literal test updates are atomic in a single commit to avoid transient red.
- **Source:** Plan "Resolved design point," AC-7, TC-URL-008.
- **Verification:** All 1310 tests pass after Phase 1.
- **Negotiable:** no.

## Decision Drivers

**Technical drivers:**

1. **Production correctness (highest).** The doctor health check must be trustworthy. A false-negative credential failure undermines confidence and breaks CI gates for valid credentials.
2. **Spike evidence.** The inception API-validation spike already proved v1 live and observed v2 returning 400. This is not a surprise; it is a documented risk materializing.
3. **Contract minimality.** The v1 response satisfies `AccountIdentity` with no parser change (two-field narrowing on `accountId` + `displayName`). No new types or schemas.
4. **GH-17 DEC-5 deference.** The decision explicitly deferred the v1 fallback ("add it only if a tenant/credential lacks v2"). Taking it now respects the original intent.

**Counter-drivers:**

5. **Historical consistency (low weight).** Changing the probe after GH-17 may appear as a reversal. This is mitigated by framing it as taking the previously-deferred fallback, not condemning GH-17.

## Evidence, Assumptions & Unknowns

| Item | Label | Source | Impact if false | Confidence |
|------|-------|--------|-----------------|------------|
| v2 `/wiki/api/v2/user/by-me` returns HTTP 400 in production with `INVALID_REQUEST_PARAMETER` | FACT | Production logs; error body quoted in spec §2.2 | n/a (foundational) | High |
| Inception spike recorded v1 `/wiki/rest/api/user/current` as "proven live" (200 with `accountId` + `displayName`) | FACT | `doc/inception/integration-scenarios/01-authentication.md:39` | n/a (foundational) | High |
| v1 response shape includes `accountId` and `displayName` as top-level string fields | FACT | Spike-captured body (see spec Appendix) | n/a (foundational) | High |
| v1 may include extra fields (`type`, `accountType`, `publicName`, `_links`) that are ignored by the two-field narrowing | FACT | Spike-captured body; `parseIdentity` narrows on exactly two fields | n/a (foundational) | High |
| The probe path is module-internal (not exported) | FACT | `src/app/credentials.ts` — `USER_CURRENT_PATH` is not exported | n/a (foundational) | High |
| No external caller depends on the v2 path string | ASSUMPTION | Repo-wide grep confirms no external importer; tests are updated | Medium — a plugin or consumer could depend on the string | High |
| Atlassian will not deprecate v1 `/user/current` in the near term | ASSUMPTION | No public deprecation notice; v1 is the documented current-user endpoint | Medium — revisit trigger added | High |

## Alternatives Considered

### Option A: Switch to v1 `/wiki/rest/api/user/current` (CHOSEN)

**Description:** Replace the probe endpoint constant value and all URL-literal test assertions from `/wiki/api/v2/user/by-me` to `/wiki/rest/api/user/current`. Rename the constant from `USER_BY_ME_PATH` to `USER_CURRENT_PATH` to avoid a misleading name. Update doc comments and the `parseIdentity` cause string to cite v1. Add a unit test proving the v1 body with extra fields narrows to `AccountIdentity`.

**Pros:**
- Fixes the production false-negative credential failure.
- Aligns with the inception-spike evidence and the GH-17 DEC-5 deferred fallback.
- Zero contract change (no type/exit-code/envelope diff).
- Test coverage is comprehensive (1310 tests pass, including new AC-4 extra-field test).
- Simple single-value change, easy to reason about and maintain.

**Cons:**
- Requires updating ~15 URL literals across the test suite (handled atomically in Phase 1).
- Historical appearance of reversal (mitigated by TDR framing).

**Verification:** Phase 1 commit 1572b5c; `bun run check` green; all acceptance criteria met.

### Option B: Keep v2 `/wiki/api/v2/user/by-me` (REJECTED)

**Description:** Do nothing and accept false-negative credential failures as "expected behavior."

**Pros:**
- No code change.

**Cons:**
- Breaks the doctor health check's trustworthiness for valid credentials.
- Breaks the `marksync doctor && marksync sync` CI gate pattern.
- Ignores the inception-spike evidence and the GH-17 DEC-5 deference.
- Defeats the purpose of a health check.

**Rationale for rejection:** Unacceptable. A health check that falsely reports failure for valid credentials is worse than no check at all.

### Option C: Dual v1/v2 fallback path (REJECTED per spec NG-1)

**Description:** Probe v1 first; if it fails (e.g., tenant lacks v1), fall back to v2. Or probe v2 first and fall back to v1.

**Pros:**
- Handles edge cases where one endpoint works but the other does not.

**Cons:**
- Adds complexity and a new failure mode (dual-path coordination).
- The v2 endpoint is documented as unstable; keeping it in the critical path adds risk.
- No evidence today that any tenant/credential combination needs v2 (spec NG-1).
- Defeats the single-value simplicity goal.

**Rationale for rejection:** Spec NG-1 (no dual path). The v2 endpoint is retired, not conditional.

### Option D: Degrade `credentials` check to `warn` (REJECTED)

**Description:** If the credentials probe fails, set the check status to `warn` instead of `fail`, but only if downstream checks (space-access, parent-page, etc.) pass. This would make doctor exit 0 when credentials are bad but other checks pass, which is misleading.

**Pros:**
- Avoids blocking the CI gate when the probe endpoint is flaky.

**Cons:**
- Does not actually validate credentials — masks genuinely bad tokens.
- Violates the health check contract (a "pass" or "warn" on `credentials` should mean the token is good).
- Misleads users into thinking their credentials are valid when they are not.

**Rationale for rejection:** Does not solve the core problem. A `warn` on `credentials` while the token is bad is a silent failure.

## Decision

**Switch the credential-validation probe from v2 `/wiki/api/v2/user/by-me` to v1 `/wiki/rest/api/user/current`, superseding GH-17 DEC-5's v2-only choice.**

This is not a retroactive condemnation of GH-17 — it is taking the previously-deferred v1 fallback because production has confirmed the v2 breakage the inception spike already observed. The historical GH-17 docs remain frozen and stand as written.

### Implementation

**Phase 1 (atomic):** Source constant swap + all URL-literal test updates + new AC-4 unit test (TC-AUTH-008-EXTRA). Commit 1572b5c — `fix(credentials): probe v1 user/current instead of broken v2 user/by-me`. `bun run check` green (1310 tests pass).

**Phase 2 (this record):** Author TDR-0010 and add the `doc/decisions/00-index.md` entry.

**Phase 3:** Version bump 0.8.0 → 0.8.1 (patch), full quality gate, spec reconciliation.

### Consequences

**Immediate:**
- The `credentials` check reports `pass` for valid tokens against the v1 endpoint.
- The `marksync doctor && marksync sync` CI gate pattern is unblocked.
- Zero type/contract/exit-code/envelope change (backward compatible).

**Long-term:**
- v2 `/wiki/api/v2/user/by-me` is retired from credential validation.
- No dual v1/v2 path (spec NG-1).
- Revisit trigger: if Atlassian deprecates v1 `/user/current`, re-evaluate the probe target.

### Risks and Mitigations

| Risk | Impact | Mitigation | Residual |
|------|--------|------------|----------|
| RSK-1: The v1 response shape differs subtly from v2 | L | Inception spike captured the v1 body; `parseIdentity` narrows on exactly `accountId` + `displayName`; TC-AUTH-008-EXTRA tests extra-field ignoring | L |
| RSK-2: An external caller depends on the v2 path string | L | The probe path is module-private; repo-wide grep confirms no external importer; tests are updated | L |
| RSK-3: The TDR reversal is misread as "v2 was always wrong" | L | The TDR frames this as taking the deferred v1 fallback (GH-17 DEC-5 / NG-8) because production confirmed the v2 breakage | L |
| RSK-4: A tenant/credential combination is found where v1 does not work but v2 does | L | No evidence today; revisit trigger added to re-evaluate if this emerges | L |

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-26 | decision-advisor (GH-88) | Initial decision — endpoint reversal v2 → v1, superseding GH-17 DEC-5 |

## Appendix: Inception-spike evidence (cited)

From `doc/inception/integration-scenarios/01-authentication.md` (§1A, line 39):

> "The v2 `/wiki/api/v2/user/by-me` endpoint is undocumented/unstable — it returned 400 in the spike with `INVALID_REQUEST_PARAMETER` for `generic-content-type`. The v1 `/wiki/rest/api/user/current` endpoint is the live-proven current-user endpoint — it returned 200 with `accountId` and `displayName` as top-level string fields."

From GH-17 DEC-5 (v2-only probe strategy, superseded by this decision):

> "Choose v2 `/wiki/api/v2/user/by-me` as the sole MS-0002 validation endpoint. Defer a v1 `/user/current` fallback — add it only if a tenant/credential lacks v2."

This decision takes that deferred v1 fallback because production has now confirmed the v2 breakage the inception spike already observed.