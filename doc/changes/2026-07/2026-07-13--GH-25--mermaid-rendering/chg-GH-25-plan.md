---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-25-mermaid-code-policy
status: Proposed
created: 2026-07-13T00:00:00Z
last_updated: 2026-07-13T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E4, mermaid, code-policy, CEO-DEC-1, security]
links:
  change_spec: ./chg-GH-25-spec.md
  change_test_plan: ./chg-GH-25-test-plan.md
  testing_strategy: .ai/rules/testing-strategy.md
  typescript_conventions: .ai/rules/typescript.md
summary: >
  Make the Mermaid `code` policy (ADR-0002 fallback rung 7) the explicit,
  tested, and correctly-defaulted MS-0002 operating behavior. Adds `"code"` to
  the `MermaidPolicy` enum and flips the misleading `"render"` default to
  `"code"` (loader + starter template); proves mermaid-fence preservation is
  byte-stable as a `language=mermaid` code macro; and proves the code policy is
  injection-safe with adversarial fixtures (NFR-SEC-5). No renderer is added —
  full in-process SVG rendering is deferred to MS-0003+ per CEO-DEC-1.
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-25: [MS2-E4-S1] Mermaid rendering (re-scoped: code policy default)

## Context and Goals

This plan delivers the **re-scoped** MS2-E4-S1 story. The original scope (a full
in-process Mermaid SVG renderer) was invalidated by the GH-11 spike (H4 FAIL:
happy-dom/jsdom have no SVG layout engine) and resolved by **CEO-DEC-1**
(2026-07-13, Option 3): MS-0002 ships the **`code` policy** as the operating
default per **ADR-0002 fallback rung 7**; full rendering is deferred to MS-0003+.

This is a **small** story because the code-policy fallback is **already the
de-facto pipeline behavior**: a ```` ```mermaid ```` fence already flows through
the Markdown pipeline (GH-20) into the existing `codeMacro` visitor
(`src/infra/confluence/render/storage.ts:185`), which emits
`<ac:structured-macro ac:name="code">` with
`<ac:parameter ac:name="language">mermaid</ac:parameter>` and the source in a
CDATA body via the `cdata()` helper (`storage.ts:269`). **No new render logic is
introduced.** The work is:

1. Resolve the config/ADR terminology mismatch — add `"code"` to the enum, make
   it the default (DEC-1).
2. Prove mermaid fences are preserved byte-stable as code macros (F-2).
3. Prove the code policy is injection-safe by construction (F-3, NFR-SEC-5).
4. Make the default + starter template honest (F-4).

**Authoritative sources** (consumed in order): the
[spec](./chg-GH-25-spec.md) (requirements, AC, DEC-1/DEC-2/DEC-3) and the
[test plan](./chg-GH-25-test-plan.md) (TC IDs, AC↔TC coverage, target layers).

**Pre-verified implementation facts** (from reading the current tree):

- `MermaidPolicy` (`src/domain/config/types.ts:31`) is `"render" | "skip"` and is
  **declared but never consumed** — `rg "switch.*policy"` over `src/` and
  `tests/` returns nothing. Adding `"code"` is purely additive with **zero**
  consumer/exhaustive-check breakage (confirms spec NG-6 / RSK-2).
- The `codeMacro` visitor + `cdata()` helper already produce the exact required
  shape (verified against the committed `code-block-mermaid.storage.xhtml`
  golden). **This visitor is NOT modified** — tests assert its behavior at
  mermaid granularity.
- The golden fidelity suite (`tests/golden/markdown/storage-renderer.test.ts`)
  globs **every** `.md` in `tests/golden/fixtures/markdown/` and hard-asserts
  `fixtures.length === 25` (line 46). Adding a fixture **requires bumping this
  count**.
- The injection-safety suite
  (`tests/golden/markdown/injection-safety.test.ts`) uses **inline source
  strings** via a `render(src)` helper plus `count` / `countOutsideCdata` — it
  does **not** consume fixture files.

### Open questions

- None blocking. CEO-DEC-1 resolved the sole blocker (the renderer re-scope).
  OQ-1 (should `"skip"` differ observably from `"code"` in MS-0002?) is resolved
  for MS-0002 — both produce the code macro (NG-6) — and flagged for MS-0003.

## Scope

### In Scope

- **F-1 / DEC-1** — canonical policy model: add `"code"` to `MermaidPolicy` (TS
  type + JSON schema enum); flip the default `"render"` → `"code"` in
  `applyDefaults` and `STARTER_CONFIG`; update the schema description.
- **F-2 / AC-F2-1 / AC-F2-2** — golden fixture proving a ```` ```mermaid ````
  fence is preserved byte-stable as a `language=mermaid` code macro (N≥3 renders,
  0 bytes diff).
