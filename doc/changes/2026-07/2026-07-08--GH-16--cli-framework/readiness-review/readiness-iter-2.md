---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-16-readiness-iter-2
status: complete
created: 2026-07-08T18:30:00Z
work_item: GH-16
iteration: 2
verdict: READY
pause_required: false
reviewer: readiness-reviewer
supersedes: chg-GH-16-readiness-iter-1
---

# Readiness Review Iteration 2

Verdict: READY
Work Item: GH-16 (`[MS2-E2-S3] CLI framework + CommandResult<T>`)
Date: 2026-07-08
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

> Overall: **10 of 10 facets PASS.** All four iter-1 findings (1 major + 3
> minor) are **genuinely resolved** — verified at the actual changed lines, not
> on the summary. The `CommandResult<T>` shape is now byte-identical across spec
> §5.1/§8.3 (DM-1), plan Phase 2.1, and test-plan TC-CR-001/TC-CR-004/TC-JSON-003
> after snake_case conversion. The DEC cross-reference table is complete and
> introduces no new contradiction. The test-plan DEC labels are internally
> consistent (no "DEC-2" used in two senses). The load-bearing DEC-1 tier split
> remains consistent across all three artifacts. No regressions introduced by
> the edits. **Delivery may proceed.**

## Verification of iter-1 findings

### Finding 1 — [major] `warnings` shape — RESOLVED
- Iter-1: plan Phase 2.1 had `warnings?: string[]`; spec F-1/DM-1 require
  `warnings?: Array<{ code, message }>`.
- Now: plan Phase 2.1 line 411 reads
  `warnings?: Array<{ code: string; message: string }>`.
- Spec F-1 line 116: `warnings?: [{ code, message }]`; DM-1 line 238 agrees.
- Cross-check: plan `command-result.ts` summary (Context line 41) still uses the
  shorthand `warnings?[]`, but the Scope-source note (lines 68–73) declares
  Phase 2.1 / spec §5 authoritative, and the structured shape is what the
  Phase 7 contract snapshot will pin. Not a contradiction.
- Verdict: **closed.** (Optional: TC-CR-003 line 254 still says only "warnings[]
  optional array present" without asserting the `{code,message}` element; this
  is a test-strength observation, not a contract drift — the structured shape is
  pinned by the contract snapshot regardless. Non-blocking.)

### Finding 2 — [minor] `timing` duration field name — RESOLVED
- Iter-1: plan had `elapsedMs` (→ wire `elapsed_ms`); spec §10 + TC-CR-004
  require `duration_ms`.
- Now: plan Phase 2.1 line 409 reads
  `timing?: { startedAt: string; durationMs: number }`.
- `durationMs` (camelCase TS) → `duration_ms` (snake_case wire, DEC-2) matches
  spec §5.1 line 113, spec §10 line 271, and test-plan TC-CR-004 line 255.
- Verdict: **closed.**

### Finding 3 — [minor] DEC numbering drift — RESOLVED
- Iter-1: plan DEC-2..DEC-6 overloaded vs the spec DEC log; only DEC-1 aligned.
- Now: plan "Binding decisions" (lines 77–88) carries a "DEC numbering —
  cross-reference to the spec" table mapping every plan-local label to the
  authoritative spec DEC, and declares the spec (§15) authoritative on conflict:
  plan DEC-1→spec DEC-1; plan DEC-2→spec DEC-1 (translation approach); plan
  DEC-3→spec DEC-5; plan DEC-4→spec DEC-2; plan DEC-5→spec DEC-3; plan DEC-6→
  spec DEC-5.
- Completeness: all six plan DEC labels are mapped. The many-to-one mappings
  (plan DEC-3 and DEC-6 both → spec DEC-5) are correct because spec DEC-5 is a
  combined "picocolors + Cliffy confined" decision the plan splits into two
  commitments. **No new contradiction introduced** — the table is a label
  disambiguation, not a content change.
