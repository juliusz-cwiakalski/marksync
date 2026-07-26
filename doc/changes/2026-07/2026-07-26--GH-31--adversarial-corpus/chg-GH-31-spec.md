---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/change-spec-template.md
ados_distribution: redistributable
change:
  ref: GH-31
  type: feat
  status: Proposed
  slug: adversarial-corpus
  title: "[MS2-E5-S3] Adversarial public corpus + unsupported-node classification"
  owners: ["@cwiakalski"]
  service: marksync-cli
  labels: ["feature", "MS-0002", "MS2-E5", "priority:medium", "test", "corpus", "docs"]
  version_impact: patch
  audience: mixed
  security_impact: low
  risk_level: low
  dependencies:
    internal: [markdown-pipeline, storage-renderer, unsupported-node-classifier, testing-strategy]
    external: [Confluence Cloud Storage Format macro vocabulary (referenced as fixture source only)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Publish a sanitized adversarial corpus plus a classification runner that regression-locks the converter's unsupported-node handling and conversion fidelity against real-world content the canonical GFM subset excludes, and publish a user-facing classification of how every unsupported construct is handled — so ADR-0005's "do not silently degrade" guarantee and NFR-REL-4 fidelity hold against realistic, not just synthetic-GFM, content.

## 1. SUMMARY

This change delivers a sanitized **adversarial test corpus** under `tests/adversarial/` (synthetic `*.md` sources plus committed `*.classification.json` expected-classification sidecars) covering content categories the canonical GFM subset excludes — nested tables, Confluence macros and app/gliffy content, emoji, very long pages, mixed task/regular lists, and raw HTML. A **classification runner** (at `tests/golden/adversarial/*.test.ts` — golden tier; corpus fixtures stay at `tests/adversarial/` per DEC-5) runs each corpus document through the real Markdown pipeline (parse → MDAST→HAST → unsupported-node classify → `renderStorage`) and asserts three things: (a) fidelity — supported constructs convert correctly (NFR-REL-4); (b) no silent drop — every unsupported node is classified (ADR-0005 / F-5); (c) drift stability — classifying the same corpus twice yields byte-identical output (determinism). A **user-facing classification doc** is published at `doc/quality/adversarial-corpus-classification.md`. The single `src/` change is an additive **collect-all classifier variant** (`findAllUnsupported`), because the existing `findUnsupported` returns only the first unsupported node and cannot satisfy the "every unsupported node enumerated" assertion (DEC-1). The corpus is **synthetic** (no real design-partner pages exist pre-launch); sanitization is by construction plus an automated PII self-audit grep (DEC-4).

## 2. CONTEXT

### 2.1 Current State Snapshot

The Markdown pipeline (delivered — GH-20, GH-25, GH-63, GH-77) is the load-bearing context:

- **Unsupported-node classifier** (`src/domain/markdown/unsupported.ts`) exposes `classifyUnsupported(node, sourcePath)` (single node) and `findUnsupported(root, sourcePath)` which walks the tree depth-first and returns the **first** unsupported node's `MarkSyncError`, or `null` if clean. A non-allow-listed element tag yields `UnsupportedConstruct: <tag>`; a `raw` node that is a direct child of the root yields `UnsupportedConstruct: raw-html-block`. This is the **fast-fail** path consumed by `renderStorage`: the first unsupported node aborts the page render. The allow-list (`ALLOWED_TAGS`) and the raw-block detection are the single source of classification truth.
- **Render fidelity** is locked by 33 golden `.md`/`.storage.xhtml` fixture pairs under `tests/golden/fixtures/markdown/` (the remark-gfm-reachable subset). The golden runner byte-matches each pair.
- **No-silent-drop carve-out (GH-77):** the classifier never silently drops a *rendering* construct; only non-rendering annotations (front-matter, HTML comments, link-reference comments) are stripped at parse time. This is the F-5 invariant ADR-0005 mandates.
- The pipeline is **one-way Markdown→Storage** for MS-0002; the canonical GFM subset is fixed (per-construct expansion is an MS-0003+ decision).

### 2.2 Pain Points / Gaps

- **The converter's unsupported-node handling is only exercised against synthetic GFM.** Real-world design-partner content carries categories the canonical GFM subset excludes (macros, nested tables, app content, emoji, very long pages, mixed task/regular lists, raw HTML). There is no regression suite that adversarially stress-tests classification and fidelity against such content.
- **`findUnsupported` returns only the first unsupported node**, so a corpus fixture with several unsupported constructs cannot assert that *every* one is enumerated — the runner has no way to prove "none missing, none extra" without a collect-all path.
- **No published classification tells users how unsupported nodes are handled.** Users authoring content with macros/HTML have no reference for what MarkSync will escape, flag, or require a manual macro for.
- **No PII guardrail for committed test content.** Although the corpus is synthetic, there is no automated check that no email/ID/internal-ticket-URL patterns slipped into a committed fixture.

## 3. PROBLEM STATEMENT

Because the unsupported-node classifier and conversion fidelity are only exercised against synthetic GFM golden fixtures, a future converter or classifier change could silently regress how it handles real-world content (macros, nested tables, raw HTML, emoji, scale) without any test catching it, and because there is no published classification, users cannot predict how their non-GFM content will be treated — so MarkSync's "no silent drop" promise and fidelity guarantee are unproven against the content authors actually write.

## 4. GOALS

- **G-1**: A sanitized adversarial corpus covering every real-world content category the canonical GFM subset excludes (AC-F1-1).
- **G-2**: A classification runner that, per corpus document, proves fidelity (supported constructs convert correctly), no silent drop (every unsupported node classified), and drift stability (deterministic classification output).
- **G-3**: A published user-facing classification doc mapping unsupported node type → MarkSync handling.
- **G-4**: An additive collect-all classifier variant that enables exhaustive enumeration without changing the existing fast-fail render path.
- **G-5**: A clean automated PII self-audit across all committed corpus artifacts.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Corpus category coverage | 100% of the category list (AC-F1-1) |
| Unsupported nodes silently dropped in the corpus | 0 (every one enumerated in its sidecar) |
| Classification determinism (run twice) | byte-identical output, 0 diffs |
| Supported constructs mis-converted in the corpus | 0 (render succeeds; golden byte-match where committed) |
| PII self-audit matches across committed corpus artifacts | 0 |
| `bun run check` | green |

### 4.2 Non-Goals

- **NG-1**: No expansion of the canonical GFM subset to support more constructs — that is a per-construct MS-0003+ decision informed by this corpus's findings (story "Out of scope").
- **NG-2**: No change to the existing `findUnsupported` / `classifyUnsupported` behavior — they remain the fast-fail render path (DEC-1).
- **NG-3**: No change to the sync-state three-way `classify()` in `src/domain/state/classifier.ts` — "drift stability" here means classification determinism, not sync drift (DEC-3).
- **NG-4**: No design-partner recruitment or ingestion of real pages (separate track; the corpus is synthetic — DEC-4).
- **NG-5**: No reverse conversion (Confluence Storage → Markdown).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Sanitized adversarial corpus | Real-world content categories (macros, nested tables, app content, emoji, long pages, mixed lists, raw HTML) must be exercised, not just synthetic GFM |
| F-2 | Collect-all classifier variant | The existing fast-fail classifier returns only the first unsupported node; exhaustive enumeration needs a collect-all path that reuses the same allow-list |
| F-3 | Classification runner (fidelity + no-drop + determinism) | Three independent assertions per corpus document lock the converter's behavior against realistic content |
| F-4 | Published user-facing classification doc | Users must be able to predict how non-GFM content is handled (escaped / UnsupportedConstruct / requires manual macro) |
| F-5 | PII self-audit | Committed synthetic corpus must be provably free of email/ID/internal-ticket-URL patterns |

### 5.1 Capability Details

**F-1: Sanitized adversarial corpus**
A set of synthetic fixtures under `tests/adversarial/`, each a `*.md` source paired with a committed, reviewed `*.classification.json` sidecar that records the expected classification of that document. Categories covered (AC-F1-1): nested tables; at least three macro/app-content categories; emoji; at least one long page (≥50 KB or ≥1000 lines — an absolute scale floor to exercise NFR-PERF-5); mixed task/regular lists; raw HTML. The corpus is synthetic by construction (DEC-4) — authored to represent each real-world category without real PII entering the source.

**F-2: Collect-all classifier variant**
A new export in the unsupported-node classifier module that walks the HAST tree depth-first and collects **all** unsupported nodes (not just the first), returning the full list of `MarkSyncError`. It reuses the existing allow-list and raw-block detection logic verbatim, so its classification verdict is identical to the existing classifier on a per-node basis — it simply does not stop at the first hit. The existing `findUnsupported` (first-only) and `classifyUnsupported` (single-node) behavior is **unchanged**; they remain the fast-fail path consumed by the render pipeline. The collect-all variant is consumed by the runner, not wired into render.

**F-3: Classification runner (fidelity + no-drop + determinism)**
A golden-tier test that loads each corpus document and runs it through the real Markdown pipeline (parse → MDAST→HAST → unsupported-node classify → `renderStorage`), asserting three independent properties: (a) **fidelity** — supported constructs convert correctly (`renderStorage` succeeds; for fixtures with a committed golden `.storage.xhtml`, byte-match); (b) **no silent drop** — the emitted classification equals the committed sidecar exactly (every unsupported node enumerated, none missing, none extra); (c) **drift stability** — classifying the same corpus twice yields byte-identical classification output (determinism, not sync drift — DEC-3). It mirrors the existing golden runner pattern (real parser/bridge/renderer, no mocks).

**F-4: Published user-facing classification doc**
A document at `doc/quality/adversarial-corpus-classification.md` containing a table of unsupported node type → MarkSync handling, using the three handling categories: escaped (inline raw HTML / unknown inline), `UnsupportedConstruct` (block-level raw HTML, non-allow-listed element tags), and requires manual macro / future MS-0003+ support (Confluence macros, app/gliffy content, nested tables — which are not authorable from a `.md` source in MS-0002). It states plainly what the one-way MS-0002 pipeline can and cannot author.

**F-5: PII self-audit**
An automated grep across all committed corpus artifacts (`*.md`, `*.classification.json`, any golden sidecars) for email patterns, bare IDs, and internal-ticket URL patterns. It must return clean (0 matches) and be documented in the spec/classification doc as the sanitization guardrail. Sanitization is primarily by construction (synthetic corpus — DEC-4); the grep is the guardrail against accidental inclusion.

## 6. USER & SYSTEM FLOWS

```
Flow 1: Corpus document → classification assertions (the runner)
  load *.md + *.classification.json → parse → MDAST→HAST
    → findAllUnsupported(hast) → assert emitted == committed sidecar (no silent drop)
    → renderStorage(hast) → assert supported constructs convert / byte-match golden (fidelity)
    → classify twice → assert byte-identical output (drift stability)

Flow 2: Converter/classifier change → regression guard
  any future change to the pipeline or allow-list → run the corpus → a regression in
  handling (silent drop, mis-conversion, non-determinism) fails the runner

Flow 3: User authoring non-GFM content → classification doc
  user reads doc/quality/adversarial-corpus-classification.md → learns their macro/raw-HTML
  is UnsupportedConstruct / requires a manual macro → authors accordingly
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- Synthetic adversarial corpus fixtures (`*.md`) + committed `*.classification.json` sidecars under `tests/adversarial/`, covering the AC-F1-1 category list.
- An additive collect-all classifier variant (`findAllUnsupported`) that reuses the existing allow-list; `findUnsupported`/`classifyUnsupported` unchanged (DEC-1).
- A golden-tier classification runner asserting fidelity + no-silent-drop + drift determinism per corpus document, mirroring the existing golden runner pattern.
- A published user-facing classification doc at `doc/quality/adversarial-corpus-classification.md`.
- An automated PII self-audit grep (email / bare-ID / internal-ticket-URL patterns) returning clean across all committed corpus artifacts.

### 7.2 Out of Scope

- [OUT] Expanding the canonical GFM subset to support more constructs (NG-1).
- [OUT] Changing existing `findUnsupported` / `classifyUnsupported` behavior (NG-2 / DEC-1).
- [OUT] Changing the sync-state three-way `classify()` in `src/domain/state/classifier.ts` (NG-3 / DEC-3).
- [OUT] Design-partner recruitment or ingesting real pages (NG-4 / DEC-4).
- [OUT] Reverse conversion (Confluence Storage → Markdown) (NG-5).
- [OUT] Making macros/app-content authorable from Markdown — they are represented in the corpus as raw-HTML blocks and hand-constructed HAST only (DEC-2).

### 7.3 Deferred / Maybe-Later

- **Per-construct GFM subset expansion.** Findings from this corpus may drive MS-0003+ stories that promote specific constructs (e.g., emoji passthrough, nested-table handling) from `UnsupportedConstruct` to supported — each its own per-construct decision.
- **Real design-partner corpus ingestion (deviation, surfaced).** The story's scope wording contemplated seeding the corpus from real/sanitized design-partner pages. This change **deviates**: because no real design-partner pages exist pre-launch, the corpus is **synthetic by construction** (DEC-4). Sanitized real pages may extend the corpus with a real-content tier alongside the synthetic fixtures post-launch (MS-0003+) once design partners are onboarded.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — no Confluence API changes. The runner exercises the in-process Markdown pipeline only (no network).

### 8.2 Events / Messages

N/A — no new events or message formats.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `*.classification.json` sidecar contract | A committed, reviewed artifact per corpus fixture recording the expected classification (the set of unsupported nodes the runner must reproduce). It is the pinned contract for the no-silent-drop and determinism assertions |
| DM-2 | `findAllUnsupported` return shape | A new collect-all entry point returning `MarkSyncError[]` (the existing `UnsupportedConstruct` arm, reused unchanged). No new error kind is introduced |

### 8.4 External Integrations

Confluence Cloud Storage Format macro vocabulary is referenced **as fixture source only** — real Confluence macro tag names inform the hand-constructed HAST nodes and raw-HTML blocks so the classification doc is meaningful (DEC-2). There is no runtime integration, no network call, and no Confluence dependency at test time.

### 8.5 Backward Compatibility

- **Render pipeline:** unchanged. The collect-all variant is **not** wired into `renderStorage`; `findUnsupported` (first-only fast-fail) remains the render path. A page with unsupported nodes still aborts on the first one exactly as before.
- **Public classifier API:** strictly additive — a new export is added; existing exports keep their signatures and behavior.
- **Golden suite:** the existing 33-fixture golden set is untouched and continues to pass byte-exact.
- **Classification sidecars:** new committed artifacts; no existing artifact is migrated.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-REL-4 | Conversion fidelity | 100% of canonical GFM fixtures survive Markdown→Storage round-trip; extended here so supported constructs in adversarial content convert correctly (0 mis-conversions) |
| NFR-SEC-1 / INV-SEC-1 | No secrets/PII in any output | 0 email/bare-ID/internal-ticket-URL matches across all committed corpus artifacts (PII self-audit) |
| NFR-PERF-5 | Conversion latency | Per-page render ≤ 200 ms (p95) — the runner processes ~20–40 fixtures through the real pipeline and must stay within the CI fast-loop budget (informational) |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

N/A — no new telemetry. This is test infrastructure plus a static doc; the only observable signal is the runner pass/fail in CI.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Corpus size over- or under-scoped (too few to cover categories, too many to maintain) | M | M | AC-F1-1 fixes the category-coverage list; the ~20–40 fixture target (Q1 / DEC-4) bounds the size; coverage is measured by category, not raw count | L |
| RSK-2 | PII leaks into committed synthetic fixtures | H | L | Synthetic by construction (DEC-4); automated grep self-audit (AC-F5-1) + human review checklist before commit | L |
| RSK-3 | Collect-all classifier diverges from the fast-fail classifier's allow-list logic (different verdicts) | M | L | DEC-1: the variant reuses the exact same allow-list and raw-block detection; a unit-test parity check proves `findAllUnsupported`'s first hit equals `findUnsupported` on the same tree | L |
| RSK-4 | Hand-constructed HAST macro nodes use unrealistic tag shapes → the classification doc misleads users | M | L | Fixtures reference real Confluence macro tag names (`ac:structured-macro`, `{toc}`/`{info}`/`{code}`/`{expand}` shapes, Jira/gliffy) so the doc reflects real handling | L |
| RSK-5 | Corpus pins fragile incidental shapes, becoming a maintenance burden / flaky | L | L | Sidecars pin at the classification contract (unsupported node types), not at incidental rendering details; the golden-runner pattern (committed, reviewed, explicit updates) is reused | L |
| RSK-6 | Emoji rendering nondeterministic across platforms (Bun/platform/Unicode drift) breaks a committed byte-exact golden for the emoji fixture | L | L | Either (a) do not commit a byte-exact `.storage.xhtml` golden for the emoji fixture — assert only that render succeeds and the emoji is present in the output; or (b) pin the emoji set and skip the golden if platform drift is observed | L |

## 12. ASSUMPTIONS

- No real design-partner pages exist pre-launch, so the corpus is synthetic by construction (DEC-4); sanitization is therefore primarily an authoring discipline, with the grep self-audit as the guardrail.
- The existing unsupported-node classifier's allow-list and raw-block detection are the correct single source of classification truth; the collect-all variant reuses them verbatim rather than re-deriving a parallel allow-list.
- The MS-0002 pipeline is strictly one-way Markdown→Storage, so Confluence macros, app/gliffy content, and nested tables are not authorable from a `.md` source and must be represented in the corpus as raw-HTML blocks and hand-constructed HAST (DEC-2).
- "Drift stability" means classification determinism (idempotent classification output), not the sync three-way `classify()` (DEC-3).

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | Markdown pipeline (parse → MDAST→HAST → classifier → canonicalize → render) — GH-20 | The runner exercises the real pipeline; all stages are delivered |
| Depends on | Unsupported-node classifier (GH-20, F-5, `src/domain/markdown/unsupported.ts`) + conversion fidelity (GH-20, NFR-REL-4) | Delivered — the corpus stress-tests the unsupported-node classifier and conversion fidelity. NOTE: this is NOT the sync-state drift classifier (GH-22 / `src/domain/state/classifier.ts`), which the corpus does NOT exercise (DEC-3 / NG-3); the story's "drift" AC is classification determinism, not sync drift |
| Depends on | ADR-0005 "do not silently degrade" (F-5 carve-out) + NFR-REL-4 fidelity | The load-bearing guarantees this corpus regression-locks |
| Depends on | Golden runner pattern (`tests/golden/markdown/storage-renderer.test.ts`) | The classification runner mirrors its real-parser/no-mock shape |
| Blocks | None | Standalone quality/ops story; findings feed future MS-0003+ construct-expansion decisions |

## 14. OPEN QUESTIONS

None blocking. The CEO-resolved items are captured as decisions:

- **R1 (sanitization approach)** — resolved: synthetic-by-construction + automated grep self-audit + human review (DEC-4 / AC-F5-1).
- **Q1 (corpus size)** — resolved: ~20–40 fixtures, coverage measured by category (DEC-4 / AC-F1-1).

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **Collect-all classifier variant.** Add a new export `findAllUnsupported(root, sourcePath): MarkSyncError[]` that walks the tree depth-first and collects ALL unsupported nodes; `findUnsupported`/`classifyUnsupported` behavior is unchanged (they remain the fast-fail render path) | `findUnsupported` returns only the first unsupported node, so it cannot satisfy "every unsupported node classified" (AC-F3-2). The variant is minimal, additive, and reuses the same allow-list + raw-block detection — no behavior change, no parallel logic | 2026-07-26 |
| DEC-2 | **Macros/app-content representation.** Confluence macros (`{toc}`, `{info}`, `{code}`, `{expand}`, Jira macro), gliffy/app content, and nested tables are NOT authorable in the canonical GFM subset from a `.md` source. They are represented two ways: (a) as raw-HTML blocks in `.md` (classifier flags `UnsupportedConstruct: raw-html-block`), and (b) as hand-constructed HAST nodes fed directly to the classifier (precedent: `tests/unit/domain/markdown/unsupported.test.ts` builds `math`/`dl`/`section` by hand). The classification doc states such content cannot be authored via Markdown in MS-0002 and requires a manual macro / future MS-0003+ support | MS-0002's pipeline is one-way Markdown→Storage. This is the honest, pipeline-consistent interpretation; hand-built nodes use realistic Confluence macro tag shapes so the doc is meaningful | 2026-07-26 |
| DEC-3 | **"Drift stability" = classification determinism.** AC-F3-3 refers to determinism of the unsupported-node classification (run the classifier on the same corpus twice → byte-identical output), NOT the sync three-way `classify()` in `src/domain/state/classifier.ts` | Disambiguates two unrelated "classify" concepts; the runner asserts idempotency of classification output, not sync drift | 2026-07-26 |
| DEC-4 | **Synthetic corpus.** No real design-partner pages exist pre-launch; the corpus is synthetic adversarial fixtures authored to represent each real-world content category. Sanitization is by construction (no real PII authored in) plus the automated grep self-audit (AC-F5-1) as a guardrail | Resolves R1 (sanitization approach) and Q1 (size ~20–40 fixtures). Synthetic-by-construction is the strongest sanitization guarantee; the grep is defense-in-depth | 2026-07-26 |
| DEC-5 | **Test-runner vs. fixture location split.** The test **runners** (classification-runner, corpus-inventory, pii-audit) live at `tests/golden/adversarial/*.test.ts` (golden tier — real pipeline, committed sidecars/goldens, no mocks). The test **fixtures** (data: `*.md`, `*.classification.json`, optional `*.storage.xhtml`) stay at `tests/adversarial/` per the story's explicit fixture path | CI glob `tests/golden/` already discovers `tests/golden/adversarial/` (no ci.yml change needed); runners are sanctioned by the existing golden tier, not a new unsanctioned tier; mirrors the existing `tests/golden/markdown/` runner + `tests/golden/fixtures/markdown/` data split | 2026-07-26 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Unsupported-node classifier (`src/domain/markdown/unsupported.ts`) | Updated — new additive `findAllUnsupported` export (DEC-1); `findUnsupported`/`classifyUnsupported` unchanged |
| Adversarial corpus (`tests/adversarial/`) | New — synthetic `*.md` sources + committed `*.classification.json` sidecars |
| Classification runner (`tests/golden/adversarial/`) | New — golden-tier fidelity + no-silent-drop + determinism assertions. The corpus-inventory and pii-audit runners also live at `tests/golden/adversarial/` (DEC-5); fixtures stay at `tests/adversarial/` |
| User-facing classification doc (`doc/quality/adversarial-corpus-classification.md`) | New |
| Feature spec `doc/spec/features/feature-safe-publish.md` | Updated (phase 7, doc-sync) — reference the corpus + classification doc alongside the 33-fixture golden set |

## 17. ACCEPTANCE CRITERIA

| ID | Criterion | Linked |
|----|-----------|--------|
| AC-F1-1 | **Given** the committed adversarial corpus, **when** inventoried by category, **then** it covers: nested tables; ≥3 macro/app-content categories; emoji; ≥1 long page (≥50 KB or ≥1000 lines — an absolute scale floor, not relative to golden size); mixed task/regular lists; and raw HTML. | F-1, G-1 |
| AC-F2-1 | **Given** a HAST tree containing multiple unsupported nodes, **when** the collect-all classifier runs, **then** it returns ALL unsupported nodes depth-first (none truncated to the first); and **when** `findUnsupported`/`classifyUnsupported` run on the same inputs, **then** their behavior is unchanged from before this change (DEC-1 parity). | F-2, G-4 |
| AC-F3-1 | **Given** a corpus fixture containing supported constructs, **when** run through the real pipeline to `renderStorage`, **then** supported constructs convert correctly (render succeeds); and **for fixtures with a committed golden `.storage.xhtml`**, **then** the rendered body byte-matches the golden (NFR-REL-4 fidelity). | F-3, NFR-REL-4 |
| AC-F3-2 | **Given** a corpus fixture and its committed `*.classification.json` sidecar, **when** the classifier enumerates the fixture's unsupported nodes, **then** the emitted classification equals the sidecar exactly — every unsupported node present, none missing, none extra (no silent drop; ADR-0005 / F-5). | F-2, F-3, G-2 |
| AC-F3-3 | **Given** the same corpus classified twice, **when** the two classification outputs are compared, **then** they are byte-identical (determinism; DEC-3 — not sync drift). | F-3, G-2 |
| AC-F4-1 | **Given** the published classification doc at `doc/quality/adversarial-corpus-classification.md`, **when** read, **then** it contains a table mapping unsupported node type → MarkSync handling using the three categories: escaped / `UnsupportedConstruct` / requires manual macro (DEC-2), and states plainly what the one-way MS-0002 pipeline can and cannot author. | F-4, G-3 |
| AC-F5-1 | **Given** all committed corpus artifacts (`*.md`, `*.classification.json`, any golden sidecars), **when** the automated PII self-audit grep runs for email patterns, bare IDs, and internal-ticket URLs, **then** it returns clean (0 matches). | F-5, NFR-SEC-1, G-5 |
| AC-F6-1 | **Given** the full repository, **when** `bun run check` runs, **then** it is green (lint + typecheck + all test tiers, including the new classification runner). | F-3 |

### Definition of Done

The acceptance criteria AC-F1-1 through AC-F6-1 above collectively constitute the Definition of Done for this change, mirroring the story's "Definition of Done" section.

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Delivery order:** (1) additive collect-all classifier + parity unit test (DEC-1) → (2) synthetic corpus fixtures + committed `*.classification.json` sidecars covering AC-F1-1 categories → (3) classification runner asserting fidelity + no-drop + determinism → (4) PII self-audit (AC-F5-1) → (5) published classification doc (AC-F4-1) → (6) `bun run check` green → (7) doc-sync the feature spec (phase 7).
- **Merge strategy:** single PR squashed to `main`; branch `feat/GH-31/adversarial-corpus`.
- **Communication:** the classification doc is the user-facing artifact; no separate announcement required for an internal quality/ops story.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — no data migration. New committed test artifacts (`*.md`, `*.classification.json`) are added; no existing data is migrated. The collect-all classifier is additive with no schema change.

## 20. PRIVACY / COMPLIANCE REVIEW

The corpus is **synthetic by construction** (DEC-4): no real design-partner pages are ingested, so no real PII is authored into the source. The automated PII self-audit grep (AC-F5-1) is the defense-in-depth guardrail verifying 0 email/bare-ID/internal-ticket-URL matches across all committed artifacts. This aligns with INV-SEC-1 / NFR-SEC-1 (no secrets in any committed artifact).

## 21. SECURITY REVIEW HIGHLIGHTS

- The collect-all classifier reads only the in-memory HAST tree; it performs no I/O and no network access. It introduces no new input boundary — corpus fixtures are test data, not runtime input.
- No new injection vector: the corpus exercises the existing classifier/render path, whose injection safety (NFR-SEC-5) is already covered; the collect-all variant reuses the same allow-list and does not pass raw HTML through.
- The PII self-audit (AC-F5-1) is the security-relevant guardrail for committed content.

## 22. MAINTENANCE & OPERATIONS IMPACT

- **Regression suite:** the corpus becomes a binding regression suite for the converter and classifier — any future pipeline or allow-list change must keep it green. Findings feed MS-0003+ construct-expansion decisions.
- **Maintenance surface:** one small additive export (sharing the existing allow-list, so no parallel logic to keep in sync) + ~20–40 reviewed classification sidecars + one static doc. Sidecars pin at the classification contract, not incidental shapes (RSK-5).
- **CI:** the classification runner joins the golden tier in the fast loop; ~20–40 fixtures through the real pipeline is within the existing budget (NFR-PERF-5).

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Adversarial corpus | Synthetic test fixtures representing real-world content categories the canonical GFM subset excludes, used to stress-test classification and fidelity |
| Classification sidecar (`*.classification.json`) | A committed, reviewed artifact per corpus fixture recording the expected unsupported-node classification the runner must reproduce |
| Collect-all classifier (`findAllUnsupported`) | New additive entry point returning ALL unsupported nodes depth-first; reuses the existing allow-list; not wired into render |
| Canonical GFM subset | The fixed set of remark-gfm-reachable constructs MarkSync supports in MS-0002 (locked by the 33 golden fixtures); expansion is MS-0003+ |
| Unsupported construct | A node outside the canonical subset, surfaced as `UnsupportedConstruct: <tag>` (element) or `UnsupportedConstruct: raw-html-block` (block-level raw HTML) |
| Fast-fail classifier (`findUnsupported`) | Existing classifier returning the first unsupported node; the render path aborts a page on the first hit |
| Drift stability (this story) | Determinism of unsupported-node classification — same input twice → byte-identical output (DEC-3; not sync drift) |
| Sanitization | Removing/avoiding PII in committed test content; here by synthetic construction plus an automated grep self-audit |

## 24. APPENDICES

### Appendix A: Category → fixture representation matrix

| Real-world category | Corpus representation | Expected handling |
|---|---|---|
| Nested tables | Raw-HTML block in `.md` (GFM tables are flat) | `UnsupportedConstruct: raw-html-block` |
| Confluence macros (`{toc}`, `{info}`, `{code}`, `{expand}`, Jira) | Raw-HTML block in `.md` + hand-constructed HAST (real `ac:structured-macro` shapes) | `UnsupportedConstruct` (block raw) / non-allow-listed tag; requires manual macro (DEC-2) |
| App / gliffy content | Hand-constructed HAST (gliffy/app tag shapes) | `UnsupportedConstruct: <tag>`; requires manual insertion |
| Emoji | Inline in `.md` (remark passthrough) | Converted/escaped per existing render (verify + pin) |
| Very long page | Large `.md` (≥50 KB or ≥1000 lines; absolute scale floor to exercise NFR-PERF-5, not relative to golden size) | Supported constructs convert correctly; render stays ≤200 ms p95 (NFR-PERF-5) |
| Mixed task/regular lists | Interleaved `- [ ]` task and `-`/`1.` regular lists in `.md` | All convert correctly (fidelity) |
| Raw HTML (block + inline) | `<div>…</div>` block; `<b>…</b>` inline in `.md` | Block → `UnsupportedConstruct: raw-html-block`; inline → escaped (DEC-4) |

### Appendix B: Why a collect-all variant is needed (DEC-1 rationale)

`findUnsupported(root, sourcePath)` returns the **first** unsupported node's `MarkSyncError` and is the fast-fail path `renderStorage` consumes (a page aborts on the first unsupported node). The runner's no-silent-drop assertion (AC-F3-2) must prove **every** unsupported node in a fixture is enumerated — impossible with a first-only classifier. A collect-all variant that reuses the same allow-list and raw-block detection (rather than a parallel implementation) satisfies the assertion with zero behavior change to the render path. Parity is provable: on any tree, `findAllUnsupported(tree)[0]` equals `findUnsupported(tree)`.

### Appendix C: Macro/app-content representation (DEC-2)

Because MS-0002 is strictly one-way Markdown→Storage with a fixed canonical subset, Confluence macros, app/gliffy content, and nested tables cannot be authored from a `.md` source. The corpus represents them honestly in two ways — (a) raw-HTML blocks in `.md` (the classifier flags `raw-html-block`), and (b) hand-constructed HAST nodes fed directly to the classifier, mirroring the established unit-test precedent that builds unsupported nodes by hand. The classification doc states plainly that such content requires a manual macro or future MS-0003+ support.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-26 | Juliusz Ćwiąkalski | Initial specification |

---

## AUTHORING GUIDELINES

This spec was authored from the authoritative story file `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S3--adversarial-corpus.md` (scope source), the epic doc (`MS2-E5--epic.md`), the current system spec (`doc/spec/features/feature-safe-publish.md` — the Markdown-pipeline row, the 33 golden fixtures, and the F-5 "no silent drop" carve-out), the existing classifier (`src/domain/markdown/unsupported.ts`) and its unit-test precedent (`tests/unit/domain/markdown/unsupported.test.ts`), the golden runner pattern (`tests/golden/markdown/storage-renderer.test.ts`), and the provided change planning summary. It follows the template at `doc/templates/change-spec-template.md` and mirrors the house style of the GH-77 (strip-html-comments) and GH-29 (quality-gate-wiring) specs. `change.type = feat` reflects that the change adds a new functional capability (the collect-all classifier) and a user-facing doc, not merely tests; it matches the orchestrator-created branch `feat/GH-31/adversarial-corpus`. The four PM-decided items (DEC-1..4) are recorded verbatim from the planning summary, including the CEO-resolved R1 (sanitization) and Q1 (size). Load-bearing authorities cited: ADR-0005 ("do not silently degrade" / Storage Format target), F-5 (no silent drop of rendering constructs), NFR-REL-4 (fidelity), NFR-SEC-1 / INV-SEC-1 (no secrets/PII), and the testing-strategy golden-tier + over-mocking guardrail (real parser/renderer, no mocks).

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-31)
- [x] `owners` has at least one entry (`@cwiakalski`)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, DM-, NFR-, RSK-, DEC-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no file-level code paths as directives, no step-by-step tasks)
- [x] No content duplicated from linked docs
- [x] Front matter validates per front_matter_rules
