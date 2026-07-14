---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-77-strip-html-comments
status: Proposed
created: 2026-07-14T00:00:00Z
last_updated: 2026-07-14T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [bug, MS-0002, priority:high]
links:
  change_spec: ./chg-GH-77-spec.md
  test_plan: ./chg-GH-77-test-plan.md
  github_issue: https://github.com/juliusz-cwiakalski/marksync-for-confluence/issues/77
  testing_strategy: .ai/rules/testing-strategy.md
  typescript_conventions: .ai/rules/typescript.md
summary: >
  Treat sync-to-Confluence as a render step by stripping non-rendering HTML and
  link-reference comments before Storage Format is produced, so a trivial,
  standard Markdown construct stops aborting sync and leaking as visible text.
  Non-comment raw HTML keeps its DEC-4 / F-5 behavior unchanged.
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-77: HTML comments (`<!-- -->`) break sync and leak as literal text

## Context and Goals

This plan delivers the fix specified in `chg-GH-77-spec.md` and tested by
`chg-GH-77-test-plan.md`. A standard HTML comment (`<!-- … -->`) currently
breaks the publish pipeline in two ways: a **block-level** comment makes
`findUnsupported` emit `UnsupportedConstruct: raw-html-block` and aborts the
page's sync; an **inline** comment is escaped at render and leaks as literal
visible text (`&lt;!-- … --&gt;`). The root cause in both cases is identical:
the pipeline has no carve-out for non-rendering annotations, so a comment is
treated as ordinary raw HTML.

**The fix** (DEC-1 = strip; DEC-2 = strip at the parse stage on the MDAST,
before MDAST→HAST conversion; DEC-3 = no new runtime dependency) adds one
small domain-owned transformer in `src/domain/markdown/` that removes
**comment-only** `html` nodes from the MDAST tree. A single upstream removal
prevents both failure modes at once: the classifier never sees a block comment,
and the renderer never escapes an inline comment. This is the direct precedent
of front-matter stripping (GH-63) and of dropping structural-whitespace text
nodes in canonicalization.

**Resolved decisions** (no open questions blocking delivery):

- **DEC-1**: Strip comments (default), do not pass through to Confluence.
  Passthrough is deferred (spec §7.3 / AC-F5-1) pending a future live-sandbox
  verification.
- **DEC-2**: Strip at the parse stage (MDAST), before MDAST→HAST conversion —
  not as a HAST filter. Wiring point: `parseMarkdown` in
  `src/domain/markdown/parse.ts`, applied to the parsed MDAST root.
- **DEC-3**: No new runtime dependency — a domain-owned tree transformer
  (unlike GH-63, which added `remark-frontmatter`).

**Open questions / decisions to confirm at DoR** (non-blocking):

- **Golden harness extension for the error-case fixture.** TC-COMM-011 asserts
  the golden count becomes `33` (6 new dir pairs), but TC-COMM-008
  (`raw-html-block-real`) is an *error* case (`renderStorage` returns
  `Result.err`) that the current harness cannot represent as a plain
  `.md` + `.storage.xhtml` pair: `loadFixtures()` reads the `.storage.xhtml`
  and the per-fixture test asserts `result.ok === true`. TC-COMM-008's own
  notes half-acknowledge this ("may not have a `.storage.xhtml` file"). The
  plan resolves the tension in **Phase C.1** by extending the harness with a
  minimal expected-error sidecar convention (`.unsupported.txt` carrying the
  construct id), so all 6 new pairs live in the fixtures dir and the count
  legitimately reaches 33. This harness extension is the one reconciliation
  the test plan did not spell out explicitly; the coder should confirm the
  convention with `@reviewer` at DoR. See **Spec / test-plan consistency**
  note below.

## Scope

### In Scope

- A domain-owned MDAST transformer in `src/domain/markdown/` (new file
  `strip-comments.ts`) that removes **comment-only** `html` nodes — both
  block-level and inline — during the parse stage (DEC-2). (F-1)
