# Code Review — GH-29: Quality Gate Wiring (Iteration 2 — re-review)

**Iteration:** 2 (re-review after remediation of iter-1's 7 findings)
**Mode:** local
**Work Item:** GH-29 — [MS2-E5-S1] Quality gate wiring (BDD + Live-Sandbox E2E)
**Branch:** `feat/GH-29/quality-gate-wiring`
**Base:** `main`
**Reviewed at:** 2026-07-15
**Reviewer:** @reviewer
**Remediation commits:** `de3f852` (fixes) · `f3aca8a` (plan execution log)

---

## Status: PASS

**Iter-1 findings:** 7/7 RESOLVED (0 critical · 0 high · 0 medium · 0 low — all cleared)
**New findings:** 1 low (NF-1 — non-blocking cleanup nit; does not affect invariant coverage)

All seven iter-1 findings are genuinely resolved — not papered over. The remediated
assertions now inspect real outputs (real `FakeTarget` call records, a real journal file,
a real recursive cache scan, real `report.warnings` / `result.warnings` arrays) and would
fail if the sentinel leaked into any of those paths. The multi-doc fixture now exercises
the active write path (2 real updates) while excluding the REMOTE_MISSING doc. The E2E
smoke test is a real create→read→update round-trip against the real `ConfluenceTarget`,
correctly gated and cleaned up. All guardrails hold (DEC-1/3/4, AC-F3-3) and every gate
is green (`test:bdd` 6/42, `tests/e2e/` skip-exit-0, `bun run check` exit 0).

---

## Gates Re-run (this iteration)

| Gate | Result | Evidence |
|------|--------|----------|
| `bun run test:bdd` | ✅ 6 scenarios / **42 steps** (up from 36) in 0.12s | New real assertions added 6 step bodies; all pass |
| `bun test tests/e2e/` | ✅ 2 pass, skip cleanly, **exit 0** | `[E2E Skip] MARKSYNC_E2E_* secrets not configured` |
| `bun run check` | ✅ **exit 0** | tsc clean · biome format clean · `bun test` 1203 pass · depcruise 0 violations |
| DEC-3 (`src/` untouched) | ✅ | `git diff main...HEAD --stat -- src/` is empty |
| DEC-4 (only adapter ports mocked) | ✅ | Step files import only `computePlan`/`applyPlan` (real) + `FakeTarget`/`FakeRepository` (adapter ports) |
| DEC-1 (exactly 4 invariant features) | ✅ | 4 `.feature` files; no NFR-PERF-4 / NFR-REL-5 |
| AC-F3-3 (`run-e2e.yml` unchanged) | ✅ | `git diff main...HEAD --stat -- .github/workflows/run-e2e.yml` is empty |

---

## Per-Finding Resolution Audit

### H-1 — INV-SEC-1 version.message assertion → ✅ RESOLVED

**Was:** checked `result.documents` (a field that does not exist on `ApplyReport`) →
guard always `false` → assertion body never executed.

**Now:** `tests/bdd/steps/no-secret-in-output.steps.ts:155-173` iterates
`this.fakeTarget.updatePageCalls` and `this.fakeTarget.createPageCalls`, asserting no
captured `.message` contains `SENTINEL_SECRET`. This is a **real field** —
`FakeTarget.updatePageCalls: UpdatePageRequest[]` records the full request including
`message`. This mirrors TC-INTEGRATION-011 (`secrets-safety-integration.test.ts:180-186`)
exactly.

**Meaningful?** Yes. Because the M-3 fix puts the doc in LOCAL_AHEAD, `updatePage` **is**
called → `updatePageCalls` is non-empty → the loop body executes against a real call
record. If a future change ever concatenated document content into the version message,
`updateCall.message?.includes(SENTINEL)` would throw. **Would fail on a real leak.**

### H-2 — 3 empty no-op INV-SEC-1 Then steps → ✅ RESOLVED

All three previously comment-only bodies now contain executing assertions:

- **Journal** (`:73-100`): reads `join(cacheDir, "journal", "<runId>.jsonl")` via
  `readFileSync` and asserts no sentinel. **Real file** — and because the doc is now
  LOCAL_AHEAD (updated), the journal file **exists with content** (a real `update` entry),
  so the read succeeds and the `.includes(SENTINEL)` check runs. Mirrors TC-INTEGRATION-011
  lines 162-167. **Would fail on a real leak.**

- **Diagnostics** (`:112-151`): iterates `plan.entries` Block reasons, `report.warnings`,
  and per-`result.warnings`, asserting none contains the sentinel. `report.warnings` /
  `result.warnings` are **real arrays** that are non-empty in practice (the FakeTarget
  fixture returns no body on fetch-back, so `finalizeSuccessfulUpdate` emits a real
  "Fetch-back returned empty body …" warning). **Would fail on a real leak into a warning.**
  *(One dead sub-branch — see NF-1 below — but the step as a whole is meaningful.)*

- **Cache** (`:176-201`): recursively scans `cacheDir` with `readdirSync` + `readFileSync`,
  throwing on any file containing the sentinel. **Real filesystem walk** over the journal
  dir. **Would fail on a real leak.**

### M-1 — E2E smoke test placeholder → ✅ RESOLVED

**Was:** all placeholder comments; no adapter constructed; no API calls.

**Now:** `tests/e2e/sandbox-smoke.test.ts:31-100` is a real round-trip:
1. `beforeAll` early-returns if `!requiredSecretsPresent()`; otherwise constructs
   `ConfluenceTarget.fromCredentials(...)` (the **real adapter** — verified to exist at
   `src/infra/confluence/target.ts:54`) and a `CleanupTracker`.
2. Test body (gated by `test.skipIf(!requiredSecretsPresent(), …)`):
   `createPage` → `recordCreatedPage` → `getPage` read-back asserting **title + body
   match** → `updatePage` → read-back asserting **title + body + version increment**
   (`createdPage.version + 1`).
3. `afterAll`: iterates `cleanupTracker.getCreatedPageIds()`, best-effort "delete" via
   `updatePage` (the port has no native delete; documented in-code), logs orphans on
   failure, then `cleanupTracker.clear()`.

**Correctly gated & cleaned up?** Yes — verified: with no secrets it prints
`[E2E Skip] …` and exits 0 (2 pass). The `afterAll` guards on `cleanupTracker && … &&
target` so the skipped path does nothing. This is a genuine round-trip, not comments.

### M-2 — TC-BDD-004 multi-doc assertion (trivially true) → ✅ RESOLVED

**Was:** all 3 docs classified DIVERGED→Block (arbitrary mismatched hashes) →
`createPageCalls.length < 3` passed vacuously (0 < 3).

**Now:** `tests/bdd/steps/no-silent-recreate-remote-missing.steps.ts:88-154` — doc1/doc2
have `renderedBodyHash === remoteBodyHash` ("old-rendered-hash-N") with a present fixture
carrying **no body** (so `computePlan` falls back to `binding.remoteBodyHash` → remote
unchanged) while local canonical hash differs → **LOCAL_AHEAD → Update**. doc3 has no
fixture → FakeTarget returns `RemoteMissing` → **REMOTE_MISSING → Block**.

The assertion (`:182-220`) now checks **`createPageCalls.length === 0`**,
**`updatePageCalls.length === 2`**, and **doc3 entry `action.kind === "Block"`**.

**Meaningful?** Yes — this is the critical upgrade. It exercises the invariant *through
the active write path*: the two non-missing docs are genuinely updated (2 real
`updatePage` calls), proving they flow through, while the missing doc is excluded (0
creates). It **would fail** if doc3 were silently re-created (`createPageCalls` → 1) or if
doc1/doc2 were wrongly blocked (`updatePageCalls` → <2). Classification verified against
`src/domain/state/classifier.ts` + `actions.ts`.

### M-3 — INV-SEC-1 fixture (vacuous DIVERGED→Block) → ✅ RESOLVED

**Was:** `renderedBodyHash: "rendered-hash"` vs `remoteBodyHash: "remote-hash"` + a fixture
body → DIVERGED → Block → sentinel never entered the write path.

**Now:** fixture carries **no body**; binding has `renderedBodyHash === remoteBodyHash`
("old-rendered-hash"); `sourceContentHash: "new-local-hash"`. Classification → LOCAL_AHEAD
→ **Update → the doc IS written via `updatePage`**. The sentinel therefore flows through
render→plan→apply→outputs (journal entry, version message, cache files), making the H-1/H-2
no-leak assertions meaningful. Mirrors TC-INTEGRATION-011's proven LOCAL_AHEAD pattern.

### L-1 — `world.ts` three separate `import type` → ✅ RESOLVED

`tests/bdd/support/world.ts:7` is now a single combined import:
`import type { Plan, ApplyReport, ApplyOptions } from "#app/push-flow";`

### L-2 — `tmpCacheDir` created at module load, never cleaned → ✅ RESOLVED

`world.ts`: `mkdtempSync` now runs inside the `Before` hook (per-scenario); a matching
`After` hook (`:99-111`) calls `rmSync(tmpCacheDir, { recursive: true, force: true })` with
a best-effort try/catch + `console.error`. Module-level `tmpCacheDir` is now a bare `let`
declaration — no temp dir is created at import time. No orphaned `marksync-bdd-*` dirs.

---

## Guardrail Re-Check (carry-over from iter-1)

| Property | Status | Evidence |
|----------|--------|----------|
| **DEC-3** (no `src/` changes) | ✅ | `git diff main...HEAD --stat -- src/` empty |
| **DEC-4** (over-mocking) | ✅ | Import audit: steps import only real `computePlan`/`applyPlan` + `FakeTarget`/`FakeRepository` (adapter ports). Domain modules (classifier, planner, push-flow internals) are real. E2E uses the **real** `ConfluenceTarget`. |
| **DEC-1** (4 invariant features) | ✅ | `duplicate-uuid-fatal`, `no-secret-in-output`, `no-silent-overwrite`, `no-silent-recreate-remote-missing` — exactly 4 |
| **INV-SEC-1 injection point** | ✅ | Sentinel planted in document **body content** (flows through real engine) — not config/provenance |
| **E2E guard** (RSK-6) | ✅ | `requiredSecretsPresent()` checks all 5 `MARKSYNC_E2E_*` vars; all-or-nothing; `test.skipIf` |
| **Determinism** | ✅ | Fixed UUID-v7 fixtures; `Date.now()` only in the (skipped) E2E title; no sleeps in BDD |
| **run-e2e.yml unchanged** | ✅ | AC-F3-3 holds |
| **No secrets in code** | ✅ | Sentinel is synthetic `SECRET_SENTINEL_xyz123`; E2E creds from env only |

---

## Assertion-Meaningfulness Verdict: PASS

For each remediated assertion, confirmed it (a) inspects a **real output** that exists on
the real type / filesystem / call-record, and (b) **would fail** if the invariant were
violated:

| Assertion | Inspects | Would fail if… | Verdict |
|-----------|----------|----------------|---------|
| H-1 version.message | `FakeTarget.updatePageCalls[].message` / `createPageCalls[].message` (real `UpdatePageRequest`/`CreatePageRequest` fields) | sentinel reached version.message | ✅ meaningful |
| H-2 journal | real file `cacheDir/journal/<runId>.jsonl` (exists because doc updated) | sentinel written to a journal entry | ✅ meaningful |
| H-2 diagnostics | `report.warnings` + `result.warnings` (real, non-empty arrays) | sentinel in a warning | ✅ meaningful |
| H-2 cache | recursive `readdirSync`/`readFileSync` over real cache dir | sentinel in any cache file | ✅ meaningful |
| M-2 multi-doc | real `updatePageCalls.length` (2) + `createPageCalls.length` (0) + plan `action.kind` | REMOTE_MISSING doc re-created, or valid docs wrongly blocked | ✅ meaningful |
| M-3 fixture | doc reaches LOCAL_AHEAD → real `updatePage` write | (enables H-1/H-2 above to be non-vacuous) | ✅ meaningful |

**Faithfulness to TC-INTEGRATION-011:** The BDD assertions use the *same* `FakeTarget`,
the *same* LOCAL_AHEAD fixture pattern (`renderedBodyHash === remoteBodyHash`, no-body
fixture), and the *same* assertion targets (`updatePageCalls[].message`, the journal file,
the plan/report JSON) as `secrets-safety-integration.test.ts:93-202`. They mirror the
proven integration pattern faithfully.

> **Accepted limitation (shared with the integration tier):** `FakeTarget.renderBody`
> returns a fixed `<h1>Test</h1>`, so a sentinel planted in document *content* is
> consumed/transformed at the render port and cannot reach the rendered body — this is
> identical to TC-INTEGRATION-011 and is an inherent property of the mock tier, not a
> defect introduced here. The no-leak assertions still cover the *other* output paths
> (message, journal, warnings, cache, plan/lock JSON) and would catch leaks into any of
> them. Body-path leak detection with the real storage renderer lives at the E2E tier.

---

## New Findings (introduced or surfaced by remediation)

### NF-1 — Diagnostics step reads a non-existent `Block.reason` field (dead branch) · LOW

**Severity:** low · **Confidence:** high · **Category:** correctness (test quality)

**Location:** `tests/bdd/steps/no-secret-in-output.steps.ts:127-133`

**Issue:** The diagnostics step checks `entry.action.kind === "Block" && entry.action.reason`.
But the domain `Block` action (`src/domain/state/actions.ts:10`) is
`{ kind: "Block"; uuid; error: MarkSyncError }` — it has **`error`, not `reason`**. The
`reason` field exists only on the `Skip` variant. At runtime `entry.action.reason` is
`undefined`, so this sub-check is a dead branch that never fires (verified:
`Block.reason = undefined`). Compounding it, the INV-SEC-1 doc is LOCAL_AHEAD → Update, so
`kind === "Block"` is false for this scenario regardless.

This is **not caught by `tsc`** because `tsconfig.json` excludes `tests` from type-checking
(`"include": ["src/**/*.ts"]`, `"exclude": […, "tests"]`) — a pre-existing repo
characteristic, not introduced by GH-29.

**Why it does not block PASS:** the diagnostics step is *not* vacuous as a whole — the
`report.warnings` and `result.warnings` checks (lines 135-149) are real, executing
assertions over non-empty arrays. The iter-1 H-2 concern (empty no-op bodies) is genuinely
resolved. This is a minor cleanup within an otherwise-meaningful step.

**Suggestion (optional, follow-up):** either inspect `entry.action.error` (the field that
actually exists on Block — e.g. its `.kind` / human message) or remove the dead branch.
Not required for merge.

---

## Spec/Plan Compliance

| Check | Verdict |
|-------|---------|
| AC-F2-4 (INV-SEC-1 no-leak, all 6 paths) | ✅ PASS — all 6 Then-steps now have executing assertions |
| AC-F3-2 (E2E round-trip with secrets) | ✅ PASS — real create/read/update round-trip implemented |
| AC-F3-1 (skip without secrets) | ✅ PASS — exit 0 |
| AC-F2-2 (multi-doc no-silent-recreate) | ✅ PASS — meaningful through the write path |
| AC-1 (CI binding) / AC-2 (check green) / AC-F4-1 (5 tiers) | ✅ PASS |
| Plan task 5.4 (was CHECKED_BUT_MISSING in iter-1) | ✅ Now genuinely done |

---

## Summary

```
Status: PASS
Iter-1 findings: 7/7 RESOLVED
New findings: 1 low (NF-1 — non-blocking dead-branch nit)
Severity breakdown (new): 0c / 0h / 0m / 1l / 0i
Guardrails: DEC-1 ✅ · DEC-3 ✅ · DEC-4 ✅ · AC-F3-3 ✅
Gates: test:bdd 6/42 ✅ · tests/e2e skip-exit-0 ✅ · check exit-0 ✅
Assertion meaningfulness: PASS — assertions inspect real outputs and would fail on real invariant violations; mirror TC-INTEGRATION-011 faithfully
Next Step: PROCEED → quality_gates (phase 9) → dod_check (phase 10) → pr_creation (phase 11)
```

**GH-29 PASSES review iteration 2.** All seven iter-1 findings are genuinely remediated
with meaningful, executing assertions — the suite is no longer "green but hollow." The lone
new finding (NF-1) is a low-severity dead-branch cleanup that does not affect invariant
coverage or block merge. The change is ready to advance to the quality-gates phase.
