# Code Review — GH-92: Reverse converter (Storage Format → Markdown)

**Mode**: local · **Iteration**: 1 (FIRST REVIEW) · **Date**: 2026-08-15
**Branch**: `feat/GH-92/reverse-converter-storage-to-markdown` vs `main` (25 commits, 71 files, +7009/−48)
**Inputs reviewed**: chg-GH-92-spec.md (§17 ACs), chg-GH-92-plan.md (v1.2), chg-GH-92-test-plan.md (v0.3 §4.4 normative mechanics), TDR-0012/TDR-0013, `.ai/agent/code-review-instructions.md`, `.ai/rules/typescript.md`, ticket GH-92.
**Out of scope per instruction**: TDR statuses Proposed, PM-DEC-3, partition 26/6/1, fixed dep defect e996e56.

## Verdict

**Status: FAIL** — 1 blocker · 2 major · 6 minor · 2 nits

The change is substantially strong: all 362 new/affected tests pass locally (round-trip, read-back, adversarial, meta/mock-ban), forward golden fixtures are byte-unchanged (zero modifications under `tests/golden/fixtures/markdown/`), `src/cli/` is untouched (ReverseError standalone per PD-2 — verified), saxes is exactly `6.0.0`, and the options layer `{bullet: '-', rule: '-'}` lives solely in `src/domain/markdown/hast-to-markdown.ts:37-40`. The FAIL is driven by one empirically-proven contract violation in the collect-all arm (below), plus a silent-content-loss edge in whitespace handling and a type-model/runtime divergence masked by double casts.

## Findings

### [blocker] F-1 — Collect-all mangles informational diagnostics and breaks §4.4 parity (`all.diagnostics[0]` ≠ fast-fail error)
- **Evidence**: `src/infra/confluence/parse/reverse.ts:97-113` — every diagnostic (including `severity: "informational"`) is mapped to `{kind: "UnsupportedConstruct", …}`, discarding `severity`/`class`.
- **Empirical repro** (run 2026-08-15): Storage = heading + mermaid render-policy artifact (line 2) + gliffy macro (line 3) →
  - fast-fail error: `UnsupportedConstruct / reverse/unsupported-construct / ac:name="gliffy" / 3:39` ✔
  - `collectAll.diagnostics[0]`: `kind: "UnsupportedConstruct", code: "marksync/synthetic-artifact", 2:36` ✘
- **Violates**: test-plan §4.4 normative mechanic `expect(all.diagnostics[0]).toEqual(first.error)` (line 178); spec AC-F4-1 "collect-all enumeration lists every instance with identical per-instance verdicts"; DM-2 two-class taxonomy; PD-2's own shape requirement. Any render-policy page containing one unsupported macro — the exact Flow-2/Flow-3 composite the spec describes — yields a mislabeled first "error" that contradicts the fast-fail verdict (success-with-informational vs error-arm).
- **Also untested gap**: TC-RDIAG-002 parity cases are all-blocking; no mixed informational-before-blocking ordering test exists.
- **Fix**: return `ReverseDiagnostic[]` preserving `severity`/`class` (filter to blocking for the error-arm array, surface informationals separately), then add a mixed-order parity test asserting `all.blocking[0]` deep-equals the fast-fail error.

### [major] F-2 — Runtime blocking-error shape contradicts the declared `BlockingDiagnostic` type; masked by double casts
- **Evidence**: `src/domain/markdown/reverse-diagnostics.ts:15-21,47` declares the blocking arm as `{severity, class, code, construct, location}` (no `kind`); `src/infra/confluence/parse/reverse.ts:57-62, 104, 112` construct `{kind: "UnsupportedConstruct", code, construct, location}` and coerce it via `as unknown as ReverseError` — a double cast that silences exactly the mismatch the type system should catch. The shipped fast-fail error is **not** a valid `BlockingDiagnostic` at runtime (no `severity`/`class`), so E2/E3 consumers cannot discriminate `ReverseError` arms reliably, and `never`-exhaustive checks on the union are structurally unsound.
- **Fix**: declare the error union faithfully (e.g. `ReverseError = StorageParseError | {kind: "UnsupportedConstruct"; code; construct; location}`) in the domain model and construct it without casts; keep the collect-all entry type identical to the fast-fail payload.