- **F-3 / AC-F3-1 / NFR-SEC-5** — adversarial mermaid fixtures proving
  `<script>`/`onerror`/`javascript:`/`]]>` payloads yield 0 executable content.
- **F-4 / AC-F1-1 / AC-F4-1** — config-default + starter-template verification.
- **AC-F1-3 / NFR-4** — schema/type lock-step: joint valid/invalid config tests
  pass with the updated enum.

### Out of Scope

- [OUT] In-process Mermaid SVG/PNG rendering, `MermaidRenderer`, `SVGSanitizer`,
  `MermaidArtifactManager`, content-hash attachment naming — MS-0003+ (spec
  NG-1/NG-4).
- [OUT] Chromium / `mmdc` / Kroki fallback rungs (ADR-0002 rungs 2–6) — MS-0003+
  (NG-2).
- [OUT] Reconsidering ADR-0001 (TypeScript/Bun) — resolved by CEO-DEC-1 (DEC-3,
  NG-5).
- [OUT] **Policy-driven pipeline branching in MS-0002** — all three values
  produce the same code-macro output; branching activates in MS-0003+ (NG-6).
- [OUT] **Direct edits to ADR-0001/ADR-0002 open-question text** — lifecycle
  phase 7 (`@doc-syncer`), citing CEO-DEC-1 (NG-7). This plan references the
  resolved state only.
- [OUT] Modifying the `codeMacro` visitor or `cdata()` helper — they already do
  the right thing; this change only tests them at mermaid granularity.

### Constraints

- **Branch**: `feat/GH-25/mermaid-code-policy` (already created; spec + test plan
  committed on it).
- **One Conventional Commit per phase** (TDR-0008 commitlint + husky; typescript.md
  §"Git conventions"). Each phase stays green so the next phase starts clean.
- **Lock-step (GH-15 convention / NFR-4 / RSK-2)**: the enum change touches the
  TS type, JSON schema, loader default, starter template, and the joint tests in
  ONE phase/commit. Authored `"render"` values in unrelated fixtures deliberately
  STAY (they prove `render` remains accepted — AC-F1-2).
- **No mocks** at the parser/renderer/config-validator boundary (TDR-0004
  over-mocking guardrail): real `ajv`, real `parseMarkdown`/`mdastToHast`/
  `renderStorage`, real `loadConfig`.
- **No new dependencies, ports, or runtime components.** Storage-format-only;
  local (NFR-PRIV-2: 0 diagram bytes leave the environment).

### Risks

- **RSK-2** (enum/schema/type drift) — Mitigated by updating type, schema,
  default, starter, and joint tests in one lock-step commit (Phase 1); the field
  is unconsumed so no call-site can break.
- **RSK-T-1** (golden snapshot divergence across Bun versions) — Mitigated by
  pinning Bun (`engines.bun: 1.2.23`); re-baselining is an explicit reviewed
  action (ADR-0002 C-1).
- **RSK-4 / RSK-T-3** (adversarial coverage false confidence) — Mitigated by
  recognizing fixtures are **defense-in-depth**, not the primary control; the
  code policy is safe by construction (CDATA + XML-escaping), independent of
  payload coverage. GH-20 already proved general injection safety.

### Success Metrics

