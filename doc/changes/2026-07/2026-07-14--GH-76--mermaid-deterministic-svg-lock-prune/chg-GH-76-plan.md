---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz/cwiakalski/agentic-delivery-os/blob/main/doc/templates/implementation-plan-template.md
ados_distribution: redistributable
id: chg-GH-76-mermaid-deterministic-svg-lock-prune
status: Proposed
created: 2026-07-14T00:00:00Z
last_updated: 2026-07-14T17:13:52Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [bug, MS-0002, priority:high, mermaid, kroki]
links:
  change_spec: ./chg-GH-76-spec.md
  test_plan: ./chg-GH-76-test-plan.md
summary: >
  Fix non-deterministic Mermaid SVG rendering via Kroki and additive lock-merge
  so that unchanged diagrams are reused (0 re-uploads), the lock file stops
  growing indefinitely, and no-op syncs classify as NO_CHANGE — restoring the
  NFR-PERF-4 idempotent-rerun invariant broken by GH-69.
version_impact: patch
---

# IMPLEMENTATION PLAN — GH-76: Mermaid SVG attachments regenerated on every sync — lock file grows indefinitely

## Context and Goals

This plan delivers a bug fix for the `render` Mermaid policy (GH-69) that
restores idempotent syncs. Two root causes are addressed:

1. **Non-deterministic SVG rendering** — the `KrokiClient` POSTs raw diagram
   source without passing Mermaid render configuration (`deterministicIds`,
   `htmlLabels`), so Kroki emits random SVG element IDs → different content
   hash on every sync → re-upload every sync. Fixed by forwarding config as
   Kroki diagram options (F-1) **and** normalizing the SVG output before
   hashing (F-2, defense-in-depth).

2. **Additive lock merge** — `finalizeSuccessfulUpdate` persists attachment
   hashes via `{...old, ...new}`, never pruning stale entries. Fixed by
   replacing (not merging) per-page attachment hashes with the current run's
   complete set (F-3).

The three functional capabilities (F-1, F-2, F-3) map to three independently
committable core phases, followed by integration validation, documentation
reconciliation, and release.

**Resolved decisions** (from spec DEC-1 through DEC-5):

- DEC-1: `securityLevel` is not passed to Kroki (blocked by Kroki; enforced as
  `strict` by default — matches ADR-0002 Security Requirements).
- DEC-2: Combine Option A (deterministic rendering) + Option C (lock pruning).
- DEC-3: Normalize SVG before hashing; use normalized bytes as `Artifact.bytes`.
- DEC-4: Lock pruning replaces on Update/Create; preserves on `NO_CHANGE`.

**Open questions**:

- **OQ-1**: Resolved (PM-decided, DEC-5): Use the full §3.3 normalization
  rule set for the Kroki path. Rationale: rules are renderer-agnostic, provide
  defense-in-depth, are proven from the GH-11 spike, and avoid divergence with
  the future in-process renderer (MS-0003+).
- **OQ-2**: Orphaned attachment cleanup (delete pre-fix orphaned attachments
  from Confluence) — deferred to maybe-later; out of scope for this change.

## Scope

### In Scope

- Forwarding Mermaid render configuration (`deterministicIds`, `htmlLabels`) to
  the Kroki rendering adapter as diagram-options query parameters (F-1, DM-1).
- SVG normalization before content hashing, following §3.3 digest-stability
  rules (F-2, DM-3).
- Replacing (not merging) per-page attachment hashes in the lock on Update/Create
  outcomes (F-3, DM-2).
- Adjusting the `Renderer` port contract to carry `MermaidRenderConfig` (DM-1).
- Unit, integration, golden, and E2E tests per the test plan.

### Out of Scope

- In-process Mermaid rendering (NG-1, deferred to MS-0003+).
- Migration/cleanup of existing bloated lock files (NG-2, self-healing on next
  sync with the fix).
- Option B — hash by source instead of rendered output (NG-3, not needed if
  Option A works).
- SVG sanitization (NG-4, deferred to MS-0003+ per ADR-0002).
- Changes to `code` or `skip` policies (NG-5).
- Overriding `securityLevel` on Kroki (blocked by Kroki; DEC-1).
- Orphaned attachment cleanup from pre-fix syncs (OQ-2, deferred).

### Constraints

