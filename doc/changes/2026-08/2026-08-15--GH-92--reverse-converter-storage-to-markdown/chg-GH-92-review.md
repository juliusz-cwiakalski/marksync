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

# Iteration 2 — RE-REVIEW AFTER REMEDIATION

**Mode**: local · **Iteration**: 2 (RE-REVIEW) · **Date**: 2026-08-15
**Remediation under review**: `039c275` (iter-1 remediation) + `5ba3c0c` (tsc-strict follow-up, hast-builder empty-stack guard). NOTE: the orchestrator-context hash `ff4145c` does not exist in the repo — the follow-up landed as `5ba3c0c` (same intent, different header). Both diffs reviewed.
**Verification run by this review (not trusted from notes)**: `bun test` → **1608 pass / 0 fail**; `rg "as unknown as"` over changed files → zero on the reverse path; mixed-order repro + reflow repro executed via Bun against HEAD; `git diff main...HEAD` tripwire re-checked.

## Verdict

**Status: FAIL** — narrowly. The **code substance** of the blocker and all three majors is genuinely fixed and was re-verified empirically by this review (not taken on faith). What keeps this at FAIL: the Phase-7 **Must** acceptance criteria are not all met — the required mixed-order parity test does not exist (while plan 7.1 claims it is "covered by TC-RDIAG-002" — false), the reflow repro is pinned by no assertion (its sidecar is dead AND byte-mismatched), `world.ts` is still modified vs main (while plan 7.6 and the commit message claim "Reverted" — false), and three dead sidecar files remain despite the "no dead fixture files" Must. Three remediation completion claims are demonstrably false — a plan-integrity problem the ADOS gates treat seriously.

## Per-finding closure table (iteration 1 → 2)

| ID | Sev | Finding (short) | Closure | Evidence verified by this review |
|----|-----|-----------------|---------|----------------------------------|
| F-1 | blocker | Collect-all mislabels informationals; §4.4 parity broken | **PARTIAL — code CLOSED, required test MISSING** | Code verified empirically at HEAD: mixed Storage (mermaid artifact line 2 before gliffy line 3) → fast-fail = gliffy `UnsupportedConstruct` 3:39; collect-all = `[informational(synthetic-artifact, 2:11), blocking(gliffy, 3:39)]`, first blocking matches fast-fail on code/construct/location ✔. **But no test exercises mixed informational-before-blocking order anywhere** (TC-RDIAG-002 Storage-driven cases are toc/expand/gliffy — all blocking; no adversarial fixture contains a `marksync-mermaid-*` artifact). Plan 7.1 note "mixed-order parity covered by TC-RDIAG-002" is false. Also: whole-object `toEqual(first.error)` (test-plan §4.4:178 literal) intentionally does not hold under the kind-tagged `UnsupportedConstructError` design — reasonable, but the §4.4 amendment is nowhere recorded. |
| F-2 | major | Runtime shape contradicts declared type; double casts | **CLOSED** | `UnsupportedConstructError {kind:"UnsupportedConstruct"; code; construct; location}` added to the `ReverseError` union (reverse-diagnostics.ts:44-49,56); zero `as unknown as` in any GH-92-changed source file (grep-verified; remaining repo hits are pre-existing fetch-mock casts outside this change). Fast-fail constructs the error type-safely (reverse.ts:58-63). |
| F-3 | major | Structural-whitespace drop loses rendered space between inline siblings | **PARTIAL — code CLOSED, repro NOT pinned** | Code verified empirically: `readback-reflowed.storage.xhtml` → `foo **a** *b* baz\n` (no word-joining) ✔; context split correct (drop at block context, collapse-to-space in phrasing context); leading/trailing collapse inside `<p>` harmlessly trimmed by the serializer (probed: `<p>\nfoo\nbar\n</p>` → `foo bar\n`). **But no test asserts the expected output**: the fixture is in `storageOnly` so TC-RT-003 only checks determinism, and the sidecar `reverse/readback-reflowed.md` is consumed by nothing AND is byte-wrong (missing the trailing newline — a byte-equality test against it would fail today). A regression to word-joining would sail through green. |
| F-4 | major | TC-RT-002 placeholder; corpus-B sidecars dead; negative self-test absent | **CLOSED (with a nit)** | TC-RT-002 now byte-asserts `reverseStorage(<name>.storage.xhtml) === reverse/<name>.md` for all 6 corpus-B names; `mixed-html-comment` empty-output semantics handled; dead `reverseDir` gone; a negative self-test exists as a loop↔manifest sync assertion (weaker than the asked "unlisted fixture fails the completeness helper", but present). Nit: `reverse/mixed-html-comment.md` (0 bytes) is never read — the early-return branch skips the sidecar; `reverse/provenance-panel.md` likewise unconsumed (TC-RT-006 hardcodes `""`). |
| F-5 | minor | `hast-util-to-mdast` caret pin | **CLOSED** | `package.json:54` → `"10.1.2"` exact (saxes `6.0.0` still exact). |
| F-6 | minor | `world.ts` modified vs plan 6.4(b) claim | **NOT CLOSED — claim now false twice** | `git diff main...HEAD -- tests/bdd/support/world.ts` still shows `After(function ()` → `After(() =>` at :99 at HEAD. Plan 7.6 says "(FIXED: Reverted to function syntax; zero existing test file modifications)" and the commit message says "F-6: reverted world.ts style change" — **the revert never landed** (039c275 touched no `world.ts`; no later commit did either). |
| F-7 | minor | `ReverseSuccess` duplicated across tiers | **CLOSED** | `reverse.ts:21` re-exports the domain type; local declaration removed. |
| F-8 | minor | ~70 duplicated task-list lines; unreachable mermaid pre-check | **CLOSED** | Shared `mapTaskSequenceToGfmTaskList` extracted (reverse.ts:404-467); macro branch retained with a justification comment (:469-472, acceptable per the original "or justify" option); dead `ri:filename`-on-`ac:image` pre-check deleted (verified absent from current source). |
| F-9 | minor | Nested-table detection shallow (direct children only) | **CLOSED** | `hasDescendantTable` recurses over element descendants (reverse.ts:502-514); wrapped forms (`td > blockquote > table`) now blocking. |
| F-10 | minor | p95 timing absent; OQ-T3 undecided | **WEAK** | Plan 7.10 records "(OQ-T3: P95 < 200ms holds — record-only informational measurement remains)" — a decision of sorts, but the "holds" claim has zero measurement behind it (no timing code was added; test-plan §4.4:247 still promises recorded per-fixture timings). |
| F-11 | minor | Execution Log stale (Phases 4–6) | **MOSTLY CLOSED** | Phase 4/5/6 rows now carry real SHAs; Phase-5 sidecar human-review confirmation recorded. Residual: the new Phase-7 row's commit cell still reads `[REMEDIATION COMMIT]` instead of `039c275`(+`5ba3c0c`). |
| F-12 | nit | `opentag` end-of-tag position | **NOT ADOPTED** (explicitly optional) | Still `opentag`; AC-F4-1 "sufficient to locate" still holds. Fine. |
| F-13 | nit | Unknown node types silently ignored | **CLOSED** | Justifying comment at reverse.ts:154 ("not reachable from page-body Storage"). |
| F-14 | nit | Import duplication; `parent!` + eslint-disable; dead `sourcePath` | **PARTIAL** | eslint-disable + non-null assertion removed (later hardened into an `if (parent)` guard by 5ba3c0c — good); `sourcePath` documented as reserved. But the dual same-module imports remain (`reverse-parser.ts:16-17`, and `reverse.ts:17` beside the :5-13 block) despite plan 7.12's "Merged imports" claim. |

