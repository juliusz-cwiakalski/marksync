---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-20-markdown-pipeline
status: Updated
created: 2026-07-09T00:00:00Z
last_updated: 2026-07-09T00:06:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, security, fidelity]
links:
  change_spec: ./chg-GH-20-spec.md
  story: ../../../planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S3--markdown-pipeline.md
  feature_spec: ../../../spec/features/feature-safe-publish.md
  adr_0005: ../../../decisions/ADR-0005-page-body-representation-storage-not-adf.md
  architecture_overview: ../../../overview/architecture-overview.md
  spike_findings_h6: ../../../inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md
  kitchensink_reference: ../../../inception/tmp/confluence-api-validation-spike/examples/pages/storage-kitchensink.xml
  typescript_rules: ../../../../.ai/rules/typescript.md
  testing_strategy: ../../../../.ai/rules/testing-strategy.md
  result_contract: ../../../../src/domain/result.ts
  errors_contract: ../../../../src/domain/errors.ts
  gh19_plan_precedent: ../2026-07-09--GH-19--state-manager-lock-cache/chg-GH-19-plan.md
summary: >
  Deliver MS2-E3-S3 (epic MS2-E3 — Safe Publish Core, third story): the
  body-representation half of ADR-0005. A deterministic Markdown → Confluence
  Storage Format pipeline, adapter-agnostic up to the last hop:
  `parseMarkdown` (remark + remark-gfm) → MDAST→HAST bridge (remark-rehype) →
  `canonicalize` + `contentHash` (native sha256 over canonical HAST) →
  `renderStorage` (HAST→Storage XHTML string-builder visitor implementing the
  spike-H6 construct mapping), plus an unsupported-node classifier emitting the
  pre-existing `UnsupportedConstruct` arm, golden `*.md`/`*.storage.xhtml`
  fixtures over the remark-gfm-reachable constructs (25: spike 27 minus
  `<sub>`/`<sup>`, which plain remark-gfm cannot produce — PM-DEC-1), and
  NFR-SEC-5 injection-safety property tests. Four runtime deps installed
  (remark, remark-gfm, rehype, remark-rehype); `mdast`/`hast` added as
  type-only devDependencies (zero runtime surface); mermaid/jsdom/happy-dom
  explicitly NOT installed (E4-S1). Reuses `Result<T,E>` + `MarkSyncError`
  unchanged — adds NO error kind; `parseMarkdown` is treated as total in
  MS-0002 (a genuine parse failure throws — invariant violation, per PD-8 /
  PM-DEC-2). Domain modules import nothing; only
  `src/infra/confluence/render/storage.ts` lives in the adapter (one-way import
  of domain markdown/render types). Downstream: E3-S5 (drift, consumes the
  hash), E3-S6 (sync engine, wires parse→render), E4-S1/E4-S2
  (mermaid/attachments, consume the hash), E5-S3 (adversarial corpus, reuses
  fixtures).
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-20: [MS2-E3-S3] Markdown pipeline — remark/HAST → Confluence Storage Format

## Context and Goals

This plan delivers the **body-representation layer** of MS-0002 (epic MS2-E3 — Safe
Publish Core, third story) and the **body half of ADR-0005**. Until it lands, MarkSync
cannot render a single page body, give drift detection a hash to reason over, or prove
its fidelity / no-silent-drop / injection-safety promises. Concretely it establishes:

- the **parser** — `parseMarkdown(bytes, opts): Result<MdastRoot, MarkSyncError>` via
  `remark` + `remark-gfm`, producing the canonical MDAST intermediate (F-1);
- the **MDAST→HAST bridge** — `remark-rehype` configured for the canonical subset,
  producing the adapter-agnostic HAST the canonicalizer hashes and the renderer walks
  (F-2);
- the **canonicalizer + content-hash function** — `canonicalize(hast): CanonicalHast` +
  `contentHash(canonical): string` (native `sha256`, lowercase hex), realizing the
  **Content Hash** VO E3-S5 drift + E4 dedup key on (F-3);
- the **HAST→Storage XHTML renderer** — `renderStorage(hast, opts): Result<{ body; hash },
  MarkSyncError>`: a small string-builder visitor implementing the spike-H6
  construct mapping (CDATA code bodies; omitted `ac:schema-version`/`ac:macro-id`;
  well-formed XML) (F-4);
- the **unsupported-node classifier** — nodes outside the canonical subset → the
  pre-existing `UnsupportedConstruct { construct; sourcePath }` arm; never silently
  dropped (F-5);
- the **golden fixtures** — byte-stable `*.md` + `*.storage.xhtml` pairs (25: the
  remark-gfm-reachable subset of the spike's 27 — `<sub>`/`<sup>` excluded; see
  PM-DEC-1 / PD-6) with the spike `storage-kitchensink.xml` as the consolidated
  reference (F-6);
- the **injection-safety property tests** (NFR-SEC-5) — malicious Markdown → inert
  escaped output (F-7).

The plan is derived entirely from the authoritative spec `chg-GH-20-spec.md` (7
capabilities F-1..F-7, 6 decisions DEC-1..DEC-6, 8 acceptance criteria, NFR-REL-4 /
NFR-SEC-5), the story file `MS2-E3-S3--markdown-pipeline.md`, ADR-0005 (C-1 lossless,
C-3 well-formed XML), and spike H6 (the construct-mapping table + 3 converter rules at
`atlassian-api-spike-findings.md` lines 17-41). PM-DEC-1 re-baselines the golden fixture
set to the 25 remark-gfm-reachable constructs (`<sub>`/`<sup>` are unreachable from plain
remark-gfm — the spike kitchensink that listed them was hand-authored Storage XML, not
markdown); PM-DEC-2 settles the parse-failure path (`parseMarkdown` is total in MS-0002;
see PD-8). It invents no requirements. The change spec is the contract authority; this
plan operationalizes it.

The phase ordering follows spec §18 "Ordering within the story" — each step is
independently testable and lands its own commit, mirroring the GH-19 plan's
phase-per-commit house style.

### Binding decisions

> Plan-level decisions (PD-\*) that operationalize the spec. The spec's DEC-1..DEC-6 are
> committed and not re-litigated here; PD-\* below fill in the implementation-level
> choices the spec leaves open.

- **PD-1 — Phase ordering = spec §18 ordering.** Phase 0 dep install → 1 parser → 2
  bridge → 3 canonicalize/hash → 4 classifier → 5 renderer-by-construct-group + 25
  golden fixtures → 6 injection-safety → 7 integration round-trip + XML
  well-formedness + determinism → 8 final gate. Each phase = one logical commit; each
  independently `bun test`-able.
- **PD-2 — `contentHash` = raw lowercase-hex `sha256` over the canonicalized HAST via
  native `node:crypto.createHash`.** Resolves spec OQ-1: this module owns the
  deterministic digest; the `sha256:`-prefixed `renderedBodyHash` wire format is E3-S5's
  binding concern. Uses `node:crypto.createHash("sha256").update(serialized).digest("hex")`
  (sync, deterministic, no crypto library — typescript.md "No crypto library").
  `serialized` is a stable canonical stringification of `CanonicalHast` (sorted keys,
  no position metadata). `crypto.subtle` is the spec-cited alternative; `createHash` is
  chosen for sync ergonomics and identical output.
- **PD-3 — Reuse `Result.ok`/`Result.err` + the pre-existing `UnsupportedConstruct` arm;
  add NO error kind (spec NG-7 / DEC-2).** `renderStorage` narrows its Result error to
  the existing arm; the classifier returns `err({ kind: "UnsupportedConstruct";
  construct; sourcePath })`. `UnsupportedConstruct` is **NOT** overloaded for parse
  failures — see PD-8 (PM-DEC-2).