- The precise **comment-only predicate** that distinguishes comment-only raw
  nodes from real raw HTML, so DEC-4 / F-5 behavior for non-comment raw HTML
  is unchanged. (F-3, load-bearing security boundary — AC-F3-3.)
- Wiring the transformer into `parseMarkdown` (`src/domain/markdown/parse.ts`)
  so no downstream stage (the classifier, the canonicalizer, the Storage
  renderer) ever sees a comment-only node. (F-1)
- Verify `[//]: # (…)` and common variants (`[//]: # "…"`, `[//]: <>`) already
  produce no HAST output (remark `definition` node) and lock with a golden
  fixture; if any variant leaks, extend the strip. (F-2)
- Golden fixtures covering every case (strip + preserve) + the golden count
  assertion update. (F-4)
- Regression guards for real raw HTML (block → `UnsupportedConstruct`, inline →
  escaped) and idempotency/hash-stability for comment-bearing pages. (F-3,
  NFR-PERF-4)

### Out of Scope

- Live Confluence verification of comment **passthrough** (deferred per spec
  §7.3; strip is the deliverable).
- Any change to the behavior of **non-comment** raw HTML — block-level stays
  `UnsupportedConstruct`, inline stays escaped (DEC-4 / F-5 invariant).
- Reverse conversion (Confluence Storage → Markdown).
- Stripping comments from fenced/inline code (out of scope by construction —
  remark represents them as `code`/`text`, never `raw`).
- Any change to `src/domain/markdown/unsupported.ts`,
  `src/domain/render/canonicalize.ts`, or `src/infra/confluence/render/storage.ts`
  — these are untouched by construction (after the strip, comment-only nodes
  never reach them).

### Constraints

- **Tier boundary**: the transformer lives in `src/domain/markdown/` (domain
  tier) and imports no infra/app/cli. Enforced by `bun run check:boundaries`
  (dependency-cruiser).
- **No new runtime dependency** (DEC-3). `remark`/`mdast` types already
  available (`@types/mdast` devDependency).
- **Conventional Commits**, one commit per phase, enforced by TDR-0008 +
  husky + CI.
- **Code style** (`.ai/rules/typescript.md`): file headers ≤ 3 lines, no spec
  restatements, explicit boundary typing, `import type` discipline, kebab-case
  files. The predicate is the one load-bearing decision — cite GH-77 / DEC-2
  once at the predicate, not on every node.
- **Golden snapshots are reviewed, never auto-regenerated** — a snapshot diff
  in CI must be a conscious, intentional change.

### Risks

- **RSK-1 (Over-stripping)**: the comment predicate matches a raw node that
  contains real HTML mixed with a comment, silently dropping authored content.
  *Mitigated by* a comment-only predicate (the entire value must be one
  comment) + the `mixed-html-comment` golden/unit guard (AC-F3-3). Residual: L.
- **RSK-2 (Under-stripping)**: a comment form is not recognized and still
  leaks/aborts. *Mitigated by* block + inline `<!-- … -->` golden fixtures +
  `[//]: #` variant verification (AC-F2-1). Residual: L.
- **RSK-3 (DEC-4 / F-5 regression)**: the carve-out accidentally relaxes real
  raw-HTML handling. *Mitigated by* dedicated regression guards for real
  block + inline raw HTML (AC-F3-1 / AC-F3-2) + the classifier is untouched.
  Residual: L.
- **RSK-4 (Content-hash churn)** for pages that previously carried inline
  comments. *Expected and correct* — the comment was never rendering content;
  idempotent rerun preserved (NFR-PERF-4, TC-COMM-012). Residual: L.

### Success Metrics

