---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-69-mermaid-kroki-render
status: Updated
created: 2026-07-13T00:00:00Z
last_updated: 2026-07-13T17:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E4, mermaid, kroki, remote-rendering, attachments]
links:
  change_spec: ./chg-GH-69-spec.md
  test_plan: ./chg-GH-69-test-plan.md
  story: ../../../planning/milestones/MS-2/MS2-E4--features/MS2-E4-S1--mermaid-rendering.md
  feature_spec: ../../../spec/features/feature-mermaid-rendering.md
  adr_0002: ../../../decisions/ADR-0002-mermaid-rendering-strategy.md
  adr_0006: ../../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md
  typescript_rules: ../../../../.ai/rules/typescript.md
  testing_strategy: ../../../../.ai/rules/testing-strategy.md
  target_port: ../../../../src/domain/target/port.ts
  push_flow: ../../../../src/app/push-flow.ts
  config_types: ../../../../src/domain/config/types.ts
summary: >
  Deliver MS2-E4-S1 (mermaid rendering): a Kroki-based HTTP adapter at
  `src/infra/mermaid/kroki.ts` that POSTs diagram source to
  `https://kroki.io/mermaid/svg`, returns SVG bytes, and produces a full-sha256
  `Artifact` with `kind: "mermaid"`. A domain transform at
  `src/domain/mermaid/transform.ts` walks HAST for `pre>code.language-mermaid`,
  calls the renderer, replaces the fence with an `img` node (so `imageMacro` emits
  `<ri:attachment>`), dedups within-doc by source, and falls back to the code
  block on `RemoteUnreachable`. Wire into `computePlan` after `mdastToHast` and
  before `target.renderBody` when `config.render.mermaid.policy === "render"`,
  merge artifacts into `PlanEntry.assets` + `ContentHash.attachmentHashes`, and
  emit a one-time privacy warning (NFR-PRIV-2). Reuse the GH-26 upload/reuse
  pipeline verbatim; `attachmentFilename()` already produces
  `marksync-mermaid-<fullsha256>.svg` for `kind === "mermaid"`.
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-69: [MS2-E4-S1] Mermaid SVG rendering via Kroki API

## Context and Goals

GH-69 closes the mermaid rendering gap for MS-0002. The `render.mermaid.policy`
enum exists (GH-25) but only the `code` policy is implemented; the `render`
policy is a no-op. This plan delivers the Kroki-based HTTP adapter, the domain
HAST transform, and the `computePlan` wiring to activate rendering as opt-in
behavior. The design respects ADR-0002 fallback ladder rung 6 (public Kroki),
includes a privacy warning (NFR-PRIV-2), and ensures deterministic hashing for
attachment reuse (NFR-PERF-4). The upload/dedup pipeline is reused verbatim from
GH-26.

### Decisions load-bearing for the plan

- **PM decision override (full hash, NOT truncated):** The mermaid artifact's
  `hash` field stores the full 64-character sha256 hex, and the filename is
  `marksync-mermaid-<fullsha256>.svg` (NOT truncated to 24 chars). The existing
  `src/infra/confluence/attachments.ts` `attachmentFilename()` already produces
  this when `kind === "mermaid"` — do NOT modify it or add a truncating helper.
- **DEC-1 (HAST transformation):** Replace the mermaid `pre` element with an
  `img` node (not a `raw` XHTML node). The existing `imageMacro` in
  `storage.ts` emits `<ac:image><ri:attachment ri:filename="..."/>` for `<img>`
  nodes — reuse this path.
- **DEC-2 (adapter location):** Kroki adapter lives in `src/infra/mermaid/kroki.ts`
  (infra tier — performs HTTP I/O).
- **DEC-3 (transform location):** Mermaid transform lives in `src/domain/mermaid/transform.ts`
  (domain tier — HAST orchestration, adapter-agnostic).
- **DEC-5 (mmdc CLI deferred):** Design the `Renderer` port for swappability,
  but do NOT wire mmdc in this change.
- **DEC-6 (privacy warning):** Emit a one-time warning when `render.mermaid.policy
  === "render"` is active.
- **Network error mapping:** HTTP 4xx/5xx + network/timeout → `RemoteUnreachable`
  (use existing error shape from `src/domain/errors.ts`).
- **Determinism testing:** CI uses a mocked renderer returning fixed SVG bytes;
  real Kroki determinism is validated manually (Kroki output is non-deterministic
  across environments).

### Files touched

