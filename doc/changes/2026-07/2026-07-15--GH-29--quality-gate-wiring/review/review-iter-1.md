# Code Review — GH-29: Quality Gate Wiring (BDD + Live-Sandbox E2E)

**Iteration:** 1 (first review)
**Mode:** local
**Work Item:** GH-29 — [MS2-E5-S1] Quality gate wiring (all 6 test tiers)
**Branch:** `feat/GH-29/quality-gate-wiring`
**Base:** `main`
**Reviewed at:** 2026-07-15
**Reviewer:** @reviewer

---

## Status: FAIL

**Findings:** 7 issues (0 critical · 2 high · 3 medium · 2 low · 0 info)

**Summary:** The change successfully wires the BDD tier (4 invariant features, 6 scenarios, binding `test:bdd`) and the live-sandbox E2E guard infrastructure with zero `src/` changes (DEC-3 ✓) and the over-mocking guardrail honored (DEC-4 ✓ — only `FakeTarget`/`FakeRepository` are mocked; real `computePlan`/`applyPlan` are invoked). However, the INV-SEC-1 BDD scenario contains a silently-broken version.message assertion (checks a non-existent `result.documents` property on `ApplyReport` — the field is `results`, and `ApplyResultEntry` has no `versionMessage` field) plus three empty-body Then steps that give the appearance of 6-way output-path coverage but validate nothing. Separately, the live-sandbox smoke test (AC-F3-2) is a placeholder — no actual create/read/delete round-trip is implemented, despite the plan task being marked `[x]`. Both issues are fixable within `tests/**` (no `src/` change needed) and should be remediated before merge.

---

## Spec/Plan Compliance Audit

| Check | Verdict | Evidence |
|-------|---------|----------|
| **DEC-3** (no `src/` changes) | ✅ PASS | `git diff main...HEAD --stat -- src/` is empty |
| **DEC-4** (over-mocking guardrail) | ✅ PASS | Step files import only `computePlan`/`applyPlan` from `#app/push-flow` (real) + `FakeTarget`/`FakeRepository` (adapter ports). No domain module (classifier, planner, push-flow internals) is mocked. |
| **DEC-1** (BDD = 4 INV invariants) | ✅ PASS | Exactly 4 `.feature` files; no NFR-PERF-4/NFR-REL-5 scenarios. |
| **AC-F1-1** (BDD runner loads all features) | ✅ PASS | 6 scenarios / 36 steps green in 0.1s. |
| **AC-F2-1** (INV-SAFE-1 blocks) | ✅ PASS | REMOTE_AHEAD + DIVERGED scenarios assert `action.kind === "Block"` + zero writes. |
| **AC-F2-2** (INV-SAFE-2 blocks) | ✅ PASS | REMOTE_MISSING scenario asserts Block + zero `createPage`. (Multi-doc variant is weak — see M-2.) |
| **AC-F2-3** (INV-SAFE-3 duplicate UUID) | ✅ PASS | Asserts `err(DuplicateUuid)` naming both paths + zero writes. |
| **AC-F2-4** (INV-SEC-1 no secrets in output) | ❌ FAIL | See H-1: version.message assertion is broken; 3 of 6 Then steps are empty no-ops. |
| **AC-F2-5** (over-mocking guardrail) | ✅ PASS | Confirmed via import audit. |
| **AC-1** (CI binding) | ✅ PASS | `test:bdd` script is real; CI step invokes it; strict mode enabled. |
| **AC-F3-1** (skip without secrets) | ✅ PASS | `bun test tests/e2e/` exits 0; guard is all-or-nothing. |
| **AC-F3-2** (round-trip with secrets) | ❌ FAIL | See H-2: smoke test is a placeholder — no adapter calls. |
| **AC-F3-3** (run-e2e.yml unchanged) | ✅ PASS | `git diff` shows no changes. |
| **AC-F4-1** (5 tiers green) | ✅ PASS | All tiers pass; coverage exceeds thresholds. |
| **AC-2** (bun run check green) | ✅ PASS | 1203 tests green; format/typecheck/boundaries clean. |

### Plan Task Audit

| Gap Type | Details |
|----------|---------|
| **CHECKED_BUT_MISSING** | Plan task 5.4 (`[x]`) claims "create+read+delete round-trip" but `sandbox-smoke.test.ts` body is all placeholder comments. |
| **DONE_BUT_UNCHECKED** | None. |
| **OPEN_TASKS** | None (all tasks marked `[x]`). |

