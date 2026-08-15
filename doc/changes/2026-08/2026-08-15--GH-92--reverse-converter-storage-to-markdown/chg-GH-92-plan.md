---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-92-reverse-converter-storage-to-markdown
status: Proposed
created: 2026-08-15T00:00:00Z
last_updated: 2026-08-15T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0003, feature, priority:critical, reverse-conversion, E1]
links:
  change_spec: ./chg-GH-92-spec.md
  test_plan: ./chg-GH-92-test-plan.md
  parser_decision: ../../../decisions/TDR-0012-reverse-storage-xml-parser-saxes.md
summary: "Deterministic mirror of the forward converter — Confluence Storage Format → canonical-form Markdown (ADR-0005 subset) — with 100% golden round-trip fidelity (reverse(forward(md)) === normalize(md)), provenance-panel strip, mermaid wrapper handling, K1 read-back tolerance, and two-class C-4 diagnostics (stable codes + Storage locations). Library-only (no CLI); saxes behind the infra-tier port per TDR-0012; version 0.8.2 → 0.9.0."
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-92: feat: reverse converter — Confluence Storage Format → Markdown (canonical GFM subset, deterministic)

## Context and Goals

MarkSync converts only Markdown→Storage today. This change adds the reverse direction for the same canonical GFM subset (ADR-0005): a Storage XHTML string in, canonical-form Markdown out, with 100% golden-fixture round-trip fidelity (`reverse(forward(md)) === normalize(md)` byte-wise), marksync-structure handling on read-back (panel strip, mermaid unwrap, render-policy artifact classification, K1 attribute tolerance), and C-4-compliant diagnostics (blocking `unsupported-construct` + informational `marksync-synthetic-artifact`, stable codes + Storage locations, fast-fail/collect-all parity). It is the MS-0003 E1 foundation that `resolve` (E2) and `import` (E3) consume — GH-92 blocks MS3-E2-S1, MS3-E2-S3, MS3-E3-S1. Library-only (PM-DEC-2); the forward pipeline and its 33 golden pairs are the byte-stable regression tripwire (NG-3).

**Binding inputs:** the spec (chg-GH-92-spec.md — ACs, DEC-1..7, Appendix A construct mirror, Appendix B canonical emission form), the test plan (chg-GH-92-test-plan.md — 19 TCs, corpus partition 26 A / 7 B / 5 Storage-only / 9 adversarial, normative harness mechanics §4.4), and **TDR-0012** (saxes selected for Storage→HAST behind the infra-tier port; mandatory pre-lock spike before the dependency pin is final; @xmldom/xmldom is the swap-target fallback).

**Key goals (spec §4):** G-1 deterministic conversion engine · G-2 100% round-trip via the golden harness · G-3 marksync-structure read-back handling · G-4 diagnostics with stable codes + locations · G-5 one normative canonical-form definition shared by serializer and normalizer · G-6 library-only delivery, forward byte-unchanged, 0.8.2 → 0.9.0.

### Plan decisions (spec-delegated latitude, pinned here)

- **PD-1 — Module layout (spec DEC-4 latitude).** Domain tier (adapter-agnostic): `src/domain/markdown/reverse-diagnostics.ts` (DM-2 model), `src/domain/markdown/hast-to-markdown.ts` (canonical serializer), `src/domain/markdown/normalize.ts` (`normalizeMarkdown`). Infra tier (Confluence-specific): `src/infra/confluence/parse/reverse-parser.ts` (saxes → Storage-HAST + read-back normalization), `src/infra/confluence/parse/reverse.ts` (classifier + content mapping + DM-1 entry `reverseStorage` / `reverseStorageCollectAll`). Test paths then match the test plan's defaults exactly (`tests/unit/domain/markdown/normalize.test.ts`, `tests/unit/domain/markdown/reverse-diagnostics.test.ts`, `tests/unit/infra/confluence/parse/reverse-parser.test.ts`).
- **PD-2 — Diagnostic model is a standalone `ReverseError` union, NOT new `MarkSyncError` kinds** (spec §7.1 grants "reuse-vs-new-arm latitude"). Rationale: typescript.md's adding-a-kind rule requires updating `assertNeverMarkSyncError`, `mapMarkSyncErrorToCommandError`, and `CODE_TO_EXIT` in the same PR — all under `src/cli/` — which would violate AC-F6-1's 0-CLI-delta invariant (NG-1/PM-DEC-2). The reverse contract returns `Result<ReverseSuccess, ReverseError>`; E2/E3 add presentation/exit-code mappings in their own changes. Shape requirement from test-plan §4.4: the blocking diagnostic object IS the fast-fail error payload, so `collectAll.diagnostics[0]` deep-equals the fast-fail error.
- **PD-3 — Canonical serializer substrate: unified-stack, library-backed** (DEC-3 "byte-compatible with the repo's existing remark-based stringification defaults" made mechanical). `hastToMarkdown(hast)` = `canonicalize(hast)` (existing module — raw→text, structural-whitespace drop, property sort) → `hast-util-to-mdast` → `remark().use(remarkGfm).stringify` (the `remark` dep already bundles remark-stringify; remark-gfm supplies table/strikethrough/task-list stringify). `normalizeMarkdown(md)` = `hastToMarkdown(mdastToHast(parseMarkdown(md)))` — serializer and normalizer then share **every stage downstream of MDAST**, so the DEC-3 single-definition requirement holds by construction (RSK-1 structurally mitigated). New direct dependency: `hast-util-to-mdast` (MIT, unified ecosystem — the mirror of `mdast-util-to-hast` already transitive via remark-rehype), gated by a Phase-4 spike (task 4.1); fallback = hand-written Appendix B serializer (the highest-risk path — see Risks).
- **PD-4 — Diagnostic location shape: `line:column`** per Storage source (saxes positions; TDR-0012 resolves spec OQ-3 to the strongest form for delivery; an element-path addition later is additive, E2/E3-owned).
- **PD-5 — Storage-side adversarial fixtures live at `tests/adversarial-storage/` (top level), NOT the test plan's `tests/adversarial/storage/` subdirectory.** Verified at planning time: `tests/golden/adversarial/pii-audit.test.ts` does `readFileSync` on **every** entry of `tests/adversarial/`, and Bun's `readFileSync` on a directory throws `EISDIR` (reproduced) — a subdirectory would crash an existing, unmodifiable suite (NG-3 / test-plan §7.4 "touched existing tests: 0"). A sibling top-level dir keeps the GH-31 runner/fixture split, stays invisible to every existing loader (all of which glob flat), and avoids pii-audit's bare-ID regex (matches `JIRA-\d+` etc.) constraining jira-macro fixture authoring. The runner path stays as pinned: `tests/golden/adversarial/reverse-classification-runner.test.ts`. Test-plan §4.3/§6.2 path should be amended to match at DoR.

### Open questions