- Test-plan side: TC-EXIT-001 (line 517) and TC-MAP-001 (line 535) now cite
  **"DEC-1 (spec)"**; TC-EXIT-001 body (line 528) reads "kind→code→exit table
  (spec DEC-1)". TC-JSON-003 (line 412) retains "DEC-2" in the spec sense
  (snake_case), consistent with DM-1 line 158 and spec DEC-2. **No "DEC-2" is
  used in two senses anywhere in the test-plan anymore.** Remaining DEC refs in
  the test-plan are consistent with spec numbering (DEC-3=redacted error
  representation @ TC-MAP-006; DEC-4=redact serialized @ TC-RED-007;
  DEC-6=error.code stable string @ DM-2).
- Verdict: **closed.**

### Finding 4 — [minor] stale Scope-source note — RESOLVED
- Iter-1: plan claimed "no chg-GH-16-spec.md exists" — factually wrong and
  self-contradictory with its own `links.change_spec`.
- Now: plan lines 68–73 state the spec `chg-GH-16-spec.md` exists, **is the
  contract authority**, the envelope/ACs/DECs/residence are defined there and
  must not drift, and Phase 2.1 / spec §5/§8/§15 are authoritative on conflict
  (explicitly citing the iter-1 reconciliation). Consistent with
  `pm-notes.yaml` (`specification.completed` before `delivery_planning`).
- Verdict: **closed.**

## Regression check of previously-PASS facets

- **`CommandResult<T>` shape is IDENTICAL across all three artifacts.** Verified
  field-by-field:

  | field | spec §5.1 (wire) | plan Phase 2.1 (TS) | test-plan |
  |-------|------------------|---------------------|-----------|
  | schema version | `schema_version: 1` | `schemaVersion: typeof SCHEMA_VERSION (=1)` | TC-CR-001 asserts `===1`; TC-JSON-004 |
  | run id | `run_id` | `runId: string` | TC-CR-001 asserts non-empty |
  | exit code | `exit_code` | `exitCode: number` | TC-CR-001 asserts `0` on success |
  | timing | `{ started_at, duration_ms }` | `{ startedAt; durationMs }` | TC-CR-004 wire `{started_at,duration_ms}` |
  | data | `data?: T` | `data?: T` | TC-CR-001 |
  | error | `{ code, message, retryable }` | `{ code; message; retryable }` | TC-CR-002 |
  | warnings | `[{ code, message }]` | `Array<{ code; message }>` | DM-1 / snapshot pins |

  After DEC-2 snake_case conversion the three definitions agree exactly. C-4
  schema-stability risk (the iter-1 root concern) is closed.

- **DEC-1 tier split still consistent** across spec §2.1/§16/DEC-1/DM-4/NFR-11/
  RSK-2, plan DEC-1 (Phase 5 `src/app/cli-error-map.ts` + Phase 2.2
  `src/cli/output/exit-codes.ts` "Zero tier imports — pure data", Phase 5 ≺
  Phase 6 ordering constraint), and test-plan TC-MAP-007/TC-BND-003. The exact
  risk that failed GH-15 iter-1 (module placed in two tiers) remains closed.

- **AC→TC traceability** intact; all 8 story ACs still map to ≥1 traceable TC
  (§3.1 matrix unchanged). INV-SEC-1 over-mocking guardrail still honored (real
  captured output, never "redact was called" mocks).

- **ADR-0011 C-1..C-5 / TDR-0002 smoke gate / DoD (spec §17)** all unchanged and
  still PASS.

## Findings

None blocking. All iter-1 findings closed.

## Advisory notes (non-blocking — do not fail any facet)

> Recorded for `@coder`/`@reviewer`/`@doc-syncer` awareness; no artifact
> revision required to clear DoR. Each is a defensible, pre-existing, documented
> deviation with a clear resolution path.

