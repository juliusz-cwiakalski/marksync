# Code Review — GH-92: Reverse converter (Storage Format → Markdown)

**Mode**: local · **Iteration**: 1 (FIRST REVIEW) · **Date**: 2026-08-15
**Branch**: `feat/GH-92/reverse-converter-storage-to-markdown` vs `main` (25 commits, 71 files, +7009/−48)
**Inputs reviewed**: chg-GH-92-spec.md (§17 ACs), chg-GH-92-plan.md (v1.2 → 1.3), chg-GH-92-test-plan.md (v0.3, §4.4 normative mechanics), TDR-0012/TDR-0013, `.ai/agent/code-review-instructions.md`, `.ai/rules/typescript.md`, ticket GH-92.
**Out of scope per instruction**: TDR statuses Proposed, PM-DEC-3, partition 26/6/1, fixed dep defect e996e56.
**Artifact note**: this review supersedes and merges two partial prior review passes found colliding in the workspace (each had verified-real findings the other missed; each had appended its own Phase 7 to the plan). The plan now carries ONE authoritative Phase 7; this file and `code-review/review-iter-1.yaml` are the single authoritative finding set.

## Verdict

**Status: FAIL** — 1 blocker · 3 major · 7 minor · 3 nits

Substantially strong delivery: 468 reverse-surface tests green locally (round-trip, read-back, adversarial, determinism), corpus-A byte equality 26/26, forward golden fixtures byte-unchanged (additions only — the three `.storage.xhtml` diffs are new reverse-side sidecars), `src/cli/` untouched (ReverseError standalone per PD-2), saxes exactly `6.0.0`, options layer `{bullet:'-', rule:'-'` } lives solely in `src/domain/markdown/hast-to-markdown.ts:37-40`, no `mock.module` (meta test present and green). FAIL is driven by an **empirically reproduced** collect-all contract violation (blocker), a runtime/type divergence silenced by double casts, a silent inline content-loss edge, and a normative test case (TC-RT-002) that asserts nothing while the plan records it complete.

## Findings

### [blocker] F-1 — Collect-all mislabels informational diagnostics and breaks §4.4 parity
- **Evidence**: `src/infra/confluence/parse/reverse.ts:97-113` — every diagnostic, including `severity:"informational"`, is mapped to `{kind:"UnsupportedConstruct",…}`, discarding `severity`/`class`.
- **Empirical repro** (this review): Storage = heading + mermaid render-policy image (line 2) + gliffy macro (line 3) →
  - fast-fail error: `UnsupportedConstruct / reverse/unsupported-construct / ac:name="gliffy" / 3:42` ✔
  - `collectAll.diagnostics[0]`: `kind:"UnsupportedConstruct", code:"marksync/synthetic-artifact", 2:31` ✘; `JSON equality all[0] === fast.error → false`
- **Violates**: test-plan §4.4:178 `expect(all.diagnostics[0]).toEqual(first.error)` (normative) and §6.2 :594; spec AC-F4-1 "identical per-instance verdicts"; DM-2 two-class taxonomy. Any render-policy page containing one unsupported macro — the exact Flow-2/Flow-3 composite — yields a first "error" that contradicts the fast-fail verdict. No mixed informational-before-blocking ordering test exists (TC-RDIAG-002 cases are all-blocking).
- **Fix**: return `ReverseDiagnostic[]` preserving `severity`/`class` (blocking entries for the error-arm parity; informationals surfaced separately); add a mixed-order parity test asserting the first blocking entry deep-equals the fast-fail error.

### [major] F-2 — Runtime blocking-error shape contradicts declared `BlockingDiagnostic`; masked by double casts
- **Evidence**: `src/domain/markdown/reverse-diagnostics.ts:15-21,47` declares the blocking arm `{severity, class, code, construct, location}` (no `kind`); `reverse.ts:57-62,104,112` construct `{kind:"UnsupportedConstruct", code, construct, location}` and coerce via `as unknown as ReverseError` — a double cast silencing exactly the mismatch the type system should catch. The shipped fast-fail error is not a valid `BlockingDiagnostic` at runtime; E2/E3 consumers cannot discriminate `ReverseError` arms reliably.
- **Fix**: declare the error union faithfully (e.g. a `{kind:"UnsupportedConstruct";…}` variant in the domain model, or return the `BlockingDiagnostic` as-is) and construct it without casts.

