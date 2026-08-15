---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: TEST-SPEC-REVERSE-CONVERSION
status: Current
created: 2026-08-15
last_updated: 2026-08-15
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: ["GH-92", "GH-93"]
  feature_spec: doc/spec/features/feature-reverse-conversion.md
  decisions: [PDR-0002, ADR-0005, TDR-0012, TDR-0013, TDR-0014]
---

# Test Specification: Reverse Conversion (Storage Format → Markdown)

## Overview

The reverse converter (GH-92 + GH-93, MS-0003 E1) converts Confluence Storage
Format to canonical Markdown — the deterministic mirror of the forward
converter. It is a pure library (zero I/O, no CLI), so it is exercised at the
**Unit**, **Golden fixture**, and **Golden adversarial** tiers only;
integration / e2e / BDD tiers do not apply (no adapter, network, or lifecycle
surface) and run unchanged as the regression net.

The properties proven through the tests:

- **Round-trip fidelity (NFR-REL-4 reverse direction)** — for every corpus-A
  fixture, `reverse(forward(md)) === normalize(md)` **byte-wise** (the forward
  leg is rendered in-memory through the real pipeline; the committed forward
  goldens stay enforced by the unmodified `storage-renderer.test.ts`).
- **Determinism** — identical Storage converted twice in-process is
  deep-equal; a committed `toMatchSnapshot` layer locks output across runs and
  machines.
- **Marksync-structure handling** — provenance panel stripped (0 traces),
  mermaid code macro unwrapped with fence bytes identical to CDATA content,
  K1 attributes (`ac:schema-version`/`ac:macro-id` on macros, plus the
  recorded `ac:task-list` exception) produce output
  identical to the attribute-free variant.
- **C-4 diagnostics (PDR-0002)** — every non-canonical Storage construct —
  foreign macro, complex layout, unknown element, non-canonical attribute,
  misplaced task-list child — blocks with a granular stable code (TDR-0014) +
  construct identity + `line:column` location (+ caller page context when
  supplied); never silently dropped, never emitted as content; fast-fail and
  collect-all agree per instance; malformed Storage hits a distinct
  parse-error arm.
- **Detection completeness without false positives** — the GH-31-aligned
  storage-side corpus pins every category's expectation (supported categories
  pin zero-diagnostic conversions), and zero-diagnostic sweeps over corpus A,
  the forward goldens, and K1 variants prove the attribute pass is silent on
  the canonical mirror vocabulary.
- **Synthetic artifacts** — the render-policy mermaid image reports exactly one
  informational `marksync-synthetic-artifact` diagnostic alongside successful
  conversion.
- **Guardrail automation** — the harness is directory-driven from a committed
  partition manifest; an unpartitioned or failing fixture breaks CI (re-run on
  subset expansion is mechanical, not procedural).

## Test Scope

**Components under test:**

- `src/infra/confluence/parse/reverse-parser.ts` — `parseStorage` (saxes,
  CDATA reassembly, positions, panel strip, K1 tolerance, parse-error arm).
- `src/infra/confluence/parse/reverse.ts` — `reverseStorage` (fast-fail) /
  `reverseStorageCollectAll` (collect-all) + the node classifier (granular
  per-class codes, attribute pass over the mirror allowlist, task-list child
  integrity, page-context resolution).
- `src/domain/markdown/hast-to-markdown.ts` — the canonical serializer
  (options layer `{bullet:"-", rule:"-"}`).
- `src/domain/markdown/normalize.ts` — `normalizeMarkdown` (round-trip
  comparison basis; idempotence/fixed-point properties).
- `src/domain/markdown/reverse-diagnostics.ts` — the diagnostic model
  (`REVERSE_CODES` with 7 literal-pinned codes, two severity classes +
  parse-error arm, optional `page` context on all arms, `StorageParseError`,
  `ReverseError`).

**Reused, not re-tested (delivered by GH-20 et al.):**

- `parseMarkdown` / `mdastToHast` / `renderStorage` — the forward leg of the
  round trip runs through the real, unmodified pipeline (no mocks; TDR-0004
  golden-tier guardrail).
