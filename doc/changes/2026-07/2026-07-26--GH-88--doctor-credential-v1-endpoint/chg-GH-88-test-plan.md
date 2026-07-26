---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-88-test-plan
status: Proposed
created: 2026-07-26
last_updated: 2026-07-26
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, doctor, diagnostics, auth, bug]
version_impact: patch
summary: "Switch doctor credential probe from v2 /wiki/api/v2/user/by-me to v1 /wiki/rest/api/user/current to eliminate false-negative credential failures"
links:
  change_spec: ./chg-GH-88-spec.md
  implementation_plan: null
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - fix: doctor credential check false negative — /wiki/api/v2/user/by-me returns 400

## 1. Scope and Objectives

This test plan validates the endpoint swap for the credential-validation probe from the broken v2 `/wiki/api/v2/user/by-me` endpoint to the stable v1 `/wiki/rest/api/user/current` endpoint. The change restores trust in the `marksync doctor` credentials check by eliminating false-negative failures for valid credentials while preserving the entire auth-outcome classification contract, the report envelope, the exit-code semantics, and the secret-isolation invariant (INV-SEC-1).

### 1.1 In Scope

- Unit-level validation of the probe URL change and HTTP outcome mapping (200, 401, 403, 429, network errors, unexpected statuses)
- Integration-level validation of the doctor command wiring against the v1 endpoint via Bun.serve mock
- E2E-mock tier validation of the mock server route handler rename and the DEC-1 invariant (validateCredentials never called during pipeline run)
- Verification of backward compatibility: no change to envelope, exit codes, check IDs, or secret isolation
- Verification of the v1 response body shape parsing (including extra field ignoring)
- Verification that the TDR recording the endpoint reversal exists and is indexed

### 1.2 Out of Scope & Known Gaps

- Live-sandbox testing against real Confluence Cloud (secrets-gated, separate CI gate)
- Performance regression testing beyond the existing test suite benchmark (NFR-4 covered by existing unit/integration test budget)
- Dual v1/v2 fallback path testing (NG-1: single v1 path only)

## 2. References

- Change specification: `chg-GH-88-spec.md`
- Testing strategy: `.ai/rules/testing-strategy.md`
- Inception API validation evidence: `doc/inception/integration-scenarios/01-authentication.md` (v1 endpoint recorded as live-proven)
- GH-17 DEC-5 (v2-only probe strategy, superseded by this change)
- TDR-0009 (doctor exit-code mapping)
- DEC-1 (validateCredentials never called during pipeline run — invariant validated in create-flow.test.ts)

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-1 | Valid credentials → pass with identity, exit 0 | TC-AUTH-001, TC-INT-AUTH-001, TC-DOCTOR-013 | Covered |
| AC-2 | Bad token (401/403) → fail with correct detail/fix, no regression | TC-AUTH-009, TC-INT-AUTH-002/003, TC-DOCTOR-016 | Covered |
| AC-3 | Unreachable/unexpected → fail AuthUnreachable, no regression | TC-AUTH-010, TC-AUTH-011, TC-INT-AUTH-004/005/006 | Covered |
| AC-4 | v1 200 → Ok({accountId, displayName}), shape unchanged with extra fields ignored | TC-AUTH-008, TC-AUTH-008-EXTRA | Covered |
| AC-5 | No secret leak (INV-SEC-1) preserved | TC-AUTH-012, TC-DOCTOR-015 | Covered |
| AC-6 | No envelope/exit-code/check-id change | TC-DOCTOR-014, TC-DOCTOR-022 | Covered |
| AC-7 | Full suite passes with updated URLs | TC-URL-001..008 (meta) | Covered |
| AC-8 | TDR recorded and indexed | TC-TDR-001 (checklist) | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| Interface ID | Description | TC ID(s) | Status |
|--------------|-------------|----------|--------|
| DM-1 | `AccountIdentity` type unchanged (no shape/type change) | TC-AUTH-008, TC-AUTH-008-EXTRA | Covered |
| DM-2 | `ConfluenceCredentials`, `AuthError`, `DoctorReport`, check IDs unchanged | TC-DOCTOR-014, TC-DOCTOR-022 | Covered |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status |
|--------|-------------|----------|--------|
| NFR-1 | Zero false-negative credential failures for valid token | TC-AUTH-001, TC-INT-AUTH-001, TC-DOCTOR-013 | Covered |
| NFR-2 | Secret isolation (INV-SEC-1) — no raw token/email in output | TC-AUTH-012, TC-DOCTOR-015 | Covered |
| NFR-3 | Backward compatibility of report/exit contract | TC-DOCTOR-014, TC-DOCTOR-022 | Covered |
| NFR-4 | Probe latency non-regression (covered by existing test budget) | Existing test suite | Covered |
| NFR-5 | Bad-token/unreachable detection non-regression | TC-AUTH-009, TC-AUTH-010, TC-AUTH-011, TC-INT-AUTH-002/003/004/005/006 | Covered |

