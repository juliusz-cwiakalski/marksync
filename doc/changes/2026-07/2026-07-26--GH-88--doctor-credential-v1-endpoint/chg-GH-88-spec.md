---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
change:
  ref: GH-88
  type: fix
  status: Proposed
  slug: doctor-credential-v1-endpoint
  title: "fix: doctor credential check false negative — /wiki/api/v2/user/by-me returns 400"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, doctor, diagnostics, auth, bug]
  version_impact: patch
  audience: internal
  security_impact: low
  risk_level: low
  dependencies:
    internal: [credential-provider (GH-17), doctor-health-check (GH-30), e2e-mock-confluence (GH-81)]
    external: [Atlassian Confluence Cloud REST API (v1 user/current)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Switch the `marksync doctor` credential-validation probe from the broken v2 `/wiki/api/v2/user/by-me` endpoint (HTTP 400) to the inception-proven v1 `/wiki/rest/api/user/current` endpoint, eliminating a false-negative health-check failure for valid credentials while preserving the entire auth-outcome classification contract, the report envelope, and the exit-code semantics.

## 1. SUMMARY

`marksync doctor` falsely fails the `credentials` check ("Auth endpoint unreachable") and exits 60 (`DOCTOR_FAIL`) even when credentials are valid, because it probes the unstable v2 `/wiki/api/v2/user/by-me` endpoint, which now returns HTTP 400. This change swaps the probe to the live-proven v1 `/wiki/rest/api/user/current` endpoint — exactly the deferred fallback GH-17 DEC-5 anticipated — with no change to types, exit codes, the report envelope, or the secret-isolation contract. It is a backward-compatible patch (0.8.0 → 0.8.1) that also records the endpoint reversal as a TDR superseding GH-17 DEC-5's v2-only choice.

## 2. CONTEXT

### 2.1 Current State Snapshot

- The doctor command runs a `credentials` check as the first gating check of its report. A successful probe yields `status: "pass"` with `detail: "Authenticated as <displayName>"`; any auth error yields `status: "fail"` with a typed detail/fix, and the report's worst status drives the process exit code (`DOCTOR_FAIL` → `EXIT_HEALTH` = 60, per TDR-0009).
- The credential provider validates the resolved Confluence credential by issuing a single GET to the v2 current-user endpoint `/wiki/api/v2/user/by-me` via an injected `fetch`, then maps the HTTP outcome: 200 → `{ accountId, displayName }` identity; 401/403 → `InvalidCredentials` (no retry); 429 → bounded backoff honoring `Retry-After`; a thrown `fetch` or any other status → `AuthUnreachable`.
- GH-17 DEC-5 chose v2 `/user/by-me` as the sole MS-0002 validation endpoint and explicitly deferred a v1 `/user/current` fallback ("add it only if a tenant/credential lacks v2").
- The inception API-validation spike recorded the v1 `/wiki/rest/api/user/current` endpoint as "proven live" (HTTP 200 with `accountId` + `displayName`) and flagged the v2 `/wiki/api/v2/user/by-me` endpoint as "undocumented/unstable … returned 400 in the spike", recommending v1-only.

### 2.2 Pain Points / Gaps

- **False-negative credential failure in production.** The v2 `/user/by-me` endpoint returns HTTP 400: `{"errors":[{"status":400,"code":"INVALID_REQUEST_PARAMETER","title":"Provided value {user} for 'generic-content-type' is not the correct type."}]}`. The provider maps any non-200/non-401-403/non-429 status to `AuthUnreachable`; doctor maps `AuthUnreachable` to `status: "fail"` → `DOCTOR_FAIL` → exit 60.
- **Broken CI gate.** The `marksync doctor && marksync publish` pattern fails even though every downstream check (space-access, parent-page, content-property, attachment) passes with the same valid token.
- **Eroded trust.** The doctor report contradicts reality: a healthy environment reads as unhealthy.
- **Known-unknown now confirmed.** The inception spike already observed this exact v2 breakage; GH-17 DEC-5 deferred the v1 fallback precisely for this contingency. Production has now triggered it.

## 3. PROBLEM STATEMENT

Because the credential-validation probe targets the unstable v2 `/wiki/api/v2/user/by-me` endpoint (which returns HTTP 400 despite valid credentials), users running `marksync doctor` cannot get a trustworthy health signal for authentication, resulting in a false `DOCTOR_FAIL` (exit 60) that blocks the `doctor && sync` CI gate and undermines confidence in the doctor report.

## 4. GOALS

- **G-1**: `marksync doctor` reports `credentials` as `pass` (with the authenticated identity) when credentials are valid, against the real Confluence Cloud v1 current-user endpoint.
- **G-2**: A genuinely bad token (HTTP 401/403) and a genuinely unreachable host are still reported as `fail` with the correct detail/fix — zero regression in error classification.
- **G-3**: No change to the credential value type, the `AccountIdentity` shape, the `AuthError` union, the exit-code map, or the `CommandResult<DoctorReport>` envelope. Fully backward compatible.
- **G-4**: The endpoint reversal is recorded as a TDR that supersedes GH-17 DEC-5's v2-only choice, grounded in the inception-spike + production-400 evidence.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| False-negative credential failures for a valid token against reachable Confluence Cloud | 0 |
| `credentials` check exit code with a valid token (no other failing check) | 0 (was 60) |
| Regression in 401/403/unreachable classification | 0 |
| DoctorReport envelope / exit-code schema diffs vs 0.8.0 | 0 |
| Raw token / raw email occurrences in doctor output | 0 (INV-SEC-1) |

### 4.2 Non-Goals

- **NG-1**: No dual v1/v2 fallback path. The v2 endpoint is retired from credential validation; v1 `/user/current` is the sole probe. Keeping the broken v2 probe adds a failure mode for no benefit.
- **NG-2**: No change to credential resolution, the opaque auth-header / masked-email secret-isolation contract (INV-SEC-1), the 429 retry/backoff policy, or the exit-code contract.
- **NG-3**: No change to the `DoctorReport` schema, check ids, or exit semantics.
- **NG-4**: No new runtime dependencies and no new Confluence endpoints beyond the v1 current-user swap.
- **NG-5**: The historical GH-17 change documents (`doc/changes/2026-07/2026-07-08--GH-17--auth-provider/**`) are frozen history and are not edited. The TDR records the reversal; GH-17 DEC-5 stands as written.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Credential validation probes the supported v1 current-user endpoint | The v2 `/user/by-me` endpoint is undocumented/unstable and returns HTTP 400 (observed in the inception spike and confirmed in production); the v1 `/user/current` endpoint is the live-proven, supported current-user endpoint. |
| F-2 | Auth-outcome classification contract is preserved | Only the probed path changes; 401/403 → `InvalidCredentials`, 429 → bounded backoff, network/unexpected → `AuthUnreachable`, 200 → identity must remain unchanged so bad-token and unreachable detection do not regress. |
| F-3 | The `AccountIdentity` result shape is invariant | The v1 200 body carries `accountId` and `displayName` as top-level string fields; the identity parser already narrows on exactly those two fields, so the public type is unchanged. |

### 5.1 Capability Details

**F-1 — Probe target swap.** The credential provider's validation probe issues `GET /wiki/rest/api/user/current` (v1) instead of `GET /wiki/api/v2/user/by-me` (v2), using the same opaque Basic auth header, injected `fetch`, and single-GET semantics. This is the previously-deferred v1 fallback (GH-17 DEC-5 / NG-8), now taken because production confirmed the v2 breakage the inception spike already observed. No dual path is introduced.

**F-2 — Classification invariance.** The HTTP-outcome mapping is unchanged: 200 → identity; 401/403 → `InvalidCredentials` (no retry); 429 → bounded backoff honoring `Retry-After`; a thrown `fetch` or any other status → `AuthUnreachable`. Doctor's consumer mapping (`InvalidCredentials` → "Confluence rejected the credentials"; `AuthUnreachable` → "Auth endpoint unreachable"; success → "Authenticated as <displayName>") is unchanged.

**F-3 — Shape invariance.** A successful v1 response yields `Ok({ accountId, displayName })`. The v1 body contains exactly `accountId` and `displayName` as top-level string fields (per the spike's captured 200 response); extra fields are ignored. The `AccountIdentity` type and its doc references are the only doc-level touch points; there is no schema change.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Valid credentials (the fixed path)
  User: marksync doctor
  Provider: GET {baseUrl}/wiki/rest/api/user/current  (Authorization: Basic <opaque>)
  Confluence: 200 { accountId, displayName, ... }
  Provider: Ok({ accountId, displayName })            // v1 fields narrowed
  Doctor: credentials check → status: "pass", detail: "Authenticated as <displayName>"
  Doctor report: worst status = pass → exit code 0

Flow 2 — Bad token (preserved)
  Provider: GET {baseUrl}/wiki/rest/api/user/current
  Confluence: 401 | 403
  Provider: AuthError { authKind: "InvalidCredentials" }   // no retry
  Doctor: credentials check → status: "fail", detail: "Confluence rejected the credentials",
          fix: "Verify MARKSYNC_API_TOKEN and MARKSYNC_CONFLUENCE_BASE_URL" → exit 60

Flow 3 — Unreachable / unexpected (preserved)
  Provider: GET {baseUrl}/wiki/rest/api/user/current → throws OR returns non-{200,401,403,429}
  Provider: AuthError { authKind: "AuthUnreachable" }
  Doctor: credentials check → status: "fail", detail: "Auth endpoint unreachable" → exit 60
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Switching the credential-validation probe endpoint from v2 `/wiki/api/v2/user/by-me` to v1 `/wiki/rest/api/user/current` (the credential provider, app tier).
- Aligning adjacent comments and the identity-parser's error-cause string to cite the v1 endpoint.
- Aligning the `AccountIdentity` doc references (domain tier) to cite the v1 endpoint — no type change.
- Updating all test fixtures and assertions that assert the probe URL string across tiers (unit, integration, and the e2e-mock tier: the mock server route, the smoke-probe URL, and the create-flow "probe not called during a pipeline run" assertion).
- A new TDR recording the reversal of GH-17 DEC-5 (sequence number proposed as TDR-0010 — see §13/§14), and the decision-record index entry.
- Current-truth doc sync for any doc that cites the v2 validation endpoint (flagged for the doc-sync phase).

### 7.2 Out of Scope

- [OUT] A dual v1/v2 fallback path (NG-1).
- [OUT] Changes to credential resolution, the secret-isolation contract (INV-SEC-1), the 429 backoff policy, the `AuthError` union, the exit-code map, the `DoctorReport` schema, or the check-id set (NG-2/NG-3).
- [OUT] New runtime dependencies or new Confluence endpoints beyond the v1 swap (NG-4).
- [OUT] Editing the frozen GH-17 change documents; the historical DEC-5 stands as written and the TDR records the reversal (NG-5).
- [OUT] Editing the inception scenario `01-authentication.md` — it is already correct (v1-ONLY note) and is cited as evidence, not modified.

### 7.3 Deferred / Maybe-Later

- A configurable / probe-agnostic validation target — only if a future Confluence variant needs it (out of MS-0002 scope).
- Re-evaluating the v1 `/user/current` endpoint if Atlassian deprecates it; revisit the probe target then.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

MarkSync exposes no HTTP endpoints. This change alters a single **outbound** probe only (see §8.4).

### 8.2 Events / Messages

N/A — no events or messages are produced or consumed.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `AccountIdentity` (`{ accountId: string; displayName: string }`) | **Unchanged.** Documented as sourced from the v1 current-user endpoint (was v2). No shape/type change. |
| DM-2 | `ConfluenceCredentials`, `AuthError`, `DoctorReport`, check ids | **Unchanged.** |

### 8.4 External Integrations

**Atlassian Confluence Cloud REST API** — the credential-validation probe target changes:

| Direction | Before | After | Contract |
|-----------|--------|-------|----------|
| Outbound GET (current-user probe) | `GET /wiki/api/v2/user/by-me` (v2, undocumented/unstable) | `GET /wiki/rest/api/user/current` (v1, live-proven) | Same Basic auth header; 200 → `{ accountId, displayName, … }`; 401/403 → invalid creds; 429 → backoff; other → unreachable. |

The v1 endpoint is the same host/path family already exercised by other read paths; no new egress domain. Classic API-token Basic auth over the direct site URL is unchanged. No OAuth, PAT, or scoped-token paths are introduced.

### 8.5 Backward Compatibility

Fully backward compatible at the CLI/contract surface:

- No public type, error union, exit code, report envelope, or check-id change.
- The swapped probe path is module-internal to the credential provider (not an exported contract); no external caller can depend on the v2 string.
- The v1 response satisfies the existing `AccountIdentity` narrowing with no parser change.
- Version impact: **patch** (0.8.0 → 0.8.1).

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | No false-negative credential failure for a valid token against a reachable Confluence Cloud instance | 0 false negatives (the `credentials` check must report `pass`) |
| NFR-2 | Secret isolation (INV-SEC-1) | 0 occurrences of the raw API token, raw email, or raw `Authorization` value in any doctor output path (deterministic) |
| NFR-3 | Backward compatibility of report/exit contract | 0 schema / exit-code / check-id diffs vs 0.8.0 |
| NFR-4 | Probe latency non-regression | A healthy v1 200 probe completes within the same budget as the prior v2 probe (single GET + ≤ 2 bounded 429 retries); p99 ≤ 5 s wall-clock under normal network |
| NFR-5 | Bad-token / unreachable detection non-regression | 401/403 → `InvalidCredentials`; thrown `fetch` or other status → `AuthUnreachable`; 0 misclassifications |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No new metrics, traces, or alerts. The doctor report's existing `credentials` check detail/fix strings remain the observability surface. The only behavioral change is the check passing where it previously false-failed. The structured `--json` output shape is unchanged (NFR-3).

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | The v1 response shape differs subtly from v2 | L | L | The inception spike captured the v1 200 body: it carries `accountId` and `displayName` as top-level string fields, matching `AccountIdentity`; the identity parser already narrows on exactly those two fields. No schema change. | L |
| RSK-2 | An external caller depends on the v2 path string | L | L | The probe path is module-private (not exported); references are confined to the provider, its tests, and the e2e mock — all updated by this change. | L |
| RSK-3 | The TDR reversal is misread as "v2 was always wrong" | L | L | The TDR frames this as taking the previously-deferred v1 fallback (GH-17 DEC-5 / NG-8) because production confirmed the v2 breakage the inception spike already observed — not a retroactive condemnation of GH-17. The historical GH-17 docs remain frozen. | L |

## 12. ASSUMPTIONS

- The v1 `/wiki/rest/api/user/current` endpoint remains supported by Confluence Cloud (it is the endpoint the inception spike recorded as live and "still the supported current endpoint").
- A valid classic API-token Basic credential that passes downstream checks (space-access, parent-page, content-property, attachment) is also accepted by the v1 current-user endpoint.
- The `AccountIdentity` two-field narrowing (`accountId`, `displayName`) is sufficient for the doctor "Authenticated as <displayName>" detail, as it is today.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | GH-17 — Auth provider (merged) | Delivered the credential provider, `AccountIdentity`, and DEC-5 (v2-only) that this change revises. |
| Depends on | GH-30 — Doctor health check (merged) | Delivered the `credentials` check consumer; unchanged by this fix. |
| Depends on | GH-81 — E2E mock Confluence (merged) | Delivered the mock current-user route to be renamed to v1. |
| Depends on | Atlassian Confluence Cloud REST API | The v1 `/user/current` endpoint (read-only probe). |
| Produces | TDR-0010 (proposed sequence) | Records the reversal of GH-17 DEC-5; authored during delivery by `@decision-advisor`. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Confirm the decision-record sequence number for the endpoint-reversal TDR | The decision index currently tops out at TDR-0009; the next free slot is proposed as **TDR-0010**, to be assigned/confirmed by `@decision-advisor`. | Decision needed: consult `@decision-advisor` |
| OQ-2 | Are there current-truth docs beyond `glossary.md` and `ubiquitous-language.md` that cite the v2 validation endpoint? | A repo-wide scan for the v2 validation-endpoint reference is part of the doc-sync phase; the inception doc `01-authentication.md` is already correct and is explicitly out of scope. | Resolve during phase 7 via `@doc-syncer` |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | Switch the credential-validation probe from v2 `/wiki/api/v2/user/by-me` to v1 `/wiki/rest/api/user/current`, superseding GH-17 DEC-5's v2-only choice. | The inception spike proved v1 live and observed v2 returning 400; production has now confirmed the v2 400, taking the v1 fallback GH-17 DEC-5 explicitly deferred ("add it only if a tenant/credential lacks v2"). The v1 response satisfies `AccountIdentity` with no schema change, and a single v1 path avoids adding a failure mode. Rejected alternative (degrade the credentials check to `warn` when downstream passes) does not actually validate credentials and masks genuinely bad tokens. | 2026-07-26 |

> DEC-1 is to be ratified as **TDR-0010** (proposed) by `@decision-advisor` during delivery and listed in `doc/decisions/00-index.md`.

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Confluence credential provider (app tier) | Updated — probe endpoint v2 → v1; adjacent comments and the identity-parser error-cause string aligned to v1 |
| Doctor command (app tier) | Unchanged consumer — benefits from the fix; no code change |
| `AccountIdentity` type (domain tier) | Updated — doc comment only; no shape change |
| Test suite — unit (credential provider) | Updated — expected probe URL string only |
| Test suite — integration (credential provider, doctor wiring) | Updated — mock server URL + doctor URL assertions only |
| E2E mock tier (mock Confluence server, smoke probe, create-flow) | Updated — current-user route renamed to v1; smoke-probe URL; no-call assertion path |
| Decision records | New — TDR-0010 (proposed) + `00-index.md` entry |
| Current-truth docs (glossary, ubiquitous-language, any other v2-citing doc) | Updated — cite the v1 validation endpoint (doc-sync phase) |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-1 | **Given** valid Confluence credentials and a reachable base URL, **when** `marksync doctor` runs, **then** the `credentials` check reports `status: "pass"` with `detail: "Authenticated as <displayName>"`, and the process exit code is `0` when no other check fails. | F-1, F-3, NFR-1 |
| AC-2 | **Given** an invalid/expired token (HTTP 401 or 403 from the v1 endpoint), **when** `marksync doctor` runs, **then** the `credentials` check reports `status: "fail"` with detail indicating Confluence rejected the credentials and a fix suggesting verification of the token/base URL (no regression vs current 401/403 handling — only the probed path changed). | F-2, NFR-5 |
| AC-3 | **Given** the base URL is unreachable (network error) or returns an unexpected status, **when** `marksync doctor` runs, **then** the `credentials` check reports `status: "fail"` (the `AuthUnreachable` path) with the existing detail/fix text (no regression). | F-2, NFR-5 |
| AC-4 | **Given** a successful v1 `GET /wiki/rest/api/user/current` 200 response, **then** the credential provider returns `Ok({ accountId, displayName })` parsed from the response, and the `AccountIdentity` type is unchanged. | F-3, DM-1 |
| AC-5 | **Given** doctor runs on any path, **then** no raw token, raw email, or raw `Authorization` value appears anywhere in the output (INV-SEC-1 preserved — the endpoint switch does not touch the secret-isolation contract). | NFR-2 |
| AC-6 | **Given** doctor runs on any path, **then** the `CommandResult<DoctorReport>` envelope shape, the `DOCTOR_FAIL` → `EXIT_HEALTH` (60) mapping, and the check-id set are unchanged. | NFR-3, DM-2 |
| AC-7 | **Given** the implementation is complete, **when** the full quality gate (`bun run check`) runs, **then** all existing tests pass with the updated endpoint URLs (unit credentials, integration credentials, integration doctor, e2e-mock route + smoke probe + create-flow assertion). | NFR-3 |
| AC-8 | **Given** the change merges, **then** a TDR exists under `doc/decisions/` recording the reversal of GH-17 DEC-5 with the inception-spike + production-400 rationale, and `doc/decisions/00-index.md` lists it. | DEC-1 |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- Single bug-fix PR to `main`; no feature flag, no migration, no config change.
- Patch release 0.8.0 → 0.8.1 via the existing tag-triggered binary release pipeline (GH-32); no new release machinery.
- Order: endpoint swap + test updates + TDR + current-truth doc sync in one change; the TDR is authored during delivery (phase 6) and the doc sync in phase 7.
- Communication: release-note line "doctor: credential check no longer false-fails — probe moved to the v1 current-user endpoint."

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no persisted state, lock, cache, or config schema is touched. The disposable `.marksync/` cache and the committed lock are unaffected.

## 20. PRIVACY / COMPLIANCE REVIEW

The v1 current-user endpoint returns the same PII already handled today (`accountId`, `displayName`); no new personal data is collected, retained, or transmitted beyond the existing probe. INV-SEC-1 (no token/email leakage) is preserved (NFR-2). No new egress domain or third party is introduced.

## 21. SECURITY REVIEW HIGHLIGHTS

- **Secret isolation (INV-SEC-1):** untouched — the opaque `authHeader` and masked-email flow is identical; the endpoint switch never serializes the raw token.
- **Egress surface:** unchanged host (`{site}.atlassian.net`), same `/wiki/...` path family already used by read paths; no new outbound domain.
- **Auth handling / redaction:** no change to the Basic-auth header construction, the redactor, or the `cause`-not-in-message discipline (inherited from GH-17, not altered).
- **security_impact: low** — a read-only current-user probe target swap on an already-authenticated path.

## 22. MAINTENANCE & OPERATIONS IMPACT

- Restores trust in the doctor report and unblocks the `marksync doctor && marksync publish` CI gate pattern.
- No new operational burden: same single probe, same retry budget, same exit codes.
- Future endpoint drift is governed by the new TDR's revisit trigger (re-evaluate if Atlassian deprecates v1 `/user/current`).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| AccountIdentity | `{ accountId: string; displayName: string }` — the success payload of credential validation, now sourced from the v1 current-user endpoint. |
| Current-user probe | The single read-only GET the credential provider issues to validate the credential and fetch the authenticated identity. |
| v1 current-user endpoint | `GET /wiki/rest/api/user/current` — the inception-proven, supported current-user endpoint. |
| v2 current-user endpoint | `GET /wiki/api/v2/user/by-me` — undocumented/unstable; returns HTTP 400 (spike + production). Retired from credential validation by this change. |
| Doctor health check | `marksync doctor`'s gating checks; `DOCTOR_FAIL` → `EXIT_HEALTH` (60) per TDR-0009. |
| INV-SEC-1 | The raw API token is never stored on any value object or error; only the opaque auth header and masked email survive. |
| GH-17 DEC-5 | The prior "v2-only" probe strategy; superseded by this change's TDR. |

## 24. APPENDICES

- **Inception evidence:** `doc/inception/integration-scenarios/01-authentication.md` — §1A records v1 `/user/current` as "proven live" (200 with `accountId` + `displayName`) and the note that v2 `/user/by-me` is "undocumented/unstable … returned 400 in the spike".
- **Production failure:** the v2 endpoint returns `HTTP 400 {"errors":[{"status":400,"code":"INVALID_REQUEST_PARAMETER","title":"Provided value {user} for 'generic-content-type' is not the correct type."}]}`.
- **Prior decision reversed:** GH-17 DEC-5 (v2 `/user/by-me` as the sole MS-0002 validation endpoint; v1 fallback deferred to "only if a tenant/credential lacks v2").

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-26 | spec-writer (GH-88) | Initial specification — v2 → v1 credential-probe endpoint swap, supersedes GH-17 DEC-5. |

---

## AUTHORING GUIDELINES

- Authored from the GH-88 planning-session context and verified against repository evidence: the credential provider, the doctor consumer wiring, the inception API-validation spike, the GH-17 DEC-5 record, and the decision-records index.
- Source of truth for evidence: `doc/inception/integration-scenarios/01-authentication.md` (cited, not duplicated). The GH-17 change documents are treated as frozen history and are not restated.
- The spec is intentionally implementation-free: it names components and contracts (the credential provider, the doctor consumer, the `AccountIdentity` type, the probe endpoint, the test tiers, the TDR, the current-truth docs), not file paths or step-by-step tasks — those belong to the plan and test plan.
- The endpoint reversal is captured as a decision (DEC-1) to be ratified as a TDR by `@decision-advisor` during delivery; the current-truth doc references are flagged for `@doc-syncer` (phase 7).

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-88)
- [x] `owners` has at least one entry (`[Juliusz Ćwiąkalski]`)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-1..F-3, AC-1..AC-8, NFR-1..NFR-5, RSK-1..RSK-3, DEC-1, DM-1..DM-2, OQ-1..OQ-2)
- [x] Acceptance criteria reference at least one F-/NFR-/DM-/DEC- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs (inception evidence is cited, not copied)
- [x] Front matter validates per front_matter_rules