---

## Findings

### H-1 — INV-SEC-1 BDD scenario: version.message assertion is silently broken (vacuous)

**Severity:** high · **Confidence:** high · **Category:** correctness (test quality)

**Location:** `tests/bdd/steps/no-secret-in-output.steps.ts:98-113`

**Issue:** The `Then the sentinel does not appear in version.message` step checks `result.documents` — but `ApplyReport` (defined in `src/app/push-flow.ts:114-121`) has no `documents` property. The field is `results: ApplyResultEntry[]`, and `ApplyResultEntry` has fields `{ uuid, outcome, error?, warnings? }` — no `versionMessage`. The `if (result.documents)` guard evaluates to `false` (undefined) every time, so the assertion body **never executes**. This assertion will ALWAYS pass, even if the sentinel leaks directly into every version.message.

The correct check — as demonstrated by the reference integration test `TC-INTEGRATION-011` (`tests/integration/app/secrets-safety-integration.test.ts:180-186`) — is to inspect `fakeTarget.updatePageCalls[].message`:

```typescript
// TC-INTEGRATION-011 (the proven pattern):
expect(fakeTarget.updatePageCalls).toHaveLength(1);
const updateCall = fakeTarget.updatePageCalls[0];
if (updateCall.message) {
    expect(updateCall.message).not.toContain(fakeToken);
}
```

**Fix:** Replace the broken assertion with a check against `this.fakeTarget.updatePageCalls` (and `createPageCalls`), asserting none of the captured `.message` fields contain `SENTINEL_SECRET`.

---

### H-2 — INV-SEC-1 BDD scenario: 3 of 6 Then steps are empty no-ops

**Severity:** high · **Confidence:** high · **Category:** correctness (test quality)

**Location:** `tests/bdd/steps/no-secret-in-output.steps.ts:72-77` (journal), `:89-95` (diagnostics), `:116-119` (cache)

**Issue:** The feature file (`no-secret-in-output.feature:13-17`) declares six output-path assertions:

```gherkin
Then the sentinel does not appear in the plan JSON       # ← real assertion
And the sentinel does not appear in the apply journal    # ← EMPTY BODY (no-op)
And the sentinel does not appear in the lock file        # ← real assertion
And the sentinel does not appear in diagnostic messages  # ← EMPTY BODY (no-op)
And the sentinel does not appear in version.message      # ← BROKEN (see H-1)
And the sentinel does not appear in the cache            # ← EMPTY BODY (no-op)
```

Three step definitions have only a comment ("we skip this assertion") with no code. Under cucumber strict mode, an empty-body step is still "defined" (it matches), so strict mode does NOT catch it. A reader of the feature file would reasonably believe all six paths are tested. AC-F2-4 explicitly requires asserting the sentinel is absent from "the plan, apply journal, lock, diagnostics, version.message, and cache."

The plan execution log (task 3.3) acknowledges "assertions on plan/lock/version.message (others skipped per test scope)," but the feature file itself does not reflect this limitation — it claims full coverage.

**Fix:** Either (a) implement the missing assertions (the journal can be read from `tmpCacheDir/journal/<runId>.jsonl` as TC-INTEGRATION-011 does; diagnostics can be captured from the plan warnings; cache files can be scanned), or (b) if some paths are genuinely impractical at the BDD tier, remove the corresponding lines from the `.feature` file and document the deferral honestly (the integration test TC-INTEGRATION-011 already covers journal + report redaction).

---

### M-1 — AC-F3-2 live-sandbox smoke test is a placeholder (no actual round-trip)

**Severity:** medium · **Confidence:** high · **Category:** spec-compliance

**Location:** `tests/e2e/sandbox-smoke.test.ts:31-51`

**Issue:** AC-F3-2 requires "a create + read + delete round-trip" when secrets are present. The test body is entirely placeholder comments:

```typescript
// (Placeholder: would call real ConfluenceTarget.fromCredentials here)
// Then: create succeeds
// Then: read-back matches created content (title/body)
// Then: delete succeeds
// (Placeholder: cleanupTracker.recordCreatedPage() + cleanup in afterAll)
```