## 4. Test Types and Layers

### Unit Tests
- **Framework**: `bun:test`
- **Location**: `tests/unit/app/credentials.test.ts`
- **Scope**: Pure credential-provider logic, stub fetch with per-call status sequencing, validateCredentials HTTP outcome mapping, parseIdentity narrowing
- **Coverage**: AC-1, AC-2, AC-3, AC-4, AC-5

### Integration Tests
- **Framework**: `bun:test` + `Bun.serve()` mock
- **Location**: `tests/integration/credentials.test.ts`, `tests/integration/cli/commands/doctor.test.ts`
- **Scope**: Real HTTP against mock server, doctor command wiring, envelope/exit-code validation, secret-isolation validation
- **Coverage**: AC-1, AC-2, AC-3, AC-5, AC-6

### E2E Mock Tests
- **Framework**: `bun:test` + stateful node:http mock server
- **Location**: `tests/e2e-mock/mock-confluence-server.ts`, `tests/e2e-mock/mock-smoke-probe.test.ts`, `tests/e2e-mock/create-flow.test.ts`
- **Scope**: Full-pipeline mock regression, route handler rename, DEC-1 invariant validation
- **Coverage**: AC-3 (DEC-1 invariant)

### Checklist Verification
- **Location**: Manual verification during delivery phase 6
- **Scope**: TDR file existence and index entry
- **Coverage**: AC-8

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-AUTH-001 | Valid env resolution → Basic header | Happy Path | Unit | High | AC-1 |
| TC-AUTH-008 | v1 probe 200 → identity (UPDATE URL) | Happy Path | Unit | High | AC-1, AC-4 |
| TC-AUTH-008-EXTRA | v1 200 with extra fields → identity narrowed | Happy Path | Unit | High | AC-4 |
| TC-AUTH-009 | v1 probe 401/403 → InvalidCredentials | Negative | Unit | High | AC-2 |
| TC-AUTH-010 | v1 probe network throw → AuthUnreachable | Negative | Unit | High | AC-3 |
| TC-AUTH-011 | v1 probe 429 backoff → bounded retry | Edge Case | Unit | Medium | AC-3 |
| TC-AUTH-012 | INV-SEC-1 unit guard — no token in errors | Security | Unit | High | AC-5 |
| TC-INT-AUTH-001 | Mock server v1 probe 200 → identity (UPDATE URL) | Happy Path | Integration | High | AC-1 |
| TC-INT-AUTH-002/003 | Mock server v1 probe 401/403 → InvalidCredentials (UPDATE URL) | Negative | Integration | High | AC-2 |
| TC-INT-AUTH-004 | Mock server v1 429 → backoff + retry (UPDATE URL) | Edge Case | Integration | Medium | AC-3 |
| TC-INT-AUTH-005 | Mock server v1 429 forever → bounded AuthUnreachable (UPDATE URL) | Edge Case | Integration | Medium | AC-3 |
| TC-INT-AUTH-006 | Mock server network error → AuthUnreachable (UPDATE URL) | Negative | Integration | High | AC-3 |
| TC-DOCTOR-013 | Doctor healthy pre-flight (UPDATE ~8 URL refs) | Happy Path | Integration | High | AC-1 |
| TC-DOCTOR-014 | Doctor --json envelope validity (UPDATE URL) | Happy Path | Integration | High | AC-6 |
| TC-DOCTOR-015 | Doctor credentials rejection no token leak (UPDATE URL) | Security | Integration | High | AC-5 |
| TC-DOCTOR-016 | Doctor bad token → credentials fail (UPDATE URL) | Negative | Integration | High | AC-2 |
| TC-DOCTOR-022 | Doctor gating fail → worstStatus fail (no URL change) | Regression | Integration | Medium | AC-6 |
| TC-URL-001 | Unit test probe URL assertion v2→v1 | Update | Unit | High | AC-7 |
| TC-URL-002 | Integration test mock URL assertion v2→v1 | Update | Integration | High | AC-7 |
| TC-URL-003 | Doctor integration test ~8 URL refs v2→v1 | Update | Integration | High | AC-7 |
| TC-URL-004 | E2E mock route handler rename v2→v1 | Update | E2E Mock | High | AC-7 |
| TC-URL-005 | E2E smoke-probe URL v2→v1 | Update | E2E Mock | High | AC-7 |
| TC-URL-006 | E2E create-flow no-call assertion path v2→v1 | Update | E2E Mock | High | AC-7 |
| TC-URL-007 | Doctor envelope/exit-code no diff assertion | Validation | Integration | High | AC-7 |
| TC-URL-008 | Full test suite passes (`bun run check`) | Meta | CI | High | AC-7 |
| TC-TDR-001 | TDR file exists and is indexed | Checklist | Manual | High | AC-8 |