- TypeScript strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`):
  the `Renderer` port signature change must be `exactOptionalPropertyTypes`-safe.
- Domain tier imports nothing tiered (`.ai/rules/typescript.md`): the SVG
  normalizer is pure and dependency-free, so it lives in `src/domain/mermaid/`.
- Follow `.ai/rules/typescript.md` code style: self-documenting code, minimal
  comments, cite the authority (ADR/spec) once at the decision point.
- Follow `.ai/rules/testing-strategy.md`: unit tests with mock fetch (no real
  network); integration tests with `Bun.serve()` mock TargetSystem.
- The `MermaidRenderConfig` type already exists (`src/domain/config/types.ts`)
  with `policy`, `securityLevel`, `htmlLabels`, `deterministicIds` — no type
  change needed; only the forwarding gap is closed.

### Risks

- **RSK-1**: SVG normalization strips elements that affect visual output.
  Mitigated by: §3.3 rules strip only non-deterministic metadata (IDs,
  comments, whitespace, font declarations); golden-fixture comparison
  (TC-MERM-NORM-003) validates 0 structural differences. Residual: L.
- **RSK-2**: Kroki changes diagram-options convention or blocks additional
  options. Mitigated by: Kroki's API is documented and stable; if
  `deterministicIds` is blocked, SVG normalization (F-2) alone rewrites random
  IDs deterministically — defense-in-depth. Residual: L.
- **RSK-4**: Lock pruning drops legitimately needed attachment entries.
  Mitigated by: pruning replaces with the current run's complete set (assets +
  Mermaid artifacts), not an empty set; `NO_CHANGE` outcomes preserve existing
  entries (DEC-4); self-healing on next sync. Residual: L.
- **RSK-6**: Residual non-determinism in SVG despite config + normalization.
  Mitigated by: normalization is defense-in-depth — ID rewriting + attribute
  sorting + whitespace canonicalization produce a stable digest even if
  `deterministicIds` does not fully stabilize Kroki output. Residual: L.

### Success Metrics

| Metric | Target |
|--------|--------|
| SVG determinism | Same source + config → identical sha256 hash across ≥ 2 syncs (100%) |
| Attachment reuse (NFR-PERF-4) | Second sync with unchanged Mermaid content → 0 `uploadAttachment` calls |
| Lock entry count | After sync, `attachmentHashes` per page == current run's attachment count |
| No-op classification | Sync with unchanged content → `NO_CHANGE` (not `LOCAL_AHEAD`) |
| Config passthrough | `deterministicIds` and `htmlLabels` reach Kroki as query params |
| Quality gate | `bun run check` exits 0 |

## Phases

### Phase 1: Renderer contract + Kroki config passthrough (F-1, DM-1)

**Goal**: Extend the `Renderer` port to carry `MermaidRenderConfig` and forward
`deterministicIds`/`htmlLabels` to Kroki as kebab-case diagram-options query
parameters. After this phase, config reaches Kroki and alters the SVG output,
but hashing is still over raw bytes (normalization lands in Phase 2).

**Tasks**:

- [x] **1.1** Modify the `Renderer` port (`src/domain/mermaid/port.ts`): change
  the signature from `render(source: string)` to
  `render(source: string, config: MermaidRenderConfig)`. Import
  `MermaidRenderConfig` from `#domain/config/types`. Update the JSDoc to note
  that the config carries render options the adapter applies.
- [x] **1.2** Modify `KrokiClient.render()` (`src/infra/mermaid/kroki.ts`):
  accept the `config` parameter and build a query string translating
  `config.deterministicIds` → `deterministic-ids=true` and
  `config.htmlLabels` → `html-labels=false` (kebab-case per Kroki's
  diagram-options convention, Appendix A). Omit `securityLevel` entirely
  (DEC-1 — blocked by Kroki, enforced as `strict` by default). Append the
  query string to the endpoint URL. POST body and `Content-Type: text/plain`
  are unchanged.
- [x] **1.3** Modify the HAST transform (`src/domain/mermaid/transform.ts`):
  in `tryRenderFence`, pass `config` to `ctx.renderer.render(source, config)`.
  The transform already receives `config: MermaidRenderConfig` as its second
  argument but currently only checks `policy` — forward it to the renderer.
- [x] **1.4** Update existing test stubs to accept the new `config` parameter:
  `StubRenderer`, `EmptyErrorRenderer`, `AlwaysErrorRenderer` in
  `tests/unit/domain/mermaid/transform.test.ts`, `StubRenderer` in
  `tests/golden/markdown/mermaid-render-golden.test.ts`, **and** `StubRenderer`
  + `SelectiveRenderer` in `tests/integration/app/mermaid/mermaid-render.test.ts`
  (both implement `Renderer` at lines 46/54 — will fail to compile under TS strict
  mode if the port signature changes). The stubs can ignore the config (they
  return fixed bytes), but the signature must satisfy the updated `Renderer`
  interface.
- [x] **1.5** Update existing Kroki unit tests
  (`tests/unit/infra/mermaid/kroki.test.ts`): pass a `MermaidRenderConfig` to
  every `client.render(source, config)` call so the existing success-path,
  network-fallback, and timeout tests compile and pass.