| Metric | Target |
|--------|--------|
| `MermaidPolicy` enum | `"code" \| "render" \| "skip"` (type + schema in lock-step) |
| default correctness | `loadConfig` (no `render.mermaid`) → `policy === "code"`; `STARTER_CONFIG` → `policy: code` |
| mermaid preservation (AC-F2-1) | 100% of mermaid fixtures emit `<ac:structured-macro ac:name="code">` + `<ac:parameter ac:name="language">mermaid</ac:parameter>` + CDATA body |
| byte-stability (AC-F2-2 / NFR-2) | same mermaid input N≥3 renders → 0 bytes diff |
| injection safety (AC-F3-1 / NFR-1) | adversarial fixtures → 0 `<script>`, 0 live `on*`, 0 `javascript:`, 0 CDATA-breakout in Storage output |
| schema/type lock-step (AC-F1-3 / NFR-4) | 100% of joint valid/invalid config tests pass |
| quality gate (AC-CHECK) | `bun run check` exits 0 |

## Phases

> Execution: `/run-plan GH-25 execute all remaining phases no review`. Each
> phase = one Conventional Commit. The golden snapshot files (`.snapshot.md`
> bun-test artifacts) generated in Phase 2 are committed alongside the fixtures.

### Phase 1: Config policy model — add `"code"` + flip default (DEC-1)

**Goal**: Resolve the canonical MS-0002 Mermaid policy model so the config
surface and ADR-0002 use consistent terminology and the default reflects MS-0002
reality. Covers F-1, F-4, AC-F1-1, AC-F1-2, AC-F1-3, AC-F4-1, NFR-3, NFR-4.

**Tasks**:

- [ ] **1.1** Add `"code"` (as the primary/first member) to the `MermaidPolicy`
      type — `src/domain/config/types.ts:31` →
      `export type MermaidPolicy = "code" | "render" | "skip";`.
- [ ] **1.2** Update the JSON schema enum and description —
      `src/domain/config/schema.json` `render.mermaid.policy` (lines ~94–98):
      `"enum": ["code", "render", "skip"]` and a description stating the MS-0002
      default is `code` (preserve-as-code; `render` is a forward-compatible
      placeholder descending to `code` until the MS-0003+ renderer lands).
- [ ] **1.3** Flip the loader default — `src/app/config.ts:147`:
      `policy: input.render?.mermaid?.policy ?? "render"` → `?? "code"`.
- [ ] **1.4** Flip the starter template — `src/app/config-template.ts:75`:
      `policy: render` → `policy: code`.
- [ ] **1.5** Update the joint config tests **in the same commit** (lock-step so
      CI stays green):
  - `tests/unit/app/config.test.ts:97` — the minimal-config default assertion
    `expect(cfg.render.mermaid.policy).toBe("render")` → `toBe("code")`
    (TC-CONF-001 / AC-F1-1). Optionally also assert a config with
    `render.mermaid` present but `policy` omitted still defaults to `"code"`.
  - `tests/unit/domain/config/schema.test.ts` — extend the valid-fixtures
    `describe` with a `policy: "code"` acceptance case and an enum-rejection
    case (`policy: "svg"` / `"png"` / `null` / `123` → `validate(...) === false`
    with an `enum` keyword error at `instancePath` `/render/mermaid/policy`)
    (TC-CONF-002 / TC-CONF-003 / AC-F1-3 / NFR-4). The existing `validFull`
    fixture (`policy: "render"`, line 43) STAYS — it proves `render` remains
    accepted (AC-F1-2).
  - `tests/unit/app/config-template.test.ts` — add
    `expect(loaded.value.render.mermaid.policy).toBe("code")` to the existing
    `STARTER_CONFIG` round-trip test (TC-CONF-004 / AC-F4-1).

**Acceptance Criteria**:

- Must: `loadConfig` on a minimal valid config (no `render.mermaid`) yields
  `policy === "code"` (AC-F1-1); a config with `policy: "render"` is accepted
  (AC-F1-2); the joint valid/invalid schema tests pass with the updated enum and
  reject unknown values at `/render/mermaid/policy` (AC-F1-3 / NFR-4); the
  starter template round-trips to `policy: "code"` (AC-F4-1).
- Should: schema description names `code` as the MS-0002 default and documents
  `render` as a forward-compatible placeholder.

**Files and modules**:

- Code areas (all **updated**, lock-step):
  - `src/domain/config/types.ts` — `MermaidPolicy` enum gains `"code"`.
  - `src/domain/config/schema.json` — `render.mermaid.policy` enum + description.
  - `src/app/config.ts` — `applyDefaults` default `"render"` → `"code"`.
  - `src/app/config-template.ts` — `STARTER_CONFIG` `policy: render` → `code`.