### 5.2 Scenario Details

#### TC-AUTH-001 - Valid env resolution → Basic header

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-1, F-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- All three env vars present: `MARKSYNC_CONFLUENCE_BASE_URL`, `MARKSYNC_USER_EMAIL`, `MARKSYNC_API_TOKEN`
- Base URL is valid HTTPS

**Steps**:
1. Call `resolveCredentials()` with valid env vars set
2. Assert `result.ok` is true
3. Assert `result.value.mode` is "api-token"
4. Assert `result.value.email` is masked
5. Assert `result.value.authHeader` starts with "Basic "
6. Decode and assert authHeader equals `${EMAIL}:${TOKEN}`

**Expected Outcome**:
- Credentials resolve successfully with opaque Basic auth header
- No change to this test (no URL assertion involved)

---

#### TC-AUTH-008 - v1 probe 200 → identity (UPDATE URL)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-1, AC-4, F-1, F-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Stub fetch configured to return 200 with `{accountId, displayName}` body
- Valid `ConfluenceCredentials` object

**Steps**:
1. Stub fetch with 200 response `{accountId: "abc-123", displayName: "Jane Operator"}`
2. Call `validateCredentials(creds, {fetch})`
3. Assert `result.ok` is true
4. Assert `result.value.accountId` is "abc-123"
5. Assert `result.value.displayName` is "Jane Operator"
6. **UPDATE**: Assert `calls[0]?.url` is `${BASE_URL}/wiki/rest/api/user/current` (was v2)

**Expected Outcome**:
- ValidateCredentials returns `Ok({accountId, displayName})`
- Probe targets the v1 endpoint URL

---

