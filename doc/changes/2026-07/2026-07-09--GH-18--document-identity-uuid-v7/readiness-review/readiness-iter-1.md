---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (MIT License)
id: readiness-gh-18-iter-1
workItemRef: GH-18
iteration: 1
date: 2026-07-09
verdict: NOT_READY
pause_required: false
reviewer: readiness-reviewer
---

# Readiness Review Iteration 1

Verdict: **NOT_READY**
Work Item: GH-18 ([MS2-E3-S1] Document identity / UUID v7)
Date: 2026-07-09
Pause Required: **no** (all findings are reconciliation gaps resolvable by author agents; no human-input escalation needed — ADR-0006 is settled, INV-SAFE-2→INV-SAFE-3 typo already resolved in pm-notes)

## Root cause (single sentence)

The spec, test-plan, and plan were authored in parallel (pm-notes confirm the session was interrupted before reconciliation) and **diverged on three public contracts and the test-layout**; they were never reconciled — which is precisely what this gate catches.

## Facet Summary

- spec_completeness: **PASS** (all 7 story deliverables → F-1..F-7; ADR-0006 C-1/C-4 + Identity covered; INV-SAFE-3 correctly governed; DoD defined in §17 + Appendix A)
- ac_quality: **FAIL** (one AC contract — `parseDocumentId` error type — is internally unfulfillable; one behavioral AC — collision-reporting scope — is contradicted by the test-plan)
- plan_coverage: **FAIL** (plan omits test-plan TC-DUP-007; init/frontmatter test paths+tiers diverge; scale AC-F4-3/NFR-11 unscheduled by name)
- test_traceability: **FAIL** (AC-F4-3 / NFR-11 has no TC; TC-DUP-005 expectation contradicts the spec decision it traces to; provisional F-IDENTITY-* labels unreconciled)
- cross_artifact_consistency: **FAIL** (parseDocumentId signature; collision-reporting scope; DEC-1..5 ID namespace collision; TC-DUP-006 ID collision; test-layout paths/tiers) — highest-value facet
- decision_capture: **FAIL** (plan's `DocumentIdError` decision + parse-signature change not propagated to the contract authority spec)
- system_spec_consistency: **PASS** (consistent with feature-safe-publish.md §3.1/§3.3/§5, ADR-0006, UL, id-prefix-catalog, typescript.md tiers; no drift)
- plan_doc_update_coverage: **PASS** (plan §6.3 + Out-of-Scope flag feature-safe-publish.md / ubiquitous-language.md / id-prefix-catalog.md / ADR-0006 / typescript.md for phase 7)
- plan_code_area_coverage: **PASS** (every phase lists exact files; verified `selectFiles`/`loadConfig` in src/app/config.ts, `parseFrontMatter` in src/app/document-config.ts, `CLI_VERSION` at router.ts:41, empty identity/binding skeletons — all accurate)
- dod_defined: **PASS** (spec §17 AC list = DoD; story "AC list is the DoD")

## Verified facts (intake cross-check — all hold)

- `src/domain/identity/` + `src/domain/binding/` = empty `.gitkeep` skeletons ✓
- `DuplicateUuid` arm `{ kind: "DuplicateUuid"; uuid; paths }` exists in `src/domain/errors.ts:44` and `assertNeverMarkSyncError` handles it (errors.ts:112) ✓ — plan correctly consumes it, adds NO new arm ✓
- `Result<T,E>` + `Result.ok`/`Result.err` exist (result.ts) ✓
- `yaml` ^2.9.0 installed; `uuid` NOT installed (package.json deps; node_modules/uuid absent) — plan's Phase 0 `bun add uuid` is correct, no `@types/uuid` ✓
- dep-cruiser ships 4 `forbidden` rules severity `error` (domain→infra, domain→app, cli→domain, cli→infra) ✓ — plan's tier-purity claims are accurate
- INV-SAFE-3 = duplicate-UUID fatal (id-prefix-catalog.md:58); spec/test-plan/plan all govern on INV-SAFE-3; issue-body "INV-SAFE-2" is the documented label typo ✓

## Findings

### 1. [major] cross_artifact_consistency + decision_capture + ac_quality — spec §5.1/F-2 (line 110) vs plan DEC-4 (lines 61, 183, 429) vs test-plan OQ-TP-4

**Gap:** The three artifacts disagree on `parseDocumentId`'s error type — a public contract consumed by every identity reader (`readUuid`, the detector's callers, E3-S2/S3/S5/S6):
- SPEC: `parseDocumentId(s): Result<DocumentId, MarkSyncError>` (line 110).
- PLAN (DEC-4): `parseDocumentId(s): Result<DocumentId, DocumentIdError>` with a new domain-local `type DocumentIdError = { kind: "InvalidDocumentId"; value: string }` (lines 61, 183, 429).
- TEST-PLAN: defers — "pin the actual shape at delivery" (OQ-TP-4, TC-DOCID-001 step 2).