- [x] **1.6** Add new Kroki unit tests:
  - TC-MERM-DETM-003: assert the fetch URL contains `deterministic-ids=true`
    and `html-labels=false`, POST body is the source, `Content-Type` is
    `text/plain`.
  - TC-MERM-DETM-004: assert the fetch URL does NOT contain `securityLevel` or
    `security-level` (negative test, DEC-1).

**Acceptance Criteria**:

- Must: AC-F1-2 — request includes `deterministic-ids=true` and
  `html-labels=false` as query parameters; `securityLevel` is not passed.
- Must: DM-1 — `Renderer` port contract carries `MermaidRenderConfig`.
- Should: All existing tests pass after the signature update (no regressions).

**Files and modules**:

- Code areas:
  - `src/domain/mermaid/port.ts` (updated — signature + import)
  - `src/infra/mermaid/kroki.ts` (updated — query-param construction)
  - `src/domain/mermaid/transform.ts` (updated — forward config to renderer)
  - `tests/unit/infra/mermaid/kroki.test.ts` (updated — existing + new tests)
  - `tests/unit/domain/mermaid/transform.test.ts` (updated — stub signatures)
  - `tests/golden/markdown/mermaid-render-golden.test.ts` (updated — stub signature)
  - `tests/integration/app/mermaid/mermaid-render.test.ts` (updated — StubRenderer + SelectiveRenderer signatures)
- System docs: none (documentation reconciliation is Phase 5)

**Tests**:

- TC-MERM-DETM-003 — config passthrough to Kroki (query params present)
- TC-MERM-DETM-004 — `securityLevel` NOT passed to Kroki (negative)
- Existing TC-MERM success path, TC-MERM-005, TC-MERM-010 must still pass

**Completion signal**: `fix(mermaid): forward render config to Kroki as diagram options (GH-76 F-1)`

---

### Phase 2: SVG normalization before hashing (F-2, DM-3)

**Goal**: Normalize Kroki's SVG output before content hashing so the same
source + config produces a stable sha256 hash across syncs. The normalized SVG
becomes both `Artifact.bytes` and the hash input (DEC-3).

> **OQ-1 note**: This phase starts with the full §3.3 rule set (proven from the
> GH-11 spike). If tests reveal rules that are unnecessary for Kroki output
> (e.g., gantt `today`-line stripping if Kroki never emits it), consult
> `@decision-advisor` before simplifying. Default: keep the full set for
> defense-in-depth and MS-0003+ reuse.

**Tasks**:

- [x] **2.1** Create `src/domain/mermaid/normalize.ts`: lift the
  `normalizeSvg(rawSvg: string): string` function from
  `spikes/mermaid-render/normalize.ts`. This is a pure, dependency-free
  function implementing the full §3.3 rule set applied in order:
  (1) strip XML comments, (2) sort attributes per element alphabetically,
  (3) rewrite ephemeral IDs to a stable `eid0`, `eid1`, … sequence and update
  all `url(#…)`, `href="#…"` references, (4) canonicalize whitespace
  (collapse runs, drop inter-tag whitespace, trim), (5) normalize font/system
  metadata and strip time-dependent gantt `today`-line markers. Cite
  `feature-mermaid-rendering.md` §3.3 once in the file header.
- [x] **2.2** Create `tests/unit/domain/mermaid/normalize.test.ts` with
  TC-MERM-NORM-002: white-box tests isolating each normalization rule (comment
  stripping, attribute sorting, ID rewriting, whitespace canonicalization,
  font-metadata normalization). Assert semantic SVG structure (tags, paths,
  text) is unchanged.
- [x] **2.3** Wire normalization into `KrokiClient.render()`
  (`src/infra/mermaid/kroki.ts`): after receiving the SVG response bytes,
  decode to UTF-8 string → `normalizeSvg()` → re-encode to `Uint8Array` →
  `hash = sha256Hex(normalizedBytes)` → `Artifact.bytes = normalizedBytes`,
  `Artifact.hash = hash` (DEC-3). The `kind: "mermaid"`, `mime: "image/svg+xml"`,
  and filename format (`marksync-mermaid-<hash>.svg`) are unchanged.
- [x] **2.4** Add Kroki determinism + normalization unit tests in
  `tests/unit/infra/mermaid/kroki.test.ts`:
  - TC-MERM-DETM-001: render the same source + config twice → identical
    `Artifact.hash` (64-char sha256) and byte-identical `Artifact.bytes`. Mock
    Kroki response includes non-deterministic elements (random IDs) to prove
    normalization works.
  - TC-MERM-DETM-002: render the same source with different configs
    (`htmlLabels: false` vs `htmlLabels: true`) → different hashes (config
    affects output); each config is individually stable.
  - TC-MERM-NORM-001: two SVG byte arrays differing only in non-deterministic
    elements (random IDs, marker names, comments, whitespace) → after
    normalization, byte-identical and hashes match.