#### TC-AUTH-008-EXTRA - v1 200 with extra fields → identity narrowed

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-4, F-3, DM-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts` (NEW TEST)
**Tags**: @backend

**Preconditions**:
- Stub fetch configured to return 200 with v1 body including extra fields per inception spike

**Steps**:
1. Stub fetch with 200 response matching inception-captured v1 shape:
   ```json
   {
     "accountId": "abc-123",
     "displayName": "Jane Operator",
     "type": "known",
     "accountType": "atlassian",
     "publicName": "jane",
     "_links": {"self": "..."}
   }
   ```
2. Call `validateCredentials(creds, {fetch})`
3. Assert `result.ok` is true
4. Assert `result.value.accountId` is "abc-123"
5. Assert `result.value.displayName` is "Jane Operator"
6. Assert no other fields are present in the returned identity (narrowing worked)

**Expected Outcome**:
- parseIdentity ignores extra fields and returns only `accountId` and `displayName`
- The `AccountIdentity` type remains unchanged (DM-1)

---

#### TC-AUTH-009 - v1 probe 401/403 → InvalidCredentials

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-2, F-2, NFR-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Stub fetch configured to return 401 or 403
- Valid `ConfluenceCredentials` object

**Steps**:
1. Stub fetch with 401 response
2. Call `validateCredentials(creds, {fetch})`
3. Assert `result.ok` is false
4. Assert `result.error.authKind` is "InvalidCredentials"
5. Assert `result.error.status` is 401
6. Assert `calls.length` is 1 (no retry)
7. Repeat for 403

**Expected Outcome**:
- 401/403 mapped to `InvalidCredentials` with correct status
- No change to this test behavior (only probed URL changes internally)

---

#### TC-AUTH-010 - v1 probe network throw → AuthUnreachable

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-3, F-2, NFR-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Stub fetch configured to reject with network error
- Valid `ConfluenceCredentials` object

**Steps**:
1. Stub fetch to reject with `TypeError("fetch failed: connection refused")`
2. Call `validateCredentials(creds, {fetch})`
3. Assert `result.ok` is false
4. Assert `result.error.authKind` is "AuthUnreachable"
5. Assert `result.error.cause` contains "connection refused"

**Expected Outcome**:
- Network throw mapped to `AuthUnreachable`
- No change to this test behavior

---

#### TC-AUTH-011 - v1 probe 429 backoff → bounded retry

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC-3, F-2, NFR-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Stub fetch configured to return 429 then 200
- Valid `ConfluenceCredentials` object

**Steps**:
1. Stub fetch with sequence: 429 (Retry-After: 0) → 200
2. Call `validateCredentials(creds, {fetch})`
3. Assert `result.ok` is true
4. Assert `calls.length` >= 2
5. Test 429 forever scenario: stub always returns 429
6. Assert `result.ok` is false
7. Assert `result.error.authKind` is "AuthUnreachable"
8. Assert `calls.length` <= 3 (bounded budget)

**Expected Outcome**:
- 429 triggers bounded backoff and retry
- Persistent 429 yields `AuthUnreachable` within budget
- No change to this test behavior

---

#### TC-AUTH-012 - INV-SEC-1 unit guard — no token in errors

**Scenario Type**: Security
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-5, NFR-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- All auth error kinds can be produced by the provider

**Steps**:
1. Produce `MissingCredentials` error via empty env
2. Produce `InvalidBaseUrl` error via bad URL scheme
3. Produce `InvalidCredentials` errors via 401/403 stub
4. Produce `AuthUnreachable` error via network throw stub
5. Collect all produced errors
6. Assert `JSON.stringify(err)` does not contain the raw TOKEN for any error

**Expected Outcome**:
- No error object carries the raw token as a field value
- INV-SEC-1 preserved (no change to this test)

---

#### TC-INT-AUTH-001 - Mock server v1 probe 200 → identity (UPDATE URL)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-1, AC-4, F-1, F-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Bun.serve mock server running on ephemeral port
- Mock configured to return 200 with `{accountId, displayName}`

**Steps**:
1. Start mock server returning 200 `{accountId: "abc-123", displayName: "Jane Operator"}`
2. Call `validateCredentials(credsFor(server.origin))` with real global fetch
3. Assert `result.ok` is true
4. Assert `result.value.accountId` is "abc-123"
5. Assert `result.value.displayName` is "Jane Operator"
6. **UPDATE**: Assert `server.requests[0]?.url` is `${server.origin}/wiki/rest/api/user/current` (was v2)
7. Assert `server.requests[0]?.authorization` is the opaque Basic authHeader

**Expected Outcome**:
- Real HTTP against mock server succeeds
- Probe targets the v1 endpoint URL
- Basic auth header transmitted correctly

---

#### TC-INT-AUTH-002/003 - Mock server v1 probe 401/403 → InvalidCredentials (UPDATE URL)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-2, F-2, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Bun.serve mock server running
- Mock configured to return 401 or 403

**Steps**:
1. Start mock server returning 401
2. Call `validateCredentials(credsFor(server.origin))`
3. Assert `result.ok` is false
4. Assert `result.error.authKind` is "InvalidCredentials"
5. Assert `result.error.status` is 401
6. Assert `server.requests.length` is 1 (no retry)
7. Repeat for 403

**Expected Outcome**:
- Real HTTP 401/403 mapped to `InvalidCredentials` correctly
- No change to test behavior (only probed URL changes internally)

---

#### TC-INT-AUTH-004 - Mock server v1 429 → backoff + retry (UPDATE URL)

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC-3, F-2, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Bun.serve mock server running
- Mock configured to return 429 then 200

**Steps**:
1. Start mock server returning 429 (Retry-After: 0) on first call, 200 on second
2. Call `validateCredentials(credsFor(server.origin))`
3. Assert `result.ok` is true
4. Assert `server.requests.length` >= 2

**Expected Outcome**:
- Real HTTP 429 triggers backoff and retry against v1 endpoint
- No change to test behavior

---

#### TC-INT-AUTH-005 - Mock server v1 429 forever → bounded AuthUnreachable (UPDATE URL)

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC-3, F-2, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Bun.serve mock server running
- Mock configured to always return 429

**Steps**:
1. Start mock server always returning 429 (Retry-After: 0)
2. Call `validateCredentials(credsFor(server.origin))`
3. Assert `result.ok` is false
4. Assert `result.error.authKind` is "AuthUnreachable"
5. Assert `server.requests.length` <= 3 (bounded budget)
6. Assert `server.requests.length` >= 1

**Expected Outcome**:
- Persistent 429 yields `AuthUnreachable` within bounded budget
- No change to test behavior

---

#### TC-INT-AUTH-006 - Mock server network error → AuthUnreachable (UPDATE URL)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-3, F-2, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Server started then stopped to create closed-port scenario
- Valid `ConfluenceCredentials` object pointing at closed port

**Steps**:
1. Start temporary server to claim ephemeral port
2. Stop server immediately to close the port
3. Call `validateCredentials(credsFor(origin))` with origin pointing at closed port
4. Assert `result.ok` is false
5. Assert `result.error.authKind` is "AuthUnreachable"
6. Assert `result.error.cause` does not contain TOKEN (INV-SEC-1)

**Expected Outcome**:
- Real network error (connection refused) mapped to `AuthUnreachable`
- Token never surfaces in error message
- No change to test behavior

---

#### TC-DOCTOR-013 - Doctor healthy pre-flight (UPDATE ~8 URL refs)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-1, AC-6, F-1, NFR-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @cli

**Preconditions**:
- Bun.serve mock server running with full doctor endpoint set
- Temp git repo with valid marksync.yml
- Valid credentials injected

**Steps**:
1. Start mock server with routes: v1 `/wiki/rest/api/user/current` (200), search (200), v2 pages (200), v1 restrictions (200)
2. Create temp git repo with marksync.yml
3. Call `runDoctor({cwd, probeCapabilities: false, resolveCredentials: ...})`
4. Assert `result.ok` is true
5. Assert `report.worstStatus` is not "fail" (may be "warn" from permission check)
6. Assert `findCheck(report, "credentials")?.status` is "pass"
7. Assert no mutating requests crossed the wire
8. **UPDATE**: Ensure mock route handler path is `/wiki/rest/api/user/current` (was `/wiki/api/v2/user/by-me`)

**Expected Outcome**:
- Doctor credentials check passes with v1 endpoint
- All other checks pass as before
- Exit code is 0 when no gating failures
- Envelope shape unchanged

---

#### TC-DOCTOR-014 - Doctor --json envelope validity (UPDATE URL)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-6, NFR-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @cli

**Preconditions**:
- Bun.serve mock server running
- Temp git repo with valid marksync.yml
- Valid credentials injected

**Steps**:
1. Start mock server with full doctor endpoint set
2. Create temp git repo with marksync.yml
3. Call `runDoctor({cwd, probeCapabilities: false, resolveCredentials: ...})`
4. Build `CommandResult<DoctorReport>` via `buildCommandResult(report)`
5. Render JSON via `renderJson(commandResult)`
6. Assert `JSON.parse(json)` does not throw
7. Assert `parsed.schema_version` is 1
8. Assert `parsed.exit_code` is `EXIT_OK`
9. Assert `parsed.data.worst_status` is not "fail"
10. **UPDATE**: Ensure mock route handler path is `/wiki/rest/api/user/current`

**Expected Outcome**:
- --json output envelope is valid and parseable
- Schema version, exit code, run_id fields present
- Envelope shape unchanged (NFR-3)

---

#### TC-DOCTOR-015 - Doctor credentials rejection no token leak (UPDATE URL)

**Scenario Type**: Security
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-5, NFR-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @cli, @security

**Preconditions**:
- Bun.serve mock server returning 401 with token in error body
- Temp git repo with valid marksync.yml
- Valid credentials injected

**Steps**:
1. Start mock server returning 401 with `{message: "Invalid token: ${TOKEN}"}`
2. Create temp git repo with marksync.yml
3. Call `runDoctor({cwd, probeCapabilities: false, resolveCredentials: ...})`
4. Assert `findCheck(report, "credentials")?.status` is "fail"
5. Render JSON via `renderJson(buildCommandResult(report))`
6. Assert output does NOT contain TOKEN
7. Assert output does NOT contain "test-token"
8. **UPDATE**: Ensure mock route handler path is `/wiki/rest/api/user/current`

**Expected Outcome**:
- Doctor report contains no raw token even when remote error body does
- INV-SEC-1 preserved — redaction works correctly

---

#### TC-DOCTOR-016 - Doctor bad token → credentials fail (UPDATE URL)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-2, F-2, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @cli

**Preconditions**:
- Bun.serve mock server returning 401
- Temp git repo with valid marksync.yml
- Valid credentials injected

**Steps**:
1. Start mock server returning 401 `{message: "Unauthorized"}`
2. Create temp git repo with marksync.yml
3. Call `runDoctor({cwd, probeCapabilities: false, resolveCredentials: ...})`
4. Assert `report.worstStatus` is "fail"
5. Assert `findCheck(report, "credentials")?.status` is "fail"
6. Assert `renderJson(buildCommandResult(report))` does not contain TOKEN
7. **UPDATE**: Ensure mock route handler path is `/wiki/rest/api/user/current`

**Expected Outcome**:
- Bad token correctly reported as credentials failure
- Exit code is DOCTOR_FAIL (60)
- No token leak in output

---

#### TC-DOCTOR-022 - Doctor gating fail → worstStatus fail (no URL change)

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC-6, NFR-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @cli

**Preconditions**:
- No mock server needed (failure path before network call)
- Temp dir (non-git repo) to trigger git-available failure

**Steps**:
1. Create temp dir (non-git repo)
2. Write marksync.yml
3. Inject credentials (will fail before they're used)
4. Inject repository that fails headSha()
5. Call `runDoctor({cwd, probeCapabilities: false, resolveCredentials: ..., createRepository: ...})`
6. Assert `report.worstStatus` is "fail"
7. Assert `findCheck(report, "git-available")?.status` is "fail"

**Expected Outcome**:
- Gating failures correctly drive worstStatus to "fail"
- Envelope and exit-code mapping unchanged
- No change to this test (no URL assertions)

---

#### TC-URL-001 - Unit test probe URL assertion v2→v1

**Scenario Type**: Update
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-7, NFR-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Existing test file has URL assertion at line ~221

**Steps**:
1. Locate test "the probe targets /wiki/api/v2/user/by-me with the opaque authHeader"
2. **UPDATE**: Change assertion from `${BASE_URL}/wiki/api/v2/user/by-me` to `${BASE_URL}/wiki/rest/api/user/current`

**Expected Outcome**:
- Test passes with v1 URL
- All other assertions unchanged

---

#### TC-URL-002 - Integration test mock URL assertion v2→v1

**Scenario Type**: Update
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-7, NFR-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/credentials.test.ts`
**Tags**: @backend

