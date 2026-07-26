---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz/cwiakalski-agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-31-adversarial-corpus
status: Updated
created: 2026-07-26T00:00:00Z
last_updated: 2026-07-26T14:12:53Z
owners: ["@cwiakalski"]
service: marksync-cli
labels: ["feature", "MS-0002", "MS2-E5", "priority:medium", "test", "corpus", "docs"]
links:
  change_spec: ./chg-GH-31-spec.md
  test_plan: ./chg-GH-31-test-plan.md
  testing_strategy: .ai/rules/testing-strategy.md
  typescript_rules: .ai/rules/typescript.md
summary: >
  Publish a sanitized synthetic adversarial corpus under tests/adversarial/, an
  additive collect-all classifier (findAllUnsupported), and a golden-tier
  classification runner that regression-locks unsupported-node handling (no
  silent drop), conversion fidelity, and classification determinism against
  real-world content categories the canonical GFM subset excludes. Plus a
  user-facing classification doc and an automated PII self-audit.
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-31: [MS2-E5-S3] Adversarial public corpus + unsupported-node classification

## Context and Goals

This plan delivers the four spec capabilities **F-1..F-5** (and the umbrella
quality gate **F-6**) for change GH-31. It is sequenced so the `@coder` can
execute it via `/run-plan GH-31 execute all remaining phases no review`: six
committable phases, each independently green on the relevant `bun test` subset,
ending with a full `bun run check`.

The change is load-bearing for two guarantees that today are only proven against
synthetic GFM:

- **ADR-0005 "do not silently degrade" / F-5** — every unsupported node is
  classified, never silently dropped.
- **NFR-REL-4** — supported constructs convert correctly (fidelity).

The blocker to proving these exhaustively is that the existing fast-fail
classifier `findUnsupported` returns only the **first** unsupported node
(`src/domain/markdown/unsupported.ts`). DEC-1 resolves it: add an additive
collect-all variant `findAllUnsupported` that reuses the exact allow-list + raw
block detection, so its per-node verdict is identical to the render path's.
Parity is provable — `findAllUnsupported(tree)[0]` deep-equals
`findUnsupported(tree)` on any tree (RSK-3 mitigation).

All five PM decisions are settled (spec §15 DEC-1..5): no open questions block
delivery. Macros / app / gliffy content and nested tables are **not authorable**
from `.md` in MS-0002's one-way Markdown→Storage pipeline (DEC-2), so they are
represented two ways: as raw-HTML blocks in `.md` (classifier flags
`raw-html-block`) and as hand-constructed HAST nodes with **real Confluence macro
tag shapes** (`ac:structured-macro`, gliffy/app tags) fed directly to
`findAllUnsupported`, mirroring the precedent already in
`tests/unit/domain/markdown/unsupported.test.ts`.

**DEC-5 (runner/fixture split)** — the test **runners** (classification-runner,
corpus-inventory, pii-audit) live at `tests/golden/adversarial/*.test.ts` (golden
tier — real pipeline, committed sidecars/goldens, no mocks); the test **fixtures**
(data: `*.md`, `*.classification.json`, optional `*.storage.xhtml`) stay at
`tests/adversarial/` per the story. The CI glob `tests/golden/` in
`.github/workflows/ci.yml` already recursively discovers `tests/golden/adversarial/`,
so **no ci.yml change is needed** — placing runners under `tests/golden/` makes them
CI-visible without an edit (this is what resolves the DoR BLOCKER 1).

**Decision needed**: none. All decisions resolved in spec §15 (DEC-1..5, including
DEC-5 runner/fixture split).

**Open questions**: none blocking.

## Scope

### In Scope

- **F-2 / DEC-1** — additive `findAllUnsupported(root, sourcePath): MarkSyncError[]`
  in `src/domain/markdown/unsupported.ts`; `findUnsupported` / `classifyUnsupported`
  unchanged (the render fast-fail path stays as-is).
- **F-1 / DEC-4** — synthetic adversarial corpus `tests/adversarial/*.md` + committed
  `*.classification.json` sidecars covering the AC-F1-1 category list (≈20–40 fixtures).
- **F-3 / DEC-3 / DEC-5** — golden-tier classification runner
  `tests/golden/adversarial/classification-runner.test.ts` asserting fidelity, no-silent-drop,
  and determinism per fixture (runners under `tests/golden/adversarial/`, fixtures at
  `tests/adversarial/`), mirroring `tests/golden/markdown/storage-renderer.test.ts`.
- **F-5 / AC-F5-1** — automated PII self-audit `tests/golden/adversarial/pii-audit.test.ts`
  (0 email / bare-ID / internal-ticket-URL matches across `tests/adversarial/**`).
- **AC-F1-1** — corpus inventory `tests/golden/adversarial/corpus-inventory.test.ts` (6 categories).
- **F-4 / AC-F4-1** — user-facing classification doc
  `doc/quality/adversarial-corpus-classification.md`.
- **F-6 / AC-F6-1** — `bun run check` green (lint + format + typecheck + tests + boundaries).

### Out of Scope

- [OUT] Expanding the canonical GFM subset to support more constructs (NG-1) — findings feed MS-0003+.
- [OUT] Changing `findUnsupported` / `classifyUnsupported` behavior or wiring `findAllUnsupported` into `renderStorage` (NG-2 / DEC-1).
- [OUT] Changing the sync-state three-way `classify()` in `src/domain/state/classifier.ts` (NG-3 / DEC-3).
- [OUT] Real design-partner pages / recruitment (NG-4 / DEC-4) — corpus is synthetic by construction.
- [OUT] Reverse conversion Storage → Markdown (NG-5).
- [OUT] Making macros / app / gliffy content authorable from Markdown — hand-constructed HAST only (DEC-2).