| Metric | Target |
|--------|--------|
| Block-comment pages that sync successfully | 100% (was 0%) |
| Inline-comment literal-text leaks in output | 0 occurrences |
| Non-comment block-level raw HTML still flagged `UnsupportedConstruct` | 100% (unchanged) |
| Non-comment inline raw HTML still escaped | 100% (unchanged) |
| Existing golden fixture set passes byte-exact | 27/27 (unchanged) |
| Idempotent rerun of a comment-bearing page → 0 writes on second push | verified (NFR-PERF-4) |

## Phases

### Phase A: Comment-strip transformer + comment-only predicate

**Goal**: Implement the domain-owned MDAST transformer and its
security-relevant comment-only predicate, fully unit-tested in isolation,
before any pipeline wiring.

**Tasks**:

- [ ] **A.1** Create `src/domain/markdown/strip-comments.ts` exporting:
  - `isCommentOnlyHtml(value: string): boolean` — the load-bearing predicate.
    Matches an MDAST `html` node whose entire value is a single HTML comment
    (a contract like `/^\s*<!--[\s\S]*?-->\s*$/`), so it returns `true` for
    `<!-- x -->`, `  <!-- x -->  `, multi-line comments, and empty `<!---->`;
    and `false` for real HTML (`<div>…</div>`, `<b>`), mixed
    `<div data-x="1"><!-- note --></div>` (AC-F3-3), empty string, and plain
    text. This is the security boundary that prevents over-stripping.
  - `stripCommentNodes(root: MdastRoot): MdastRoot` — a recursive MDAST
    visitor that removes every `html` node for which `isCommentOnlyHtml` is
    true, from any parent (root, paragraph, etc.); returns the root. Pure,
    deterministic, no IO, no new dependency (DEC-3).
  - File header ≤ 3 lines; cite GH-77 + DEC-2 once at the predicate (the
    load-bearing decision). Domain-only imports (`mdast` types).
- [ ] **A.2** Create `tests/unit/domain/markdown/html-comment-strip.test.ts`
  with:
  - Predicate tests for `isCommentOnlyHtml` (true/false cases above) — the
    AC-F3-3 over-strip guard at the unit level.
  - Transformer tests for `stripCommentNodes`: block comment at root removed;
    inline comment inside a paragraph removed with surrounding text nodes
    preserved; mixed real-HTML+comment node NOT removed; code/text/other node
    kinds untouched; a `[//]: # (…)` source yields no `html` node at all (it
    is a `definition`, so the transformer leaves the tree unchanged and the
    bridge produces no output) — verifies TC-COMM-003's assumption.
  - Use `#domain/...` import aliases (not deep relative paths), per
    `.ai/rules/typescript.md`.
- [ ] **A.3** Verify: `bun test tests/unit/domain/markdown/html-comment-strip.test.ts`,
  `bun run lint`, `bun run typecheck`, `bun run check:boundaries`.

**Acceptance Criteria**:

- Must: the predicate rejects every mixed/real-HTML case (AC-F3-3) and accepts
  every comment-only form (AC-F1-1 / AC-F1-2 foundation).
- Must: the transformer is pure, deterministic, and touches no tier outside
  `src/domain/`.

**Files and modules**:

- Code areas: `src/domain/markdown/strip-comments.ts` (new);
  `tests/unit/domain/markdown/html-comment-strip.test.ts` (new).
- System docs: none.

**Tests**:

- `tests/unit/domain/markdown/html-comment-strip.test.ts` (TC-COMM-001,
  TC-COMM-002, TC-COMM-003, TC-COMM-010 — unit portions).

**Completion signal**: `feat(markdown): add comment-strip transformer + predicate (GH-77)`

> Commit type note: although the change type is `fix`, the transformer is a
> new domain capability; `feat(markdown)` is acceptable per Conventional
> Commits. If `@reviewer` prefers `fix(markdown)`, follow that — either is
> compliant.

---

### Phase B: Wire the transformer into the parse pipeline