### [major] F-3 — Structural-whitespace drop loses a rendered space between inline siblings
- **Evidence**: `src/infra/confluence/parse/reverse-parser.ts:110` (parse-time `flushText`) and `:253-256,276-279` (`normalizeChildren`) drop any whitespace-only text containing `\n` regardless of context. **Empirical repro** (this review): `<p>foo <strong>a</strong>\n<em>b</em> baz</p>` → `"foo **a***b* baz"` — the HTML-rendered space (newline collapses to space) is silently removed and words join. Exceeds K1's "trivial self-closing whitespace" tolerance; hits review priority #1 (never silently lose content) on the RSK-2 real-read-back path (editor reflow). Forward fixtures never emit this form, so golden corpus cannot catch it.
- **Fix**: drop structural whitespace only between block-level siblings; in phrasing content (p/em/strong/a/td/…) collapse to a single space. Add a reflowed-paragraph fixture.

### [major] F-4 — TC-RT-002 is a placeholder; corpus-B sidecars dead; plan records it complete
- **Evidence**: `tests/golden/markdown/reverse-round-trip.test.ts:159-184` — comments admit "this is a placeholder test since we haven't generated sidecars yet… task 5.4, which we'll implement later"; assertion is only `expect(reversed.ok).toBe(true)`; `reverseDir` computed at :163 and never used. The 5.4 sidecars exist (`tests/golden/fixtures/markdown/reverse/*.md`, incl. 0-byte `mixed-html-comment.md`/`provenance-panel.md`) but only `mermaid-render-policy.json` is consumed anywhere (readback test :186). Task 5.3 also promised the negative self-test (unlisted fixture → completeness helper fails) — absent from TC-RT-005. Plan-compliance gap: CHECKED_BUT_MISSING (tasks 5.3/5.4 marked `[x]` with COMPLETED notes).
- **Fix**: wire corpus-B byte-equality against each sidecar (empty-output semantics for `mixed-html-comment`); add the negative self-test; remove dead fixtures or consume them.

### [minor] F-5 — `hast-util-to-mdast` pinned with caret, not exact
- **Evidence**: `package.json:54` → `"^10.1.2"`; plan task 4.1 says "(exact pin)"; TDR-0013's determinism argument rests on the locked substrate; saxes is exact.
- **Fix**: `bun add -E hast-util-to-mdast@10.1.2`.

### [minor] F-6 — Existing BDD test file modified, contradicting plan 6.4(b)
- **Evidence**: `tests/bdd/support/world.ts:99` (`After(function ()` → `After(() =>`) — style-only, but plan 6.4(b) asserts "every other existing test file unmodified" and test-plan §7.4 records "touched existing tests: 0". AC-F6-1 holds semantically (no CLI delta; tiers green); the recorded claim is false.
- **Fix**: revert, or disclose the deviation and reason in the plan execution log.

### [minor] F-7 — `ReverseSuccess` duplicated across tiers without the required compat note/test
- **Evidence**: `reverse.ts:17-20` re-declares the interface exported at `reverse-diagnostics.ts:42-45`. `.ai/rules/typescript.md` structural-duplication rule requires a duplication note + compatibility test; neither exists.
- **Fix**: import the domain type (preferred), or add the note + compat test.

### [minor] F-8 — ~70 verbatim duplicated lines; unreachable mermaid pre-check
- **Evidence**: `reverse.ts:441-517` (`classifyTaskListMacro`) vs `:519-591` (`classifyTaskListElement`) are line-for-line duplicates; the forward renderer emits `<ac:task-list>` directly (`src/infra/confluence/render/storage.ts`), so the macro branch is unreachable from forward output. Additionally `reverse.ts:178-195` checks `props["ri:filename"]` on `ac:image` itself — `ri:filename` lives on `ri:attachment` children (the real check is :222), so this pre-check is dead code that duplicates the informational-diagnostic block.
- **Fix**: extract one shared `ac:task`-sequence mapper; delete the :178-195 pre-check (or justify with a comment if anticipating a real-Confluence form).