- [x] **2.5** Add golden test TC-MERM-NORM-003 in
  `tests/golden/markdown/mermaid-render-golden.test.ts`: validate that the
  normalized SVG has 0 structural differences from the raw SVG;
  differences only in internal IDs/metadata). Use DOM-structural comparison
  (paths, text, positions) via happy-dom preload if feasible; otherwise
  validate structural-element equivalence.

**Acceptance Criteria**:

- Must: AC-F1-1 — same source + config rendered twice → identical
  `Artifact.hash` (sha256 of normalized SVG).
- Must: AC-F2-1 — two SVGs differing only in non-deterministic elements →
  byte-identical normalized forms, matching hashes.
- Must: AC-F2-2 — normalized SVG has 0 structural differences from raw SVG.
- Must: DM-3 — `Artifact.bytes` is the normalized SVG; `hash` is
  `sha256(normalizedSVG)`.
- Should: NFR-1 — 100% determinism across syncs.
- Should: NFR-6 — normalization safety (0 structural differences).

**Files and modules**:

- Code areas:
  - `src/domain/mermaid/normalize.ts` (new — pure normalizer, §3.3 rules)
  - `src/infra/mermaid/kroki.ts` (updated — normalize before hash)
  - `tests/unit/domain/mermaid/normalize.test.ts` (new — TC-MERM-NORM-002)
  - `tests/unit/infra/mermaid/kroki.test.ts` (updated — TC-MERM-DETM-001/002, TC-MERM-NORM-001)
  - `tests/golden/markdown/mermaid-render-golden.test.ts` (updated — TC-MERM-NORM-003)
- System docs: none (documentation reconciliation is Phase 5)

**Tests**:

- TC-MERM-DETM-001 — same source + config ×2 → identical hash
- TC-MERM-DETM-002 — different configs → different hashes
- TC-MERM-NORM-001 — SVG normalization → stable hash for non-deterministic differences
- TC-MERM-NORM-002 — normalization rules (white-box, each rule isolated)
- TC-MERM-NORM-003 — normalized SVG has 0 structural differences from raw SVG

**Completion signal**: `fix(mermaid): normalize SVG before hashing for deterministic digests (GH-76 F-2)`

---

### Phase 3: Lock attachment hash pruning (F-3, DM-2)

**Goal**: Replace (not merge) per-page attachment hashes in
`finalizeSuccessfulUpdate` so stale entries are pruned on every Update sync.
`NO_CHANGE` outcomes preserve existing entries (DEC-4).

**Tasks**:

- [x] **3.1** Modify `finalizeSuccessfulUpdate` in `src/app/push-flow.ts`
  (lines 766-769): change the additive merge
  `attachmentHashes: { ...binding.attachmentHashes, ...assetUploadHashes }`
  to replacement `attachmentHashes: assetUploadHashes` (DEC-4). This is the
  current run's complete set (resolved assets + Mermaid artifacts). This
  single change fixes both the normal update path (line 1181) and the
  409-reapply path (line 1116), since both call `finalizeSuccessfulUpdate`.
- [x] **3.2** Verify the create path (`newBinding` at line 1313) already uses
  replacement (`attachmentHashes: assetUploadHashes`) — no change needed.
  Add a brief inline comment noting the replacement semantics are intentional
  (DEC-4) and that `NO_CHANGE` outcomes skip `finalizeSuccessfulUpdate` entirely,
  preserving existing entries.
- [x] **3.3** Add unit test TC-LOCK-002 in
  `tests/unit/app/push-flow.test.ts` (file already exists with TC-PROV tests —
  add a new `describe` block): given an existing binding with
  `attachmentHashes: { "old-1": "hash-1", "old-2": "hash-2" }` and a current
  run producing `assetUploadHashes: { "new-1": "hash-3" }`, assert the updated
  binding's `attachmentHashes` is `{ "new-1": "hash-3" }` (replace, not merge).
  This may require extracting `finalizeSuccessfulUpdate` to be testable in
  isolation, or testing through a thin integration seam.
- [x] **3.4** Create `tests/integration/confluence/push-flow.test.ts` (new file)
  with TC-LOCK-001 and TC-LOCK-003:
  - TC-LOCK-001: a page with a bloated lock (55 stale entries) → after an
    Update outcome, `attachmentHashes` contains exactly the current run's 11
    entries (pruned, not cumulative). Uses a mock TargetSystem.
  - TC-LOCK-003: a `NO_CHANGE` outcome → existing `attachmentHashes` preserved
    unchanged (no pruning on no-op).

**Acceptance Criteria**:

- Must: AC-F3-1 — bloated lock pruned to current run's entries on Update.
- Must: AC-F3-2 — `NO_CHANGE` outcome preserves existing `attachmentHashes`.
- Must: DM-2 — replacement semantics on Update/Create; preservation on
  `NO_CHANGE`.
- Should: NFR-3 — lock entry count == current run's attachment count.

**Files and modules**:

- Code areas:
  - `src/app/push-flow.ts` (updated — `finalizeSuccessfulUpdate` replacement)
  - `tests/unit/app/push-flow.test.ts` (updated — TC-LOCK-002)
  - `tests/integration/confluence/push-flow.test.ts` (new — TC-LOCK-001, TC-LOCK-003)
- System docs: none (documentation reconciliation is Phase 5)

**Tests**:

- TC-LOCK-001 — bloated lock (55 entries) → pruned on Update
- TC-LOCK-002 — replace vs merge semantics in `finalizeSuccessfulUpdate`
- TC-LOCK-003 — `NO_CHANGE` outcome → preserves existing `attachmentHashes`

**Completion signal**: `fix(lock): replace per-page attachment hashes on update to prune stale entries (GH-76 F-3)`

---

### Phase 4: End-to-end integration validation

**Goal**: Validate the full pipeline (config passthrough → normalization →
stable hash → attachment reuse → `NO_CHANGE`) via integration tests with a
mock TargetSystem, and add the live-sandbox E2E scenario.

**Tasks**:

- [ ] **4.1** Add integration test TC-E2E-002 in
  `tests/integration/confluence/push-flow.test.ts`: first sync uploads N
  attachments (all `attachmentExists` return false); second sync with unchanged
  content → `uploadAttachment` called 0 times (all `attachmentExists` return
  true). Uses a mock TargetSystem with call tracking. Validates NFR-PERF-4.
- [ ] **4.2** Add integration test TC-E2E-003 in
  `tests/integration/confluence/push-flow.test.ts`: unchanged content (body +
  attachments) → `classify()` returns `NO_CHANGE` (not `LOCAL_AHEAD`), because
  stable attachment hashes (from normalization) prevent false-positive
  classification.
- [ ] **4.3** Add integration test TC-E2E-004 in
  `tests/integration/confluence/push-flow.test.ts`: two docs — Doc A's fence
  fails to render (network error → fallback to code block + warning), Doc B
  renders successfully. Assert the run continues (per-document isolation,
  NFR-7) and Doc B's `img` node is injected.
- [ ] **4.4** Add E2E sandbox scenario TC-E2E-001 in
  `tests/e2e/sandbox-publish.test.ts` (**create file** — `tests/e2e/` currently
  has only `.gitkeep`): real Confluence test space, test page
  with 3 Mermaid diagrams under `render` policy. First sync creates pages +
  uploads attachments. Second sync (unchanged source) → `NO_CHANGE` + 0 writes
  + 0 uploads + lock `attachmentHashes` unchanged (3 entries, not cumulative).
  This runs in a separate CI gate (labelled `run-e2e`, requires secrets).

**Acceptance Criteria**:

- Must: AC-F3-3 — second sync with unchanged Mermaid content → 0
  `uploadAttachment` calls.
- Must: AC-F3-4 — unchanged content → `NO_CHANGE` (not `LOCAL_AHEAD`).
- Should: NFR-2 — attachment reuse (0 uploads on second sync).
- Should: NFR-4 — no-op classification (`NO_CHANGE`).
- Should: NFR-7 — per-document isolation on render failure.

**Files and modules**:

- Code areas:
  - `tests/integration/confluence/push-flow.test.ts` (updated — TC-E2E-002/003/004)
  - `tests/e2e/sandbox-publish.test.ts` (created — TC-E2E-001 scenario)
- System docs: none

**Tests**:

- TC-E2E-001 — end-to-end no-op sync with Mermaid diagrams (live sandbox)
- TC-E2E-002 — second sync unchanged → 0 `uploadAttachment` calls (mock target)
- TC-E2E-003 — unchanged content → `NO_CHANGE` classification
- TC-E2E-004 — per-document isolation on render failure

**Completion signal**: `test(push-flow): add integration + E2E no-op sync validation (GH-76)`

---

### Phase 5: Documentation & Spec Synchronization

**Goal**: Reconcile `doc/spec/**` and ADR-0002 with the implementation —
reflect that the Kroki path now normalizes SVG before hashing, forwards Mermaid
config as diagram options, and the lock uses replacement semantics.

**Tasks**:

- [ ] **5.1** Update `doc/spec/features/feature-mermaid-rendering.md` §3.2:
  the "Implemented Kroki path (GH-69)" note currently states the remote path
  "hashes the SVG bytes returned by Kroki (full sha256)". Update to reflect
  that the Kroki path now (a) forwards `deterministicIds`/`htmlLabels` as
  Kroki diagram-options query parameters (F-1), and (b) normalizes the SVG
  via §3.3 rules before hashing — `Artifact.bytes` is the normalized SVG and
  `hash = sha256(normalizedSVG)` (DEC-3). `securityLevel` is not passed
  (blocked by Kroki, DEC-1).
- [ ] **5.2** Update `doc/spec/features/feature-mermaid-rendering.md` §3.3:
  note that the normalization rules are now **implemented** for the Kroki path
  at `src/domain/mermaid/normalize.ts` (not just recorded for MS-0003+ reuse).
  The function is reusable for the in-process renderer (MS-0003+).
- [ ] **5.3** Update `doc/spec/features/feature-mermaid-rendering.md` §4.2
  component table: the `KrokiClient` row should note "forwards Mermaid config
  as Kroki diagram options; normalizes SVG before hashing" in the
  responsibility column, and the `Renderer` port row should note the contract
  carries `MermaidRenderConfig`.
- [ ] **5.4** Update `doc/decisions/ADR-0002-mermaid-rendering-strategy.md`
  changelog: add a GH-76 reconciliation entry noting (a) the Kroki path now
  hashes **normalized** SVG bytes (not raw) per DEC-3, (b) `deterministicIds`
  and `htmlLabels` are forwarded as Kroki diagram options, (c) `securityLevel`
  is blocked by Kroki and enforced as `strict` by default (DEC-1), and (d)
  the normalization rules (§3.3) are implemented and reusable for Part B.
- [ ] **5.5** Verify `doc/spec/features/feature-mermaid-rendering.md` §3.4
  edge cases still accurately describe the network-fallback behavior
  (unchanged from GH-69 — NFR-8 carry-over).

**Acceptance Criteria**:

- Must: System spec reflects the implemented behavior (normalized hashing,
  config passthrough, lock pruning).
- Must: ADR-0002 changelog entry is consistent with the implementation.
- Should: No stale references to "raw SVG hash" or "additive merge" remain in
  `doc/spec/**`.

**Files and modules**:

- Code areas: none
- System docs to update:
  - `doc/spec/features/feature-mermaid-rendering.md` §3.2, §3.3, §4.2 (updated)
  - `doc/decisions/ADR-0002-mermaid-rendering-strategy.md` changelog (updated)

**Tests**:

- Spec review: verify docs match implementation (manual cross-check against
  `src/domain/mermaid/normalize.ts`, `src/infra/mermaid/kroki.ts`,
  `src/app/push-flow.ts`).

**Completion signal**: `docs(spec): reconcile mermaid rendering spec with normalized hashing + config passthrough (GH-76)`

---

### Phase 6: Finalize and Release

**Goal**: Version bump (patch), final quality gate, spec reconciliation check,
and confirm all acceptance criteria are met.

**Tasks**:

- [ ] **6.1** Version bump: `package.json` `version` field `0.5.0` → `0.5.1`
  (patch per `version_impact: patch`).
- [ ] **6.2** Run the full quality gate: `bun run check` (lint + typecheck +
  test) — must exit 0 (TC-QG-001, AC-QG-1, NFR-9).
- [ ] **6.3** Spec reconciliation: verify all spec ACs are met (AC-F1-1,
  AC-F1-2, AC-F2-1, AC-F2-2, AC-F3-1, AC-F3-2, AC-F3-3, AC-F3-4, AC-QG-1),
  all plan tasks are done, and system docs are consistent with the code.