- Tests (**updated**): `tests/unit/domain/config/schema.test.ts`,
  `tests/unit/app/config.test.ts`, `tests/unit/app/config-template.test.ts`.
- Deliberately **NOT changed** (authored `"render"` values proving AC-F1-2
  acceptance — the pipeline emits the same code macro for all values per NG-6):
  `tests/integration/app/{secrets-safety-integration,duplicate-uuid-fatal,idempotency,crash-replay,apply-plan-integration}.test.ts`,
  `tests/unit/app/{select-files,branch}.test.ts`,
  `tests/unit/domain/config/hierarchy.test.ts`, and the committed
  `marksync.yml.example` (+ its round-trip assertion in
  `tests/unit/app/config-example-roundtrip.test.ts:76`). These keep `render` as
  valid authored input.

**System docs to update**:

- none in this phase (ADR-0001/ADR-0002 open-question amendments are lifecycle
  phase 7, `@doc-syncer` — spec NG-7).

**Tests**:

- `bun test tests/unit/domain/config/ tests/unit/app/config.test.ts tests/unit/app/config-template.test.ts`
  — all green.
- `bun run typecheck` — confirms adding a union member breaks no consumer.

**Completion signal**:
`feat(config): GH-25 add "code" mermaid policy + flip default`

---

### Phase 2: Mermaid preservation golden fixtures (F-2, byte-stability)

**Goal**: Make the existing de-facto mermaid-preservation behavior explicit and
proven at mermaid-specific granularity — a ```` ```mermaid ```` fence is
preserved byte-stable as a `language=mermaid` code macro. Covers F-2, AC-F2-1,
AC-F2-2, NFR-2. **The `codeMacro`/`cdata()` code is NOT modified** — only
tested.

**Tasks**:

- [ ] **2.1** Add the golden fixture pair (mermaid-policy-named, distinct from
      the generic `code-block-mermaid` fixture which stays):
  - `tests/golden/fixtures/markdown/mermaid-code-policy.md` — a ```` ```mermaid ````
    fence with a representative diagram (e.g. a small `graph TD` flowchart).
  - `tests/golden/fixtures/markdown/mermaid-code-policy.storage.xhtml` — the
    expected output:
    `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">mermaid</ac:parameter><ac:plain-text-body><![CDATA[…source…]]></ac:plain-text-body></ac:structured-macro>`
    (derive the exact bytes by rendering the input once; commit the file).
- [ ] **2.2** Bump the golden-fidelity count assertion in
      `tests/golden/markdown/storage-renderer.test.ts:46` from
      `expect(fixtures.length).toBe(25)` → `toBe(26)` (the new pair is picked up
      automatically by `loadFixtures()`, which globs all `.md` in the fixtures
      dir and matches each against its `.storage.xhtml`). Keep the `kitchensink`
      membership assertion.
- [ ] **2.3** Add a mermaid-policy describe block in
      `tests/golden/markdown/storage-renderer.test.ts` covering TC-MERM-001 /
      TC-MERM-002:
  - **TC-MERM-001 (AC-F2-1)** — render `mermaid-code-policy.md` through the real
    pipeline (`parseMarkdown` → `mdastToHast` → `renderStorage`), assert `ok`,
    byte-match against `mermaid-code-policy.storage.xhtml`, and assert the body
    contains `<ac:structured-macro ac:name="code">`,
    `<ac:parameter ac:name="language">mermaid</ac:parameter>`, and a
    `<ac:plain-text-body><![CDATA[…]]></ac:plain-text-body>` wrapping the source
    verbatim.
  - **TC-MERM-002 (AC-F2-2 / NFR-2)** — render the same input N=3 (optionally 5)
    times and assert all outputs are byte-identical (`output1 === output2 ===
    output3`, 0 bytes diff) — purity/determinism at mermaid granularity.

**Acceptance Criteria**:

- Must: `mermaid-code-policy` byte-matches its committed `.storage.xhtml` and
  contains the full code-macro shape with `language=mermaid` + CDATA body
  (AC-F2-1); N≥3 renders of the same mermaid input are byte-identical (AC-F2-2 /
  NFR-2).