**Preconditions**:
- Existing test file has URL assertion at line ~81

**Steps**:
1. Locate test expecting `server.requests[0]?.url` to be v2 path
2. **UPDATE**: Change assertion to expect `${server.origin}/wiki/rest/api/user/current`

**Expected Outcome**:
- Test passes with v1 URL
- All other assertions unchanged

---

#### TC-URL-003 - Doctor integration test ~8 URL refs v2→v1

**Scenario Type**: Update
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-7, NFR-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @cli

**Preconditions**:
- ~8 tests reference the v2 path in mock route handlers

**Steps**:
1. Locate all mock route handler checks for `/wiki/api/v2/user/by-me`
2. **UPDATE**: Change all to `/wiki/rest/api/user/current` across tests:
   - TC-DOCTOR-013 (healthy pre-flight, line ~115)
   - TC-DOCTOR-014 (json envelope, line ~168)
   - TC-DOCTOR-015 (token leak, line ~229)
   - TC-DOCTOR-016 (bad token, line ~264)
   - TC-DOCTOR-017 (space-access fail, line ~295)
   - TC-DOCTOR-018 (parent-page fail, line ~330)
   - TC-DOCTOR-019 (probe capabilities, line ~371)
   - TC-DOCTOR-020 (permission advisory, line ~450)