**Goal**: Apply `stripCommentNodes` in `parseMarkdown` so comment-only `html`
nodes are removed before MDAST→HAST conversion, and prove the end-to-end
`renderStorage` path succeeds on block + inline comments.

**Tasks**:

- [ ] **B.1** Edit `src/domain/markdown/parse.ts`: apply `stripCommentNodes`
  to the parsed MDAST root inside `parseMarkdown`, after
  `processor.parse(text)` and before `Result.ok(...)`. Preserve the existing
  `Result` signature, the `ParseOptions` shape, and the front-matter-first /
  GFM ordering of the processor. No new dependency (DEC-3); the transformer
  is a domain function.
- [ ] **B.2** Add end-to-end render assertions (in
  `tests/unit/domain/markdown/html-comment-strip.test.ts` or a sibling
  pipeline test): a block-comment page (`<!-- c -->\n\n# H\n\nBody.`) renders
  via `parseMarkdown → mdastToHast → renderStorage` to `Result.ok` with no
  `UnsupportedConstruct` and no `<!--` / `&lt;!--` in the body (AC-F1-1); an
  inline-comment page (`Before <!-- c --> after.`) renders to a `<p>` whose
  body is the surrounding text only (AC-F1-2). These exercise the real
  parser/bridge/renderer — no mocks (TDR-0004 over-mocking guardrail).
- [ ] **B.3** Verify: `bun test tests/unit/domain/markdown/`,
  `bun run lint`, `bun run check:boundaries` (domain still imports no
  infra/app/cli — the test reaches `#infra/confluence/render/storage` only via
  the test, not via production domain code).

**Acceptance Criteria**:

- Must: AC-F1-1 — a block-level comment syncs successfully (no
  `UnsupportedConstruct`).
- Must: AC-F1-2 — an inline comment syncs successfully and the comment does
  not appear as literal text.

**Files and modules**:

- Code areas: `src/domain/markdown/parse.ts` (updated — one transformer call);
  `tests/unit/domain/markdown/html-comment-strip.test.ts` (updated — e2e
  assertions).
- System docs: none.

**Tests**:

- TC-COMM-001, TC-COMM-002 (HAST + full `renderStorage` path).

**Completion signal**: `fix(markdown): strip HTML comments at parse stage (GH-77)`

---

### Phase C: Golden fixtures + harness for the error-case pair

**Goal**: Add the 6 new golden fixture pairs, extend the golden harness to
represent the one expected-error case, and update the count assertion —
locking every AC in a reviewed snapshot while keeping the existing 27
byte-exact.

**Tasks**:

- [ ] **C.1** Extend `tests/golden/markdown/storage-renderer.test.ts`:
  in `loadFixtures()` and the per-fixture test, support an expected-error
  fixture. Minimal convention: if `${name}.unsupported.txt` exists (containing
  the construct id, e.g. `raw-html-block`), assert
  `!result.ok && error.kind === "UnsupportedConstruct" && error.construct === contents.trim()`
  instead of reading `.storage.xhtml` / asserting `result.ok`. The golden total
  remains the number of `.md` files in the fixtures dir. *(Resolves the
  TC-COMM-008 / TC-COMM-011 tension flagged in Context — confirm the convention
  with `@reviewer` at DoR.)*
- [ ] **C.2** Add 6 golden fixture pairs under `tests/golden/fixtures/markdown/`
  with content per test-plan §5.2:
  - `html-comment-block.md` + `.storage.xhtml` — block `<!-- … -->` →
    `<h1>`/`<p>` only, no comment text (TC-COMM-005).
  - `html-comment-inline.md` + `.storage.xhtml` — inline comment in `<p>` →
    `<p>Text before text after.</p>` (TC-COMM-006).
  - `link-ref-comment.md` + `.storage.xhtml` — all three `[//]: #` variants →
    heading/paragraph only, no comment text (TC-COMM-007).
  - `raw-html-inline-real.md` + `.storage.xhtml` — real inline `<b>` →
    `<p>Text &lt;b&gt;raw&lt;/b&gt; inline.</p>` (TC-COMM-009).
  - `mixed-html-comment.md` + `.storage.xhtml` —
    `<div data-x="1"><!-- note --></div>` → NOT stripped (escaped /
    unsupported as before) (TC-COMM-010 golden portion).
  - `raw-html-block-real.md` + `.unsupported.txt` (`raw-html-block`) — real
    block raw HTML → `Result.err` / `UnsupportedConstruct` (TC-COMM-008,
    via the C.1 convention).
