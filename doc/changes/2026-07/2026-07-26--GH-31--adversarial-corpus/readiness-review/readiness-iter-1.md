# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-31
Date: 2026-07-26
Pause Required: no

## Facet Summary

- spec_completeness: FAIL
- ac_quality: FAIL
- plan_coverage: FAIL
- test_traceability: FAIL
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: FAIL
- plan_doc_update_coverage: FAIL
- plan_code_area_coverage: PASS
- dod_defined: PASS (AC list functions as DoD; story-level DoD mirrored via AC-F6-1)

## Findings

### 1. [BLOCKER] plan_coverage — `ci.yml` does not run `tests/adversarial/`; plan and test plan never add the wiring

**Location**: `chg-GH-31-plan.md` Phase 6 (§6.1) and `chg-GH-31-test-plan.md` TC-009 (§5.2, line 509); reality: `.github/workflows/ci.yml:72`.

**Gap**: The change's entire purpose is "a binding regression suite for the converter and classifier — any future pipeline or allow-list change must keep it green" (spec §22). The plan lands all new tests under `tests/adversarial/` and asserts `bun run check` green (AC-F6-1). However:
- `.github/workflows/ci.yml` line 72 hard-codes `bun test --coverage tests/unit/ tests/integration/ tests/golden/` — `tests/adversarial/` is NOT in the path list.
- `bun run check` (run locally in Phase 6) expands to `bun test` with no path arg, so it picks up `tests/adversarial/` locally — masking the CI gap.
- The test plan falsely states "CI fast loop includes classification runner and adversarial tests" (TC-009 Notes, line 509) and "Test runs as part of `bun run check` (CI fast loop)" (TC-008 Notes, line 459). Neither is true against the current `ci.yml`.
- Neither the plan nor the test plan contains a task to add `tests/adversarial/` to `ci.yml`.

Effect: a future pipeline or allow-list change can break the corpus and CI stays green. The story's primary value proposition is silently unenforced. AC-F6-1 ("`bun run check` green") is locally true but CI-vacuous.

**Suggested remediation target phase**: delivery_planning
**Suggested fix**: Add an explicit Phase task that updates `.github/workflows/ci.yml` line 72 to include `tests/adversarial/` (and Phase 6 must verify CI runs the new tier, not just local `bun run check`). Add a constraint bullet in the plan under "Constraints" calling out that CI wiring is load-bearing. Re-word TC-008/TC-009 notes to reflect that this is a required plan deliverable, not a pre-existing fact.

---

### 2. [BLOCKER] cross_artifact_consistency / system_spec_consistency — spec §13 contradicts DEC-3

**Location**: `chg-GH-31-spec.md` §13 Dependencies; spec §15 DEC-3 / NG-3; external fact `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3--epic.md` (line 23) + `MS2-E3-S5--drift-classifier.md` (gh_issue: GH-22).

**Gap**: Spec §13 lists "Depends on | Drift classifier (E3-S5, GH-22) + conversion fidelity (E3-S3, GH-20) | Both CLOSED/delivered — the corpus stress-tests them". But MS2-E3-S5 / GH-22 is the **sync-state drift classifier** (`src/domain/state/classifier.ts`, "Drift classifier (5-state, no silent overwrite)"). DEC-3 and NG-3 explicitly state the corpus does NOT exercise that classifier — "drift stability" here means classification determinism. So the claim "the corpus stress-tests [the drift classifier]" is wrong; the corpus never touches the sync three-way `classify()`. The dependency row is misleading and contradicts the disambiguation DEC-3 was written to make.

**Suggested remediation target phase**: specification
**Suggested fix**: Either drop the "drift classifier (E3-S5, GH-22)" dependency row (the corpus does not consume it) or rewrite it to clarify the dependency is on the unsupported-node classifier + render fidelity (GH-20) only. Make the §13 list consistent with DEC-3 / NG-3.

---

### 3. [MAJOR] ac_quality / cross_artifact_consistency — "long page" threshold is a fragile proxy that does not test scale

**Location**: `chg-GH-31-spec.md` §17 AC-F1-1; `chg-GH-31-test-plan.md` TC-001 (§5.2 step 3 + Notes); `chg-GH-31-plan.md` Phase 2.1.