No `ConfluenceTarget` is constructed, no API calls are made, no pages are created or deleted. The `afterAll` cleanup is also a placeholder. With secrets present, the test "passes" by checking only `expect(requiredSecretsPresent()).toBe(true)` and `expect(credentials).toBeDefined()` — both trivially true. Plan task 5.4 is marked `[x]` (done) but the deliverable is a skeleton.

The guard infrastructure (`requiredSecretsPresent()`, `CleanupTracker`, `readE2ECredentials()`) is correctly built — only the actual round-trip body is missing.

**Fix:** Implement the create→read→delete round-trip using `ConfluenceTarget.fromCredentials()` (imported from `#infra/confluence/target`), or explicitly defer AC-F3-2 in the plan (uncheck task 5.4, add a follow-up note) and adjust the AC status.

---

### M-2 — TC-BDD-004 multi-doc assertion is too weak (trivially passes)

**Severity:** medium · **Confidence:** high · **Category:** correctness (test quality)

**Location:** `tests/bdd/steps/no-silent-recreate-remote-missing.steps.ts:182-192`

**Issue:** The multi-doc scenario asserts `createPageCalls.length < 3`. But all three documents in the fixture are set up with arbitrary fake hashes (`renderedBodyHash: "rendered-hash-1"` vs the real rendered hash from `FakeTarget.renderBody()` which returns `"<h1>Test</h1>"`) → the state classifier sees DIVERGED for doc1 and doc2, not UP_TO_DATE/LOCAL_AHEAD. Combined with doc3 being REMOTE_MISSING, ALL three docs are Blocked → 0 createPage calls → `0 < 3` passes trivially.

The test plan (TC-BDD-004) intended to show that non-missing docs ARE created while the REMOTE_MISSING doc is excluded. For that, doc1/doc2 would need to be in a state that results in a Create/Update action (e.g., LOCAL_AHEAD with matching hashes, as TC-INTEGRATION-011 demonstrates).

**Fix:** Either set up doc1/doc2 with consistent hashes (so they classify as LOCAL_AHEAD and get updated), then assert `createPageCalls.length === 0` for the missing doc specifically; or change the assertion to `=== 0` to honestly reflect that all docs are blocked. The "not in created pages list" step (line 194-206) is then vacuous too (iterating an empty array).

---

### M-3 — INV-SEC-1 scenario fixture setup may produce DIVERGED→Block, weakening the test

**Severity:** medium · **Confidence:** medium · **Category:** correctness (test quality)

**Location:** `tests/bdd/steps/no-secret-in-output.steps.ts:26-50`

**Issue:** The INV-SEC-1 document's lock binding uses `renderedBodyHash: "rendered-hash"` and `remoteBodyHash: "remote-hash"` — both arbitrary fakes that won't match the real computed hashes. The state classifier will likely classify this as DIVERGED → Block. When the doc is Blocked, the sentinel never flows through the render→plan→apply→write path, so the "no leak" assertions are trivially true (nothing was processed). The reference integration test (TC-INTEGRATION-011) deliberately sets `renderedBodyHash === remoteBodyHash` to produce LOCAL_AHEAD, ensuring the doc IS updated and the sentinel genuinely flows through the pipeline.

**Fix:** Align the fixture with TC-INTEGRATION-011's pattern: set `renderedBodyHash` and `remoteBodyHash` to the same value (e.g., `rawHash(fixtureBody)`) so the doc classifies as LOCAL_AHEAD and is actually updated, making the no-leak assertions meaningful.

---

### L-1 — world.ts: three separate `import type` from the same module

**Severity:** low · **Confidence:** high · **Category:** code-style

**Location:** `tests/bdd/support/world.ts:7,9,10`

**Issue:** Three separate type-only imports from `#app/push-flow`:
```typescript
import type { Plan } from "#app/push-flow";         // line 7
import type { ApplyReport } from "#app/push-flow";   // line 9
import type { ApplyOptions } from "#app/push-flow";  // line 10
```
Violates the typescript.md rule: "One import statement per module — combine `import type` + `import` via inline `type` modifier."

**Fix:** Combine into one: `import type { Plan, ApplyReport, ApplyOptions } from "#app/push-flow";`

---

### L-2 — world.ts: `tmpCacheDir` created at module load, never cleaned up

**Severity:** low · **Confidence:** high · **Category:** resource-leak

