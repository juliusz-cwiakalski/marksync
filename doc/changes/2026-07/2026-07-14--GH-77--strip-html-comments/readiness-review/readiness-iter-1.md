# Readiness Review Iteration 1

Verdict: NOT_READY
Work Item: GH-77
Date: 2026-07-14
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

## Verification performed (grounding)
- Ticket `gh issue view 77` (7 ACs) cross-checked against spec (9 ACs) — all 7
  ticket ACs covered.
- Root-cause code claims CONFIRMED against source:
  - `src/domain/markdown/unsupported.ts:90-96` — `raw + parent.type === "root"`
    → `UnsupportedConstruct: raw-html-block` (block-comment abort path).
  - `src/infra/confluence/render/storage.ts:73` — `visitChild` raw →
    `escapeText` (inline-comment leak path).
  - `src/domain/render/canonicalize.ts:64-67` — raw → text (escape-leak
    precursor).
  - `src/domain/markdown/parse.ts:35` — `parseMarkdown` returns
    `Result.ok(root)` after `processor.parse(text)` — correct DEC-2 wiring
    seam (strip MDAST `html` nodes before `Result.ok`).
  - `src/domain/markdown/mdast-to-hast.ts:11` — `allowDangerousHtml: true`
    (DEC-4 / F-5).
- Placement (DEC-2) CONFIRMED sound by empirical parse check:
  - block `<!-- c -->` → MDAST `html` at root; inline `<!-- c -->` → MDAST
    `html` inside `paragraph`. Both are `html` nodes the transformer removes.
  - `[//]: # (...)`, `[//]: # "..."`, `[//]: <>` → MDAST `definition` (NOT
    `html`) → already a no-op (F-2 assumption holds).
  - comment inside fenced code → MDAST `code` (NOT `html`) → strip predicate
    never consulted (code-block preservation safe by construction).
- Comment-only predicate `/^\s*<!--[\s\S]*?-->\s*$/` reviewed: `^...$` anchoring
  prevents over-match of mixed/real-HTML nodes (AC-F3-3 holds); conservative
  under-match of pathological multi-comment nodes is the safe direction.
- Idempotency hash path CONFIRMED: `src/domain/state/hashes.ts:13-15`
  `canonicalHash` delegates to `contentHash(canonicalize(hast))` — identical to
  `renderStorage`'s internal hash, so TC-COMM-012 proves NFR-PERF-4 on the real
  write-decision path.
- File-target claims in the plan CONFIRMED present:
  `src/domain/state/hashes.ts`, `tests/integration/markdown/pipeline-roundtrip.test.ts`,
  `tests/unit/domain/markdown/unsupported.test.ts`; current version `0.5.1`
  (E.1 bump to `0.5.2` consistent); existing golden count = 27 `.md` fixtures.
- Fixtures-dir consumers enumerated (3): `storage-renderer.test.ts`,
  `pipeline-roundtrip.test.ts`, `assert-well-formed-xml.test.ts`. Only the
  first is accounted for in the plan (Finding 1).

## Findings

1. [major] plan_code_area_coverage / cross_artifact_consistency —
   `chg-GH-77-plan.md` Phase C (C.2/C.3) and Phase D (D.2/D.3), "Files and
   modules" lists.
   Gap: Adding 6 fixtures (incl. the `raw-html-block-real.md` error case) to
   `tests/golden/fixtures/markdown/` breaks a SECOND fixtures-dir consumer that
   no plan task accounts for: `tests/integration/markdown/pipeline-roundtrip.test.ts`.
   Concretely: (a) line 48 `expect(fixtures.length).toBe(27)` will fail — the
   dir will hold 33 `.md` files; (b) the `pipeline()` helper (lines 41-42)
   throws on `renderStorage` `Result.err`, so the `raw-html-block-real.md`
   error-case fixture makes TC-ROUNDTRIP-001, TC-XML-WF-001, TC-DETERM-001, and
   TC-DETERM-002 throw per-fixture. The plan lists this file in D.2 ONLY to add
   an idempotency test; no task bumps its count or guards its helper against the
   error fixture. The plan-writer flagged the analogous tension for
   `storage-renderer.test.ts` (C.1 sidecar convention) but missed the parallel
   one here. (`tests/unit/_helpers/assert-well-formed-xml.test.ts` was also
   checked — NOT affected: it filters `.storage.xhtml`, uses
   `toBeGreaterThanOrEqual(25)`, and the error fixture has no `.storage.xhtml`.)
   Suggested remediation target phase: delivery_planning
   Suggested fix: Add explicit tasks to Phase C (or D): (1) bump
   `pipeline-roundtrip.test.ts:48` `toBe(27)` → `toBe(33)` (or exclude error
   fixtures from the iteration/count); (2) guard `pipeline()` / the fixture
   iteration so `raw-html-block-real` is asserted-as-error (or skipped) rather
   than thrown. Add the file's count + helper to the phase "Files and modules"
   blast-radius list.

