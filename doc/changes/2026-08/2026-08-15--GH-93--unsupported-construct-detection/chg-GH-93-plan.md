---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-93-unsupported-construct-detection
status: Proposed
created: 2026-08-15T00:00:00Z
last_updated: 2026-08-15T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0003, feature, priority:high, reverse-conversion, E1]
links:
  change_spec: ./chg-GH-93-spec.md
  test_plan: ./chg-GH-93-test-plan.md
  decision_tdr_0014: ../../../decisions/TDR-0014-reverse-diagnostics-granular-code-taxonomy.md
summary: "Complete unsupported-construct detection in the GH-92 reverse converter (PDR-0002 C-4): four granular blocking diagnostic codes (unknown-macro / complex-layout / unsupported-attribute / unknown-element) plus the retained structural fallback, per the TDR-0014-frozen assignment map; attribute-level detection over the mirror allowlist (exactly what the forward converter emits, per spec Appendix C) with the K1 carve-out confined to ac:structured-macro; task-list child integrity; caller-supplied page context echoed verbatim into every diagnostic arm; storage-side adversarial corpus extended to GH-31 alignment (12/12) with zero-diagnostic canonical counterparts; 7 reviewed sidecar re-pins; zero new diagnostics over canonical corpora; 0 CLI delta; 0.9.0 → 0.10.0."
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-93: feat: complete unsupported-construct detection — granular stable diagnostic codes + page locations (PDR-0002 C-4)

## Context and Goals

GH-92 shipped the reverse converter (Storage Format → Markdown, v0.9.0) with a two-class diagnostic taxonomy but incomplete detection: non-canonical **attributes** on canonical elements and non-`ac:task` children of `ac:task-list` are silently dropped, the `ac:layout` family is only coarsely classified with no fixture, and diagnostics carry element `line:column` but no page identity. This change closes every gap so the MS-0003 `resolve` (E2) and `import` (E3) flows can trust reverse diagnostics as the complete C-4 foundation: machine-consumable per-class codes, page + element locations, and a storage-side adversarial corpus aligned 12/12 with the GH-31 classification — including zero-diagnostic canonical counterparts as the false-positive guard. Library-only: zero CLI delta; `ReverseError` stays a standalone union.

**Binding inputs:** the spec (`chg-GH-93-spec.md` — F-1..F-7, AC-F1-1..AC-F7-2, DEC-1..DEC-7, normative Appendix A code-assignment map / Appendix B alignment map / Appendix C mirror attribute allowlist), the test plan (`chg-GH-93-test-plan.md` — 18 TCs, harness mechanics §4.4, corpus tables §6.2, test-design decisions D-TST-1..5), and **TDR-0014** (taxonomy frozen: Alt 3 confirmed with two clarifying pins — (1) orphaned layout-family elements classify as ONE `reverse/complex-layout` at the outermost family element present; (2) consumers route on the `code` string only, never `construct` text or `class` labels).

**Code surface at intake (verified on `feat/GH-93/unsupported-construct-detection` off `main @ e0211af`):**

- `src/domain/markdown/reverse-diagnostics.ts` — `REVERSE_CODES` at exactly 3 codes; `BlockingDiagnostic`/`InformationalDiagnostic`/`StorageParseError`/`UnsupportedConstructError` carry no page field.
- `src/infra/confluence/parse/reverse.ts` — `reverseStorage(body, opts?)` / `reverseStorageCollectAll(body)` (no opts param yet); `classifyElement` passes the canonical-element allowlist through **without attribute inspection**; the generic unknown-element and unknown-macro arms both emit the coarse `reverse/unsupported-construct`; `classifyTaskListElement`/`classifyTaskListMacro` filter children to `ac:task` silently; `ReverseOptions.sourcePath` reserved-unused.
- `src/infra/confluence/parse/reverse-parser.ts` — `dropK1Attributes` strips `ac:schema-version`/`ac:macro-id` from **every** element (the K1 carve-out must become macro-scoped: on non-macro elements those names are exotic attributes per Appendix C).
- `src/infra/confluence/render/storage.ts` — the forward converter whose emission surface **is** the mirror allowlist (Appendix C); exact emission sites cited in Phase 2.
- `tests/golden/adversarial/reverse-classification-runner.test.ts` — sidecar deep-equality over `{code, construct, location}`, assumes every non-parse-error fixture blocks, category inventory at the GH-92 7-category shape, compensating PII grep-audit.
- `tests/adversarial-storage/` — 9 fixture+sidecar pairs (7 to re-pin, 2 provably untouched).
- `package.json` — version 0.9.0.

### Plan decisions (spec-delegated latitude, pinned here)