- `PROVENANCE_PANEL_MARKER` (`src/infra/confluence/provenance.ts`) — consumed
  as-is for panel identification.

**Exclusions:**

- CLI testing of any kind — the contract is library-level (PM-DEC-2; 0 CLI
  surface delta asserted structurally by TC-REG-001).
- `resolve`/`import` flow tests — diffing, patching, lock/state writes, Git
  operations are MS-0003 E2/E3 scope.
- Integration / e2e-mock / e2e-live / BDD — no I/O surface; those tiers run
  unmodified as regression signal.
- Mermaid-DOM rendering — the render-policy artifact is parsed as data
  (image → diagnostic), never rendered.
- Performance — informational only (≤ 200 ms p95 per page on the reference
  corpus); no hard CI gate beyond the suite's runtime.
- Partial/suppressed-construct conversion mode — deferred with E2/E3.

## Test Levels

### Unit Tests

**Purpose:** Validate the diagnostic model, the parse substrate, and the
classifier in isolation: the 7-code registry shape with literal-pinned,
additions-only code values (codes are a public-ish, additions-only surface
frozen pre-E2/E3 by TDR-0014), the code-assignment map pinned per class via
the real entry points, the page-context field's omit-when-absent +
verbatim-echo serialization at model level, location payload with no content
echoes, fast-fail/collect-all parity on hand-built multi-instance inputs
(first-blocking selection), malformed Storage → stable parse error (never a
crash, deterministic across repeats), XML entities / CDATA (incl. reassembly)
/ namespaced `ac:`/`ri:` elements, K1-confinement survival (K1 names dropped
on macros, survive the parse elsewhere), the attribute pass (aggregation,
allowlist boundary incl. the specially-handled `ac:*`/`ri:*` and task-family
elements — `ac:task-list`, `ac:task`, `ac:task-status`, `ac:task-body`,
`ac:plain-text-body`; K1 names silent on `ac:structured-macro` plus the
recorded `ac:task-list` allowlist-row exception, diagnosing on every other
swept element), task-list integrity in both forms (incl. the `ac:task-id`
canonical-silent exception, task-body diagnostic propagation, and an
`ac:task` missing `ac:task-status` → structural fallback in both forms),
and the normalizer's determinism + idempotence + canonical-form invariants
over the corpus fixtures.

**Tools:** `bun:test`; hand-built minimal Storage strings where fixture files
would be overkill; committed golden fixtures may be read directly (no mocks).

**Locations:**

- `tests/unit/infra/confluence/parse/reverse.test.ts` — the classifier
  itself (16 TC arms, 77 tests): per-class classification (TC-ELEM/TC-LAY incl.
  orphaned layout), attribute aggregation + mirror-allowlist boundary incl.
  the specially-handled `ac:image`/`ac:structured-macro`/`ac:parameter`/
  `ri:*` and task-family elements (TC-ATTR-001/002/003/004), K1 confinement to
  `ac:structured-macro` + the `ac:task-list` allowlist-row exception
  (TC-ATTR-002/004), task-list integrity in both forms incl. the `ac:task-id`
  canonical-silent probe, missing-`ac:task-status` fallback, and task-body
  diagnostic propagation (TC-TASK-001..004), page-context echo/precedence/
  byte-compat (TC-PAGE-001..003), determinism + first-blocking parity
  (TC-DET-001).
- `tests/unit/infra/confluence/parse/reverse-parser.test.ts` — parse substrate
  + parse-error arm + K1-confinement survival (`p[ac:macro-id]` /
  `td[ac:schema-version]` survive the parse; macro K1 stays dropped,
  byte-identical tree).
- `tests/unit/domain/markdown/reverse-diagnostics.test.ts` — diagnostic model,
  parity, informational class boundaries (user attachment images never
  misclassified), TC-TAXO-002 code-assignment pins via the real entry points.
- `tests/unit/domain/markdown/normalize.test.ts` — normalizer properties.

### Golden Fixture Tests

**Purpose:** Byte-lock the round-trip guarantee and the read-back behaviors
over the committed corpus, directory-driven from
`tests/golden/fixtures/markdown/round-trip-partition.json`:

