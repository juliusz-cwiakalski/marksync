# Readiness Review Iteration 2

Verdict: NOT_READY
Work Item: GH-69
Date: 2026-07-13
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
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Iter-1 Status

Iter-1 had 1 BLOCKER + 2 MAJOR + 5 MINOR. Verified disposition:

- BLOCKER #1 (P3.1 transform ordering): PARTIALLY RESOLVED — prose/comments now
  document the invariant correctly in 4 places, BUT the P3.1 code sketch itself
  still shows the statements in the wrong order (see Finding 1). Downgraded to
  MAJOR (persistent) because the prose remediation substantially reduces
  coder-error probability, yet the sketch still reproduces the bug if copied.
- MAJOR #2 (stale truncation text): RESOLVED. `rg` confirms no remaining
  "truncated to 24 chars" body text; only DEC-4 supersession note + explicit
  "NO truncation" clarifiers remain. Spec AC-5/G-4/F-4/DM-5/glossary/§7.1 all
  use `marksync-mermaid-<full-sha256-hex>.svg`.
- MAJOR #3 (phantom mermaidFilename helper): RESOLVED. DM-5 says "REUSE EXISTING,
  NO new helper"; §16 lists `naming.ts` as "NO CHANGE". Verified against
  `src/infra/confluence/attachments.ts:140-144` — `attachmentFilename()` already
  produces `marksync-mermaid-<hash>.svg` for `kind === "mermaid"`.
- MINOR #4 (F-4 hashing justification vs ADR-0002): RESOLVED (spec lines 95, 131).
- MINOR #5 (NG-3 accepted-risk note): RESOLVED (spec line 82).
- MINOR #6 (plan doc-impact section): RESOLVED (plan lines 390-418).
- MINOR #7 (TC-MERM-012 empty-source edge case): RESOLVED IN TEST PLAN (lines
  565-597), but its addition surfaced a NEW plan-wiring gap (see Finding 2).
- MINOR #8 (P2.1 recursive walk): RESOLVED (plan P2.1 lines 193-196).

## Cross-checks performed (all consistent)

- Kroki HTTP contract: `POST https://kroki.io/mermaid/svg`, `text/plain` body,
  `image/svg+xml` response — spec §8.1, plan P1.2, test plan §1.1 all agree;
  matches ticket + MS-0001 spike.
- Error mapping: HTTP 4xx/5xx + network + timeout → `RemoteUnreachable`
  (spec F-1, plan P1.2, errors.ts:97 `{ kind:"RemoteUnreachable"; status?:number;
  cause:string }`). Complete.
- Full-hash round-trip: `Artifact.hash` (full sha256) → `attachmentFilename()`
  → `marksync-mermaid-<fullhash>.svg` → upload → `attachmentExists(hash)` →
  `hashFromFilename` strips prefix → full hash. End-to-end consistent
  (attachments.ts:140-168). No truncation anywhere in the round-trip.
- AC ↔ TC traceability: every AC-1..7 has ≥1 TC in the test plan coverage
  tables, including TC-MERM-012 on AC-4.

## Findings

### 1. [MAJOR] (persistent) plan_coverage / cross_artifact_consistency — plan#Phase-3 / P3.1 code sketch (lines 238-287)

**Gap:** The iter-1 BLOCKER was "P3.1 code sketch places the mermaid transform
BEFORE `resolver.resolve()`." The remediation added correct prose/comments
stating the invariant (lines 240-246, 260, 281, 505-517) but did NOT reorder the
statements inside the sketch. As written, source order is:
1. Line 261: `const mermaidResult = await transform(hast, …)` — mermaid transform
   injects synthetic `<img src="marksync-mermaid-<hash>.svg">` nodes.
2. Line 275: `hast = mermaidResult.value.transformedHast;` — `hast` is replaced
   with the tree that now contains the synthetic img nodes.
3. Line 282: `const assetResult = await resolver.resolve(hast, path);` — the
   resolver receives the ALREADY-TRANSFORMED `hast`.

Verified against `src/domain/assets/resolver.ts:50-68`: the resolver walks EVERY
`<img>`, treats any non-http `src` as a local file path, calls `safeRealpath`
(`fs.realpathSync`), and on failure returns `Forbidden(path-traversal)` which
aborts the entire plan. So executing the sketch as written reproduces the exact
iter-1 BLOCKER on every doc containing a mermaid fence (TC-MERM-001 / AC-1 would
fail). The inline comments now contradict the code they sit next to:
- Line 260: "Run mermaid transform (after resolver.resolve() has processed all
  real local images)" — but `resolver.resolve()` is called AFTER this line.
- Line 281: "This runs BEFORE the mermaid transform to process real local `<img>`
  paths" — but this `resolver.resolve()` call appears AFTER `transform()`.

The invariant IS documented (so the user's verification criterion is met at the
prose level), and a coder who reads the full plan would likely implement
correctly; but the single most concrete artifact at the trickiest decision point
still demonstrates the bug, and a copy-paste of the sketch reintroduces it.

**Suggested remediation target phase:** delivery_planning

**Suggested fix:** Reorder the P3.1 sketch so `resolver.resolve(hast, path)`
executes (and `assetResult` is obtained) BEFORE the mermaid `transform(hast, …)`
block. Ensure the resolver runs on the pre-mermaid `hast` (local images only)
and the transform runs on the post-resolver `hast`. Align the two inline
comments with the new statement order. Prose/Notes sections need no change
(they are already correct).

---

### 2. [MINOR] (new, introduced by iter-1 remediation) plan_coverage — plan#Test Scenarios table (lines 426-436) + P2.2 task list (lines 213-219)

**Gap:** TC-MERM-012 (empty mermaid source → fallback) was added to the test
plan (scenario index, coverage tables AC-4/NFR-5, implementation mapping →
`tests/unit/domain/mermaid/transform.test.ts` Phase 2), but the plan was not
updated to carry it forward:
- The plan's "Test Scenarios" table (lines 426-436) lists TC-MERM-001..011 only
  — no TC-MERM-012 row.
- P2.2 (the Phase-2 unit-test task for `transform.test.ts`) lists TC-MERM-004,
  TC-MERM-007, TC-MERM-009 — no TC-MERM-012.

A coder executing the plan would have no visibility of TC-MERM-012 and could
omit it, leaving the empty-source fallback (AC-4) under-tested at the unit tier.

**Suggested remediation target phase:** delivery_planning

**Suggested fix:** Add a `TC-MERM-012` row to the plan's Test Scenarios table
mapping to P2 (unit) / AC-4, F-6, NFR-5; and add a `TC-MERM-012` bullet to P2.2
(empty-source fence → renderer error → pre kept + warning, no artifact).

---

## Verdict rationale

NOT_READY. Two delivery_planning gaps remain: one MAJOR persistent (P3.1 sketch
still reproduces the iter-1 BLOCKER if followed literally, despite correct prose)
and one MINOR new (TC-MERM-012 not wired into the plan). Both are surgical fixes
in `chg-GH-69-plan.md` only — no spec or test-plan rework needed. spec /
test-plan / decision-capture / system-spec-consistency / doc-coverage /
code-area-coverage / DoD facets all PASS. Reopen `delivery_planning` for iter-3;
this is not a stalemate (prose remediation made real progress, only the sketch
ordering + a missing table row remain).

## Next remediation target phase

`delivery_planning` (plan-writer): apply Finding 1 (reorder P3.1 sketch
statements + align inline comments) and Finding 2 (add TC-MERM-012 to plan Test
Scenarios table + P2.2). Then re-run DoR iter-3.
