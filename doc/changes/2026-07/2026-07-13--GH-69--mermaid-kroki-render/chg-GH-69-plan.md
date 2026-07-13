---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-69-mermaid-kroki-render
status: Proposed
created: 2026-07-13T00:00:00Z
last_updated: 2026-07-13T00:00:00Z
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

- [ ] **P1.1** Create `src/domain/mermaid/port.ts` exporting the `Renderer` port:
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

- [ ] **P1.2** Create `src/infra/mermaid/kroki.ts` implementing `Renderer`:
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

- [ ] **P1.3** Implement `sha256Hash(bytes)` locally (reuse GH-26 pattern):
  ```ts
  async sha256Hash(bytes: Uint8Array): Promise<string> {
    const d = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  ```

- [ ] **P1.4** Write `tests/unit/infra/mermaid/kroki.test.ts` with mocked `fetch`:
  - **TC-MERM-005** (network fallback): Mock `fetch` to return HTTP 503 → assert
    `err({ kind: "RemoteUnreachable", status: 503, ... })`.
  - **TC-MERM-010** (timeout safety): Mock `fetch` to throw `AbortError` → assert
    `err({ kind: "RemoteUnreachable", cause: "..." })`.
  - Success path: Mock `fetch` to return SVG bytes → assert `ok(Artifact)` with
    `bytes: <SVG>`, `mime: "image/svg+xml"`, `hash: <full sha256>`, `kind: "mermaid"`.

- [ ] **P1.5** Commit: `feat(mermaid): GH-69 add Renderer port and Kroki HTTP adapter`.

---

## Phase 2 — Mermaid HAST transform (F-2, F-6, DEC-1, DEC-3)

**Goal:** Implement the domain transform that walks HAST for mermaid fences,
calls the renderer, replaces `pre` with `img` on success, falls back to code
block on failure, and dedups within-doc by source.

**Tasks:**

- [ ] **P2.1** Create `src/domain/mermaid/transform.ts` exporting the transform:
  ```ts
  import type { Renderer } from "#domain/mermaid/port";
  import type { Artifact } from "#domain/target/port";
  import type { MarkSyncError } from "#domain/errors";
  import type { Result } from "#domain/result";
  import type { Root } from "hast";
  import type { MermaidRenderConfig } from "#domain/config/types";
  import type { MermaidPolicy } from "#domain/config/types";

  export interface TransformResult {
    artifacts: Artifact[];
    transformedHast: Root;
    warnings: string[];
  }

  export async function transform(
    hast: Root,
    config: MermaidRenderConfig,
    renderer: Renderer,
  ): Promise<Result<TransformResult, MarkSyncError>> {
    // If policy !== "render" → return ok({ artifacts: [], transformedHast: hast, warnings: [] })
    // Walk HAST for element nodes with tagName === "pre"
    // Check if pre > code child has className containing "language-mermaid"
    // For each mermaid fence:
    //   source = code.textContent
    //   dedupKey = source (in-doc dedup)
    //   if already rendered → reuse existing artifact + filename
    //   else: result = await renderer.render(source)
    //     On success: build img node with src = filename (full hash from artifact),
    //                 alt = "Mermaid diagram"
    //                 replace pre with img
    //                 collect artifact
    //     On RemoteUnreachable: keep pre unchanged, collect warning
    // Return ok({ artifacts, transformedHast, warnings })
  }
  ```

- [ ] **P2.2** Write `tests/unit/domain/mermaid/transform.test.ts` with stubbed renderer:
  - **TC-MERM-004** (policy activation): Test `policy = "render"` → pre replaced
    with img; `policy = "code"/"skip"` → pre unchanged.
  - **TC-MERM-007** (determinism): Call transform 3× with same source → assert
    all hashes identical (full sha256), all filenames identical.
  - **TC-MERM-009** (in-doc dedup): Two identical mermaid fences → one Artifact,
    both `pre` replaced with `img` nodes pointing to same filename.
  - Success path: Stub renderer returns fixed SVG bytes → assert HAST has `img`
    node with correct src/filename, artifacts array populated.