**Gap**: All three artifacts define "long page" as "≥2× the largest existing golden fixture". The largest golden fixture is `kitchensink.md` at **849 bytes**. So "long page" = ≥1698 bytes — a sub-2KB Markdown file. The story's intent is "very long pages" to stress scale (NFR-PERF-5: ≤200ms p95). A 1.7KB page does not stress scale; the threshold is structurally tied to the golden fixture count (which itself is fragile to future golden additions — if someone adds a 5KB golden fixture, "long" silently re-baselines upward). This AC is testable but does not measure what the story asks for.

**Suggested remediation target phase**: specification (+ test_planning to mirror)
**Suggested fix**: Pin an absolute floor tied to the actual scale intent (e.g., "≥50KB Markdown source" or "≥1000 lines") and state the NFR-PERF-5 relationship explicitly. Drop the "2× largest golden" proxy or recast it as a floor plus an absolute minimum.

---

### 4. [MAJOR] test_traceability / system_spec_consistency — TC-001 tier mislabeled "Unit"; `tests/adversarial/` is not a sanctioned testing-strategy tier

**Location**: `chg-GH-31-test-plan.md` §5.1 (TC-001 Type=Unit), §6.3 (Isolation Strategy — "Unit tests: Pure functions, no filesystem I/O or network"); `.ai/rules/testing-strategy.md` Test tiers table.

**Gap**: TC-001 (corpus inventory) is labeled "Unit" but its own steps scan `tests/adversarial/` and parse sidecar JSON — filesystem I/O. The test plan's §6.3 explicitly excludes filesystem I/O from unit tests. By its own definition TC-001 is not Unit. Separately, `.ai/rules/testing-strategy.md`'s tier table sanctions `tests/unit/`, `tests/integration/`, `tests/golden/`, `tests/mermaid/`, `tests/bdd/`, `tests/e2e/`, `tests/e2e-mock/` — there is no `tests/adversarial/` tier. The whole adversarial layout is unsanctioned by the strategy doc.

**Suggested remediation target phase**: test_planning (+ delivery_planning for the strategy-doc update — see finding 7)
**Suggested fix**: Either (a) relabel TC-001/TC-008 as a new "structural/contract" tier or under Golden, AND add a `tests/adversarial/` row to `.ai/rules/testing-strategy.md`; or (b) relocate the runner to `tests/golden/adversarial/` to fit the existing tier. Update §6.3 to be consistent with the chosen tier.

---

### 5. [MAJOR] cross_artifact_consistency — test plan TC-004 (fidelity) omits the unsupported-fixture branch that the plan defines

**Location**: `chg-GH-31-test-plan.md` TC-004 (§5.2 steps 3–4, Expected Outcome); `chg-GH-31-plan.md` Phase 3.2.

**Gap**: TC-004 steps handle two cases: fixtures with committed `.storage.xhtml` (byte-match) and fixtures without golden (assert `result.ok === true`). But adversarial fixtures containing unsupported nodes (raw-html-block, non-allow-listed tags) will return `result.ok === false` from `renderStorage`, because the render fast-fails on the first unsupported node (existing behavior — `src/infra/confluence/render/storage.ts:43`). TC-004 has no branch for the unsupported-fixture case; its Expected Outcome ("All fixtures with supported constructs render successfully") would falsely fail on every macro/raw-html/nested-table fixture. The plan Phase 3.2 DOES handle this ("For fixtures expected to be unsupported, assert the render result is the expected error (mirroring the golden runner's error-fixture branch)"), so the plan and test plan are inconsistent and the test plan is incomplete.

**Suggested remediation target phase**: test_planning
**Suggested fix**: Add a third step to TC-004 covering the unsupported-fixture branch (assert `result.ok === false` and the error kind/construct). Mirror the golden runner's `isErrorFixture` pattern (`tests/golden/markdown/storage-renderer.test.ts:34`).

---

### 6. [MAJOR] spec_completeness — `expand` macro silently dropped from the story deliverable list

**Location**: `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S3--adversarial-corpus.md` §"Detailed scope (deliverables)" item 1; `chg-GH-31-spec.md` §5.1 F-1, Appendix A; `chg-GH-31-plan.md` Phase 2.1.

**Gap**: Story deliverable 1 enumerates "Confluence macros (`{toc}`, `{info}`, `{code}`, Jira macro, **expand**)". The spec's Appendix A and plan Phase 2.1 enumerate `{toc}`, `{info}`, `{code}`, Jira macro, gliffy/app content — `expand` is omitted, with no rationale. The "≥3 macro types" AC is still met (4 covered), but a specific listed macro is silently dropped.