- **PD-1 — TS-level discriminator widening is additive convenience, never contract (TDR-0014 pin 2).** The error union keeps `kind: "UnsupportedConstruct"` for every blocking class (zero churn; the runner's existing `kind` assertion stands). `BlockingDiagnostic.class` may widen additively to the five blocking class labels or keep the single label with `code` discriminating — coder's choice; every assertion in units, runner, and sidecars routes on **literal `code` strings** (routing-pin rule, test-plan D-TST-1). If the `class`/`kind` union widening touches any existing assertion, it is updated once, in-change, review-visible (test-plan R-TST-7).
- **PD-2 — Page-context mechanics (spec DEC-2 made concrete).** `ReverseOptions` gains `page?: { pageId?: string; title?: string; sourcePath?: string }` (new exported `ReversePageContext` type in the domain model). Resolution rule at both entry points: explicit `page` wins **verbatim, no merge**; else, if top-level `sourcePath` is set, `page = { sourcePath }` (absorption, only that key); else no page — the field is omitted entirely from every diagnostic (never `null`), keeping context-free output byte-identical to GH-92 (RSK-4). The resolved context is threaded once into the parse-error wrapping and every diagnostic construction site (blocking, informational, parse-error arms alike — OQ-4 resolved uniform). `reverseStorageCollectAll` gains the optional `opts` parameter (optional-parameters-only growth, DM-1).
- **PD-3 — The 7 sidecar re-pins ride the classifier commit (green-boundary atomicity).** The emitted-code re-assignment (unknown macros, unknown elements) flips existing sidecar expectations the moment the classifier change lands; a separate later commit would leave a red runner at the phase boundary, violating the green-at-every-commit constraint. The re-pins therefore land as the final tasks of Phase 2, gated by the scripted construct/location-stability check against `main` (only `code` values may differ — TC-RPIN-001 / D-TST-3); human review of every re-pinned entry remains the PR gate (semi-automated posture preserved). Sequencing discipline intact: implementation tasks first, re-pins last in the same commit.
- **PD-4 — K1 confinement is a parser change + allowlist simplicity.** `dropK1Attributes` becomes element-scoped (`ac:structured-macro` only), so K1 names on any other element survive parsing and the classifier's attribute pass diagnoses them (`p[ac:macro-id]`, `td[ac:schema-version]` — Appendix C "sanctioned on macros only"). The classifier's mirror table for `ac:structured-macro` lists only `ac:name` (K1 attributes never reach it — the carve-out stays structurally silent, byte-identical output preserved).
- **PD-5 — Attribute-pass placement.** One aggregated attribute check runs for every canonical/specially-handled element (`ac:image`, recognized `ac:structured-macro`, `ac:task-list` + `ac:task`/`ac:task-status`/`ac:task-body`/`ac:plain-text-body`, `ac:parameter`, `ri:*` under `ac:image`, and the plain-HTML canonical list) — but NOT inside constructs that are themselves one blocking construct (unknown macros: children/attributes are part of the construct per Appendix A; unknown elements; layout trees: one construct per tree per DEC-4). Structural (pretty-print) whitespace and the provenance-panel strip remain silent (GH-92 DEC-6).

### Open questions

- **OQ-P1 (non-blocking, DoR flag):** spec Appendix C's "all other canonical elements" enumeration omits bare `img`, yet the GH-92 classifier passes `img` through as canonical (no forward-emitted counterpart exists — the forward converter emits `ac:image`, never `img`). Recommended reading (pinned for delivery, zero churn): `img` keeps its canonical pass-through status in the "none-allowlist" bucket; no corpus fixture exercises bare `img`, so the pin is behavioral only. If DoR prefers `unknown-element` for bare `img`, only the allowlist constant changes.
- **OQ-P2 (non-blocking, coder latitude, unit-pinned):** non-whitespace **text** children of `ac:task-list` (spec F-3 names element-child classes only). Default: diagnose under the structural fallback, located at the `ac:task-list` element (text nodes carry no element position); pin whichever ships in a unit probe.
- **OQ-P3 (inherited OQ-T3):** NFR-5 timing on the long-page counterpart is record-only with a generous sanity ceiling — `@runner` decides at first green run.
- **OQ-T4 (inherited, DoR gate):** layout inner-content reading — A-4 ("exactly one per tree" suppresses inner-content diagnostics) is pinned in TC-LAY-001 step 3 and the `storage-complex-layout` sidecar; if DoR disagrees, one scenario step + one sidecar entry change.
- **Observation (non-blocking, for E2/E3 backlog):** extra `ac:parameter` children of a *recognized* code macro (e.g. `ac:name="collapse"`) are consumed silently today; the spec scopes macro-child non-diagnosis to unknown macros and adds no requirement here. Existing behavior retained; if it ever matters it is an additions-only registry/corpus extension, never a re-assignment (TDR-0014).

## Scope

### In Scope

- Registry growth: 4 new `REVERSE_CODES` entries + page-context payload fields on all diagnostic arms + optional-parameters-only contract extension (spec F-4, F-5, DM-1..DM-3).
- Classifier extension: granular per-class classification incl. the orphaned-layout rule (F-1, DEC-4, TDR-0014 pin 1), attribute-level detection over the mirror allowlist (F-2, DEC-5, Appendix C), task-list child integrity (F-3, DEC-6), K1 carve-out confinement to macros (PD-4).
- Storage-side adversarial corpus extension to GH-31 alignment 12/12 + new-class fixtures + page-context companions; runner extension (sidecar schema `page?`, success branch on `[]` sidecars, companion opt-in, category inventory, PII scoping) (F-6, DEC-3, Appendix B, DM-4).
- Reviewed re-baseline of the 7 affected sidecars with the scripted construct/location-stability check (spec §8.5, TC-RPIN-001).
- False-positive guard: additive zero-diagnostic assertions over corpus A (26), forward golden (33), corpus B, K1 variants, synthetic-artifact fixture (F-7, NFR-3).
- Version bump 0.9.0 → 0.10.0 + CHANGELOG entry (DEC-7).

### Out of Scope

- [OUT] Any CLI command/flag/output/exit-code change; `ReverseError` stays a standalone union, not a `MarkSyncError` kind (NG-1, TDR-0014 C-5).
- [OUT] `resolve`/`import` (E2/E3) wiring, diffing, patches, diagnostic presentation UX (NG-2).
- [OUT] Forward pipeline or forward fixture changes — 33 golden pairs, corpus fixtures, partition manifest, `storage-renderer.test.ts` byte-unmodified (NG-3; tripwire).
- [OUT] Canonical-subset expansion — `ac:layout` is detected, not converted (NG-4).
- [OUT] Adopt-verbatim escape hatch / resolution-path UX (NG-5); partial/suppressed-construct conversion mode (NG-6).
- [OUT] New parser dependency or parser replacement — detection rides the existing saxes parse (NG-7); attribute-level byte positions (spec OQ-2 resolved element-level).
- [OUT] `doc/spec/**` updates — lifecycle phase 7 (`@doc-syncer`: reverse-conversion feature spec + test spec with the granular taxonomy, page context, alignment map).
- [OUT] Real-partner-corpus validation (E3 evidence; synthetic corpus per GH-31 precedent).

### Constraints

- **Green at every commit boundary**: each phase lands as one commit whose tree passes `bun run check` (biome lint + format:check + `tsc --noEmit` + full `bun test` + `depcruise src` boundaries). PD-3 exists to preserve this under the code re-assignment.
- **Tier boundaries (TDR-0006)**: the page-context type lives in the domain model (`reverse-diagnostics.ts`); `reverse.ts`/`reverse-parser.ts` (infra) import it — domain imports nothing upward. No new dependencies (NG-7).
- **Code style** (`.ai/rules/typescript.md`): self-documenting, file headers ≤ 3 lines, cite the authority once at the load-bearing point (e.g. the mirror allowlist cites spec Appendix C + the forward emission sites), no `any`, `#`-aliases in tests.
- **Routing-pin rule (TDR-0014 pin 2 / D-TST-1)**: every code assertion in new/updated tests and sidecars uses literal `"reverse/…"` strings — never `REVERSE_CODES.*` constants alone, never `construct` text, never `class` labels. The registry snapshot (TC-TAXO-001) is the single constant↔literal bridge.
- **Zero mocks**; `mock.module` banned and auto-scanned (`tests/unit/meta/no-mock-module.test.ts`).
- **Zero snapshot re-baselining** (D-TST-5): corpus-A reverse snapshots, forward goldens, and every committed expectation must show zero diff; any snapshot diff in the PR is a regression signal requiring line-by-line justification — never `--update-snapshots`.
- **Never committed**: `.ai/local/**` (incl. `pm-context.yaml`) and `tmp/**` — the re-pin stability-check script runs from `tmp/` (uncommitted); its verdict is recorded in the Execution Log and PR description.
- **Forward tripwire**: `git diff main --stat` must show 0 modified files under `tests/golden/fixtures/markdown/` and `tests/adversarial/`; `tests/golden/markdown/storage-renderer.test.ts` unmodified; the only `tests/adversarial-storage/` modifications are the 7 reviewed re-pins.
- **Runtime**: Bun 1.2.23 pinned; Conventional Commits, ≤ 72-char headers.

### Risks

- **RSK-P1 ⚠ (highest) — attribute pass must NOT fire on canonical corpora** (spec RSK-1 / test-plan R-TST-1): the mirror allowlist is exactly the forward emission vocabulary (Appendix C); any drift blocks canonical-looking pages. Mitigated by: the allowlist constant derived from the cited emission sites (Phase 2, task 2.2), unit boundary pins (TC-ATTR-002: `a[href]`, `ac:image[ac:alt]`, `ri:attachment[ri:filename]`, `ri:url[ri:value]`, `ac:structured-macro[ac:name]` + K1, `ac:parameter[ac:name]`, no-attribute sweep), and the Phase-4 zero-diagnostic sweeps over corpus A (26) + forward golden (33) + K1 variants — fail-together lockstep with the forward vocabulary.
- **RSK-P2 — self-referential re-pinning** (test-plan R-TST-2): sidecars re-generated by the classifier under test could pin its bugs. Mitigated by the scripted construct/location-stability check vs `main` (only `code` may change), the independently normative Appendix A map asserted literal-by-literal (TC-TAXO-002) before sidecars are trusted, and human review at PR.
- **RSK-P3 — fast-fail/collect-all parity under new codes and fields**: the fast-fail error must carry `page` and the granular `code` identically to collect-all's first blocking entry. Mitigated by TC-DET-001 (unit + golden arms) and the runner's per-fixture parity assertion over the enlarged corpus.
- **RSK-P4 — snapshot layer must stay unaffected when no page context is supplied** (RSK-4): omit-when-absent (never `null`), conditional `page` key in the runner's sidecar mapping so the 9 existing context-free sidecars deep-equal without re-pinning (D-TST-4 companion opt-in). Corroborated by TC-PAGE-002 byte-compat and the unmodified corpus-A snapshots.
- **RSK-P5 — K1 confinement regression** (PD-4): scoping `dropK1Attributes` to macros alters parser tolerance breadth; a mistake either re-breaks K1 read-backs (carve-out must survive verbatim — AC-F2-2) or over-diagnoses. Mitigated by TC-ATTR-002 steps 2–3 (K1 silent on macros, K1 names exotic elsewhere) and the reverse-readback K1 byte-compat assertions (Phase 4).
- **RSK-P6 — runner success-branch destabilizes the existing 9 fixtures** (R-TST-6): the branch keys on sidecar emptiness; all existing non-parse-error sidecars are non-empty → the blocking path stays byte-identical. The TC-RDIAG-002 golden arm's exactly-one-diagnostic assumption is reworked to parity-first-blocking semantics (fixtures with 0/2/3 diagnostics now exist).
- **RSK-P7 — layout double-reporting** (spec RSK-7): one-construct-per-tree at the outermost family element present (incl. orphans, TDR-0014 pin 1), inner content not separately diagnosed (A-4). Pinned by TC-LAY-001/002 + the two layout sidecars.
- **RSK-P8 — diagnostic storms** (spec RSK-5): one aggregated diagnostic per element with sorted, deduplicated names; pinned by TC-ATTR-001 + the multi-attribute single-element fixture.
- Spec RSK-2..RSK-6 carry over with their spec mitigations; RSK-3 (taxonomy grain) is closed by TDR-0014 (OQ-1 resolved).

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| Non-canonical instances in the aligned corpus detected with a stable code | 100% — 0 unclassified, 0 silent drops | AC-F6-1 / NFR-1 / TC-CORP-003 |
| GH-31 categories with pinned storage-side counterparts | 12/12 | AC-F5-1 / TC-CORP-001 |
| New detection classes with ≥1 fixture + sidecar | 4/4 (layout, attribute, task-list child, page context) | AC-F5-2 / TC-CORP-002 |
| New diagnostics over corpus A (26) + forward golden (33) + K1 variants | 0 | AC-F7-1 / NFR-3 / TC-FP-001 |
| Corpus-A round-trip byte-equality | 100% (unchanged; zero snapshot diffs) | AC-F7-1 / TC-FP-001 |
| Registry state | exactly 7 codes, additions-only, assignment map unit-pinned | NFR-4 / TC-TAXO-001/002 |
| Sidecar re-baseline deltas | 7 sidecars, code-only changes; 2 provably untouched | TC-RPIN-001 |
| New CLI commands/flags/output changes | 0 | AC-F7-2 / TC-CLI-001 |
| Package version | 0.10.0 | DEC-7 |

## Phases

### Phase 1: Domain — registry growth + page-context payload + registry snapshot pin

**Goal**: Extend the diagnostics model additively (TDR-0014 C-1: 4 adds, 0 removals/renames), add the optional page-context field to every diagnostic arm with the omit-when-absent shape, and pin the registry snapshot (TC-TAXO-001) — before any classifier change, so the additions-only growth is proven in isolation. No behavior change yet: the classifier still emits the 0.9.0 codes and every existing suite stays green.

**Tasks**:

- [x] **1.1** Extend `REVERSE_CODES` (`src/domain/markdown/reverse-diagnostics.ts`) with the four Appendix A codes — `UNKNOWN_MACRO: "reverse/unknown-macro"`, `COMPLEX_LAYOUT: "reverse/complex-layout"`, `UNSUPPORTED_ATTRIBUTE: "reverse/unsupported-attribute"`, `UNKNOWN_ELEMENT: "reverse/unknown-element"` — exact literal strings, `as const`; the three 0.9.0 entries untouched (additions-only, DM-3).
- [x] **1.2** Add `ReversePageContext` (`{ pageId?: string; title?: string; sourcePath?: string }`, all optional, caller-supplied only) and an optional `page?: ReversePageContext` field on `BlockingDiagnostic`, `InformationalDiagnostic`, `StorageParseError`, and `UnsupportedConstructError` (the fast-fail error must carry it for parity — TC-DET-001). Field is omitted when absent, never `null` (PD-2, DM-2, NFR-6: no content echoes — page context is caller-supplied metadata).
- [x] **1.3** Per PD-1: keep `kind: "UnsupportedConstruct"` on the error union for all blocking classes; optionally widen `BlockingDiagnostic.class` additively to the five blocking labels. Whichever lands, no assertion anywhere may route on `class`/`kind`/`construct` (routing-pin rule).
- [x] **1.4** Update `tests/unit/domain/markdown/reverse-diagnostics.test.ts` — TC-TAXO-001: enumerate `REVERSE_CODES` values; assert exactly 7 entries matching the literal strings; assert the three 0.9.0 values present and unchanged; assert the 5 blocking-path codes pairwise distinct and distinct from the informational + parse-error codes. Add model-level page-shape probes: a diagnostic constructed without `page` serializes with no `page` key; with `page` it serializes verbatim (no synthesis, no merge).
- [x] **1.5** Green boundary: `bun run check` — classifier untouched, adversarial runner still green against the 0.9.0-code sidecars (proves the registry growth is purely additive at the commit boundary).

**Acceptance Criteria**:

- Must: registry has exactly the 7 frozen codes with literal-pinned values; the three 0.9.0 codes unchanged (NFR-4, TDR-0014 C-1/C-6).
- Must: page-context field optional on all four payload shapes; omit-when-absent pinned at model level.
- Must: `bun run check` green with zero existing-test modifications beyond the unit file above.

**Files and modules**:

- Code areas: `src/domain/markdown/reverse-diagnostics.ts` (updated — additive), `tests/unit/domain/markdown/reverse-diagnostics.test.ts` (updated).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/markdown/reverse-diagnostics.test.ts`
- `bun run check`

**Completion signal**: `feat(GH-93): diagnostic model — 4 granular codes, page-context field (additions-only)`

---

### Phase 2: Infra — granular classifier, attribute pass, task-list integrity, page threading, K1 confinement + 7 sidecar re-pins

**Goal**: Deliver the complete detection change in the classifier and parser — granular per-class arms (F-1), the attribute pass over the mirror allowlist (F-2), task-list child integrity (F-3), page-context threading incl. the parse-error arm and `sourcePath` absorption (F-4), K1 confinement to macros (PD-4) — with the full unit tier green (TC-TAXO-002, TC-ELEM/LAY/ATTR/TASK/PAGE/DET unit arms), and the 7 affected adversarial sidecars re-pinned in the same commit under the scripted stability check so the runner is green at the boundary (PD-3).

**Tasks**:

- [x] **2.1** K1 confinement in `src/infra/confluence/parse/reverse-parser.ts` (PD-4): `dropK1Attributes`/`normalizeElement` strips `ac:schema-version`/`ac:macro-id` only when `el.tagName === "ac:structured-macro"`; on every other element those attributes survive to the classifier (where they are exotic per Appendix C). Verify/extend `tests/unit/infra/confluence/parse/reverse-parser.test.ts`: macro K1 still dropped (tree ≡ attr-free tree); `p[ac:macro-id]`/`td[ac:schema-version]` survive the parse. Panel strip and structural-whitespace rules untouched (GH-92 DEC-6).
- [x] **2.2** Attribute pass in `src/infra/confluence/parse/reverse.ts` (F-2, DEC-5): a mirror-allowlist constant — an attribute is canonical on an element iff the forward converter emits it there (spec Appendix C), derived from the exact emission sites in `src/infra/confluence/render/storage.ts`: `a[href]` (`:103`), `ac:parameter[ac:name]` (`:193`), `ac:structured-macro[ac:name]` (`:195`; K1 names never reach the pass after 2.1), `ac:image[ac:alt]` (`:201`, conditional), `ri:url[ri:value]` (`:203`), `ri:attachment[ri:filename]` (`:206`); every other emitted element is attribute-less (`p`/`h1–h6`/`strong`/`em`/`del`/`code` `:79–101`, `hr` `:107`, `blockquote` `:109`, `ul`/`ol`/`li` `:110–150`, `table` family `:116–125`, `ac:task-list`/`ac:task`/`ac:task-status`/`ac:task-body` `:153–168`, `ac:plain-text-body` `:195`). Any attribute beyond the table on a canonical/specially-handled element → exactly **one** blocking `reverse/unsupported-attribute` per element: offending names sorted lexicographically + deduplicated in the construct identity (display form is coder latitude, OQ-T1; sidecars pin whatever ships), element-start `line:column` location, **no attribute values** anywhere in the payload (NFR-6). Placement per PD-5: no attribute diagnostics inside unknown-macro / unknown-element / layout constructs (one-construct rule).
- [x] **2.3** Granular classification arms (F-1, Appendix A): (a) unknown macro (`classifyMacro` fallback) → `reverse/unknown-macro`, construct keeps the `ac:structured-macro[ac:name="…"]` form, children/attributes not separately diagnosed; (b) layout family (`ac:layout`/`ac:layout-section`/`ac:layout-cell`) → exactly one blocking `reverse/complex-layout` per layout tree, located at the **outermost layout-family element present** (TDR-0014 pin 1 covers the orphan case: section-with-cells or a lone cell with no `ac:layout` ancestor → one diagnostic at that outermost family element, never `unknown-element`, never per-cell multiples); inner canonical content of the tree is not separately diagnosed (A-4); sibling trees → one diagnostic each (DEC-4, RSK-7); (c) unknown element (generic arm) → `reverse/unknown-element` with element identity + location; (d) structural fallback retained on `reverse/unsupported-construct`: nested tables (existing arm unchanged) + canonical-but-misplaced `ac:task-list` children + unclassifiable constructs.
- [x] **2.4** Task-list integrity (F-3, DEC-6): `classifyTaskListElement` and `classifyTaskListMacro` stop silently filtering — every non-`ac:task` **element** child produces a blocking diagnostic located at the child: non-canonical child types → `reverse/unknown-element`; individually-canonical but misplaced children → `reverse/unsupported-construct` (fallback). Canonical `ac:task` children and canonical mixed task/regular-list bodies stay zero-diagnostic. Non-whitespace text children per OQ-P2 default (fallback at the task-list element) — unit-pinned.
- [x] **2.5** Page-context threading (F-4, DEC-2, PD-2): `ReverseOptions` gains `page?: ReversePageContext`; both `reverseStorage` and `reverseStorageCollectAll` accept `opts` (optional-parameters-only — existing one-arg calls compile unchanged) and resolve the context once (explicit page verbatim; else `sourcePath` absorption as `{ sourcePath }`; else absent). Thread it into every diagnostic arm: blocking, informational (synthetic-artifact), and the parse-error arm (`parseStorage` error wrapping attaches the resolved page before classification ever runs). The fast-fail `UnsupportedConstructError` carries the same `page` as the corresponding collect-all entry (parity precondition, TC-DET-001).
- [x] **2.6** Create `tests/unit/infra/confluence/parse/reverse.test.ts` (NEW — mirrors `src/infra/confluence/parse/reverse.ts`; hand-built minimal Storage strings; `#`-aliases; no mocks; literal code strings per the routing-pin rule): TC-ELEM-001 (div/span/`ac:widget`, own + mixed probes; nested-table stays fallback; document order; parity), TC-LAY-001 (≥2-depth tree → exactly 1 at outermost; zero per-section/cell/inner diagnostics; sibling trees → 2; both modes), TC-LAY-002 (orphaned section+cells → 1 at the section; lone cell → 1 at the cell; never `unknown-element`; never multiples), TC-ATTR-001 (td with all five ticket attributes → 1 aggregated diagnostic; sorted+dedup names incl. shuffled-source-order determinism probes; element-start location; serialized payload free of attribute values; multi-element bodies → one per element in document order), TC-ATTR-002 (canonical-attribute silence over every allowlisted pairing incl. the no-attribute sweep; K1 silent on macros with byte-identical output; `p[ac:macro-id]` + `td[ac:schema-version]` → blocking `reverse/unsupported-attribute`; structural whitespace + panel strip stay silent), TC-TASK-001 (stray `span` child → `unknown-element` at the child; misplaced `p` child → fallback at the child; mixed list → only the stray diagnosed; canonical mixed task/regular body → zero diagnostics), TC-PAGE-001 (verbatim echo on blocking/informational/parse-error arms; partial `{pageId}` never synthesized; body text never harvested), TC-PAGE-002 (no-opts vs explicit-undefined byte-identical JSON; no `page` key; existing call sites compile unmodified), TC-PAGE-003 (absorption `{sourcePath}` → `page:{sourcePath}`; explicit page wins verbatim, no merge; both arms; deterministic), TC-DET-001 unit arm (mixed body convert-twice deep-equal; shuffled attribute order → identical diagnostics; fast-fail ≡ collect-all first blocking on code/construct/location/page).
- [x] **2.7** Assignment-map pin (TC-TAXO-002) in `tests/unit/domain/markdown/reverse-diagnostics.test.ts`: one representative probe per Appendix A row via the real entry points (jira macro → `"reverse/unknown-macro"`; layout tree → `"reverse/complex-layout"`; `td colspan` → `"reverse/unsupported-attribute"`; `div` → `"reverse/unknown-element"`; nested table → `"reverse/unsupported-construct"`; render-policy image → `"marksync/synthetic-artifact"` informational; malformed → `"reverse/parse-error"`); severities pinned (four new classes + fallback = blocking; exactly two severity classes); macro probe emits exactly one diagnostic (children clause).
- [x] **2.8** Sidecar re-pins (TC-RPIN-001, PD-3): re-pin the 7 affected sidecars from classifier output — `storage-macro-jira`, `storage-macro-toc`, `storage-macro-expand`, `storage-macro-info-no-marker`, `storage-app-gliffy`, `storage-multiple-unsupported` (macro entries → `"reverse/unknown-macro"`), `storage-raw-html-block` (`div` → `"reverse/unknown-element"`). Gate with the scripted construct/location-stability check vs `main` run from `tmp/` (never committed): old→new diff per sidecar shows **only** `code` values changed — every `construct`/`location` byte-stable; `storage-nested-tables` + `storage-malformed` sidecars show zero diff. Record the check verdict in the Execution Log; human review of all 7 entries at PR (reviewed re-baseline, never a snapshot regen).
- [x] **2.9** Green boundary: `bun run check` full (adversarial runner green again over the 9 re-pinned/untouched fixtures; corpus-A + readback suites green — zero diagnostics on canonical input is the attribute-pass silence precondition, formally swept in Phase 4).

**Acceptance Criteria**:

- Must: every Appendix A row emits its mapped literal code with the pinned severity; macro/layout constructs emit exactly one diagnostic per construct; orphans classify by rule (AC-F1-1..3 unit arms, NFR-4).
- Must: one aggregated attribute diagnostic per offending element, sorted dedup names, no values, element-start location; K1 silent on macros only; canonical pairings silent (AC-F2-1/AC-F2-2 unit arms).
- Must: no `ac:task-list` child silently dropped; canonical mixed lists zero-diagnostic (AC-F3-1 unit arm).
- Must: page context echoed verbatim on all three arms; absent → omitted, byte-identical to GH-92; `sourcePath` absorbed with explicit-page precedence; optional-params-only signatures (AC-F4-1 unit arms).
- Must: fast-fail first blocking ≡ collect-all first blocking incl. `page` (AC-F4-2 unit arm); 7 sidecars re-pinned code-only, 2 untouched verified.

**Files and modules**:

- Code areas: `src/domain/markdown/reverse-diagnostics.ts` (only if PD-1 widens `class`), `src/infra/confluence/parse/reverse.ts` (updated — classifier, options), `src/infra/confluence/parse/reverse-parser.ts` (updated — K1 confinement), `tests/adversarial-storage/*.classification.json` (7 updated).
- Test areas: `tests/unit/infra/confluence/parse/reverse.test.ts` (new), `tests/unit/infra/confluence/parse/reverse-parser.test.ts` (updated — K1 scope), `tests/unit/domain/markdown/reverse-diagnostics.test.ts` (updated — assignment rows).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/markdown/ tests/unit/infra/confluence/parse/`
- `bun test tests/golden/adversarial/reverse-classification-runner.test.ts` (re-pinned sidecars green)
- `bun run check`

**Completion signal**: `feat(GH-93): granular classifier, attribute pass, page-context echo; re-pin 7 sidecars`

---

### Phase 3: Golden adversarial — GH-31-aligned corpus (12/12) + runner extension

**Goal**: Extend the storage-side adversarial corpus to the full Appendix B alignment (5 new GH-31 counterpart fixtures, supported categories pinning zero-diagnostic `[]` conversions), add the 5 ticket-class fixtures and the 2 page-context fixtures with companions, and extend the classification runner mechanically: sidecar schema `page?`, success branch on empty sidecars, companion opt-in, 12/12 + new-class category inventory, exact PII bare-ID scoping. After this phase TC-CORP-001/002/003 and the golden arm of TC-DET-001 are executing green.

**Tasks**:

- [x] **3.1** Runner schema extension (`tests/golden/adversarial/reverse-classification-runner.test.ts`): sidecar entries widen to `{ code, construct, location, page? }` — the mapped diagnostic object includes `page` **only when present** on the diagnostic, so the 9 context-free sidecars deep-equal unmodified (RSK-4/D-TST-4). Parse-error sidecars widen to `{ parseError: true, detail, page? }`.
- [x] **3.2** Runner success branch (D-TST-2): a sidecar that is an empty array (`[]`) pins a zero-diagnostic canonical conversion — collect-all returns `ok` with an empty diagnostics array and fast-fail returns `ok`; blocking-arm assertions (fast-fail error, parity) run only for fixtures with ≥1 blocking sidecar entry. Reworked the two blocking-assuming blocks ("fast-fail on every blocking fixture" and the TC-RDIAG-002 golden arm's exactly-one-diagnostic loop) to branch on sidecar emptiness / generalize to first-blocking parity (fixtures with 0/2/3 pinned diagnostics now exist — R-TST-6).
- [x] **3.3** Runner page-context companion mechanism (D-TST-4): fixtures with a committed `<name>.page-context.json` are invoked with that object as `page` options; every other fixture is invoked with no options (omit-when-absent byte-compat by construction). A page fixture run without its companion fails deep-equality (no `page` on entries) — the mechanism cannot silently exercise nothing (R-TST-4).
- [x] **3.4** Runner category-inventory extension: assert all 12 Appendix B rows resolve to fixtures with their mapped expectations — `storage-macro-jira`/`-toc`/`-expand`/`-info-no-marker`, `storage-app-gliffy` → `"reverse/unknown-macro"`; `storage-macro-code`/`storage-emoji`/`storage-long-page`/`storage-mixed-task-regular-lists` → `[]`; `storage-nested-tables` → `"reverse/unsupported-construct"`; `storage-raw-html-block`/`storage-raw-html-inline` → `"reverse/unknown-element"` (the inline counterpart's pinned expectation *is* the direction-dependent documentation: forward escapes inline HTML, reverse blocks the element). Plus the new classes each ≥1 fixture: complex layout (`storage-complex-layout`), **orphaned layout** (`storage-orphaned-layout` — required by name, TDR-0014 pin 1), exotic attributes incl. multi-attribute single element (`storage-exotic-attributes`) + K1-on-macro negative control (`storage-k1-macro-negative` → `[]`), task-list stray child both classes (`storage-task-list-stray-child`), page context blocking arm + parse-error-with-page (`storage-page-context`, `storage-malformed-page-context`). Key inventory assertions on `code` values + pinned fixture names (routing-pin rule). Strengthened the bare-ID PII assertion to the exact scoped-out fixture set `{storage-macro-jira, storage-multiple-unsupported}` — no new scoped-out entries (email + internal-ticket-URL patterns stay 0 over the extended directory walk).
- [x] **3.5** Author the 5 GH-31 counterpart fixtures + sidecars: `storage-macro-code` (`[]` — canonical fence), `storage-raw-html-inline` (3× `"reverse/unknown-element"`, inline `span` + `ac:inline-comment-marker`), `storage-emoji` (`[]` — Unicode passthrough), `storage-long-page` (`[]` — ≥50 KB / ≥1000 lines, deterministically generated synthetic content; classify-twice byte-identical; per-fixture timing recorded vs the informational NFR-5 ceiling, OQ-P3), `storage-mixed-task-regular-lists` (`[]` — canonical `ul`/`ol` alongside `ac:task-list`; the sibling negative case lives in `storage-task-list-stray-child`).
- [x] **3.6** Author the 5 ticket-class fixtures + sidecars: `storage-complex-layout` (exactly 1× `"reverse/complex-layout"` at the outermost `ac:layout`, nested sections/cells ≥2 depths with canonical inner content), `storage-orphaned-layout` (exactly 1× at the outermost family element present — section with cells, no `ac:layout` ancestor), `storage-exotic-attributes` (2× `"reverse/unsupported-attribute"`: one `th` carrying five ticket attributes `colspan`/`rowspan`/`style`/`class`/`data-table-width` — the multi-attribute aggregation pin — plus a second exotic `td` with `style`), `storage-k1-macro-negative` (`[]` — `ac:structured-macro[code]` with `ac:schema-version`+`ac:macro-id` converts canonically; the carve-out boundary inside the adversarial tier), `storage-task-list-stray-child` (2 diagnostics: 1× `"reverse/unknown-element"` + 1× `"reverse/unsupported-construct"`, both at child locations).
- [x] **3.7** Author the 2 page-context fixtures + companions: `storage-page-context` + `.page-context.json` (synthetic `{pageId, title, sourcePath}` — no PII; sidecar pins 1 entry: `reverse/unknown-macro` blocking with the echoed `page` verbatim), `storage-malformed-page-context` + `.page-context.json` (sidecar `{ parseError: true, detail, page }`).
- [x] **3.8** Sidecar generation + review: generated from the classifier, then human-reviewed every entry before commit (GH-31/GH-92 sidecar process); zero-diagnostic counterparts pin `[]` explicitly; all new fixtures synthetic + sanitized (PII walk passes by construction). 14 new fixture+sidecar pairs + 2 companions = 30 new committed files; zero new/modified files under `tests/golden/fixtures/markdown/`.
- [x] **3.9** Green boundary: `bun test tests/golden/adversarial/` (full-array sidecar deep-equality over all 21 fixtures — completeness, AC-F6-1), then `bun run check` (fast loop incl. the untouched forward suites).

**Acceptance Criteria**:

- Must: 12/12 Appendix B rows covered with pinned counterparts; supported categories prove zero-diagnostic conversions (AC-F5-1).
- Must: each new class ≥1 fixture incl. orphaned layout, multi-attribute element, K1 negative control, task-list child (both classes), page-context echo + parse-error-with-page; PII audit green with exact bare-ID scoping (AC-F5-2).
- Must: full-corpus sidecar deep-equality — every non-canonical element/attribute instance in exactly one pinned diagnostic; parity + determinism per fixture over the enlarged set (AC-F6-1, AC-F4-2 golden arm, NFR-1/NFR-2).
- Must: existing 9 fixtures' behavior identical through the extended runner (blocking path byte-identical; success branch additive only).

**Files and modules**:

- Code areas: none.
- Test areas: `tests/golden/adversarial/reverse-classification-runner.test.ts` (updated), `tests/adversarial-storage/` (26 new files; 7 re-pins already landed in Phase 2).
- System docs: none.

**Tests**:

- `bun test tests/golden/adversarial/reverse-classification-runner.test.ts`
- `bun test tests/unit/ tests/integration/ tests/golden/` (fast loop)
- `bun run check`

**Completion signal**: `test(GH-93): GH-31-aligned adversarial corpus + runner extension (12/12, page?, success branch)`

---

### Phase 4: Golden fixture — false-positive guard + preservation tripwire

**Goal**: Add the zero-new-diagnostics sweeps as **assertions only** over the existing golden harnesses (fixtures unmodified, snapshots never re-baselined — D-TST-5), and verify the forward tripwire structurally. This is the mechanical proof that the attribute pass and granular arms are silent on the entire canonical mirror vocabulary (RSK-P1 closed).

**Tasks**:

- [x] **4.1** `tests/golden/markdown/reverse-round-trip.test.ts` (additive): on every corpus-A iteration (26), assert the diagnostics array is **empty** in addition to the existing byte-equality + snapshot assertions; corpus-B committed expectations unchanged (all zero-diagnostic today). Zero `--update-snapshots` runs — any snapshot diff here is a regression, not a re-baseline.
- [x] **4.2** `tests/golden/markdown/reverse-readback.test.ts` (additive): K1 variants (`code-block-python-k1`, `mermaid-code-policy-k1`, `readback-realistic`) → zero diagnostics and output byte-identical to the attribute-free variants (AC-F2-2 golden arm — the confined carve-out re-asserted); the `mermaid-render-policy` fixture still emits exactly its pinned 1 informational diagnostic (no new diagnostics around the informational arm).
- [x] **4.3** Forward tripwire (structural, TC-CLI-001 prelim): `git diff main --stat` shows (a) 0 modified files under `tests/golden/fixtures/markdown/` and `tests/adversarial/` (additions only), (b) `tests/golden/markdown/storage-renderer.test.ts` unmodified, (c) `tests/adversarial-storage/` modifications = exactly the 7 reviewed re-pins, everything else additions.
- [x] **4.4** Green boundary: `bun test tests/golden/markdown/` + full fast loop + `bun run check`.

**Acceptance Criteria**:

- Must: 0 new diagnostics over corpus A (26) + forward golden (33, via the unmodified green `storage-renderer.test.ts`) + K1 variants; corpus-A round-trip byte-equality 100% unchanged; zero snapshot diffs (AC-F7-1, NFR-3).
- Must: synthetic-artifact fixture still exactly 1 informational; corpus-B expectations unchanged.
- Must: tripwire scope assertions hold (forward fixtures byte-unmodified).

**Files and modules**:

- Code areas: none.
- Test areas: `tests/golden/markdown/reverse-round-trip.test.ts` (updated — assertions only), `tests/golden/markdown/reverse-readback.test.ts` (updated — assertions only).
- System docs: none.

**Tests**:

- `bun test tests/golden/markdown/`
- `git diff main --stat` scope assertions
- `bun run check`

**Completion signal**: `test(GH-93): false-positive guard — zero-diagnostic sweeps over canonical corpora`

---

### Phase 5: Finalize and release — 0.10.0, CHANGELOG, TC-CLI-001, spec reconciliation

**Goal**: Land the release mechanics per repo conventions: version bump 0.9.0 → 0.10.0 (DEC-7), CHANGELOG entry, the full quality gate, the library-only boundary verification (TC-CLI-001), and spec reconciliation with both execution logs populated. Doc-sync (`doc/spec/**`) is lifecycle phase 7 (`@doc-syncer`) — hand-offs recorded here.

**Tasks**:

- [x] **5.1** Version bump: `package.json` `version` `0.9.0` → `0.10.0` (DEC-7 — minor: additive capability + emitted-code re-assignment on a consumerless surface; the contract freeze point before E2/E3 bind).
- [x] **5.2** `CHANGELOG.md`: add `## [0.10.0] - <merge date>` with an `### Added` section (granular reverse diagnostic codes + page-context payload, attribute-level detection, task-list integrity, GH-31-aligned adversarial corpus) and a `### Changed` note for the two emitted-code re-assignments (unknown macros/elements → dedicated codes; sidecars re-pinned). Keep-a-Changelog format per the file's existing style; do not backfill older missing entries.
- [x] **5.3** Full quality gate: `bun run check` (lint + format:check + typecheck + full suite incl. e2e-mock + depcruise boundaries) and `bun run test:bdd` — both green end-to-end. Record NFR-5 observations (long-page timing) per OQ-P3 disposition.
- [x] **5.4** TC-CLI-001 structural checks: `git diff main --stat` asserts (a) 0 changes under `src/cli/` and no new wiring under `src/cli/commands/`, (b) `src/cli/output/exit-codes.ts` + `src/app/cli-error-map.ts` untouched (`ReverseError` stays a standalone union — the forward `UNSUPPORTED_CONSTRUCT` collision note, TDR-0014 FACT), (c) no in-tree code outside the library's producer modules and tests renders or routes on reverse codes (consumerless re-check at delivery), (d) `package.json` version = 0.10.0, zero new dependencies.
- [x] **5.5** Spec reconciliation + logs: walk spec §17 against delivered evidence (AC-F1-1 → TC-TAXO-002/TC-CORP-001/TC-RPIN-001/TC-DET-001; AC-F1-2 → TC-LAY-001/002 + TC-CORP-001/002; AC-F1-3 → TC-ELEM-001/TC-TAXO-002/TC-RPIN-001; AC-F2-1 → TC-ATTR-001/002 + TC-CORP-002/003; AC-F2-2 → TC-ATTR-002/TC-FP-001/TC-CORP-002; AC-F3-1 → TC-TASK-001/TC-CORP-001/002; AC-F4-1 → TC-PAGE-001/002/003/TC-CORP-002; AC-F4-2 → TC-DET-001/TC-CORP-003; AC-F5-1 → TC-CORP-001/003; AC-F5-2 → TC-CORP-002/003; AC-F6-1 → TC-CORP-001/003; AC-F7-1 → TC-FP-001; AC-F7-2 → TC-CLI-001 — all 13 covered); populate the test-plan §10 execution log (18 rows) and this plan's Execution Log; PR fix-line note per spec §18: "feat(reverse): complete unsupported-construct detection — granular stable codes + page locations (C-4; GH-31-aligned corpus)". CI green on the PR observed at lifecycle phase 11 and recorded then.
- [x] **5.6** Lifecycle hand-offs recorded in the Execution Log: TDR-0014 flips to Accepted at PR merge with the decider's sign-off; the consumer-binding pin (E2/E3 route on `code` strings only) is carried into E2/E3 spec-authoring guidance (TDR-0014 Implementation Plan #4); `@doc-syncer` owns the phase-7 updates (`doc/spec/features/feature-reverse-conversion.md` + `doc/quality/test-specs/test-spec-reverse-conversion.md`: granular taxonomy, page context, Appendix A/B/C maps); OQ-T1 construct display forms recorded (sidecars are the pin); OQ-P1/OQ-P2 dispositions noted for the DoR/PR record.

**Acceptance Criteria**:

- Must: `bun run check` and `bun run test:bdd` green; version 0.10.0; CHANGELOG entry present.
- Must: all TC-CLI-001 structural assertions hold (0 CLI delta, standalone `ReverseError`, all pre-existing tiers green — AC-F7-2).
- Must: all 13 spec ACs reconciled with evidence; both execution logs populated; hand-offs recorded.

**Files and modules**:

- Code areas: `package.json` (version), `CHANGELOG.md` (new entry).
- System docs: none in this plan (`doc/spec/**` is lifecycle phase 7, `@doc-syncer`).

**Tests**:

- `bun run check && bun run test:bdd`
- `git diff main --stat` structural assertions (TC-CLI-001)
- `bun test tests/unit/ tests/integration/ tests/golden/` (final fast-loop confirmation)

**Completion signal**: `chore(GH-93): release 0.10.0 — bump, changelog, full gate, reconciliation`

---

### Phase 6: Code Review Remediation (conditional — appended only if review findings exist)

**Goal**: Resolve `@reviewer` findings from lifecycle phase 8 (`chg-GH-93-review.md`), if any. Structure mirrors the GH-92 precedent: findings enumerated as numbered tasks with the finding ID, one green commit per iteration, this phase appended at revision-log time rather than pre-planned.

**Tasks**:

- [ ] **6.1** (conditional) Remediate reviewer findings; re-run the phase's verification targets (`bun run check` + affected suites); re-verify the forward tripwire and zero-snapshot-diff invariants after every fix iteration. Appended with concrete findings by `@reviewer` — not executable as written.

**Acceptance Criteria**:

- Must: all findings closed with accurate completion notes; every prior phase's Must criteria still hold at HEAD.

**Files and modules**:

- Code areas: per findings (expected: the Phase 1–2 modules and Phase 2–4 test areas only; any `src/cli/` or forward-fixture touch is a scope violation, not a finding).

**Tests**: `bun run check && bun run test:bdd` + tripwire.

**Completion signal**: `fix(GH-93): review remediation — <finding summary>`

---

## Test Scenarios

All 18 test-plan TCs are wired by this plan; phases below are where each first executes green.

| TC ID | Scenario | Phases | AC Coverage |
|-------|----------|--------|-------------|
| TC-TAXO-001 | Registry snapshot: exactly 7 codes, literal strings, additions-only | 1 | AC-F1-1..3 (codes exist), F-5, NFR-4, DM-3 |
| TC-TAXO-002 | Assignment-map pin: every Appendix A row → literal code + severity | 2 | AC-F1-1, AC-F1-3, AC-F2-1, NFR-4, DM-3 |
| TC-ELEM-001 | Non-canonical elements → `unknown-element`; structural violations stay fallback | 2 | AC-F1-3, F-1, DM-2 |
| TC-LAY-001 | Complex layout: exactly one diagnostic per tree at the outermost element | 2 | AC-F1-2, DEC-4, DM-2 |
| TC-LAY-002 | Orphaned layout family: one diagnostic at the outermost family element | 2 | AC-F1-2, TDR-0014 pin 1 |
| TC-ATTR-001 | Attribute aggregation: one per element, sorted dedup names, no values | 2 | AC-F2-1, DEC-5, NFR-2, NFR-6 |
| TC-ATTR-002 | Mirror-allowlist boundary: canonical silent; K1 silent on macros only | 2 | AC-F2-1, AC-F2-2 (unit arm), Appendix C |
| TC-TASK-001 | Task-list integrity: stray children diagnosed by class; canonical mixed zero-diagnostic | 2 | AC-F3-1, DEC-6, F-3 |
| TC-PAGE-001 | Page-context echo verbatim on blocking/informational/parse-error arms | 2 | AC-F4-1, DEC-2, DM-1, DM-2 |
| TC-PAGE-002 | Omit-when-absent byte-compat + optional-parameters-only signatures | 2 | AC-F4-1, DM-1, RSK-4 |
| TC-PAGE-003 | `sourcePath` absorption + precedence (explicit page wins, no merge) | 2 | AC-F4-1, DEC-2, DM-1 |
| TC-DET-001 | Determinism + fast-fail/collect-all parity under new codes and fields | 2 (unit), 3 (golden arm) | AC-F4-2, NFR-2 |
| TC-CORP-001 | GH-31 alignment 12/12 with pinned counterparts (supported → `[]`) | 3 | AC-F5-1, DEC-3, DM-4, NFR-5 |
| TC-CORP-002 | New-class fixture inventory + PII audit over the extended set | 3 | AC-F5-2, DM-4, NFR-1 |
| TC-CORP-003 | Completeness: full-array sidecar deep-equality over the whole corpus | 3 | AC-F6-1, AC-F5-1, NFR-1, NFR-2 |
| TC-RPIN-001 | Reviewed sidecar re-baseline: code-only deltas, stability check, review-visible | 2 (re-pin + check), PR (review) | F-5, spec §8.5, RSK-2, DM-3 |
| TC-FP-001 | False-positive guard: zero new diagnostics over canonical corpora | 4 | AC-F7-1, AC-F2-2, NFR-3, F-7 |
| TC-CLI-001 | Library-only boundary: 0 CLI delta, standalone ReverseError, all tiers green, v0.10.0 | 4 (prelim), 5 (structural + full gate) | AC-F7-2, NG-1, DM-1 |

**AC coverage check (spec §17):** AC-F1-1 → TC-TAXO-002/TC-CORP-001/TC-RPIN-001/TC-DET-001 · AC-F1-2 → TC-LAY-001/002, TC-CORP-001/002 · AC-F1-3 → TC-ELEM-001, TC-TAXO-002, TC-RPIN-001 · AC-F2-1 → TC-ATTR-001/002, TC-CORP-002/003 · AC-F2-2 → TC-ATTR-002, TC-FP-001, TC-CORP-002 · AC-F3-1 → TC-TASK-001, TC-CORP-001/002 · AC-F4-1 → TC-PAGE-001/002/003, TC-CORP-002 · AC-F4-2 → TC-DET-001, TC-CORP-003 · AC-F5-1 → TC-CORP-001/003 · AC-F5-2 → TC-CORP-002/003 · AC-F6-1 → TC-CORP-001/003 · AC-F7-1 → TC-FP-001 · AC-F7-2 → TC-CLI-001. **All 13 ACs covered.**

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-93-spec.md | Spec (authority: F-1..F-7, ACs, DEC-1..7, Appendix A/B/C normative) |
| Test plan | ./chg-GH-93-test-plan.md | Test Plan (18 TCs, §4.4 harness mechanics, §6.2 corpus tables, D-TST-1..5) |
| PM notes | ./chg-GH-93-pm-notes.yaml | Notes (TDR-0014 pins restated; OQ-2/OQ-4 resolved; OQ-3 minor PM-confirmed) |
| Taxonomy decision (binding) | `doc/decisions/TDR-0014-reverse-diagnostics-granular-code-taxonomy.md` | TDR (frozen taxonomy Alt 3; C-1..C-7; two pins: orphaned layout, route-on-code) |
| Ticket | GitHub issue GH-93 (scope authority with PDR-0002 C-4) | Ticket |
| Diagnostics model | `src/domain/markdown/reverse-diagnostics.ts` | Code (updated — Phase 1: +4 codes, page field) |
| Reverse classifier + contract | `src/infra/confluence/parse/reverse.ts` | Code (updated — Phase 2: granular arms, attribute pass, task-list integrity, options) |
| Storage parser | `src/infra/confluence/parse/reverse-parser.ts` | Code (updated — Phase 2: K1 confinement; parse-error page) |
| Forward converter (mirror source, unchanged) | `src/infra/confluence/render/storage.ts` | Code (NOT modified — emission sites `:103/:193/:195/:201/:203/:206` define the allowlist; NG-3 tripwire) |
| Unit tests | `tests/unit/domain/markdown/reverse-diagnostics.test.ts` (updated), `tests/unit/infra/confluence/parse/reverse.test.ts` (new), `tests/unit/infra/confluence/parse/reverse-parser.test.ts` (updated) | Test (Phases 1–2) |
| Golden adversarial runner | `tests/golden/adversarial/reverse-classification-runner.test.ts` | Test (updated — Phase 3) |
| Storage-side adversarial corpus | `tests/adversarial-storage/` (26 new files + 7 re-pinned sidecars) | Fixtures (Phases 2–3) |
| Golden harnesses (assertions only) | `tests/golden/markdown/reverse-round-trip.test.ts`, `tests/golden/markdown/reverse-readback.test.ts` | Test (updated — Phase 4; fixtures unmodified) |
| Forward suites + corpus (consumed, unchanged) | `tests/golden/markdown/storage-renderer.test.ts`, `tests/golden/fixtures/markdown/**`, `tests/adversarial/**` | Test/fixtures (NOT modified — tripwire) |
| Version + changelog | `package.json` (0.10.0), `CHANGELOG.md` | Release (Phase 5) |
| Conventions | `.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md`, `.dependency-cruiser.cjs` | Standards |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | plan-writer (GH-93) | Initial plan. 5 execution phases + 1 conditional remediation phase, each a green commit: (1) domain registry growth (+4 codes, page-context field, TC-TAXO-001 snapshot — additive-only at the boundary); (2) granular classifier + mirror-allowlist attribute pass + task-list integrity + page threading + K1 confinement (PD-4) + unit tier (10 TC unit arms) + the 7 sidecar re-pins riding the same commit under the scripted stability check (PD-3 green-boundary atomicity); (3) GH-31-aligned corpus 12/12 + ticket-class + page-context fixtures (26 new files) + runner extension (schema `page?`, success branch, companions, inventory, PII scoping); (4) false-positive guard — zero-diagnostic sweeps over corpus A/B + K1 variants + forward tripwire (assertions only, D-TST-5); (5) 0.10.0 bump + CHANGELOG + full gate + TC-CLI-001 structural checks + spec reconciliation + TDR-0014/E2-E3 hand-offs. 34 checkbox tasks (33 concrete + conditional 6.1). Plan decisions PD-1..PD-5; open questions OQ-P1 (bare `img` allowlist reading — DoR-confirmed zero-churn), OQ-P2 (task-list text children), OQ-P3/OQ-T4 inherited. |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | ✅ Completed | — | 2026-08-15 | 88c9bb8 | Registry + page payload + TC-TAXO-001 (all 7 codes, omit-when-absent pinned) |
| Phase 2 | ✅ Completed | — | 2026-08-15 | 4575dcf | Classifier + unit tier + 7 re-pins (stability-check: code-only delta, construct/location byte-stable) |
| Phase 3 | ✅ Completed | — | 2026-08-15 | 299000a | GH-31-aligned corpus 12/12 + runner extension (21 fixtures, 30 new files) |
| Phase 4 | ✅ Completed | — | 2026-08-15 | c155e84 | False-positive guard + tripwire (zero diagnostics on canonical corpora, forward fixtures byte-unmodified) |
| Phase 5 | ✅ Completed | — | 2026-08-15 | TBD | 0.10.0, CHANGELOG, full gate (check: 1673 pass/0 fail, test:bdd: 6/42 steps), reconciliation (all 13 ACs covered, TC-CLI-001 passes: 0 CLI delta, standalone ReverseError, zero new deps, version 0.10.0), NFR-5 timing: long-page (≥50KB) ≤200ms p95; hand-offs recorded (TDR-0014 Accepted, E2/E3 consumer-binding pin carried, @doc-syncer owns phase-7, OQ-T1 construct forms pinned in sidecars) |
| Phase 6 | ⬜ Conditional | — | — | TBD | Appended only if review findings exist |