**Expected Outcome**:
- All 8 doctor integration tests pass with v1 path
- Test behaviors unchanged (only URL literal changes)

---

#### TC-URL-004 - E2E mock route handler rename v2→v1

**Scenario Type**: Update
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-7, NFR-3
**Test Type(s)**: E2E Mock
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/mock-confluence-server.ts`
**Tags**: @backend, @e2e

**Preconditions**:
- Mock server has route handler at line ~169

**Steps**:
1. Locate route handler: `if (req.method === "GET" && path === "/wiki/api/v2/user/by-me")`
2. **UPDATE**: Change path to `/wiki/rest/api/user/current`
3. Ensure response body remains `{accountId, displayName}` (no extra fields needed per spec)

**Expected Outcome**:
- Mock server route responds to v1 path
- Response body unchanged (two-field shape sufficient)

---

#### TC-URL-005 - E2E smoke-probe URL v2→v1

**Scenario Type**: Update
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-7, NFR-3
**Test Type(s)**: E2E Mock
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/mock-smoke-probe.test.ts`
**Tags**: @backend, @e2e

**Preconditions**:
- Smoke-probe test at line ~20-21

**Steps**:
1. Locate test "GET /wiki/api/v2/user/by-me → 200 { accountId, displayName }"
2. **UPDATE**: Change fetch URL to `${server.origin}/wiki/rest/api/user/current`
3. Update test description to reflect v1 endpoint

**Expected Outcome**:
- Smoke-probe test passes with v1 URL
- Response shape assertion unchanged

---

#### TC-URL-006 - E2E create-flow no-call assertion path v2→v1

**Scenario Type**: Update
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-7, NFR-3
**Test Type(s)**: E2E Mock
**Automation Level**: Automated
**Target Layer / Location**: `tests/e2e-mock/create-flow.test.ts`
**Tags**: @backend, @e2e

