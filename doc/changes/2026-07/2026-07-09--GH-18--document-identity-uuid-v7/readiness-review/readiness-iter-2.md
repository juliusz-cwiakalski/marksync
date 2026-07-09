---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (MIT License)
id: readiness-gh-18-iter-2
workItemRef: GH-18
iteration: 2
date: 2026-07-09
verdict: READY
pause_required: false
reviewer: readiness-reviewer
prior_verdict: NOT_READY (iter-1)
---

# Readiness Review Iteration 2

Verdict: **READY**
Work Item: GH-18 ([MS2-E3-S1] Document identity / UUID v7)
Date: 2026-07-09
Pause Required: **no** (reconciliation converged; no human-input escalation; ADR-0006 settled; no new ADR required)

## Root cause (single sentence)

The PM-RECON-1 authoritative reconciliation decisions were applied surgically by all three author agents and **converged**: every iter-1 blocking contradiction on a public contract (parseDocumentId error type, duplicate-collision scope, test layout/tiers, scale AC + TC-ID collision) is now resolved across spec/test-plan/plan with no residual contradiction.

## Facet Summary

- spec_completeness: **PASS** (7 deliverables → F-1..F-7; ADR-0006 C-1/C-4 + Identity; INV-SAFE-3 governed; scale correctly demoted AC-F4-3 → NFR-11; DEC-6 + DM-6 added)
- ac_quality: **PASS** (AC-F2-1 now internally consistent — `DocumentIdError` is a workable, typed error; ACs clear/testable/non-overlapping)
- plan_coverage: **PASS** (every AC + deliverable scheduled; TC-DUP-007 + TC-SCALE-001 now owned by plan phases; init = Integration phase 5.3)
- test_traceability: **PASS** (§3.1 coverage table traces all 11 AC-Fx-y incl. AC-F4-3/NFR-11 → TC-SCALE-001; every F-/DM-/DEC- canonical)
- cross_artifact_consistency: **PASS** (parseDocumentId signature, first-collision-only, test layout/tiers, TC-DUP-006/TC-SCALE-001 split all align across the three artifacts) — highest-value facet
- decision_capture: **PASS** (PM-RECON-1 in pm-notes; DEC-6 in spec; PD-4 in plan; namespaces de-collided)
- system_spec_consistency: **PASS** (feature-safe-publish.md, ADR-0006, UL, id-prefix-catalog INV-SAFE-3, typescript.md tiers all consistent; `DuplicateUuid` arm verified pre-existing at errors.ts:44 — no new arm)
- plan_doc_update_coverage: **PASS** (plan §6.3 + Out-of-Scope flag feature-safe-publish.md / ubiquitous-language.md / id-prefix-catalog.md / ADR-0006 / typescript.md for phase 7)
- plan_code_area_coverage: **PASS** (every phase lists exact files; verified `selectFiles`/`loadConfig`, `parseFrontMatter`, `CLI_VERSION` at router.ts, empty identity/binding skeletons)
- dod_defined: **PASS** (spec §17 AC list = DoD; story "AC list is the DoD")

## Iter-1 findings — resolution verification

### 1. [major → RESOLVED] parseDocumentId error type (PM-RECON-1 Decision A)
- SPEC F-2 (line 110): `parseDocumentId(s): Result<DocumentId, DocumentIdError>` — "a narrow domain-local error type — NOT a `MarkSyncError` arm; see DEC-6". ✓
- SPEC DM-6 (line 209) + DEC-6 (line 302): `DocumentIdError` added; rationale complete (no existing arm fits; error rule forbids a new union arm unless recovery differs). ✓
- SPEC AC-F2-1 (line 327): invalid input → `err(DocumentIdError)` (NOT a `MarkSyncError` arm). ✓
- PLAN PD-4 (lines 133-151) + D-2 (lines 184-186): `Result<DocumentId, DocumentIdError>`, narrow domain-local, marked AUTHORITATIVE. ✓
- TEST-PLAN: no artifact says `Result<DocumentId, MarkSyncError>` for parseDocumentId. OQ-TP-4 aligned directionally (Result channel for expected failures). ✓
- Grep confirms zero remaining `Result<DocumentId, MarkSyncError>` for parseDocumentId in any artifact.
- **No contradiction remains on this public contract.**