**New:**
- `src/domain/mermaid/port.ts` — `Renderer` port interface.
- `src/infra/mermaid/kroki.ts` — Kroki HTTP adapter implementing `Renderer`.
- `src/domain/mermaid/transform.ts` — Mermaid HAST transform.
- `tests/unit/infra/mermaid/kroki.test.ts` — Kroki adapter unit tests.
- `tests/unit/domain/mermaid/transform.test.ts` — Mermaid transform unit tests.
- `tests/integration/app/mermaid/mermaid-render.test.ts` — End-to-end integration tests.
- `tests/golden/fixtures/markdown/mermaid-render-policy.storage.xhtml` — Golden fixture.

**Modified (additive):**
- `src/app/push-flow.ts` — `computePlan` wiring: run mermaid transform when
  policy === `"render"`, populate `attachmentHashes` + merge mermaid artifacts.

**Unchanged (verified, not edited):** `src/infra/confluence/attachments.ts`,
`src/infra/confluence/render/storage.ts`, `src/domain/target/port.ts`,
`src/domain/errors.ts`, `src/domain/config/types.ts` (enum exists).

---

## Phase 1 — Renderer port + Kroki adapter (F-1, DEC-2, DM-6)

**Goal:** Define the `Renderer` port and implement the Kroki HTTP adapter that
POSTs to `https://kroki.io/mermaid/svg`, returns SVG bytes, computes the full
sha256 hash, and produces an `Artifact` with `kind: "mermaid"`.

**Tasks:**

- [x] **P1.1** Create `src/domain/mermaid/port.ts` exporting the `Renderer` port (done — src/domain/mermaid/port.ts).
  ```ts
  import type { Artifact } from "#domain/target/port";
  import type { MarkSyncError } from "#domain/errors";
  import type { Result } from "#domain/result";

  export interface Renderer {
    /**
     * Render a mermaid diagram source to an SVG artifact.
     * Returns ok(Artifact) on success, err(MarkSyncError) on failure.
     */
    render(source: string): Promise<Result<Artifact, MarkSyncError>>;
  }
  ```

- [x] **P1.2** Create `src/infra/mermaid/kroki.ts` implementing `Renderer` (done — POST text/plain, AbortController timeout, full sha256, kind=mermaid; injectable fetch seam).
  ```ts
  import type { Renderer } from "#domain/mermaid/port";
  import type { Artifact } from "#domain/target/port";
  import type { MarkSyncError } from "#domain/errors";
  import type { Result } from "#domain/result";

  export class KrokiClient implements Renderer {
    private readonly endpoint = "https://kroki.io/mermaid/svg";
    private readonly timeoutMs = 30000;

    async render(source: string): Promise<Result<Artifact, MarkSyncError>> {
      // POST to this.endpoint with text/plain body = source
      // Timeout after this.timeoutMs
      // On HTTP 200: read bytes, compute sha256 hash, build Artifact
      // On HTTP 4xx/5xx: return err({ kind: "RemoteUnreachable", status, cause: "..." })
      // On network/timeout error: return err({ kind: "RemoteUnreachable", cause: "..." })
    }
  }
  ```

- [x] **P1.3** Implement `sha256Hash(bytes)` locally (reuse GH-26 pattern) (done — local sha256Hex in kroki.ts, full 64-char hex).
  ```ts
  async sha256Hash(bytes: Uint8Array): Promise<string> {
    const d = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  ```

- [x] **P1.4** Write `tests/unit/infra/mermaid/kroki.test.ts` with mocked `fetch`
  (done — 7 tests: success+hash, POST body/Content-Type, 503/404 fallback, AbortError, short-timeout abort, generic network error; 7 pass, 0 fail).

- [x] **P1.5** Commit: `feat(mermaid): gh-69 add renderer port and kroki http adapter`.

---

## Phase 2 — Mermaid HAST transform (F-2, F-6, DEC-1, DEC-3)

**Goal:** Implement the domain transform that walks HAST for mermaid fences,
calls the renderer, replaces `pre` with `img` on success, falls back to code
block on failure, and dedups within-doc by source.

**Tasks:**

 - [x] **P2.1** Create `src/domain/mermaid/transform.ts` exporting the transform
   (done — recursive HAST walk reusing walkElements pattern; per-fence render/fallback/dedup; img node replacement; policy gating).

 - [x] **P2.2** Write `tests/unit/domain/mermaid/transform.test.ts` with stubbed renderer
   (done — 8 tests: TC-MERM-004 policy activation render/code/skip, TC-MERM-007 determinism 3× identical 64-char hash+filename, TC-MERM-009 in-doc dedup one Artifact renderer called once, TC-MERM-012 empty source fallback, TC-MERM-005 always-error fallback, recursive blockquote walk; 8 pass).

 - [x] **P2.3** Commit: `feat(mermaid): gh-69 add mermaid hast transform`.