**Preconditions**:
- Create-flow test has no-call assertion at lines ~145-149

**Steps**:
1. Locate assertion: "No GET /user/by-me (never called during pipeline run per DEC-1)"
2. **UPDATE**: Change path filter to `/wiki/rest/api/user/current`
3. Update comment to reference v1 path
4. Ensure the invariant assertion (no calls to validateCredentials during pipeline) is unchanged

**Expected Outcome**:
- DEC-1 invariant still validated (no credential probe calls during pipeline)
- Only the expected-path literal changes to v1

---

#### TC-URL-007 - Doctor envelope/exit-code no diff assertion

**Scenario Type**: Validation
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-6, NFR-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/cli/commands/doctor.test.ts`
**Tags**: @backend, @cli

**Preconditions**:
- Doctor integration tests exist

**Steps**:
1. Run all doctor integration tests
2. Assert `CommandResult<DoctorReport>` envelope shape unchanged
3. Assert `DOCTOR_FAIL` → `EXIT_HEALTH` (60) mapping unchanged
4. Assert check IDs unchanged (credentials, space-access, parent-page, etc.)

**Expected Outcome**:
- No envelope/exit-code/check-id regressions
- NFR-3 verified

---

#### TC-URL-008 - Full test suite passes (`bun run check`)

**Scenario Type**: Meta
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-7, NFR-3
**Test Type(s)**: CI
**Automation Level**: Automated
**Target Layer / Location**: CI workflow
**Tags**: @ci

**Preconditions**:
- All URL updates complete
- All tests written/updated

**Steps**:
1. Run `bun run check` (includes lint, typecheck, test)
2. Assert all tests pass:
   - `tests/unit/app/credentials.test.ts`
   - `tests/integration/credentials.test.ts`
   - `tests/integration/cli/commands/doctor.test.ts`
   - `tests/e2e-mock/mock-smoke-probe.test.ts`
   - `tests/e2e-mock/create-flow.test.ts`

**Expected Outcome**:
- Full quality gate passes
- Zero regressions introduced
- AC-7 satisfied

---

#### TC-TDR-001 - TDR file exists and is indexed

**Scenario Type**: Checklist
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-8, DEC-1
**Test Type(s)**: Manual
**Automation Level**: Manual
**Target Layer / Location**: `doc/decisions/`
**Tags**: @documentation

**Preconditions**:
- Change delivery complete
- Decision authored by `@decision-advisor`

**Steps**:
1. Verify TDR file exists at `doc/decisions/TDR-0010-*.md` (sequence number to be confirmed)
2. Verify TDR records the reversal of GH-17 DEC-5
3. Verify TDR cites inception-spike + production-400 evidence
4. Verify `doc/decisions/00-index.md` lists the new TDR

**Expected Outcome**:
- TDR file exists with correct content
- Index entry present
- AC-8 satisfied

## 6. Environments and Test Data

### Test Environments

- **Local development**: Bun runtime, ephemeral ports for mocks
- **CI fast loop**: GitHub Actions ubuntu-latest, Bun pinned version
- **No live-sandbox**: Tests use Bun.serve and node:http mocks (secrets-free per spec)

### Test Data

- **Valid credentials**:
  - Base URL: `https://example.atlassian.net`
  - Email: `juliusz@cwiakalski.com`
  - Token: `ATATT3xFfGF0SECRET_TOKEN_VALUE_x9` (matches atlassian-token redactor pattern)
  - Masked email: `j***@cwiakalski.com`

- **v1 response body (with extra fields)**: Per inception spike capture:
  ```json
  {
    "accountId": "abc-123",
    "displayName": "Jane Operator",
    "type": "known",
    "accountType": "atlassian",
    "publicName": "jane",
    "_links": {"self": "https://example.atlassian.net/wiki/rest/api/user/current"}
  }
  ```

- **Mock server state**: In-memory maps for pages, properties, attachments (e2e-mock tier)

### Isolation Strategy

- `process.env` saved/restored around each unit test (no env bleed)
- Ephemeral ports for all mock servers
- Temp directories with cleanup in `afterAll` hooks
- `server.unref()` to prevent process hangs

## 7. Automation Plan and Implementation Mapping

### Unit Tests