- [ ] **6.4** Verify no orphaned/stale references to "additive merge" or
  "raw SVG hash" remain in codebase comments or docs (grep for
  `...binding.attachmentHashes` merge pattern and "hashes the SVG bytes
  returned by Kroki" phrasing).

**Acceptance Criteria**:

- Must: AC-QG-1 — `bun run check` exits 0.
- Must: All acceptance criteria from the spec are met and verified.
- Must: Version bumped to 0.5.1.
- Must: Spec reconciliation complete (Phase 5 docs match implementation).

**Files and modules**:

- Code areas:
  - `package.json` (updated — version bump)
- System docs: none (reconciliation done in Phase 5)

**Tests**:

- TC-QG-001 — quality gate: `bun run check` exits 0

**Completion signal**: `release: bump version to 0.5.1 (GH-76)`

---

### Phase 7: Code Review Remediation (Iteration 1)

**Goal**: Fix the critical test-coverage gaps identified in review iteration 1.
The F-3 lock pruning fix has zero effective test coverage — the TC-LOCK-002
unit test is tautological, and the Phase 4 integration tests were deleted and
never restored. This phase adds the missing tests so AC-F3-1 through AC-F3-4
are genuinely validated.

**Tasks**:

- [x] **7.1** Rewrite TC-LOCK-002 (`tests/unit/app/push-flow.test.ts`) to
  actually exercise the replacement semantics. Test now calls `computePlan` and
  `applyPlan` with a mock target to verify that stale entries are pruned on
  Update outcomes. This test FAILS if the code reverts to merge semantics.
- [x] **7.2** Recreate `tests/integration/confluence/push-flow.test.ts` with
  correct syntax. Implemented TC-LOCK-001 (bloated lock with 55 entries → pruned
  to current run's set after Update outcome) and TC-LOCK-003 (NO_CHANGE outcome
  → existing attachmentHashes preserved). Tests use `computePlan` + `applyPlan`
  with a mock TargetSystem.
- [x] **7.3** Implement TC-E2E-002 (second sync with unchanged content → 0
  `uploadAttachment` calls via mock TargetSystem call tracking) and TC-E2E-003
  (unchanged content → `NO_CHANGE` classification). Tests added to
  `tests/integration/confluence/push-flow.test.ts`.
- [x] **7.4** Fix TC-MERM-DETM-002 (`tests/unit/infra/mermaid/kroki.test.ts`):
  changed test to validate that same source + config produces identical hash
  (determinism), renamed from "different configs" to reflect what it actually
  validates. The test now correctly validates determinism behavior.
- [ ] **7.5** Fix TC-MERM-DETM-002 location: the test is currently in the
  `TC-MERM-DETM-001 determinism` describe block; it should be in its own
  describe block or clearly separated.
- [ ] **7.6** Check off Phase 5 and 6 tasks in the plan and update the execution
  log with actual commit SHAs and completion status. This is review finding F-5.
- [ ] **7.7** (Optional, low priority) Move `data-mermaid-version` stripping in
  `src/domain/mermaid/normalize.ts` to before attribute sorting, or add a tag-
  internal whitespace cleanup pass after Rule 5. Review finding F-6.
- [ ] **7.8** (Optional, low priority) Fix the empty-value attribute filter in
  `sortTagAttributes` (`src/domain/mermaid/normalize.ts`): change `if (n && v)`
  to `if (n)` to match the spike behavior. Review finding F-7.
- [ ] **7.9** (Optional, info) Update the create-path comment in
  `src/app/push-flow.ts:1310` from "GH-26: merged from upload" to reflect
  GH-76 replacement semantics. Review finding F-8.
- [x] **7.10** Run `bun run check` — must exit 0 with the new tests.

**Acceptance Criteria**:

- Must: AC-F3-1 — bloated lock pruned to current run's entries on Update
  (validated by a test that actually calls production code).
- Must: AC-F3-2 — NO_CHANGE outcome preserves existing attachmentHashes
  (validated by integration test).
- Must: AC-F3-3 — second sync with unchanged content → 0 uploadAttachment
  calls (validated by integration test with call tracking).
- Must: AC-F3-4 — unchanged content → NO_CHANGE classification (validated by
  integration test).
- Must: AC-QG-1 — `bun run check` exits 0.

**Files and modules**:

- Code areas:
  - `tests/unit/app/push-flow.test.ts` (updated — rewrite TC-LOCK-002)
  - `tests/integration/confluence/push-flow.test.ts` (recreated — TC-LOCK-001, TC-LOCK-003, TC-E2E-002, TC-E2E-003)
  - `tests/unit/infra/mermaid/kroki.test.ts` (updated — fix TC-MERM-DETM-002)
  - `src/domain/mermaid/normalize.ts` (updated — optional F-7/F-8 fixes)
  - `src/app/push-flow.ts` (updated — optional comment fix F-8)
- System docs: none

**Tests**:

- TC-LOCK-001 — bloated lock pruned on Update (recreated)
- TC-LOCK-002 — replace vs merge semantics (rewritten to exercise production code)
- TC-LOCK-003 — NO_CHANGE preserves existing attachmentHashes (recreated)
- TC-E2E-002 — second sync → 0 uploadAttachment calls
- TC-E2E-003 — unchanged content → NO_CHANGE classification
- TC-MERM-DETM-002 — different configs → different hashes (fixed or renamed)

**Completion signal**: `test(review-fix): restore integration tests and fix tautological TC-LOCK-002 (GH-76 review-iter-1)`

---

## Test Scenarios

| TC ID | Scenario | Phase(s) | AC Coverage |
|-------|----------|----------|-------------|
| TC-MERM-DETM-001 | Same source + config ×2 renders → identical hash | Phase 2 | AC-F1-1, NFR-1 |
| TC-MERM-DETM-002 | Different configs → different hashes | Phase 2 | AC-F1-1, NFR-1 |
| TC-MERM-DETM-003 | Config passthrough to Kroki (query params) | Phase 1 | AC-F1-2, NFR-5, DM-1 |
| TC-MERM-DETM-004 | `securityLevel` NOT passed to Kroki | Phase 1 | AC-F1-2, NFR-5, DEC-1 |
| TC-MERM-NORM-001 | SVG normalization → stable hash for non-deterministic differences | Phase 2 | AC-F2-1, NFR-1, NFR-6, DM-3 |
| TC-MERM-NORM-002 | Normalization rules (strip comments, sort attributes, rewrite IDs) | Phase 2 | AC-F2-1, NFR-6 |
| TC-MERM-NORM-003 | Normalized SVG has 0 structural differences from raw SVG | Phase 2 | AC-F2-2, NFR-6 |
| TC-MERM-NORM-004 | Network fallback → code block + warning (existing, no change) | — | NFR-8 |
| TC-LOCK-001 | Bloated lock (55 entries) → pruned on Update | Phase 3 | AC-F3-1, NFR-3, DM-2 |
| TC-LOCK-002 | Replace vs merge semantics in `finalizeSuccessfulUpdate` | Phase 3 | AC-F3-1, DM-2 |
| TC-LOCK-003 | `NO_CHANGE` outcome → preserves existing `attachmentHashes` | Phase 3 | AC-F3-2, NFR-4 |
| TC-E2E-001 | End-to-end no-op sync with Mermaid diagrams (live sandbox) | Phase 4 | AC-F3-3, AC-F3-4, NFR-2, NFR-4 |
| TC-E2E-002 | Second sync unchanged → 0 `uploadAttachment` calls (mock target) | Phase 4 | AC-F3-3, NFR-2 |
| TC-E2E-003 | Unchanged content → `NO_CHANGE` classification | Phase 4 | AC-F3-4, NFR-4 |
| TC-E2E-004 | Per-document isolation on render failure | Phase 4 | NFR-7 |
| TC-QG-001 | Quality gate: `bun run check` exits 0 | Phase 6 | AC-QG-1, NFR-9 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-76-spec.md | Spec |
| Test plan | ./chg-GH-76-test-plan.md | Test Plan |
| Implementation plan (this file) | ./chg-GH-76-plan.md | Plan |
| Renderer port | src/domain/mermaid/port.ts | Code (updated — Phase 1) |
| SVG normalizer | src/domain/mermaid/normalize.ts | Code (new — Phase 2) |
| Kroki adapter | src/infra/mermaid/kroki.ts | Code (updated — Phases 1, 2) |
| HAST transform | src/domain/mermaid/transform.ts | Code (updated — Phase 1) |
| Push flow (lock pruning) | src/app/push-flow.ts | Code (updated — Phase 3) |
| Mermaid render config type | src/domain/config/types.ts | Code (reference — no change) |
| Spike normalizer (source to lift) | spikes/mermaid-render/normalize.ts | Reference |
| Feature spec | doc/spec/features/feature-mermaid-rendering.md | Doc (updated — Phase 5) |
| ADR-0002 | doc/decisions/ADR-0002-mermaid-rendering-strategy.md | Doc (updated — Phase 5) |
| Testing strategy | .ai/rules/testing-strategy.md | Reference |
| TypeScript style | .ai/rules/typescript.md | Reference |
| Kroki diagram-options docs | https://docs.kroki.io/kroki/setup/diagram-options/ | External reference |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | plan-writer (AI-assisted) | Initial implementation plan for GH-76 |
| 1.1 | 2026-07-14 | reviewer (AI-assisted) | Added Phase 7: Code Review Remediation (Iteration 1) — 8 findings (3 high, 2 medium, 2 low, 1 info). Primary gap: F-3 lock pruning has zero effective test coverage (tautological TC-LOCK-002 + deleted integration tests). |

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | Done | 2026-07-14 | 2026-07-14 | 98c3b4d | Renderer contract + Kroki config passthrough (F-1) |
| Phase 2 | Done | 2026-07-14 | 2026-07-14 | e556bf3 | SVG normalization before hashing (F-2) |
| Phase 3 | Partial | 2026-07-14 | 2026-07-14 | 879e158, 855252b | Lock pruning code correct; tests tautological/deleted (see Phase 7) |
| Phase 4 | Not Started | | | | Integration tests deleted in 2948c0e; deferred to Phase 7 |
| Phase 5 | Done | 2026-07-14 | 2026-07-14 | 2948c0e | Documentation & spec synchronization |
| Phase 6 | Done | 2026-07-14 | 2026-07-14 | 657356e, 62e0bf9 | Version bump + quality fixes |
| Phase 7 | Pending | | | | Code Review Remediation (Iteration 1) |