---

## Phase 3 — computePlan wiring + privacy warning (F-3, F-5, NFR-4, NFR-PRIV-2)

**Goal:** Wire the mermaid transform into `computePlan` after `mdastToHast` and
after `resolver.resolve()`, but before `target.renderBody`, only when
`config.render.mermaid.policy === "render"`. Merge mermaid artifacts into
`PlanEntry.assets` and `ContentHash.attachmentHashes`. Emit a one-time privacy
warning.

**Tasks:**

  - [x] **P3.1** In `src/app/push-flow.ts`, insert mermaid transform AFTER `resolver.resolve()`
    and BEFORE `target.renderBody()` when `policy === "render"` (done — load-bearing ordering
    preserved: resolver FIRST → transform SECOND → renderBody LAST; `const hast` → `let hast`).
    Optional 5th `mermaidRenderer?` param on `computePlan` enables test injection (production
    defaults to `new KrokiClient()`).

  - [x] **P3.2** Add `privacyWarningEmitted` flag at the top of `computePlan` (outside
    the per-doc loop) to ensure the warning is emitted once per run (done — declared
    alongside `allWarnings`).

  - [x] **P3.3** Modify the `attachmentHashes` construction to include mermaid
    artifacts (done — loops `mermaidArtifacts` via `attachmentFilename(artifact)`).

  - [x] **P3.4** Modify `PlanEntry` construction to stash `assets: [...assetSet.artifacts,
    ...mermaidArtifacts]` (done — both bound + unbound entries, replaceAll).

  - [x] **P3.5** Write `tests/integration/app/mermaid/mermaid-render.test.ts`
    (done — 9 tests: TC-MERM-001 render activation + upload, TC-MERM-003 reuse +
    determinism, TC-MERM-006 per-doc isolation, TC-MERM-008 privacy warning render/code/skip,
    TC-MERM-011 no secrets in output; 9 pass; mock target uses REAL renderStorage).

  - [x] **P3.6** Commit: `feat(mermaid): gh-69 wire mermaid transform into computeplan`.

---

## Phase 4 — Golden fixture (TC-MERM-002)

**Goal:** Add a golden fixture test proving the Storage XHTML structure for a
mermaid fence under `render` policy. The fixture uses a mocked renderer to ensure
determinism in CI.

**Tasks:**

  - [x] **P4.1** Golden test for mermaid render policy (done — new focused file
    `tests/golden/markdown/mermaid-render-golden.test.ts` with 2 tests: byte-exact
    match against committed fixture + snapshot byte-stability across 3 runs; 2 pass).

  - [x] **P4.2** Create golden fixture `tests/golden/fixtures/markdown/mermaid-render-policy.storage.xhtml`
    (done — contains `<ac:image ac:alt="Mermaid diagram"><ri:attachment ri:filename="marksync-mermaid-<fullsha256>.svg"/></ac:image>`).

  - [x] **P4.3** Commit: `test(mermaid): gh-69 add golden fixture for mermaid render policy`.

---

## Phase 5 — Quality gate & cleanup (AC-7, NFR-9)

**Goal:** Ensure all CI gates pass, lint/typecheck/format issues are resolved,
and the implementation satisfies the quality gate.

**Tasks:**

  - [x] **P5.1** Run `bun run check` (lint + typecheck + tests). Fix any failures.
    Target: 0 failures, 0 dependency-violations (dep-cruiser).
    (done — lint exit 0 [warnings only], format:check exit 0, typecheck exit 0,
    1042 pass / 0 fail, depcruise 0 violations. Fixed formatting in 7 files incl.
    pre-existing target.test.ts; fixed optional-chain lint warning in transform.ts).

- [x] **P5.2** Verify dep-cruiser tier rules:
  - `src/domain/mermaid/` may NOT import from `src/infra/` or `src/app/`.
  - `src/infra/mermaid/` may import from `src/domain/mermaid/port.ts` (port) but
    not from other domain services.
  - (done — domain/mermaid imports only `hast` + `#domain/*`; infra/mermaid imports
    only `#domain/mermaid/port` + `#domain/*` types; depcruise 0 violations.)

- [x] **P5.3** Verify no new `MarkSyncError` arms were introduced
  (`src/domain/errors.ts` unchanged) and the `assertNeverMarkSyncError`
  exhaustiveness check still compiles.
  (done — `git diff main -- src/domain/errors.ts` empty; typecheck exit 0.)

