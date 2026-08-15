# Code Review — GH-93: Complete unsupported-construct detection (granular codes + page locations)

**Mode**: local · **Iteration**: 1 (FIRST REVIEW) · **Date**: 2026-08-15
**Branch**: `feat/GH-93/unsupported-construct-detection` @ `2379f39` vs `main` (17 commits, 56 files, +5958/−282)
**Inputs reviewed**: chg-GH-93-spec.md (§17 ACs, normative Appendices A/B/C), chg-GH-93-plan.md (v1.0, 34 tasks, PD-1..PD-5), chg-GH-93-test-plan.md (18 TCs), TDR-0014 (frozen taxonomy + two pins), `.ai/agent/code-review-instructions.md`, `.ai/rules/typescript.md`, ticket GH-93 / PDR-0002 C-4.
**Verification run by this review** (not taken from the execution log): `bun run check` → **1673 pass / 0 fail**, depcruise clean (112 modules) · `bun run test:bdd` → 6 scenarios / 42 steps green · targeted: adversarial runner + domain units 129/0 · golden markdown + parse units 214/0 (58 snapshots, zero diffs) · tripwire diffs inspected (`tests/golden/fixtures/markdown/`, `tests/adversarial/`, `storage-renderer.test.ts`, `src/cli/`, `cli-error-map.ts` → all empty) · 7 re-pinned sidecars diffed vs `main` (code-only deltas confirmed) · `git ls-tree`/`git log --all` for the promised unit-test file · 9 new sidecars + fixtures read in full.
**Working-tree note**: one uncommitted modification to `chg-GH-93-pm-notes.yaml` (review_fix timestamp advanced by the PM) — benign; must land via the PM's next docs commit (F-12).

## Verdict

**Status: FAIL** — 1 critical · 3 high · 3 medium · 2 low · 3 info

The delivered core is solid and the guardrails hold under independent re-execution: taxonomy exactly per TDR-0014 (7 codes, additions-only, assignment map honored in every pinned sidecar), layout one-per-tree incl. the orphan pin, mirror-allowlist attribute pass on plain-HTML elements with sorted/dedup names-only payloads, page-context echo verbatim with omit-when-absent byte-compat, 12/12 GH-31 alignment mechanically asserted, K1 confinement correct, zero-diagnostic sweeps green, forward fixtures and CLI byte-untouched, full gate 1673/0 re-verified. FAIL is driven by: the attribute pass **silently skips the entire specially-handled Confluence element set** — `ac:image` user-set properties, the AC's own second example, are still silently dropped *and the aligned corpus pins that silent state* (F-1, with the doc-synced feature spec over-claiming the opposite); two further reachable silent-drop paths survive inside the task-list mapper (F-2, F-3); and the promised unit tier (plan task 2.6, an entire new test file) was never created while its checkbox and the execution log claim it delivered (F-4) — the same CHECKED_BUT_MISSING honesty pattern that drove GH-92 iterations 1–3.

## Findings

### [critical] F-1 — Attribute pass never runs on specially-handled Confluence elements; `ac:image` user properties remain silently dropped and the corpus pins it
- **Evidence**: `src/infra/confluence/parse/reverse.ts:723-726` — `checkAttributes` early-returns unless `isCanonicalElement(tagName)`, whose list (reverse.ts:685-713) covers only the 25 plain-HTML elements; the `ac:image` branch (reverse.ts:240-293) returns before any attribute check; recognized macros (`classifyCodeMacro`/`classifyTaskListMacro`), `ac:task-list`/`ac:task`/`ac:task-status`/`ac:task-body`/`ac:plain-text-body`/`ac:parameter`, `ri:attachment`, `ri:url` are likewise never attribute-checked. Consequently `tests/adversarial-storage/storage-exotic-attributes.storage.xhtml:12` — `<ac:image ac:alt="Test image" ac:width="200" ac:align="center">` — produces **zero** diagnostics and its sidecar pins only the `th`/`td` entries. Appendix C's rows for `ac:image`/`ri:*`/`ac:parameter`/`ac:structured-macro` are dead (never consulted by any code path).
- **Violates**: AC-F2-1 (names `ac:image` with user-set properties as the co-equal example), AC-F6-1 / G-1 / NFR-1 (zero silent drops over the aligned corpus — `ac:width`/`ac:align` instances sit in the corpus unclassified and unpinned), Appendix A trigger row ("`ac:image` user properties"), Appendix C (inoperative rows), plan task 2.2 + PD-5 (explicit in-scope element set). Compounding: the doc-synced `doc/spec/features/feature-reverse-conversion.md:177-179` claims these attributes are "a blocking `reverse/unsupported-attribute` diagnostic — never a silent drop" — system docs assert behavior the code does not have.
- **Fix**: extend the attribute pass to the PD-5 set (`ac:image`, recognized `ac:structured-macro`, `ac:task-list` + task children, `ac:plain-text-body`, `ac:parameter`, `ri:*` under `ac:image`) using the Appendix C rows; re-pin `storage-exotic-attributes` to include `ac:image[ac:align, ac:width] → reverse/unsupported-attribute` (reviewed re-baseline) and add a recognized-macro exotic-attribute case; verify the corpus-A/forward-golden sweeps stay zero-diagnostic (mirror attributes only). If the `ac:*`/`ri:*` surface is deliberately deferred to E3 partner-corpus evidence, that is a spec amendment: record an erratum re-scoping AC-F2-1/AC-F6-1, correct Appendix C's status, and fix the doc-synced feature spec — but fix-forward is the spec-compliant path.