- **Corpus A (26)** — canonical-construct fixtures (one per family +
  kitchensink + mermaid code-policy): byte equality
  `reverse(forward(md)) === normalize(md)`, a `toMatchSnapshot` layer, the
  no-`<ac:`/`<ri:`-leakage assertion, and the fixed-point check
  `normalizeMarkdown(reverse(...)) === reverse(...)`.
- **Corpus B (6)** — annotation/defensive fixtures (front-matter, comment,
  link-reference, raw-HTML-inline, mixed): convert from their committed
  Storage forms against explicit reverse expectations (committed sidecars
  under `reverse/`), never raw round-trip equality — annotations are stripped
  by design and never re-synthesized.
- **Storage-only (5)** — `provenance-panel`, `mermaid-render-policy`
  (pre-existing) + `code-block-python-k1`, `mermaid-code-policy-k1`,
  `readback-realistic` (new): panel strip (empty output; realistic read-back
  byte-equals `normalize(kitchensink.md)`), mermaid unwrap (fence bytes ≡
  CDATA), K1 tolerance (output ≡ attr-free variant), render-policy artifact
  (exactly one informational diagnostic, deep-compared against
  `reverse/mermaid-render-policy.json`).
- **Excluded (1)** — `raw-html-block-real` (forward-error fixture, no Storage
  form) with a recorded reason; never iterated.

The manifest guardrail asserts buckets are pairwise disjoint and complete over
directory discovery (all `*.md` = A ∪ B ∪ excluded; orphan `*.storage.xhtml` =
storageOnly; every exclusion carries a reason) — a fixture dropped into the
directory without a manifest entry fails CI.

**Locations:**

- `tests/golden/markdown/reverse-round-trip.test.ts` — TC-RT-001..005,
  TC-NORM-002.
- `tests/golden/markdown/reverse-readback.test.ts` — TC-RT-006..009.
- Snapshots: `tests/golden/markdown/__snapshots__/reverse-round-trip.test.ts.snap`
  (committed; re-baselining only via reviewed local
  `bun test --update-snapshots`, never in CI).

### Golden Adversarial Tests

**Purpose:** Regression-lock reverse diagnostics against the Storage-side
adversarial corpus — the GH-31 category taxonomy mirrored to Storage inputs,
aligned 12/12 plus the granular-detection classes beyond GH-31. The runner
walks `tests/adversarial-storage/` directory-driven; for each fixture,
collect-all diagnostics deep-equal the committed `*.classification.json`
sidecar (`{ code, construct, location, page? }` per instance — `page` pinned
where a fixture supplies a page-context companion), or — for the malformed
fixtures — the sidecar `{ "parseError": true }` form asserts the distinct
parse-error arm with fast-fail/collect-all agreement (page echo pinned on the
malformed-with-page fixture). An empty sidecar asserts a zero-diagnostic
conversion with fast-fail success — the false-positive guard arm for supported
categories. Beyond per-fixture deep-equality the runner asserts: the Appendix
B alignment map (every fixture resolves to its expected code set — `[]` for
zero-diagnostic counterparts), a category-coverage inventory (unknown macros ≥
2 kinds, non-panel info macro, app/gliffy class, nested tables,
non-canonical elements incl. block + inline, multi-instance, malformed),
adversarial determinism (classify + convert twice), and a PII grep-audit whose
bare-ID scoping is pinned to exactly the jira-referencing fixtures.

**Locations:**

- Runner: `tests/golden/adversarial/reverse-classification-runner.test.ts`
  (TC-RADV-001/002 + the golden arm of TC-RDIAG-002 + TC-CORP-001..003).
- Fixtures: 21 pairs under `tests/adversarial-storage/` — unknown macros
  (`storage-macro-jira`, `storage-macro-toc`, `storage-macro-expand`,
  `storage-macro-info-no-marker`, `storage-app-gliffy`), supported canonical
  counterparts (`storage-macro-code`, `storage-emoji`, `storage-long-page`,
  `storage-mixed-task-regular-lists`), structural fallback
  (`storage-nested-tables`), non-canonical elements
  (`storage-raw-html-block`, `storage-raw-html-inline`), granular classes
  (`storage-complex-layout`, `storage-orphaned-layout`,
  `storage-exotic-attributes`, `storage-k1-macro-negative`,
  `storage-task-list-stray-child`), page context (`storage-page-context` with
  a `.page-context.json` companion, `storage-malformed-page-context`),
  multi-instance (`storage-multiple-unsupported`), and malformed
  (`storage-malformed`). The set lives beside (not inside)
  `tests/adversarial/` so the pii-audit directory walk is unaffected.