- [x] **P5.4** Verify that `src/infra/confluence/attachments.ts` `attachmentFilename()`
  produces `marksync-mermaid-<fullhash>.svg` for `kind === "mermaid"` (no changes
  needed; this is verification).
  (done — line 143: `artifact.kind === "mermaid" ? "marksync-mermaid-" : "marksync-asset-"`;
  full hash appended; file unchanged.)

- [x] **P5.5** Confirm `bun run check` is green; report test counts.
  (done — lint exit 0, format:check exit 0, typecheck exit 0, 1042 pass / 0 fail,
  depcruise 0 violations.)

- [x] **P5.6** Final commit if any cleanup: `chore(mermaid): gh-69 lint/typecheck pass`.

---

## Documentation impact (for @doc-syncer phase 7)

Per the ADOS lifecycle, `@doc-syncer` handles doc reconciliation in phase 7. This plan
identifies the following docs that will need updating:

**Feature spec:**
- `doc/spec/features/feature-mermaid-rendering.md` — Currently says rendering is deferred
  to MS-0003+. Must update to reflect that Kroki rendering (rung 6 public Kroki) is now
  implemented in MS-0002.

**Decision records:**
- `doc/decisions/ADR-0002-mermaid-rendering-strategy.md` — Rung 6 public Kroki is now
  wired into the codebase. Add a revision-history entry noting the implementation and
  referencing GH-69.

**Nonfunctional requirements:**
- `doc/spec/nonfunctional.md` — NFR-PRIV-2 (privacy): Add evidence that the render
  policy opt-in + warning mechanism is implemented (one-time warning emitted when
  `render.mermaid.policy === "render"`).

**Architecture (if applicable):**
- `doc/overview/architecture-overview.md` — IF a new domain/infra module is introduced
  (this change introduces `src/domain/mermaid/` and `src/infra/mermaid/`), update the
  architecture diagram or dependency matrix to reflect the new Mermaid rendering path.

**Code style rules (if applicable):**
- `.ai/rules/typescript.md` — IF a new dependency is added, update `allowed-deps`.
  NOTE: Kroki is accessed via HTTP using the built-in `fetch` API, so no new dependency
  is expected (this is likely a no-op).

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TC-MERM-001 | Render activation — fence to `<ri:attachment>` with full hash filename | P3 (integration) | AC-1, F-1, F-2, F-3 |
| TC-MERM-002 | Golden fixture — Storage XHTML structure with mocked renderer | P4 (golden) | AC-1, F-2 |
| TC-MERM-003 | Attachment reuse — unchanged → 0 uploads | P3 (integration) | AC-2, F-4, NFR-2 |
| TC-MERM-004 | Policy activation — render vs code vs skip | P2 (unit) | AC-3, F-2, F-5 |
| TC-MERM-005 | Network fallback — HTTP error → code block + warning | P1 (unit), P3 (integration) | AC-4, F-6, NFR-5 |
| TC-MERM-006 | Per-document isolation — one doc fails, run continues | P3 (integration) | AC-4, NFR-6 |
| TC-MERM-007 | Determinism — same source → same hash → same filename (full sha256) | P2 (unit) | AC-5, F-4, NFR-3 |
| TC-MERM-008 | Privacy warning — one-time warning for `render` policy | P3 (integration) | AC-6, F-5, NFR-4 |
| TC-MERM-009 | In-doc dedup — same mermaid twice → one Artifact | P2 (unit) | F-2 |
| TC-MERM-010 | Timeout safety — Kroki timeout → `RemoteUnreachable` | P1 (unit) | NFR-7, AC-4 |
| TC-MERM-011 | No secrets in filenames/output (INV-SEC-1) | P3 (integration) | NFR-8, AC-1 |
| TC-MERM-012 | Empty mermaid source — renderer error → code block + warning | P2 (unit) | AC-4, F-6, NFR-5 |

---

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-69-spec.md | Spec |
| Test plan | ./chg-GH-69-test-plan.md | Test plan |
| Implementation plan | ./chg-GH-69-plan.md | Plan |
| Renderer port | src/domain/mermaid/port.ts | New |
| Kroki HTTP adapter | src/infra/mermaid/kroki.ts | New |
| Mermaid HAST transform | src/domain/mermaid/transform.ts | New |
| Kroki adapter unit tests | tests/unit/infra/mermaid/kroki.test.ts | New |
| Transform unit tests | tests/unit/domain/mermaid/transform.test.ts | New |
| Integration tests | tests/integration/app/mermaid/mermaid-render.test.ts | New |
| Golden fixture | tests/golden/fixtures/markdown/mermaid-render-policy.storage.xhtml | New |
| Modified push-flow | src/app/push-flow.ts | Updated |

