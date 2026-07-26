# Readiness Review Iteration 2

Verdict: NOT_READY
Work Item: GH-31
Date: 2026-07-26
Pause Required: no

## Facet Summary

- spec_completeness: PASS
- ac_quality: FAIL
- plan_coverage: PASS
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Iter-1 Findings Status (1–14)

| # | Iter-1 finding | Status | One-line verification |
|---|----------------|--------|-----------------------|
| 1 | BLOCKER — CI visibility (`tests/adversarial/` not in ci.yml) | **PARTIALLY-RESOLVED** | Spec/plan/PM DEC-5 correctly relocate RUNNERS to `tests/golden/adversarial/*.test.ts` (CI glob `tests/golden/` covers them, no ci.yml edit); plan Phase 6.2 verifies discovery. **But** test plan TC-009 step 2 (line 547) still lists a stale `bun test tests/adversarial/` invocation — see NEW 1. |
| 2 | BLOCKER — spec §13 sync-drift dependency contradicts DEC-3 | **RESOLVED** | Spec §13 (line 213) now references "Unsupported-node classifier (GH-20, F-5, …) + conversion fidelity (GH-20, NFR-REL-4)" with an explicit NOTE that this is NOT the sync-state drift classifier (GH-22 / `src/domain/state/classifier.ts`); consistent with DEC-3 / NG-3. |
| 3 | MAJOR — long-page floor is fragile "2× largest golden" proxy | **PARTIALLY-RESOLVED** | Spec §5.1 / §17 AC-F1-1 / Appendix A + plan Phase 2.1 all updated to "≥50 KB or ≥1000 lines — absolute scale floor". **But** test plan TC-001 step 3 (line 177) + Notes (line 191) still use "notably larger than the 33-fixture golden set … at least 2× the size of the largest existing golden fixture" — see NEW 2. |
| 4 | MAJOR — TC-001 tier mislabeled "Unit"; `tests/adversarial/` unsanctioned tier | **RESOLVED** | TC-001/004/005/006/008 relabeled Golden (§5.1, §4.2, §4.3); runners at `tests/golden/adversarial/`; §6.3 Isolation Strategy now distinguishes Unit (pure) vs Golden (file-based) vs PII audit (read-only scan) — consistent. |
| 5 | MAJOR — TC-004 omits unsupported-fixture error branch | **RESOLVED** | TC-004 §5.2 (steps 3–5) now has 3 branches: golden-match / assert-succeeds / assert-error-fast-fail (`result.ok === false`); plan Phase 3.2 mirrors with explicit (a)/(b)/(c) branches referencing the `isErrorFixture` pattern. |
| 6 | MAJOR — `{expand}` macro silently dropped | **RESOLVED** | `{expand}` in spec §11 RSK-4, Appendix A, DEC-2; plan Phase 2.1 fixture `macro-expand.md`, Phase 3.5 macro list, Phase 5.1 doc table; test plan TC-010 step 1 builds `ac:name="expand"`. |
| 7 | MAJOR — plan omits `.ai/rules/testing-strategy.md` update | **RESOLVED** | Plan task 6.4 + Phase 6 "System docs to update" add a one-line note (adversarial corpus = golden-tier subcategory under `tests/golden/adversarial/`, NOT a new tier). Consistent with DEC-5 rationale ("no new tier registration required" — the note is a subcategory pointer, not a tier registration). |
| 8 | MINOR — synthetic-only corpus not surfaced as a deviation | **RESOLVED** | Spec §7.3 explicitly labels "Real design-partner corpus ingestion (deviation, surfaced)" with rationale; DEC-4 / NG-4 / Maybe-Later chain complete. |
| 9 | MINOR — emoji-rendering nondeterminism missing from risk register | **RESOLVED** | Spec §11 RSK-6 added (platform/Unicode drift); mitigation = skip byte-exact `.storage.xhtml` for emoji fixture or pin + re-baseline. |
| 10 | MINOR — PII "bare ID" regex undefined | **RESOLVED** | Concrete regex `(?:MS\|GH\|INT\|TICKET\|JIRA)[-_]\d{3,}` (case-insensitive) in TC-008 step 5 + plan Phase 4.2, alongside email + internal-ticket-URL regexes. |
| 11 | MINOR — plan Phase 3.5 hand-built-macro block untraced in test plan | **RESOLVED** | TC-ADVERSARIAL-010 added (§5.1 index line 151, §5.2 detail, §3.1/§3.2 coverage, §7 mapping line 612); plan Phase 3.5 relabeled TC-005→TC-010; Test Scenarios table row added. Tier = Unit, extends `tests/unit/domain/markdown/unsupported.test.ts` — consistent across all three artifacts. |
| 12 | MINOR — plan Phase 2.3 uses "sidecar" ambiguously for `.storage.xhtml` | **RESOLVED** | Phase 2.3 reworded: `*.classification.json` = MANDATORY sidecar (DM-1); `*.storage.xhtml` = optional fidelity golden; "sidecar" reserved strictly for `*.classification.json`. |
| 13 | MINOR — TC-006 over-specifies 3 runs while AC-F3-3 requires 2 | **RESOLVED** | TC-006 step 3 runs "a second time" (2× total); Notes cite "AC-F3-3 requires 'twice'"; plan Phase 3.4 says "run exactly twice, not thrice". |
| 14 | NIT — no explicit "Definition of Done" section in spec | **RESOLVED** | Spec §17 "Definition of Done" added: "AC-F1-1 through AC-F6-1 … collectively constitute the Definition of Done". |