**Suggested remediation target phase**: specification
**Suggested fix**: Either add `expand` to the spec's macro list (Appendix A and F-1) and the plan's Phase 2.1, or explicitly note in the spec why `expand` is deferred (e.g., it's authorable inline via `<ac:structured-macro ac:name="expand">` raw-HTML block — same representation as other macros). Make the deviation explicit, not silent.

---

### 7. [MAJOR] plan_doc_update_coverage — plan omits `.ai/rules/testing-strategy.md` update flagged in PM notes

**Location**: `chg-GH-31-pm-notes.yaml` notes (b) item (c); `chg-GH-31-plan.md` per-phase "System docs to update" sections and Phase 6.3.

**Gap**: PM notes flag as a known doc impact: "`.ai/rules/testing-strategy.md` — register the adversarial tier/category under golden+integration". This is exactly the doc that sanctions test tiers (relevant to finding 4). The plan's per-phase "System docs to update" sections all say "none" (Phases 1–4) or reference only `doc/quality/adversarial-corpus-classification.md` and `doc/spec/features/feature-safe-publish.md` (Phases 5–6). No task updates `.ai/rules/testing-strategy.md`. The plan's Phase 6.3 handoff list also omits it.

**Suggested remediation target phase**: delivery_planning
**Suggested fix**: Add `.ai/rules/testing-strategy.md` to the Phase 6 (or appropriate phase) "System docs to update" list and to the Phase 6.3 doc-sync handoff, calling out the new `tests/adversarial/` tier registration.

---

### 8. [MINOR] decision_capture — synthetic-only corpus deviates from story's "seeded from real/sanitized design-partner pages" without surfacing as a scope deviation

**Location**: `MS2-E5-S3--adversarial-corpus.md` Goal + §"Detailed scope" item 1; `chg-GH-31-spec.md` §15 DEC-4, §7.2 NG-4.

**Gap**: The story's Goal says "sanitized adversarial test corpus (seeded from real/sanitized design-partner pages)" and deliverable 1 says "gather/sanitize representative pages". The spec/plan pivot to fully-synthetic (DEC-4 / NG-4). The PM notes justify it ("no real design-partner pages exist pre-launch") and the CEO-resolved R1 item covers sanitization approach — but DEC-4 frames the choice as a CEO resolution of an open question, not as an explicit deviation from the story's stated Goal. The deviation is defensible but the spec should call it out as such so reviewers see the scope change.

**Suggested remediation target phase**: specification
**Suggested fix**: Add one line to DEC-4 (or §14 Open Questions history) stating plainly: "This deviates from the story's `seeded from real/sanitized design-partner pages` framing because no real pages exist pre-launch; design-partner ingestion remains NG-4 / Maybe-Later."

---

### 9. [MINOR] spec_completeness — emoji-rendering nondeterminism risk missing from §11 risk register

**Location**: `chg-GH-31-spec.md` §11 (RSK-1..5), Appendix A (Emoji row: "Converted/escaped per existing render (verify + pin)"); `chg-GH-31-plan.md` Phase 2.3.

**Gap**: The plan asks the coder to "pin the converted/escaped form" for emoji fixtures (Phase 2.1/2.3 optional golden commit). Emoji rendering carries known nondeterminism risks across environments (Unicode normalization forms, Bun/Node `TextEncoder` behavior, font-dependent output if any rendering touches fonts). The §11 risk register covers size, PII, divergence, tag shapes, and fragility — but not emoji-pin fragility. If the optional `.storage.xhtml` golden is committed for the emoji fixture, a Bun-version or platform bump can break the byte-match.

**Suggested remediation target phase**: specification
**Suggested fix**: Add an RSK-6 covering emoji-pin nondeterminism; mitigation = either do not commit a byte-exact `.storage.xhtml` for the emoji fixture (assert render success only) or document the re-baseline procedure (per testing-strategy.md snapshot rules).

---

### 10. [MINOR] ac_quality — PII "bare ID" regex undefined

**Location**: `chg-GH-31-test-plan.md` TC-008 step 4; `chg-GH-31-plan.md` Phase 4.2.

**Gap**: Both artifacts list three PII patterns: email (concrete regex), internal-ticket-URL (concrete regex), and "bare ID patterns" (no regex, no definition). "Bare ID" is undefined; the coder will either invent a regex or skip it. AC-F5-1 is testable only if the patterns are pinned.

**Suggested remediation target phase**: test_planning
**Suggested fix**: Either provide a concrete regex for "bare ID" (e.g., specific patterns like `[A-Z]{2,}-\d{3,}` standalone, or employee-ID shape) or drop "bare ID" from the AC and rely on email + internal-ticket-URL + human review.

---

### 11. [MINOR] cross_artifact_consistency — plan Phase 3.5 introduces a test block not traced in the test plan TC index

**Location**: `chg-GH-31-plan.md` Phase 3.5 (`describe("TC-ADVERSARIAL-005 — hand-constructed macro/app HAST (DEC-2)")`); `chg-GH-31-test-plan.md` §5.1 Scenario Index (TC-005 is fixture-sidecar comparison only).

**Gap**: Plan Phase 3.5 adds a hand-built-macro-HAST describe block labeled "TC-ADVERSARIAL-005". The test plan's TC-005 is "No-silent-drop: classification equals sidecar" — a different scenario. The block has no TC entry in the test plan index, breaking traceability. The work is good (DEC-2 mitigation) but traceability is broken.

**Suggested remediation target phase**: test_planning
**Suggested fix**: Add a new TC (e.g., TC-ADVERSARIAL-010) for the hand-built macro/app HAST classification assertions and trace it to AC-F3-2 / DEC-2; relabel the Phase 3.5 block to match.

---

### 12. [MINOR] cross_artifact_consistency — plan Phase 2.3 uses "sidecar" ambiguously for the `.storage.xhtml` golden

**Location**: `chg-GH-31-plan.md` Phase 2.3 ("Skip the sidecar/commit for fixtures whose supported-only render you do not want to pin").

**Gap**: The spec reserves "sidecar" for `*.classification.json` (DM-1). Plan Phase 2.3 uses "sidecar" to mean the optional `.storage.xhtml` golden. A coder could misread "skip the sidecar" as "skip the `*.classification.json`" — which would break TC-005's fixture-pair iteration and violate DM-1 (every `*.md` has a `*.classification.json`).

**Suggested remediation target phase**: delivery_planning
**Suggested fix**: Re-word Phase 2.3 to call the optional file "optional `.storage.xhtml` golden" and reserve "sidecar" for `*.classification.json` per DM-1.

---

### 13. [MINOR] ac_quality — TC-006 over-specifies three runs while AC-F3-3 requires two

**Location**: `chg-GH-31-test-plan.md` TC-006 steps 1–6; `chg-GH-31-spec.md` §17 AC-F3-3.

**Gap**: AC-F3-3 requires "classified twice → byte-identical". TC-006 steps run classification 3× and assert second-vs-third equality too. Harmless but inconsistent with the AC; if the third run is intentional (to catch transient state), say so.

**Suggested remediation target phase**: test_planning
**Suggested fix**: Either drop the third run to match AC or expand AC-F3-3 to "≥2 consecutive runs byte-identical" and note the rationale.

---

### 14. [NIT] dod_defined — no explicit "Definition of Done" section in spec

**Location**: `chg-GH-31-spec.md` §17 (AC list only); story has an explicit DoD section.

**Gap**: The story has a "Definition of Done" section ("AC list is the DoD"). The spec uses AC-F6-1 as the umbrella but does not label a DoD. The AC list effectively serves as DoD; facet passes implicitly but a one-line §"Definition of Done" mirroring the story would remove ambiguity.

**Suggested remediation target phase**: specification
**Suggested fix**: Add a one-line §"Definition of Done" stating "AC-F1-1 through AC-F6-1 are the DoD" or equivalent.

---

## Gate Result

NOT_READY. Two BLOCKERs (CI wiring gap; spec §13 vs DEC-3 contradiction) plus six MAJOR findings. Override path is NOT available — the change adds behavior (`findAllUnsupported`), introduces a new test tier, and publishes a user-facing doc; it is not trivial per `<override>`.

## Recommended remediation routing

- **Reopen `specification`**: fix findings 2 (§13 dependency), 3 (long-page threshold), 6 (`expand` macro), 8 (synthetic-corpus deviation note), 9 (emoji RSK), 14 (DoD section).
- **Reopen `test_planning`**: fix findings 4 (TC-001 tier), 5 (TC-004 unsupported branch), 7 partial (mirroring), 10 (bare-ID regex), 11 (new TC for hand-built macro HAST), 13 (TC-006 run count).
- **Reopen `delivery_planning`**: fix findings 1 (CI wiring task), 7 (testing-strategy.md update), 12 (sidecar wording).

After revision, re-run this gate. Iteration cap is ~3; escalate to human on stalemate.
