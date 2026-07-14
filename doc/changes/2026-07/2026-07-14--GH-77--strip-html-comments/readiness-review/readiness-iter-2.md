# Readiness Review Iteration 2

Verdict: READY
Work Item: GH-77
Date: 2026-07-14
Pause Required: no

## Facet Summary
- spec_completeness: PASS
- ac_quality: PASS
- plan_coverage: PASS
- decision_capture: PASS
- test_traceability: PASS
- cross_artifact_consistency: PASS
- system_spec_consistency: PASS
- plan_doc_update_coverage: PASS
- plan_code_area_coverage: PASS
- dod_defined: PASS

## Iter-1 finding closure verification

### Finding 1 [major] — `plan_code_area_coverage` / `cross_artifact_consistency`: CLOSED

The iter-1 major finding was that adding 6 fixtures (incl. the
`raw-html-block-real.md` error case) to `tests/golden/fixtures/markdown/`
breaks a SECOND fixtures-dir consumer,
`tests/integration/markdown/pipeline-roundtrip.test.ts`, with no plan task
accounting for it. The amendment (commit `cb1716a`, plan v1.1) adds **Phase
C.4** and updates the blast-radius lists. Verified against the actual file:

- **Count bump** — `pipeline-roundtrip.test.ts:48` reads
  `expect(fixtures.length).toBe(27);`. C.4 instructs `toBe(27)`→`toBe(33)`.
  Current dir holds 27 `.md` files (verified `ls *.md | wc -l` = 27); +6 new
  = 33. Delta correct. C.4 correctly keeps the count assertion on the
  *unfiltered* array ("the error fixture is a legitimate member of the dir").
- **Error-fixture skip** — `pipeline()` helper at lines 41-42
  (`if (!result.ok) throw new Error(...)`) throws on `Result.err`, so the
  `raw-html-block-real.md` (`raw-html-block` → `Result.err`) case would throw
  inside all four `for (const fixture of fixtures)` loops (TC-ROUNDTRIP-001
  line 51, TC-XML-WF-001 line 61, TC-DETERM-001 line 70, TC-DETERM-002 line
  82). C.4's chosen approach — `const roundtripFixtures = fixtures.filter(
  (f) => f.name !== "raw-html-block-real")` iterated in the four `describe`
  blocks — is correct: `Fixture.name` = `raw-html-block-real.md` with the
  `.md` stripped (line 29 `f.replace(/\.md$/, "")`), so the filter string
  matches exactly.
- **Blast-radius** — Phase C "Files and modules" (line ~382) and Phase D
  "Files and modules" (line ~442) now both list
  `pipeline-roundtrip.test.ts`; the Test Scenarios blast-radius note
  (line ~523) and the "Plan amendment" section (line ~584) document the
  rationale. D.2 carries a coordination note that its TC-COMM-012
  idempotency `describe` uses inline fixtures (not dir fixtures), so it does
  not collide with the C.4 skip-filter.

The C.4 alternative (teach `pipeline()` to return a discriminated result and
assert `Result.err(...)` for the error fixture) is documented as an
`@reviewer`-override path; either choice is sound and non-blocking.

### Nit 2 [nit] — `Fixture.expected` for error fixtures: CLOSED
C.1 now explicitly states "`Fixture.expected` must stay defined for the
error fixture (set it to `""`) ... because the existing `TC-CODE-MACRO-001`
filter (`f.expected.includes("ac:structured-macro")`, ~line 67) and the
`TC-MERM` lookups call `.includes(...)` / `.toContain(...)` on every
fixture and throw on `undefined`." Verified: `storage-renderer.test.ts`
lines 66-69 and 82-87 do call `.expected.includes/.not.toContain` on every
fixture — the `expected: ""` resolution is correct and lowest-churn.

### Nit 3 [nit] — fenced-code-comment unit guard: CLOSED
A.2 now explicitly includes a fenced-code comment case
(``` ```\n<!-- x -->\n``` ```` → `code` node, never `html`) asserting the
body round-trips with `<!-- x -->` intact, citing spec §7.2 NG-4 as the
reason a dedicated golden is intentionally out of scope. Safe-by-
construction, now unit-guarded. Resolution matches the spec's scope.

### Nit 4 [nit] — F-5 carve-out decision capture: CLOSED
E.2 now records "PM decision confirmed: the F-5 carve-out is captured as
change DEC-1 + this feature-spec note, intentionally with NO separate ADR,"
citing mermaid §3.3 rule-1 (comment-strip for digest stability) + GH-63
(front-matter strip) as precedent. Defensible per decision_routing — strong
prior art, and ticket AC#7 explicitly allowed "ADR/spec."

## Verification performed (grounding, iter-2)

- **Iter-1 code-claim grounding re-confirmed** (not re-run in full; iter-1
  record stands): root-cause paths, DEC-2 wiring seam, predicate anchoring,
  idempotency hash path, fixture count, and the 3-consumer enumeration.