- **OQ-P1 (non-blocking, default pinned):** the `hast-util-to-mdast` dependency (PD-3) is a second new dependency beyond TDR-0012's mandate. Default = library-backed with the task-4.1 spike gate; if PM wants selection-formality symmetry with TDR-0012, delegate a short TDR to `@decision-advisor` before Phase 4. Decision needed: consult `@decision-advisor` only if PM opts for formality.
- **OQ-T3 (inherited, non-blocking):** NFR-3 p95 timing assertion gates at a generous 200 ms ceiling vs record-only — `@runner` decides at first green run (test plan §8.3).
- Spec OQ-2 (partial-conversion mode) and OQ-3 final presentation shape remain E2/E3-owned; this plan delivers line:column (PD-4).

## Scope

### In Scope

- Infra-tier Storage→HAST parsing via saxes (TDR-0012): strict XML, fragment mode, CDATA reassembly incl. split `]]>`, entity unescaping, namespaced identity, line/column positions, malformed → typed parse-error arm. (spec F-1, NFR-4)
- Read-back normalization: provenance-panel strip (marker-identified info macro, DEC-6), K1 attribute tolerance (`ac:schema-version`/`ac:macro-id`, trivial self-closing whitespace). (spec F-3, AC-F3-1, AC-F3-3)
- Reverse classifier + content mapping (mirror of the `renderStorage` visitor / spec Appendix A): canonical constructs → content HAST; mermaid code-macro unwrap; render-policy synthetic image → informational diagnostic; anything else → blocking diagnostic; fast-fail + collect-all parity. (spec F-1, F-3, F-4, DEC-1, DEC-2)
- Domain-tier canonical serializer + normalizer with one shared definition (Appendix B / DEC-3 / DM-3) and the DM-1 library entry points. (spec F-1, F-5, F-6)
- DM-2 diagnostic model (additive, standalone per PD-2). (spec F-4)
- Golden round-trip harness + partition manifest + reverse-expectation sidecars + 3 new Storage-only fixtures + 9-fixture Storage-side adversarial set — all 19 TCs of the test plan wired. (spec F-2, DEC-7, DM-4)
- Version bump 0.8.2 → 0.9.0 (DEC-5) + CHANGELOG.md entry.

### Out of Scope

- [OUT] Any CLI command/flag/output/exit-code change (spec NG-1, PM-DEC-2) — enforced structurally by TC-REG-001.
- [OUT] `resolve`/`import` flows, diffing, patching, lock/state writes, Git operations (spec NG-2).
- [OUT] Any change to the forward converter, its fixtures, or its committed output — 33 pairs + 2 `.unsupported.txt` sidecars byte-stable; `storage-renderer.test.ts` unmodified (spec NG-3).
- [OUT] Adopt-verbatim escape hatch / resolution UX (spec NG-4). [OUT] Network/API integration — zero I/O (spec NG-5). [OUT] Canonical-subset expansion (spec NG-6).
- [OUT] Synthesizing front-matter/UUIDs/lock entries on reverse (spec §7.2).
- [OUT] `doc/spec/**` updates — discharged by `@doc-syncer` in lifecycle phase 7 (reverse feature spec + NFR-REL-4 reverse note), mirroring the GH-103 handling.

### Constraints

- **Green at every commit boundary**: each phase lands as one commit whose tree passes `bun run check` (lint + format:check + typecheck + full `bun test` + boundaries).
- **Tier boundaries (TDR-0006)** enforced by dependency-cruiser: `bun run check:boundaries` (`depcruise src`, `.dependency-cruiser.cjs` — `domain-may-not-import-infra` et al., severity `error`). Domain modules (`reverse-diagnostics`, `hast-to-markdown`, `normalize`) import only external libs (`hast`/`mdast` types, unified stack) + domain siblings; infra (`parse/reverse-parser.ts`, `parse/reverse.ts`) may import domain + saxes.
- **Code style** (`.ai/rules/typescript.md`): self-documenting, file headers ≤ 3 lines, cite the authority once at the load-bearing point (e.g. the CDATA split rule cites TDR-0012 C-2), no bare compliance tags, `#`-aliases in tests, no `any`, stable codes as `as const` objects.
- **Zero mocks**: the system under test is pure functions over committed files; `mock.module` is banned and auto-scanned by `tests/unit/meta/no-mock-module.test.ts` (GH-103).
- **Snapshot discipline**: corpus-A reverse outputs snapshotted via reviewed local run; `--update-snapshots` never in CI; re-baselining is line-by-line reviewed (test-plan R-TST-5).
- **Forward-loader invisibility (NG-3, verified against loader sources)**: every existing scanner of `tests/golden/fixtures/markdown/` filters entries by extension *before* reading (`*.md` in `storage-renderer.test.ts` + `pipeline-roundtrip.test.ts`; `*.storage.xhtml` in `assert-well-formed-xml.test.ts`) — so the `reverse/` subdir, the manifest JSON, and the 3 new Storage-only fixtures are invisible to the `.md` loaders; the new `.storage.xhtml` files are additionally (and desirably) picked up by the well-formed-XML helper's `≥ 25` glob. `tests/adversarial/` has no filter-before-read (pii-audit) — hence PD-5.
- **Runtime**: Bun 1.2.23 pinned; no native modules; saxes must survive `bun build --compile` (TDR-0012 C-6). Conventional Commits, ≤ 72-char headers.
- **NFR-SEC-4**: declaring saxes (and `hast-util-to-mdast`) on the branch triggers push vuln/license scans automatically; no GPL/AGPL; human license acceptance recorded on the PR (TDR-0012 C-7).

### Risks

