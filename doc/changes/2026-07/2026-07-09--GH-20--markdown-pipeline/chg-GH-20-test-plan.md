---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-20-test-plan
status: Proposed
created: 2026-07-09T00:00:00Z
last_updated: 2026-07-09T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, security, fidelity]
version_impact: minor
summary: "Test plan for the Markdown pipeline story (MS2-E3-S3 / GH-20): the deterministic Markdown → Confluence Storage Format converter — the body-representation half of ADR-0005. Covers parseMarkdown (remark + remark-gfm), the MDAST→HAST bridge, canonicalize + contentHash (sha256, the Content Hash VO), renderStorage (the spike-H6-proven 27-construct HAST→Storage XHTML visitor with CDATA code bodies and omitted ac:schema-version/ac:macro-id), the unsupported-node classifier emitting the pre-existing UnsupportedConstruct arm (never a silent drop), 27 byte-stable golden fixture pairs, and the NFR-SEC-5 injection-safety property tests. Exercised at Unit + Golden-fixture + Integration tiers; no Mermaid-DOM, no E2E (no Confluence network in this story — the API write is E3-S4/E3-S6). The converter is tested with REAL fixtures and a REAL XML well-formedness check — no mocked parser/renderer (over-mocking guardrail)."
links:
  change_spec: "./chg-GH-20-spec.md"
  implementation_plan: "./chg-GH-20-plan.md"
  story_authoritative: doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S3--markdown-pipeline.md
  feature_spec: doc/spec/features/feature-safe-publish.md
  testing_strategy: .ai/rules/testing-strategy.md
  typescript_rules: .ai/rules/typescript.md
  decision: doc/decisions/ADR-0005-page-body-representation-storage-not-adf.md
  spike_h6_mapping: doc/inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md
  golden_reference: doc/inception/tmp/confluence-api-validation-spike/examples/pages/storage-kitchensink.xml
  nonfunctional_spec: doc/spec/nonfunctional.md
---

# Test Plan - [MS2-E3-S3] Markdown pipeline — remark/HAST → Confluence Storage Format

## 1. Scope and Objectives

This plan verifies the **body-representation half** of ADR-0005 delivered by
GH-20: the parser (`parseMarkdown`, `src/domain/markdown/parse.ts`), the
MDAST→HAST bridge (`src/domain/markdown/mdast-to-hast.ts`), the canonicalizer +
content-hash function (`src/domain/render/canonicalize.ts`), the HAST→Storage
XHTML renderer (`renderStorage`, `src/infra/confluence/render/storage.ts`), the
unsupported-node classifier (`src/domain/markdown/unsupported.ts`), the 27
golden fixture pairs (`tests/golden/fixtures/`), and the injection-safety
property tests (NFR-SEC-5). Confluence API writes (E3-S4/E3-S6), the mermaid
render-to-image (E4-S1), and attachment binary upload (E4-S2) are **out of
scope** — this story renders bytes; it performs no HTTP.