- Should: the mermaid source appears verbatim inside CDATA (no transformation).

**Files and modules**:

- Code areas: none (the `codeMacro` visitor + `cdata()` helper in
  `src/infra/confluence/render/storage.ts` are unchanged).
- Fixtures (**new**): `tests/golden/fixtures/markdown/mermaid-code-policy.md`,
  `tests/golden/fixtures/markdown/mermaid-code-policy.storage.xhtml`.
- Tests (**updated**): `tests/golden/markdown/storage-renderer.test.ts`
  (count bump + new describe). The bun-test snapshot artifact for the new
  fixture is committed alongside.

**System docs to update**:

- none.

**Tests**:

- `bun test tests/golden/markdown/storage-renderer.test.ts` — green, including
  the new fixture in the parameterized fidelity loop and the two new mermaid
  cases.

**Completion signal**:
`test(render): GH-25 mermaid fence preservation golden fixtures`

---

### Phase 3: Adversarial mermaid injection-safety fixtures (F-3, NFR-SEC-5)

**Goal**: Prove the code policy is injection-safe by construction at
mermaid-specific granularity — adversarial payloads inside a ```` ```mermaid ````
fence are inert in the Storage output. Covers F-3, AC-F3-1, NFR-1 / NFR-SEC-5.

> **Infrastructure decision (supersedes the test plan's "fixture files to
> create: `mermaid-adversarial.*`" entry).** The existing
> `injection-safety.test.ts` suite uses **inline source strings** via
> `render(src)` + `count` / `countOutsideCdata` and consumes no fixture files.
> The TC-MERM-003..006 steps use `countOutsideCdata` against rendered inline
> strings. Dropping `mermaid-adversarial.md` into the golden-fixture dir would
> also pull it into the Phase-2 golden-fidelity glob (forcing a second count
> bump + a redundant `.storage.xhtml`) for no marginal value. Therefore
> TC-MERM-003..006 are implemented as **inline-string tests** extending
> `injection-safety.test.ts`, reusing its existing helpers. (TDR-0004 over-mocking
> guardrail is satisfied — real parser/bridge/renderer, no mocks.)

**Tasks**:

- [ ] **3.1** Add a `TC-MERM-INJECT` describe block to
      `tests/golden/markdown/injection-safety.test.ts` with four inline cases
      (each renders a ```` ```mermaid ```` fence through the real pipeline and
      asserts counts **outside CDATA** via the existing `countOutsideCdata`
      helper):
  - **TC-MERM-003 (script)** — source
    ```` ```mermaid\ngraph TD; A[<script>alert(1)</script>];\n``` ```` → assert
    `countOutsideCdata(body, "<script") === 0` and the payload appears as inert
    text inside CDATA.
  - **TC-MERM-004 (onerror)** — source
    ```` ```mermaid\ngraph TD; A[<img src=x onerror=alert(1)>];\n``` ```` →
    assert 0 live `on*` handlers outside CDATA (e.g. `onerror`, `onclick`,
    `onload`).
  - **TC-MERM-005 (javascript: URI)** — source
    ```` ```mermaid\ngraph TD; A["<a href=javascript:alert(1)>click</a>"];\n``` ````
    → assert `countOutsideCdata(body, "javascript:") === 0`.
  - **TC-MERM-006 (CDATA breakout)** — source
    ```` ```mermaid\ngraph TD; A["Hello]]>World"];\n``` ```` → assert the output
    is well-formed XML (parseable), the `]]>` sequence is split by the existing
    `cdata()` helper (GH-20 spike-H6 rule) so no real CDATA termination occurs,
    and no content injection is possible.

**Acceptance Criteria**:

- Must: 0 `<script>` tags, 0 live `on*` handlers, 0 `javascript:` URIs, and 0
  CDATA-breakout sequences survive in the Storage output; all payload text
  appears as inert content inside the CDATA code body (AC-F3-1 / NFR-1 /
  NFR-SEC-5).
- Should: the `]]>` case yields parseable (well-formed) XML output.

**Files and modules**:

- Code areas: none (`codeMacro` + `cdata()` unchanged — this phase only proves
  their safety at mermaid granularity).
