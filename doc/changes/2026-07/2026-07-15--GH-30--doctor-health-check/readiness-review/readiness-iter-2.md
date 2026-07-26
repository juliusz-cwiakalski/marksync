# Readiness Review Iteration 2

Verdict: READY_WITH_MINOR_NOTES
Work Item: GH-30
Date: 2026-07-15
Pause Required: no

## Iteration-1 Fix Verification (all five remediated)

1. **[major→resolved] plan_code_area_coverage — plan §Phase 1.** Plan now labels
   `tests/unit/cli/output/exit-codes.test.ts` as **"(extend / existing — strict
   whole-contract pin; see task 1.5)"** (Phase 1 "Files and modules", line 146).
   Task 1.5 (lines 130–136) enumerates the three lockstep breakages verified
   against the source file: `EXPECTED` map (add `DOCTOR_FAIL: 60`), `allowed`
   Set (9→10), `describe("...(9 classes...)")` title (→10), plus the
   `EXIT_HEALTH` import + `expect(EXIT_HEALTH).toBe(60)`, an optional dedicated
   test, and the unchanged `codeToExitCode("CONFLICT") === 30` safety gate.
   Overview line 74 + Phase 6 task 6.2 (line 334) also say "extended", not "new".
   Source confirms: the pin is `expect(CODE_TO_EXIT).toEqual(EXPECTED)` +
   9-value `allowed` Set + "9 classes" `describe` — all three covered. **PASS.**

2. **[major→resolved] cross_artifact_consistency — spec §16 handler row.**
   Rewritten (line 265): handler is **thin** — "resolves nothing domain-side",
   "does **not** mirror `repair-state`'s resolve-config→resolve-creds→create-
   target→abort control flow"; it resolves `cwd`, passes `{cwd,probeCapabilities,
   fetch}` to `runDoctor`, maps the rare `err` via `mapMarkSyncErrorToCommandError`,
   and on `ok(report)` builds `CommandResult<DoctorReport>` **directly** (DEC-4 /
   TDR-0009). The app-tier row (line 267) now explicitly states **`runDoctor` owns
   ALL resolution probes** (config/creds/Git/target) as fail-able checks INSIDE
   the report. Matches DEC-3, AC-F1-2/F1-3/F2-1, and the plan's "Resolved design
   point". **PASS.**

3. **[minor→resolved] system_spec_consistency — spec F-5 / Appendix A renderer.**
   F-5 (line 106) now reads: "MS-0002 has **no** `happy-dom` / in-process
   `mermaid` runtime dependency … the configured render path is sound: for the
   `render` mermaid policy, that the Kroki endpoint is reachable (ADR-0002 /
   GH-69)". Appendix A `renderer` row (line 361) updated to "Kroki reachable
   under `render` policy; informational for `code` / `skip`". Verified against
   `package.json` (no happy-dom/mermaid runtime dep) + `src/infra/mermaid/kroki.ts`.
   **PASS (for the spec).**

4. **[minor→resolved] test_traceability — TC-DOCTOR-011.** Subtest 1 now mocks
   `worstStatus: "pass"` (line 529), subtest 2 `"warn"`, subtest 3 `"fail"`
   (lines 536–550). No subtest asserts `worstStatus:"skipped"`. Expected outcome
   (line 557) correctly treats pass+skipped as `worstStatus:"pass"`. Matches
   DM-1/DM-2 union `pass|warn|fail`. **PASS.**

5. **[nit→resolved] system_spec_consistency — F-6.** Softened (line 108): "the
   human path is rendered via the existing **generic** `renderHuman` fallback
   (the same path the other commands, including `repair-state`, use — no command
   currently registers a dedicated formatter)". No "registered formatter… table"
   claim. **PASS.**

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- test_traceability: PASS
- cross_artifact_consistency: PASS (with minor notes — see Findings 1–2; load-bearing dimensions aligned)
- decision_capture: PASS (DEC-1..6, TDR-0009, R1/Q1 captured; OQ-1 resolved)
- system_spec_consistency: PASS (spec F-5 now MS-0002/Kroki-accurate)
- plan_doc_update_coverage: PASS (Phase 5 lists feature-cli.md, nonfunctional.md, glossary)
- plan_code_area_coverage: PASS (Phase 1 "extend" corrected; blast radius explicit)
- dod_defined: PASS (story DoD == AC list; spec §17 ACs testable)

## Cross-Artifact Re-Scan (load-bearing dimensions — all aligned)

- **Check catalogue (9 ids):** spec Appendix A == test-plan DM-2 == plan task 2.1 `DOCTOR_CHECK_IDS`. ✓
- **DoctorReport shape:** spec DM-1 == TC-DOCTOR-009 step 3 == plan task 2.2 (`worstStatus: "pass"|"warn"|"fail"`; `skipped` never elevates). ✓
- **Exit-code semantics (TDR-0009):** spec DEC-4/Appendix B/F-7 == TC-DOCTOR-010/011 == plan Phase 1 + task 3.1 (`codeToExitCode("DOCTOR_FAIL") === 60`; `data` always present; `error` never set). ✓
- **`--probe-capabilities`:** spec F-8/DM-3/DEC-1 == TC-DOCTOR-006/019 == plan task 2.4 + 3.2 (zero port calls when false; self-cleaning try/finally when true). ✓
- **Tier discipline (DEC-1):** spec §16 == plan Constraints (line 89) == test-plan §7 aliases (handler imports `#cli/*`+`#app/doctor` only; app imports `#domain/*`+`#app/*` siblings). ✓
- **Redaction model:** spec DEC-6/RSK-1 == TC-DOCTOR-012/015 == plan "Redaction is the centralized chokepoint" (no app-tier redaction; `redactString` via `OutputService.emit`). ✓