- [ ] **C.3** Update the golden count assertion from `toBe(27)` to `toBe(33)`
  and refresh the count-test description comment to cite GH-77 (+6
  comment/regression fixtures). Verify the existing 27 fixtures remain
  byte-exact — any snapshot diff must be intentional and reviewed (no silent
  regeneration; AC-F4-2).
- [ ] **C.4** Verify: `bun test tests/golden/markdown/storage-renderer.test.ts`;
  confirm the existing 27 unchanged + the 6 new pass; `bun run lint`.

**Acceptance Criteria**:

- Must: AC-F4-1 — new fixtures cover AC-F1-1, AC-F1-2, AC-F2-1, AC-F3-1,
  AC-F3-2, AC-F3-3, and the existing 27 pass byte-exact.
- Must: AC-F4-2 — the count assertion is updated to the new total and any
  change is intentional.
- Should: the error-case convention is minimal and self-documenting (a future
  unsupported fixture can reuse it).

**Files and modules**:

- Code areas: `tests/golden/markdown/storage-renderer.test.ts` (updated —
  harness extension + count);
  `tests/golden/fixtures/markdown/{html-comment-block,html-comment-inline,link-ref-comment,raw-html-inline-real,mixed-html-comment}.{md,storage.xhtml}`
  + `raw-html-block-real.{md,unsupported.txt}` (new — 6 pairs).
- System docs: none.

**Tests**:

- TC-COMM-005, TC-COMM-006, TC-COMM-007, TC-COMM-008, TC-COMM-009,
  TC-COMM-010 (golden portions), TC-COMM-011.

**Completion signal**: `test(golden): add HTML-comment fixtures + error-case harness (GH-77)`

---

### Phase D: Regression guards, idempotency, full verification

**Goal**: Pin the DEC-4 / F-5 invariant with explicit regression guards,
prove idempotency for comment-bearing pages, and run the full suite green.

**Tasks**:

- [ ] **D.1** Update `tests/unit/domain/markdown/unsupported.test.ts`
  (TC-UNSUP-004 block) with explicit regression guards: real block-level raw
  HTML (`<div class="x">Real block</div>`) still yields
  `UnsupportedConstruct: raw-html-block` (AC-F3-1); real inline raw HTML
  (`Text <b>raw</b> inline.`) is still escaped and not flagged (AC-F3-2); a
  mixed node (`<div data-x="1"><!-- note --></div>`) is still flagged at block
  level — proving the comment carve-out did not relax the classifier
  (AC-F3-3). (TC-COMM-004, TC-UNSUP-004 update.)
- [ ] **D.2** Add an idempotency / hash-stability test (TC-COMM-012): extend
  `tests/integration/markdown/pipeline-roundtrip.test.ts` (or add a sibling
  `comment-strip-idempotency.test.ts`). Render a comment-bearing page twice
  through `parseMarkdown → mdastToHast → canonicalHash`
  (`src/domain/state/hashes.ts`) and assert the hash is identical across runs;
  additionally assert a comment-free equivalent yields the same hash (the
  strip is a pure render-time elision — NFR-PERF-4 / DM-2).
- [ ] **D.3** Run the full suite + all gates:
  `bun test tests/unit/ tests/integration/ tests/golden/`,
  `bun run lint`, `bun run typecheck`, `bun run check:boundaries`. Confirm
  zero regressions vs. the pre-change baseline.

