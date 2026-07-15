# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-30
Date: 2026-07-15
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS (all 14 ACs → TCs → plan tasks traced)
- test_traceability: PASS (one minor shape nit — Finding 4)
- cross_artifact_consistency: FAIL (spec §16 vs plan + spec §15/§17 — Finding 2)
- decision_capture: PASS (DEC-1..6, TDR-0009, R1/Q1 all captured)
- system_spec_consistency: FAIL (stale renderer description — Finding 3)
- plan_doc_update_coverage: PASS (Phase 5 lists feature-cli.md, nonfunctional.md, glossary)
- plan_code_area_coverage: FAIL (Phase 1 mischaracterizes an existing shared test — Finding 1)
- dod_defined: PASS (story DoD == AC list; spec §17 ACs are testable)

## Overall

The core design is sound and the binding artifacts are strongly aligned: the
9-check catalogue, the `DoctorReport`/`DoctorCheck` shapes, the `EXIT_HEALTH=60`
/ `DOCTOR_FAIL` semantics (TDR-0009), the read-only-default + `--probe-capabilities`
opt-in (R1), the `sync`-independence (Q1), and the INV-SEC-1 redaction-via-centralized-
chokepoint model are all consistent across spec → test-plan → plan → TDR-0009 →
source code. AC coverage is complete (every story AC maps to spec AC → TC → plan
phase). The findings below are surgical accuracy/consistency gaps, not fundamental
defects — but two of them are concrete enough to block a clean delivery start.

## Findings

### 1. [major] plan_code_area_coverage — plan §Phase 1 "Files and modules"

Gap: Phase 1 labels `tests/unit/cli/output/exit-codes.test.ts` as **"(new)"** and
describes Phase 1 as purely additive. The file **already exists** and is a strict
whole-contract pin: it asserts `expect(CODE_TO_EXIT).toEqual(EXPECTED)` (a
full-map equality against a hardcoded `EXPECTED` that does **not** include
`DOCTOR_FAIL`) and asserts every code resolves into a 9-element `allowed` Set
(`new Set([EXIT_OK…EXIT_INTERNAL])` — no `EXIT_HEALTH`). Adding `DOCTOR_FAIL: 60`
+ `EXIT_HEALTH` therefore **breaks two existing assertions** that the plan never
mentions. The plan's Phase 1 tasks (1.1–1.5) only add *new* assertions and edit
`exit-codes.ts`; they do not include updating `EXPECTED`, the `allowed` Set, or
the "9 classes" `describe` title. Net effect: Phase 1 is not the clean "additive
new test file" the plan claims — its blast radius includes editing an existing
shared-contract test that pins the entire exit-code map.

Suggested remediation target phase: delivery_planning
Suggested fix: Relabel `tests/unit/cli/output/exit-codes.test.ts` as **"(extend,
not new)"** in Phase 1 "Files and modules". Add an explicit task: extend the
existing `EXPECTED` record with `DOCTOR_FAIL: 60`, add `EXIT_HEALTH` to the `allowed`
9→10 class Set, and update the "exit-code constants (9 classes…)" `describe` title
to 10. Confirm the `toEqual(EXPECTED)` pin still passes after the addition.

### 2. [major] cross_artifact_consistency — spec §16 "Affected Components" vs plan + spec §15/§17

Gap: Spec §16 describes the handler as *"Replaced — stub becomes a real thin
handler (mirrors `repair-state`: **resolve config → resolve creds → create target
→ call app-tier use case → map result**)"*. That control flow **contradicts**:
(a) the plan's explicitly-resolved design ("`runDoctor` owns the resolution
probes" — config/creds/git are resolved *inside* `runDoctor` and become
`fail`-able checks, not handler-level aborts); (b) spec §15 DEC-3 ("the handler
consumes the app-tier `Result<DoctorReport, MarkSyncError>` structurally" — which
requires `runDoctor` to have already produced the report); and (c) spec §17 ACs
AC-F1-2 / AC-F1-3 / AC-F2-1, which assert `git-available` / `config-valid` /
`credentials` **report `fail` inside the `DoctorReport`** (only possible if the
resolution is the check, i.e. it runs inside `runDoctor`). The verified source
confirms the contradiction: `repair-state.ts` resolves config/lock/creds/repo/target
*in the handler* and aborts on failure, whereas the plan (correctly, per the ACs)
puts resolution inside `runDoctor`. The plan resolves the tension sensibly, but
spec §16 prose is internally inconsistent with the spec's own binding ACs and
DEC-3, and would mislead any reader of the spec in isolation.

