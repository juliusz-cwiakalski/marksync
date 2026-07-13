# Readiness Review Iteration 3

Verdict: READY
Work Item: GH-69
Date: 2026-07-13
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

## Iter-2 Status

Iter-2 had 1 MAJOR (persistent) + 1 MINOR (new). Verified disposition:

- **MAJOR #1 (persistent — P3.1 code sketch ordering):** RESOLVED. The fenced
  ```ts sketch now executes in the correct order:
  1. Line 243: `const assetResult = await resolver.resolve(hast, path);` — FIRST
     (resolver sees only the pre-mermaid HAST with real local `<img>` paths).
  2. Line 266: `const mermaidResult = await transform(hast, config.render.mermaid, renderer);`
     — SECOND (injects synthetic `marksync-mermaid-<hash>.svg` img nodes).
  3. Line 285: `const renderResult = target.renderBody(hast, { sourcePath: path });`
     — LAST (renders the merged tree to Storage XHTML).
  `resolver.resolve()` appears exactly ONCE in the sketch (line 243); no
  duplication. The later `assetSet` references (lines 296, 306) reuse the value
  from line 245, consistent with a single resolver pass. Inline comments now
  align with code order: lines 240-242 ("MUST run before the mermaid transform
  so the resolver never sees the synthetic … nodes") and lines 248-254
  ("transform MUST run AFTER resolver.resolve() and BEFORE target.renderBody()").
  The ordering rationale is load-bearing and documented in 3 places: P3.1
  inline comments, Phase-3 Goal prose (line 230), and Notes for the coder
  (lines 506-518).
- **MINOR #2 (new — TC-MERM-012 wiring):** RESOLVED. `rg "TC-MERM-012"` in the
  plan returns 3 matches: P2.2 task bullet (line 219), Test Scenarios table row
  mapping to P2 / AC-4, F-6, NFR-5 (line 436), and the revision-log entry
  (line 464). Both required locations present (≥2 matches as expected).

## Cross-checks performed (all consistent, no regressions)

- **Statement-order verification:** `resolver.resolve` (line 243) → `transform`
  (line 266) → `target.renderBody` (line 285). Source order matches the
  invariant. The iter-1 BLOCKER bug (resolver receiving synthetic img nodes →
  `realpathSync` failure → `Forbidden(path-traversal)` → plan abort) can no
  longer be reproduced by following the sketch.
- **Single resolver pass:** `resolver.resolve()` is invoked exactly once in the
  sketch. `assetSet` (line 245) flows correctly into P3.3 attachmentHashes
  construction (line 296, `assetSet.srcMap.values()`) and P3.4 PlanEntry.assets
  (line 306, `[...assetSet.artifacts, ...mermaidArtifacts]`).
- **Full-hash decision consistency:** `rg -ni "truncated|24 char|first-24|<sha256-24>"`
  across the entire change folder returns ZERO matches. No stale truncation
  text in spec / test-plan / plan. All use `marksync-mermaid-<fullsha256>.svg`
  or `<full-sha256-hex>.svg`.
- **AC ↔ TC ↔ phase traceability:** all 7 ACs covered with explicit plan phases:
  - AC-1 → TC-MERM-001 (P3), TC-MERM-002 (P4), TC-MERM-011 (P3)
  - AC-2 → TC-MERM-003 (P3)
  - AC-3 → TC-MERM-004 (P2)
  - AC-4 → TC-MERM-005 (P1/P3), TC-MERM-006 (P3), TC-MERM-010 (P1), TC-MERM-012 (P2)
  - AC-5 → TC-MERM-007 (P2)
  - AC-6 → TC-MERM-008 (P3)
  - AC-7 → quality gate (P5)
- **Error-handling consistency in sketch:** `RemoteUnreachable` → per-document
  warning (line 270-273); other errors abort the plan (line 275). Matches spec
  F-6 / NFR-6 / ADR-0002 C-2.
- **Privacy warning placement:** emitted once per run via `privacyWarningEmitted`
  flag (lines 258-263), guarded by `policy === "render"` check. Matches spec
  F-5 / DEC-6 / NFR-PRIV-2.
- **No new issues from sketch rewrite:** the remediation reordered statements
  and aligned comments without introducing dangling references, type mismatches,
  or logic gaps. `mermaidArtifacts`, `assetSet`, and `hast` reassignment are all
  consistent downstream.

## Findings

None. All iter-1 and iter-2 findings resolved; no new BLOCKER/MAJOR/MINOR
identified.

## Verdict rationale

READY. The two iter-2 delivery_planning gaps are both genuinely resolved:
(1) the P3.1 code sketch now shows `resolver.resolve()` FIRST, `transform()`
SECOND, `target.renderBody()` LAST, with a single resolver invocation and
aligned inline comments; (2) TC-MERM-012 is wired into both the plan's Test
Scenarios table and the P2.2 task bullet list. All 10 DoR facets PASS. No
regressions in AC traceability, full-hash decision consistency, ordering
rationale documentation, or error/privacy-warning handling. The change is
cleared for delivery.

## Next step

`@pm` proceeds to phase 6 (delivery). `@coder` executes the plan phases in
order; the P3.1 sketch is now safe to follow literally.