- [ ] **P2.3** Commit: `feat(mermaid): GH-69 add Mermaid HAST transform`.

---

## Phase 3 — computePlan wiring + privacy warning (F-3, F-5, NFR-4, NFR-PRIV-2)

**Goal:** Wire the mermaid transform into `computePlan` after `mdastToHast` and
before `target.renderBody`, only when `config.render.mermaid.policy ===
"render"`. Merge mermaid artifacts into `PlanEntry.assets` and
`ContentHash.attachmentHashes`. Emit a one-time privacy warning.

**Tasks:**

- [ ] **P3.1** In `src/app/push-flow.ts`, after `mdastToHast` (line ~207) and **before**
  `target.renderBody` (line ~226):
  ```ts
  // GH-69: Mermaid rendering (when policy === "render")
  let mermaidArtifacts: Artifact[] = [];
  if (config.render.mermaid.policy === "render") {
    // Emit one-time privacy warning
    if (!privacyWarningEmitted) {
      allWarnings.push(
        "Mermaid rendering sends diagram content to Kroki API (https://kroki.io) — review privacy policy before use"
      );
      privacyWarningEmitted = true;
    }

    // Construct Kroki renderer (or accept injected Renderer for tests)
    const renderer: Renderer = new KrokiClient(); // or injected

    // Run mermaid transform
    const mermaidResult = await transform(hast, config.render.mermaid, renderer);
    if (!mermaidResult.ok) {
      // RemoteUnreachable is a per-document warning, not a plan abort
      const err = mermaidResult.error;
      if (err.kind === "RemoteUnreachable") {
        allWarnings.push(
          `Mermaid render failed for diagram at ${path}: ${err.cause ?? "Unknown error"} — falling back to code block`
        );
      } else {
        return mermaidResult; // Other errors abort the plan
      }
    } else {
      // Success: merge artifacts, use transformed HAST
      mermaidArtifacts = mermaidResult.value.artifacts;
      hast = mermaidResult.value.transformedHast;
      allWarnings.push(...mermaidResult.value.warnings);
    }
  }

  // GH-26: Resolve assets (path-safe, content-addressed) — unchanged
  const assetResult = await resolver.resolve(hast, path);
  // ... existing asset resolution code ...

  // Merge mermaid artifacts into entry.assets (append to local assets)
  // Populate ContentHash.attachmentHashes from both local + mermaid artifacts
  ```

- [ ] **P3.2** Add `privacyWarningEmitted` flag at the top of `computePlan` (outside
  the per-doc loop) to ensure the warning is emitted once per run.

- [ ] **P3.3** Modify the `attachmentHashes` construction to include mermaid
  artifacts:
  ```ts
  const attachmentHashes: Record<string, string> = {};
  // GH-26: local assets
  for (const resolved of assetSet.srcMap.values()) {
    attachmentHashes[resolved.filename] = resolved.hash;
  }
  // GH-69: mermaid artifacts
  for (const artifact of mermaidArtifacts) {
    const filename = attachmentFilename(artifact); // produces marksync-mermaid-<fullhash>.svg
    attachmentHashes[filename] = artifact.hash;
  }
  ```

- [ ] **P3.4** Modify `PlanEntry` construction to stash `assets: [...assetSet.artifacts,
  ...mermaidArtifacts]` (append mermaid artifacts to local assets).

- [ ] **P3.5** Write `tests/integration/app/mermaid/mermaid-render.test.ts`:
  - **TC-MERM-001** (render activation): Mock Kroki adapter + mock target → assert
    Storage body contains `<ac:image><ri:attachment ri:filename="marksync-mermaid-<fullsha256>.svg"/>`,
    `uploadAttachment` called once with correct artifact.
  - **TC-MERM-002** (golden fixture foundation, see Phase 4): Stub renderer → assert
    XHTML structure matches committed golden.
  - **TC-MERM-003** (attachment reuse): First run → upload 1×; second run with
    same source → `attachmentExists` true, `uploadAttachment` called 0×.
  - **TC-MERM-006** (per-document isolation): Doc A renders successfully, doc B
    fails → run continues, doc B falls back to code block.
  - **TC-MERM-008** (privacy warning): `policy = "render"` → warning in plan output;
    `policy = "code"/"skip"` → no warning.
  - **TC-MERM-011** (no secrets in output): Mermaid source contains fake token →
    filename is hash (not token), output contains 0 token occurrences.