2. [nit] plan_code_area_coverage — `chg-GH-77-plan.md` Phase C.1.
   Gap: The `.unsupported.txt` sidecar convention restructures `loadFixtures()`,
   but the existing `TC-CODE-MACRO-001` block (`storage-renderer.test.ts:67`)
   calls `f.expected.includes(...)` on every fixture. The harness extension
   must keep `Fixture.expected` defined for all fixtures (e.g. empty string for
   the error fixture) or guard the filter, else TC-CODE-MACRO-001 throws on the
   error fixture. Implicit in "support an expected-error fixture" but not
   called out; a competent coder resolves it within the same edit.
   Suggested remediation target phase: delivery_planning
   Suggested fix: Add a one-line note to C.1 that `Fixture.expected` remains
   defined for error fixtures (or that the TC-CODE-MACRO-001 / TC-MERM filters
   guard against absent `expected`).

3. [nit] test_traceability — `chg-GH-77-test-plan.md` §5.2 /
   `chg-GH-77-spec.md` §7.2 (OUT).
   Gap: No end-to-end golden locks "HTML comment inside fenced/inline code
   survives verbatim." Behavior is safe by construction (empirically verified:
   a comment in a fenced block is a `code` node, never an `html` node, so the
   strip predicate is never consulted) and unit-guarded by plan A.2
   ("code/text/other node kinds untouched"); the spec explicitly scopes it OUT
   "by construction." A golden would harden the regression boundary but is not
   required for correctness.
   Suggested remediation target phase: test_planning
   Suggested fix (optional): add a golden or explicit unit case asserting
   ` ```\n<!-- x -->\n``` ` round-trips with `<!-- x -->` intact inside the
   CDATA body.

4. [nit] decision_capture — `chg-GH-77-spec.md` §15/§7.3 +
   `chg-GH-77-plan.md` Phase E.2.
   Gap: The change creates a carve-out to the system-level F-5 "no silent drop"
   invariant (a new "non-rendering annotation" exempt category). It is captured
   as change DEC-1 + a planned feature-spec note (E.2 updates
   `feature-safe-publish.md`), not as an ADR. Defensible — strong prior art
   (mermaid §3.3 rule-1 comment-strip, GH-63 front-matter) and ticket AC#7
   explicitly allowed "ADR/spec" — but per decision_routing a modification to a
   system invariant is borderline precedent-setting.
   Suggested remediation target phase: specification
   Suggested fix: `@pm` to confirm whether the F-5 carve-out warrants a short
   ADR (citing the mermaid / GH-63 precedent) in addition to the feature-spec
   note. Not blocking either way.

## What is sound (no action needed)
- Spec ↔ Ticket: all 7 ticket ACs mapped to 9 spec ACs; strip-vs-passthrough
  (ticket AC#7) resolved coherently (strip = DEC-1; passthrough deferred §7.3 /
  AC-F5-1).
- DEC-4 / F-5 invariant (non-comment raw HTML unchanged) preserved precisely
  across AC-F3-1 / AC-F3-2 / AC-F3-3.
- AC quality: all 9 ACs Given/When/Then; AC-F3-3 (over-strip guard) well-defined.
- NFR coverage: REL-4 / PERF-4 / PERF-5 / SEC-5 present and consistent.
- Test traceability: every spec AC traced to ≥1 TC (table §3.1); predicate
  strip + preserve both tested; no orphan ACs or TCs.
- Plan phases A–E implement every spec AC and TC; domain-tier placement
  (`src/domain/markdown/`) correct, no infra/app/cli import (check:boundaries).
- TC-COMM-008 error-case harness tension is REAL but the plan's C.1 resolution
  (`.unsupported.txt` sidecar) is sound, with a documented fallback (5 pairs /
  count 32). Primary path lets the coder proceed without guessing.
- Code-claim and parse-assumption verification: every load-bearing claim
  confirmed against source + empirical parse.