### [minor] F-9 — Nested-table detection is shallow
- **Evidence**: `reverse.ts:294-297` checks only direct element children of `td`/`th`. A table wrapped in an intermediate canonical element inside a cell (`td > blockquote > table`) bypasses the check and serializes to unnestable GFM — on a construct the spec explicitly blocks.
- **Fix**: detect descendant `table` within `td`/`th` subtrees.

### [minor] F-10 — p95 timing promised by task 5.3 absent; OQ-T3 undecided
- **Evidence**: task 5.3 requires "per-fixture timing + corpus p95 vs the 200 ms sanity ceiling (NFR-3 informational, OQ-T3)"; `reverse-round-trip.test.ts` contains no timing code. The COMPLETED note omits p95 silently.
- **Fix**: add record-only timing, or record the drop and the OQ-T3 decision.

### [minor] F-11 — Plan Execution Log stale for Phases 4–6
- **Evidence**: plan Execution Log — Phase 4 commit "TBD", Phases 5/6 "☐ Pending" despite all tasks `[x]` and delivery commits `7e5289f` (p5), `0581381`/`f607cd3` (p6). Phase-5 note "Sidecar review confirmation recorded here" is missing (ties into F-4).
- **Fix**: close the rows with commits; record the sidecar-review confirmation.

### [nit] F-12 — Diagnostic location points at end of the open tag
- **Evidence**: `reverse-parser.ts:71-73` uses `opentag` (fires after attributes), so `parser.line/column` sit at/after `>` rather than at `<`. Still "sufficient to locate" per AC-F4-1; `opentagstart` would give the conventional start.
- **Fix**: optional — switch to `opentagstart`.

### [nit] F-13 — Unknown node types silently ignored vs C-4 posture
- **Evidence**: `reverse.ts:168-169` — doctype/other node types return `{content:null, diagnostics:[]}` (silent drop). Not reachable from valid page-body Storage; add a justifying comment or classify blocking for consistency with "never silently dropped".
- **Fix**: comment or blocking classification.

### [nit] F-14 — Parser plumbing nits
- **Evidence**: `reverse-parser.ts:16-17` two import statements from the same module; `:179-180` eslint-disable + `parent!` non-null assertion where the stack guard makes it redundant; `ParseOptions.sourcePath` accepted but never read (`_opts`).
- **Fix**: merge imports; restructure to avoid the assertion; wire or drop `sourcePath`.

## Per-AC Table (spec §17)

| AC | Criterion (short) | Evidence | Verdict |
|----|-------------------|----------|---------|
| AC-F1-1 | Round-trip 100% corpus A; corpus-B explicit expectations | Corpus A: 26/26 byte-equal + snapshots green. Corpus-B arm: TC-RT-002 placeholder — sidecar expectations never asserted (F-4) | **PASS for corpus A; corpus-B arm UNPROVEN (F-4)** |
| AC-F1-2 | Determinism in-run + across-run | TC-RT-003 convert-twice green over A + storage-only; snapshot layer committed | **PASS** |
| AC-F2-1 | Guardrail auto-includes new fixtures | TC-RT-005 completeness green; negative self-test missing (F-4 sub-gap) | **PASS (with gap)** |
| AC-F3-1 | Panel strip, no residue/diagnostic | TC-RT-006 green (marker/`Source:`/`Git revision:` zero-match) | **PASS** |
| AC-F3-2 | Mermaid unwrap, fence ≡ CDATA | TC-RT-007 green | **PASS** |
| AC-F3-3 | K1 tolerance ≡ attr-free | TC-RT-008 green (derived expectations, not generated) | **PASS** |
| AC-F4-1 | Blocking diagnostics: code+construct+location; fast-fail/collect-all identical verdicts | Fast-fail arm + adversarial sidecars green; diagnostics carry identity only, no content echo; **collect-all parity broken for mixed informational/blocking order; informationals mislabeled** (F-1) | **FAIL (parity clause)** |
| AC-F4-2 | Synthetic artifact informational, non-blocking | TC-RT-009 + TC-RDIAG-004 green (fast-fail arm) | **PASS** (collect-all representation defective per F-1) |
| AC-F5-1 | Normalizer idempotent + fixed point | TC-NORM-001/002 green | **PASS** |
| AC-F6-1 | Library-only, all tiers green, forward unmodified | Zero `src/cli/` delta; forward fixtures addition-only; 468 reverse-surface tests green; `world.ts` style-only touch (F-6) | **PASS (with note)** |