**Tally:** 12 RESOLVED, 2 PARTIALLY-RESOLVED (1, 3), 0 NOT-RESOLVED. Both partials are the same failure mode: the iter-2 fix was applied to the spec + plan but not fully propagated to the test plan.

## Findings

### 1. [MAJOR] cross_artifact_consistency — test plan TC-009 step 2 still lists a stale `bun test tests/adversarial/` invocation

**Location**: `chg-GH-31-test-plan.md` §5.2 TC-ADVERSARIAL-009 step 2 (line 547); contradicts `chg-GH-31-plan.md` Phase 6.2 (lines 549–551) and DEC-5 (`chg-GH-31-spec.md` §15 line 233).

**Gap**: TC-009 step 2 enumerates the sub-commands of `bun run check` and includes the line `- bun test tests/adversarial/ (corpus inventory, PII audit)`. Per DEC-5 the corpus-inventory and PII-audit RUNNERS live at `tests/golden/adversarial/*.test.ts` and are discovered by the CI glob `bun test tests/golden/` (ci.yml line 72). `tests/adversarial/` holds only data fixtures (`*.md`, `*.classification.json`, optional `*.storage.xhtml`) — no `*.test.ts`. The plan's Phase 6.2 explicitly states "there are no `*.test.ts` files under `tests/adversarial/` … no separate `tests/adversarial/` test invocation is needed", and the plan revision log claims "removed the stale `tests/adversarial/` test invocation" — but that cleanup was applied only to the plan, not the test plan. Running `bun test tests/adversarial/` would either error or pass vacuously, misrepresenting the AC-F6-1 quality gate. This is a direct residual of BLOCKER 1's resolution being incompletely propagated.

**Suggested remediation target phase**: test_planning
**Suggested fix**: Delete the `- bun test tests/adversarial/ (corpus inventory, PII audit)` line from TC-009 step 2; the existing `- bun test tests/golden/ (golden tests, including classification runner)` line already covers the adversarial runners per DEC-5. Optionally align the whole step-2 enumeration with what `bun run check` actually expands to (`lint && format:check && typecheck && test && check:boundaries`, where `bun run test` = `bun test` with no path arg) — but the load-bearing fix is removing the stale `tests/adversarial/` line.

---

### 2. [MAJOR] cross_artifact_consistency / ac_quality — test plan TC-001 still uses the stale "2× largest golden" long-page proxy

**Location**: `chg-GH-31-test-plan.md` §5.2 TC-ADVERSARIAL-001 step 3 (line 177) + Notes (line 191); contradicts `chg-GH-31-spec.md` §17 AC-F1-1 (line 249), §5.1 (line 94), Appendix A (line 311) and `chg-GH-31-plan.md` Phase 2.1 (line 237) + Phase 4.1 (line 386).

**Gap**: TC-001 step 3 asserts "At least one long page notably larger than the 33-fixture golden set (by byte/line count)" and Notes defines "'Notably larger' for long page means at least 2× the size of the largest existing golden fixture". The largest golden fixture is `kitchensink.md` at ~849 bytes, so this threshold resolves to ~1.7 KB — exactly the fragile proxy iter-1 MAJOR 3 rejected. The spec and plan were both updated to "≥50 KB or ≥1000 lines — absolute scale floor (to exercise NFR-PERF-5)", but the test plan TC-001 — the AC-F1-1 traceability anchor — was not updated. A coder implementing TC-001's threshold would produce a sub-2 KB "long page" fixture that defeats the scale-test intent (NFR-PERF-5 ≤200 ms p95). Same failure mode as finding 1: iter-2 fix not propagated to the test plan.

**Suggested remediation target phase**: test_planning
**Suggested fix**: Replace TC-001 step 3 line 177 with "At least one long page at the absolute scale floor of ≥50 KB or ≥1000 lines (per AC-F1-1; exercises NFR-PERF-5)" and replace Notes line 191's "2× largest golden" definition with the same absolute floor. Mirror spec §17 AC-F1-1 / Appendix A verbatim.

---

### 3. [NIT] ac_quality — PII bare-ID regex risks false positives on legitimate macro-jira / milestone prose

**Location**: `chg-GH-31-test-plan.md` TC-008 step 5 (line 453); `chg-GH-31-plan.md` Phase 4.2 (line 397); interacts with plan Phase 2.1 `macro-jira.md` fixture (line 229).

