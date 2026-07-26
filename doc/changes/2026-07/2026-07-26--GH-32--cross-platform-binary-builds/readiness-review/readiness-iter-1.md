# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-32
Date: 2026-07-26
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: FAIL
- test_traceability: PASS
- cross_artifact_consistency: FAIL
- decision_capture: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: FAIL
- dod_defined: PASS

## Verification Performed (read-only)
- Read ticket GH-32 (`gh issue view 32`), authoritative story `MS2-E5-S4--binary-builds.md`, full spec (438 lines), full test-plan (647 lines), full plan (829 lines), pm-notes.yaml.
- Verified against live code/config: `package.json` (version 0.7.0, engines.bun 1.2.23), `.github/workflows/ci.yml` (bun-version 1.2.23, setup-bun@v2, frozen-lockfile, fail-fast:false, concurrency, doc-yaml-lint scan_globs), `.gitignore` (line 32 `dist/`; NO `.benchmarks/` entry), `src/cli/index.ts` exists, `src/cli.ts` does NOT exist (skeleton placeholder is dead), `src/cli/commands/doctor.ts` + EXIT_HEALTH=60 contract, `doctor --json` global flag (entrypoint.test.ts:82), `--version` via Cliffy `.version(CLI_VERSION)`, `findings/bun-compile-smoke-findings.md` baseline numbers (96.90 MB / 105.12 MB / 0.010 s), `spikes/bun-compile-smoke/probes/signing-dry-run.md` recipe (`$CERT_PASSWORD` env-var name), deps GH-13 CLOSED + GH-14 CLOSED.
- **Key code finding:** `src/cli/commands/router.ts` declares `export const CLI_VERSION = "0.7.0"` — a **hardcoded constant**, NOT a runtime `package.json` import. Comment: *"Kept in lock-step with package.json until a runtime version source is wired."*

## Findings

1. [critical] cross_artifact_consistency + plan_code_area_coverage — plan#Phase 1 task 1.3 + Phase 6 task 6.1 (C-NO-SRC) vs spec#G-7/§16/DM-3/AC-BUILD-1 vs actual code `src/cli/commands/router.ts`
   Gap: The plan simultaneously asserts (a) **C-NO-SRC** — "No `src/` file is created, edited, or deleted"; Phase 6 task 6.1 "Do not touch `src/`"; Phase 6 acceptance "git diff confirms zero `src/` change"; (b) **PLN-DEC-3** — bump `package.json` 0.7.0 → 0.8.0; (c) **DM-3 / AC-BUILD-1** — compiled binary's `--version` equals `package.json#version`. These three are **mutually unsatisfiable** given the actual code: `src/cli/commands/router.ts` exports a **hardcoded** `CLI_VERSION = "0.7.0"` and `.version(CLI_VERSION)` is wired into Cliffy — there is NO runtime `package.json` import. Bumping only `package.json` leaves the binary reporting the stale `0.7.0`. The plan's Phase 1 task 1.3 proposes `--define "process.env.MARKSYNC_VERSION=…"` (a no-op unless `router.ts` references that env var — it doesn't) or "if the CLI already reads its version from package.json at runtime via an import" (it doesn't) — both mechanisms require a `src/cli/commands/router.ts` edit that C-NO-SRC forbids. The **spec** G-7 / §16 correctly carves out "a trivial version-embed touch… the only conceivable exception," but the **plan's C-NO-SRC is stricter than the spec** and silently drops that carve-out. Executing the plan as written → Phase 6 ships package.json 0.8.0 but binary `--version` reports 0.7.0 → AC-BUILD-1 / DM-3 FAIL at the DoD gate.
   Suggested remediation target phase: delivery_planning
   Suggested fix: One of (a) relax C-NO-SRC to permit the spec's "trivial version-embed touch" in `src/cli/commands/router.ts` (either bump `CLI_VERSION` to 0.8.0, or wire a runtime `package.json` import / `process.env.MARKSYNC_VERSION` read consumed by Cliffy), and have Phase 1 task 1.3 specify the exact `src/` edit; OR (b) drop PLN-DEC-3 (defer the version bump to a story that owns wiring a runtime version source) and keep `--version` reporting the existing hardcoded 0.7.0. The plan cannot keep all three of {absolute C-NO-SRC, PLN-DEC-3 bump, DM-3 satisfied}.

2. [minor] cross_artifact_consistency — test-plan#§1.1 In Scope
   Gap: §1.1 states "Ten E2E release-tier test cases covering: 1…10," but §5.1 Scenario Index lists only **9 unique TC IDs** (TC-BUILD/RUN-001/RUN-002/SIZE/START/REL/SIGN/CI/SEC). The §1.1 10th item ("Release matrix correctness") is folded into TC-REL-001 alongside item #6. The spec correctly says "10 ACs"; the test-plan's "10 TCs" is a miscount (9 TCs cover 10 ACs because TC-REL-001 traces to both AC-COMP-1 and AC-REL-1, per §3.1).
   Suggested remediation target phase: test_planning
   Suggested fix: Change §1.1 "Ten" → "Nine" (and note TC-REL-001 covers 2 ACs), OR split TC-REL-001 into separate matrix-correctness and artifact-assembly TCs if a 1:1 AC:TC mapping is preferred.