## Load-bearing plan checks

| Check | Result |
|-------|--------|
| Options layer `{bullet:'-',rule:'-'}` single point in `src/domain/markdown/hast-to-markdown.ts` | ✔ (`:37-40`; normalizer routes through `hastToMarkdown`) |
| saxes exact 6.0.0 | ✔ (`package.json:60`) |
| ReverseError standalone — zero `src/cli/` changes | ✔ (no `src/cli/` files in diff; PD-2 honored — but see F-2 on the shape) |
| NG-3: forward fixtures/tests byte-unchanged | ✔ additions only (`.storage.xhtml` sidecars are new files); `storage-renderer.test.ts` untouched; ✘ `tests/bdd/support/world.ts` (F-6) |
| No `mock.module` | ✔ (`tests/unit/meta/no-mock-module.test.ts` present; suite green) |
| Determinism | ✔ for tested inputs (F-1 is a contract issue, not determinism) |
| Parser edge cases (CDATA split, entities, nested tables blocking) | CDATA/entities ✔ (21/21 unit); nested tables ✔ direct-child case, ✘ wrapped case (F-9) |
| Diagnostics carry code+location, no content echo | ✔ (`construct`/`detail` carry identity only) |

## Summary

Status: **FAIL**
Findings: 14 (1 blocker / 3 major / 7 minor / 3 nits)
Plan Status: **INCOMPLETE** (Execution Log Phases 4–6 unclosed — F-11)
Plan Gaps: CHECKED_BUT_MISSING (task 5.3 corpus-B loop + negative self-test + p95; task 5.4 sidecars asserted), DONE_BUT_UNCHECKED (Execution Log Phase 5/6 rows)
Test Coverage Gaps: mixed-order fast-fail/collect-all parity; corpus-B byte expectations; reflowed-inline whitespace; wrapped nested table
Next Step: **EXECUTE_REMEDIATION_PHASE** (Phase 7 in chg-GH-92-plan.md, tasks 7.1–7.13)

*Review artifacts: `code-review/review-iter-1.yaml` (machine-readable, same findings). Remediation phase appended and deduplicated in the implementation plan — no source code was modified by this review.*

---

# Code Review — GH-92: Iteration 2 (RE-REVIEW after Phase-7 remediation)

**Mode**: local · **Iteration**: 2 · **Date**: 2026-08-15
**Remediation reviewed**: `039c275` + tsc-strict follow-up `5ba3c0c` (tree-identical to the dangling `ff4145c` — not an ancestor of HEAD)
**Verification run by this review**: `bun test` 1608/0 green · `bun run check` green (biome + format + tsc + depcruise) · `git diff main...HEAD` re-inspected (forward fixtures additions-only, zero `src/cli/`, **world.ts still modified**) · both repros from iter-1 re-run live at HEAD · grep `as unknown as` → zero hits in reverse surfaces
**Artifact note**: an interrupted prior pass of this iteration had already appended Phase 8 + revision 1.4 to the plan and committed its own iter-2 section alongside this review (commit `1a1ab3c`, landed mid-review). The two passes agreed on all 7 shared findings; this section is the authoritative consolidated record (the colliding section was removed, its unique observations folded in below). This review adds F-22, which the prior pass missed. Phase 8 was amended to 8 findings / 9 tasks.

## Verdict

**Status: FAIL (narrow)** — 0 blocker · 2 major · 2 minor · 3 low · 1 info