No new contradictions introduced by the fixes on any load-bearing dimension.

## Findings (all non-blocking polish)

### 1. [minor] cross_artifact_consistency — test-plan TC-DOCTOR-008 / TC-DOCTOR-021 (renderer steps)

Gap: Iter-1 finding 3 fixed the **spec** F-5/Appendix A to "Kroki, no happy-dom/
mermaid runtime dep", but the **test plan** was not updated in lockstep.
TC-DOCTOR-008 (precondition line 418 "happy-dom/mermaid load"; step 5 line 425
"happy-dom/mermaid load error") and TC-DOCTOR-021 (step 1 line 961 "delete
happy-dom dependency, or mock the renderer module to throw"; step 6 line 968
"happy-dom/mermaid load error") still reference a dependency surface that does
**not** exist in MS-0002 (`package.json` confirmed: no happy-dom/mermaid; the
story file line 35 is the upstream source of the stale phrasing the spec
overrode). TC-DOCTOR-021 step 1's "delete happy-dom dependency" is actionable-
but-impossible guidance. This now contradicts the corrected spec F-5. **Not
blocking** because the plan (delivery authority) — task 4.9, task 2.4, and
"Open questions — Renderer probe" — correctly describes a generic constructability
probe (Kroki) with the warn path test-injected by a throwing renderer.

Suggested remediation target phase: test_planning
Suggested fix: Update TC-DOCTOR-008/021 renderer steps/detail to match the
corrected spec F-5 (probe configured-renderer / Kroki constructability; warn on
init throw) — drop "happy-dom/mermaid" / "delete happy-dom dependency".

### 2. [minor] cross_artifact_consistency — test-plan §7.1 automation table, TC-DOCTOR-010 row

Gap: Iter-1 finding 1 fixed the **plan**'s Phase 1 to "extend / existing", but
the **test plan** §7.1 table (line 1057) still labels TC-DOCTOR-010 →
`tests/unit/cli/output/exit-codes.test.ts` as **"New"**. The file already exists
and is being EXTENDED (per corrected plan task 1.5 + source confirmation). Same
class of error as iter-1 finding 1, residual in the test plan. Not blocking —
the coder follows the plan (which is correct).

Suggested remediation target phase: test_planning
Suggested fix: Change TC-DOCTOR-010's "New/Update" cell from "New" to
"Update/Extend".

### 3. [nit] cross_artifact_consistency — spec §16 app-tier row import scope

Gap: §16 app-tier row ends "imports `#domain/*` only" (line 267); the plan
(Constraints line 89, task 2.6 line 185) says "`#domain/*` + `#app/*` siblings
only". The app module must import `#app/*` siblings (`loadConfig` from
`#app/config`, etc.). "only" is imprecise (intra-`#app` imports are implicitly
fine; the cross-tier rule — no `#cli/*`/`#infra/*` — is what matters). Echoed
from pre-existing §7.1 phrasing by the §16 rewrite. Non-blocking; dep-cruiser
rule + plan task 2.6 are the delivery authority.

Suggested remediation target phase: specification
Suggested fix: "imports `#domain/*` + `#app/*` siblings only (no `#cli/*`/`#infra/*`)".

### 4. [nit] cross_artifact_consistency — spec §16 handler `fetch` threading

Gap: §16 handler row (line 265) says the handler "passes `{ cwd,
probeCapabilities, fetch }` to runDoctor"; plan task 3.1 step 1 (line 229) calls
`runDoctor({ cwd, probeCapabilities })` and notes "the global `fetch` is used
inside `validateCredentials`". Whether `fetch` is explicitly threaded or global
is a coder detail (`DoctorDeps.fetch?` is optional per task 2.3); minor wording
drift, not a behavioral contradiction.

Suggested remediation target phase: specification
Suggested fix: Align spec to "passes `{ cwd, probeCapabilities }` (global `fetch`
used inside `validateCredentials`)" — or leave as-is; non-blocking.

## Decision Routing

- All four findings are author-fixable artifact revisions; **no decision needs
  human input** (Pause Required: no).
- No new ADR/TDR required — Findings 1–2 are stale-language cleanup the plan
  already overrides; Findings 3–4 are wording precision.
- TDR-0009 (`EXIT_HEALTH=60` / `DOCTOR_FAIL`) remains consistently referenced
  across spec DEC-4/Appendix B, test-plan TC-DOCTOR-010, and plan Phase 1 — no drift.

## Overall

The two iter-1 **major** blockers (Phase 1 mislabel + §16 handler control-flow
contradiction) are both correctly and verifiably remediated, and all five iter-1
findings are addressed. Cross-artifact alignment on every load-bearing dimension
(check catalogue, `DoctorReport` shape, exit-code semantics, `--probe-capabilities`
behavior, tier discipline, redaction model) is intact — verified against the
source code (`exit-codes.test.ts` pin structure, `package.json` deps, `kroki.ts`).
The four residual findings are non-blocking polish: two are stale "happy-dom/
mermaid" + "New"-label language left in the **test plan** when the spec/plan
were fixed (the plan, as delivery authority, already handles both correctly),
and two are nit-level wording-precision items in the spec. None block a clean
delivery start; the coder follows the plan, which is accurate on all four points.

**Verdict: READY_WITH_MINOR_NOTES** — delivery may proceed; @pm may optionally
route Findings 1–2 to `@test-plan-writer` and 3–4 to `@spec-writer` for a quick
lockstep cleanup (they do not gate the gate).