### [high] F-2 — Task-body classification diagnostics are silently discarded
- **Evidence**: `reverse.ts:545-551` (`mapTaskSequenceToGfmTaskList`) — for each `ac:task-body` child, `classifyNode(child, page)` returns `{content, diagnostics}` and only `content` is pushed; `result.diagnostics` is dropped. Any blocking construct inside a task body (`<div>`, exotic-attribute `<p style>`, nested table) produces a diagnostic that vanishes and content that silently disappears — the exact C-4 violation class this change exists to eliminate. No fixture places unsupported content inside `ac:task-body`, so the corpus cannot catch it.
- **Violates**: G-1 / NFR-1 / AC-F6-1 (reachable silent drop; corpus blind spot).
- **Fix**: collect and propagate body-classification diagnostics into the task-list result (they are per-node; no dedup hazard). Add a unit probe (task body containing an unknown element + an exotic-attribute element).

### [high] F-3 — `ac:task-id` is silently dropped; non-canonical instances converted with zero diagnostics (pinned `[]`)
- **Evidence**: `reverse.ts:508-573` — `mapTaskSequenceToGfmTaskList` reads only `ac:task-status` and `ac:task-body`; every other child of `ac:task` is never visited. `ac:task-id` is standard in real Confluence read-back task lists and is present in two committed fixtures (`storage-task-list-stray-child`, `storage-mixed-task-regular-lists`); it is **not** in Appendix C's canonical set, so by the mirror principle these are non-canonical element instances — yet the mixed fixture pins `[]` and the stray-child sidecar ignores them.
- **Violates**: AC-F6-1 ("every non-canonical element … in the corpus appears in exactly one pinned diagnostic — zero unclassified instances"), NFR-1; the "0 silent drops over the aligned corpus" success metric is false as pinned.
- **Fix**: record the disposition. (a) Classify unknown children of `ac:task` → `reverse/unknown-element` at the child (mirror-strict), or (b) declare `ac:task-id` canonical-silent in Appendix C as a documented mirror-principle exception (server-assigned metadata, no user content, no GFM counterpart — the pragmatic reading, but it needs the decision recorded, not the silence inherited from GH-92). Pin whichever ships (fixture or unit probe); if (a), re-pin the two affected sidecars as a reviewed re-baseline.