- **RSK-P1 ⚠ (highest) — serializer byte-form edge cases** (spec RSK-1's delivery face): nested-list indentation (content-start alignment, 2 sp under `-` / 3 under `1.`), table pipe escaping + alignment row, emphasis delimiter runs (`*` vs `**`, nested strong/em), inline-code backtick runs, escaping of literal characters that would re-parse as structure (idempotence requirement). Mitigated structurally by PD-3 (library substrate shares the stringify stage between serializer and normalizer) + the independent fixed-point tripwire TC-NORM-002 + corpus-B pinned bytes. The fallback hand-written path concentrates exactly this risk — use only if the 4.1 spike fails.
- **RSK-P2 — task-list HAST shape parity**: `hast-util-to-mdast` yields `listItem.checked` only when the HAST matches remark-gfm's exact shape (`ul.contains-task-list` → `li.task-list-item` → leading `input[checked]`); the infra mapper must reproduce that shape from `ac:task-list`/`ac:task`/`ac:task-status`. Locked by the `task-list` corpus-A fixture + TC-RT-001.
- **RSK-P3 — saxes event surface**: CDATA delivery shape (text vs dedicated event), split-`]]>` reassembly, `position`/`fragment` option semantics, WF-error surface — all TO-CONFIRM at pin (TDR-0012 evidence table). Closed by the Phase-1 spike before any parser code; fragment mode is mandatory (page bodies are multi-root fragments — `renderRoot` emits block sequences, not a single root element).
- **RSK-P4 — sidecar self-reference** (test-plan R-TST-2): corpus-B / Storage-only expectations generated by the converter under test could pin its bugs. Mitigated: human review of every sidecar at commit; K1 + panel expectations are *derived* (equality with attr-free / body-only variants), not generated.
- **RSK-P5 — strict-XML entity scope**: undefined HTML-named entities (`&nbsp;` etc.) hard-fail under saxes — accepted and loud on foreign corpora (TDR-0012 revisit trigger; corpus A uses only the 5 predefined entities, verified FACT). No compensating pre-pass in this change.
- Spec RSK-1..RSK-6 carry over; RSK-2 (read-back drift beyond K1) is encoded as fixtures + correct-loud-failure posture; RSK-6 (mirror maintenance) is mechanically enforced by the harness (AC-F2-1).

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| Corpus-A round-trip byte mismatches | 0 (26/26) | AC-F1-1 / NFR-1 / TC-RT-001 |
| Determinism (in-process ×2 + across-run snapshots) | byte-identical | AC-F1-2 / NFR-2 / TC-RT-003/004 |
| Forward golden files modified | 0 (33 pairs + 2 sidecars unmodified) | AC-F6-1 / TC-REG-001 |
| Storage adversarial classes → blocking diagnostic with code + construct + location | 100% (9/9 fixtures) | AC-F4-1 / TC-RADV-001 |
| Normalizer idempotent + reverse output a fixed point | 100% of corpus A | AC-F5-1 / TC-NORM-001/002 |
| New CLI commands/flags/output changes | 0 | AC-F6-1 / TC-REG-001 |
| Reverse p95 per page | ≤ 200 ms (informational; sanity ceiling) | NFR-3 / TC-RT-001 step 5 |
| Package version | 0.9.0 | DEC-5 |

## Phases

### Phase 1: TDR-0012 pre-lock spike — pin saxes (fallback @xmldom/xmldom)

**Goal**: Execute TDR-0012's mandated pre-lock verification (Unresolved Question #1) and land the pinned dependency. The spike closes every TO-CONFIRM signal (version, license, zero-dep status, WF-error surface, CDATA event shape, position + fragment option semantics) with a Bun smoke run over the committed corpus before the pin is final; abort/descend criteria per TDR-0012 Implementation Plan #6.
**Effort**: ~0.5 day · **Risk**: M (gate outcomes are expected to pass — the eliminations were grammar-level; residual is event-surface detail)

**Tasks**:

- [ ] **1.1** Add the dependency: `bun add -E saxes` (exact pin per TDR-0012 Implementation Plan #1). Record the resolved version, license string (MIT per TDR-0012 FACT — human acceptance is the decider's, on the PR), and confirm zero runtime dependencies from its package manifest. Files: `package.json`, `bun.lock`.
- [ ] **1.2** Verify the event/error surface against canonical sources (saxes README + source, at the pinned version): (a) well-formedness error behavior in strict mode (error event vs throw; error shape); (b) CDATA delivery (text vs dedicated event) and whether split `]]>` sections arrive as concatenated character data (XML semantics say they must — confirm the event stream); (c) `position` option semantics (line/column per event); (d) **fragment mode** — page bodies are multi-root fragments (`<h1>…</h1><p>…</p>`, no single root, no XML declaration): confirm fragment parsing retains strict WF erroring; (e) strict-mode behavior on undefined named entities (expected hard-fail — RSK-P5, loud by design). Closes TDR-0012 TO-CONFIRM rows.
- [ ] **1.3** 30-minute Bun smoke (TDR-0012 #1): throwaway script under `tmp/` (not committed) that parses **every committed corpus Storage fixture — 34 `.storage.xhtml` files** (TDR-0012's "35" counts the nominal 33-pair corpus + 2 Storage-only; `raw-html-block-real` has no Storage twin, so 34 are actually parseable — see Open questions). Assert: every fixture parses without WF error; `mixed-html-comment.storage.xhtml` (empty file) parses to an empty fragment; CDATA bodies (incl. any literal `]]>` splits, e.g. array-closing code) extract byte-identically to the fixture bytes between `<![CDATA[` and `]]>` markers.
- [ ] **1.4** Go/no-go gate (TDR-0012 #6): swap to @xmldom/xmldom **only** on a gate-level failure (C-1..C-7: no usable WF arm, CDATA unresolvable, positions unavailable, Bun/`--compile` incompatibility, license/advisory failure). Event-surface deviations (CDATA event shape, position details) are **builder adjustments, not swap triggers**. If a swap fires: repeat 1.1–1.3 for @xmldom/xmldom (DOM→HAST walk; locations degrade to element-path form — TDR-0012 Alt 3) and record it in TDR-0012's revisit log.
- [ ] **1.5** Green boundary + evidence: `bun install --frozen-lockfile` clean; `bun run check` green with the dependency declared (NFR-SEC-4 push scans pick it up on the branch). Record the spike outcome (version, event-surface findings, smoke result, gate verdict) in this plan's Execution Log and tick TDR-0012 Unresolved Question #1.

**Acceptance Criteria**:

- Must: saxes pinned exact in `dependencies`; `bun run check` green at this commit; spike evidence recorded (Execution Log + TDR-0012).
- Must: all five surface checks (1.2a–e) answered with source-grounded findings before Phase 3 starts.
- Should: smoke script findings note the CDATA event pattern the Phase-3 builder must handle.

**Files and modules**:

- Code areas: `package.json` (updated — dependency), `bun.lock` (updated).
- System docs: none (TDR-0012's unresolved-question checkbox is a decision-record touch, done at 1.5 evidence time or at merge).

**Tests**:

- `bun install --frozen-lockfile && bun run check`
- Spike smoke (scratch, `tmp/`) — 34/34 corpus fixtures parse; evidence in Execution Log.

**Completion signal**: `build(GH-92): pin saxes as the Storage XML parser (TDR-0012 pre-lock spike passed)`

---

### Phase 2: DM-2 diagnostic model — two-class taxonomy, stable codes, locations (domain, additive)

**Goal**: Deliver the reverse diagnostic model as an additive domain module: blocking `unsupported-construct` + informational `marksync-synthetic-artifact`, stable per-class codes, construct identity, `line:column` Storage locations, plus the standalone `ReverseError` channel (PD-2) with the parity shape the harness mechanics require. Pure data model — no pipeline dependency, so the phase is small and independently green.
**Effort**: ~0.5 day · **Risk**: L

**Tasks**:

- [ ] **2.1** Create `src/domain/markdown/reverse-diagnostics.ts`: `ReverseDiagnostic` union — blocking `{ severity: "blocking", class: "unsupported-construct", code, construct, location: { line, column } }` and informational `{ severity: "informational", class: "marksync-synthetic-artifact", code, construct, location }`; stable codes as an `as const` object (typescript.md "no magic strings"), exact strings chosen once (e.g. `reverse/unsupported-construct`, `marksync/synthetic-artifact` — coder's pick, then frozen: public-ish surface, additions-only per spec §22). Payload carries structure only — no free-form content echo by construction (NFR-5). (spec F-4, DM-2, DEC-1)
- [ ] **2.2** Define the `ReverseError` channel in the same module (PD-2): `{ kind: "StorageParseError", code, location: { line, column }, detail }` | the blocking diagnostic arm — where the blocking arm's shape is *identical* to a collect-all entry so `all.diagnostics[0]` deep-equals the fast-fail error (test-plan §4.4 parity mechanic). Document (≤ 3-line header, cite-once) why it is not a `MarkSyncError` kind: the adding-a-kind rule would force `src/cli/` exit-code table edits, violating PM-DEC-2/AC-F6-1. (spec DM-1, DM-2)
- [ ] **2.3** Create `tests/unit/domain/markdown/reverse-diagnostics.test.ts` — first slice of TC-RDIAG-001/004: exact code strings pinned; payload shape (code + construct + location; nothing else); no-content-echo (serializing a diagnostic never includes element text); same input → deep-equal diagnostic (determinism of the model). (AC-F4-1 payload clauses, DM-2, NFR-5)
- [ ] **2.4** Green boundary: `bun run check` (depcruise: domain imports nothing upward); zero existing files touched.

**Acceptance Criteria**:

- Must: two severity classes with distinct stable codes exported; blocking arm structurally usable as both the fast-fail error and a collect-all entry (parity precondition).
- Must: unit tests pin the code strings and payload shape; `bun run check` green.
- Should: types carry a one-line comment only where the shape is non-obvious (the parity constraint).

**Files and modules**:

- Code areas: `src/domain/markdown/reverse-diagnostics.ts` (new), `tests/unit/domain/markdown/reverse-diagnostics.test.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/markdown/reverse-diagnostics.test.ts`
- `bun run check`

**Completion signal**: `feat(GH-92): reverse diagnostic model — two-class taxonomy, stable codes, line:column locations`

---

### Phase 3: Infra-tier Storage→HAST parser — saxes builder, panel strip, K1 tolerance, parse-error arm

**Goal**: Implement `parseStorage` per TDR-0012 Alt 2 + spec DEC-4: strict fragment-mode saxes, a repo-owned node-stack SAX→HAST builder emitting a Storage-shaped HAST tree with `ac:`/`ri:` names verbatim and line/column positions, entity/CDATA correctness (incl. split `]]>` reassembly), malformed input wrapped into the typed `StorageParseError` arm, and the read-back normalization layer (panel strip, K1 tolerance).
**Effort**: ~1–1.5 days · **Risk**: M–H (CDATA/position event mechanics — bounded by the Phase-1 spike findings)

**Tasks**:

- [ ] **3.1** Create `src/infra/confluence/parse/reverse-parser.ts` (new directory): saxes in strict + fragment + position mode (per spike-confirmed options); node-stack builder emitting `@types/hast` `Root`/`Element`/`Text`/`Comment` nodes — tag and attribute names carried verbatim (`ac:structured-macro`, `ac:schema-version` — case-intact, colon-in-name, no ns rewriting; TDR-0012 C-4); open-tag `position {line, column}` attached to elements (F-4 locations); adjacent character-data chunks (text + CDATA) coalesced into single text nodes so split `]]>` sections reassemble byte-identically (TDR-0012 C-2); comments retained (the panel marker lives in a comment).
- [ ] **3.2** Attribute/entity mapping: saxes-unescaped attribute values into hast `properties` (string values, prefixed names like `ac:name` kept as-is — Storage knowledge stays in this tier); text entities (`&amp; &lt; &gt; &quot;` + numeric) arrive unescaped from saxes and are stored as literal text. Undefined named entities fail at the parser level → parse-error arm (RSK-P5 — loud, by design).
- [ ] **3.3** Parse-error arm: wrap every saxes WF error (mismatched tags, unclosed elements, truncated CDATA, undefined entities, stray `]]>`) into `{ kind: "StorageParseError", code, location: {line, column}, detail }` (Phase-2 model) — no exception escapes `parseStorage`; same malformed input → identical error (deterministic failure). (spec NFR-4, F-4, DM-1; TDR-0012 C-3)
- [ ] **3.4** Read-back normalization layer (same module or a sibling `readback.ts` — coder's choice): (a) **panel strip** — any `ac:structured-macro ac:name="info"` whose subtree contains a comment equal to the panel marker is dropped entirely, silently (import `PROVENANCE_PANEL_MARKER` from `#infra/confluence/provenance.ts`; spec DEC-6); an info macro *without* the marker is retained (the P4 classifier blocks it — boundary proven by `storage-macro-info-no-marker`); (b) **K1 tolerance** — `ac:schema-version`/`ac:macro-id` attributes ignored (never diagnostic, never emitted), whitespace-only text between block siblings dropped, trivial self-closing/whitespace forms parse to empty/whitespace nodes that the same rule removes (spec F-3d, ADR-0005 spike K1).
- [ ] **3.5** Create `tests/unit/infra/confluence/parse/reverse-parser.test.ts`: TC-RPARSE-001 (entities in text + attribute values; CDATA byte preservation incl. a hand-built split-`]]>` case; namespaced element/attribute identity via tree assertions; K1 whitespace forms) and TC-RDIAG-003 (mismatched tags, unclosed macro body, invalid entity, truncated CDATA → stable `StorageParseError`, never a crash, deterministic across repeats; samples authored against saxes' strict contract per test-plan OQ-T1). Add unit previews of the strip/tolerance mechanics: panel dropped at HAST level; info-without-marker retained; K1'd macro tree ≡ attr-free tree.
- [ ] **3.6** Green boundary: `bun run check` (boundaries: infra → domain + saxes only); existing suites untouched and green.

**Acceptance Criteria**:

- Must: every committed corpus Storage fixture (34) parses to a HAST tree via `parseStorage` with zero WF errors; CDATA bodies extract byte-identically (TDR-0012 C-2).
- Must: all four malformed classes yield the typed parse-error arm with line/column; no thrown exception crosses the module boundary (TDR-0012 C-3, NFR-4).
- Must: panel strip is marker-discriminating; K1 attributes and whitespace vanish from the normalized tree (AC-F3-1/AC-F3-3 mechanism level).
- Should: builder is a single ordered pass — determinism by construction (NFR-2).

**Files and modules**:

- Code areas: `src/infra/confluence/parse/reverse-parser.ts` (new; possibly + `readback.ts`), `tests/unit/infra/confluence/parse/reverse-parser.test.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/infra/confluence/parse/reverse-parser.test.ts`
- `bun run check`

**Completion signal**: `feat(GH-92): saxes Storage→HAST parser — CDATA/entities/positions, panel strip, K1 tolerance`

---

### Phase 4: Domain serializer + normalizer + DM-1 reverse contract (classify, map, compose)

**Goal**: Deliver the conversion half: the canonical HAST→Markdown serializer on the unified stack (PD-3), the normalizer sharing its every stage (DEC-3/DM-3), the infra-tier classifier + content mapping (the true mirror of `renderStorage`'s visitor), and the DM-1 entry points with fast-fail/collect-all parity. Ends with the unit tier complete (TC-NORM-001, TC-RDIAG-001/002/004 fully executable).
**Effort**: ~1.5–2 days · **Risk**: H (RSK-P1/P2 live here — mitigated by substrate choice + corpus locks)

**Tasks**:

- [ ] **4.1** Serializer substrate spike (gate, ~30–60 min, OQ-P1 default): `bun add hast-util-to-mdast` (exact pin) and probe, under Bun, the exact shapes Phase 4 emits: GFM tables with alignment (`th[align]` → mdast `tableCell.align` → `| :--- |` row), task lists (`ul.contains-task-list` → `li.task-list-item` → leading `input[checked]` → `listItem.checked` → `- [x]`), fenced code (`pre > code.language-x` → `code.lang` → ```` ```x ```` fence), nested strong/em/del, inline code with backtick runs, links/images. Verify MIT + Bun compat. **Fallback** (only on an unworkable gap): hand-written HAST→Markdown visitor per Appendix B — flag as the highest-risk path (RSK-P1) and note the gap in the Execution Log. Record the verdict before proceeding. (DEC-3, RSK-1)
- [ ] **4.2** Create `src/domain/markdown/hast-to-markdown.ts`: `hastToMarkdown(hast: Root): string` = `canonicalize(hast)` (existing `#domain/render/canonicalize` — raw→text so literal HTML is escaped never emitted, structural whitespace dropped, properties sorted) → `hast-util-to-mdast` → `remark().use(remarkGfm).stringify`. The Appendix B form is remark-gfm's stringification default by construction (DEC-3 "the normalizer pins, not invents, the form" — spec §12). File header cites the spec Appendix B once.
- [ ] **4.3** Create `src/domain/markdown/normalize.ts`: `normalizeMarkdown(md: string): string` = `hastToMarkdown(mdastToHast(parseMarkdown(md).value))` — the forward parse stage (incl. its annotation stripping: front-matter, comment-only HTML, link-reference comments) then the shared serializer. One definition binds both directions (spec F-5, DM-3); annotations are never re-synthesized (DEC-6).
- [ ] **4.4** Create `src/infra/confluence/parse/reverse.ts` — classifier + content mapping over the normalized Storage-HAST (mirror of `renderStorage`'s visitor + spec Appendix A): recognized constructs map to content HAST — code macro (`ac:name="code"` + `ac:parameter ac:name="language"` + `ac:plain-text-body` CDATA) → `pre > code.language-X`; `ac:image` + `ri:url`/`ri:attachment` → `img {src, alt}` (remote URL vs filename, mirroring `imageMacro`); `ac:task-list`/`ac:task`/`ac:task-status`/`ac:task-body` → the exact remark-gfm task-list HAST shape (RSK-P2); headings/p/em/strong/del/code/a/ul/ol/li/table family/blockquote/hr pass through. Mermaid render artifact: `ri:filename` matching the `marksync-mermaid-<hash>.svg` pattern → informational diagnostic + node dropped from content (filename is the discriminator; alt text does not gate — TC-RDIAG-004 boundary; DEC-1). Everything else (unknown macro keyed on `ac:name`, unknown element, nested table — a `table` inside `td`) → blocking diagnostic `{code, construct: tag [+ ac:name], location}`. Fast-fail `findUnsupportedStorage` (first, document order) + collect-all `findAllUnsupportedStorage` (exhaustive, identical per-instance verdicts) mirroring `findUnsupported`/`findAllUnsupported` (spec DEC-2).
- [ ] **4.5** DM-1 entry points in the same module: `reverseStorage(body: string, opts?): Result<{ markdown: string; diagnostics: InformationalDiagnostic[] }, ReverseError>` — parse → (strip/tolerance already applied) → fast-fail classify → map → `hastToMarkdown`; and `reverseStorageCollectAll(body): Result<{ diagnostics: ReverseDiagnostic[] }, ReverseError>` (enumeration without conversion when blocking; per test-plan §4.4: `all.diagnostics[0]` deep-equals the fast-fail error). `opts` carries diagnostic provenance context (spec DM-1 "provenance context"); exact signature is coder latitude within the parity mechanic. No network, no state, no CLI import (F-6, NG-1/NG-5).
- [ ] **4.6** Complete the unit tier: extend `tests/unit/domain/markdown/reverse-diagnostics.test.ts` with the Storage-driven cases — TC-RDIAG-001 (hand-built one-construct Storage → blocking shape: pinned code, construct identity, location sufficient to locate; no content echo; deterministic), TC-RDIAG-002 (3+ unsupported instances at different depths → fast-fail returns first, collect-all returns all N in document order, `all[0]` deep-equals fast-fail error, cross-mode per-instance stability via single-instance variants), TC-RDIAG-004 (canonical paragraph + synthetic mermaid image → success + exactly one informational; user attachment (`ri:filename` not matching the pattern) → `![alt](filename)` + 0 diagnostics; alt-text non-discriminating; informational never blocks). Create `tests/unit/domain/markdown/normalize.test.ts` — TC-NORM-001: over every corpus-A + corpus-B `.md` fixture read from the golden dir (test-plan A-5): `N(md)` deterministic, `N(N(md)) === N(md)` idempotent, Appendix B spot-checks (ATX headings, `-` bullets, `1.` ordered, `*`/`**`/`~~`, backtick fences, inline links/images, single blank-line separation).
- [ ] **4.7** Green boundary: `bun run check` (boundaries: domain serializer imports only libs + `#domain/*`; infra imports domain + saxes); forward suites untouched.

**Acceptance Criteria**:

- Must: `reverseStorage` composes parse → classify → map → serialize with fast-fail/collect-all parity proven on hand-built inputs (AC-F4-1 unit clauses, DEC-2).
- Must: normalizer deterministic + idempotent on 33/33 corpus `.md` files; Appendix B invariants hold (AC-F5-1 unit clauses).
- Must: substrate verdict recorded; if fallback fired, the gap + risk acceptance noted (RSK-P1).
- Should: a smoke of `normalize(kitchensink.md)` and `reverse(render(kitchensink))` already byte-match (early AC-F1-1 signal; formal wiring is Phase 5).

**Files and modules**:

- Code areas: `src/domain/markdown/hast-to-markdown.ts` (new), `src/domain/markdown/normalize.ts` (new), `src/infra/confluence/parse/reverse.ts` (new), `package.json`/`bun.lock` (hast-util-to-mdast, if 4.1 passes).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/markdown/ tests/unit/infra/confluence/parse/`
- `bun run check`

**Completion signal**: `feat(GH-92): reverse contract — classifier, content mapping, canonical serializer, normalizer (DM-1/DM-2/DM-3)`

---

### Phase 5: Golden harness + fixtures — round-trip, read-back, adversarial set (all 19 TCs wired)

**Goal**: Wire the complete golden + adversarial verification surface per the test plan's normative mechanics (§4.4): the directory-driven round-trip harness with the partition-manifest guardrail, the read-back fixture set (panel / mermaid / K1 / render-policy), reverse-expectation sidecars (human-reviewed), and the Storage-side adversarial set regression-locking C-4 diagnostics. After this phase every TC except TC-REG-001's structural checks is executing and green.
**Effort**: ~1.5 days (incl. sidecar review) · **Risk**: M (R-TST-2 review discipline; fixture authoring care)

**Tasks**:

- [ ] **5.1** Commit `tests/golden/fixtures/markdown/round-trip-partition.json` (DM-4/DEC-7): `corpusA` [26 — heading-h1..h6, paragraph, strong, em, strong-em-nested, strikethrough-del, code-inline, code-block-python, code-block-mermaid, mermaid-code-policy, link-plain, link-query-amp, image-remote, image-attachment, unordered-list, ordered-list-nested, task-list, table, blockquote, hr, kitchensink], `corpusB` [7 — frontmatter, html-comment-block, html-comment-inline, link-ref-comment, mixed-html-comment, raw-html-inline-real, raw-html-block-real], `storageOnly` [5 — provenance-panel, mermaid-render-policy (existing) + the 3 new from 5.2], `excluded` [{ name: "raw-html-block-real", reason: "forward-error fixture — no Storage form" }].
- [ ] **5.2** Author the 3 new Storage-only fixtures (top-level, no `.md` twin — invisible to every `.md` loader; picked up by the well-formed-XML helper's `≥ 25` glob, which they must satisfy): `code-block-python-k1.storage.xhtml` and `mermaid-code-policy-k1.storage.xhtml` (canonical bodies + `ac:schema-version` + `ac:macro-id` injected on macros + one trivial self-closing whitespace form), `readback-realistic.storage.xhtml` (kitchensink body + K1 attrs + appended provenance panel — the composite Flow-2 read-back). (AC-F3-3, RSK-2 evidence)
- [ ] **5.3** Create `tests/golden/markdown/reverse-round-trip.test.ts` (TC-RT-001..005 + TC-NORM-002) per test-plan §4.4, directory-driven from the manifest — never a hand-listed array: completeness assertion (symmetric difference of discovered `*.md` vs `A ∪ B ∪ excluded` empty; orphan `*.storage.xhtml` vs `storageOnly` empty; every excluded entry has a reason) + negative self-test (unlisted fixture name → the completeness helper fails). Corpus-A loop: forward via the real pipeline in-memory (`parseMarkdown` → `mdastToHast` → `renderStorage().body`), `reverseStorage`, byte-equality vs `normalizeMarkdown(fixture.md)`, `toMatchSnapshot(`${name}.reverse`)`, `not.toMatch(/<(ac|ri):/)`, per-fixture timing + corpus p95 vs the 200 ms sanity ceiling (NFR-3 informational, OQ-T3). Corpus-B loop: explicit sidecars (5.4). TC-RT-003: convert-twice deep-equal over corpus A + storage-only. TC-NORM-002: `normalizeMarkdown(reverse(...).markdown) === markdown` — the fixed point pinned directly on reverse output (the RSK-1 tripwire). (AC-F1-1, AC-F1-2, AC-F2-1, AC-F5-1)
- [ ] **5.4** Generate + human-review the reverse-expectation sidecars in `tests/golden/fixtures/markdown/reverse/`: `<name>.md` for the 6 corpus-B fixtures with a Storage form (incl. an empty file for `mixed-html-comment`) and the 5 Storage-only fixtures; `<name>.json` where diagnostics are expected (`mermaid-render-policy.json` at minimum). K1 + panel expectations are **derived** (equality with the attr-free / body-only conversion), not generated; corpus-B annotation outputs cross-checked against `normalize(md)` minus annotations during review (R-TST-2 two-layer mitigation). Review is an explicit human step before commit.
- [ ] **5.5** Create `tests/golden/markdown/reverse-readback.test.ts` (TC-RT-006..009): panel strip (`provenance-panel` alone → empty Markdown, 0 diagnostics; `readback-realistic` → byte-equals `normalizeMarkdown(kitchensink.md)`; 0 occurrences of marker / `ac:structured-macro` / `ac:rich-text-body` / `Source:` / `Git revision:` / `Last sync:`); mermaid unwrap (fence bytes ≡ CDATA bytes for `mermaid-code-policy`, `code-block-mermaid`, `mermaid-code-policy-k1`; 0 wrapper artifacts); K1 tolerance (K1 variants byte-identical to attr-free conversions, 0 diagnostics, `ac:schema-version`/`ac:macro-id` never in output); render-policy artifact (success, exactly one informational diagnostic, heading present, zero `![`/`marksync-mermaid-`/`ac:image`/`ri:attachment`, sidecar deep-compare). (AC-F3-1..F3-3, AC-F4-2)
- [ ] **5.6** Author the Storage-side adversarial set at **`tests/adversarial-storage/`** (top level — PD-5; NOT a `tests/adversarial/` subdirectory): 9 fixtures + 9 `*.classification.json` sidecars per test-plan §6.2 — `storage-macro-toc`, `storage-macro-expand`, `storage-macro-info-no-marker` (strip boundary — blocking, NOT stripped), `storage-macro-jira`, `storage-app-gliffy`, `storage-nested-tables`, `storage-raw-html-block`, `storage-multiple-unsupported` (N instances, exhaustive), `storage-malformed` (sidecar `{ "parseError": true }`). Sidecars pin `{code, construct, location}` arrays generated from the classifier then reviewed (they pin the contract, not incidental bytes).
- [ ] **5.7** Create `tests/golden/adversarial/reverse-classification-runner.test.ts` (TC-RADV-001/002 + the golden arm of TC-RDIAG-002), mirroring the GH-31 runner pattern: collect-all serialization deep-equals sidecars; fast-fail on every blocking fixture (no partial output — DEC-2); category-coverage inventory (unknown macros ≥ 2 kinds, non-panel info macro, app/gliffy class, nested tables, non-canonical elements, multi-instance, malformed); adversarial determinism (classify + convert twice → byte-identical diagnostics + error arms).
- [ ] **5.8** Snapshot baseline + full-green boundary: reviewed local `bun test tests/golden/ --update-snapshots` for the initial `${name}.reverse` layer (explicit, reviewed — never in CI); full fast loop `bun test tests/unit/ tests/integration/ tests/golden/` green; forward tripwire assertion — `git diff main --stat` shows zero modified files under `tests/golden/fixtures/markdown/` (additions only: 3 Storage-only + manifest + `reverse/` sidecars) and `tests/golden/markdown/storage-renderer.test.ts` untouched; `bun run check` green.

**Acceptance Criteria**:

- Must: TC-RT-001..009, TC-NORM-002, TC-RADV-001/002, and the unit TCs all executing green; corpus A 26/26 byte-equal with 0 `<ac:`/`<ri:` leakage (AC-F1-1, NFR-1).
- Must: the manifest guardrail demonstrably fails on an unlisted fixture (negative self-test) — AC-F2-1's mechanical enforcement.
- Must: zero modifications to existing fixtures/tests (NG-3); forward `exactly 33` inventory lock and `storage-renderer.test.ts` green unmodified.
- Should: snapshot files read as PR-reviewable renditions of the canonical form (D-TST-1 side benefit).

**Files and modules**:

- Code areas: none.
- Test areas: `tests/golden/markdown/reverse-round-trip.test.ts` (new), `tests/golden/markdown/reverse-readback.test.ts` (new), `tests/golden/adversarial/reverse-classification-runner.test.ts` (new), `tests/golden/fixtures/markdown/round-trip-partition.json` + `reverse/` sidecars (new), 3 new Storage-only fixtures (new), `tests/adversarial-storage/*` (18 new files), `tests/golden/markdown/__snapshots__/` (generated, committed).
- System docs: none.

**Tests**:

- `bun test tests/golden/markdown/reverse-round-trip.test.ts tests/golden/markdown/reverse-readback.test.ts tests/golden/adversarial/reverse-classification-runner.test.ts`
- `bun test tests/unit/ tests/integration/ tests/golden/` (fast loop — incl. the unmodified forward suites)
- `git diff main --stat` scope assertions (NG-3)

**Completion signal**: `test(GH-92): golden round-trip harness, read-back fixtures, storage adversarial set — 19 TCs wired`

---

### Phase 6: Finalize and release — 0.9.0, CHANGELOG, full gate, spec reconciliation

**Goal**: Land the release mechanics per repo conventions: version bump 0.8.2 → 0.9.0 (DEC-5), CHANGELOG entry, the full quality gate (`bun run check` + `bun run test:bdd`), TC-REG-001's structural boundary verification, and spec reconciliation with execution logs populated. Doc-sync (`doc/spec/**`) is explicitly out of this plan (`@doc-syncer`, lifecycle phase 7).
**Effort**: ~0.5 day · **Risk**: L

**Tasks**:

- [ ] **6.1** Version bump: `package.json` `version` `0.8.2` → `0.9.0` (DEC-5 — minor: new library capability, additive, nothing user-facing removed; the next tag-triggered binary release picks it up with no release-process change). (AC-F6-1 precondition)
- [ ] **6.2** CHANGELOG.md: add `## [0.9.0] - <merge date>` with an `### Added` section — reverse converter library (Storage Format → Markdown, canonical GFM subset, deterministic), 100% golden round-trip harness with partition-manifest guardrail, two-class reverse diagnostics with stable codes + line:column locations, provenance-panel strip + K1 read-back tolerance, saxes parser dependency (TDR-0012). Keep-a-Changelog format per the file's existing style. Note: the CHANGELOG currently lags `package.json` (latest entry 0.7.0 vs 0.8.2) — add only the 0.9.0 entry; do not backfill 0.8.x without PM instruction (flagged to PM).
- [ ] **6.3** Full quality gate: `bun run check` (biome lint + format:check + `tsc --noEmit` + full `bun test` incl. e2e-mock + `depcruise src` boundaries) and `bun run test:bdd` (unchanged lifecycle-invariant suite, regression signal) — both green end-to-end.
- [ ] **6.4** TC-REG-001 structural checks: `git diff main --stat` asserts (a) zero *modified* files under `tests/golden/fixtures/markdown/` and `tests/adversarial/` (additions only), (b) `tests/golden/markdown/storage-renderer.test.ts` and every other existing test file unmodified, (c) zero changes under `src/cli/`, `tests/unit/cli*/`, `tests/integration/cli/`, `.github/workflows/`, `doc/spec/**`, (d) `package.json` version = 0.9.0, new deps = saxes (+ `hast-util-to-mdast` if 4.1 passed) only.
- [ ] **6.5** Spec reconciliation + logs: walk spec §17 against delivered evidence (AC-F1-1 → TC-RT-001; AC-F1-2 → TC-RT-003/004; AC-F2-1 → TC-RT-005; AC-F3-1/2/3 → TC-RT-006/007/008; AC-F4-1 → TC-RADV-001 + TC-RDIAG-001/002/003; AC-F4-2 → TC-RT-009 + TC-RDIAG-004; AC-F5-1 → TC-NORM-001/002; AC-F6-1 → TC-REG-001); populate the test-plan §10 execution log (all 19 rows) and this plan's Execution Log; PR fix-line note per spec §18: "feat(reverse): Storage Format → Markdown converter (canonical subset, 100% golden round-trip, C-4 diagnostics) — MS-0003 E1 foundation". CI green on the PR is observed at lifecycle phase 11 and recorded then.
- [ ] **6.6** Lifecycle hand-offs recorded in the Execution Log: TDR-0012 flips to Accepted at PR merge jointly with the human license confirmation (C-7); `@doc-syncer` owns the `doc/spec/features/` reverse spec + the NFR-REL-4 reverse-direction note (phase 7); OQ-2/OQ-3 answers are requested inputs to E2/E3 planning.

**Acceptance Criteria**:

- Must: `bun run check` and `bun run test:bdd` green; version 0.9.0; CHANGELOG entry present.
- Must: all structural assertions of 6.4 hold (0 CLI delta, 0 forward-fixture modifications, additive-only dependency set) — AC-F6-1.
- Must: all spec §17 ACs reconciled with evidence; both execution logs populated.

**Files and modules**:

- Code areas: `package.json` (version), `CHANGELOG.md` (new entry).
- System docs: none in this plan (`doc/spec/**` is lifecycle phase 7, `@doc-syncer`).

**Tests**:

- `bun run check && bun run test:bdd`
- `git diff main --stat` structural assertions (TC-REG-001)
- `bun test tests/unit/ tests/integration/ tests/golden/` (final fast-loop confirmation)

**Completion signal**: `chore(GH-92): release 0.9.0 — version bump, changelog, full-gate evidence, spec reconciliation`

---

## Test Scenarios

All 19 test-plan TCs are wired by this plan; phases below are where each first executes green.

| TC ID | Scenario | Phases | AC Coverage |
|-------|----------|--------|-------------|
| TC-RT-001 | Corpus-A round-trip byte equality (26/26) + p95 timing | 4 (smoke), 5 (harness) | AC-F1-1, NFR-1, NFR-3 |
| TC-RT-002 | Corpus-B explicit reverse expectations (sidecars) | 5 | AC-F1-1 (corpus-B arm), DM-4, DEC-6/7 |
| TC-RT-003 | Reverse determinism in-process (convert twice) | 5 | AC-F1-2, NFR-2 |
| TC-RT-004 | Reverse determinism across runs (snapshot layer) | 5 | AC-F1-2, NFR-2 |
| TC-RT-005 | Partition-manifest completeness + negative self-test | 5 | AC-F2-1, DM-4, NFR-1 |
| TC-RT-006 | Provenance-panel strip (0 content/wrapper/marker/diagnostics) | 3 (mechanism), 5 (golden) | AC-F3-1, DEC-6 |
| TC-RT-007 | Mermaid code-macro unwrap — fence bytes ≡ CDATA | 5 | AC-F3-2 |
| TC-RT-008 | K1 attribute tolerance — output ≡ attr-free variant | 3 (mechanism), 5 (golden) | AC-F3-3, NFR-4 |
| TC-RT-009 | Render-policy synthetic image — informational, not content | 5 | AC-F4-2, DEC-1 |
| TC-NORM-001 | Normalizer deterministic + idempotent + Appendix B spot-checks | 4 | AC-F5-1, DM-3 |
| TC-NORM-002 | Canonical fixed point on reverse output (RSK-1 tripwire) | 4 (smoke), 5 (golden) | AC-F5-1, DM-3 |
| TC-RDIAG-001 | Blocking diagnostic shape — stable code + construct + location, no content echo | 2 (model), 4 (Storage-driven) | AC-F4-1, DM-2, NFR-5 |
| TC-RDIAG-002 | Fast-fail / collect-all parity + exhaustive enumeration | 4 (unit), 5 (golden adversarial) | AC-F4-1, DEC-2 |
| TC-RDIAG-003 | Malformed Storage → stable parse-error arm, never a crash | 3 | AC-F4-1 (error-arm clause), NFR-4 |
| TC-RDIAG-004 | Informational `marksync-synthetic-artifact` alongside success | 2 (model), 4 (Storage-driven) | AC-F4-2, DEC-1, DM-2 |
| TC-RPARSE-001 | Parse substrate — entities, CDATA incl. split `]]>`, namespaces | 3 | NFR-4, F-1 |
| TC-RADV-001 | Storage adversarial classification equals sidecars (no silent drop) | 5 | AC-F4-1, DM-2 |
| TC-RADV-002 | Adversarial determinism (classify + convert twice) | 5 | AC-F1-2, NFR-2 |
| TC-REG-001 | Library-only boundary — 0 CLI delta, forward unmodified, all tiers green | 5 (local prelim), 6 (structural + full gate) | AC-F6-1, F-6 |

**AC coverage check (spec §17):** AC-F1-1 → TC-RT-001/002 · AC-F1-2 → TC-RT-003/004, TC-RADV-002 · AC-F2-1 → TC-RT-005 · AC-F3-1 → TC-RT-006 · AC-F3-2 → TC-RT-007 · AC-F3-3 → TC-RT-008 · AC-F4-1 → TC-RADV-001, TC-RDIAG-001/002/003 · AC-F4-2 → TC-RT-009, TC-RDIAG-004 · AC-F5-1 → TC-NORM-001/002 · AC-F6-1 → TC-REG-001. **All 10 ACs covered.**

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-92-spec.md | Spec (authority: ACs, DEC-1..7, Appendices A/B) |
| Test plan | ./chg-GH-92-test-plan.md | Test Plan (19 TCs, §4.4 harness mechanics, §6.2 corpus partition) |
| Parser decision (binding) | `doc/decisions/TDR-0012-reverse-storage-xml-parser-saxes.md` | TDR (saxes; pre-lock spike mandated; @xmldom/xmldom fallback) |
| Ticket | GitHub issue GH-92 (MS3-E1-S1) | Ticket (scope authority with PDR-0002) |
| Diagnostic model | `src/domain/markdown/reverse-diagnostics.ts` | Code (new — Phase 2) |
| Serializer / normalizer | `src/domain/markdown/hast-to-markdown.ts`, `src/domain/markdown/normalize.ts` | Code (new — Phase 4) |
| Storage parser + reverse contract | `src/infra/confluence/parse/reverse-parser.ts`, `src/infra/confluence/parse/reverse.ts` | Code (new — Phases 3–4) |
| Golden harness | `tests/golden/markdown/reverse-round-trip.test.ts`, `tests/golden/markdown/reverse-readback.test.ts` | Test (new — Phase 5) |
| Adversarial runner + set | `tests/golden/adversarial/reverse-classification-runner.test.ts`, `tests/adversarial-storage/*` (18 files) | Test (new — Phase 5; placement per PD-5) |
| Partition manifest + sidecars | `tests/golden/fixtures/markdown/round-trip-partition.json`, `tests/golden/fixtures/markdown/reverse/` | Fixtures (new — Phase 5) |
| Storage-only read-back fixtures | `tests/golden/fixtures/markdown/{code-block-python-k1,mermaid-code-policy-k1,readback-realistic}.storage.xhtml` | Fixtures (new — Phase 5) |
| Forward pipeline + corpus (consumed, unchanged) | `src/domain/markdown/*`, `src/domain/render/canonicalize.ts`, `src/infra/confluence/render/storage.ts`, `src/infra/confluence/provenance.ts`, `tests/golden/fixtures/markdown/*` | Code/fixtures (NOT modified — NG-3 tripwire) |
| Dependencies | `package.json` (+ saxes Phase 1; + hast-util-to-mdast Phase 4 if spike passes) | Config |
| Version + changelog | `package.json` (0.9.0), `CHANGELOG.md` | Release (Phase 6) |
| Conventions | `.ai/rules/typescript.md`, `.ai/rules/testing-strategy.md`, `.dependency-cruiser.cjs` | Standards |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-15 | plan-writer (GH-92) | Initial plan. 6 phases, each one green commit: (1) TDR-0012 pre-lock spike — saxes pin, event-surface + fragment-mode verification, 34-fixture Bun smoke, @xmldom/xmldom descend criteria; (2) DM-2 diagnostic model — standalone ReverseError union (PD-2: avoids MarkSyncError-kind → src/cli/ exit-code coupling), stable codes + line:column locations; (3) infra saxes parser — SAX→HAST builder, CDATA/entities/positions, parse-error arm, panel strip, K1 tolerance; (4) domain serializer + normalizer on the unified stack (PD-3: canonicalize → hast-util-to-mdast → remark-gfm stringify; spike-gated, hand-written fallback flagged highest-risk) + classifier/content-mapping + DM-1 entry with fast-fail/collect-all parity; (5) golden harness — partition manifest + guardrail self-test, corpus A/B, Storage-only fixtures (3), reverse sidecars (human-reviewed), Storage-side adversarial set at tests/adversarial-storage/ (PD-5: test plan's tests/adversarial/storage/ subdir would crash pii-audit.test.ts with EISDIR — verified); (6) 0.9.0 bump + CHANGELOG + bun run check/test:bdd + TC-REG-001 structural checks + spec reconciliation. 36 tasks; unit-test paths match the test plan defaults; doc/spec/** deferred to @doc-syncer (phase 7). |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | ☐ Pending | — | — | — | Spike evidence (saxes version, event surface, smoke 34/34, gate verdict) recorded here + TDR-0012 UQ-1 |
| Phase 2 | ☐ Pending | — | — | — | |
| Phase 3 | ☐ Pending | — | — | — | |
| Phase 4 | ☐ Pending | — | — | — | Substrate verdict (4.1) recorded here |
| Phase 5 | ☐ Pending | — | — | — | Sidecar review confirmation recorded here |
| Phase 6 | ☐ Pending | — | — | — | TDR-0012 → Accepted at merge (with license confirmation) |