### Constraints

- **TDR-0004 over-mocking guardrail** — the classification runner MUST use the real
  pipeline (`parseMarkdown` → `mdastToHast` → `findAllUnsupported` → `renderStorage`).
  No mocks of the parser / bridge / renderer. Mocks are not needed here (no network,
  no Confluence API) and would invalidate the regression protection.
- **Conventional Commits + husky/commitlint** (TDR-0008) — every phase ends with one
  conventional commit; squash-merge to `main`.
- **Code style** (`.ai/rules/typescript.md`) — the single `src/` file touched
  (`unsupported.ts`) keeps a ≤3-line header, minimal comments, no spec restatements,
  cites the authority once at the load-bearing point. The existing 2-line header is
  already compliant; preserve it.
- **Existing 33-fixture golden suite stays byte-exact** — no regression
  (`tests/golden/markdown/storage-renderer.test.ts` keeps asserting `fixtures.length === 33`).
- **Strict TS** (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
  — use `import type` / inline `type` modifiers; `array[i]` is `T | undefined`.
- **Import aliases** — tests use `#domain/...` aliases, never deep relative paths.

### Risks

- **RSK-3** — collect-all diverges from the fast-fail allow-list logic. Mitigated by
  DEC-1: `findAllUnsupported` reuses the same `ALLOWED_TAGS` + raw-block detection, and
  TC-ADVERSARIAL-002 (Phase 1) proves `findAllUnsupported(tree)[0]` deep-equals
  `findUnsupported(tree)` on the same tree. Residual risk: Low.
- **RSK-2** — PII leaks into committed synthetic fixtures. Mitigated by DEC-4
  (synthetic by construction) + TC-ADVERSARIAL-008 automated grep self-audit (Phase 4)
  + human review before commit. Residual: Low.
- **RSK-4** — hand-constructed macro HAST uses unrealistic tag shapes → the doc misleads.
  Mitigated by referencing real Confluence macro tag names per spec Appendix A; the
  hand-built-macro assertion (TC-ADVERSARIAL-010) verifies each real `ac:structured-macro`
  shape is classified `UnsupportedConstruct: <tag>`, and TC-ADVERSARIAL-005 covers the
  fixture-driven no-silent-drop. Residual: Low.
- **RSK-5** — corpus pins fragile incidental shapes → maintenance burden. Mitigated by
  pinning sidecars at the classification contract (`MarkSyncError[]` of
  `UnsupportedConstruct` arms), not incidental render bytes. Residual: Low.
- **RSK-1** — corpus size mis-scoped. Mitigated by AC-F1-1 category list + the ≈20–40
  fixture target (DEC-4 / Q1); coverage measured by category, not raw count. Residual: Low.

### Success Metrics

| Metric | Target | Proven by |
|--------|--------|-----------|
| Corpus category coverage | 6/6 AC-F1-1 categories | TC-ADVERSARIAL-001 |
| Unsupported nodes silently dropped in corpus | 0 | TC-ADVERSARIAL-005 |
| Classification determinism (run twice) | byte-identical, 0 diffs | TC-ADVERSARIAL-006 |
| Supported constructs mis-converted in corpus | 0 | TC-ADVERSARIAL-004 |
| PII self-audit matches across corpus | 0 | TC-ADVERSARIAL-008 |
| Existing 33-fixture golden suite | still byte-exact (no regression) | `tests/golden/...` |
| `bun run check` | green | TC-ADVERSARIAL-009 |

## Phases

### Phase 1: Collect-all classifier (DEC-1 / F-2)

**Goal**: Add an additive collect-all entry point so the runner can enumerate
*every* unsupported node in a tree, without changing the render fast-fail path.

**Tasks**:

- [ ] **1.1** In `src/domain/markdown/unsupported.ts`, add the exported function
  `findAllUnsupported(root: Root, sourcePath: string): MarkSyncError[]`. Implement it
  by reusing the **same** allow-list + raw-block detection the existing `walk` uses —
  refactor the shared traversal so the single-hit (`findUnsupported`) and collect-all
  (`findAllUnsupported`) paths cannot diverge (parity by construction; RSK-3). Do NOT
  modify `findUnsupported` or `classifyUnsupported` behavior or signatures (DEC-1 / NG-2).
  Do NOT wire `findAllUnsupported` into `renderStorage`.
- [ ] **1.2** Keep the file header ≤3 lines and compliant (`.ai/rules/typescript.md`).
  Cite ADR-0005 / F-5 once at the load-bearing point (the existing header already does —
  preserve it); add no spec restatements, no bare `(DEC-1)` alphabet-soup tags.
- [ ] **1.3** Extend `tests/unit/domain/markdown/unsupported.test.ts` with a new
  `describe("TC-ADVERSARIAL-002 (AC-F2-1) — findAllUnsupported parity vs findUnsupported")`
  block: build a HAST tree with ≥2 unsupported nodes at different depths (reuse the
  existing `root()` / `el()` helpers and the `math` / `dl` / `section` precedent); assert
  `findAllUnsupported(tree, SRC)[0]` deep-equals `findUnsupported(tree, SRC)`, the array
  length is ≥2, and a clean tree (only allow-listed tags) yields `[]` while
  `findUnsupported` yields `null`.
- [ ] **1.4** Add `describe("TC-ADVERSARIAL-003 (AC-F2-1) — multi-node depth-first collection")`:
  build a tree with 3–5 unsupported nodes across branches/depths; assert the collected
  count equals the number planted (none truncated), the order is depth-first pre-order,
  and every entry is `{ kind: "UnsupportedConstruct", construct: <tag>, sourcePath: SRC }`.

**Acceptance Criteria**:

- Must: AC-F2-1 — `findAllUnsupported` returns ALL unsupported nodes depth-first;
  `findUnsupported` / `classifyUnsupported` behavior unchanged (parity unit test green).
- Must: DM-2 — return shape is `MarkSyncError[]` (the existing `UnsupportedConstruct` arm;
  no new error kind).
- Should: the shared traversal is a single predicate-applying walker so future allow-list
  edits cannot desynchronize the two paths.

**Affected code areas**:

- `src/domain/markdown/unsupported.ts` (updated — additive export; refactor shared walk)
- `tests/unit/domain/markdown/unsupported.test.ts` (extended — two new describe blocks)

**System docs to update**:

- none in this phase (`doc/spec/features/feature-safe-publish.md` is doc-synced in lifecycle phase 7)

**Tests**:

- `bun test tests/unit/domain/markdown/unsupported.test.ts` — TC-UNSUP-001..004 still
  green (no regression) + TC-ADVERSARIAL-002/003 green.
- `bun run lint && bun run format:check && bun run typecheck` clean for the touched files.

**Entry points to call** (for the test author): import
`{ classifyUnsupported, findUnsupported, findAllUnsupported }` from
`#domain/markdown/unsupported`; tree shape via `parseMarkdown(src).value as never` →
`mdastToHast(...)`, or hand-built with the `root()` / `el()` helpers.

**Completion signal**: `feat(markdown): GH-31 add findAllUnsupported collect-all classifier`

---

### Phase 2: Synthetic adversarial corpus fixtures + sidecars (F-1 / AC-F1-1)

**Goal**: Author the sanitized synthetic corpus covering every AC-F1-1 category,
each paired with a committed, reviewed `*.classification.json` sidecar (DM-1).

**Tasks**:

- [ ] **2.1** Create `tests/adversarial/` and author ≈20–40 `*.md` fixtures covering all
  six AC-F1-1 categories (use fixture names that signal the category, e.g.
  `nested-tables.md`, `macro-toc.md`, `macro-info.md`, `macro-code.md`, `macro-expand.md`,
  `macro-jira.md`, `app-gliffy-representation.md`, `emoji.md`, `long-page.md`,
  `mixed-task-regular-lists.md`, `raw-html-block.md`, `raw-html-inline.md`):
  - **Nested tables** — raw-HTML block in `.md` (GFM tables are flat) → `raw-html-block`.
  - **≥3 macro/app-content categories** — represented as raw-HTML blocks in `.md`
    (classifier flags `raw-html-block`); the *hand-constructed HAST* shapes for these
    live in the runner (Phase 3), not the `.md`. Cover at least: `{toc}`, `{info}`,
    `{code}`, `{expand}`, Jira macro, gliffy/app content (per spec Appendix A).
  - **Emoji** — inline Unicode in `.md` (remark passthrough); pin the converted/escaped form.
  - **≥1 long page** at an absolute scale floor of **≥50 KB or ≥1000 lines** (AC-F1-1 —
    an absolute floor to exercise NFR-PERF-5, not relative to the 33-fixture golden set).
  - **Mixed task/regular lists** — interleaved `- [ ]` and `-`/`1.` items.
  - **Raw HTML** — both block-level `<div>…</div>` and inline `<b>…</b>`.
- [ ] **2.2** Generate each `*.classification.json` sidecar by running the **real**
  pipeline on its fixture — `parseMarkdown(md, {sourcePath}) → mdastToHast →
  findAllUnsupported(hast, sourcePath)` — and serializing the resulting `MarkSyncError[]`
  to JSON. Then **review** each sidecar against the fixture by hand before committing
  (it is the pinned contract for the no-silent-drop assertion; RSK-5).
- [ ] **2.3** The `*.classification.json` **classification sidecar** is **MANDATORY** for
  every fixture (DM-1) — it is the pinned contract for the no-silent-drop assertion
  (Phase 3 TC-005); there is no fixture without one. Separately, for fixtures that are
  pure supported content (e.g. `mixed-task-regular-lists`, `emoji`, `long-page`), you MAY
  additionally commit an **optional fidelity golden** (`*.storage.xhtml`) for the byte-match
  branch of Phase 3 TC-004. Only the optional `*.storage.xhtml` golden is skippable.
  Terminology: "classification sidecar" refers strictly to `*.classification.json`
  (mandatory); `*.storage.xhtml` is the optional fidelity golden, NOT a sidecar — do not
  confuse the two, or you risk skipping the mandatory sidecar and breaking TC-005.
- [ ] **2.4** Sanitize by construction (DEC-4): no email / bare-ID / internal-ticket-URL
  patterns in any authored fixture. (TC-008 in Phase 4 is the automated guardrail.)

**Acceptance Criteria**:

- Must: AC-F1-1 — corpus covers all six categories (the inventory test in Phase 4 enforces it).
- Must: DM-1 — every `*.md` has a reviewed `*.classification.json` sidecar recording the
  expected `MarkSyncError[]`.
- Should: sidecars pin at the classification contract (node types), not incidental render bytes.

**Affected code areas**:

- `tests/adversarial/*.md` (new)
- `tests/adversarial/*.classification.json` (new)
- `tests/adversarial/*.storage.xhtml` (new — optional, for supported-content fidelity)

**System docs to update**:

- none

**Tests**:

- No executable test in this phase (the runner lands in Phase 3, inventory in Phase 4).
  Verify by spot-running the generation script and eyeballing the sidecars.
- `bun run lint && bun run format:check` clean (fixtures are data; ensure JSON is formatted).

**Entry points to call** (to generate sidecars, ad-hoc): `{ findAllUnsupported }` from
`#domain/markdown/unsupported`; `parseMarkdown` from `#domain/markdown/parse`; `mdastToHast`
from `#domain/markdown/mdast-to-hast`.

**Completion signal**: `test(adversarial): GH-31 synthetic adversarial corpus fixtures`

---

### Phase 3: Classification runner — fidelity + no-silent-drop + determinism (F-3)

**Goal**: Land the golden-tier runner that proves, per corpus fixture, fidelity
(AC-F3-1), no-silent-drop (AC-F3-2), and drift stability (AC-F3-3).

**⚠️ TDR-0004 over-mocking guardrail**: this runner MUST exercise the real pipeline —
`parseMarkdown` → `mdastToHast` → `findAllUnsupported` → `renderStorage`. NO mocks of the
parser / bridge / renderer. Fault-injection / adapter mocks are not applicable here (no
network, no Confluence API). Rationale: golden-tier tests must validate real converter
behavior; mocking would invalidate the regression protection (`.ai/rules/testing-strategy.md`
§"over-mocking guardrail").

**Tasks**:

- [ ] **3.1** Create `tests/golden/adversarial/classification-runner.test.ts` mirroring the
  `loadFixtures()` pattern in `tests/golden/markdown/storage-renderer.test.ts`: read every
  `*.md` + `*.classification.json` pair (and optional `*.storage.xhtml`) from
  `tests/adversarial/`. Use `readFileSync` / `readdirSync` / `dirname` / `join` from
  `node:fs` + `node:path` and `import.meta.url`, exactly like the golden runner.
- [ ] **3.2** `describe("TC-ADVERSARIAL-004 (AC-F3-1 / NFR-REL-4) — fidelity")`: for each
  fixture, run the real pipeline to `renderStorage(hast, { sourcePath })` and exercise the
  three TC-004 branches: (a) **golden-match** — fixtures with a committed `*.storage.xhtml`:
  assert `result.ok === true` and `result.value.body === expected` (byte-exact);
  (b) **assert-succeeds** — supported-only fixtures without a golden: assert
  `result.ok === true` (supported constructs convert correctly); (c) **assert-error-fast-fail**
  — fixtures whose `*.classification.json` records unsupported nodes (error fixtures):
  assert `result.ok === false` and the error kind/construct matches the classification
  (mirroring the golden runner's `isErrorFixture` branch — render fast-fails on the first
  unsupported node exactly as the production path does).
- [ ] **3.3** `describe("TC-ADVERSARIAL-005 (AC-F3-2 / ADR-0005 / F-5) — no silent drop")`:
  for each fixture, run `findAllUnsupported(hast, sourcePath)` and deep-compare the
  serialized JSON to the committed `*.classification.json` — every unsupported node
  present, none missing, none extra. Print a per-fixture diff on mismatch.
- [ ] **3.4** `describe("TC-ADVERSARIAL-006 (AC-F3-3 / DEC-3) — drift stability")`: for
  each fixture, run the classification pipeline **twice** (AC-F3-3 requires "twice" — run
  exactly twice, not thrice), serialize each output, and assert byte-identical results
  across the two runs (DEC-3: classification determinism, NOT sync three-way `classify()`).
- [ ] **3.5** For the macro / app / gliffy categories **not authorable in `.md`** (DEC-2),
  add a `describe("TC-ADVERSARIAL-010 (AC-F3-2 / DEC-2) — hand-built macro/app HAST")`
  block (per test plan TC-010, a **unit** test — NOT in the golden runner file). Per test
  plan §7, TC-010 is grouped with TC-002/003 and extends
  `tests/unit/domain/markdown/unsupported.test.ts`: build HAST nodes with **real Confluence
  macro tag shapes** (`ac:structured-macro` with `ac:name` = `toc` / `info` / `code` /
  `expand` / `jira`, plus gliffy/app tags) and feed them directly to `findAllUnsupported`,
  asserting each is classified `UnsupportedConstruct: <tag>` with no silent drop — mirroring
  the hand-built-node precedent already in that file (RSK-4 mitigation). It is distinct from
  the fixture-driven golden runner in 3.1.
- [ ] **3.6** Use `#domain/...` import aliases throughout; no deep relative paths. Keep
  the test-file header ≤3 lines (it is a test file, but the same style applies).

**Acceptance Criteria**:

- Must: AC-F3-1 — supported constructs convert; committed goldens byte-match.
- Must: AC-F3-2 — emitted classification deep-equals each sidecar exactly.
- Must: AC-F3-3 — two classification runs are byte-identical (determinism).
- Must: no mocks of the pipeline (TDR-0004).
- Should: clear per-fixture failure messages with a diff for triage.

**Affected code areas**:

- `tests/golden/adversarial/classification-runner.test.ts` (new — golden tier)
- `tests/unit/domain/markdown/unsupported.test.ts` (extended in 3.5 with the TC-ADVERSARIAL-010
  hand-built-macro describe block — per test plan TC-010 is a unit test grouped with TC-002/003)

**System docs to update**:

- none

**Tests**:

- `bun test tests/golden/adversarial/classification-runner.test.ts` — TC-ADVERSARIAL-004/005/006 green.
- `bun test tests/unit/domain/markdown/unsupported.test.ts` — TC-ADVERSARIAL-010 (hand-built-macro HAST, DEC-2) green.
- `bun test tests/golden/markdown/storage-renderer.test.ts` — the 33-fixture suite still
  passes byte-exact (no regression from the new `findAllUnsupported` export).

**Entry points to call**: `parseMarkdown` (`#domain/markdown/parse`),
`mdastToHast` (`#domain/markdown/mdast-to-hast`),
`findAllUnsupported` (`#domain/markdown/unsupported`),
`renderStorage` (`#infra/confluence/render/storage`).
Note the cast pattern from the golden runner:
`mdastToHast(parseMarkdown(md, { sourcePath }).value as never)`.

**Completion signal**: `test(adversarial): GH-31 classification runner (fidelity/no-drop/determinism)`

---

### Phase 4: Corpus inventory + PII self-audit (AC-F1-1 / AC-F5-1)

**Goal**: Lock category coverage and prove the committed corpus is PII-free.

**Tasks**:

- [ ] **4.1** Create `tests/golden/adversarial/corpus-inventory.test.ts`
  (`describe("TC-ADVERSARIAL-001 (AC-F1-1) — corpus category coverage inventory")`):
  scan `tests/adversarial/` for all `*.md` fixtures and their sidecars, then assert each
  of the six required categories is represented — nested tables; ≥3 macro/app-content
  categories (incl. `{expand}`); emoji; ≥1 long page at the absolute scale floor
  (≥50 KB or ≥1000 lines, per AC-F1-1); mixed task/regular lists; raw HTML (block + inline).
  Use explicit per-category assertions with a message naming the covering fixture(s).
  Category detection may use fixture naming, sidecar node types, and content analysis.
- [ ] **4.2** Create `tests/golden/adversarial/pii-audit.test.ts`
  (`describe("TC-ADVERSARIAL-008 (AC-F5-1 / NFR-SEC-1 / INV-SEC-1) — PII self-audit clean")`):
  read every committed artifact under `tests/adversarial/**` (`*.md`, `*.classification.json`,
  `*.storage.xhtml`) and assert **0** matches for each of these concrete regexes (mirror them
  exactly in the test file):
  - **email** — `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`
  - **internal-ticket URL** — `https?://[^\s/]+/(?:browse|projects)/(?:[A-Z][A-Z0-9_]+-)\d+`
    (matches Jira-style `/browse/PROJ-123` and `/projects/...`)
  - **bare internal-issue-ref** — `(?:MS|GH|INT|TICKET|JIRA)[-_]\d{3,}` (case-insensitive;
    narrowed to internal-issue-ref format — matches `MS-123`, `gh_456`, `INT-789`,
    `TICKET-001`, `jira-1234`)

  Report the searched patterns + match count (0).
- [ ] **4.3** Use `#`-prefixed import aliases; keep headers ≤3 lines.

**Acceptance Criteria**:

- Must: AC-F1-1 — inventory test passes; all six categories represented.
- Must: AC-F5-1 / NFR-SEC-1 / INV-SEC-1 — PII self-audit returns 0 matches.
- Should: inventory messages name the covering fixture(s) for fast triage when a category
  is later removed.

**Affected code areas**:

- `tests/golden/adversarial/corpus-inventory.test.ts` (new)
- `tests/golden/adversarial/pii-audit.test.ts` (new)

**System docs to update**:

- none

**Tests**:

- `bun test tests/golden/adversarial/corpus-inventory.test.ts tests/golden/adversarial/pii-audit.test.ts` — green.

**Entry points to call**: filesystem reads only (`node:fs`, `node:path`); the inventory
may parse sidecars as plain JSON. No pipeline imports required.

**Completion signal**: `test(adversarial): GH-31 corpus inventory + PII self-audit`

---

### Phase 5: Published classification doc (F-4 / AC-F4-1)

**Goal**: Publish the user-facing reference so authors can predict how non-GFM
content is handled, stating plainly what the one-way MS-0002 pipeline can and
cannot author.

**Tasks**:

- [ ] **5.1** Create `doc/quality/adversarial-corpus-classification.md` containing the
  handling-category table (DEC-2) with the three categories:
  - **Escaped** — inline raw HTML / unknown inline (escaped at render, not flagged).
  - **`UnsupportedConstruct`** — block-level raw HTML (`raw-html-block`) and any
    non-allow-listed element tag (render fast-fails on the first hit).
  - **Requires manual macro / future MS-0003+ support** — Confluence macros (`{toc}`,
    `{info}`, `{code}`, `{expand}`, Jira), app/gliffy content, nested tables (not authorable from a
    `.md` source in MS-0002 — DEC-2).
- [ ] **5.2** State plainly what the one-way MS-0002 Markdown→Storage pipeline can and
  cannot author, reference DEC-2 for the macro/app-content carve-out, and point to the
  adversarial corpus (`tests/adversarial/`) + the 33-fixture golden set as the regression
  locks. Cross-link the spec (`chg-GH-31-spec.md`) and ADR-0005 once at the load-bearing point.
- [ ] **5.3** Follow `doc/documentation-profile.md` (engineering-repo) — this is a
  `doc/quality/**` artifact, which is permitted.

**Acceptance Criteria**:

- Must: AC-F4-1 — doc exists with the three-category handling table and a plain statement
  of MS-0002 authoring limits.
- Should: each table row maps a concrete node/tag example to its handling category.

**Affected code areas**:

- none (documentation only)

**System docs to update**:

- `doc/quality/adversarial-corpus-classification.md` (new) — the deliverable itself.
- `doc/spec/features/feature-safe-publish.md` — updated in lifecycle phase 7
  (`system_spec_update` / `@doc-syncer`) to reference the corpus + classification doc
  alongside the 33-fixture golden set (spec §16). Not a coder commit in this plan.

**Tests**:

- TC-ADVERSARIAL-007 is manual (doc existence + content). Verified in DoD (lifecycle
  phase 10). No automated test added here; optionally a lightweight existence assertion
  may be added if the @coder judges it useful, but it is not required by the test plan.

**Entry points to call**: none (documentation).

**Completion signal**: `docs(quality): GH-31 adversarial corpus classification reference`

---

### Phase 6: Final quality gate + finalize (F-6 / AC-F6-1)

**Goal**: Prove the umbrella quality gate is green and that no regression was
introduced, then finalize the change for doc-sync and review.

**Tasks**:

- [ ] **6.1** Run `bun run check` (=`lint && format:check && typecheck && test &&
  check:boundaries`). Confirm: the new classification runner, corpus inventory, and PII
  audit all pass; the parity + multi-node unit tests pass; the existing 33-fixture golden
  suite is still byte-exact; dependency-cruiser boundaries pass (the new
  `findAllUnsupported` is in `src/domain/` and imports nothing upward).
- [ ] **6.2** **CI-glob visibility verification (DEC-5 / DoR BLOCKER 1)**: confirm the
  adversarial runners are discovered by the CI-scoped invocation. Run
  `bun test tests/golden/` (the exact glob `.github/workflows/ci.yml` uses) and verify it
  picks up `tests/golden/adversarial/classification-runner.test.ts`,
  `tests/golden/adversarial/corpus-inventory.test.ts`, and
  `tests/golden/adversarial/pii-audit.test.ts`. This is a **verification step only** — NO
  `ci.yml` edit. DEC-5 makes the runners CI-visible without a ci.yml change because they
  live under the already-globbed `tests/golden/` (fixtures stay at `tests/adversarial/`,
  which holds only data, no `*.test.ts`).
- [ ] **6.3** If any issue surfaces, fix it (this is the only phase whose commit is
  conditional). If everything is already green after Phase 5, skip the commit and just
  record the green run in the Execution Log.
- [ ] **6.4** **Spec reconciliation + testing-strategy note (doc-sync handoff)**:
  - Confirm `doc/spec/features/feature-safe-publish.md` is updated in lifecycle phase 7
    (`system_spec_update` / `@doc-syncer`) to reference the adversarial corpus +
    classification doc alongside the 33-fixture golden row (spec §16).
  - `.ai/rules/testing-strategy.md` needs a **one-line addition** clarifying that the
    adversarial corpus is a **golden-tier subcategory** under `tests/golden/adversarial/`
    (fixtures at `tests/adversarial/`) — **NOT a new tier** (DEC-5). This is a minor
    doc-sync item; the `@coder` may add it in this phase, or it is handed off to
    `@doc-syncer` in lifecycle phase 7. It is listed here so it is not dropped.
  These are NOT coder commits in this plan (unless the @coder picks up the one-line
  testing-strategy note here) — they are finalized by `@doc-syncer` after `/run-plan`.
- [ ] **6.5** **Version bump**: `version_impact` is `patch`. Per repo conventions there is
  no per-change version bump in the coder plan; the `package.json` version
  (`0.7.0`) is bumped at the MS-0002 release milestone, not per PR. Record `version_impact:
  patch` metadata only.

**Acceptance Criteria**:

- Must: AC-F6-1 — `bun run check` exit code 0.
- Must: `bun test tests/golden/` (the CI glob) discovers and runs all three adversarial
  runners under `tests/golden/adversarial/` (DEC-5 / BLOCKER 1 verification).
- Must: the 33-fixture golden suite is still byte-exact (no regression).
- Should: the full adversarial tier runs well within the CI fast-loop budget (NFR-PERF-5,
  informational; ≈20–40 fixtures through the real pipeline).

**Affected code areas**:

- fixes (if any) to files touched in Phases 1–5.

**System docs to update**:

- `doc/spec/features/feature-safe-publish.md` (updated in lifecycle phase 7, not here).
- `.ai/rules/testing-strategy.md` — one-line addition noting the adversarial corpus is a
  golden-tier subcategory under `tests/golden/adversarial/` (fixtures at `tests/adversarial/`),
  NOT a new tier (DEC-5). May be added by `@coder` here or handed to `@doc-syncer` in phase 7
  (see task 6.4). Listed here so it is not dropped.

**Tests**:

- `bun run check` green end-to-end.
- `bun test tests/golden/` (the CI-scoped glob) discovers and runs all three adversarial
  runners under `tests/golden/adversarial/` (DEC-5 verification). Note: there are no
  `*.test.ts` files under `tests/adversarial/` (it holds only fixtures), so the adversarial
  runners are exercised entirely via the `tests/golden/` glob — no separate
  `tests/adversarial/` test invocation is needed.

**Entry points to call**: none new.

**Completion signal** (commit only if fixes were needed):
`test(adversarial): GH-31 green quality gates`

---

### Phase 7: Review remediation (iter-1 findings)

**Goal**: Address the @reviewer iter-1 FAIL (2 MAJORs + 4 MINOR/NIT). Items 1-2 are blocking; 3-7 land in the same phase.

**Tasks** (from reviewer iter-1, precise):

- [ ] **7.1 (MAJOR-1, blocking)** Make macro handling honest end-to-end. The real remark parser parses namespaced macro tags (`<ac:structured-macro …>`, gliffy) authored in Markdown as **inline** raw HTML → silently escaped at render (render `ok:true`, `findAllUnsupported` returns `[]`) — NOT a `raw-html-block` fast-fail as the doc claims. Correct `doc/quality/adversarial-corpus-classification.md` (the "Requires manual macro" / handling table row + the "What Requires Manual Workarounds" section) to state plainly: namespaced/block-looking macro tags authored in Markdown are parsed as inline raw HTML and silently escaped (render succeeds, no flag), whereas truly block-level raw HTML (`<div>`, `<table>`) fast-fails as `raw-html-block`. Add a one-line known-limitation note that macro silent-escape is a degradation vector tracked for MS-0003+. Reframe the macro/app `.md` fixtures (and their `[]` sidecars) as "demonstrates the silent-escape path" — the sidecars already match reality; do NOT fabricate a fast-fail. Do NOT change the hand-built HAST TC-010 (that correctly proves macros-as-HAST-elements ARE flagged — a different path). Re-run the classification runner to confirm sidecars still match.
- [ ] **7.2 (MAJOR-2, blocking)** Refactor `src/domain/markdown/unsupported.ts` to a single shared predicate-driven traversal consumed by BOTH `findUnsupported` and `findAllUnsupported`, eliminating the duplicated raw-block branch (currently `walk` + `walkCollect` copy-paste). Implementation: extract one walker that collects every hit (e.g. `walkAll(root, sourcePath): MarkSyncError[]`), then define `findUnsupported` as `walkAll(...)[0] ?? null` (or a shared generator/visitor + `findFirst`/`findAll` consumers). Keep `findUnsupported`/`classifyUnsupported` behavior identical (DEC-1). Re-run TC-002/003/010 + the 33-fixture golden suite + the adversarial runner to confirm no regression.
- [ ] **7.3 (NIT-1)** Add a `raw`-at-root (raw-html-block) case to TC-002 in `tests/unit/domain/markdown/unsupported.test.ts` asserting `findAllUnsupported(tree)[0]` deep-equals `findUnsupported(tree)` — locks the now-shared raw-block path at unit tier.
- [ ] **7.4 (MINOR-1)** Corpus count: either grow toward ~20-40 OR rename the count test in `tests/golden/adversarial/corpus-inventory.test.ts` ("total fixture count is within target range (20-40)" currently asserts `>= 12`) to "category coverage floor" and record the 12-fixture/category-complete state as an explicit note. Recommend: rename + record deviation (AC is category coverage, not raw count).
- [ ] **7.5 (MINOR-2)** Strengthen the "≥3 macro/app-content categories" assertion in corpus-inventory to require ≥3 **distinct** category names (e.g. `expect(new Set(macroCategoryNames).size).toBeGreaterThanOrEqual(3)` with an explicit allow-list), not just ≥3 fixtures matching one of the names.
- [ ] **7.6 (MINOR-3)** Dead golden-match branch in `classification-runner.test.ts` TC-004: either commit ≥1 `.storage.xhtml` golden for a deterministic supported fixture (e.g. `mixed-task-regular-lists.md`) OR remove the dead branch with a justifying comment that GFM byte-fidelity is locked by the 33-fixture suite. Recommend: remove the dead branch + comment (avoids maintenance; the 33-fixture suite already locks GFM byte-fidelity).
- [ ] **7.7 (MINOR-4)** Switch `corpus-inventory.test.ts` and `pii-audit.test.ts` from CWD-relative `join("tests", "adversarial")` to `import.meta.url`-based resolution (`dirname(new URL(import.meta.url).pathname)`) to match the golden-runner convention and survive non-repo-root CWD.
- [ ] **7.8** Re-run `bun run check` green; confirm 33-fixture golden suite still byte-exact; update the Execution Log + revision log.

**Acceptance Criteria**: all reviewer iter-1 findings resolved; `bun run check` green; no regression.

**Completion signal**: `fix(adversarial): GH-31 review iter-1 remediation (macro doc honesty + shared walker)`

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TC-ADVERSARIAL-001 | Corpus category coverage inventory (6 categories) | P4 | AC-F1-1 |
| TC-ADVERSARIAL-002 | Parity: `findAllUnsupported(tree)[0]` deep-equals `findUnsupported(tree)` | P1 | AC-F2-1 |
| TC-ADVERSARIAL-003 | Multi-node depth-first collection (none truncated) | P1 | AC-F2-1 |
| TC-ADVERSARIAL-004 | Fidelity: supported constructs convert; goldens byte-match | P3 | AC-F3-1, NFR-REL-4 |
| TC-ADVERSARIAL-005 | No silent drop: emitted classification == committed sidecar | P3 | AC-F3-2, ADR-0005, F-5 |
| TC-ADVERSARIAL-006 | Drift stability: two classification runs byte-identical | P3 | AC-F3-3 (DEC-3) |
| TC-ADVERSARIAL-007 | Classification doc published with handling table | P5 | AC-F4-1 |
| TC-ADVERSARIAL-008 | PII self-audit: 0 email/ID/internal-ticket-URL matches | P4 | AC-F5-1, NFR-SEC-1, INV-SEC-1 |
| TC-ADVERSARIAL-009 | Quality gate: `bun run check` green | P6 | AC-F6-1 |
| TC-ADVERSARIAL-010 | Hand-built-macro HAST classification (DEC-2) — real `ac:structured-macro` shapes (`toc`/`info`/`code`/`expand`/`jira`) fed to `findAllUnsupported`, no silent drop | P3 (3.5) | AC-F3-2, DEC-2 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | `./chg-GH-31-spec.md` | Spec |
| Test plan | `./chg-GH-31-test-plan.md` | Test plan |
| Implementation plan | `./chg-GH-31-plan.md` | Plan (this file) |
| Collect-all classifier | `src/domain/markdown/unsupported.ts` | Code (updated — additive `findAllUnsupported`) |
| Classifier unit tests | `tests/unit/domain/markdown/unsupported.test.ts` | Test (extended) |
| Adversarial corpus fixtures | `tests/adversarial/*.md` | Test data (new) |
| Classification sidecars | `tests/adversarial/*.classification.json` | Test data (new) |
| Optional fidelity goldens | `tests/adversarial/*.storage.xhtml` | Test data (new, optional) |
| Classification runner | `tests/golden/adversarial/classification-runner.test.ts` | Test (new, golden tier) |
| Corpus inventory test | `tests/golden/adversarial/corpus-inventory.test.ts` | Test (new, golden tier) |
| PII self-audit test | `tests/golden/adversarial/pii-audit.test.ts` | Test (new, golden tier) |
| Classification doc | `doc/quality/adversarial-corpus-classification.md` | Quality doc (new) |
| Feature spec (doc-sync) | `doc/spec/features/feature-safe-publish.md` | System spec (updated in lifecycle phase 7) |
| Golden runner pattern | `tests/golden/markdown/storage-renderer.test.ts` | Reference (mirrored) |
| Testing strategy | `.ai/rules/testing-strategy.md` | Rule |
| TypeScript rules | `.ai/rules/typescript.md` | Rule |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-26 | plan-writer | Initial plan from `chg-GH-31-spec.md` + `chg-GH-31-test-plan.md`; 6 execution phases aligned to AC-F1..F6 and TC-ADVERSARIAL-001..009. |
| 1.1 | 2026-07-26 | plan-writer | Revised per DoR gate iter-1 findings + iter-2 spec/test-plan changes. (1) **DEC-5 runner/fixture split** — all RUNNERS moved to `tests/golden/adversarial/*.test.ts` (classification-runner, corpus-inventory, pii-audit); fixtures (`*.md`, `*.classification.json`, optional `*.storage.xhtml`) stay at `tests/adversarial/`. Updated In Scope, Phases 3/4, Artifacts table. (2) **BLOCKER 1** — added Phase 6.2 CI-glob visibility verification (`bun test tests/golden/` discovers the runners; NO ci.yml edit, per DEC-5); removed the stale `tests/adversarial/` test invocation. (3) **MAJOR 7** — added a one-line `.ai/rules/testing-strategy.md` doc-sync note (adversarial corpus = golden-tier subcategory, NOT a new tier) to Phase 6 System docs + task 6.4. (4) **MINOR 12** — Phase 2.3 reworded: `*.classification.json` sidecar is MANDATORY for every fixture (TC-005); only the optional `*.storage.xhtml` fidelity golden is skippable; "sidecar" reserved strictly for `*.classification.json`. (5) Spec/test-plan iter-2 sync — long-page floor = ≥50 KB or ≥1000 lines (absolute); `{expand}` added to macro lists (Phases 2.1, 3.5, 5.1); Phase 3.5 hand-built-macro block relabeled TC-005 → TC-ADVERSARIAL-010 (unit tier, in `unsupported.test.ts`) and added to the Test Scenarios table; TC-006 runs twice not thrice (Phase 3.4); TC-008 concrete PII regexes (Phase 4.2); TC-004 three branches made explicit (Phase 3.2). DEC-5 added to decisions context (all decisions DEC-1..5 resolved). |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 1 | Completed | 2026-07-26 | 2026-07-26 | ceb0073 | Collect-all classifier (DEC-1) |
| 2 | Completed | 2026-07-26 | 2026-07-26 | 666e088 | Corpus fixtures + sidecars |
| 3 | Completed | 2026-07-26 | 2026-07-26 | 8db998e | Classification runner (fidelity/no-drop/determinism) |
| 4 | Completed | 2026-07-26 | 2026-07-26 | 63cfd47 | Corpus inventory + PII self-audit |
| 5 | Completed | 2026-07-26 | 2026-07-26 | bf26849 | Published classification doc |
| 6 | Completed | 2026-07-26 | 2026-07-26 | 988c61e | Final quality gate + finalize |
| 7 | In Progress | 2026-07-26 | — | — | Review iter-1 remediation (2 MAJOR + 4 MINOR/NIT) |