### [high] F-4 — Plan task 2.6 checked `[x]` but the promised unit-test file was never created (CHECKED_BUT_MISSING)
- **Evidence**: plan task 2.6 — "Create `tests/unit/infra/confluence/parse/reverse.test.ts` (NEW …)" with ten TC unit arms (TC-ELEM-001, TC-LAY-001/002, TC-ATTR-001/002, TC-TASK-001, TC-PAGE-001/002/003, TC-DET-001). `git ls-tree HEAD tests/unit/infra/confluence/parse/` shows only `reverse-parser.test.ts`; `git log --all` has no commit ever touching that path; the Phase-2 commit `4575dcf` contains no test file beyond the 7 sidecar re-pins and an 8-line domain-test edit. Task 2.7 (TC-TAXO-002 assignment-map pin) is partially delivered: only the unknown-macro row is probed via real entry points — no layout/attribute/element/fallback probes, no severity pins (diff-added tests are TC-TAXO-001 + page-model probes only). Task 2.1's second half ("verify/extend `reverse-parser.test.ts`: `p[ac:macro-id]`/`td[ac:schema-version]` survive the parse") was not delivered — the file is untouched by the branch, so PD-4's behavioral half (K1 names exotic off-macro) has zero direct coverage. Execution-log Phase-2 note "unit tier" is inaccurate.
- **Violates**: plan tasks 2.1 (half), 2.6 (whole), 2.7 (partial); test-plan TC arms; the green-at-every-commit discipline's meaning (the boundary is green because the tests don't exist).
- **Fix**: create the unit file per task 2.6 (hand-built Storage strings, `#`-aliases, literal code strings), add the TC-TAXO-002 per-Appendix-A-row probes with severity pins, add the parser K1-survival assertions.