## Test Data

- **Golden corpus:** the shared `tests/golden/fixtures/markdown/` directory
  (33 `.md` fixtures + Storage twins + 5 Storage-only + 2 forward
  `.unsupported.txt` sidecars), partitioned by the committed manifest.
- **Reverse expectation sidecars:** `tests/golden/fixtures/markdown/reverse/` —
  `<name>.md` expected reverse Markdown, `<name>.json` expected diagnostics
  where non-empty.
- **Adversarial Storage:** synthetic non-canonical + canonical-counterpart
  Storage bodies + committed classification sidecars
  (`{ code, construct, location, page? }` per instance; `{ "parseError": true
  }` for malformed; `[]` for zero-diagnostic counterparts) and optional
  `.page-context.json` companions supplying the caller page context (no PII;
  `JIRA-…` bare-ID refs are scoped to `storage-macro-jira` and
  `storage-multiple-unsupported` deliberately, enforced by the runner's PII
  assertions).
- **Hand-built unit inputs:** minimal Storage strings for entity/CDATA/
  namespace probes, multi-instance unsupported constructs, and malformed XML
  (mismatched tags, invalid entities, truncated CDATA).

## Test Scenarios

### Scenario 1: Corpus-A round-trip byte equality (TC-RT-001)

- **Given:** a corpus-A fixture `md`.
- **When:** `forward = renderStorage(mdastToHast(parseMarkdown(md)))` runs
  in-memory, then `reverseStorage(forward)`.
- **Then:** `result.markdown === normalizeMarkdown(md)` **byte-wise**; the
  output matches no `/<(ac|ri):/`; a snapshot layer pins the exact bytes.

### Scenario 2: Reverse determinism (TC-RT-003/004)

- **Given:** any corpus-A or Storage-only fixture's Storage.
- **When:** converted twice in one process (and re-run on CI against the
  committed snapshots).
- **Then:** both results are deep-equal (Markdown + diagnostics); snapshots
  byte-match across runs and machines.

### Scenario 3: Partition-manifest guardrail (TC-RT-005)

- **Given:** the fixtures directory and `round-trip-partition.json`.
- **When:** the harness discovers `*.md` and orphan `*.storage.xhtml` files.
- **Then:** discovery equals `corpusA ∪ corpusB ∪ excluded` and `storageOnly`
  exactly; buckets are pairwise disjoint; every excluded entry has a reason —
  any new/unpartitioned fixture fails CI (the "re-run on subset expansion"
  rule enforced mechanically).

### Scenario 4: Provenance-panel strip (TC-RT-006)

- **Given:** `provenance-panel.storage.xhtml` alone, and
  `readback-realistic.storage.xhtml` (canonical body + K1 attrs + panel).
- **When:** converted.
- **Then:** panel-only input yields empty Markdown with 0 diagnostics; the
  realistic read-back byte-equals `normalizeMarkdown(kitchensink.md)`; outputs
  contain 0 occurrences of the marker, `ac:structured-macro`,
  `ac:rich-text-body`, or panel prose (`Source:` / `Git revision:` /
  `Last sync:`).

### Scenario 5: Mermaid code-macro unwrap (TC-RT-007)