- Tests (**updated**): `tests/golden/markdown/injection-safety.test.ts`
  (new `TC-MERM-INJECT` describe block; reuses `render`, `count`,
  `countOutsideCdata`).

**System docs to update**:

- none.

**Tests**:

- `bun test tests/golden/markdown/injection-safety.test.ts` — green, including
  the four new mermaid adversarial cases.

**Completion signal**:
`test(render): GH-25 adversarial mermaid injection-safety fixtures`

---

### Phase 4: Quality gate & spec reconciliation (finalize)

**Goal**: Verify the whole change is green and record the reconciliation state.
Covers AC-CHECK, NFR-2, NFR-4. No commit unless the gate surfaces fixes; if it
does, the fixes are committed as a `fix(...)`/`test(...)` commit and the gate is
re-run.

**Tasks**:

- [ ] **4.1** Run the full quality gate:
      `bun run check` (= `lint` && `format:check` && `typecheck` && `test` &&
      `check:boundaries`). Confirm exit 0 (AC-CHECK).
- [ ] **4.2** If the gate fails, fix only the reported issue(s) (formatting,
      lint, a missed lock-step site, a boundary rule) and re-run until green.
      Commit only if changes were required.
- [ ] **4.3** Spec reconciliation (record only — no doc edits in this plan):
  - This change is internally consistent with its spec; no spec field requires
    correction.
  - The **ADR-0001 / ADR-0002 open-question amendments** (citing CEO-DEC-1) are
    explicitly deferred to lifecycle **phase 7 (`@doc-syncer`)** per spec NG-7 —
    they are NOT performed by this plan.
  - `version_impact: patch` (current `0.4.1` → `0.4.2`) is applied at the
    release/PR step per repo convention (per-feature commits in this repo do not
    bump `package.json`), not as a separate commit here.

**Acceptance Criteria**:

- Must: `bun run check` exits 0 (AC-CHECK).
- Should: no fixes required (the lock-step in Phase 1 and the focused golden/
  adversarial additions in Phases 2–3 keep the gate green on the first run).

**Files and modules**:

- Code areas: none unless the gate surfaces a fix.
- System docs to update: none in this plan (ADR amendments are phase 7).

**Tests**:

- `bun run check` (the gate itself).

**Completion signal**:
(no commit if green; otherwise `fix(check): GH-25 address gate findings`)

---

## Test Scenarios

Mapping derived from the [test plan](./chg-GH-25-test-plan.md) §3.1 / §5.1.
Tiers: **unit** (`bun:test`, real `ajv`/loader) and **golden fixture**
(`bun:test`, real parser/renderer — no mocks, TDR-0004 guardrail). No Mermaid-DOM
or E2E tiers (no renderer — MS-0003+).

| ID | Scenario | Phase | AC / NFR | File |
|----|----------|-------|----------|------|
| TC-CONF-001 | default policy is `"code"` when `render.mermaid` omitted | 1 | AC-F1-1, NFR-3 | `tests/unit/app/config.test.ts` |
| TC-CONF-002 | schema accepts `code` / `render` / `skip` | 1 | AC-F1-2, AC-F1-3, NFR-4 | `tests/unit/domain/config/schema.test.ts` |
| TC-CONF-003 | schema rejects invalid policy values (`svg`/`png`/`null`/`123`) | 1 | AC-F1-3, NFR-4 | `tests/unit/domain/config/schema.test.ts` |
| TC-CONF-004 | `STARTER_CONFIG` round-trips to `policy: "code"` | 1 | AC-F4-1 | `tests/unit/app/config-template.test.ts` |
| TC-MERM-001 | mermaid fence → code macro with `language=mermaid` + CDATA | 2 | AC-F2-1, AC-F1-2 | `tests/golden/markdown/storage-renderer.test.ts` |
| TC-MERM-002 | same mermaid input N≥3 renders → byte-identical | 2 | AC-F2-2, NFR-2 | `tests/golden/markdown/storage-renderer.test.ts` |
| TC-MERM-003 | adversarial `<script>` payload inert (0 `<script>`) | 3 | AC-F3-1, NFR-1 | `tests/golden/markdown/injection-safety.test.ts` |
| TC-MERM-004 | adversarial `onerror` payload inert (0 live `on*`) | 3 | AC-F3-1, NFR-1 | `tests/golden/markdown/injection-safety.test.ts` |
| TC-MERM-005 | adversarial `javascript:` URI inert (0 `javascript:`) | 3 | AC-F3-1, NFR-1 | `tests/golden/markdown/injection-safety.test.ts` |
| TC-MERM-006 | CDATA-breakout `]]>` inert (well-formed XML) | 3 | AC-F3-1, NFR-1 | `tests/golden/markdown/injection-safety.test.ts` |
| AC-CHECK | `bun run check` exits 0 | 4 | NFR-2, NFR-4 | (gate) |