3. [minor] cross_artifact_consistency — test-plan#TC-RUN-001 step 5 vs plan#Phase 2 task 2.2
   Gap: TC-RUN-001 step 5 / Pass-Fail criteria says "Assert the doctor command exits 0 (or the appropriate exit code for a valid mock/sandbox response)." The plan Phase 2 task 2.2 is more correct: it recognizes the doctor contract returns `EXIT_HEALTH=60` (`src/cli/output/exit-codes.ts:72`) when a check fails in an empty/minimal corpus, and asserts **JSON validity rather than exit 0**. In an empty corpus the doctor smoke will legitimately exit 60, so the test-plan's "exits 0" is misleading and could cause a false FAIL.
   Suggested remediation target phase: test_planning
   Suggested fix: Align TC-RUN-001 step 5 + Pass/Fail criteria with the plan's reasoning: assert a valid JSON document is produced and record the exit code per the doctor contract (0 healthy / 60 health-fail), rather than asserting "exits 0."

4. [minor] dod_defined / ac_quality — spec#§17.1 DoD + AC-REL-1, AC-COMP-1
   Gap: AC-REL-1 and AC-COMP-1 can only be **structurally** validated during delivery (YAML-lint + the release.yml asset-presence assertion step) because `release.yml` triggers on a `v*` tag push, which does not occur pre-merge. The spec DoD §17.1 says "release.yml produces binaries + SHA256SUMS + SBOM on tag" — strictly requiring an actual tag, which is a post-merge maintainer action. The plan acknowledges this (TC-REL-001 note: "structural validation in-CI; full e2e on first tag"), but the spec DoD does not — so 2 of 10 ACs are not fully e2e-verifiable at the DoD gate as written.
   Suggested remediation target phase: specification
   Suggested fix: Add an explicit note to spec §17.1 that AC-REL-1 / AC-COMP-1 accept structural validation (workflow YAML correctness + asset-presence assertion step) at delivery, with full e2e sign-off on the first real `v*` tag (post-merge), so the spec and plan agree on the DoD bar for these 2 ACs.

5. [nit] system_spec_consistency — test-plan#§6 Environments (alpine exclusion citation)
   Gap: §6 says "No `alpine` smoke in this story (out of scope per spec NG-8)." But spec NG-8 is "Any `src/` domain-logic change." Alpine/musl is actually in spec §7.3 Deferred/Maybe-Later, not NG-8. Wrong NG citation.
   Suggested remediation target phase: test_planning
   Suggested fix: Cite spec §7.3 (Deferred / Maybe-Later) instead of NG-8 for the alpine exclusion.

6. [nit] plan_coverage / determinism — plan#Phase 5 task 5.3 (SBOM tool pin)
   Gap: Task 5.3 says "pin a version — use `anchore/sbom-action@v0` with an explicit `version:` OR a direct `curl` install of a pinned syft release" but leaves the exact pin to delivery. `@v0` is a floating major version, which sits awkwardly with the determinism/reproducibility emphasis (DEC-1 spirit, RSK-1).
   Suggested remediation target phase: delivery_planning
   Suggested fix: Specify a concrete syft/sbom-action pin (e.g. `anchore/sbom-action@v0.X.Y` or a SHA-pinned syft download) in the task body, consistent with how DEC-1 pins Bun to an exact patch.

## What Passed (briefly)
- Spec addresses every story AC (8 story ACs → 10 spec ACs: 8 direct + AC-BUILD-1 implicit in deliverable #1 + AC-SEC-1 hygiene guard); no scope gaps.
- Both PM-flagged critical hazards are encoded as DEC-1 (Bun 1.2.23) and DEC-2 (`debian:stable-slim`) across spec/test-plan/plan — verified consistent; the wrong tag `debian:slim` appears ONLY in the story text and is explicitly reconciled everywhere downstream.
- Reuse-not-rewrite: Phase 1 refines the existing `scripts/build-binaries.sh` skeleton; Phase 4 references (does not duplicate) the validated spike signing recipe. Confirmed against the actual files.
- CI conventions mirrored: setup-bun@v2, checkout@v4, frozen-lockfile, fail-fast:false, concurrency (C-CI-CONV matches ci.yml).
- Secret hygiene: `$CERT_PASSWORD` env-var NAME only, verified in the spike recipe + encoded as DEC-7/C-SECRET/AC-SEC-1/TC-SEC-001.
- Gitignore correctness: `.benchmarks/` NOT gitignored (commit-tracked), `dist/` gitignored — verified against `.gitignore` line 32; encoded as C-TRACKED.
- Dependencies resolved: GH-13 CLOSED, GH-14 CLOSED (verified via `gh issue view`).
- Determinism: Bun 1.2.23 is the single release/smoke pin; the spike's 1.1.34 appears only as a clearly-marked historical baseline marker in PLN-DEC-2.
- All 10 ACs Given/When/Then + testable; all 10 traced to TCs (§3.1) and to phases (plan AC-coverage table).
- Doc-update coverage and code-area coverage sections present and explicit.