- **Given:** `mermaid-code-policy` / `code-block-mermaid` (and the K1 variant).
- **When:** converted.
- **Then:** the output is a ```mermaid fence whose interior bytes equal the
  CDATA content (newline-normalized); 0 wrapper artifacts.

### Scenario 6: K1 attribute tolerance (TC-RT-008)

- **Given:** `code-block-python-k1` / `mermaid-code-policy-k1` and their
  attribute-free variants.
- **When:** both converted.
- **Then:** outputs are byte-identical; 0 diagnostics; `ac:schema-version` /
  `ac:macro-id` never appear in output.

### Scenario 7: Render-policy synthetic image (TC-RT-009)

- **Given:** `mermaid-render-policy.storage.xhtml`.
- **When:** converted.
- **Then:** success with exactly one informational
  `marksync-synthetic-artifact` diagnostic (code
  `marksync/synthetic-artifact`, construct + location present) that
  deep-equals `reverse/mermaid-render-policy.json`; the heading survives; no
  `![`, `marksync-mermaid-`, `ac:image`, or `ri:attachment` in output.

### Scenario 8: Adversarial classification equals sidecars (TC-RADV-001/002, TC-CORP-003)

- **Given:** any `tests/adversarial-storage/` fixture (optionally with a
  `.page-context.json` companion).
- **When:** `reverseStorageCollectAll` runs (and `reverseStorage` for
  fast-fail), with the companion page context when present.
- **Then:** diagnostics deep-equal the committed sidecar (stable granular
  code, construct identity, `line:column` location, `page` when supplied —
  full-array equality, so every non-canonical element and attribute instance
  appears in exactly one pinned diagnostic: zero unclassified, zero silent
  drops); collect-all is exhaustive; the fast-fail error deep-equals the
  **first blocking** diagnostic in collect-all's document order
  (informational instances may precede it); determinism holds on repeat; the
  Appendix B alignment map and the category-coverage inventory pass over the
  set.

### Scenario 9: Malformed Storage → parse-error arm (TC-RDIAG-003, TC-PAGE-001)

- **Given:** malformed Storage (unit hand-built inputs; the committed
  `storage-malformed` fixture; `storage-malformed-page-context` with a page
  companion).
- **When:** converted in either mode.
- **Then:** a stable `StorageParseError` (`reverse/parse-error`, location,
  detail) — never a crash, never partial output; both modes agree; identical
  error on repeat; the page context is echoed verbatim when supplied.

### Scenario 10: Normalizer properties (TC-NORM-001/002)

- **Given:** any corpus fixture `md` (and reverse output for corpus A).
- **When:** normalized twice.
- **Then:** `N(md) === N(N(md))` (idempotent); canonical-form invariants hold
  (ATX, `-` bullets, `1.` ordered, backtick fences, inline links, single
  blank-line separation); `normalizeMarkdown(reverse(storage)) ===
  reverse(storage)` (fixed point).

### Scenario 11: Granular code assignment (TC-TAXO-001/002, TC-ELEM-001, TC-LAY-001/002)

- **Given:** hand-built Storage per construct class (unknown macro, layout
  tree incl. orphaned section/cell, unknown element, structural violation).
- **When:** converted.
- **Then:** the registry holds exactly 7 literal-pinned codes; each class
  emits its mapped code and severity; a layout tree (or orphaned layout
  family) emits exactly one `reverse/complex-layout` at the outermost family
  element — inner content never separately diagnosed, never
  `unknown-element`; structural violations (nested tables) stay on the
  `unsupported-construct` fallback; sibling layout trees emit one diagnostic
  each; document-order parity between modes holds.

### Scenario 12: Attribute detection over the mirror allowlist (TC-ATTR-001/002)

- **Given:** canonical elements carrying attributes beyond the mirror
  allowlist (e.g. `th` with `class`/`colspan`/`data-table-width`/`rowspan`/
  `style`; multi-element bodies), and boundary inputs (canonical pairings;
  exotic attributes on the specially-handled elements — user-set `ac:image`
  properties (`ac:align`/`ac:width`, sidecar-pinned), extra `ri:*` attributes
  on `ri:url`/`ri:attachment`, `ac:parameter` extras, exotic attributes on
  the task-family elements;
  `ac:schema-version`/`ac:macro-id` on a macro or `ac:task-list` vs. on
  `p`/`td`/`ac:image`).
- **When:** converted.
- **Then:** exactly one aggregated `reverse/unsupported-attribute` per
  offending element — attribute names sorted + deduplicated in the construct
  identity, element-start location, **no attribute values**; one diagnostic
  per element across multiple offenders (incl. the specially-handled
  `ac:*`/`ri:*` and task-family elements); canonical attribute pairings are
  silent; K1 names are silent on `ac:structured-macro` and — as the recorded
  allowlist-row exception — on `ac:task-list`, and diagnose
  (`reverse/unsupported-attribute`) on every other swept element (pinned on
  `p`/`td` and `ac:image[ac:macro-id]`; the parser keeps K1 names alive
  off-macro — K1-survival probes).

### Scenario 13: Task-list integrity (TC-TASK-001)

- **Given:** an `ac:task-list` with a stray child (unknown element;
  individually-canonical misplaced element incl. `ac:*` canonicals), a task
  body containing an unsupported element, the `task-list` macro form with a
  non-`ac:task` child, an `ac:task` missing `ac:task-status` in either the
  element or the macro form, a task carrying `ac:task-id`, and a canonical
  mixed task/regular-list body.
- **When:** converted.
- **Then:** the stray child produces a blocking diagnostic at the child
  (class per the taxonomy — never a silent drop); task-body diagnostics
  propagate; a missing `ac:task-status` is the structural fallback at the
  task (`ac:task without ac:task-status`) in both forms; `ac:task-id` is
  dropped silently (the canonical-silent exception); the canonical mixed
  list converts with zero diagnostics.

### Scenario 14: Page-context echo and precedence (TC-PAGE-001/002/003)

- **Given:** Storage producing blocking, informational, and parse-error
  diagnostics; options variants — explicit `page`, no options, `sourcePath`
  only, explicit `page` + `sourcePath` together, explicit `undefined`.
- **When:** converted.
- **Then:** a supplied page context is echoed verbatim on every diagnostic
  arm (no synthesis, no merge — partial context stays partial); with no
  context the `page` key is absent and output is byte-identical to the
  context-free form; `sourcePath` alone populates `{ sourcePath }`; an
  explicit page wins verbatim over `sourcePath` absorption; signatures are
  optional-parameters only (existing calls compile and behave identically).

### Scenario 15: False-positive guard sweeps (TC-FP-001)

- **Given:** corpus A (26 fixtures), the 33 forward golden pairs, and the K1
  variants.
- **When:** reverse-converted (round-trip where applicable).
- **Then:** zero new diagnostics — the attribute pass is silent over the
  forward emission vocabulary; corpus-A round-trip byte-equality remains
  100%; forward fixtures are byte-unmodified.

### Scenario 16: Corpus alignment inventory + PII scoping (TC-CORP-001/002)

- **Given:** the extended storage-side corpus and the runner inventory.
- **When:** alignment and coverage are asserted.
- **Then:** all 12 GH-31 categories have storage-side counterparts with
  pinned expectations — supported categories (emoji, long-page, macro-code,
  mixed task/regular lists) pinning zero-diagnostic conversions — and each
  new class (complex layout incl. orphaned, exotic attributes incl.
  multi-attribute + K1 negative control, task-list stray child, page context
  incl. parse-error-with-page) is represented by ≥1 fixture; the PII
  grep-audit passes with bare-ID matches scoped to exactly the designated
  fixtures.

## Performance & Load Tests

Informational only: per-fixture conversion timings are observable in the
golden runner; the reference target (≤ 200 ms p95 per page, mirroring
NFR-PERF-5) is not a CI gate.

## Security Tests

- **No content echoes:** diagnostic payloads carry `code`/`construct`/
  `location` only — never element text (NFR-SEC-1 posture; TC-RDIAG-001).
- **Parsed content never executed; zero egress:** the converter is a pure
  in-process function — no `fetch`, no filesystem writes; the suite runs
  green offline.
- **Regex-extraction prohibition (NFR-SEC posture):** Storage parsing rides
  the standards-based saxes parser (TDR-0012) — structurally verified, no
  regex construct-extraction path.
- **Git metadata confinement:** the provenance panel (commit SHA, branch,
  sync timestamp) is stripped before conversion, so it never reaches
  reverse-converted Markdown.

## Negative Testing

- Unknown macro / non-panel info macro / app-gliffy → blocking
  `reverse/unknown-macro` with sidecar-pinned verdicts.
- Non-canonical element (block `div`, inline `span`, unknown `ac:*`) →
  blocking `reverse/unknown-element`; nested table / misplaced canonical
  child → structural-fallback `reverse/unsupported-construct`.
- Layout family (tree or orphaned section/cell) → exactly one blocking
  `reverse/complex-layout` per layout tree.
- Exotic attribute on a canonical element — incl. the specially-handled
  `ac:*`/`ri:*` and task-family elements (user-set `ac:image` properties →
  `ac:image[ac:align, ac:width]`, sidecar-pinned) → one aggregated blocking
  `reverse/unsupported-attribute` per element (sorted names, no values); K1
  attribute names on elements other than `ac:structured-macro` (and the
  recorded `ac:task-list` exception) diagnose (carve-out confined to
  `ac:structured-macro` + `ac:task-list`; unit-pinned on `p`/`td` and
  `ac:image[ac:macro-id]`).
- Non-`ac:task` child of `ac:task-list` → blocking diagnostic at the child —
  never a silent drop (sole element-level exception: `ac:task-id` inside
  `ac:task`, dropped silently as server-assigned metadata).
- Code macro missing `ac:plain-text-body` → blocking diagnostic.
- Malformed XML (mismatched tags, invalid entities, truncated CDATA) →
  `StorageParseError`.
- An info macro without the panel marker is **not** stripped (blocking).
- A user attachment image (filename not matching `marksync-mermaid-`) converts
  to `![alt](filename)` with 0 diagnostics (no informational
  misclassification).

## Automation Strategy

- **CI:** `bun run check` runs the unit, golden, and adversarial tiers on
  every push; the partition guardrail and the snapshot layer make both
  round-trip and diagnostics regressions loud at review time.
- **No mocks on the conversion path:** the golden harness uses the real
  `parseMarkdown` → `mdastToHast` → `renderStorage` → `reverseStorage`
  pipeline (TDR-0004 over-mocking guardrail); only expectation sidecars are
  data.
- **Snapshot discipline:** committed snapshots re-baseline only via a reviewed
  local `bun test --update-snapshots` — never in CI.

## Test Environment

- Fully offline; no Confluence tenant, no network, no credentials. All inputs
  are committed fixture files or hand-built strings.

## Test Coverage Metrics

- 26/26 corpus-A fixtures byte-equal (0 mismatches); 6/6 corpus-B fixtures
  under explicit expectations; 5/5 Storage-only read-back fixtures green.
- 21/21 adversarial fixtures sidecar-pinned (incl. the parse-error arms and
  the zero-diagnostic canonical counterparts); 12/12 GH-31 categories with
  pinned storage-side counterparts.
- Zero new diagnostics over corpus A + the 33 forward golden pairs + K1
  variants (false-positive guard); forward fixtures byte-unmodified.
- Classifier unit armory: 77 tests across 16 TC arms
  (`tests/unit/infra/confluence/parse/reverse.test.ts`) plus the TC-TAXO-002
  entry-point assignment pins (`reverse-diagnostics.test.ts`) and the parser
  K1-survival probes (`reverse-parser.test.ts`).
- Every diagnostic code value pinned in unit tests; both contract modes
  (fast-fail / collect-all) covered for success, blocking, informational, and
  parse-error arms — with and without page context; runner parity selects
  the **first blocking** diagnostic (informational instances may precede it).

## References

- [Feature spec](../../spec/features/feature-reverse-conversion.md)
- [PDR-0002](../../decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md)
- [ADR-0005](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md)
- [TDR-0012](../../decisions/TDR-0012-reverse-storage-xml-parser-saxes.md),
  [TDR-0013](../../decisions/TDR-0013-reverse-markdown-serializer-substrate.md),
  [TDR-0014](../../decisions/TDR-0014-reverse-diagnostics-granular-code-taxonomy.md)
- [Nonfunctional requirements](../../spec/nonfunctional.md) (NFR-REL-4)
- [Testing strategy](../../../.ai/rules/testing-strategy.md)
- [Change test plan
  (GH-92)](../../changes/2026-08/2026-08-15--GH-92--reverse-converter-storage-to-markdown/chg-GH-92-test-plan.md)
- [Change test plan
  (GH-93)](../../changes/2026-08/2026-08-15--GH-93--unsupported-construct-detection/chg-GH-93-test-plan.md)