The iter-1 blocker and all three majors are **fixed in code substance** — this was verified empirically, not taken from the commit message. What keeps this at FAIL: two Phase-7 Must ACs are unmet while their tasks claim `[x]` FIXED (the mixed-order parity test was never added; world.ts was never reverted), the F-3 fix has a verified residual defect in headings, and the new reflow sidecar is both dead and byte-mismatched — i.e. the same CHECKED_BUT_MISSING pattern iter-1 flagged, now in the remediation itself.

## Empirical re-verification (this review, at HEAD)

- **F-1 repro (mixed informational-before-blocking)**: heading + mermaid render-policy image (line 2) + gliffy (line 3) → fast-fail error = gliffy `UnsupportedConstruct {3:39}` ✔; `collectAll.diagnostics[0]` = **informational** `marksync/synthetic-artifact {2:48}` with `severity`/`class` preserved ✔; first blocking entry matches fast-fail on `code`/`construct`/`location` ✔. The blocker behavior is corrected.
- **F-3 repro (reflow)**: `<p>foo <strong>a</strong>\n<em>b</em> baz</p>` → `foo **a** *b* baz\n` ✔ (rendered space preserved in `p`).
- **New repro (F-22)**: `<h1>a <strong>b</strong>\n<em>c</em> d</h1>` → `# a **b***c* d` ✘ — space still lost inside headings.
- **Gates/tripwires**: 1608/0 · check green · forward fixtures addition-only · zero `src/cli/` · saxes 6.0.0 and hast-util-to-mdast 10.1.2 both exact · zero `as unknown as` in reverse files.

## Per-finding closure table (iter-1 → iter-2)

| Iter-1 finding | Claim | Verified state | Verdict |
|---|---|---|---|
| F-1 (blocker) collect-all parity | 7.1 "FIXED … mixed-order parity covered by TC-RDIAG-002" | Code fixed (repro ✔); **no mixed-order test exists** — TC-RDIAG-002 cases all-blocking, file untouched by 039c275; claim false | **PARTIAL** → F-15 |
| F-2 (major) error shape + double casts | 7.2 FIXED | `UnsupportedConstructError` variant in domain union; type-safe construction; zero double casts | **CLOSED** |
| F-3 (major) inline whitespace loss | 7.3 FIXED + fixture | Fixed for `p`/`td`/`th`/`li` (repro ✔); `PHRASING_ELEMENTS` omits `h1`–`h6` — heading repro still joins words; sidecar not asserted by any test and byte-mismatched (trailing `\n`) | **PARTIAL** → F-22, F-17 |
| F-4 (major) TC-RT-002 placeholder | 7.4 FIXED | Real byte-equality vs all 6 corpus-B sidecars ✔; negative self-test present (weaker manifest-equality form); **6 dead sidecars remain** incl. the new one — "no dead fixtures" Must unmet | **PARTIAL** → F-18 |
| F-5 caret pin | 7.5 FIXED | `hast-util-to-mdast: 10.1.2` exact + bun.lock | **CLOSED** |
| F-6 world.ts | 7.6 "Reverted … zero existing test file modifications" | **Never reverted** — `git diff main...HEAD` still shows the hunk; claim false | **NOT CLOSED** → F-16 |
| F-7 ReverseSuccess dup | 7.7 FIXED | Type re-exported from domain | **CLOSED** |
| F-8 ~70 dup lines + dead pre-check | 7.8 FIXED | `mapTaskSequenceToGfmTaskList` shared helper; macro branch kept with justification; `:178-195` pre-check deleted | **CLOSED** |
| F-9 shallow nested-table detection | 7.9 FIXED | Recursive `hasDescendantTable` | **CLOSED** |
| F-10 p95 timing | 7.10 decision recorded | Note is evidence-free ("P95 < 200ms holds" with no measurement anywhere) | **WEAK** → F-19 |
| F-11 Execution Log stale | 7.11 FIXED | Phases 4–6 rows closed with commits + sidecar confirmation ✔; Phase-7 row itself still `[REMEDIATION COMMIT]` | **CLOSED** (+ F-21 info) |
| F-12 opentagstart (nit, discretionary) | not done | Accepted as discretionary | **ACCEPTED** |
| F-13 unknown-node comment (nit) | 7.12 FIXED | Comment added | **CLOSED** |
| F-14 parser nits | 7.12 "Merged imports" | eslint-disable/`parent!` gone ✔ (tsc-strict guard added in 5ba3c0c ✔); sourcePath documented ✔; **imports NOT merged** — parser still has two same-module imports; reverse.ts gained a new second one | **PARTIAL** → F-20 |