### [major] F-3 — Structural-whitespace drop loses a rendered space between inline siblings (silent content alteration)
- **Evidence**: `src/infra/confluence/parse/reverse-parser.ts:110` (parse-time `flushText`) and `:253-256, 276-279` (`normalizeChildren`) drop **any** whitespace-only text containing `\n`, regardless of context. Repro (run): `<p>foo <strong>a</strong>\n<em>b</em> baz</p>` → output `foo **a***b* baz` — the HTML-rendered space between `a` and `b` (newline collapses to a space in HTML) is silently removed and the words join. This exceeds K1's "trivial self-closing whitespace" tolerance and hits review priority #1 (never silently lose content) exactly on the RSK-2 real-read-back path (editor reflow). Forward fixtures never emit this form, so the golden corpus cannot catch it.
- **Fix**: drop structural whitespace only between block-level siblings; when the parent context is phrasing content (p/em/strong/a/td…), collapse the chunk to a single space instead of dropping it. Add a reflowed-paragraph fixture (corpus B or Storage-only).

### [minor] F-4 — `hast-util-to-mdast` pinned with caret, not exact
- **Evidence**: `package.json` → `"hast-util-to-mdast": "^10.1.2"`; plan task 4.1 says "(exact pin)" and TDR-0013's determinism argument rests on the locked stringifier substrate; saxes is exact (`6.0.0`). A caret allows silent minor drift under the byte-form guarantees.
- **Fix**: `bun add -E hast-util-to-mdast@10.1.2`.

### [minor] F-5 — Existing BDD test file modified, contradicting plan 6.4(b)
- **Evidence**: `tests/bdd/support/world.ts:99` (`After(function ()` → `After(() =>`) — style-only, but plan task 6.4(b) asserts "every other existing test file unmodified" and test-plan §7.4 records "touched existing tests: 0". NG-3/AC-F6-1 still hold semantically (no CLI delta; all tiers green), yet the recorded claim is false.
- **Fix**: either revert (if a biome rule regression) or record the deviation and its reason in the plan execution log.

### [minor] F-6 — `ReverseSuccess` duplicated across tiers without the required compat note/test
- **Evidence**: `src/infra/confluence/parse/reverse.ts:17-20` re-declares the interface already exported at `src/domain/markdown/reverse-diagnostics.ts:42-45`. `.ai/rules/typescript.md` (structural type duplication rule, enforced via code-review-instructions) requires a one-line duplication note + a structural compatibility test; neither exists.
- **Fix**: import the domain type (preferred), or add the note + compat test.

### [minor] F-7 — ~70 verbatim duplicated lines; task-list macro branch unreachable from forward output
- **Evidence**: `src/infra/confluence/parse/reverse.ts:441-517` (`classifyTaskListMacro`) vs `:519-591` (`classifyTaskListElement`) are line-for-line duplicates. The forward renderer emits task lists as a direct `<ac:task-list>` element (`src/infra/confluence/render/storage.ts:155-168`), never as `ac:structured-macro ac:name="task-list"` — the macro branch is speculative dead code for the forward mirror.
- **Fix**: extract one shared `ac:task`-sequence → task-list-HAST helper; drop the macro variant or keep it with a comment justifying the real-Confluence form it anticipates.

### [minor] F-8 — Nested-table detection is shallow
- **Evidence**: `src/infra/confluence/parse/reverse.ts:294-297` checks only direct element children of `td`/`th`. A table wrapped in an intermediate canonical element inside a cell (e.g. `td > blockquote > table`) bypasses the check and would serialize to unnestable GFM (broken round-trip on a construct the spec explicitly blocks).
- **Fix**: detect descendant `table` within `td`/`th` subtrees (cheap recursive contains), not just direct children.

### [minor] F-9 — Plan Execution Log stale for Phases 4–6
- **Evidence**: `chg-GH-92-plan.md:377-379` — Phase 4 commit "TBD", Phases 5/6 "☐ Pending" despite all tasks `[x]` and delivery commits `7e5289f` (p5), `0581381`/`f607cd3` (p6). The Phase-5 note "Sidecar review confirmation recorded here" (task 5.4 human-review evidence) is also missing.
- **Fix**: close the rows with commits; record the sidecar-review confirmation.