**Gap**: The bare-ID regex `(?:MS|GH|INT|TICKET|JIRA)[-_]\d{3,}` (case-insensitive) is well-narrowed to internal-issue-ref format, but two legitimate corpus strings would match it: (a) "MS-0002" (the milestone ID — matches `MS-\d{3,}` with 4 digits) if any fixture prose references the pipeline/release by name; (b) bare "JIRA-123" / "jira-1234" prose if the `macro-jira.md` fixture демонстрирует the Jira macro by referencing an issue key in that exact shape. The macro-jira fixture is *supposed* to represent Jira macro handling. Risk is LOW because (i) the internal-ticket-URL and bare-ID regexes do NOT match realistic Confluence Jira syntax (`<ac:parameter ac:name="key">PROJ-123</ac:parameter>` — "PROJ-123" is not in the alternation), and (ii) synthetic fixtures should not contain meta-commentary about the MarkSync project. But if the coder authors fixture prose like "this page relates to MS-0002" or "see JIRA-1234", TC-008 fails on a false positive and the coder will be confused about whether to scrub legitimate content or weaken the regex.

**Suggested remediation target phase**: test_planning
**Suggested fix**: Add a one-line clarifying note to TC-008 (and plan Phase 4.2) stating that the bare-ID regex targets internal MarkSync issue-refs only; macro-jira fixtures MUST use realistic Confluence Jira macro syntax with project keys (e.g., `PROJ-123`, `CONF-456`) rather than bare `JIRA-###` prose, and fixtures must not reference MarkSync milestone IDs (`MS-0002`) in content. This makes the contract explicit so a false positive is unambiguous.

---

### 4. [NIT] test_traceability — §10 Test Execution Log missing TC-ADVERSARIAL-010 row

**Location**: `chg-GH-31-test-plan.md` §10 Test Execution Log (lines 664–672).

**Gap**: §10 lists TC-ADVERSARIAL-001 through TC-ADVERSARIAL-009 (9 rows) but omits TC-ADVERSARIAL-010, which was added in iter-2 (§5.1 index, §5.2 detail, §3.1/§3.2 coverage, §7 mapping all include it). The execution log is the standard traceability table for run results; the missing row breaks the one-TC-one-row invariant.

**Suggested remediation target phase**: test_planning
**Suggested fix**: Add `| TC-ADVERSARIAL-010 | TBD | TBD | Pending execution |` to the §10 table.

---

## Gate Result

NOT_READY. Iter-2 resolved 12 of 14 iter-1 findings (both BLOCKERs substantively addressed at the spec/plan/PM level; all MAJORs except the two partials; all MINORs/NITs). However, two MAJOR cross-artifact-consistency gaps remain — both are the *same* failure mode: the iter-2 edits were applied to the spec + plan + PM notes but **not fully propagated to the test plan**:

- **NEW 1 (MAJOR)**: TC-009 step 2 still lists a nonexistent `bun test tests/adversarial/` command — directly contradicts DEC-5 and plan Phase 6.2 (the same CI-visibility concern that was BLOCKER 1).
- **NEW 2 (MaJOR)**: TC-001 step 3 + Notes still use the rejected "2× largest golden" long-page proxy (~1.7 KB) — directly contradicts spec AC-F1-1's "≥50 KB or ≥1000 lines absolute floor" (the same scale-test gap that was MAJOR 3).

Both are surgical two-line fixes in the test plan only. The spec, plan, and PM notes are internally consistent and correct; the test plan is the lone outlier.

Override path is NOT available — the change adds behavior (`findAllUnsupported`), introduces new committed test artifacts + a user-facing doc, and modifies the delivery workflow's regression surface; it is not trivial per `<override>`.

## Confidence

**High.** Every path, line number, and ci.yml/source fact was verified directly against the current artifact state and the actual repository (`ci.yml` line 72, `src/domain/markdown/unsupported.ts`, `tests/golden/markdown/storage-renderer.test.ts` line 61, `package.json` `"check"` script). The two MAJOR findings are unambiguous stale strings in the test plan that I read line-by-line.

## Recommendation

**Reopen `test_planning` only** (specification and delivery_planning stay closed — their artifacts are correct). Apply four surgical fixes to `chg-GH-31-test-plan.md`:

1. **[MAJOR, NEW 1]** TC-009 step 2: delete the `- bun test tests/adversarial/ (corpus inventory, PII audit)` line (runners are under `tests/golden/` per DEC-5).
2. **[MAJOR, NEW 2]** TC-001 step 3 line 177 + Notes line 191: replace "notably larger than the 33-fixture golden set / 2× largest golden" with "≥50 KB or ≥1000 lines (absolute floor, per AC-F1-1 / Appendix A)".
3. **[NIT, NEW 3]** TC-008: add a one-line note that the bare-ID regex targets internal MarkSync issue-refs only; macro-jira fixtures must use Confluence project-key syntax (`PROJ-###`), not bare `JIRA-###` prose.
4. **[NIT, NEW 4]** §10 Test Execution Log: add the missing `TC-ADVERSARIAL-010` row.

This is iter-2 → iter-3 is the cap per the ~3-iteration policy. The fixes are small, surgical, and isolated to one artifact, so iter-3 should return READY. If the same two MAJOR gaps persist after iter-3 (stalemate), escalate to the human rather than looping.