## New findings (iteration 2)

### [high] F-15 — Mixed-order parity test does not exist; plan 7.1 claims it does
- **Evidence**: Searched all of `tests/` — no test combines an informational (`marksync-mermaid-*` artifact) with a blocking construct through `reverseStorageCollectAll`. `tests/unit/domain/markdown/reverse-diagnostics.test.ts:295-373` (TC-RDIAG-002 Storage-driven) uses only blocking macros; `tests/golden/adversarial/` fixtures contain no synthetic artifact. Plan 7.1 REQUIRED "add a mixed-order unit test … asserting the first blocking entry deep-equals the fast-fail error"; Phase 7 AC line 1: "Must: mixed-order parity test green" — nothing can be green because nothing exists. The completion note "mixed-order parity covered by TC-RDIAG-002" is false.
- **Fix**: add the unit test (the reviewer repro from iter-1 is the template; this review re-verified it passes at HEAD), and record the §4.4:178 amendment (parity = first *blocking* entry, field-level `code/construct/location`) in the test plan.

### [medium] F-16 — F-6 remediation claim is false; `world.ts` still modified
- **Evidence**: `git diff main...HEAD -- tests/bdd/support/world.ts` → 1-line style change still present at HEAD. Plan 7.6 "(FIXED: Reverted…)" and the 039c275 commit message ("F-6: reverted world.ts style change") are both false — the diff of 039c275 contains no `world.ts` hunk. The plan's task 6.4(b) claim "every other existing test file unmodified" remains contradicted by the branch diff.
- **Fix**: actually revert the hunk (one-line), or record the deviation honestly in the Execution Log.