The spec is **internally unfulfillable as written**: there is no `MarkSyncError` arm for an invalid document id, and §8.3 DM-5 / §16 / §21 forbid adding one ("adds no new domain error kind"). So `Result<DocumentId, MarkSyncError>` has no error value to return on a malformed input. The plan's DEC-4 (narrow `DocumentIdError`) is the workable resolution but was never propagated to the contract-authority spec, and the plan's revision log admits it was authored before the spec existed and "will be reconciled if the spec diverges" — the divergence was never reconciled. The coder cannot know which signature to implement.

**Suggested remediation target phase:** specification
**Suggested fix:** In `chg-GH-18-spec.md`, change F-2/DM-1 to `parseDocumentId(s): Result<DocumentId, DocumentIdError>`, add a `DocumentIdError` DM entry, and record the decision as a spec DEC (the plan's DEC-4 reasoning is sound — no union/exhaustiveness churn). Then align the test-plan TC-DOCID-001 + close OQ-TP-4 to the chosen shape. (If the spec instead insists on `MarkSyncError`, a new arm is required and §8.3/§16/§21 must be updated — but that contradicts the "first-producer, no union change" framing the spec itself adopts.)

### 2. [major] cross_artifact_consistency + test_traceability — test-plan TC-DUP-005 (lines 851-879) + OQ-TP-2 (line 1330) vs spec F-4 (line 114) / §7.3 (line 188) / DEC-1 (line 296)

**Gap:** The duplicate-UUID **collision-reporting scope** is decided in the spec but reopened (and contradicted) in the test-plan:
- SPEC (decided): F-4 — "returns `err(...)` (**the first collision encountered**; the paths are the offending documents)"; §7.3 Deferred — "the detector reports **the first collision**; a 'report all collisions' mode is deferred"; DEC-1 reinforces single-err semantics.
- TEST-PLAN (contradicts + reopens): TC-DUP-005 uses a fixture with **two separate collisions** (X over 3 docs, Y over 2 docs) and expects "both X and Y collisions must be discoverable" / "surfaces enough to locate **every** offender"; OQ-TP-2 asks "Does `detectDuplicateUuids` report only the FIRST collision or aggregate ALL … pin at delivery".

The spec's "first collision only" is a deliberate decision. The test-plan's TC-DUP-005 expectation (all offenders surfaced) would FAIL against the spec'd behavior and reopens a settled question. The PLAN (Phase 3, TC-DUP-004/005/006 "first duplicate found") is consistent with the spec — the test-plan is the outlier.

**Suggested remediation target phase:** test_planning
**Suggested fix:** Align TC-DUP-005 to the spec: assert the detector returns exactly ONE `err` for the first collision (uuid + its paths) and does NOT surface the second collision in the same result; close OQ-TP-2 as resolved-by-spec (first-collision; aggregate mode deferred per §7.3). Alternatively, if aggregate-reporting is actually desired, raise it as a spec change (reopens §7.3 + F-4 + DEC-1) — but do not leave the test-plan expecting behavior the spec forbids.

### 3. [major] plan_coverage + cross_artifact_consistency — test-plan §4/§7 vs plan Phases 2-5 (test-layout divergence)

**Gap:** The test-plan and the plan disagree on which tests to write, at which tier, and at which path. A coder following the plan produces a suite that does not match the test-plan, and vice versa:
- (a) **Orphaned TC:** test-plan §7 lists **TC-DUP-007** (integration, "DuplicateUuid pre-write halt", `tests/integration/identity/duplicate-detector.test.ts`) as "To Implement", but **no plan phase** creates that file — Phase 3 creates only `tests/unit/domain/identity/duplicate-detector.test.ts`. TC-DUP-007 is unscheduled.
- (b) **Init-test tier + path mismatch:** test-plan places init tests at **Integration** (`tests/integration/identity/init-uuid.test.ts`, TC-INIT-001/002); the plan places them at **Unit** (`tests/unit/app/identity-assign.test.ts` + extended `tests/unit/cli/commands/init.test.ts`, Phase 5.3/5.4). Different tier AND different path for the same AC-3 coverage.
- (c) **Frontmatter integration path mismatch:** test-plan `tests/integration/identity/frontmatter.test.ts` (subfolder) vs plan `tests/integration/identity-frontmatter.test.ts` (flat).
- (d) **Golden tier:** test-plan commits a Golden fixture (TC-INJECT-005 + `tests/golden/fixtures/identity/*.md` + `.expected.md` pairs); the plan achieves byte-stability via an Integration test (TC-INT-FM-001) and creates **no** `tests/golden/` artifacts. (Note: testing-strategy.md scopes the Golden tier examples to renderer output, so this is a test-plan↔plan divergence, not a hard strategy violation — but the divergence itself must be resolved.)

**Suggested remediation target phase:** delivery_planning (+ test_planning for the tier choice in (b)/(d))
**Suggested fix:** Reconcile ONE authoritative test layout. Concretely: (i) decide TC-DUP-007's fate — either schedule it in a plan phase or mark it deferred-to-E5-S1 in the test-plan (it must not be "To Implement" with no owner, given story AC-1 allows the zero-writes proof "in E3-S6 or here"); (ii) pick one tier+path for the init tests and use it in both artifacts; (iii) unify the frontmatter integration path; (iv) decide Golden-vs-Integration for byte-stability and make both artifacts say the same.

### 4. [major] test_traceability + cross_artifact_consistency — spec AC-F4-3 / NFR-11 (lines 234, 328) vs test-plan §3.3 (NFR coverage) vs plan Phase 3 "TC-DUP-006"

**Gap:** The spec elevates detector scale to an **acceptance criterion** with a measurable threshold — AC-F4-3 / NFR-11: "`detectDuplicateUuids` over a ≤500-doc corpus completes in ≤ 5 ms (p95)". But:
- The test-plan's NFR-coverage table (§3.3) **omits NFR-11** entirely — there is no TC traced to AC-F4-3.
- The PLAN invents a 500-doc scale test and labels it **"TC-DUP-006"** (Phase 3.2), but **TC-DUP-006 is already used by the test-plan** for a *different* scenario ("`DuplicateUuid` is the existing MarkSyncError arm; flows via Result + error-map → DUPLICATE_UUID / exit 50"). Same ID, two different tests.

So a spec AC has no test-plan trace, and an ID collision makes "TC-DUP-006" ambiguous.

**Suggested remediation target phase:** test_planning (+ delivery_planning to schedule + de-collide)
**Suggested fix:** Add an explicit scale TC to the test-plan (e.g. TC-DUP-SCALE-001 or TC-DUP-008) traced to AC-F4-3 / NFR-11 (note: p95 latency assertions are CI-flaky — consider asserting O(n) single-pass behavior + a coarse budget rather than a hard p95, or relax AC-F4-3 to an NFR if a hard ms threshold is not realistically enforceable). Rename the plan's 500-doc test to the new ID so it no longer collides with the test-plan's TC-DUP-006.

### 5. [minor] cross_artifact_consistency — spec §15 DEC-1..5 vs plan "Binding decisions" DEC-1..5

**Gap:** The spec's DEC-1..5 and the plan's DEC-1..5 are **different decisions sharing the same IDs** (spec DEC-1 = Result-vs-throw; plan DEC-1 = domain-uses-yaml-directly; spec DEC-4 = branded DocumentId; plan DEC-4 = narrow DocumentIdError; etc.). DEC IDs are used as traceability anchors; the collision makes cross-referencing ambiguous (compounds Finding 1).

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Namespace the plan's delivery-level decisions (e.g. `PD-1..PD-5` or "delivery decision") or explicitly mark them as plan-level extensions of the spec's DECs. Keep the spec's DEC-N as the single contract namespace.

### 6. [minor] test_traceability / cross_artifact_consistency — test-plan §3.1 (lines 149-165) + OQ-TP-5

**Gap:** The test-plan still uses provisional labels `F-IDENTITY-1..6` / `DM-IDENTITY-1..4` and states (OQ-TP-5) they "will be reconciled to the spec's F-# / AC-# once `chg-GH-18-spec.md` lands". The spec has now landed with F-1..F-7, DM-1..DM-5, AC-F1-1..AC-F4-3 — the reconciliation is overdue. (AC-level traceability via story AC-1..AC-6 is intact, so impact is limited, but the F-/DM- namespaces disagree.)

**Suggested remediation target phase:** test_planning
**Suggested fix:** Reconcile the test-plan's F-IDENTITY-* / DM-IDENTITY-* labels to the spec's F-1..F-7 / DM-1..DM-5 (or add an explicit mapping table), and close OQ-TP-5.

### 7. [minor] plan_coverage — spec NFR-13 (line 236) vs plan Phase 0 / test-plan §6

**Gap:** NFR-13 sets a measurable threshold — `uuid` must be **≤ 20 transitive dependencies** and pass license-audit (reject GPL/AGPL/LGPL/UNLICENSED). The test-plan defers license to "the repo-wide GH-14 gate" and the plan's Phase 0 only runs typecheck + boundaries — neither asserts the ≤20 transitive-dep count. (`uuid` is effectively zero-dependency, so this is low-risk, but the threshold is story-specific and currently unverified by any artifact.)

**Suggested remediation target phase:** delivery_planning
**Suggested fix:** Add a Phase-0 check that records `uuid`'s resolved transitive-dep count (e.g. `npm ls uuid --all` / `bun pm ls`) and confirms ≤20 + MIT, or explicitly defer NFR-13's transitive-count clause to the repo-wide license/audit gate with a one-line note in the plan.

## What is solid (do not re-litigate on revision)

- Scope correctness vs the 7 story deliverables and 6 ACs — all covered; nothing out-of-scope (lock E3-S2 / drift E3-S5 / Confluence write E3-S4/E3-S6) leaked in.
- ADR/spec compliance — UUID v7 (not v4), branded `DocumentId`, duplicate-fatal via Result-then-caller-halt (DEC-1), `PageBinding` type-only, `marksync.uuid` namespace (DEC-2), INV-SAFE-3 (not INV-SAFE-2).
- Technical soundness — DEC-3 surgical text insertion (NOT `yaml.stringify` round-trip) is the correct byte-stability strategy; tier rules respected (identity imports only `uuid`/`yaml` + domain siblings); dep-cruiser enforcement accurately characterized; `bun add uuid` (no `@types/uuid`) correct.
- Plan code-area accuracy — all cited files/functions verified present (`selectFiles`/`loadConfig` in `src/app/config.ts`; `parseFrontMatter` in `src/app/document-config.ts`; `CLI_VERSION` at `router.ts:41`; `initCommand` in `src/cli/commands/init.ts` presentation-thin via `writeStarterConfig` + `resultErrorFromAppResult`).
- Testing approach — domain logic tested with real inputs/outputs, no mocked domain logic (over-mocking guardrail satisfied); INV-SAFE-3 has a unit proof + a contributing BDD scenario (step defs in E5-S1, fixture here); byte-stability has a byte-compare assertion.
- Risks — R1 (same-ms collision) acknowledged; byte-stability risk (RSK-1/TR-1) addressed.

## Reopening map (for @pm)

| Finding | Reopen phase | Owner agent |
|---|---|---|
| 1 (parseDocumentId error type) | specification | @spec-writer |
| 2 (collision-reporting scope) | test_planning | @test-plan-writer |
| 3 (test-layout divergence) | delivery_planning + test_planning | @plan-writer + @test-plan-writer |
| 4 (scale AC untraced + ID collision) | test_planning + delivery_planning | @test-plan-writer + @plan-writer |
| 5 (DEC namespace collision) | delivery_planning | @plan-writer |
| 6 (provisional labels) | test_planning | @test-plan-writer |
| 7 (NFR-13 transitive-dep check) | delivery_planning | @plan-writer |

No `delivery` reopening. No `needs_human_input`. No new ADR required (ADR-0006 settled; all decisions are change-scoped).