- **Fixtures-dir consumer enumeration (3, exhaustive)** via
  `rg "golden.*fixtures|fixturesDir"` in `tests/`:
  1. `tests/golden/markdown/storage-renderer.test.ts` — FIRST consumer;
     accounted for by C.1 (sidecar + `expected: ""`) + C.3 (count 27→33).
  2. `tests/integration/markdown/pipeline-roundtrip.test.ts` — SECOND
     consumer; now accounted for by C.4 (count 27→33 + error-fixture skip
     in four `describe` loops).
  3. `tests/unit/_helpers/assert-well-formed-xml.test.ts` — THIRD consumer;
     re-verified NOT affected: line 78 filters `.storage.xhtml` (not `.md`),
     line 82 uses `toBeGreaterThanOrEqual(25)`. Error fixture has
     `.unsupported.txt` (no `.storage.xhtml`); 5 new `.storage.xhtml` files
     bring goldens 27→32, still ≥25. No plan task needed.
  - (Non-iterating readers `provenance-panel.test.ts`,
    `mermaid-render-golden.test.ts`, `cli-output.snapshot.test.ts` read
    named files, not the dir glob — unaffected.)
- **Current fixture count = 27 `.md` files** (verified `ls *.md | wc -l`).
  +6 new = 33. Both C.3 and C.4 targets agree on `toBe(33)` — no count
  drift between the two consumers.
- **`storage-renderer.test.ts` structure re-verified**: line 46 count
  `toBe(27)` (C.3 target), lines 32-35 unconditional `.storage.xhtml` read
  (C.1 sidecar branch target), lines 50-62 per-fixture `result.ok`/`.toBe`
  (C.1 conditional branch target), lines 66-69 + 82-87 `.expected` filters
  (C.1 `expected: ""` target). All addressed.
- **Commit `cb1716a`** confirmed: `docs(plan): close DoR finding —
  pipeline-roundtrip consumer (GH-77)`, 1 file changed (+120/-15), plan
  only — no source touched.

## No new gaps introduced by the amendment

- **AC coverage**: unchanged. Test Scenarios table (plan lines ~507-521)
  still maps all 9 ACs (AC-F1-1 … AC-F5-1) to TCs; no AC orphaned or
  duplicated. C.4 touches only pre-existing GH-20 TCs
  (TC-ROUNDTRIP-001/TC-XML-WF-001/TC-DETERM-001/TC-DETERM-002) — explicitly
  framed as "blast-radius maintenance, not new GH-77 ACs."
- **Count consistency**: C.3 (storage-renderer) and C.4 (pipeline-roundtrip)
  both target `toBe(33)`; plan notes "the integration set iterates the same
  dir, so the totals must agree." No mismatch.
- **Sidecar construct-id consistency**: C.1 asserts
  `error.construct === contents.trim()`; C.2 sidecar carries `raw-html-block`;
  classifier emits `UnsupportedConstruct: raw-html-block` (iter-1 confirmed
  `unsupported.ts:90-96`). Match.
- **Spec / test plan unchanged**: spec v1.0 and test-plan v1.0 were not
  modified by the amendment; iter-1 assessed them sound (spec_completeness,
  ac_quality, test_traceability all PASS). Re-confirm: no spec/test-plan
  edits since iter-1, so those PASS facets carry forward.

## Residual (non-blocking) notes

1. **[nit, persistent] test-plan §4 file listing imprecision** —
   `chg-GH-77-test-plan.md` §4 "Golden fixture files (to add)" still lists
   `raw-html-block-real.md` + `.storage.xhtml`, whereas the plan §C.2 uses
   `.unsupported.txt`. This is NOT a contradiction: the test plan's own
   TC-COMM-008 notes (§5.2) say "This fixture may not have a `.storage.xhtml`
   file (error case) or may capture the error structure in the test
   instead," and the plan's "Spec / test-plan consistency" section
   explicitly reconciles it with the sidecar convention + a documented
   fallback (5 pairs / count 32). Pre-existing (test plan unchanged since
   iter-1), reconciled by the plan, non-blocking. The coder follows §C.2
   (authoritative). Optional: a future test-plan revision or phase-7
   doc-sync could align §4's summary table with §5.2's nuance. Does not
   warrant reopening `test_planning`.

2. **[nit] C.1 sidecar is a new harness pattern** — the `.unsupported.txt`
   convention is a small extension to `loadFixtures()` + the per-fixture
   test. The plan appropriately flags "confirm the convention with
   `@reviewer` at DoR/Review" and offers an override alternative. Deferred
   to delivery/review per DoR scope; the primary path is clear enough for
   the coder to execute without guessing.

## What is sound (no action needed)

- All iter-1 "sound" items carry forward (spec↔ticket mapping, DEC-4/F-5
  invariant preservation, AC quality, NFR coverage, test traceability,
  domain-tier placement, code-claim verification).
- The amendment is surgical: it closes the one major finding + three nits
  without disturbing the AC/TC/NFR coverage matrix or introducing count
  drift between the two dir-iterating consumers.
- Blast radius is now fully explicit: all three fixtures-dir consumers
  enumerated, two affected (with tasks), one verified unaffected (with
  reason).

## Gate result

**READY.** The iter-1 major finding is closed (C.4 + blast-radius verified
against source), all three non-blocking nits are closed in place, and no
new blocking gaps were introduced. The spec, test plan, and plan are
mutually consistent and sufficient for `@coder` to execute Phases A–E. The
two residual nits are doc-precision items reconciled by the plan and do
not block delivery.