Suggested remediation target phase: specification
Suggested fix: Rewrite the §16 "doctor CLI handler" row to match DEC-3 + the plan:
the handler is thin — it passes `{ cwd, probeCapabilities, fetch }` to `runDoctor`,
maps the rare `err` arm via `mapMarkSyncErrorToCommandError`, and on `ok(report)`
constructs `CommandResult<DoctorReport>` directly (DEC-4). Resolution of
config/creds/git is owned by `runDoctor` (they are the checks), **not** a
handler-level "resolve → abort" mirror of `repair-state`.

### 3. [minor] system_spec_consistency — spec §5.1 F-5, Appendix A, §23 glossary

Gap: The renderer check is described as *"happy-dom / mermaid load initializes"*
(F-5, Appendix A `renderer` row, §23 glossary). Verified against `package.json`:
**happy-dom and mermaid are not runtime dependencies** — they exist only in the
throwaway `spikes/mermaid-render/` spike. The MS-0002 renderer is Kroki-based
(remote HTTP per GH-69; `nonfunctional.md` NFR-PRIV-2). The plan acknowledges this
("Open questions — Renderer probe") and routes it to the coder, but the spec text
references a dependency surface that does not exist in the runtime, so a literal
reading of F-5 would have the coder probe for a non-existent happy-dom load.

Suggested remediation target phase: specification
Suggested fix: Update F-5 / Appendix A / §23 to describe the actual MS-0002
renderer surface (Kroki / configured renderer constructability) instead of
"happy-dom / mermaid load". Keep the check warn-only / never-gates semantics
unchanged.

### 4. [minor] test_traceability — test-plan TC-DOCTOR-011 subtest 1

Gap: TC-DOCTOR-011 subtest 1 describes a mock returning `worstStatus: "pass"`
(or `"warn"`, or **`"skipped"`** only). But `worstStatus` is typed `"pass" | "warn"
| "fail"` in spec DM-1 / DM-2 and plan task 2.2 (`skipped` is deliberately excluded
— a report whose only non-pass statuses are `skipped` derives `worstStatus: "pass"`).
A `worstStatus: "skipped"` value is invalid per the contract.

Suggested remediation target phase: test_planning
Suggested fix: Drop `"skipped"` from TC-DOCTOR-011 subtest 1's worstStatus options;
the no-`fail` derivation (→ exit 0) is already covered by `"pass"` / `"warn"`.

### 5. [nit] system_spec_consistency — spec §5.1 F-6

Gap: F-6 states *"a registered human formatter renders a table (E2-S3)"*. Verified
in source: **no command registers a human formatter** — `repair-state` (the cited
pattern) relies on the generic `renderHuman` fallback in `src/cli/output/human.ts`,
and the plan correctly mirrors that (no formatter-registration task). The spec's
"registered human formatter… table" wording overstates the actual mechanism.

Suggested remediation target phase: specification
Suggested fix: Soften F-6 to match reality: human output is produced via the generic
`renderHuman` fallback (or, optionally, a registered table formatter) — so the
contract is "human-readable output is rendered by the existing output pipeline",
not a mandated per-command table formatter.

## Decision Routing

- Findings 1–5 are all author-fixable artifact revisions; **no decision needs
  human input** (Pause Required: no).
- Finding 2 touches a control-flow description but the *mechanism* is already
  decided (DEC-3 / DEC-4) — it is a prose-reconciliation, not a new decision, so
  no new ADR/TDR is required.
- TDR-0009 (`EXIT_HEALTH=60` / `DOCTOR_FAIL`) is consistently referenced across
  spec DEC-4 / Appendix B, test-plan TC-DOCTOR-010, and plan Phase 1 — no drift.

## Next Steps for @pm

Reopen two phases (small, surgical loop — no redesign):
1. **delivery_planning** — fix Finding 1 (Phase 1 test-file new→extend + pinning
   edits).
2. **specification** — fix Findings 2, 3, 5 (§16 handler prose; F-5/Appendix A/§23
   renderer; F-6 formatter wording).
3. **test_planning** — fix Finding 4 (TC-DOCTOR-011 worstStatus union).

Then re-run this gate (iteration 2). The blocking findings (1, 2) are localized;
do not block on the minor/nit findings if 1 and 2 are resolved.