**Acceptance Criteria**:

- Must: AC-F3-1 / AC-F3-2 / AC-F3-3 regression guards green (DEC-4 / F-5
  invariant intact).
- Must: NFR-PERF-4 — second render of an unchanged comment-bearing page
  produces an identical canonical hash (idempotent, deterministic strip).

**Files and modules**:

- Code areas: `tests/unit/domain/markdown/unsupported.test.ts` (updated);
  `tests/integration/markdown/pipeline-roundtrip.test.ts` (updated) or a new
  sibling idempotency test.
- System docs: none.

**Tests**:

- TC-COMM-004, TC-COMM-012, TC-UNSUP-004 (update).

**Completion signal**: `test(markdown): regression guards + comment-strip idempotency (GH-77)`

---

### Phase E: Finalize and Release

**Goal**: Version bump per repo conventions, reconcile the system spec with
the new carve-out, and confirm release readiness.

**Tasks**:

- [ ] **E.1** Version bump `package.json` `0.5.1` → `0.5.2` (patch; consistent
  with GH-76's `0.5.0 → 0.5.1` patch bump). Refresh the lockfile with
  `bun install` so `bun.lock` reflects the new version.
- [ ] **E.2** Spec reconciliation — update
  `doc/spec/features/feature-safe-publish.md` to document the F-5 "no silent
  drop" carve-out for non-rendering annotations (HTML comments +
  link-reference comments), citing GH-77 + DEC-1 / DEC-2 (per spec §16). This
  is executed in delivery phase 7 (`system_spec_update`) by `@doc-syncer`.
- [ ] **E.3** Final verification + DoD self-check: `bun run check` (lint +
  format:check + typecheck + test + check:boundaries); confirm all 9 ACs met
  (AC-F1-1, AC-F1-2, AC-F2-1, AC-F3-1, AC-F3-2, AC-F3-3, AC-F4-1, AC-F4-2,
  AC-F5-1) and every plan task box is checked.

**Acceptance Criteria**:

- Must: AC-F5-1 — the strip-vs-passthrough decision is documented (spec DEC-1
  + §7.3; this plan records the rationale and the deferred alternative).
- Must: version bumped to `0.5.2` (patch) and lockfile consistent.
- Should: the F-5 carve-out is reflected in the system spec so the behavior is
  discoverable for future reviewers.

**Files and modules**:

- Code areas: `package.json` (updated — version); `bun.lock` (updated).
- System docs: `doc/spec/features/feature-safe-publish.md` (updated — F-5
  carve-out for non-rendering annotations).

**Tests**:

- Full `bun run check` green; DoD matrix (all 9 ACs) self-checked.