### [medium] F-5 — Residual untested contracts even granting golden-tier coverage
- **Evidence**: no test anywhere exercises: `sourcePath` absorption (`{sourcePath}` → `page:{sourcePath}`, PD-2/TC-PAGE-003), explicit-page-wins-over-`sourcePath` precedence, no-opts vs explicit-`undefined` byte-compat through the real entry points (TC-PAGE-002 — only model-level serialization probes exist), page echo on the **informational** arm (TC-PAGE-001 arm; OQ-4's "uniform yes" is implemented at reverse.ts:272 but unpinned — companions cover only blocking + parse-error), sibling layout trees → one diagnostic each (TC-LAY-001 step; the fixture has nesting, not siblings), and the OQ-P2 text-child fallback claimed "unit-pinned" (code exists at reverse.ts:637-648; pin absent).
- **Fix**: fold into the F-4 unit file.

### [medium] F-6 — `classifyTaskListMacro` still silently filters (task 2.4 half-missing)
- **Evidence**: `reverse.ts:580-599` — the macro form (`ac:structured-macro[ac:name="task-list"]`) filters children to `ac:task`-with-`ac:task-status` and discards everything else with zero diagnostics; plan task 2.4 explicitly names **both** `classifyTaskListElement` and `classifyTaskListMacro` ("stop silently filtering"). Only the element form was fixed. The macro form is synthetic (forward emits the element form) but it is exactly the silent-drop class F-3 removes, on a path the plan said was closed.
- **Fix**: route the macro form through the same child-integrity logic (shared with the element form), or delete the branch if unreachable-by-design — but the plan/AC text and the code must agree.

### [medium] F-7 — Stray-child class selection ignores canonical `ac:*` elements → wrong code on the frozen taxonomy
- **Evidence**: `reverse.ts:621-623` — stray-child classification branches on `isCanonicalElement` (plain-HTML only): a stray canonical-but-misplaced Confluence child (`ac:image`, nested `ac:task-list`, `ac:parameter`) inside `ac:task-list` emits `reverse/unknown-element`, but F-3/Appendix A assign individually-canonical misplaced children to the structural fallback (`reverse/unsupported-construct`). Wrong-code edge on a contract TDR-0014 freezes at this change; untested.
- **Fix**: classify stray children against the full canonical set (plain-HTML + Appendix C's `ac:*` canonical elements); pin with a unit probe.

### [low] F-8 — Runner parity compares to `diagnostics[0]`, not the first blocking entry
- **Evidence**: `tests/golden/adversarial/reverse-classification-runner.test.ts:224-238` (and :448-460) — mapped collect-all entry is `diagnostics[0]`. Plan RSK-P6 defines parity as **first-blocking** semantics (the domain unit test correctly uses the first blocking, reverse-diagnostics.test.ts:379). All current fixtures happen to be all-blocking or single-diagnostic, so it passes — but any future informational-before-blocking fixture (e.g. a mermaid artifact above a layout) false-fails the parity assertion.
- **Fix**: select the first `severity === "blocking"` entry in the runner mapping.

### [low] F-9 — Duplicated 25-entry canonical-element list; import-hygiene nits
- **Evidence**: `reverse.ts:306-332` (`canonicalElements`) vs `reverse.ts:685-713` (`isCanonicalElement`) — identical literals serving overlapping roles; drift between them would silently change attribute-pass scope vs classification (F-7 shows they already diverge in role). Also `reverse.ts:5-14` + `:18` — second same-module import (the same nit GH-92 F-14/F-20 carried, now in the new code too), and the `as const` on `CANONICAL_ATTRIBUTE_ALLOWLIST` is inert under its explicit `Record<string, string[]>` annotation.
- **Fix**: extract one shared constant (with a one-line comment distinguishing the two scopes); merge the import; drop the inert `as const`.

### [info] F-10 — Location semantics: post-`>` positions, not element-start columns
- Pinned locations are the saxes `opentag` position (after the start tag's `>`): e.g. `ac:layout` → `1:12` for an 11-char tag. Pre-existing GH-92 semantics (GH-92 review F-12, accepted as discretionary), byte-stable across the 7 re-pins, deterministic. Fine for E2/E3 "go to element"; recorded so the spec's "element-start" wording is read correctly. No action.

### [info] F-11 — Bookkeeping inaccuracies
- Plan task 3.8 + execution log say "14 new fixture+sidecar pairs + 2 companions = 30 new committed files"; the actual count is **12 pairs + 2 companions = 26** (the plan's own Files-and-modules section says 26 — internal inconsistency; `git diff --numstat` confirms 26 added files in `tests/adversarial-storage/`). Fixture count 21 (9 + 12) is correct. Also `storage-malformed-page-context.classification.json` pins `detail: "malformed"` — a placeholder, not the real saxes message (the runner asserts only `detail` is defined; acceptable, noted for fidelity).

### [info] F-12 — Uncommitted working-tree modification to `chg-GH-93-pm-notes.yaml`
- `review_fix.started` timestamp advanced, uncommitted. Benign PM bookkeeping; must ride the PM's next docs commit rather than get lost on checkout. No review action.

## Per-AC Table (spec §17)

| AC | Criterion (short) | Evidence | Verdict |
|----|-------------------|----------|---------|
| AC-F1-1 | Unknown macro → `reverse/unknown-macro`, children not diagnosed, both modes | 5 re-pinned sidecars + runner parity/determinism + unit probes; exactly-one per macro pinned | **PASS** |
| AC-F1-2 | Layout tree → exactly one `reverse/complex-layout` at outermost, zero per-cell | `storage-complex-layout` (nested ≥2 depths, 1 entry) + `storage-orphaned-layout` (TDR-0014 pin 1) sidecars; code rule correct (no recursion into the tree) | **PASS** (sibling-trees clause untested — F-5) |
| AC-F1-3 | Unknown element → `reverse/unknown-element`; structural fallback retained | `storage-raw-html-block`/`-inline` (3 entries) + `storage-nested-tables` (fallback unchanged) re-pins | **PASS** |
| AC-F2-1 | Attributes beyond mirror allowlist → one aggregated blocking diagnostic, sorted dedup names, no values | `th[colspan,rowspan,style,class,data-table-width]` + `td[style]` pinned — aggregation/sort/no-values all correct; **`ac:image` clause FAILS — user-set properties silently dropped and pinned as silent (F-1)** | **FAIL** |
| AC-F2-2 | K1 carve-out preserved, byte-identical output | `storage-k1-macro-negative` `[]` + readback K1 byte-compat re-assertions (ran green) | **PASS** |
| AC-F3-1 | Task-list stray children diagnosed by class; canonical mixed zero-diagnostic | `storage-task-list-stray-child` (both classes at child locations) + `storage-mixed-task-regular-lists` `[]` | **PASS with gap** (`ac:task-id` silent inside the same fixtures — F-3; macro form — F-6) |
| AC-F4-1 | Page echo verbatim on all arms; omit-when-absent byte-identical; optional-params-only | Companions pin blocking + parse-error echo (ran green); context-free sidecars deep-equal without `page` (omit-when-absent by construction); typecheck proves optional-params-only; **informational-arm echo, absorption, precedence untested (F-5)** | **PARTIAL** |
| AC-F4-2 | Determinism + fast-fail ≡ collect-all first blocking | Runner classify-twice byte-identical + parity per fixture over all 21 (ran green); domain mixed-order test uses first-blocking correctly | **PASS** (runner-index nit F-8) |
| AC-F5-1 | 12/12 GH-31 categories with pinned counterparts; supported → `[]` | `appendixBAlignment` map mechanically asserts all 12 rows + fixture sidecars (ran green) | **PASS** |
| AC-F5-2 | New classes ≥1 fixture each; PII audit | Inventory asserts layout/orphan/exotic(multi-attr)/K1-negative/task-stray/page-context incl. parse-error-with-page; PII scoping exact (read + ran) | **PASS** |
| AC-F6-1 | Completeness: every non-canonical instance in exactly one pinned diagnostic; zero silent drops | Mechanism (full-array deep-equality) present and green — **but the pins themselves contain unpinned silent drops: `ac:image` `ac:width`/`ac:align` (F-1) and `ac:task-id` (F-3)** | **FAIL** |
| AC-F7-1 | Zero new diagnostics on canonical corpora; byte-equality; forward fixtures unmodified | Sweeps re-ran green (corpus A 26 + corpus B + K1 variants + readback + mermaid); 58 snapshots zero-diff; tripwire diffs empty | **PASS** |
| AC-F7-2 | 0 CLI delta; standalone ReverseError; all tiers green | `src/cli/` + `cli-error-map.ts` zero diff; no code outside producer modules references reverse codes; full gate 1673/0 + BDD 6/42 re-run green by this review; v0.10.0 | **PASS** |

## TDR-0014 pins & tripwires — verified vs sampled

**Verified (evidence re-executed or diff-inspected by this review):**
- Additions-only registry, exactly 7 codes, 0.9.0 values unchanged (TC-TAXO-001, ran).
- Assignment map honored in every pinned sidecar (macro/element re-assignments code-only, construct/location byte-stable — diffed all 7 vs `main`).
- Orphaned layout = ONE `reverse/complex-layout` at the outermost family element present (sidecar + code rule, no per-cell recursion).
- K1 silent on macros / exotic elsewhere in parser (PD-4 code read; macro-silent ran green; **off-macro survival untested — F-4**).
- Forward tripwire: `tests/golden/fixtures/markdown/` + `tests/adversarial/` + `storage-renderer.test.ts` byte-unmodified (git diff empty).
- 0 CLI delta; `ReverseError` standalone; consumerless surface re-checked (grep: no reverse-code references outside producer modules + tests).
- Page-context omit-when-absent byte-compat (context-free sidecars deep-equal, ran) + verbatim echo on blocking/parse-error arms (companions, ran).
- Determinism (sorted/dedup attribute names; classify-twice per fixture, ran) and fast-fail/collect-all parity (ran).
- 12/12 Appendix B alignment + new-class inventory + exact PII scoping (read the runner, ran the suite).
- Full gate 1673/0 + depcruise + BDD 6 scenarios/42 steps (re-run by this review — matches the coder-reported claims exactly).

**Sampled (spot-read, not exhaustively re-derived):** sidecar deep-equality per fixture (executed via suite; 9 new sidecars + fixtures read in full, remaining re-pins diff-inspected), `storage-long-page` (2171 lines — existence, `[]` pin, and suite-green verified; content not line-audited), doc-sync output (taxonomy + attribute sections read; over-claim flagged in F-1), CHANGELOG/roadmap/glossary (consistency skim).

## Summary

Status: **FAIL**
Remediation Phase: ADDED (Phase 6 populated with concrete tasks 6.1–6.9 in chg-GH-93-plan.md)
Findings: 12 (1 critical / 3 high / 3 medium / 2 low / 3 info)
Plan Status: **MISMATCH** (all 34 tasks checked; 2.1 half, 2.4 half, 2.6 whole, 2.7 partial are CHECKED_BUT_MISSING)
Plan Gaps: CHECKED_BUT_MISSING (unit tier), spec-scope shortfall (F-1 attribute-pass element set)
Test Coverage Gaps: unit tier for all ten TC arms; TC-PAGE-002/003 through real entry points; informational-arm page echo; sibling layouts; task-body unsupported content; K1-off-macro survival; `ac:image`/macro attribute detection
Next Step: **EXECUTE_REMEDIATION_PHASE** (Phase 6, tasks 6.1–6.9; iteration-2 re-review of 6.1–6.3 + 6.6 mandatory)

*Review artifacts: `code-review/review-iter-1.yaml` (machine-readable, same findings). Phase 6 populated + revision log appended in the implementation plan — no source code was modified by this review.*