### [nit] F-10 — Diagnostic location points at the end of the open tag
- **Evidence**: `src/infra/confluence/parse/reverse-parser.ts:71-73` uses `opentag` (fires after attributes), so `parser.line/column` sit at/after `>` rather than at `<` (sidecars e.g. `storage-macro-toc` column 36 ≈ tag end). Still "sufficient to locate" per AC-F4-1, but `opentagstart` would give the conventional start position.

### [nit] F-11 — Unknown node types silently ignored vs C-4 posture
- **Evidence**: `src/infra/confluence/parse/reverse.ts:168-169` — doctype/other node types return `{content: null, diagnostics: []}` (silent drop). Not reachable from valid page-body Storage; add a justifying comment or classify blocking for consistency with "never silently dropped".

## Per-AC Table (spec §17)

| AC | Criterion (short) | Evidence | Verdict |
|----|-------------------|----------|---------|
| AC-F1-1 | Round-trip 100% corpus A (26) | TC-RT-001 green locally; 26 snapshots; `not.toMatch(/<(ac\|ri):/)` | **PASS** |
| AC-F1-2 | Determinism (in-run + across-run) | TC-RT-003/004 green; 26 snapshots in run output | **PASS** |
| AC-F2-1 | Guardrail auto-includes new fixtures | TC-RT-005 completeness + negative self-test green | **PASS** |
| AC-F3-1 | Panel strip, no residue/diagnostic | TC-RT-006 green (marker/`Source:`/`Git revision:` zero-match) | **PASS** |
| AC-F3-2 | Mermaid unwrap, fence ≡ CDATA | TC-RT-007 green | **PASS** |
| AC-F3-3 | K1 tolerance ≡ attr-free | TC-RT-008 green | **PASS** |
| AC-F4-1 | Blocking diagnostics: code+construct+location; parity | Fast-fail arm + adversarial sidecars green; **collect-all parity broken for mixed informational/blocking order, informationals mislabeled** (F-1) | **FAIL** (one clause) |
| AC-F4-2 | Synthetic artifact informational, non-blocking | TC-RT-009 + TC-RDIAG-004 green (fast-fail arm) | **PASS** (collect-all representation defective per F-1) |
| AC-F5-1 | Normalizer idempotent + fixed point | TC-NORM-001/002 green | **PASS** |
| AC-F6-1 | Library-only, all tiers green, forward unmodified | `git diff main` — zero `src/cli/` delta, forward fixtures addition-only, 362+211 tests green; `tests/bdd/support/world.ts` style-only touch (F-5) | **PASS** (with note) |

## Load-bearing plan checks

| Check | Result |
|-------|--------|
| Options layer `{bullet:'-', rule:'-'}` single point in `src/domain/markdown/hast-to-markdown.ts` | ✔ (`:37-40`, only caller of the knobs; normalizer routes through `hastToMarkdown`) |
| saxes exact 6.0.0 | ✔ (`package.json`, zero-dep confirmed in Phase-1 log) |
| ReverseError standalone — zero `src/cli/` changes | ✔ (no `src/cli/` files in diff; PD-2 honored — but see F-2 on the shape) |
| NG-3: forward fixtures/tests byte-unchanged | ✔ additions only under `tests/golden/fixtures/markdown/`; `storage-renderer.test.ts` untouched; ✘ `tests/bdd/support/world.ts` (F-5) |
| No `mock.module` | ✔ (`tests/unit/meta/no-mock-module.test.ts` green) |
| Determinism of diagnostics | ✔ for tested inputs; mixed-order collect-all defect (F-1) is a contract, not determinism, issue |
| Parser edge cases (CDATA split, entities, nested tables blocking) | CDATA/entities ✔ (21/21); nested tables blocking ✔ direct-child case, ✘ wrapped case (F-8) |
| Diagnostics carry code+location, no content echo | ✔ (`detail`/`construct` carry identity only; saxes `err.message` carries no element text) |

## Summary

Status: **FAIL**
Findings: 11 (1 blocker / 2 major / 6 minor / 2 nits)
Plan Status: **INCOMPLETE** (execution-log rows for Phases 4–6 unclosed — F-9)
Plan Gaps: OPEN_TASKS (bookkeeping only: Phase 5/6 log rows, sidecar-review confirmation)
Next Step: **EXECUTE_REMEDIATION_PHASE** (Phase 7 appended to chg-GH-92-plan.md)

*Review artifact: `code-review/review-iter-1.yaml` (same findings, machine-readable). Remediation phase appended to the implementation plan — no source code was modified by this review.*