**Completion signal**: `chore(release): bump version to 0.5.2 + sync safe-publish spec (GH-77)`

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TC-COMM-001 | Strip comment-only block-level HTML (MDAST shape + render ok) | A, B | AC-F1-1 |
| TC-COMM-002 | Strip comment-only inline HTML (MDAST shape + render ok) | A, B | AC-F1-2 |
| TC-COMM-003 | Link-reference comment variants produce no output | A, C | AC-F2-1 |
| TC-COMM-004 | Real block-level raw HTML still flagged | D | AC-F3-1 |
| TC-COMM-005 | Block comment golden fixture | C | AC-F1-1, AC-F4-1 |
| TC-COMM-006 | Inline comment golden fixture | C | AC-F1-2, AC-F4-1 |
| TC-COMM-007 | Link-ref comment golden fixture | C | AC-F2-1, AC-F4-1 |
| TC-COMM-008 | Real block raw HTML golden fixture (error case) | C | AC-F3-1, AC-F4-1 |
| TC-COMM-009 | Real inline raw HTML golden fixture | C | AC-F3-2, AC-F4-1 |
| TC-COMM-010 | Mixed HTML+comment node NOT stripped | A, C | AC-F3-3 |
| TC-COMM-011 | Full golden suite passes byte-exact; count = 33 | C | AC-F4-1, AC-F4-2 |
| TC-COMM-012 | Idempotent rerun of comment-bearing page | D | NFR-PERF-4 (DM-2) |
| TC-UNSUP-004 | Raw HTML classification — regression guard update | D | AC-F3-1, AC-F3-2 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | `./chg-GH-77-spec.md` | Spec |
| Test plan | `./chg-GH-77-test-plan.md` | Test plan |
| GitHub issue | https://github.com/juliusz-cwiakalski/marksync-for-confluence/issues/77 | Ticket |
| Comment-strip transformer | `src/domain/markdown/strip-comments.ts` | Code (new) |
| Parse wiring | `src/domain/markdown/parse.ts` | Code (updated) |
| Transformer unit tests | `tests/unit/domain/markdown/html-comment-strip.test.ts` | Test (new) |
| Classifier regression guards | `tests/unit/domain/markdown/unsupported.test.ts` | Test (updated) |
| Golden harness + count | `tests/golden/markdown/storage-renderer.test.ts` | Test (updated) |
| Golden fixtures (×6 pairs) | `tests/golden/fixtures/markdown/{html-comment-block,html-comment-inline,link-ref-comment,raw-html-inline-real,mixed-html-comment,raw-html-block-real}.*` | Fixture (new) |
| Idempotency test | `tests/integration/markdown/pipeline-roundtrip.test.ts` (or sibling) | Test (updated/new) |
| Feature spec carve-out | `doc/spec/features/feature-safe-publish.md` | System doc (updated, phase 7) |
| Version | `package.json` (0.5.1 → 0.5.2) | Release (updated) |

### Authorities

- **Decisions**: DEC-1 (strip, not passthrough), DEC-2 (strip at parse stage,
  MDAST), DEC-3 (no new runtime dependency) — spec §15.
- **Invariants**: DEC-4 (inline raw escape) / F-5 (no silent drop of rendering
  constructs) — the carve-out is defined relative to these; non-comment raw
  HTML is untouched.
- **NFRs**: NFR-REL-4 (conversion fidelity), NFR-PERF-4 (idempotent rerun),
  NFR-PERF-5 (latency), NFR-SEC-5 (injection safety) — spec §9.
- **Precedent**: GH-63 (front-matter strip), mermaid §3.3 rule-1
  (comment-strip for digest stability).

## Spec / test-plan consistency

No spec inconsistencies found. One **test-plan → harness** reconciliation is
required (flagged in Context and resolved in Phase C.1):

- TC-COMM-011 asserts the golden count becomes `33` (6 new dir pairs), but
  TC-COMM-008 (`raw-html-block-real`) is an **error** case
  (`renderStorage → Result.err`) that the current golden harness
  (`loadFixtures()` reads `.storage.xhtml`; the per-fixture test asserts
  `result.ok === true`) cannot represent as a plain `.md` + `.storage.xhtml`
  pair. TC-COMM-008's own notes half-acknowledge this ("may not have a
  `.storage.xhtml` file … or capture the error structure in the test
  instead"). **Resolution**: extend the harness with a minimal expected-error
  sidecar (`.unsupported.txt`) so all 6 new pairs live in the fixtures dir and
  the count legitimately reaches 33. If `@reviewer` prefers otherwise, the
  fallback is to keep `raw-html-block-real` as a dedicated assertion inside
  `storage-renderer.test.ts`, add only 5 dir pairs, and set the count to 32 —
  which would require a one-line amendment to TC-COMM-011's `toBe(33)`.

Everything else (AC ↔ TC coverage, file targets, NFR mapping) is consistent
across the spec and test plan.

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | plan-writer | Initial plan — 5 phases (A–E), 9 ACs / 13 TCs covered |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| — | — | — | — | — | Not yet executed |