The brand-defining risks this plan guards against are: (a) **a construct is
silently dropped** instead of classified — the user publishes an incomplete page
with no signal (RSK-1, ADR-0005 "do not silently degrade"); (b) **malicious
Markdown injects a server-side `<ac:structured-macro>` from source text**
(NFR-SEC-5 / RSK-2) — a macro executes on publish; (c) **non-deterministic
output** breaks byte-stability and churns golden snapshots / drift
false-positives (RSK-3); (d) **a fenced code body is emitted without CDATA or
with `ac:schema-version`/`ac:macro-id`** (spike rule #1 violation); (e)
**ill-formed XML reaches Confluence** → HTTP 400 (ADR-0005 C-3 / RSK-7); and (f)
**a dependency-cruiser tier violation** — domain markdown/render must not import
`src/infra/confluence/render/` (NFR-10).

Per `.ai/rules/testing-strategy.md` (§"Test tiers" + §"What MUST be tested
release-blocking") and the story's Test matrix, this story is exercised at
**Unit**, **Golden-fixture**, and **Integration** tiers. The release-blocking
NFR-REL-4 ("Canonical GFM subset survives round-trip — Golden fixture, all
constructs") and ADR-0002 C-1 ("Storage renderer is deterministic — Golden
fixture, byte-stable") are both owned here. There is **no Mermaid-DOM** (no
mermaid render — E4-S1) and **no E2E** (no Confluence network). The
release-blocking lifecycle invariants INV-SAFE-1/2/3 are owned by E3-S6/E5-S1;
GH-20 contributes the body-representation layer those invariants render through,
plus INV-SEC-1 (no secrets in rendered output — synthetic fixtures only).

### 1.1 In Scope

- **Parser (`parseMarkdown`)** — canonical GFM source bytes → `ok(MdastRoot)`
  via `remark` + `remark-gfm`; `sourcePath` provenance flows through `opts`
  (F-1).
- **MDAST→HAST bridge** — `remark-rehype` produces the adapter-agnostic HAST;
  node kinds outside the canonical subset are preserved enough to be classified,
  not lost (F-2).
- **Canonicalizer + content hash** — `canonicalize(hast)` normalizes attribute
  order + whitespace; `contentHash` returns the lowercase-hex `sha256` digest;
  same canonical HAST → identical hash (F-3, AC-F3-1).
- **HAST→Storage renderer (`renderStorage`)** — the spike-H6 27-construct
  visitor: CDATA code bodies; omitted `ac:schema-version`/`ac:macro-id`;
  well-formed XML; `<ac:image>`/`<ac:task-list>` macros; entity preservation
  (`&amp;` in links) (F-4, AC-F4-2, AC-F4-3).
- **Unsupported-node classifier** — footnote, raw-HTML **block**, math,
  definition list → `err({ kind: "UnsupportedConstruct"; construct; sourcePath })`
  (the **pre-existing** arm, first-produced here); **never** a silent drop
  (F-5, AC-F5-1).
- **27 golden fixture pairs** — `tests/golden/fixtures/*.md` + `*.storage.xhtml`;
  27/27 byte-match (F-6, AC-F4-1, NFR-REL-4).
- **Injection-safety property tests** — malicious source text (`<ac:structured-macro>`,
  `<script>`, `<ac:parameter>`, `<ac:plain-text-body>`, raw `<div>` inline HTML)
  → inert escaped output; 0 server-side macros derived from source; 0 executable
  content (F-7, AC-F4-4, NFR-SEC-5).
- **Determinism** — same input rendered N times → byte-identical (AC-F4-5);
  same canonical HAST → identical hash (AC-F3-1).
- **Raw inline HTML** → escaped (supported-but-escaped, DEC-4); 0 bytes
  passthrough (NFR-8).
- **Task-list + regular-list mixing** → a warning (DEC-5, spike rule #3).
- **Quality gate + tier purity** — `bun run check` exits 0; dep-cruiser confirms
  `src/infra/confluence/render/` may import domain markdown/render types but not
  vice versa (AC-Q-1, NFR-10).

### 1.2 Out of Scope & Known Gaps

- **Confluence API writes** (POST/PATCH pages) — E3-S4 (adapter client) / E3-S6
  (sync engine). This story renders bytes; no HTTP.
- **Mermaid render-to-image** — the `mermaid`-language code fence is **detected**
  here (it emits the code macro like any fenced block) but the in-process SVG/PNG
  render + upload is E4-S1 (ADR-0002). `mermaid`/`jsdom`/`happy-dom` are NOT
  installed by this story.
- **Image/attachment binary upload + hash-named dedup** — the `<ri:attachment>`
  reference is **emitted** here; the binary upload is E4-S2.
- **Reverse conversion (Storage/ADF → Markdown)** — MS-0005+.
- **Macro fallbacks for footnotes/definition-lists/math** — classified as
  `UnsupportedConstruct` here; no macro fallback authored (ADR-0005 unresolved
  questions; NG-5).
- **The `sha256:`-prefixed `renderedBodyHash` wire format** — this story returns
  the raw lowercase-hex digest; the wire format is E3-S5's binding concern (OQ-1
  in the spec). The hash-determinism tests assert the **raw digest**, not a
  prefixed string.
- **NFR-PERF-5 conversion latency (≤200 ms p95)** — informational only; the
  repo-local benchmark gate (testing-strategy §"Repo-local benchmark gate") is
  deferred to MS-0002 end / MS-0003. No hard perf assertion in this plan.
- **E2E (live-sandbox)** — separate CI gate; the rendered body is not pushed to
  Confluence here, so live Storage acceptance is verified in E3-S4/E3-S6 E2E.
- **BDD (Gherkin) scenarios** — INV-SAFE-1/2/3 are owned by E5-S1; GH-20
  contributes no lifecycle-invariant scenario (it provides the renderer those
  invariants reason over).

## 2. References

| Artifact | Path |
|----------|------|
| Story (authoritative scope) | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S3--markdown-pipeline.md` |
| Change specification | [`./chg-GH-20-spec.md`](./chg-GH-20-spec.md) (contract authority — `F-1..7`, `AC-F4-1..AC-Q-1`, `DM-1..6`, `DEC-1..6`, `NFR-1..13`) |
| Implementation plan | [`./chg-GH-20-plan.md`](./chg-GH-20-plan.md) |
| PM notes | [`./chg-GH-20-pm-notes.yaml`](./chg-GH-20-pm-notes.yaml) |
| Testing strategy | [`.ai/rules/testing-strategy.md`](../../../.ai/rules/testing-strategy.md) (tiers, golden-fixture rules, over-mocking guardrail) |
| TypeScript conventions | [`.ai/rules/typescript.md`](../../../.ai/rules/typescript.md) (tier matrix, `bun:test`, import aliases, snapshot conventions) |
| Decision (load-bearing) | [ADR-0005](../../../decisions/ADR-0005-page-body-representation-storage-not-adf.md) (Storage not ADF; C-1 lossless; C-3 well-formed XML; raw-HTML sanitised) |
| Spike H6 mapping table (the blueprint) | `doc/inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md` (lines 17-41 — 27-construct table + 3 converter rules) |
| Golden reference shape | `doc/inception/tmp/confluence-api-validation-spike/examples/pages/storage-kitchensink.xml` |
| Feature spec | [`doc/spec/features/feature-safe-publish.md`](../../../spec/features/feature-safe-publish.md) |
| Non-functional spec | [`doc/spec/nonfunctional.md`](../../../spec/nonfunctional.md) (NFR-REL-4, NFR-SEC-5, NFR-PERF-5) |
| Reused `Result<T,E>` | `src/domain/result.ts` (`Result.ok`/`Result.err`) |
| Pre-existing `UnsupportedConstruct` arm | `src/domain/errors.ts` (first-produced here, not redefined — DEC-2) |
| Prior test plan (house style) | [`../2026-07-09--GH-19--state-manager-lock-cache/chg-GH-19-test-plan.md`](../2026-07-09--GH-19--state-manager-lock-cache/chg-GH-19-test-plan.md) |

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

> Acceptance criteria are the spec's canonical IDs from `chg-GH-20-spec.md` §17
> (reproduced from the story's acceptance criteria). Every `AC-*` MUST appear.

| Spec AC | Description | F-# / NFR-# / DM-# | TC ID(s) | Status |
|---------|-------------|--------------------|----------|--------|
| AC-F4-1 (NFR-REL-4) | 27/27 canonical GFM fixtures byte-match their golden `.storage.xhtml` snapshot. | F-1, F-2, F-4, F-6, NFR-1 | TC-GOLDEN-001, TC-GOLDEN-002 | Covered |
| AC-F4-2 | Fenced code → CDATA body inside `<ac:structured-macro ac:name="code">`; 0 occurrences of `ac:schema-version`/`ac:macro-id` in output. | F-4, NFR-2 | TC-RENDER-001, TC-RENDER-002 | Covered |
| AC-F4-3 | Every rendered Storage body parses as well-formed XML (0 unbalanced tags; entities escaped outside CDATA). | F-4, NFR-3 | TC-XML-001, TC-XML-002 | Covered (mechanism: see OQ-TP-1) |
| AC-F5-1 | An unsupported node (footnote, raw-HTML block, math, definition list) → `err(UnsupportedConstruct)` — never silent. | F-5, NFR-4 | TC-UNSUPPORTED-001..006 | Covered |
| AC-F4-4 (NFR-SEC-5) | Malicious fixture → 0 `<ac:structured-macro>` derived from source; 0 executable content (escaped/inert). | F-4, F-7, NFR-5 | TC-INJECT-001..006 | Covered |
| AC-F4-5 | Same input rendered N times → byte-identical (0 bytes diff). | F-3, F-4, NFR-6 | TC-DETERM-001 | Covered |
| AC-F3-1 | Same canonical HAST → identical `sha256`; two renders of same input → identical hash. | F-3, NFR-7 | TC-HASH-001, TC-HASH-002 | Covered |
| AC-Q-1 | `bun run check` exits 0; dep-cruiser confirms `src/infra/confluence/render/` may import domain markdown/render types but not vice versa. | F-4, NFR-10, NFR-13 | TC-GATE-001, TC-BND-001 | Covered |

**Capability (F-#) rollup:**

| F-# | Capability | TC ID(s) |
|-----|------------|----------|
| F-1 | Markdown parser (`parseMarkdown`) | TC-PARSE-001, TC-PARSE-002, TC-ROUND-001 |
| F-2 | MDAST→HAST bridge | TC-BRIDGE-001, TC-BRIDGE-002, TC-ROUND-001 |
| F-3 | Canonicalizer + content-hash function | TC-HASH-001..005, TC-DETERM-001 |
| F-4 | HAST→Storage renderer (`renderStorage`) | TC-RENDER-001..005, TC-GOLDEN-001..002, TC-XML-001..002, TC-ROUND-001 |
| F-5 | Unsupported-node classifier | TC-UNSUPPORTED-001..007 |
| F-6 | Golden fixtures (27 constructs) | TC-GOLDEN-001, TC-GOLDEN-002 |
| F-7 | Injection-safety property tests | TC-INJECT-001..006 |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No REST/HTTP endpoints owned by this story (the API write is E3-S4/E3-S6). No
events (the `UnsupportedConstruct` signal is a `Result` value, not a bus event —
spec §8.2). Data-model coverage (spec §8.3):

| DM-# | Element | TC ID(s) |
|------|---------|----------|
| DM-1 | `MdastRoot` (the canonical parse intermediate) | TC-PARSE-001, TC-PARSE-002, TC-ROUND-001 |
| DM-2 | `HastRoot` / `CanonicalHast` (HTML AST + deterministic canonicalized form) | TC-BRIDGE-001, TC-HASH-001, TC-HASH-004 |
| DM-3 | `RenderedBody` (`{ body; hash }`) — the `renderStorage` success payload | TC-RENDER-003, TC-ROUND-001 |
| DM-4 | Content Hash (UL VO, first-produced — `sha256` lowercase hex over canonical HAST) | TC-HASH-001..005, TC-DETERM-001 |
| DM-5 | `UnsupportedConstruct` arm (pre-existing, **first-produced** here — DEC-2) | TC-UNSUPPORTED-001..006 |
| DM-6 | Golden fixture layout (`tests/golden/fixtures/*.md` + `*.storage.xhtml`) | TC-GOLDEN-001, TC-GOLDEN-002 |

**Public interface contracts consumed downstream** (verified as side-effects —
the consumers are blocked on this story):

| Contract | Consumer | Verified by |
|----------|----------|-------------|
| `parseMarkdown` / `renderStorage` | sync engine (E3-S6) — push flow parse→render→hash→compare→write | TC-PARSE-*, TC-RENDER-*, TC-ROUND-001 |
| `contentHash` (raw digest) | drift detection (E3-S5), mermaid/attachment dedup (E4-S1/E4-S2) | TC-HASH-* |
| `UnsupportedConstruct` | sync engine (E3-S6, surfaced in plan), adversarial corpus (E5-S3) | TC-UNSUPPORTED-* |
| Golden fixtures + injection tests | adversarial corpus (E5-S3) + CI | TC-GOLDEN-*, TC-INJECT-* |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR-# / INV-# | Requirement | Threshold | TC ID(s) | Status |
|---------------|-------------|-----------|----------|--------|
| NFR-1 / NFR-REL-4 | Fidelity | 27/27 fixtures byte-match golden snapshot | TC-GOLDEN-001 | Covered |
| NFR-2 | Code-macro shape | 100% CDATA bodies; 0 `ac:schema-version`/`ac:macro-id` | TC-RENDER-001, TC-RENDER-002 | Covered |
| NFR-3 | XML well-formedness | 100% of rendered bodies parse as valid XML | TC-XML-001, TC-XML-002 | Covered (mechanism: OQ-TP-1) |
| NFR-4 | No silent drop | unsupported node → `UnsupportedConstruct`, never omitted | TC-UNSUPPORTED-001..006 | Covered |
| NFR-5 / NFR-SEC-5 | Injection safety | 0 source-derived macros; 0 executable content | TC-INJECT-001..006 | Covered |
| NFR-6 | Determinism | same input N times → byte-identical | TC-DETERM-001 | Covered |
| NFR-7 | Hash determinism | same canonical HAST → identical `sha256` | TC-HASH-001, TC-HASH-002 | Covered |
| NFR-8 | Raw-HTML handling | raw inline HTML → escaped; 0 bytes passthrough | TC-RENDER-005, TC-INJECT-004 | Covered |
| NFR-9 | Task-list isolation | mixing `<ac:task-list>` + regular items → warning | TC-UNSUPPORTED-007 | Covered |
| NFR-10 | Tier purity | `infra/confluence/render/` may import domain; reverse forbidden | TC-BND-001 | Covered (boundary gate) |
| NFR-11 | Dependency scope | remark/rehype installed; mermaid/jsdom/happy-dom NOT | TC-DEP-001 | Covered |
| NFR-12 / NFR-PERF-5 | Conversion latency | ≤200 ms p95 (informational) | — | Deferred (benchmark gate MS-0002 end) |
| NFR-13 | Quality gate | `bun run check` exits 0 | TC-GATE-001 | Covered |
| INV-SEC-1 | No secrets in output | rendered body carries no credential (synthetic fixtures) | TC-INJECT-001 (side-check) | Covered |

## 4. Test Types and Layers

Per `.ai/rules/testing-strategy.md` (§"Test tiers", §"Snapshot rules", §"What
MUST be tested") and the story's Test matrix, this story is exercised at
**Unit**, **Golden-fixture**, and **Integration** tiers. No Mermaid-DOM (no
mermaid render — E4-S1), no BDD (lifecycle invariants owned by E5-S1), no E2E
(no Confluence network — the API write is E3-S4/E3-S6).

| Layer | Applies | Runner | Root directory | Pattern |
|-------|---------|--------|----------------|---------|
| **Unit** | Yes — per-construct renderer behaviors, classifier, hash determinism, parser, bridge, Result shape | `bun:test` | `tests/unit/` mirroring `src/` | `*.test.ts` |
| **Golden-fixture** | Yes (primary for fidelity) — 27 `*.md` + `*.storage.xhtml` byte-stable pairs + consolidated kitchensink | `bun:test` `toMatchSnapshot` + committed fixture files | `tests/golden/` + `tests/golden/fixtures/` | `*.storage.xhtml` snapshots |
| **Integration** | Yes — parse→bridge→canonicalize/hash→render round-trip; XML well-formedness over all rendered bodies | `bun:test` | `tests/integration/` | `*.test.ts` |
| Mermaid-DOM | No | — | — | mermaid render is E4-S1 |
| BDD (Gherkin) | No | — | — | invariants owned by E5-S1 |
| E2E (live-sandbox) | No | — | — | no Confluence network |
| Type-level (compile safety) | Yes — `UnsupportedConstruct` is a pre-existing arm; exhaustiveness unchanged | `bun run typecheck` | — | `tsc --noEmit` gate |

**Test-file layout (mirrors `src/` per testing-strategy.md §"File naming"):**

```
src/domain/markdown/parse.ts            → tests/unit/domain/markdown/parse.test.ts          (Unit — TC-PARSE-*)
src/domain/markdown/mdast-to-hast.ts    → tests/unit/domain/markdown/mdast-to-hast.test.ts   (Unit — TC-BRIDGE-*)
src/domain/markdown/unsupported.ts      → tests/unit/domain/markdown/unsupported.test.ts     (Unit — TC-UNSUPPORTED-*)
src/domain/render/canonicalize.ts       → tests/unit/domain/render/canonicalize.test.ts      (Unit — TC-HASH-*, TC-DETERM-001)
src/infra/confluence/render/storage.ts  → tests/unit/infra/confluence/render/storage.test.ts (Unit — TC-RENDER-*)
                                        tests/golden/storage-renderer.test.ts               (Golden — TC-GOLDEN-001, TC-XML-001)
                                        tests/golden/fixtures/<construct>.md + .storage.xhtml (27 committed pairs)
                                        tests/golden/fixtures/kitchensink.md + .storage.xhtml (consolidated — TC-GOLDEN-002)
                                        tests/integration/markdown/pipeline-roundtrip.test.ts (Integration — TC-ROUND-001, TC-DETERM-001)
                                        tests/integration/markdown/injection-safety.test.ts  (Integration — TC-INJECT-*)
```

> `bunfig.toml` sets `[test] root = "tests"` and a mermaid preload
> (`./tests/mermaid.preload.ts`). The preload registers the happy-dom global
> registrant; it is **harmless for non-mermaid tests** (it only affects tests
> that touch the DOM) and requires no per-file opt-out.

> Tests use the `#domain/*` / `#infra/*` import aliases (package.json
> `"imports"`), NOT deep relative paths (typescript.md §"Tests use import
> aliases"). The golden-fixture suite reads committed `*.md` + `*.storage.xhtml`
> files from disk and drives the REAL renderer over them.

**Over-mocking guardrail compliance (TDR-0004 §"Test-design guardrail").**
Because MarkSync is AI-agent-operable, this is a hard guardrail: the converter
is tested with **REAL fixtures and a REAL XML well-formedness check** — no mocked
parser/renderer, no mocked XML parser. Concretely:

- The 27 golden fixtures are **real `*.md` files** rendered through the **real**
  `parseMarkdown` → `mdastToHast` → `renderStorage` pipeline, byte-compared
  against committed `*.storage.xhtml` snapshots (TC-GOLDEN-001). No construct is
  verified by mocking the renderer.
- The XML well-formedness assertion (AC-F4-3) uses a **real** XML parser / a
  real well-formedness check — never a mocked validator (TC-XML-001). The
  mechanism is an open question (OQ-TP-1) but the guardrail mandates it must not
  be a mock of the converter itself.
- The injection-safety property tests render **real malicious payloads** through
  the real pipeline and assert on the real output (TC-INJECT-*).
- The only permitted "mock-shaped" thing is fault-class construction (e.g.
  hand-building an unsupported-node MDAST to drive the classifier in isolation);
  the classifier is **also** exercised end-to-end through the real parser on real
  Markdown containing the unsupported construct (TC-UNSUPPORTED-006).

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-PARSE-001 | Canonical GFM source → `ok(MdastRoot)` (remark + remark-gfm) | Happy Path | Critical | High | AC-F4-1 (input) |
| TC-PARSE-002 | `sourcePath` provenance flows through `opts` to downstream errors | Corner Case | Important | Medium | F-1, F-5 |
| TC-BRIDGE-001 | MDAST → HAST produces the expected adapter-agnostic HAST for the canonical subset | Happy Path | Critical | High | F-2, AC-F4-1 |
| TC-BRIDGE-002 | Non-canonical node kinds survive the bridge (preserved enough to classify, not lost) | Corner Case | Critical | High | F-2, F-5, AC-F5-1 |
| TC-HASH-001 | Same canonical HAST → identical `sha256` (AC-F3-1) | Happy Path | Critical | High | AC-F3-1, NFR-7 |
| TC-HASH-002 | Two renders of the same input → identical hash | Happy Path | Critical | High | AC-F3-1, NFR-7 |
| TC-HASH-003 | `contentHash` returns lowercase-hex `sha256` (64 hex chars) | Corner Case | Important | Medium | F-3, DM-4 |
| TC-HASH-004 | Canonicalize normalizes attribute order + whitespace → semantically-equal docs hash identically | Corner Case | Critical | High | F-3, NFR-6, DM-2 |
| TC-HASH-005 | Distinct inputs → distinct hashes | Negative | Important | Medium | F-3 |
| TC-RENDER-001 | Fenced code → `<ac:structured-macro ac:name="code">` with `<![CDATA[…]]>` body (AC-F4-2) | Happy Path | Critical | High | AC-F4-2, NFR-2 |
| TC-RENDER-002 | 0 occurrences of `ac:schema-version` / `ac:macro-id` in ANY rendered output | Negative | Critical | High | AC-F4-2, NFR-2 |
| TC-RENDER-003 | `renderStorage` success → `{ body; hash }` Result shape (DM-3) | Happy Path | Critical | High | F-4, DM-3 |
| TC-RENDER-004 | `mermaid`-fenced block detected → emits the code macro like any fence (NG-2) | Corner Case | Important | Medium | F-4, NG-2 |
| TC-RENDER-005 | Raw inline HTML → ESCAPED (supported-but-escaped, DEC-4); 0 bytes passthrough | Corner Case | Critical | High | NFR-8, DEC-4 |
| TC-GOLDEN-001 | 27/27 canonical GFM fixtures byte-match their golden `.storage.xhtml` (AC-F4-1 / NFR-REL-4) | Happy Path | Critical | High | AC-F4-1, NFR-1 |
| TC-GOLDEN-002 | Consolidated `kitchensink.md` renders to a committed `kitchensink.storage.xhtml` matching the spike reference shape | Happy Path | Critical | High | AC-F4-1, F-6 |
| TC-UNSUPPORTED-001 | Footnote → `err(UnsupportedConstruct)` (AC-F5-1) | Negative | Critical | High | AC-F5-1, NFR-4 |
| TC-UNSUPPORTED-002 | Raw-HTML **block** → `err(UnsupportedConstruct)` (AC-F5-1) | Negative | Critical | High | AC-F5-1, NFR-4 |
| TC-UNSUPPORTED-003 | Math node → `err(UnsupportedConstruct)` (AC-F5-1) | Negative | Critical | High | AC-F5-1, NFR-4 |
| TC-UNSUPPORTED-004 | Definition list → `err(UnsupportedConstruct)` (AC-F5-1) | Negative | Critical | High | AC-F5-1, NFR-4 |
| TC-UNSUPPORTED-005 | Never a silent drop — every non-canonical node returns `err` (property) | Negative | Critical | High | AC-F5-1, RSK-1 |
| TC-UNSUPPORTED-006 | `err` carries the matching `construct` + the `sourcePath` from `opts` | Corner Case | Important | Medium | F-5, DM-5 |
| TC-UNSUPPORTED-007 | Task-list + regular-list mixing → a warning (DEC-5, spike rule #3) | Corner Case | Important | Medium | NFR-9, DEC-5 |
| TC-INJECT-001 | Source text containing `<ac:structured-macro>…</ac:structured-macro>` → escaped; 0 injected macros | Negative | Critical | High | AC-F4-4, NFR-5 |
| TC-INJECT-002 | `<script>` fragment in text → escaped; 0 executable content | Negative | Critical | High | AC-F4-4, NFR-5 |
| TC-INJECT-003 | `<ac:parameter>` / `<ac:plain-text-body>` text → escaped | Negative | Critical | High | AC-F4-4, NFR-5 |
| TC-INJECT-004 | Raw `<div>` inline HTML → escaped (DEC-4); 0 bytes passthrough | Negative | Critical | High | AC-F4-4, NFR-8 |
| TC-INJECT-005 | A fenced code block whose body IS those malicious chars → wrapped in the converter's OWN CDATA macro (not an injection) | Corner Case | Critical | High | AC-F4-4, NFR-5 |
| TC-INJECT-006 | Property test — across a payload corpus, output has 0 source-derived `<ac:structured-macro>` + 0 executable content | Negative | Critical | High | AC-F4-4, RSK-2 |
| TC-XML-001 | Every rendered fixture body parses as well-formed XML (AC-F4-3) | Happy Path | Critical | High | AC-F4-3, NFR-3 |
| TC-XML-002 | Entities escaped outside CDATA; tags balanced (AC-F4-3 detail) | Corner Case | Critical | High | AC-F4-3, NFR-3 |
| TC-DETERM-001 | Same input rendered N times → byte-identical (AC-F4-5) | Happy Path | Critical | High | AC-F4-5, NFR-6 |
| TC-ROUND-001 | parse → bridge → canonicalize/hash → render round-trip on the kitchensink (Flow 1) | Happy Path | Critical | High | F-1..F-4, DM-1..3 |
| TC-GATE-001 | `bun run check` exits 0 | Regression | Critical | High | AC-Q-1, NFR-13 |
| TC-BND-001 | dep-cruiser — `infra/confluence/render/` imports domain markdown/render; reverse forbidden | Regression | Critical | High | AC-Q-1, NFR-10 |
| TC-DEP-001 | remark/remark-gfm/rehype/remark-rehype installed; mermaid/jsdom/happy-dom NOT installed | Regression | Important | Medium | NFR-11 |

### 5.2 Scenario Details

#### TC-PARSE-001 - Canonical GFM source → `ok(MdastRoot)` (remark + remark-gfm)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, DM-1, AC-F4-1, NFR-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/parse.test.ts`
**Tags**: @backend

**Preconditions**:
- `remark`, `remark-gfm` installed (NFR-11).

**Steps**:
1. Call `parseMarkdown("# Heading\n\nparagraph with **bold**")`.
2. Assert `result.ok === true`.
3. Assert the returned `MdastRoot` contains a heading node and a paragraph with
   a `strong` child (the canonical GFM subset is recognized — tables,
   strikethrough, task-lists, autolink-literals via remark-gfm).

**Expected Outcome**:
- Canonical GFM parses to a typed `MdastRoot` on the `Result` channel (no throw
  for well-formed input). This is the entry point the bridge consumes.

---

#### TC-PARSE-002 - `sourcePath` provenance flows through `opts` to downstream errors

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-1, F-5, DM-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/parse.test.ts`
**Tags**: @backend

**Steps**:
1. Call `parseMarkdown(bytes, { sourcePath: "docs/page.md" })`, then run the
   pipeline on a source that yields an unsupported node.
2. Assert the resulting `UnsupportedConstruct` error carries
   `sourcePath === "docs/page.md"`.

**Expected Outcome**:
- Provenance flows from parse opts through to classified errors so E3-S6 can
  surface *which document* failed (spec F-1: "`sourcePath` flows through `opts`").

---

#### TC-BRIDGE-001 - MDAST → HAST produces the expected adapter-agnostic HAST for the canonical subset

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, DM-2, AC-F4-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/mdast-to-hast.test.ts`
**Tags**: @backend

**Steps**:
1. `parseMarkdown("# H1\n\n- a\n- b")` → `mdastToHast(mdast)`.
2. Assert the HAST root contains `element` nodes with the expected `tagName`
   (`h1`, `ul`, `li`) — the adapter-agnostic intermediate the renderer walks and
   the canonicalizer hashes.

**Expected Outcome**:
- The bridge yields plain HAST objects the Storage visitor can walk (DEC-6:
  string-builder over plain HAST).

---

#### TC-BRIDGE-002 - Non-canonical node kinds survive the bridge (preserved enough to classify, not lost)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-5, AC-F5-1, RSK-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/mdast-to-hast.test.ts`
**Tags**: @backend

**Steps**:
1. Parse a Markdown source containing a non-canonical construct (e.g. a
   footnote) and run the bridge.
2. Assert the offending node kind is **preserved** in the HAST (not silently
   stripped) so the classifier (F-5) can surface it.

**Expected Outcome**:
- The "never silently dropped" guarantee starts at the bridge: an out-of-subset
  node is retained for classification, not lost in MDAST→HAST.

---

#### TC-HASH-001 - Same canonical HAST → identical `sha256` (AC-F3-1)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, DM-2, DM-4, AC-F3-1, NFR-7, DEC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/render/canonicalize.test.ts`
**Tags**: @backend

**Preconditions**:
- Two HAST inputs that are semantically identical but differ in non-semantic
  ways (attribute order, insignificant whitespace).

**Steps**:
1. `contentHash(canonicalize(hastA))` and `contentHash(canonicalize(hastB))`.
2. Assert the two digests are **identical**.

**Expected Outcome**:
- Canonicalization makes semantically-equal documents hash identically — the
  Content Hash VO contract E3-S5 drift + E4 dedup key on (DEC-3).

---

#### TC-HASH-002 - Two renders of the same input → identical hash

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, F-4, DM-4, AC-F3-1, NFR-7
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/markdown/pipeline-roundtrip.test.ts`
**Tags**: @backend

**Steps**:
1. Run `parseMarkdown → mdastToHast → renderStorage` on the same input twice.
2. Assert both `renderStorage` results report the **identical** `hash`.

**Expected Outcome**:
- Two renders of the same input agree on the hash (AC-F3-1 second clause).

---

#### TC-HASH-003 - `contentHash` returns lowercase-hex `sha256` (64 hex chars)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3, DM-4, DEC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/render/canonicalize.test.ts`
**Tags**: @backend

**Steps**:
1. `contentHash(canonicalize(anyHast))`.
2. Assert the result matches `/^[0-9a-f]{64}$/` (lowercase hex, 64 chars).
3. Assert NO `sha256:` prefix (the wire format is E3-S5's concern — OQ-1).

**Expected Outcome**:
- The function returns the **raw lowercase-hex digest**, not a prefixed string
  (OQ-1 resolution; DEC-3).

---

#### TC-HASH-004 - Canonicalize normalizes attribute order + whitespace → semantically-equal docs hash identically

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, DM-2, NFR-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/render/canonicalize.test.ts`
**Tags**: @backend

**Steps**:
1. Build two HAST trees that differ only in attribute order and insignificant
   whitespace (and presence of source-position metadata).
2. Assert `canonicalize` produces structurally-equal `CanonicalHast` for both
   (sorted attributes, normalized whitespace, no position).

**Expected Outcome**:
- The canonical form is deterministic, so the hash is stable regardless of
  attribute ordering or whitespace (RSK-3 mitigation).

---

#### TC-HASH-005 - Distinct inputs → distinct hashes

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/render/canonicalize.test.ts`
**Tags**: @backend

**Steps**:
1. Hash two semantically-different HAST inputs.
2. Assert the digests **differ**.

**Expected Outcome**:
- The hash is content-sensitive — distinct content yields distinct digests (no
  collision-by-construction bug).

---

#### TC-RENDER-001 - Fenced code → `<ac:structured-macro ac:name="code">` with `<![CDATA[…]]>` body (AC-F4-2)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, DM-3, AC-F4-2, NFR-2, DEC-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/render/storage.test.ts`
**Tags**: @backend

**Preconditions**:
- A fenced code block with a language and a body containing literal `<`/`&`
  (e.g. `if (a < b && c > d)`).

**Steps**:
1. Render the fenced code block.
2. Assert the output contains
   `<ac:structured-macro ac:name="code">`, an
   `<ac:parameter ac:name="language">{lang}</ac:parameter>`, and an
   `<ac:plain-text-body><![CDATA[…]]></ac:plain-text-body>`.
3. Assert the literal `<`/`&` survive **inside** the CDATA unperturbed (spike
   rule #1).

**Expected Outcome**:
- Fenced code emits the converter's own code macro with a CDATA body preserving
  literal characters (spike H6 converter rule #1; AC-F4-2 first clause).

---

#### TC-RENDER-002 - 0 occurrences of `ac:schema-version` / `ac:macro-id` in ANY rendered output

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-2, NFR-2
**Test Type(s)**: Unit (property over all fixtures)
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/render/storage.test.ts` (parameterized over the 27 fixtures)
**Tags**: @backend

**Steps**:
1. For each of the 27 rendered bodies (and the kitchensink), assert the output
   contains **zero** occurrences of the substrings `ac:schema-version` and
   `ac:macro-id`.

**Expected Outcome**:
- The converter never emits the attributes Confluence assigns itself (spike rule
  #1; AC-F4-2 second clause).

---

#### TC-RENDER-003 - `renderStorage` success → `{ body; hash }` Result shape (DM-3)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, DM-3, AC-Q-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/render/storage.test.ts`
**Tags**: @backend

**Steps**:
1. `renderStorage(hast, opts)` on a valid HAST.
2. Assert `result.ok === true`, `result.value.body` is a string, and
   `result.value.hash` is a string (the raw digest).

**Expected Outcome**:
- The success payload realizes the `renderBody → { bodyRepr, hash }` port
  contract (architecture-overview; DM-3).

---

#### TC-RENDER-004 - `mermaid`-fenced block detected → emits the code macro like any fence (NG-2)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, NG-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/render/storage.test.ts`
**Tags**: @backend

**Steps**:
1. Render a ` ```mermaid ` fenced block.
2. Assert it emits the code macro with `language=mermaid` (detected, not
   rendered to image).

**Expected Outcome**:
- The mermaid fence is handled like any fenced block in this story; the SVG/PNG
  render + upload is E4-S1 (NG-2).

---

#### TC-RENDER-005 - Raw inline HTML → ESCAPED (supported-but-escaped, DEC-4); 0 bytes passthrough

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, NFR-8, DEC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/render/storage.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- Source Markdown containing **inline** raw HTML, e.g. a paragraph with
  `<b>raw</b>`.

**Steps**:
1. Render the paragraph.
2. Assert the output contains the **escaped** text (`&lt;b&gt;raw&lt;/b&gt;`)
   and **no** raw `<b>` element passthrough (0 bytes of raw HTML survive).

**Expected Outcome**:
- Raw **inline** HTML is escaped (text preserved, not injected) per DEC-4 —
  distinct from a raw-HTML **block**, which is classified (TC-UNSUPPORTED-002).

---

#### TC-GOLDEN-001 - 27/27 canonical GFM fixtures byte-match their golden `.storage.xhtml` (AC-F4-1 / NFR-REL-4)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-4, F-6, DM-6, AC-F4-1, NFR-1, NFR-REL-4
**Test Type(s)**: Golden fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/storage-renderer.test.ts` (parameterized over `tests/golden/fixtures/`)
**Tags**: @backend

**Preconditions**:
- 27 committed fixture pairs in `tests/golden/fixtures/`: one `<name>.md` +
  one `<name>.storage.xhtml` per canonical GFM construct (see §6 fixture table).

**Steps**:
1. For each of the 27 fixture pairs: read `<name>.md`, run
   `parseMarkdown → mdastToHast → renderStorage`.
2. Assert `result.value.body === read("<name>.storage.xhtml")` **byte-exact**.
3. Additionally assert `toMatchSnapshot` as a second regression layer.

**Expected Outcome**:
- 27/27 canonical GFM constructs survive parse→bridge→render with byte-stable
  Storage output — the NFR-REL-4 fidelity bar (release-blocking). A single
  construct mismatch fails the build.

**Notes / Clarifications**:
- The 27 fixture names and the construct each covers are enumerated in §6
  (Test Data and Fixtures). The exact decomposition into 27 is the coder's
  discretion provided (a) exactly 27 pairs exist, (b) every spike-H6 construct
  row is covered, and (c) the consolidated kitchensink (TC-GOLDEN-002) exercises
  all of them together. Updates are explicit (`bun test --update-snapshots`),
  never automatic in CI (testing-strategy §"Snapshot rules").

---

#### TC-GOLDEN-002 - Consolidated `kitchensink.md` renders to a committed `kitchensink.storage.xhtml` matching the spike reference shape

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, DM-6, AC-F4-1
**Test Type(s)**: Golden-fixture (integration-weight)
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/storage-renderer.test.ts`
**Tags**: @backend

**Preconditions**:
- A committed `tests/golden/fixtures/kitchensink.md` exercising all 27 constructs
  in one document; a committed `kitchensink.storage.xhtml` (the rendered output,
  reviewed against `doc/inception/tmp/confluence-api-validation-spike/examples/pages/storage-kitchensink.xml`).

**Steps**:
1. Render `kitchensink.md` through the full pipeline.
2. Assert byte-exact match against `kitchensink.storage.xhtml`.
3. Assert the rendered body's construct shapes match the spike reference
  (headings, `<s>`/`<del>`, escaped-`&amp;` links, remote + attachment
  `<ac:image>`, nested `<ul>`/`<ol>`, `<ac:task-list>`, blockquote, `python`
  code macro with CDATA, `<hr/>`, GFM table) — modulo the spike attributes
  Confluence auto-fills (`ac:schema-version`/`ac:macro-id`), which this story
  OMITS.

**Expected Outcome**:
- The consolidated document — the spike's `storage-kitchensink.xml` translated to
  a Markdown source + a MarkSync-rendered snapshot — round-trips byte-stably,
  proving the constructs compose, not just in isolation.

---

#### TC-UNSUPPORTED-001 - Footnote → `err(UnsupportedConstruct)` (AC-F5-1)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, DM-5, AC-F5-1, NFR-4, DEC-2, RSK-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/unsupported.test.ts`
**Tags**: @backend

**Preconditions**:
- A Markdown source containing a footnote (a non-GFM extension with no native
  Storage representation).

**Steps**:
1. Run the pipeline on the source.
2. Assert `result.ok === false` and `error.kind === "UnsupportedConstruct"`.
3. Assert `error.construct` names the offending node kind.

**Expected Outcome**:
- A footnote is classified, not silently dropped — the brand-defining
  no-silent-drop guarantee (RSK-1).

---

#### TC-UNSUPPORTED-002 - Raw-HTML **block** → `err(UnsupportedConstruct)` (AC-F5-1)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, DM-5, AC-F5-1, NFR-4, DEC-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/unsupported.test.ts`
**Tags**: @backend

**Preconditions**:
- A Markdown source containing a raw-HTML **block** (e.g. a `<div>…</div>` on
  its own lines, intended to pass through).

**Steps**:
1. Run the pipeline.
2. Assert `err(UnsupportedConstruct)`.

**Expected Outcome**:
- A raw-HTML **block** is classified (the CSF sanitizer would strip it — spike
  H6). This is distinct from raw **inline** HTML, which is escaped
  (TC-RENDER-005 / DEC-4).

---

#### TC-UNSUPPORTED-003 - Math node → `err(UnsupportedConstruct)` (AC-F5-1)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, DM-5, AC-F5-1, NFR-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/unsupported.test.ts`
**Tags**: @backend

**Steps**:
1. Run the pipeline on a source with a math construct (no native Storage
   representation).
2. Assert `err(UnsupportedConstruct)`.

**Expected Outcome**:
- Math is classified, never silently dropped.

---

#### TC-UNSUPPORTED-004 - Definition list → `err(UnsupportedConstruct)` (AC-F5-1)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, DM-5, AC-F5-1, NFR-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/unsupported.test.ts`
**Tags**: @backend

**Steps**:
1. Run the pipeline on a source with a definition list.
2. Assert `err(UnsupportedConstruct)`.

**Expected Outcome**:
- A definition list (no native Storage representation) is classified.

---

#### TC-UNSUPPORTED-005 - Never a silent drop — every non-canonical node returns `err` (property)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, DM-5, AC-F5-1, NFR-4, RSK-1
**Test Type(s)**: Unit (property)
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/unsupported.test.ts`
**Tags**: @backend

**Preconditions**:
- A corpus of non-canonical node kinds (footnote, raw-HTML block, math,
  definition list, app content).

**Steps**:
1. For each non-canonical kind, run the pipeline.
2. Assert **every** one returns `err(UnsupportedConstruct)` — none return `ok`
   with the node missing from the body.

**Expected Outcome**:
- The "do not silently degrade" obligation (ADR-0005) is enforced: there is no
  input path where an unsupported construct vanishes from the output without a
  signal.

---

#### TC-UNSUPPORTED-006 - `err` carries the matching `construct` + the `sourcePath` from `opts`

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-5, DM-5, DEC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/unsupported.test.ts`
**Tags**: @backend

**Steps**:
1. Run the pipeline with `sourcePath: "docs/x.md"` on a source with an
   unsupported node.
2. Assert `error.construct` is a non-empty string identifying the kind and
   `error.sourcePath === "docs/x.md"`.

**Expected Outcome**:
- The pre-existing `UnsupportedConstruct { construct; sourcePath }` arm is
  populated correctly (DEC-2 — first-produced, not redefined).

---

#### TC-UNSUPPORTED-007 - Task-list + regular-list mixing → a warning (DEC-5, spike rule #3)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-4, NFR-9, DEC-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/render/storage.test.ts`
**Tags**: @backend

**Preconditions**:
- A document that mixes an `<ac:task-list>` with regular `<li>` items in the same
  block (unrepresentable per spike H6 converter rule #3).

**Steps**:
1. Render the document.
2. Assert a warning is emitted (the construct is flagged, not silently rendered
   wrong).

**Expected Outcome**:
- Task-list + regular-list mixing surfaces a warning (DEC-5) — the converter
  refuses to silently produce incorrect output.

---

#### TC-INJECT-001 - Source text containing `<ac:structured-macro>…</ac:structured-macro>` → escaped; 0 injected macros

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, F-7, AC-F4-4, NFR-5, NFR-SEC-5, RSK-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/markdown/injection-safety.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- A Markdown source whose **text** contains the literal string
  `<ac:structured-macro ac:name="code">…</ac:structured-macro>` (a macro-injection
  payload).

**Steps**:
1. Run the full pipeline on the source.
2. Assert the output contains **zero** `<ac:structured-macro>` elements derived
   from the source text (the text is entity-escaped: `&lt;ac:structured-macro…`).

**Expected Outcome**:
- Malicious text cannot inject a server-side macro from source (NFR-SEC-5). The
  only `<ac:structured-macro>` in any output is the converter's **own** code-macro
  emission from a fenced code block (see TC-INJECT-005).

---

#### TC-INJECT-002 - `<script>` fragment in text → escaped; 0 executable content

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, F-7, AC-F4-4, NFR-5, NFR-SEC-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/markdown/injection-safety.test.ts`
**Tags**: @backend, @security

**Steps**:
1. Run the pipeline on a source whose text contains `<script>alert(1)</script>`.
2. Assert the output contains **no** `<script>` element — the text is escaped
   (`&lt;script&gt;…`); 0 executable content survives.

**Expected Outcome**:
- Script-injection payloads are inert in the rendered body.

---

#### TC-INJECT-003 - `<ac:parameter>` / `<ac:plain-text-body>` text → escaped

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, F-7, AC-F4-4, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/markdown/injection-safety.test.ts`
**Tags**: @backend, @security

**Steps**:
1. Run the pipeline on a source whose text contains `<ac:parameter ac:name="language">js</ac:parameter>`
   and `<ac:plain-text-body>…</ac:plain-text-body>`.
2. Assert both are escaped in the output; no macro sub-elements are injected
   from source.

**Expected Outcome**:
- Macro sub-element payloads cannot assemble a server-side macro from source
  text.

---

#### TC-INJECT-004 - Raw `<div>` inline HTML → escaped (DEC-4); 0 bytes passthrough

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-4, NFR-8, DEC-4
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/markdown/injection-safety.test.ts`
**Tags**: @backend, @security

**Steps**:
1. Run the pipeline on a source with raw inline `<div>`/`<span>` HTML.
2. Assert the output contains the escaped text and 0 bytes of raw HTML
   passthrough.

**Expected Outcome**:
- Raw inline HTML is escaped (DEC-4), closing the injection surface for
  arbitrary HTML elements.

---

#### TC-INJECT-005 - A fenced code block whose body IS those malicious chars → wrapped in the converter's OWN CDATA macro (not an injection)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, F-7, AC-F4-4, NFR-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/markdown/injection-safety.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- A fenced code block whose body literally is `<ac:structured-macro ac:name="code">…</ac:structured-macro>`.

**Steps**:
1. Run the pipeline.
2. Assert the output contains exactly **one** `<ac:structured-macro>` — the
   converter's own code macro wrapping the body in CDATA; the payload inside the
   CDATA is the literal text (inert, not parsed as a macro).

**Expected Outcome**:
- A code fence around a malicious payload is the converter **emitting** (its own
  CDATA macro), not **injecting** from source (spec Flow 3). The CDATA boundary
  keeps the payload inert.

---

#### TC-INJECT-006 - Property test — across a payload corpus, output has 0 source-derived `<ac:structured-macro>` + 0 executable content

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, F-7, AC-F4-4, NFR-5, RSK-2
**Test Type(s)**: Integration (property)
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/markdown/injection-safety.test.ts`
**Tags**: @backend, @security

**Preconditions**:
- A corpus of malicious payloads (macro text, `<script>`, `<ac:parameter>`,
  `<ac:plain-text-body>`, raw `<div>`/`<span>` inline, attribute-injection
  variants) placed in **paragraph text** (not in a code fence).

**Steps**:
1. For each payload, render through the pipeline.
2. Assert the output has **0** `<ac:structured-macro>` derived from source and
   **0** `<script>` / executable content.

**Expected Outcome**:
- The injection-safety property (NFR-SEC-5) holds across a corpus, not just the
  enumerated payloads — defense against a regression that re-opens the surface.

---

#### TC-XML-001 - Every rendered fixture body parses as well-formed XML (AC-F4-3)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-3, NFR-3, RSK-7
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/storage-renderer.test.ts` (parameterized over the 27 + kitchensink)
**Tags**: @backend

**Preconditions**:
- An XML well-formedness check is available (see OQ-TP-1 for the mechanism
  decision; the guardrail requires a **real** check, not a mock of the converter).

**Steps**:
1. For each of the 27 rendered bodies and the kitchensink, parse the body with
   the XML check.
2. Assert **all** parse without error (0 unbalanced tags).

**Expected Outcome**:
- Every rendered body is well-formed XML — the ADR-0005 C-3 / spike rule #2
  obligation that prevents HTTP 400 on publish (RSK-7).

---

#### TC-XML-002 - Entities escaped outside CDATA; tags balanced (AC-F4-3 detail)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-3, NFR-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/storage-renderer.test.ts`
**Tags**: @backend

**Steps**:
1. Render bodies containing `&`, `<`, `>` in text and in link URLs.
2. Assert entities are escaped **outside** CDATA (`&amp;`, `&lt;`, `&gt;`) and
   literal **inside** CDATA (code bodies).
3. Assert all tags balance (the well-formedness check confirms structure).

**Expected Outcome**:
- The entity-escaping boundary is exactly the CDATA boundary — escaped text
  outside, literal inside code bodies (spike rule #2).

---

#### TC-DETERM-001 - Same input rendered N times → byte-identical (AC-F4-5)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, F-4, DM-6, AC-F4-5, NFR-6, RSK-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/markdown/pipeline-roundtrip.test.ts`
**Tags**: @backend

**Steps**:
1. Render the same input N times (N ≥ 5; include the kitchensink).
2. Assert every run produces **byte-identical** output (0 bytes diff) and the
   golden snapshot never regenerates implicitly.

**Expected Outcome**:
- The renderer is deterministic — same input → byte-identical output across runs
  (ADR-0002 C-1 analogue; RSK-3 mitigation). Snapshot updates are an explicit,
  reviewed `--update-snapshots` action.

---

#### TC-ROUND-001 - parse → bridge → canonicalize/hash → render round-trip on the kitchensink (Flow 1)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-3, F-4, DM-1, DM-2, DM-3, DM-4, AC-F4-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/markdown/pipeline-roundtrip.test.ts`
**Tags**: @backend

**Preconditions**:
- The kitchensink Markdown fixture (all 27 constructs).

**Steps**:
1. `parseMarkdown → mdastToHast → canonicalize → contentHash → renderStorage`.
2. Assert each stage's `Result` is `ok`; assert `renderStorage` returns
   `{ body, hash }` with `body` byte-matching `kitchensink.storage.xhtml` and
   `hash` matching `contentHash(canonicalize(hast))`.

**Expected Outcome**:
- The full pipeline composes end-to-end (spec Flow 1) — the contract E3-S6 wires
  into the push flow.

---

#### TC-GATE-001 - `bun run check` exits 0

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: AC-Q-1, NFR-13
**Test Type(s)**: Gate
**Automation Level**: Automated
**Target Layer / Location**: repo root
**Tags**: @backend

**Steps**:
1. `bun run check` (lint + format:check + typecheck + test + check:boundaries).
2. Assert exit 0.

**Expected Outcome**:
- All quality gates pass.

---

#### TC-BND-001 - dep-cruiser — `infra/confluence/render/` imports domain markdown/render; reverse forbidden

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-Q-1, NFR-10
**Test Type(s)**: Boundary gate
**Automation Level**: Automated
**Target Layer / Location**: `bun run check:boundaries`
**Tags**: @backend

**Steps**:
1. Run dep-cruiser.
2. Assert no tier violation: `src/infra/confluence/render/storage.ts` may import
   `src/domain/markdown/*` and `src/domain/render/*` types; `src/domain/markdown/*`
   and `src/domain/render/*` import **nothing** upward (DEC-1 — the adapter-agnostic
   intermediates stay domain-side; only the final visitor is infra-side).

**Expected Outcome**:
- The dependency-direction matrix holds (typescript.md tier matrix;
  architecture-overview §"Module-residence rules").

---

#### TC-DEP-001 - remark/remark-gfm/rehype/remark-rehype installed; mermaid/jsdom/happy-dom NOT installed

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: NFR-11
**Test Type(s)**: Gate (side-check on `package.json` + lock)
**Automation Level**: Automated
**Target Layer / Location**: repo root
**Tags**: @backend

**Steps**:
1. Assert `package.json` lists `remark`, `remark-gfm`, `rehype`, `remark-rehype`
   as (runtime) dependencies.
2. Assert `package.json` does **NOT** list `mermaid`, `jsdom`, or `happy-dom`
   (those are E4-S1).

**Expected Outcome**:
- The dependency scope is exactly the unified Markdown ecosystem (NG-2 / NG-8;
  NFR-11).

---

## 6. Environments and Test Data

### 6.1 The 27 canonical GFM golden fixtures

`tests/golden/fixtures/` holds **27** committed `<name>.md` +
`<name>.storage.xhtml` pairs — one per canonical GFM construct derived from the
spike H6 table (`atlassian-api-spike-findings.md` lines 17-41) and the
`storage-kitchensink.xml` reference. The spike proved 27 constructs survive the
Storage round-trip; this fixture set is the Markdown→Storage half of that proof.

The exact decomposition into 27 is the coder's discretion provided (a) exactly
27 pairs exist, (b) every spike-H6 row is covered, and (c) the kitchensink
(TC-GOLDEN-002) composes them. The reference decomposition:

| # | Fixture base name | Markdown construct | Storage target (spike H6) |
|---|-------------------|--------------------|---------------------------|
| 1 | `heading-h1` | `# H1` | `<h1>` |
| 2 | `heading-h2` | `## H2` | `<h2>` |
| 3 | `heading-h3` | `### H3` | `<h3>` |
| 4 | `heading-h4` | `#### H4` | `<h4>` |
| 5 | `heading-h5` | `##### H5` | `<h5>` |
| 6 | `heading-h6` | `###### H6` | `<h6>` |
| 7 | `inline-strong` | `**bold**` | `<strong>` |
| 8 | `inline-em` | `*italic*` | `<em>` |
| 9 | `inline-strong-em` | `**bold *and italic***` | `<strong>…<em>…</em>…</strong>` (nested) |
| 10 | `inline-strikethrough` | `~~strike~~` | `<s>` (or `<del>` — coder picks ONE deterministically; snapshot pins it) |
| 11 | `inline-code` | `` `code` `` | `<code>` |
| 12 | `inline-subscript` | `~sub~` | `<sub>` (see OQ-TP-2 — parser support) |
| 13 | `inline-superscript` | `^sup^` | `<sup>` (see OQ-TP-2 — parser support) |
| 14 | `link-plain` | `[t](url)` | `<a href="url">t</a>` |
| 15 | `link-query-ampersand` | `[t](url?q=1&r=2)` | `<a href="url?q=1&amp;r=2">t</a>` (entity preserved) |
| 16 | `link-autolink-literal` | bare URL `https://example.com` | `<a href="…">…</a>` (remark-gfm autolink-literal) |
| 17 | `image-remote` | `![alt](https://…/x.png)` | `<ac:image ac:alt="alt"><ri:url ri:value="…"/></ac:image>` |
| 18 | `image-attachment` | `![alt](./diagram.png)` | `<ac:image><ri:attachment ri:filename="diagram.png"/></ac:image>` |
| 19 | `list-unordered` | `- a\n- b` | `<ul><li>…` |
| 20 | `list-ordered-nested` | `1. one\n   1. nested` | `<ol>` with nested `<ul>`/`<ol>` |
| 21 | `task-list-incomplete` | `- [ ] todo` | `<ac:task-list>…<ac:task-status>incomplete</ac:task-status>…` |
| 22 | `task-list-complete` | `- [x] done` | `<ac:task-list>…<ac:task-status>complete</ac:task-status>…` |
| 23 | `blockquote` | `> quote` | `<blockquote><p>…</p></blockquote>` |
| 24 | `fenced-code-python` | ` ```python\\ndef f():\\n  pass\\n``` ` | `<ac:structured-macro ac:name="code">` + `<ac:parameter language>` + `<![CDATA[…]]>` |
| 25 | `horizontal-rule` | `---` | `<hr/>` |
| 26 | `gfm-table` | pipe table | `<table><thead>…<tbody>…` |
| 27 | `paragraph` | plain text block | `<p>…</p>` |

Plus the consolidated pair:

| Fixture | Purpose |
|---------|---------|
| `kitchensink.md` + `kitchensink.storage.xhtml` | All 27 constructs in one document; reviewed against the spike `storage-kitchensink.xml` (TC-GOLDEN-002). |

### 6.2 Injection / malicious-input corpus

The `tests/integration/markdown/injection-safety.test.ts` corpus (NFR-SEC-5):

| Payload | Where in source | Expected |
|---------|-----------------|----------|
| `<ac:structured-macro ac:name="code">…</ac:structured-macro>` | paragraph text | escaped; 0 injected macros |
| `<ac:parameter ac:name="language">js</ac:parameter>` | paragraph text | escaped |
| `<ac:plain-text-body>…</ac:plain-text-body>` | paragraph text | escaped |
| `<script>alert(1)</script>` | paragraph text | escaped; 0 executable content |
| `<div>raw</div>` / `<span>x</span>` | inline in a paragraph | escaped (DEC-4); 0 bytes passthrough |
| attribute-injection (`"><ac:structured-macro>`) | link text / inline | escaped; 0 injected macros |
| The above payloads **inside** a ` ``` ` fence | fenced code body | wrapped in the converter's OWN CDATA macro (TC-INJECT-005) — inert, not an injection |

### 6.3 Environment

- Bun (pinned per release); `bun:test`; `bunfig.toml` `[test] root = "tests"` +
  mermaid preload (harmless for non-mermaid tests).
- No network (the API write is E3-S4/E3-S6).
- No live Confluence (E2E is a separate gate, out of scope).
- Golden fixtures committed (reviewed-on-change); snapshot updates explicit.

## 7. Automation Plan and Implementation Mapping

| TC ID(s) | Test file | Status | Notes |
|----------|-----------|--------|-------|
| TC-PARSE-001..002 | `tests/unit/domain/markdown/parse.test.ts` | To Implement | Real `remark`/`remark-gfm`; `#domain/markdown/parse` alias |
| TC-BRIDGE-001..002 | `tests/unit/domain/markdown/mdast-to-hast.test.ts` | To Implement | Real `remark-rehype` |
| TC-HASH-001..005 | `tests/unit/domain/render/canonicalize.test.ts` | To Implement | Native `crypto` (`sha256`); no crypto lib |
| TC-RENDER-001..005 | `tests/unit/infra/confluence/render/storage.test.ts` | To Implement | Real renderer over real HAST; inline snapshots for short bodies |
| TC-GOLDEN-001, TC-XML-001..002 | `tests/golden/storage-renderer.test.ts` | To Implement | Parameterized over `tests/golden/fixtures/`; reads committed `.md` + `.storage.xhtml`; byte-exact + `toMatchSnapshot` + XML check |
| TC-GOLDEN-002 | `tests/golden/storage-renderer.test.ts` (kitchensink block) | To Implement | Reviewed against spike `storage-kitchensink.xml` |
| TC-UNSUPPORTED-001..007 | `tests/unit/domain/markdown/unsupported.test.ts` | To Implement | Emits the **pre-existing** `UnsupportedConstruct` arm |
| TC-INJECT-001..006 | `tests/integration/markdown/injection-safety.test.ts` | To Implement | Real malicious payloads through the real pipeline |
| TC-DETERM-001, TC-ROUND-001 | `tests/integration/markdown/pipeline-roundtrip.test.ts` | To Implement | parse→bridge→canonicalize/hash→render |
| TC-GATE-001 | repo root (`bun run check`) | Existing (gate) | Exits 0 once tests land |
| TC-BND-001 | `bun run check:boundaries` | Existing (gate) | dep-cruiser tier rules |
| TC-DEP-001 | repo root (`package.json` side-check) | To Implement | Asserts dep scope |

**Execution:** `bun test tests/unit/ tests/integration/ tests/golden/` (the CI
fast-loop set per testing-strategy §"CI wiring"). Snapshot updates via
`bun test --update-snapshots` — explicit, reviewed, never in CI.

**Mocking requirements:** none beyond fault-class construction for the
classifier unit tests (hand-built unsupported-node MDAST); every test exercises
the real parser/bridge/renderer/hash. The XML well-formedness check is a real
check (OQ-TP-1), not a mock.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Mitigation |
|------|------------|
| The converter is tested by the same agent that wrote it → a hand-written XML check could share the converter's blind spot (over-mocking guardrail). | The well-formedness check MUST be independent of the converter's emission path; prefer a real parser (OQ-TP-1). The golden byte-match is an independent oracle (the committed `.storage.xhtml`). |
| `remark`/`rehype` major-version drift changes MDAST/HAST shape → golden churn across releases. | Pin major versions; exact lock committed; re-baseline snapshots as an explicit reviewed action (testing-strategy §"Snapshot rules"; RSK-4). |
| Sub/sup (`<sub>`/`<sup>`) may not be reachable from canonical `remark-gfm` Markdown (see OQ-TP-2). | Flagged as OQ-TP-2; the coder resolves before/ during implementation (plugin, alternate source, or deferral). The 27-count assumes resolution in scope per spec F-4. |
| The kitchensink parity (TC-GOLDEN-002) compares against a spike-authored reference that Confluence normalises (self-closing whitespace, auto-filled macro attrs). | The MarkSync `kitchensink.storage.xhtml` snapshot is the rendered output reviewed against the spike reference **modulo** the omitted `ac:schema-version`/`ac:macro-id` (this story omits them — spike rule #1). |
| A genuinely malformed Markdown input is hard to construct (remark is permissive). | The parser's negative path is light by design (most input parses); the load-bearing negatives are the classifier (TC-UNSUPPORTED-*) and injection (TC-INJECT-*), not parse failure. |

### 8.2 Assumptions

- ADR-0005 (Storage, not ADF) is settled and being implemented; spike H6 is
  authoritative for the 27-construct mapping + the 3 converter rules.
- `Result<T,E>` and the pre-existing `UnsupportedConstruct` arm are stable and
  reused unchanged (DEC-2 — no new error kind).
- `remark`, `remark-gfm`, `rehype`, `remark-rehype` install cleanly under Bun;
  `mermaid`/`jsdom`/`happy-dom` are out of scope (E4-S1).
- The `storage-kitchensink.xml` reference is the target shape; per-construct
  snapshots derive from it and are reviewed on change.
- Native `crypto` provides `sha256` (typescript.md "No crypto library").
- `bunfig.toml` `[test] root = "tests"` and the mermaid preload are in effect;
  the preload is harmless for non-mermaid tests.

### 8.3 Open Questions

| ID | Question | Blocking? | Owner | Notes |
|----|----------|-----------|-------|-------|
| OQ-TP-1 | Which mechanism asserts XML well-formedness (AC-F4-3)? Bun has no built-in XML parser; `xmldom`/`jsdom` are out of scope (NG-8 / E4-S1). | Yes (blocks TC-XML-001 sign-off) | `@plan-writer` / `@coder` | The TEST PLAN commits to the **assertion** ("every rendered body parses as well-formed XML; 0 unbalanced tags; entities escaped outside CDATA") and to the guardrail (a **real** check, not a mock of the converter). Concrete options for the coder: (a) a small, separately-tested well-formedness helper (tag-balance + entity/CDATA-boundary + `ac:`/`ri:` namespace-aware element matching) validated against known-good and known-bad XML; (b) a zero-dependency pure-JS DOMParser such as `linkedom` (neither `xmldom` nor `jsdom` — scope-check against NFR-11; justify the dep if chosen). The over-mocking guardrail mandates the check be independent of the converter's emission logic. |
| OQ-TP-2 | How are `<sub>`/`<sup>` produced from Markdown? Spike H6 maps `~sub~`/`^sup^` → `<sub>`/`<sup>`, but `remark-gfm` does not parse subscript/superscript syntax. | Yes (blocks fixtures #12/#13) | `@coder` | Options: (a) add a `remark-sub-super`-style plugin (scope-check against NFR-11's "remark/remark-gfm/rehype/remark-rehype installed" — a 5th dep needs justification); (b) author the sub/sup fixtures from a construct the chosen parser actually emits; (c) defer sub/sup and re-baseline the 27-count. Spec F-4 lists `<sub>`/`<sup>` in the mapping, so (a)/(b) are preferred; resolve before implementation. |
| OQ-TP-3 | Does the strikethrough fixture pin `<s>` or `<del>`? Spike H6 says "both work"; the converter must pick ONE deterministically. | No | `@coder` | The golden snapshot pins whichever the converter emits; the choice is documented at the load-bearing point in the visitor. Not blocking — determinism is the requirement, not a specific tag. |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | test-plan-writer (ADOS) | Initial test plan — Unit + Golden-fixture + Integration tiers; 27 fixtures; AC-F4-1..AC-Q-1 mapped; OQ-TP-1 (XML mechanism) + OQ-TP-2 (sub/sup parser) flagged. |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| _(populated during execution)_ | | | |
