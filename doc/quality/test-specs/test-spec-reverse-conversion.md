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
  related_changes: ["GH-92"]
  feature_spec: doc/spec/features/feature-reverse-conversion.md
  decisions: [PDR-0002, ADR-0005, TDR-0012, TDR-0013]
---

# Test Specification: Reverse Conversion (Storage Format → Markdown)

## Overview

The reverse converter (GH-92, MS-0003 E1) converts Confluence Storage Format to
canonical Markdown — the deterministic mirror of the forward converter. It is a
pure library (zero I/O, no CLI), so it is exercised at the **Unit**,
**Golden fixture**, and **Golden adversarial** tiers only; integration / e2e /
BDD tiers do not apply (no adapter, network, or lifecycle surface) and run
unchanged as the regression net.

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
  K1 attributes (`ac:schema-version`/`ac:macro-id`) produce output identical
  to the attribute-free variant.
- **C-4 diagnostics (PDR-0002)** — every non-canonical Storage construct
  blocks with a stable code + construct identity + `line:column` location;
  never silently dropped, never emitted as content; fast-fail and collect-all
  agree per instance; malformed Storage hits a distinct parse-error arm.
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
  `reverseStorageCollectAll` (collect-all) + the node classifier.
- `src/domain/markdown/hast-to-markdown.ts` — the canonical serializer
  (options layer `{bullet:"-", rule:"-"}`).
- `src/domain/markdown/normalize.ts` — `normalizeMarkdown` (round-trip
  comparison basis; idempotence/fixed-point properties).
- `src/domain/markdown/reverse-diagnostics.ts` — the diagnostic model
  (`REVERSE_CODES`, two severity classes, `StorageParseError`, `ReverseError`).

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

**Purpose:** Validate the diagnostic model and the parse substrate in
isolation: two-class taxonomy shape, stable code values (pinned — codes are a
public-ish, additions-only surface), location payload with no content echoes,
fast-fail/collect-all parity on hand-built multi-instance inputs, malformed
Storage → stable parse error (never a crash, deterministic across repeats),
XML entities / CDATA (incl. reassembly) / namespaced `ac:`/`ri:` elements, and
the normalizer's determinism + idempotence + canonical-form invariants over
the corpus fixtures.

**Tools:** `bun:test`; hand-built minimal Storage strings where fixture files
would be overkill; committed golden fixtures may be read directly (no mocks).

**Locations:**

- `tests/unit/infra/confluence/parse/reverse-parser.test.ts` — parse substrate
  + parse-error arm.
- `tests/unit/domain/markdown/reverse-diagnostics.test.ts` — diagnostic model,
  parity, informational class boundaries (user attachment images never
  misclassified).
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
adversarial corpus — the GH-31 category taxonomy mirrored to Storage inputs.
The runner walks `tests/adversarial-storage/` directory-driven; for each
fixture, collect-all diagnostics deep-equal the committed
`*.classification.json` sidecar (`{ code, construct, location }` per
instance), or — for `storage-malformed.storage.xhtml` — the sidecar
`{ "parseError": true }` form asserts the distinct parse-error arm with
fast-fail/collect-all agreement. Category coverage (unknown macros, non-panel
info macro, app/gliffy class, nested tables, non-canonical elements,
multi-instance, malformed) is asserted over the set, and adversarial
determinism (classify + convert twice) is proven.

**Locations:**

- Runner: `tests/golden/adversarial/reverse-classification-runner.test.ts`
  (TC-RADV-001/002 + the golden arm of TC-RDIAG-002).
- Fixtures: 9 pairs under `tests/adversarial-storage/` — `storage-macro-jira`,
  `storage-macro-toc`, `storage-macro-expand`, `storage-macro-info-no-marker`,
  `storage-app-gliffy`, `storage-nested-tables`, `storage-raw-html-block`,
  `storage-multiple-unsupported`, `storage-malformed`. The set lives beside
  (not inside) `tests/adversarial/` so the pii-audit directory walk is
  unaffected; a PII grep-audit over the set is asserted inside the runner.

## Test Data

- **Golden corpus:** the shared `tests/golden/fixtures/markdown/` directory
  (33 `.md` fixtures + Storage twins + 5 Storage-only + 2 forward
  `.unsupported.txt` sidecars), partitioned by the committed manifest.
- **Reverse expectation sidecars:** `tests/golden/fixtures/markdown/reverse/` —
  `<name>.md` expected reverse Markdown, `<name>.json` expected diagnostics
  where non-empty.
- **Adversarial Storage:** synthetic non-canonical Storage bodies + committed
  classification sidecars (no PII; `JIRA-…` refs in `storage-macro-jira` are
  scoped out deliberately).
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

### Scenario 8: Adversarial classification equals sidecars (TC-RADV-001/002)

- **Given:** any `tests/adversarial-storage/` fixture.
- **When:** `reverseStorageCollectAll` runs (and `reverseStorage` for
  fast-fail).
- **Then:** blocking diagnostics deep-equal the committed sidecar (stable
  code, construct identity, `line:column` location); collect-all is
  exhaustive with per-instance verdicts identical to fast-fail; determinism
  holds on repeat.

### Scenario 9: Malformed Storage → parse-error arm (TC-RDIAG-003)

- **Given:** malformed Storage (unit hand-built inputs; the committed
  `storage-malformed` fixture).
- **When:** converted in either mode.
- **Then:** a stable `StorageParseError` (`reverse/parse-error`, location,
  detail) — never a crash, never partial output; both modes agree; identical
  error on repeat.

### Scenario 10: Normalizer properties (TC-NORM-001/002)

- **Given:** any corpus fixture `md` (and reverse output for corpus A).
- **When:** normalized twice.
- **Then:** `N(md) === N(N(md))` (idempotent); canonical-form invariants hold
  (ATX, `-` bullets, `1.` ordered, backtick fences, inline links, single
  blank-line separation); `normalizeMarkdown(reverse(storage)) ===
  reverse(storage)` (fixed point).

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

- Unknown macro / non-panel info macro / app-gliffy / nested table /
  raw-HTML block / multiple unsupported instances → blocking
  `unsupported-construct` with sidecar-pinned verdicts.
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
- 9/9 adversarial fixtures sidecar-pinned (incl. the parse-error arm).
- Every diagnostic code value pinned in unit tests; both contract modes
  (fast-fail / collect-all) covered for success, blocking, informational, and
  parse-error arms.

## References

- [Feature spec](../../spec/features/feature-reverse-conversion.md)
- [PDR-0002](../../decisions/PDR-0002-ms0003-rescope-company-adoption-mvp.md)
- [ADR-0005](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md)
- [TDR-0012](../../decisions/TDR-0012-reverse-storage-xml-parser-saxes.md),
  [TDR-0013](../../decisions/TDR-0013-reverse-markdown-serializer-substrate.md)
- [Nonfunctional requirements](../../spec/nonfunctional.md) (NFR-REL-4)
- [Testing strategy](../../../.ai/rules/testing-strategy.md)
- [Change test plan
  (GH-92)](../../changes/2026-08/2026-08-15--GH-92--reverse-converter-storage-to-markdown/chg-GH-92-test-plan.md)