## New findings (iteration 2)

- **[major] F-15** — Mixed-order parity test absent; plan 7.1 claims TC-RDIAG-002 covers it (false — all its cases are all-blocking; the file was not touched by the remediation commit). The blocker has no regression guard. *Fix*: add the mixed-order case to TC-RDIAG-002 (informational at [0], first blocking ≡ fast-fail on code/construct/location); record the §4.4:178 field-level parity amendment.
- **[major] F-22** — F-3 residual: `PHRASING_ELEMENTS` omits `h1`–`h6` (and `del`/`summary`), so rendered spaces between inline siblings inside **headings** are still silently dropped (verified: `# a **b***c* d`). Same content-loss class on the RSK-2 path. *Fix*: audit the allowlist against HTML phrasing contexts; add a heading-reflow assertion.
- **[minor] F-16** — world.ts revert never landed; 7.6 note and commit message factually false vs the diff.
- **[minor] F-17** — `reverse/readback-reflowed.md` consumed by no test AND byte-mismatched (missing trailing newline — wiring it as-is fails); the F-3 pin is unenforced.
- **[low] F-18** — Six dead sidecars remain under `reverse/` (mixed-html-comment.md, provenance-panel.md, code-block-python-k1.md, mermaid-code-policy-k1.md, mermaid-render-policy.md, readback-realistic.md) — Phase-7 Must "no dead fixture files" unmet.
- **[low] F-19** — 7.10's "P95 < 200ms holds" is an evidence-free claim; no timing code exists.
- **[low] F-20** — "Merged imports" claim false (parser :16-17 unchanged; reverse.ts gained a second same-module import); `PHRASING_ELEMENTS` lists `"span"` twice.
- **[info] F-21** — Execution Log Phase-7 row still `[REMEDIATION COMMIT]` placeholder; `ff4145c` is dangling (on-branch equivalent `5ba3c0c`, tree-identical).

## Remediation-introduced regressions

None found beyond the above. Specifically checked:

- `5ba3c0c` (tsc-strict guard): converts the removed `parent!` into an `if (parent)` guard — behavior-neutral for well-formed input; strictly safer than before.
- Whitespace-collapse implementation: context split correct; no leading/trailing-space artifacts (serializer trims — probed `<p>\nfoo\nbar\n</p>` → `foo bar\n`); `blockquote`/`pre` correctly NOT in the phrasing set; only the duplicate-`span` cosmetic (F-20) and the heading gap (F-22).
- Collect-all return-shape change (`ReverseDiagnostic[]`): no production consumers yet (E2/E3 unbuilt); both test consumers updated; golden snapshots unaffected (collect-all is not snapshotted; adversarial sidecars compare mapped `{code, construct, location}`, unchanged).
- Golden corpus byte-equality intact (1608/0), forward fixtures and `src/cli/` untouched.
- Transparency flag: the remediation commit `039c275` edited `chg-GH-92-review.md`/`review-iter-1.yaml` — acceptable only because it executed the documented consolidation of the two colliding iter-1 review passes; iter-1 findings were not weakened. Reviewer files should not normally be touched by remediation commits.

## Summary (iteration 2)

Status: **FAIL (narrow)**
Findings: 8 (2 major / 2 minor / 3 low / 1 info)
Plan Status: Phase 7 tasks all `[x]` but 7.1 (test clause), 7.6, 7.12 carry **inaccurate closure notes**; Phase-7 Must ACs "mixed-order parity test green" and "no dead fixture files" unmet
Next Step: **EXECUTE_REMEDIATION_PHASE** (Phase 8, tasks 8.1–8.9 in chg-GH-92-plan.md; iteration-3 re-review of 8.1–8.3 + 8.8)

*Review artifacts: `code-review/review-iter-2.yaml` (machine-readable, same findings). Phase 8 was amended (8.9 tasks, F-22 added) — no source code was modified by this review.*

---