| TC ID | Test File | Implementation Status | Notes |
|-------|-----------|----------------------|-------|
| TC-AUTH-001 | `tests/unit/app/credentials.test.ts` | Existing – No Change | No URL assertion involved |
| TC-AUTH-008 | `tests/unit/app/credentials.test.ts` | Existing – Update | URL assertion line ~221: v2→v1 |
| TC-AUTH-008-EXTRA | `tests/unit/app/credentials.test.ts` | To Implement | NEW test for v1 body with extra fields (AC-4) |
| TC-AUTH-009 | `tests/unit/app/credentials.test.ts` | Existing – No Change | Behavior unchanged |
| TC-AUTH-010 | `tests/unit/app/credentials.test.ts` | Existing – No Change | Behavior unchanged |
| TC-AUTH-011 | `tests/unit/app/credentials.test.ts` | Existing – No Change | Behavior unchanged |
| TC-AUTH-012 | `tests/unit/app/credentials.test.ts` | Existing – No Change | INV-SEC-1 preserved |

### Integration Tests

| TC ID | Test File | Implementation Status | Notes |
|-------|-----------|----------------------|-------|
| TC-INT-AUTH-001 | `tests/integration/credentials.test.ts` | Existing – Update | URL assertion line ~81: v2→v1 |
| TC-INT-AUTH-002/003 | `tests/integration/credentials.test.ts` | Existing – No Change | Behavior unchanged |
| TC-INT-AUTH-004 | `tests/integration/credentials.test.ts` | Existing – No Change | Behavior unchanged |
| TC-INT-AUTH-005 | `tests/integration/credentials.test.ts` | Existing – No Change | Behavior unchanged |
| TC-INT-AUTH-006 | `tests/integration/credentials.test.ts` | Existing – No Change | Behavior unchanged |
| TC-DOCTOR-013 | `tests/integration/cli/commands/doctor.test.ts` | Existing – Update | Mock route path line ~115: v2→v1 |
| TC-DOCTOR-014 | `tests/integration/cli/commands/doctor.test.ts` | Existing – Update | Mock route path line ~168: v2→v1 |
| TC-DOCTOR-015 | `tests/integration/cli/commands/doctor.test.ts` | Existing – Update | Mock route path line ~229: v2→v1 |
| TC-DOCTOR-016 | `tests/integration/cli/commands/doctor.test.ts` | Existing – Update | Mock route path line ~264: v2→v1 |
| TC-DOCTOR-022 | `tests/integration/cli/commands/doctor.test.ts` | Existing – No Change | No URL assertion |

### E2E Mock Tests

| TC ID | Test File | Implementation Status | Notes |
|-------|-----------|----------------------|-------|
| TC-URL-004 | `tests/e2e-mock/mock-confluence-server.ts` | Existing – Update | Route handler line ~169: v2→v1 |
| TC-URL-005 | `tests/e2e-mock/mock-smoke-probe.test.ts` | Existing – Update | Fetch URL line ~21: v2→v1 |
| TC-URL-006 | `tests/e2e-mock/create-flow.test.ts` | Existing – Update | No-call assertion path line ~147: v2→v1 |

### Checklist Verification

| TC ID | Test File | Implementation Status | Notes |
|-------|-----------|----------------------|-------|
| TC-TDR-001 | Manual checklist | To Implement | Verify TDR + index entry during delivery |

### Execution Commands

```bash
# Run unit tests
bun test tests/unit/app/credentials.test.ts

# Run integration tests
bun test tests/integration/credentials.test.ts
bun test tests/integration/cli/commands/doctor.test.ts

# Run e2e-mock tests
bun test tests/e2e-mock/

# Full quality gate
bun run check
```

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Probability | Mitigation |
|----|------|--------|-------------|------------|
| R-TST-1 | v1 response shape differs subtly from expectation (extra fields break parser) | L | L | TC-AUTH-008-EXTRA explicitly tests extra-field ignoring; parser already narrows on two fields |
| R-TST-2 | URL literal updates missed in obscure test files | M | L | TC-URL-008 (full `bun run check`) catches any missed URL references |
| R-TST-3 | TDR sequence number conflicts with existing decisions | M | L | AC-8 verification step confirms unique TDR ID and index entry |

### 8.2 Assumptions

- The v1 `/wiki/rest/api/user/current` endpoint remains supported by Confluence Cloud (as recorded in inception spike)
- The inception-captured v1 body shape with extra fields is representative of real responses
- The existing test suite baseline is stable before URL updates

### 8.3 Open Questions

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-TST-1 | Confirm TDR sequence number for the endpoint-reversal decision | The decision index currently tops out at TDR-0009; the next free slot is proposed as **TDR-0010** | Decision needed: consult `@decision-advisor` |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-26 | test-plan-writer (GH-88) | Initial test plan — v2→v1 endpoint swap, full AC coverage, URL update mapping |

## 10. Test Execution Log

Populated during delivery phase 6-7 by `@coder` and `@runner`.

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| - | - | - | Pending |