### [medium] F-17 — Reflow repro unpinned: sidecar dead AND byte-mismatched
- **Evidence**: `tests/golden/fixtures/markdown/reverse/readback-reflowed.md` (`foo **a** *b* baz`, no trailing newline) is read by no test (grep across `tests/` — only the partition manifest mentions the fixture name). Actual output is `foo **a** *b* baz\n`. So (a) the F-3 regression is unguarded, and (b) if someone later wires the sidecar as-is, the byte-equality test will fail on the missing trailing newline. Violates Phase 7 AC "reflow fixture round-trips without word-joining" (nothing asserts it) and "no dead fixture files".
- **Fix**: add a TC-RT-006-style test (or extend TC-RT-002's storageOnly arm) asserting `reverseStorage(readback-reflowed.storage.xhtml).markdown` byte-equals the sidecar; fix the sidecar's trailing newline.

### [low] F-18 — Residual dead sidecars; weak negative self-test form
- **Evidence**: `reverse/mixed-html-comment.md` and `reverse/provenance-panel.md` (both 0 bytes) are never consumed — TC-RT-002's early return skips reading the former; TC-RT-006 hardcodes `""` for the latter. The "negative self-test" is a loop↔manifest sync assertion, not the asked "unlisted fixture name fails the completeness helper".
- **Fix**: consume or delete the two 0-byte sidecars; optionally make the negative self-test exercise the completeness helper with an injected unlisted name.

### [low] F-19 — OQ-T3 closed without evidence
- **Evidence**: plan 7.10 asserts "P95 < 200ms holds" with no measurement anywhere (no timing code in the round-trip runner; test-plan §4.4:247 still promises recorded per-fixture durations).
- **Fix**: add record-only `performance.now()` timings per fixture (no CI gate), or reword 7.10 to record the drop honestly.

### [low] F-20 — Remediation nits: duplicate `span`; unmerged imports
- **Evidence**: `reverse-parser.ts:281,285` — `"span"` appears twice in `PHRASING_ELEMENTS`; same-module dual imports remain at `reverse-parser.ts:16-17` and `reverse.ts:17` despite plan 7.12's "Merged imports".
- **Fix**: dedupe the Set entry; merge the imports (or drop the claim).

### [info] F-21 — Bookkeeping: Phase-7 commit placeholder; phantom hash
- **Evidence**: Execution Log Phase 7 row still shows `[REMEDIATION COMMIT]` instead of `039c275`/`5ba3c0c`. The orchestrator context referenced `ff4145c`, which does not exist in the repo (the tsc-strict follow-up is `5ba3c0c`, different header) — worth recording so the audit trail resolves.
- **Fix**: fill the SHA(s); note the hash correction.

## Remediation-diff review (new issues check)

- `5ba3c0c` (tsc-strict guard): converts the removed `parent!` into an `if (parent)` guard — behavior-neutral for well-formed input (stack non-empty in that branch), silently drops the child only in an impossible state. Fine; strictly safer than before.
- Whitespace-collapse implementation: context split is correct; verified no leading/trailing-space artifacts (serializer trims); `blockquote`/`pre` correctly NOT in the phrasing set; `code` inline vs `pre` block handled. Only the duplicate-`span` cosmetic (F-20).
- Collect-all return-shape change (`ReverseDiagnostic[]`, error arm `StorageParseError`): no production consumers yet (E2/E3 unbuilt); both test consumers updated; golden snapshots unaffected (collect-all is not snapshotted; adversarial sidecars compare mapped `{code, construct, location}` which is unchanged). No new issues.
- The remediation commit edited `chg-GH-92-review.md` / `review-iter-1.yaml` — acceptable ONLY because it executed the documented consolidation of the two colliding iter-1 review passes (artifact note at file top); iter-1 findings were not weakened. Flagged for transparency; reviewers' files should not normally be touched by remediation commits.

## Summary

Status: **FAIL** (narrow — code substance of F-1/F-2/F-3/F-4 verified fixed; gaps are test wiring and false plan claims)
Findings: 7 new (1 high / 2 medium / 3 low / 1 info)
Spec compliance: **PASS in substance** (AC-F4-1 parity and AC-F1-1 corpus-B arm now hold and were re-verified empirically; AC-F6-1 forward-additions-only + zero `src/cli/` re-confirmed on `main...HEAD`)
Plan compliance: **FAIL** — Phase 7 Must ACs "mixed-order parity test green", "no dead fixture files", "bookkeeping claims accurate" unmet; three completion notes (7.1, 7.6, 7.12) are false
Plan Gaps: CHECKED_BUT_MISSING (7.1 mixed-order test, 7.6 revert); CHECKED_BUT_INACCURATE (7.10 p95 evidence, 7.12 merged imports)
Test Coverage Gaps: mixed-order collect-all parity; reflow byte expectation (sidecar fix + wiring)
Next Step: **EXECUTE_REMEDIATION_PHASE** (Phase 8 — small: 1 test + 1 sidecar byte-fix + 1 wiring test + 1 revert + honesty edits; no architecture work)

*Review artifacts: `code-review/review-iter-2.yaml` (machine-readable, same findings). Phase 8 remediation appended to the plan. No source code was modified by this review.*