- **PD-4 — XML-well-formedness assertion (AC-F4-3) uses a small hand-written
  test-tier checker, NOT a runtime XML-parser dependency.** *(Decision flagged per
  task brief.)* Bun ships no native XML parser and `xmldom`/`jsdom`/`happy-dom` are
  out of scope for E3-S3 (they are E4-S1 mermaid). Two options were evaluated: **(a)**
  a ~80-line assertion-only checker that tracks a tag stack, recognizes `ac:`/`ri:`
  namespaced + self-closing tags, skips `<![CDATA[…]]>` interiors, and rejects raw
  `<`/`&` outside valid entities/CDATA; **(b)** a zero-dependency devDep SAX parser
  (`saxes`). **Chosen: (a)**, justified by the minimal-dependency rule (typescript.md
  "Minimal dependencies" — the maintainer is solo; the assertion surface is bounded).
  Independence risk (a checker sharing the converter's blind spots) is mitigated by a
  dedicated **negative-test suite** that proves the checker rejects every known
  malformed shape (unbalanced tag, unterminated CDATA, raw `<`/`&` outside CDATA,
  unclosed `ac:`/`ri:` self-closing) **before** it ever validates converter output. It
  is assertion-only test code under `tests/` (excluded from `tsc --rootDir src` and
  `depcruise src`), never shipped in the binary. If the DoR/review prefers a TDR, escalate
  to `@decision-advisor`; otherwise this PD stands.
- **PD-5 — HAST→Storage emission is a small, tested string-builder visitor over plain
  HAST objects (spec DEC-6).** No DOM-serialization runtime library. Well-formedness is
  enforced by golden snapshots + the AC-F4-3 checker (NFR-3), not by a serializer.
- **PD-6 — Golden fixtures = committed `*.md` + `*.storage.xhtml` file pairs (25),
  namespaced under `tests/golden/fixtures/markdown/`, with a consolidated
  `kitchensink` parity pair.** **Re-baselined from the spec's 27 per PM-DEC-1: `<sub>`/
  `<sup>` are EXCLUDED from the golden Markdown fixture set** — plain remark-gfm cannot
  produce `~text~`/`^text^` (non-GFM syntax), and the spike kitchensink that listed them
  was hand-authored Storage XML, not markdown-generated. The fidelity bar is the
  remark-gfm-reachable subset (25 = spike 27 − `<sub>` − `<sup>`). The visitor still maps
  `<sub>`/`<sup>` HAST nodes **defensively** (a visitor arm emits `<sub>`/`<sup>` if such
  a node ever appears), verified by a hand-constructed-node unit test (Phase 5.4), NOT a
  golden fixture. File snapshots (`toMatchSnapshot`) per testing-strategy §"Snapshot
  rules"; updates explicit (`bun test --update-snapshots`), never automatic in CI. The 25
  per-construct pairs derive from the spike H6 table minus `<sub>`/`<sup>`; the kitchensink
  pair derives byte-for-byte from `storage-kitchensink.xml` (the sub/sup bytes there are
  preserved by the defensive visitor when present).
- **PD-7 — Raw inline HTML is ESCAPED; task-list + regular-list mixing emits a warning
  (spec DEC-4 / DEC-5).** Both behaviours are asserted in Phase 6. Escaping preserves
  text without passthrough (the spike proved Confluence strips raw HTML anyway); the
  mixing warning surfaces an unrepresentable construct rather than emitting wrong output.
- **PD-8 — `parseMarkdown` is treated as TOTAL in MS-0002; a genuine parse failure
  `throw`s (invariant violation), NOT a `Result.err` and NOT an `UnsupportedConstruct`.**
  (PM-DEC-2.) `remark`/`unified` parsing is lenient — nearly all Markdown text produces a
  valid MDAST (a paragraph), so a genuine parse throw is rare and an invariant-level
  fault. The `Result<MdastRoot, MarkSyncError>` signature is **kept** for port-contract
  alignment (architecture-overview `renderBody`/parse port), but in practice
  `parseMarkdown` returns `Result.ok`. Per typescript.md "Error handling", `throw` is
  reserved for invariant violations — a parse throw qualifies; mapping it onto
  `UnsupportedConstruct` would overload that arm (a different recovery action — PD-3) and
  is forbidden. **Doc-sync (phase 7):** `architecture-overview.md:219` documents the parse
  port as `→ MdastRoot | ParseError`, but `ParseError` does **not** exist in
  `MarkSyncError` (confirmed: `src/domain/errors.ts`) and NG-7 forbids adding kinds. This
  documented-contract drift is a phase-7 doc-sync item (already in pm-notes `doc_risks`);
  it is NOT fixed in code here.

### Open questions

> DoR iter-1 closed both open questions via PM-DEC-1 / PM-DEC-2 (recorded as PD-6 /
> PD-8). Retained below as **resolved**, for traceability.

- **`parseMarkdown` parse-failure error arm — RESOLVED (PM-DEC-2 → PD-8).** The
  architecture-overview "Internal interface contracts" table names a `ParseError` for the
  parse port, but that arm **does not exist** in `MarkSyncError` (confirmed:
  `src/domain/errors.ts`) and spec NG-7 / DEC-2 forbids adding a kind. PM-DEC-2:
  `remark-gfm` is effectively total (very tolerant), so treat `parseMarkdown` as total in
  MS-0002 — a genuine `unified` throw is an invariant violation → `throw` (per
  typescript.md error handling), NOT a `Result.err` and NOT an `UnsupportedConstruct`. Do
  NOT overload `UnsupportedConstruct` (different recovery action — PD-3). The
  `Result<MdastRoot, MarkSyncError>` signature stays for port-contract alignment. The
  `architecture-overview.md:219` `ParseError` reference is documented-contract drift for
  phase-7 doc-sync (already in pm-notes `doc_risks`).
- **Construct enumeration & fidelity bar — RESOLVED (PM-DEC-1 → PD-6).** The spike H6
  table lists 27 constructs, but `<sub>`/`<sup>` are unreachable from plain remark-gfm
  (`~text~`/`^text^` are non-GFM; the spike kitchensink that listed them was hand-authored
  Storage XML, not markdown). The golden fixture set is re-baselined to the
  remark-gfm-reachable 25 (spike 27 − `<sub>` − `<sup>`); the visitor maps `<sub>`/`<sup>`
  HAST nodes defensively (PD-6 / Phase 5.4). The exact 25 fixture filenames are enumerated
  at delivery by walking the spike table minus `<sub>`/`<sup>`.

### Out of scope

- **Confluence API writes** (POST/PATCH pages) — E3-S4 (adapter client) / E3-S6 (sync
  engine). This story renders bytes; no HTTP.
- **Mermaid render-to-image** — the `mermaid` fence is *detected* here (emitted as a code
  macro like any fenced block); the in-process render + upload is E4-S1. `mermaid` /
  `jsdom` / `happy-dom` are NOT installed.
- **Image/attachment binary upload + dedup** — the `<ri:attachment ri:filename="…"/>`
  reference is *emitted* here; upload is E4-S2.
- **Reverse conversion** (Storage/ADF → Markdown) — MS-0005+.
- **Macro fallbacks for footnotes/definition-lists/math** — classified as
  `UnsupportedConstruct` here; fallback strategy deferred (ADR-0005 unresolved questions).
- **New `MarkSyncError` kinds** — reuses `UnsupportedConstruct`; adds none (NG-7).
- **Content-hash wire-format prefix** — the `sha256:`-prefixed `renderedBodyHash` is
  E3-S5's binding concern (OQ-1).
- **A DOM-serialization runtime library** — string-builder visitor only (DEC-6).
- **System-spec / doc reconciliation** — lifecycle phase 7 (`@doc-syncer`): tag the
  Markdown-pipeline component in `feature-safe-publish.md` §4.2 +
  `architecture-overview.md`; bind Body Representation + Content Hash VOs in
  `ubiquitous-language.md`; move remark/rehype from "Planned" to "Installed" in
  `.ai/rules/typescript.md`; populate ADR-0005 "Lessons Learned". **DoR iter-1 doc-drift
  items (already in `chg-GH-20-pm-notes.yaml` `doc_risks`, NOT fixed here):** (a)
  `architecture-overview.md:219` parse-port `ParseError` reference — does not exist in
  `MarkSyncError` (PM-DEC-2 / PD-8); reconcile the port contract; (b)
  `testing-strategy.md:44` references the STALE path
  `src/infra/render/storage-renderer.ts` — actual path is
  `src/infra/confluence/render/storage.ts` (Finding 5). Doc risks are recorded in
  `chg-GH-20-pm-notes.yaml` `doc_risks`.
- **Version bump** — repo bumps at release boundaries, not per change (GH-19 precedent;
  `version_impact: minor` is advisory).

### Constraints

- **Tier rules** (`.ai/rules/typescript.md`, dep-cruiser-enforced, severity `error`):
  - `src/domain/markdown/parse.ts`, `mdast-to-hast.ts`, `unsupported.ts` — **domain**;
    import only `#domain/*` (+ type-only `mdast`/`hast`/`remark`/`remark-rehype` types +
    `node:crypto` where hashing lives). **No** `#infra/*`, `#app/*`, `#cli/*`.
  - `src/domain/render/canonicalize.ts` — **domain**; import only `#domain/*` (+ `hast`
    types + `node:crypto`). No infra/app/cli.
  - `src/infra/confluence/render/storage.ts` — **infrastructure**; import `#domain/*`
    (markdown/render types) + `hast` types. **May** import domain; the reverse is
    forbidden (NFR-10 / AC-Q-1). Never app/cli.
  - dep-cruiser enforcement is **partial** (Finding 6): `.dependency-cruiser.cjs`
    defines exactly four `forbidden` rules — `domain-may-not-import-infra`,
    `domain-may-not-import-app`, `presentation-may-not-import-domain` (cli→domain),
    `presentation-may-not-import-infra` (cli→infra). **The load-bearing direction for
    AC-Q-1 IS enforced**: `domain-may-not-import-infra` forbids `src/domain/** →
    src/infra/**` at severity `error`, which is the reverse of the
    `src/infra/confluence/render/storage.ts → src/domain/**` edge this story adds — so a
    domain→infra leak fails the build. **Gaps (out of scope here):** there is no
    `infra→app`/`infra→cli` rule and no rule forbidding `infra→domain` (that direction is
    *allowed*, since infra implements ports); the broader ports-and-adapters matrix is not
    fully encoded. Hardening dep-cruiser is a future item, not this story.
- **Strict TS** (`verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`): one import statement per module with inline `type`
  modifier; MDAST/HAST/remark types are `import type`. **Type-only packages `mdast` and
  `hast` are added in Phase 0 as `devDependencies` (NOT runtime deps)** — they ship only
  `.d.ts` type definitions, have **zero runtime surface**, and are imported exclusively
  via `import type` (Finding 7). Per the spec's now-clarified "runtime dependencies"
  framing, the runtime list stays at the 4 unified-ecosystem packages; `mdast`/`hast` are
  type-only dev deps (a minimal-dep-compliant clarification, not a 5th/6th runtime dep).
  Added only if not already transitively resolvable from `remark`/`rehype`.
- **ESM-only**; path aliases via `package.json` `"imports"` (`#domain/*`, `#infra/*`).
  Tests use `#`-aliases, not deep relative paths (typescript.md "Tests use import
  aliases"). `bunfig.toml` `root = "tests"` + the mermaid preload (a no-op stub until
  E4-S1) are harmless for these tests.
- **Error discipline**: domain/infra functions return `Result<T, MarkSyncError>` (never
  `throw` for expected failures). `throw` is reserved for invariant violations only.
  `renderStorage` surfaces expected failures (`UnsupportedConstruct`) on the `Result`
  channel. `parseMarkdown` keeps the `Result<MdastRoot, MarkSyncError>` signature for
  port-contract alignment but is **treated as total in MS-0002** (PD-8 / PM-DEC-2):
  `remark-gfm` is very tolerant, so a genuine parse failure is an invariant violation →
  `throw`, NOT a `Result.err` and NOT an `UnsupportedConstruct`.
- **Comment discipline**: ≤ 3-line file headers; self-documenting code; cite ADR-0005
  (C-1/C-3) and spike H6 once at the load-bearing point (the `renderStorage` visitor);
  no bare `(DEC-x)`/`(NFR-x)` tags, no spec restatements.
- **Quality gate:** `bun run check` = lint + format:check + typecheck + test +
  check:boundaries; must exit 0 (AC-Q-1). Conventional Commits (commitlint + husky,
  72-char header); each phase = one logical commit; `check:boundaries` green at every
  commit.

### Risks

- **RSK-1 — A construct is silently dropped instead of classified** (violates ADR-0005
  "do not silently degrade"). Mitigated by F-5 classifier emitting
  `UnsupportedConstruct` for every non-canonical node + AC-F5-1 / Phase-4 property tests
  over footnote/math/definition-list/raw-HTML-block.
- **RSK-2 — Malicious Markdown injects a server-side `<ac:structured-macro>` from source
  text** (NFR-SEC-5). Mitigated by text entity-escaping on emission; CDATA wraps only
  code-fence bodies; F-7 property tests assert 0 injected macros + 0 executable content
  (Phase 6). Confluence's sanitizer is defense-in-depth, not the primary control.
- **RSK-3 — Non-deterministic output breaks byte-stability** (golden churn / drift
  false-positives). Mitigated by F-3 canonicalizer (sorted attrs, normalized
  whitespace) + the string-builder emitting no random/time data + AC-F4-5 / AC-F3-1
  determinism tests (Phase 7); snapshot updates are explicit.
- **RSK-7 — Ill-formed XML reaches Confluence → HTTP 400** (ADR-0005 C-3). Mitigated by
  AC-F4-3 (Phase 7): every rendered body passes the PD-4 well-formedness checker;
  NFR-3 makes it a measurable threshold.
- **RSK-4 — A remark/rehype major bump reshapes MDAST/HAST → golden drift.** Mitigated
  by pinning major versions (`^`) + exact lock (`bun.lock`); re-baselining is an
  explicit reviewed action (testing-strategy §"Snapshot rules").

### Success Metrics

- **25/25** remark-gfm-reachable GFM fixtures byte-match their golden `.storage.xhtml`
  (AC-F4-1 / NFR-REL-4 — re-baselined per PM-DEC-1; `<sub>`/`<sup>` excluded as
  remark-gfm-unreachable, covered by a defensive unit test instead).
- **100%** of fenced code blocks emit `<ac:structured-macro ac:name="code">` +
  `<![CDATA[…]]>`; **0** occurrences of `ac:schema-version` / `ac:macro-id` (AC-F4-2).
- **100%** of rendered bodies are well-formed XML (AC-F4-3).
- An unsupported node (footnote/math/definition-list/raw-HTML-block) →
  `UnsupportedConstruct`, **never** a silent omission (AC-F5-1).
- Malicious fixtures → **0** `<ac:structured-macro>` derived from source + **0**
  executable content (AC-F4-4 / NFR-SEC-5).
- Same input rendered N times → **byte-identical** output + identical hash (AC-F4-5 /
  AC-F3-1).
- `remark`/`remark-gfm`/`rehype`/`remark-rehype` installed; `mermaid`/`jsdom`/`happy-dom`
  **not** installed (NFR-11).
- `src/infra/confluence/render/` may import domain markdown/render types but **not vice
  versa** (enforced by dep-cruiser's `domain-may-not-import-infra` rule — the load-bearing
  direction for this story; see Constraints / Finding 6); `bun run check` exits 0
  (AC-Q-1).

---

## Execution Strategy

Nine phases, one logical commit each. Phase 0 installs the unified ecosystem and
re-baselines the gate; Phases 1-4 build the adapter-agnostic domain core (parser →
bridge → canonicalize/hash → classifier), each independently testable; Phase 5 lands the
HAST→Storage visitor incrementally by construct group, each group against its golden
snapshot, totalling 25 fixtures (remark-gfm-reachable subset; `<sub>`/`<sup>` defensive
only — PM-DEC-1); Phase 6 hardens injection safety; Phase 7 wires the end-to-end
round-trip + the XML-well-formedness assertion + determinism; Phase 8 runs the full gate
and confirms the boundary direction. `bun run check:boundaries` runs in every phase.
Suggested commit scopes: `feat(markdown)`, `feat(render)`, `test(golden)`.

---

### Phase 0: Install the unified Markdown ecosystem + re-baseline the gate

**Goal**: Install the four runtime dependencies the spec names (`remark`, `remark-gfm`,
`rehype`, `remark-rehype`), confirm `mermaid`/`jsdom`/`happy-dom` stay absent (NFR-11),
re-baseline the gate, and (if needed) add the type-only `mdast`/`hast` packages so
`verbatimModuleSyntax` type imports resolve. No production code yet.

**Tasks**:

- [ ] **0.1** Add to `package.json` `dependencies`: `remark`, `remark-gfm`, `rehype`,
      `remark-rehype` (each `^<current-major>`; the committed `bun.lock` pins exact).
      Run `bun install`.
- [ ] **0.2** Type-only packages (Finding 7 / PM framing): attempt `import type { Root as
      MdastRoot } from "mdast"` and `import type { Root as HastRoot } from "hast"`
      resolution; if they are not transitively resolvable from `remark`/`rehype`, add
      `mdast` and `hast` to **`devDependencies`** (NOT `dependencies`). These packages
      ship ONLY `.d.ts` type definitions, have **zero runtime surface**, and are imported
      exclusively via `import type` — so they are NOT a 5th/6th runtime dependency; the
      spec's "runtime dependencies" list stays at the 4 unified-ecosystem packages
      (`remark`/`remark-gfm`/`rehype`/`remark-rehype`). This is a minimal-dep-compliant
      clarification, recorded in the execution log.
- [ ] **0.3** Verify `bun run check` still exits 0 (no existing test broken by the new
      deps) and assert `mermaid` / `jsdom` / `happy-dom` are absent from
      `bun.lock` / `node_modules` (NFR-11).

**Acceptance Criteria**:

- Must: `bun install` succeeds; `bun run typecheck` + `bun run check:boundaries` exit 0.
- Must: `remark`/`remark-gfm`/`rehype`/`remark-rehype` present; `mermaid`/`jsdom`/
  `happy-dom` absent (NFR-11).

**Files and modules**:

- Code areas: `package.json` (updated), `bun.lock` (updated).
- System docs: none (moving remark/rehype "Planned → Installed" in `.ai/rules/typescript.md`
  is lifecycle phase 7 / `@doc-syncer`).

**Tests**:

- Manual: `bun install && bun run typecheck && bun run check:boundaries`; `bun pm ls`
  confirms dep scope.

**Completion signal**: `feat(markdown): install remark/rehype ecosystem for E3-S3 (GH-20)`

---

### Phase 1: `parseMarkdown` — bytes → MDAST (F-1)

**Goal**: Deliver F-1 — the canonical pipeline entry. `parseMarkdown(bytes, opts)` runs
`remark` + `remark-gfm` (tables, strikethrough, task-lists, autolink-literals) and returns
`Result<MdastRoot, MarkSyncError>`. `sourcePath` flows through `opts` so any downstream
`UnsupportedConstruct` carries provenance. The parser invents no constructs — the canonical
subset is exactly what `remark-gfm` recognizes.

**Tasks**:

- [ ] **1.1** Create `src/domain/markdown/parse.ts` (new):
      - `parseMarkdown(bytes: Uint8Array | string, opts?: { sourcePath?: string }):
        Promise<Result<MdastRoot, MarkSyncError>>` (or sync if the unified `.parse()` is
        sync — prefer the sync path where available; otherwise async). Normalize
        `Uint8Array` → string via `TextDecoder`.
      - Build a module-singleton processor: `const processor = unified().use(remarkParse)
        .use(gfm);` run `processor.parse(text)`.
      - **Total in MS-0002 (PD-8 / PM-DEC-2):** `remark-gfm` is very tolerant — nearly
        any text parses to a valid MDAST (a paragraph). A genuine `unified` throw is an
        invariant violation → **let it propagate (`throw`)**; do NOT catch-and-map to
        `UnsupportedConstruct` (overloading that arm is forbidden — PD-3). The
        `Result<MdastRoot, MarkSyncError>` signature is KEPT for port-contract alignment
        (architecture-overview parse port); in practice `parseMarkdown` returns
        `Result.ok(root)`.
      - Imports: type-only `mdast`/`unified`/`remark` types + `#domain/result`,
        `#domain/errors`. **No** infra/app/cli.
      - ≤ 3-line header; cite ADR-0005 + this change once.
- [ ] **1.2** Create `tests/unit/domain/markdown/parse.test.ts` (new) — **Unit**; real
      remark (no mock):
      - **TC-PARSE-001:** `"# Title\n\nparagraph **bold**\n"` → `ok` with a root whose
        first child is `heading` depth 1; asserts the GFM subset is recognized.
      - **TC-PARSE-002:** a GFM table + task-list source → `ok`; the MDAST contains
        `table` and `list` (with `checked`) nodes (proves remark-gfm is wired).
      - **TC-PARSE-003:** `opts.sourcePath` is threaded so a downstream
        `UnsupportedConstruct` can read it (set it; assert the returned root's call path
        is consistent — provenance is asserted at the classifier site in Phase 4).
      - **TC-PARSE-004 (PD-8):** a `unified` throw (provoked only by an invariant-level
        fault in practice — remark-gfm does not throw on normal text) is NOT caught and
        NOT mapped to `UnsupportedConstruct`; it propagates as a `throw` (invariant
        violation). Test asserts the throw path (e.g. inject a processor misconfiguration
        that throws) and that no `UnsupportedConstruct` is produced for a parse failure.

**Acceptance Criteria**:

- Must: valid GFM source → `ok(MdastRoot)` with recognized GFM nodes (F-1).
- Must: a `unified` throw propagates (invariant violation), is NOT mapped to
  `UnsupportedConstruct` (PD-8 / PM-DEC-2); `parseMarkdown` is effectively total over
  MS-0002 inputs.
- Must: `bun run check` exits 0; `check:boundaries` clean (`parse.ts` imports domain +
  type-only packages only).

**Files and modules**:

- Code areas: `src/domain/markdown/parse.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/markdown/parse.test.ts`

**Completion signal**: `feat(markdown): parseMarkdown via remark + remark-gfm (GH-20)`

---

### Phase 2: MDAST→HAST bridge (F-2)

**Goal**: Deliver F-2 — the adapter-agnostic bridge. `mdastToHast(mdast)` runs
`remark-rehype` configured for the canonical subset so node kinds outside it are preserved
enough to be classified (F-5) rather than lost. HAST is the intermediate the canonicalizer
hashes (F-3) and the Storage visitor walks (F-4).

**Tasks**:

- [ ] **2.1** Create `src/domain/markdown/mdast-to-hast.ts` (new):
      - `mdastToHast(mdast: MdastRoot): HastRoot` — run the MDAST through
        `unified().use(remark2rehype)` (with a configuration that does NOT strip
        unrecognized nodes — keep `passThrough`/default handling so the classifier can
        see them; raw inline HTML is handled at render per DEC-4).
      - Return the HAST root directly (no `Result` — the bridge is total over a valid
        MDAST; the classifier handles the unsupported cases downstream).
      - Imports: type-only `mdast`/`hast`/`remark-rehype` types. **No** infra/app/cli.
      - ≤ 3-line header; cite spike H6 / ADR-0005 once.
- [ ] **2.2** Create `tests/unit/domain/markdown/mdast-to-hast.test.ts` (new) — **Unit**:
      - **TC-BRIDGE-001:** parse a headings + paragraph + code-block source; bridge;
        assert the HAST contains `h1`, `p`, `pre>code`.
      - **TC-BRIDGE-002:** GFM table + task-list source → HAST `table` (thead/tbody) +
        `div`/`ul` with task-list-li (depends on remark-rehype + remark-gfm task-list
        representation; assert the nodes are present and classifiable).
      - **TC-BRIDGE-003:** a source with raw inline HTML (`<b>x</b>`) → the bridge
        surfaces it in a form the renderer will escape (DEC-4); assert no node is lost
        (no silent drop at the bridge).

**Acceptance Criteria**:

- Must: canonical-subset constructs round-trip into HAST (F-2).
- Must: no node is silently lost at the bridge (RSK-1 mitigation at the MDAST layer).
- Must: `bun run check` exits 0; `check:boundaries` clean.

**Files and modules**:

- Code areas: `src/domain/markdown/mdast-to-hast.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/markdown/mdast-to-hast.test.ts`

**Completion signal**: `feat(markdown): MDAST→HAST bridge via remark-rehype (GH-20)`

---

### Phase 3: Canonicalizer + `contentHash` (F-3, AC-F3-1)

**Goal**: Deliver F-3 — the deterministic HAST canonicalizer and the Content Hash
function. `canonicalize(hast): CanonicalHast` normalizes the HAST (stable attribute
order, normalized whitespace, no source-position metadata) so two semantically-identical
documents hash identically. `contentHash(canonical): string` computes the raw lowercase-
hex `sha256` over the canonical form (PD-2) — the Content Hash VO E3-S5 drift + E4 dedup
key on.

**Tasks**:

- [ ] **3.1** Create `src/domain/render/canonicalize.ts` (new):
      - `type CanonicalHast = HastRoot` (a branded alias documenting that the tree is in
        canonical form).
      - `canonicalize(hast: HastRoot): CanonicalHast` — deep-clone with: (a) every
        element's `properties`/attributes serialized in sorted-key order; (b) collapsible
        whitespace normalized (leading/trailing + runs → single space in text nodes, per
        a documented rule sufficient for AC-F3-1); (c) `position` metadata stripped (no
        source-location leakage into the hash).
      - `contentHash(canonical: CanonicalHast): string` —
        `node:crypto.createHash("sha256").update(stableStringify(canonical)).digest("hex")`
        (PD-2). `stableStringify` = deterministic JSON (sorted keys, no whitespace). Raw
        digest only — no wire-format prefix (OQ-1: consumer owns prefix).
      - Imports: type-only `hast` types + `node:crypto`. **No** infra/app/cli.
      - ≤ 3-line header; cite ADR-0005 + UL "Content Hash" once.
- [ ] **3.2** Create `tests/unit/domain/render/canonicalize.test.ts` (new) — **Unit**:
      - **TC-HASH-001 (AC-F3-1):** bridge a fixture → `canonicalize` → `contentHash`;
        call `contentHash` twice on the same `CanonicalHast` → identical digest.
      - **TC-HASH-002 (AC-F3-1):** two HASTs differing only in attribute order or
        `position` → `canonicalize` → identical digest (canonicalization is the contract).
      - **TC-HASH-003:** two semantically-different fixtures → different digests.
      - **TC-HASH-004:** digest is lowercase hex, length 64, matches a hardcoded
        expected value for a known fixture (pins the algorithm — no prefix).

**Acceptance Criteria**:

- Must: same canonical HAST → identical `sha256` (AC-F3-1, NFR-7).
- Must: attribute-order / position-only differences hash identically (RSK-3 mitigation).
- Must: raw lowercase-hex digest, no prefix (OQ-1 resolved).
- Must: `bun run check` exits 0; `check:boundaries` clean (`canonicalize.ts` imports
  domain + `node:crypto` only).

**Files and modules**:

- Code areas: `src/domain/render/canonicalize.ts` (new).
- System docs: none (UL "Content Hash" VO → code-construct binding is lifecycle phase 7).

**Tests**:

- `bun test tests/unit/domain/render/canonicalize.test.ts`

**Completion signal**: `feat(render): canonicalize HAST + contentHash sha256 (GH-20)`

---

### Phase 4: Unsupported-node classifier (F-5, AC-F5-1)

**Goal**: Deliver F-5 — the classifier that walks MDAST/HAST for node kinds outside the
canonical subset (footnotes, definition lists, math, raw-HTML *blocks*, app content) and
emits the pre-existing `UnsupportedConstruct { construct; sourcePath }` arm. It is the
enforcer of ADR-0005's "do not silently degrade" obligation. Pure domain, no I/O;
invoked by `renderStorage` (and optionally a pre-classify pass).

**Tasks**:

- [ ] **4.1** Create `src/domain/markdown/unsupported.ts` (new):
      - `classifyUnsupported(node: MdastNode | HastNode, sourcePath: string):
        MarkSyncError | null` — returns `err` payload `{ kind: "UnsupportedConstruct";
        construct: <node-type-or-tagName>; sourcePath }` for nodes outside the canonical
        subset (an explicit allow-list keyed by node type / tag name), else `null`.
      - `findUnsupported(root, sourcePath): MarkSyncError | null` — a walker that returns
        the first unsupported node's error (or `null` if the tree is clean). Used as the
        no-silent-drop guard before/inside render.
      - The canonical allow-list = the HAST node types the renderer handles = the spike
        H6 construct set: the 25 remark-gfm-reachable constructs (golden) PLUS `<sub>`/
        `<sup>` (defensively mapped per PM-DEC-1 / PD-6 — so they are ALLOWED, not
        classified as unsupported, even though no markdown golden fixture produces them).
        Footnotes/definition-lists/math/raw-HTML-block/app content = unsupported. Raw
        **inline** HTML is NOT classified here — it is escaped at render (DEC-4 / PD-7).
      - Imports: type-only `mdast`/`hast` types + `#domain/errors`. **No** infra/app/cli.
      - ≤ 3-line header; cite ADR-0005 "do not silently degrade" once.
- [ ] **4.2** Create `tests/unit/domain/markdown/unsupported.test.ts` (new) — **Unit**:
      - **TC-UNSUP-001 (AC-F5-1):** a footnote node → `findUnsupported` returns
        `UnsupportedConstruct { construct: "footnoteDefinition"|"footnoteReference"; … }`.
      - **TC-UNSUP-002 (AC-F5-1):** a math / definition-list node → `UnsupportedConstruct`.
      - **TC-UNSUP-003 (AC-F5-1):** a clean canonical-subset tree (the remark-gfm-
        reachable kitchensink) → `findUnsupported` returns `null` (no false positives —
        the canonical subset is never flagged). A hand-constructed `<sub>`/`<sup>` node is
        also NOT flagged (defensively handled — allowed, per PM-DEC-1).
      - **TC-UNSUP-004:** raw **inline** HTML is NOT classified (returns `null`) — it is
        handled by escape at render (DEC-4); raw HTML **block** IS classified.

**Acceptance Criteria**:

- Must: an unsupported node → `UnsupportedConstruct`, never silently omitted (AC-F5-1,
  NFR-4, RSK-1).
- Must: the canonical subset is never flagged (no false positives).
- Must: emits the **pre-existing** arm verbatim — adds no kind (PD-3).
- Must: `bun run check` exits 0; `check:boundaries` clean.

**Files and modules**:

- Code areas: `src/domain/markdown/unsupported.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/markdown/unsupported.test.ts`

**Completion signal**: `feat(markdown): unsupported-node classifier emitting UnsupportedConstruct (GH-20)`

---

### Phase 5: HAST→Storage renderer + 25 golden fixtures (F-4, F-6, AC-F4-1, AC-F4-2)

**Goal**: Deliver F-4 + F-6 — the HAST→Storage XHTML visitor (`renderStorage`) built
incrementally by construct group, each group landing its golden `.md`/`.storage.xhtml`
snapshot against the spike-H6 mapping, totalling **25 per-construct pairs** (the
remark-gfm-reachable subset of the spike's 27 — `<sub>`/`<sup>` are EXCLUDED from the
golden set because plain remark-gfm cannot produce them; see PM-DEC-1 / PD-6) + a
consolidated `kitchensink` parity pair. The visitor is a small string-builder over plain
HAST objects (DEC-6 / PD-5) emitting well-formed XML (balanced tags, escaped entities
outside CDATA — spike rule #2), CDATA code bodies with omitted
`ac:schema-version`/`ac:macro-id` (spike rule #1), and `<ac:task-list>` as its own block
(spike rule #3). It maps `<sub>`/`<sup>` HAST nodes **defensively** (a visitor arm that
emits `<sub>`/`<sup>` if such a node ever appears — verified by a hand-constructed-node
unit test, NOT a golden fixture). On an unsupported node it delegates to F-5 (never emits
nothing).

**Tasks**:

- [ ] **5.1** Create `src/infra/confluence/render/storage.ts` (new) — the visitor
      scaffold + the entity-escape + CDATA helpers + the `renderStorage` entry:
      - `renderStorage(hast, opts: { sourcePath: string }): Result<{ body: string; hash:
        string }, MarkSyncError>`:
        1. `findUnsupported(hast, opts.sourcePath)` → on hit, `Result.err(...)`
           (no silent drop).
        2. walk the HAST with the construct visitors below, accumulating a string.
        3. `canonicalize` + `contentHash` (F-3) → `hash`; return
           `Result.ok({ body, hash })`.
      - `escapeXml(text)`: `&`/`<`/`>`/`"`→entities (the injection-safety control; RSK-2).
      - `cdata(text)`: wrap code-fence bodies in `<![CDATA[…]]>` (literal `<`/`&`
        preserved).
      - Imports: `#domain/markdown/unsupported`, `#domain/render/canonicalize` (both
        `type` + value), type-only `hast` types. **May** import domain; the reverse is
        forbidden. Never app/cli.
      - ≤ 3-line header; cite ADR-0005 C-1/C-3 + spike H6 once (the load-bearing point).
- [ ] **5.2** Implement the construct visitors by group, landing each group's golden
      fixture pair (the 25 derive from the spike H6 table MINUS `<sub>`/`<sup>`;
      `tests/golden/fixtures/markdown/`):
      - **Group A — headings** (`<h1>`..`<h6>`): fixture `headings.md` + `headings.storage.xhtml`.
      - **Group B — inline formatting** (`<strong>`, `<em>`, nested strong/em, `<s>` /
        `<del>`, inline `<code>`): fixture `inline-formatting.md` + `.xhtml`. (`<sub>`/
        `<sup>` are NOT in this golden fixture — plain remark-gfm cannot produce them;
        the visitor still maps them defensively — see the unit test in 5.4.)
      - **Group C — links** (`<a href>` with `&amp;` preserved via escape): `links.md` + `.xhtml`.
      - **Group D — images** (remote `<ac:image ac:alt="…"><ri:url ri:value="…"/></ac:image>`;
        local `<ac:image><ri:attachment ri:filename="…"/></ac:image>` — upload is E4-S2):
        `images-remote.md`, `images-attachment.md` + `.xhtml`.
      - **Group E — lists** (`<ul>`/`<ol>` with nested `<li>`): `unordered-list.md`,
        `ordered-list-nested.md` + `.xhtml`.
      - **Group F — task-lists** (`<ac:task-list><ac:task><ac:task-status>…</ac:task-status>
        <ac:task-body>…</ac:task-body></ac:task></ac:task-list>`; complete/incomplete):
        `task-list.md` + `.xhtml`.
      - **Group G — blockquote** (`<blockquote><p>…`): `blockquote.md` + `.xhtml`.
      - **Group H — fenced code → code macro** (`<ac:structured-macro ac:name="code">
        <ac:parameter ac:name="language">{lang}</ac:parameter><ac:plain-text-body>
        <![CDATA[{code}]]></ac:plain-text-body></ac:structured-macro>` — CDATA bodies,
        omitted `ac:schema-version`/`ac:macro-id`): `code-block-python.md` + `.xhtml`
        (+ a `mermaid`-lang variant proving detection-only, NG-2).
      - **Group I — thematic break** (`<hr/>`): `hr.md` + `.xhtml`.
      - **Group J — GFM table** (`<table><thead><tr><th>…</thead><tbody>…`): `table.md`
        + `.xhtml`.
      - **Group K — consolidated kitchensink parity**: `kitchensink.md` +
        `kitchensink.storage.xhtml`, the latter derived byte-for-byte from the spike
        reference `storage-kitchensink.xml`.
      *(The 25 individual per-construct pairs are enumerated at delivery by expanding the
      spike H6 families above MINUS `<sub>`/`<sup>` (unreachable from remark-gfm —
      PM-DEC-1); names like `h1`..`h6`, `strong`, `em`, `strike-s`, `strike-del`,
      `code-inline`, `link-plain`, `link-query-amp`, etc. Final enumeration confirmed by
      walking the spike table at delivery.)*
- [ ] **5.3** Create `tests/golden/markdown/storage-renderer.test.ts` (new) — **Golden**
      (testing-strategy §"golden-fixture tier"):
      - **TC-GOLDEN-<construct> (AC-F4-1):** for each of the 25 fixtures + kitchensink —
        `parseMarkdown(fixture.md)` → `mdastToHast` → `renderStorage` → assert
        `result.body === readFileSync(fixture.storage.xhtml)` (**byte-exact** file match,
        per testing-strategy) AND `toMatchSnapshot` (regression layer, explicit update).
      - **TC-CODE-MACRO-001 (AC-F4-2):** every fenced-code fixture's body contains
        `<ac:structured-macro ac:name="code">` + `<ac:plain-text-body><![CDATA[…]]></…>`;
        AND across **all** 25 rendered bodies, `ac:schema-version` and `ac:macro-id`
        appear **0** times (assert via a scan over the rendered corpus).
- [ ] **5.4** Create `tests/unit/infra/confluence/render/storage-defensive.test.ts` (new)
      — **Unit** (PM-DEC-1: `<sub>`/`<sup>` are unreachable from plain remark-gfm, so they
      get a defensive unit test, NOT a golden fixture):
      - **TC-SUBSUP-DEF-001:** hand-construct a HAST tree containing `<sub>` and `<sup>`
        element nodes (not via markdown) → `renderStorage` emits `<sub>…</sub>` and
        `<sup>…</sup>` verbatim (the defensive visitor arm works if a future extension or
        raw-HTML path ever produces these nodes).
      - Asserts the visitor arm exists and is correct WITHOUT claiming a
        markdown→golden round-trip that remark-gfm cannot produce (the spike proved
        sub/sup survive a Storage round-trip when present in XML — preserved here).

**Acceptance Criteria**:

- Must: 25/25 remark-gfm-reachable GFM fixtures byte-match their golden `.storage.xhtml`
  (AC-F4-1 / NFR-REL-4 — re-baselined per PM-DEC-1 from the spec's 27; `<sub>`/`<sup>`
  excluded as remark-gfm-unreachable) + kitchensink parity.
- Must: the defensive `<sub>`/`<sup>` visitor arm emits correct Storage for hand-constructed
  HAST nodes (PM-DEC-1 / PD-6) — no golden markdown fixture claimed for them.
- Must: code blocks use CDATA; `ac:schema-version` / `ac:macro-id` absent (AC-F4-2 / NFR-2).
- Must: snapshot updates explicit (`--update-snapshots`), never auto in CI.
- Must: `bun run check` exits 0; `check:boundaries` clean (the load-bearing
  `domain-may-not-import-infra` rule forbids the reverse `domain → infra` edge — see
  Constraints / Finding 6).

**Files and modules**:

- Code areas: `src/infra/confluence/render/storage.ts` (new); remove the now-obsolete
  `.gitkeep` markers in `src/domain/markdown/`, `src/domain/render/`,
  `src/infra/confluence/` once each dir has real content (boy-scout rule).
- System docs: none (component delivered-tag is lifecycle phase 7).

**Tests**:

- `bun test tests/golden/markdown/storage-renderer.test.ts`
- `bun test tests/unit/infra/confluence/render/storage-defensive.test.ts`

**Completion signal**: `feat(render): HAST→Storage visitor + 25 golden fixtures (GH-20)`

---

### Phase 6: Injection safety + raw-HTML escape + task-list-mixing warning (F-7, AC-F4-4, DEC-4, DEC-5)

**Goal**: Deliver F-7 — the NFR-SEC-5 injection-safety property tests — and assert the
DEC-4 / DEC-5 edge behaviours. Proves malicious Markdown cannot inject server-side
`<ac:structured-macro>` from source text and that raw inline HTML is escaped (not passed
through), plus the task-list + regular-list mixing warning.

**Tasks**:

- [ ] **6.1** Harden `escapeXml` coverage + add the task-list-mixing detection to
      `src/infra/confluence/render/storage.ts`:
      - Confirm `escapeXml` is applied to **every** text/attribute emission path outside
        CDATA (the injection-safety control). Add a `warnings: string[]` accumulator to
        `renderStorage`'s opts/result shape (non-breaking: the success payload becomes
        `{ body; hash; warnings }` — `warnings` defaults to `[]`).
      - Task-list mixing (DEC-5 / NFR-9): when a document mixes `<ac:task-list>` with
        regular `<li>` siblings, push a deterministic warning (e.g.
        `"task-list mixed with regular list items — unrepresentable"`). The construct is
        surfaced, not silently mangled.
- [ ] **6.2** Create `tests/golden/markdown/injection-safety.test.ts` (new) — **Golden/
      property** (NFR-SEC-5 / RSK-2):
      - **TC-INJECT-001 (AC-F4-4):** a Markdown doc whose **text** contains
        `<ac:structured-macro>…</ac:structured-macro>`, `<ac:parameter>…`,
        `<ac:plain-text-body>…` fragments → after parse→bridge→render, the output
        contains **0** `<ac:structured-macro>` elements derived from source (the only
        `ac:structured-macro` in legitimate output is the converter's own code-fence
        emission — assert the malicious one is escaped to inert text).
      - **TC-INJECT-002 (AC-F4-4):** `<script>alert(1)</script>` in source text → output
        contains **0** executable content (`<script>` is escaped; no raw tag survives).
      - **TC-INJECT-003:** a fenced ```code block whose body literally is the macro XML
        → wrapped in the converter's own CDATA code macro (that is the converter emitting,
        not injecting); assert the body is inside CDATA and the outer macro is the
        converter's exactly-one `ac:structured-macro`.
      - **TC-RAWHTML-001 (DEC-4 / NFR-8):** `<b>raw</b>` inline HTML in source → output
        is **escaped** (`&lt;b&gt;raw&lt;/b&gt;`); **0** bytes of raw HTML pass through.
      - **TC-TASKMIX-001 (DEC-5 / NFR-9):** a doc mixing task-list items with regular
        list items → `renderStorage` result carries a `warnings` entry (surfaced, not
        silently wrong).

**Acceptance Criteria**:

- Must: malicious fixtures → 0 `<ac:structured-macro>` derived from source + 0 executable
  content (AC-F4-4 / NFR-SEC-5).
- Must: raw inline HTML is escaped, 0 bytes passthrough (DEC-4 / NFR-8).
- Must: task-list + regular-list mixing emits a warning (DEC-5 / NFR-9).
- Must: `bun run check` exits 0; `check:boundaries` clean.

**Files and modules**:

- Code areas: `src/infra/confluence/render/storage.ts` (hardened: full escape coverage +
  warnings accumulator).
- System docs: none.

**Tests**:

- `bun test tests/golden/markdown/injection-safety.test.ts`

**Completion signal**: `test(render): injection-safety property tests + raw-HTML escape + task-list warning (GH-20)`

---

### Phase 7: Integration round-trip + XML well-formedness + determinism (AC-F4-3, AC-F4-5)

**Goal**: Wire the full pipeline end-to-end, assert every rendered body is well-formed
XML (AC-F4-3 via the PD-4 checker), and lock output + hash determinism (AC-F4-5 /
AC-F3-1). This is the ADR-0005 C-3 discharge.

**Tasks**:

- [ ] **7.1** Create `tests/_helpers/assert-well-formed-xml.ts` (new) — the PD-4
      test-tier checker (assertion-only, NOT production code):
      - `assertWellFormedXml(body: string): void` — throws on malformedness. Tracks a
        tag stack; recognizes `ac:`/`ri:` namespaced + self-closing tags; skips
        `<![CDATA[…]]>` interiors; rejects raw `<`/`&` outside valid entities/CDATA;
        rejects unterminated CDATA; asserts every opened tag is closed. ~80 lines.
      - Lives under `tests/` (excluded from `tsc --rootDir src` and `depcruise src`); no
        production import.
- [ ] **7.2** Create `tests/unit/_helpers/assert-well-formed-xml.test.ts` (new) — the
      **negative-test suite** proving the checker's independence (PD-4 mitigation):
      - rejects an unbalanced tag; rejects a raw `<` outside CDATA; rejects a raw `&`
        not part of a valid entity; rejects unterminated `<![CDATA[`; rejects an unclosed
        `ac:`/`ri:` self-closing tag; **accepts** the spike kitchensink XML and every
        Phase-5 rendered golden body (the checker must not false-positive on real output).
- [ ] **7.3** Create `tests/integration/markdown/pipeline-roundtrip.test.ts` (new) —
      **Integration**:
      - **TC-ROUNDTRIP-001:** parse → `mdastToHast` → `canonicalize`/`contentHash` →
        `renderStorage` over every fixture; assert `result.ok === true`, `body` non-empty,
        `hash` lowercase-hex-64.
      - **TC-XML-WF-001 (AC-F4-3):** run `assertWellFormedXml(result.body)` on every
        rendered body (25 fixtures + kitchensink) — 0 unbalanced tags, entities escaped
        outside CDATA (NFR-3 / RSK-7).
      - **TC-DETERM-001 (AC-F4-5):** render the same fixture N (≥3) times → every run is
        **byte-identical** (0 bytes diff) — golden-snapshot stability.
      - **TC-DETERM-002 (AC-F3-1):** two renders of the same input report the identical
        `hash`.

**Acceptance Criteria**:

- Must: every rendered body is well-formed XML (AC-F4-3 / NFR-3); the checker rejects
  all known-malformed shapes (independence).
- Must: same input → byte-identical output across runs (AC-F4-5); identical hash
  (AC-F3-1).
- Must: full pipeline round-trips every fixture (F-1..F-4 integration).
- Must: `bun run check` exits 0; `check:boundaries` clean (the checker is test-tier —
  not cruised).

**Files and modules**:

- Code areas: `tests/_helpers/assert-well-formed-xml.ts` (new, test-tier).
- System docs: none.

**Tests**:

- `bun test tests/unit/_helpers/assert-well-formed-xml.test.ts`
- `bun test tests/integration/markdown/pipeline-roundtrip.test.ts`

**Completion signal**: `test(markdown): pipeline round-trip + XML well-formedness + determinism (GH-20)`

---

### Phase 8: Final quality gate + boundary confirmation (AC-Q-1)

**Goal**: Run the full `bun run check` gate, confirm the dep-cruiser boundary direction
(`infra/confluence/render/` may import domain markdown/render types but NOT vice versa),
and hand the doc-reconciliation risks to lifecycle phase 7 (`@doc-syncer`). No new
behavior.

**Tasks**:

- [ ] **8.1** Run `bun run check` (lint + format:check + typecheck + test +
      check:boundaries); fix any issue. Confirm all `AC-*` are green (TC-GATE-001).
- [ ] **8.2** Confirm the boundary direction explicitly (AC-Q-1 / NFR-10):
      `depcruise src` (via `bun run check:boundaries`) passes with **no**
      `domain-may-not-import-infra` violation — i.e. no `src/domain/**` module imports
      `src/infra/**`, which is the reverse of the `src/infra/confluence/render/storage.ts
      → src/domain/**` edge this story adds. **Scope note (Finding 6):** dep-cruiser
      enforces the load-bearing `domain→infra` forbidden direction for this story at
      severity `error`; it does NOT encode every ports-and-adapters direction (no
      `infra→app`/`infra→cli` rule; `infra→domain` is allowed since infra implements
      ports) — broader matrix hardening is a future item, out of scope here. The domain
      modules import no infra/app/cli.
- [ ] **8.3** Hand off the doc risks recorded in `chg-GH-20-pm-notes.yaml` `doc_risks` to
      lifecycle phase 7 (`@doc-syncer`): tag the Markdown-pipeline component in
      `feature-safe-publish.md` §4.2 + `architecture-overview.md` (Markdown parser +
      Confluence Storage renderer; `related_changes += GH-20`); bind Body Representation +
      Content Hash VOs in `ubiquitous-language.md`; move remark/rehype from "Planned" to
      "Installed" in `.ai/rules/typescript.md` (keep mermaid/jsdom planned — E4-S1);
      populate ADR-0005 "Lessons Learned (Retrospective)". *(No code change here — this is
      a checklist hand-off, not in the coder's delivery scope.)*

**Acceptance Criteria**:

- Must: `bun run check` exits 0 (AC-Q-1 / NFR-13).
- Must: dep-cruiser's `domain-may-not-import-infra` rule stays green (no `domain→infra`
  violation), enforcing the one-way `infra→domain` direction for the renderer at severity
  `error` (AC-Q-1 / NFR-10). The broader matrix has gaps (Finding 6) — out of scope here.

**Files and modules**:

- Code areas: none (gate-only phase; opportunistic boy-scout header trims allowed).
- System docs: none in this phase (doc reconciliation is lifecycle phase 7).

**Tests**:

- `bun run check` (full gate).

**Completion signal**: `chore(markdown): final quality gate + boundary confirmation for E3-S3 (GH-20)`

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TC-PARSE-001..004 | `parseMarkdown` ok/GFM/sourcePath/throw→Result | 1 | F-1 |
| TC-BRIDGE-001..003 | MDAST→HAST preserves canonical subset + raw HTML | 2 | F-2 |
| TC-HASH-001..004 | canonicalize + contentHash determinism; lowercase hex | 3 | AC-F3-1 |
| TC-UNSUP-001..004 | unsupported → `UnsupportedConstruct`; canonical never flagged | 4 | AC-F5-1 |
| TC-GOLDEN-\<construct\> (×25) + kitchensink | byte-exact `.storage.xhtml` match (remark-gfm-reachable) | 5 | AC-F4-1 |
| TC-SUBSUP-DEF-001 | defensive `<sub>`/`<sup>` visitor arm (hand-constructed HAST) | 5 | F-4 / PM-DEC-1 |
| TC-CODE-MACRO-001 | CDATA bodies; 0× `ac:schema-version`/`ac:macro-id` | 5 | AC-F4-2 |
| TC-INJECT-001..003 | malicious → 0 injected macros / 0 executable content | 6 | AC-F4-4 |
| TC-RAWHTML-001 | raw inline HTML escaped (0 bytes passthrough) | 6 | DEC-4 / NFR-8 |
| TC-TASKMIX-001 | task-list + regular-list mixing → warning | 6 | DEC-5 / NFR-9 |
| TC-XML-WF-001 | every rendered body is well-formed XML | 7 | AC-F4-3 |
| TC-DETERM-001 | same input → byte-identical output across runs | 7 | AC-F4-5 |
| TC-DETERM-002 | two renders → identical hash | 7 | AC-F3-1 |
| TC-ROUNDTRIP-001 | full pipeline parse→bridge→hash→render ok | 7 | F-1..F-4 |
| TC-GATE-001 / TC-BND-001 | `bun run check` exits 0; boundary one-way | 8 | AC-Q-1 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-20-spec.md | Spec |
| Story file | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S3--markdown-pipeline.md` | Story |
| PM notes | ./chg-GH-20-pm-notes.yaml | PM notes |
| Parser | `src/domain/markdown/parse.ts` | Code (new) |
| MDAST→HAST bridge | `src/domain/markdown/mdast-to-hast.ts` | Code (new) |
| Unsupported classifier | `src/domain/markdown/unsupported.ts` | Code (new) |
| Canonicalizer + hash | `src/domain/render/canonicalize.ts` | Code (new) |
| HAST→Storage renderer | `src/infra/confluence/render/storage.ts` | Code (new) |
| Golden fixtures (25 + kitchensink) | `tests/golden/fixtures/markdown/*.md` + `*.storage.xhtml` | Fixture (new) |
| XML well-formedness checker | `tests/_helpers/assert-well-formed-xml.ts` | Test util (new, test-tier) |
| ADR-0005 | `doc/decisions/ADR-0005-page-body-representation-storage-not-adf.md` | Decision |
| Spike H6 mapping | `doc/inception/tmp/confluence-api-validation-spike/findings/atlassian-api-spike-findings.md` (lines 17-41) | Evidence |
| Kitchensink reference | `doc/inception/tmp/confluence-api-validation-spike/examples/pages/storage-kitchensink.xml` | Reference fixture |
| House-style precedent | `doc/changes/2026-07/2026-07-09--GH-19--state-manager-lock-cache/chg-GH-19-plan.md` | Plan precedent |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | plan-writer | Initial plan |
| 1.1 | 2026-07-09 | plan-writer | DoR iter-1 fixes: re-baseline golden set 27→25 per PM-DEC-1 (`<sub>`/`<sup>` defensive-only — PD-6 / Phase 5.4); settle parse-failure path per PM-DEC-2 (`parseMarkdown` total in MS-0002, throws on invariant violation — PD-8); soften dep-cruiser claim (Finding 6 — load-bearing `domain→infra` enforced, matrix gaps out of scope); confirm `mdast`/`hast` are type-only devDeps (Finding 7); flag `testing-strategy.md:44` stale path + `architecture-overview.md:219` `ParseError` drift as phase-7 doc-sync items. |

## Execution Log

> Populated during execution by `@coder`; the PM records the completion signal (commit)
> and the `bun run check` result per phase.

| Phase | Status | Started | Completed | Commit | `bun run check` | Notes |
|-------|--------|---------|-----------|--------|------------------|-------|
| 0 — Dep install | ⏳ | | | | | remark/rehype ecosystem + mdast/hast types |
| 1 — parseMarkdown | ⏳ | | | | | F-1 |
| 2 — MDAST→HAST bridge | ⏳ | | | | | F-2 |
| 3 — canonicalize + contentHash | ⏳ | | | | | F-3 / AC-F3-1 |
| 4 — unsupported classifier | ⏳ | | | | | F-5 / AC-F5-1 |
| 5 — renderStorage + 25 golden | ⏳ | | | | | F-4 / F-6 / AC-F4-1 / AC-F4-2 |
| 6 — injection safety + DEC-4/DEC-5 | ⏳ | | | | | F-7 / AC-F4-4 |
| 7 — round-trip + XML WF + determinism | ⏳ | | | | | AC-F4-3 / AC-F4-5 |
| 8 — final gate + boundaries | ⏳ | | | | | AC-Q-1 |