### 2. [major → RESOLVED] Duplicate-UUID collision scope (PM-RECON-1 Decision B)
- SPEC F-4 (line 114) + §7.3 (line 188): first-collision-only; report-all deferred. ✓
- TEST-PLAN TC-DUP-005 (lines 880-917): rewritten — asserts first shared UUID (X) reported with ALL its paths; second distinct collision (Y) NOT surfaced in same result. ✓
- TEST-PLAN OQ-TP-2 (line 1426): **Closed (iter-2)** — first-collision-only. ✓
- PLAN Phase 3.1 (lines 644-649): "First-collision-only reporting … Do NOT enumerate every colliding uuid in one error." ✓
- **All three artifacts agree.**

### 3. [major → RESOLVED] Test-layout/tier divergence (PM-RECON-1 Decision C)
Authoritative layout verified identical in test-plan §4 (lines 252-260) and plan §D-7 (lines 209-224):
- `tests/domain/identity/uuid.test.ts` (Unit) ✓
- `tests/domain/identity/document-id.test.ts` (Unit) ✓
- `tests/domain/identity/frontmatter.test.ts` (Unit; byte-stability via inline exact-string assertion, NOT a separate `tests/golden/` file) ✓
- `tests/domain/identity/duplicate-detector.test.ts` (Unit; TC-DUP-007 halt-signal folded IN; no separate integration file) ✓
- `tests/domain/binding/page-binding.test.ts` (Unit) ✓
- `tests/integration/identity/identity-assign.test.ts` (Integration; init UUID assignment, real file I/O via temp dirs) ✓ — confirmed Integration in BOTH artifacts
- BDD: contributing scenario DRAFT in `tests/bdd/features/` only; step defs in E5-S1 (GH-29) ✓
- Layout matches testing-strategy.md §"File naming" (`src/domain/x.ts → tests/domain/x.test.ts`). ✓
- Grep confirms no ACTIVE commitment to create `tests/integration/identity/duplicate-detector.test.ts`, `tests/golden/` frontmatter fixture, `tests/unit/app/identity-assign.test.ts`, or `tests/unit/domain/...` — all such mentions are in negative-assertion ("NOT a …", "no separate …") or revision-log context. ✓
- Init is Integration in both artifacts (test-plan lines 258/270/1112/1150/1182; plan lines 220/819/1007). ✓

### 4. [major → RESOLVED] Scale AC untraced + TC-DUP-006 collision (PM-RECON-1 Decisions D + G)
- SPEC NFR-11 (line 235) + Appendix A (line 395): scale demoted from hard AC-F4-3 to NFR; O(n) by construction + ≤500-doc coarse smoke; no strict ms-p95. ✓
- TEST-PLAN TC-SCALE-001 (lines 999-1033): coarse 500-doc smoke, no ms assertion; traces AC-F4-3/NFR-11. ✓
- TEST-PLAN TC-DUP-006 (lines 921-951): stays the error-arm regression (DuplicateUuid → DUPLICATE_UUID → exit 50). ✓
- PLAN Phase 3.2 (lines 673-686): TC-DUP-006 = error-arm regression (NOT scale); TC-SCALE-001 = scale smoke. ✓
- OQ-TP-5 (line 1429): **Closed (iter-2)** — provisional F-IDENTITY-*/DM-IDENTITY-* labels retired. ✓
- No TC-ID collision; no strict ms-p95 assertion anywhere.

### 5. [minor → RESOLVED] DEC namespace collision (PM-RECON-1 Decision E)
- PLAN: DEC-1..5 → PD-1..5 (revision log line 1019 confirms rename). Grep finds zero plan-internal `DEC-#` decisions (only historical/revision-log references). ✓
- SPEC: keeps DEC-1..6 (DEC-6 added; maps to plan PD-4). No collision. ✓

### 7. [minor → RESOLVED] uuid transitive-dep note (Finding 7)
- PLAN Phase 0.1 (lines 382-386): "NFR-13 note … `uuid` is a zero-dependency package, so the ≤20-transitive-dependency budget (NFR-13) is satisfied trivially." ✓
- PLAN TS-19 (line 979): NFR-13 zero-dep note. ✓

## Cross-cutting DoR criteria (held in iter-1 — re-verified, still true)