**Location:** `tests/bdd/support/world.ts:15`

**Issue:** `mkdtempSync` runs at module-evaluation time (outside any hook) and creates a temp directory that is never deleted. Each `bun run test:bdd` invocation leaves an orphaned `marksync-bdd-*` directory in the OS temp dir. Not a CI problem (ephemeral runners), but a local-development annoyance.

**Fix:** Create the temp dir inside `Before` (per-scenario) with a corresponding `After` cleanup, or register an `AfterAll` hook to delete it at suite end.

---

## Guardrail Confirmations (no findings)

| Property | Status |
|----------|--------|
| **DEC-3** (no `src/` changes) | ✅ `git diff main...HEAD -- src/` is empty |
| **DEC-4** (over-mocking) | ✅ Only `FakeTarget` + `FakeRepository` mocked; `computePlan`/`applyPlan` are real |
| **INV-SEC-1 injection point** (DoR F1) | ✅ Sentinel planted in document content (Markdown source via `fakeRepo.setFile`), not config/provenance |
| **E2E guard** (RSK-6) | ✅ All-or-nothing: `requiredSecretsPresent()` checks all 5 vars; partial set → skip |
| **Determinism** | ✅ Fixed UUID-v7 fixtures; no wall-clock assertions; no sleeps |
| **run-bdd.ts exit code** | ✅ Exits 1 on failure (both `result.success === false` and thrown exceptions) |
| **No secrets in code** | ✅ Sentinel is `SECRET_SENTINEL_xyz123` (synthetic); E2E creds from env only |
| **bun-native runner** (RSK-1) | ✅ Known doc-synced deviation; runner itself is correct |

---

## Remediation Tasks

> All fixes are within `tests/**` — zero `src/` changes required (DEC-3 preserved).

1. **[high] Fix INV-SEC-1 version.message assertion** — `tests/bdd/steps/no-secret-in-output.steps.ts:98-113`: replace the `result.documents` check with an inspection of `this.fakeTarget.updatePageCalls` (and `.createPageCalls`), asserting none of the `.message` fields contain `SENTINEL_SECRET`. Mirror TC-INTEGRATION-011 lines 180-186.

2. **[high] Fix or remove 3 empty-body INV-SEC-1 assertions** — `tests/bdd/steps/no-secret-in-output.steps.ts:72-77,89-95,116-119`: either implement the journal/diagnostics/cache checks (journal via `readFileSync(tmpCacheDir/journal/<runId>.jsonl)`; see TC-INTEGRATION-011 lines 162-167), or remove the corresponding lines from `no-secret-in-output.feature` and document the deferral.

3. **[medium] Implement E2E smoke test round-trip OR defer honestly** — `tests/e2e/sandbox-smoke.test.ts:31-51`: implement the create→read→delete using `ConfluenceTarget.fromCredentials()`, OR uncheck plan task 5.4 and mark AC-F3-2 as deferred.

4. **[medium] Strengthen TC-BDD-004 multi-doc assertion** — `tests/bdd/steps/no-silent-recreate-remote-missing.steps.ts:182-192`: either set up doc1/doc2 as LOCAL_AHEAD (matching hashes) so creates actually happen, or change `< 3` to `=== 0` to honestly assert zero creates.

5. **[medium] Align INV-SEC-1 fixture with LOCAL_AHEAD pattern** — `tests/bdd/steps/no-secret-in-output.steps.ts:36-50`: set `renderedBodyHash === remoteBodyHash` (use `rawHash(fixtureBody)`) so the doc is actually updated and the sentinel flows through the pipeline, making no-leak assertions meaningful.

6. **[low] Combine world.ts imports** — `tests/bdd/support/world.ts:7,9,10`: merge into one `import type { Plan, ApplyReport, ApplyOptions } from "#app/push-flow"`.

7. **[low] Clean up tmpCacheDir** — `tests/bdd/support/world.ts:15`: move `mkdtempSync` into a hook with a matching cleanup `After`/`AfterAll`.

---

## Plan Status

```
Plan Status: INCOMPLETE (task 5.4 checked but deliverable is placeholder)
Plan Gaps: CHECKED_BUT_MISSING (task 5.4 — E2E round-trip not implemented)
Next Step: EXECUTE_REMEDIATION_PHASE → re-review (iteration 2)
```