- [ ] **P3.6** Commit: `feat(mermaid): GH-69 wire mermaid transform into computePlan`.

---

## Phase 4 — Golden fixture (TC-MERM-002)

**Goal:** Add a golden fixture test proving the Storage XHTML structure for a
mermaid fence under `render` policy. The fixture uses a mocked renderer to ensure
determinism in CI.

**Tasks:**

- [ ] **P4.1** Extend `tests/golden/markdown/storage-renderer.test.ts` (or create a
  new focused test file) with a `describe` block for mermaid render policy:
  ```ts
  describe("mermaid render policy", () => {
    it("renders mermaid fence as <ac:image><ri:attachment> with mocked renderer", async () => {
      // Parse a markdown doc with a mermaid fence
      // Stub renderer to return fixed SVG bytes
      // Run transform with policy = "render"
      // Render to Storage format
      // Assert matches committed golden fixture
    });
  });
  ```

- [ ] **P4.2** Create the golden fixture file
  `tests/golden/fixtures/markdown/mermaid-render-policy.storage.xhtml` with the
  expected XHTML structure containing
  `<ac:image><ri:attachment ri:filename="marksync-mermaid-<hash>.svg"/></ac:image>`
  (where `<hash>` is the full sha256 of the mocked SVG bytes).

- [ ] **P4.3** Commit: `test(mermaid): GH-69 add golden fixture for mermaid render policy`.

---

## Phase 5 — Quality gate & cleanup (AC-7, NFR-9)

**Goal:** Ensure all CI gates pass, lint/typecheck/format issues are resolved,
and the implementation satisfies the quality gate.

**Tasks:**

- [ ] **P5.1** Run `bun run check` (lint + typecheck + tests). Fix any failures.
  Target: 0 failures, 0 dependency-violations (dep-cruiser).

- [ ] **P5.2** Verify dep-cruiser tier rules:
  - `src/domain/mermaid/` may NOT import from `src/infra/` or `src/app/`.
  - `src/infra/mermaid/` may import from `src/domain/mermaid/port.ts` (port) but
    not from other domain services.

- [ ] **P5.3** Verify no new `MarkSyncError` arms were introduced
  (`src/domain/errors.ts` unchanged) and the `assertNeverMarkSyncError`
  exhaustiveness check still compiles.

- [ ] **P5.4** Verify that `src/infra/confluence/attachments.ts` `attachmentFilename()`
  produces `marksync-mermaid-<fullhash>.svg` for `kind === "mermaid"` (no changes
  needed; this is verification).

- [ ] **P5.5** Confirm `bun run check` is green; report test counts.

- [ ] **P5.6** Final commit if any cleanup: `chore(mermaid): GH-69 lint/typecheck pass`.

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

---

## Execution Log

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 1 | Pending | - | - | - | Renderer port + Kroki adapter |
| Phase 2 | Pending | - | - | - | Mermaid HAST transform |
| Phase 3 | Pending | - | - | - | computePlan wiring + privacy warning |
| Phase 4 | Pending | - | - | - | Golden fixture |
| Phase 5 | Pending | - | - | - | Quality gate & cleanup |
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
- **The mermaid transform runs AFTER `mdastToHast` and BEFORE
  `target.renderBody`.** This order is critical for the HAST transformation to
  take effect.
- **Per-document isolation:** A `RemoteUnreachable` on one doc's mermaid fences
  should NOT abort the run. The transform should fall back to the code block and
  continue with the next document.