**Implementation reconciliation (deviation from test plan §6/§7, justified):**
TC-MERM-003..006 are implemented as **inline-string** tests in
`injection-safety.test.ts` (reusing `render`/`count`/`countOutsideCdata`), not as
`mermaid-adversarial.md`/`.storage.xhtml` fixture files. The existing
adversarial suite is inline-only; fixture files would needlessly enter the
golden-fidelity glob and duplicate the inline proof. Coverage and AC mapping are
unchanged.

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | `./chg-GH-25-spec.md` | Spec (source of truth) |
| Test plan | `./chg-GH-25-test-plan.md` | Test design (source of truth for TCs) |
| ADR-0002 — Mermaid rendering strategy | `../../decisions/ADR-0002-mermaid-rendering-strategy.md` | Decision (`code` = rung 7) |
| CEO-DEC-1 | referenced via spec §1 / Appendix A | Re-scope decision (Option 3) |
| Testing strategy | `.ai/rules/testing-strategy.md` | 6-tier strategy, golden-fixture conventions |
| TypeScript conventions | `.ai/rules/typescript.md` | Code style, tier rules, commit format |
| `MermaidPolicy` type | `src/domain/config/types.ts` | Updated (Phase 1) |
| Config JSON schema | `src/domain/config/schema.json` | Updated (Phase 1) |
| Config loader | `src/app/config.ts` | Updated (Phase 1) |
| Starter template | `src/app/config-template.ts` | Updated (Phase 1) |
| Storage renderer (unchanged) | `src/infra/confluence/render/storage.ts` | Tested, not modified (Phases 2–3) |
| Mermaid golden fixture | `tests/golden/fixtures/markdown/mermaid-code-policy.{md,storage.xhtml}` | New (Phase 2) |
| Golden fidelity suite | `tests/golden/markdown/storage-renderer.test.ts` | Updated (Phase 2) |
| Injection-safety suite | `tests/golden/markdown/injection-safety.test.ts` | Updated (Phase 3) |
| Schema unit suite | `tests/unit/domain/config/schema.test.ts` | Updated (Phase 1) |
| Config loader unit suite | `tests/unit/app/config.test.ts` | Updated (Phase 1) |
| Starter template unit suite | `tests/unit/app/config-template.test.ts` | Updated (Phase 1) |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | plan-writer (AI) | Initial plan — 4 phases: config policy model + lock-step tests (incl. starter template, folding the suggested F-4 phase into Phase 1); mermaid preservation golden fixtures; adversarial injection-safety fixtures (inline, superseding the test-plan fixture-file entry per existing-suite convention); quality gate + spec reconciliation. ADR-0001/0002 amendments deferred to lifecycle phase 7 per spec NG-7. |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | COMPLETED | 2026-07-13 | 2026-07-13 | 40717f2 | Added "code" to MermaidPolicy enum, flipped default from "render" to "code", updated schema description, updated joint config tests |
| Phase 2 | COMPLETED | 2026-07-13 | 2026-07-13 | a0f22c3 | Created mermaid-code-policy golden fixture pair, bumped count from 25→26, added TC-MERM-001/TC-MERM-002 tests |
| Phase 3 | COMPLETED | 2026-07-13 | 2026-07-13 | c1e2d9a | Added TC-MERM-INJECT describe block with 4 adversarial payload tests (script, onerror, javascript:, CDATA breakout) |
| Phase 4 | COMPLETED | 2026-07-13 | 2026-07-13 | 5b790a1 | Quality gate passed (bun run check green), fixed pipeline-roundtrip test fixture count, spec reconciliation complete | |