---

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | plan-writer (AI-assisted) | Initial plan |
| 1.1 | 2026-07-13 | plan-writer (AI-assisted) | DoR iter-1 fixes: (1) Fixed BLOCKER - mermaid transform now explicitly runs AFTER resolver.resolve() with load-bearing invariant rationale; (2) Added documentation impact section for phase 7; (3) Added recursive HAST walk requirement to P2.1 |
| 1.2 | 2026-07-13 | plan-writer (AI-assisted) | DoR iter-1 fixes: (1) Fixed CRITICAL BLOCKER in P3.1 code sketch - statement order now correct: resolver.resolve() runs FIRST, then mermaid transform, then target.renderBody(); removed duplicate resolver.resolve() call; (2) Added TC-MERM-012 (empty source) to test scenarios coverage table and P2.2 task |

---

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | Done | 2026-07-13 | 2026-07-13 | 5884ecf | Renderer port + Kroki adapter; 7 unit tests PASS, typecheck clean |
| Phase 2 | Done | 2026-07-13 | 2026-07-13 | 2a5953e | Mermaid HAST transform; 8 unit tests PASS, typecheck + depcruise clean |
| Phase 3 | Done | 2026-07-13 | 2026-07-13 | 50b01a0 | computePlan wiring; 9 integration tests PASS, full suite 1040 pass |
| Phase 4 | Done | 2026-07-13 | 2026-07-13 | 44616b7 | Golden fixture; 2 golden tests PASS, existing 33 golden tests unaffected |
| Phase 5 | Done | 2026-07-13 | 2026-07-13 | 34f9675 | Quality gate green: 1042 pass / 0 fail, depcruise 0 violations, errors.ts unchanged, tier rules verified |
| Remediation | Pending | - | - | - | Populated by `@reviewer` if needed |

---

## Notes for the coder

- **Do NOT edit** `src/infra/confluence/attachments.ts` or
  `src/infra/confluence/render/storage.ts`. They are consumed as-is. The existing
  `attachmentFilename()` already produces `marksync-mermaid-<fullhash>.svg` for
  `kind === "mermaid"`.
- **Full sha256 hash, NOT truncated:** The mermaid artifact's `hash` field stores
  the full 64-character sha256 hex. The filename is `marksync-mermaid-<fullhash>.svg`.
  Do NOT add a truncating helper or modify the existing `attachmentFilename()`.
- **Upload pipeline is already mermaid-ready:** Reuse the existing GH-26
  `uploadAssets()` → `AttachmentService.upload()` → `attachmentFilename()` flow
  verbatim. Do NOT add mermaid-specific upload logic.
- **Replace `pre` with `img`, NOT `raw` XHTML:** This ensures the existing
  `imageMacro` in `storage.ts` emits the correct `<ac:image><ri:attachment/>`
  structure. Do NOT inject a `raw` node.
- **Privacy warning is one-time per run:** Emit it once when the mermaid transform
  is first active with the remote Kroki endpoint. Do NOT emit per-diagram.
- **Network errors → `RemoteUnreachable`:** Map HTTP 4xx/5xx and network/timeout
  errors to the existing `RemoteUnreachable` error shape (see
  `src/domain/errors.ts`).
- **Determinism testing:** CI uses a mocked renderer returning fixed SVG bytes.
  Real Kroki determinism is validated manually (Kroki output is non-deterministic
  across environments).
- **Commit per phase** with Conventional Commit prefixes (`feat(mermaid):`,
  `test(mermaid):`, `chore(mermaid):`). Include `GH-69` in each subject.
 - **The mermaid transform runs AFTER `mdastToHast` and AFTER `resolver.resolve()`,
   but BEFORE `target.renderBody`.** This order is CRITICAL and load-bearing:
   - The AssetResolver walks every `<img>` element and treats non-http `src` values
     as local file paths (calling `fs.realpathSync(resolved)`).
   - If the mermaid transform ran before the resolver, the synthetic
     `<img src="marksync-mermaid-<hash>.svg">` nodes would be seen by the resolver,
     which would try to resolve them as file paths, fail with
     `Forbidden(path-traversal)`, and abort the entire plan.
   - By running AFTER the resolver, the synthetic mermaid `img` nodes bypass the
     resolver and flow directly to `renderBody` → `imageMacro`, which checks
     `src.startsWith("http")` → false → emits
     `<ac:image><ri:attachment ri:filename="marksync-mermaid-<hash>.svg"/>`.
   - See P3.1 for the full rationale and code comment.
- **Per-document isolation:** A `RemoteUnreachable` on one doc's mermaid fences
  should NOT abort the run. The transform should fall back to the code block and
  continue with the next document.