- **7 story deliverables + 6 ACs covered; no E3-S2/S4/S5/S6 scope leaked.** F-1..F-7 ↔ plan D-1..D-7; Out-of-Scope sections explicit (lock E3-S2, drift E3-S5, write E3-S4/E3-S6). ✓
- **UUID v7 (not v4)** — DEC-3; **branded DocumentId** — DEC-4/DM-1; **duplicate-fatal via Result-then-caller-halt** — DEC-1; **PageBinding type-only** — DEC-5/F-5; **INV-SAFE-3 cited (not INV-SAFE-2)** — id-prefix-catalog.md:58 + spec §1 note. ✓
- **Byte-stable front-matter injection strategy (surgical text insertion)** — PD-3/F-3/NFR-2/3; sound (avoids `yaml.stringify` reformatting). ✓
- **Domain tier purity** — identity/binding import only own tier + uuid/yaml libs; dep-cruiser `domain→infra`/`domain→app` enforced (NFR-12, PD-1). ✓
- **`bun add uuid` in the plan** — Phase 0 (first consuming story; PD-5 no `@types/uuid`). ✓
- **Over-mocking guardrail** — real inputs/outputs, no mocked domain logic (test-plan §4 explicit). ✓
- **DuplicateUuid arm ALREADY exists** — verified `src/domain/errors.ts:44` (`{ kind: "DuplicateUuid"; uuid: string; paths: string[] }`) + `assertNeverMarkSyncError` case (errors.ts:112); plan adds NO new MarkSyncError arm. ✓

## Decision routing

- No new decision needs routing. PM-RECON-1 captured in `chg-GH-18-pm-notes.yaml`; DEC-6 captured in spec; PD-4 captured in plan.
- No system-level / precedent-setting decision requires an ADR (ADR-0006 is settled and being implemented; DEC-6 is change-scoped).
- No `needs_human_input` — no pause flag.

## Non-blocking observations (do NOT block delivery; no remediation phase reopened)

These are nits for optional future tightening. They do not break AC traceability or cross-artifact contracts, and both artifacts are individually self-consistent.

1. **[nit] cross_artifact_consistency — plan phase-task TC-IDs diverge from test-plan canonical IDs.** The plan's phase tasks use `TC-FM-001..009`, `TC-PB-001..003`, `TC-ASSIGN-001..005`, `TC-UUID-005`, `TC-DOCID-003`, while the test-plan's canonical IDs in those areas are `TC-INJECT-001..008`, `TC-IDSTABLE-001/002`, `TC-BIND-001`, `TC-INIT-001/002`, `TC-UUID-001..004`, `TC-DOCID-001..002`. (The detector phase DOES align: both use `TC-DUP-001..007` + `TC-SCALE-001`.) This is a naming divergence, NOT an ID collision, and the scenarios map 1:1 with both individually traceable to ACs. Optional: have the plan reference the test-plan's canonical TC IDs in phase tasks for cleaner cross-referencing.
   Suggested remediation target phase: delivery_planning (optional polish)

2. **[nit] test_traceability — test-plan TC-DOCID-001 step 2 retains a stale hedge.** Body says "a `Result.err` / typed throw per the module's chosen contract — pin the actual shape at delivery, see OQ-TP-4". DEC-6/DM-6/PD-4 have now committed the shape (`Result<DocumentId, DocumentIdError>`; throw is reserved for `assertUuidV7` invariants), and OQ-TP-4's own notes are aligned. The TC body's "typed throw" alternative wording is stale but non-contradictory. Optional: tighten TC-DOCID-001 step 2 to assert `Result.err({ kind: "InvalidDocumentId"; value })`.
   Suggested remediation target phase: test_planning (optional polish)

## Deduplication note

Iter-1 Findings 1–5 and 7 are all RESOLVED (not persistent). Iter-1 Finding 6 (provisional F-IDENTITY-* labels) is RESOLVED (folded into iter-1 Finding 4's OQ-TP-5 close). No iter-1 finding is repeated here as persistent. The two observations above are NEW (surfaced by tighter iter-2 scrutiny) and are non-blocking nits.

## Gate result

**READY.** All 10 DoR facets PASS. All four iter-1 blocking findings are resolved and converged across spec/test-plan/plan. No pause flag. The two non-blocking nits do not warrant reopening a phase. Delivery (lifecycle phase 6) may proceed under the hard-gate default.