1. **[minor, pre-existing] cross_artifact_consistency / system_spec_consistency —
   exit-code classification of `LOCK_DIRTY`/`CONCURRENT_WRITE`/`STALE_PLAN`
   differs between spec F-5 and plan DEC-2.** Spec F-5 (line 144) illustrates
   `LOCK_DIRTY`, `CONCURRENT_WRITE`, `STALE_PLAN` (plus `FORBIDDEN_BRANCH`,
   `TOO_LARGE`, `UNRESOLVED_LINK`) as typical codes for **exit 50** (invariant
   violation). Plan DEC-2 (lines 129/130/132) **commits** (no `*`)
   `LockDirty→30`, `ConcurrentWrite→30`, `StalePlan→30` (conflict/drift), and
   stars the other three as reclassifiable.

   **Why non-blocking:** (a) the spec F-5 column header is explicitly
   "**Typical** `error.code`" and §5.1 line 148 defers "The exact
   `MarkSyncError.kind → { code, exitCode }` assignment … to an exhaustive
   switch in the application tier (DEC-1)" — so the spec does not hard-pin
   these; (b) the plan's load-bearing entry (`Conflict → CONFLICT → 30`,
   asserted by AC-6/NFR-7) is consistent across all three artifacts; (c) no TC
   pins these three codes to a specific exit (TC-EXIT-001..008 and TC-MAP-001..007
   cover only CONFLICT/REMOTE_MISSING/INVALID_CONFIG/USAGE/RENDER_UNAVAILABLE/
   INTERNAL + an exhaustive "every kind maps to *a* {code,exitCode}"); (d) the
   plan's new authority declaration means the spec wins on conflict, giving a
   clear resolution. The plan's classification (dirty-lock/concurrent-write/
   stale-plan = conflict/drift, retryable) is arguably more semantically correct
   than "invariant violation."

   **Action for delivery (not DoR):** when `@coder` implements `exit-codes.ts`
   (Phase 2.2) and `cli-error-map.ts` (Phase 5), pick ONE classification and
   ensure the `--help` exit-code doc + `nonfunctional.md` NFR-OBS-1 table
   (lifecycle phase 7 / `@doc-syncer`) match the implemented values. Flag for
   `@reviewer` to spot-check that the documented and implemented tables agree.

2. *(Carried forward from iter-1, unchanged, non-blocking)* INV-SEC-1 validated
   via Unit + Integration (not Gherkin) and the TDR-0002 smoke gate runs on the
   host OS (not a clean-OS image). Both documented deviations; the hard
   over-mocking clause is satisfied by TC-INT-001.

## Decision Routing

- No `system`/precedent-setting decision requires a new ADR. DEC-1 remains a
  change-scoped application of TDR-0006 / dep-cruiser (spec §22).
- No `needs_human_input`. `pm-notes.yaml` `open_questions: []`, `blockers: []`.
- The advisory exit-code classification is a `change`-scoped item resolvable at
  delivery + doc-sync; no escalation.

## Gate Result

**READY.** 10 of 10 facets PASS. All four iter-1 findings are genuinely
resolved at the source lines, with no regression in the previously-PASS facets.
The single load-bearing contract (`CommandResult<T>` shape) is now identical
across spec, plan, and test-plan — the C-4 schema-stability risk that motivated
the iter-1 NOT_READY is closed. The DEC-1 tier split — the exact risk that
failed GH-15 iter-1 — remains consistent across all three artifacts. One
non-blocking advisory (exit-code classification of three non-AC-load-bearing
kinds) is recorded for delivery/doc-sync awareness; it does not fail any facet.

## Next Steps

Delivery is unblocked. `@pm` may close `dor_check` and open `delivery`
(`@coder` executes `/run-plan GH-16` from Phase 1). The advisory note should be
handed to `@coder`/`@reviewer` as a delivery-time spot-check, and to `@doc-syncer`
for the phase-7 `nonfunctional.md`/`--help` exit-code reconciliation.
