---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-26-attachments-images
status: In Review (review_fix iter-1 FAIL)
created: 2026-07-13T00:00:00Z
last_updated: 2026-07-13T08:30:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E4, safe-publish, attachments, security, path-traversal, idempotency]
links:
  change_spec: ./chg-GH-26-spec.md
  test_plan: ./chg-GH-26-test-plan.md
  story: ../../../planning/milestones/MS-2/MS2-E4--features/MS2-E4-S2--attachments-images.md
  feature_spec: ../../../spec/features/feature-safe-publish.md
  adr_0005: ../../../decisions/ADR-0005-page-body-representation-storage-not-adf.md
  adr_0006: ../../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md
  adr_0011: ../../../decisions/ADR-0011-cli-output-strategy.md
  typescript_rules: ../../../../.ai/rules/typescript.md
  testing_strategy: ../../../../.ai/rules/testing-strategy.md
  attachment_service: ../../../../src/infra/confluence/attachments.ts
  target_port: ../../../../src/domain/target/port.ts
  storage_renderer: ../../../../src/infra/confluence/render/storage.ts
  push_flow: ../../../../src/app/push-flow.ts
  hashes: ../../../../src/domain/state/hashes.ts
  errors: ../../../../src/domain/errors.ts
summary: >
  Deliver MS2-E4-S2 (local images & attachments): a path-safe, content-hashed
  `AssetResolver` (`src/domain/assets/resolver.ts`) that walks the HAST, confines
  each local image `src` to the configured root (realpath + prefix check,
  symlink-aware → `Forbidden(path-traversal)`), sha256-identifies the bytes, and
  rewrites the HAST node so `imageMacro` emits the dedup filename
  `marksync-asset-<hash>.<ext>`. Wire `computePlan` to populate
  `ContentHash.attachmentHashes` + stash `Artifact[]` on `PlanEntry`; wire
  `applyPlan` to upload each asset on Create/Update unless
  `target.attachmentExists` is true (0 writes on reuse, NFR-PERF-4) and persist
  the hashes into `PageBinding.attachmentHashes`. Domain naming helper
  (`src/domain/assets/naming.ts`) reconciled with the existing infra
  `attachmentFilename()` (DEC-1, full sha256). No new `MarkSyncError` arms.
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-26: [MS2-E4-S2] Attachments and images

## Context and Goals

GH-26 closes the local-image gap in the safe-publish pipeline. Today
`imageMacro` emits the raw `src` basename as `ri:filename` and no image bytes
are ever uploaded, so local images render broken on Confluence; and there is no
confinement, so a doc referencing `../../etc/passwd` could read/upload bytes
outside the root. This plan delivers a path-safe, content-addressed
`AssetResolver` and wires upload/reuse into the already-shipped sync engine
(GH-23) and attachment service (GH-21). It reuses — does not redefine — the
`TargetSystem` port (`uploadAttachment`/`attachmentExists`/`listAttachments`),
`AttachmentService` (incl. the 400→reuse + 413→`TooLarge` mappings),
`imageMacro`, `ContentHash.attachmentHashes`, and `PageBinding.attachmentHashes`.

### Decisions load-bearing for the plan

- **DEC-1 (naming):** the resolver produces an `Artifact { hash: fullSha256Hex }`
  and the **domain** naming helper `assetFilename()` produces
  `marksync-asset-<hash>.<ext>` — identical to the existing **infra**
  `attachmentFilename()` for non-SVG. The story file's `<first24(sha256)>` note
  is **superseded** by the already-shipped full-hash scheme (a single naming
  authority). User-authored `.svg` maps to `marksync-asset-` (the
  `marksync-mermaid-` prefix stays reserved for E4-S1).
- **Path-traversal confinement is release-blocking.** Canonicalize both root
  and target via `realpath` (resolves symlinks — story R1), then a
  `root + path.sep` prefix check. On escape → `Forbidden { operation:
  "path-traversal" }` with **0 bytes read**.
- **Large assets (story Q1):** no hard cap for MS-0002; warn on >25 MB; the
  existing 413 → `TooLarge` mapping surfaces as a per-document block.

### Files touched

**New:**
- `src/domain/assets/naming.ts` — domain filename helper.
- `src/domain/assets/resolver.ts` — `AssetResolver`, `AssetSet`, `ResolvedAsset`.
- `tests/unit/domain/assets/naming.test.ts`
- `tests/unit/domain/assets/resolver.test.ts`
- `tests/integration/assets/asset-upload.test.ts`

**Modified (additive):**
- `src/app/push-flow.ts` — `PlanEntry.assets?`; `computePlan` resolves assets +
  populates `attachmentHashes`; `applyPlan` Create/Update upload step +
  persists `PageBinding.attachmentHashes`.
- Possibly `src/domain/state/hashes.ts` — only if the `attachmentHashes` shape
  needs a helper to convert `AssetSet` → the record the classifier consumes
  (inspect first; prefer no public-signature change).

**Unchanged (verified, not edited):** `src/infra/confluence/attachments.ts`,
`src/domain/target/port.ts`, `src/infra/confluence/render/storage.ts`,
`src/domain/errors.ts`.

---

## Phase 0 — Setup & verification

- [x] **P0.1** Read the contracts you will consume (do not edit):
  `src/infra/confluence/attachments.ts` (`AttachmentService.upload/exists/list`,
  `attachmentFilename()`, the 400→reuse + 413→`TooLarge` mappings),
  `src/domain/target/port.ts` (`Artifact`, `AttachmentRef`, `uploadAttachment`,
  `attachmentExists`), `src/infra/confluence/render/storage.ts` (`imageMacro`),
  `src/app/push-flow.ts` (`computePlan`, `applyPlan`, `PlanEntry`, the Create +
  Update paths), `src/domain/state/hashes.ts` (`ContentHash.attachmentHashes`
  shape), `src/domain/errors.ts` (`Forbidden { operation }`, `TooLarge`). ✓ READ
- [x] **P0.2** Confirm the `ContentHash.attachmentHashes` field shape (e.g.
  `Record<string, string>` filename→hash) by reading
  `src/domain/state/hashes.ts` + how `buildContentHash` accepts it + how the
  classifier compares it. Record the exact shape here: `Record<string, string>` (filename → hash). ✓ CONFIRMED
- [x] **P0.3** Identify the configured content-root field on `ProjectConfig`
  (read `src/domain/config/types.ts`). This is the `root` passed to the
  resolver. Record the field path: `config.root`. ✓ CONFIRMED
- [x] **P0.4** Create a commit on the change branch
  `feat/GH-26/attachments-images` (the PM-created branch exists; switch to it).
  Branch already at main; no rebase needed (fresh branch). ✓ EXISTING BRANCH

## Phase 1 — Domain naming helper (DEC-1)

- [x] **P1.1** Create `src/domain/assets/naming.ts` exporting:
  ```ts
  export function assetFilename(artifact: { hash: string; mime: string }): string
  ```
  producing `marksync-asset-<hash>.<ext>` where `ext` is derived from `mime`
  (`image/png→png`, `image/jpeg→jpg`, `image/gif→gif`, `image/svg+xml→svg`,
  `image/webp→webp`, unknown→`bin`). **SVG uses the `marksync-asset-` prefix**
  (NOT `marksync-mermaid-`) for user-authored images per DEC-1.
- [x] **P1.2** Write `tests/unit/domain/assets/naming.test.ts`:
  - each MIME → correct ext + `marksync-asset-` prefix;
  - **TC-UNIT-010 naming-agreement invariant**: for each non-SVG MIME,
    `assetFilename({hash, mime})` === the infra
    `attachmentFilename({bytes: Any, mime, hash})` (import the infra helper;
    assert byte-equality). For SVG, assert the domain uses `marksync-asset-`
    while the infra uses `marksync-mermaid-` (documented divergence — the
    domain is the HAST-rewrite authority; if this would break the infra
    invariant test, instead align the infra to `marksync-asset-` for non-mermaid
    SVGs and note it — but prefer NOT editing the infra; assert the documented
    divergence).
- [x] **P1.3** Commit: `feat(assets): GH-26 add domain asset-naming helper`. ✓ COMMITTED (af54d75)

## Phase 2 — `AssetResolver` (path-safe, content-addressed)

- [x] **P2.1** Create `src/domain/assets/resolver.ts` with:
  ```ts
  export interface ResolvedAsset { filename: string; hash: string; mime: string; canonicalPath: string; }
  export interface AssetSet { artifacts: import("#domain/target/port").Artifact[]; srcMap: Map<string, ResolvedAsset>; }
  export interface AssetResolverOptions {
    root: string;
    /** Injectable for tests (confinement-read tracking). Default: realpath + readFileSync. */
    readBytes?: (canonicalPath: string) => Uint8Array;
  }
  export class AssetResolver {
    constructor(opts: AssetResolverOptions);
    resolve(hast: Root, docPath: string): Result<AssetSet, MarkSyncError>;
  }
  ```
- [x] **P2.2** `resolve()` walks the HAST for `element` nodes with
  `tagName === "img"` and a string `properties.src`. For each:
  - If `src` starts with `http://` or `https://` → **skip** (leave node
    unchanged; renders as `<ri:url>`).
  - Else: `resolved = path.resolve(path.dirname(docPath), src)`;
    `rootReal = realpath(root)`; try `targetReal = realpath(resolved)` — if
    `realpath` throws (broken symlink / non-existent) →
    `Result.err({ kind: "Forbidden", operation: "path-traversal", pageId: "", ... })`
    (a missing target is treated as a confinement failure for MS-0002 — it
    cannot be safely read; record this choice in the commit).
    Then assert `targetReal === rootReal || targetReal.startsWith(rootReal + path.sep)`;
    on failure → `Forbidden(path-traversal)` and **do not call `readBytes`**
    (0 bytes read outside root).
  - On success: read bytes via `readBytes(targetReal)` (default impl:
    `readFileSync(targetReal)`); derive `mime` from the extension (reuse the
    extension→MIME map); `hash = sha256Hex(bytes)` via `crypto.subtle`
    (`digest("SHA-256", bytes)` → hex). Build `Artifact { bytes, mime, hash }`,
    compute `filename = assetFilename({ hash, mime })`, **rewrite**
    `node.properties.src = filename`, record in `srcMap` + dedupe artifacts by
    canonical path.
  - Preserve `properties.alt` (do not touch).
- [x] **P2.3** Implement `sha256Hex(bytes)` locally (no crypto lib) —
  `const d = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")`.
  (Make `resolve` async if needed; or use the synchronous Bun-specific
  `Bun.crypto.hasher` if available — prefer the portable `crypto.subtle` and
  make `resolve` async. Update the `computePlan` call site accordingly.)
- [x] **P2.4** Write `tests/unit/domain/assets/resolver.test.ts` with a **real
  temp root** (`Bun.mkdtemp`) + image fixtures on disk. Cover:
  - **TC-UNIT-001** relative `../../outside` → `Forbidden(path-traversal)`; read hook never called for the outside path (use an injected `readBytes` that records calls).
  - **TC-UNIT-002** absolute path outside root → `Forbidden`.
  - **TC-UNIT-003** URL-encoded `%2e%2e%2f` → `Forbidden`.
  - **TC-UNIT-004** nested `..` → `Forbidden`.
  - **TC-UNIT-005** root-prefix trick (`/tmp/x` vs `/tmp/x-evil`, raw `startsWith` would wrongly pass) → `Forbidden` (uses `root + path.sep`).
  - **TC-UNIT-006** symlink escape (`img/evil.png → /etc/passwd`) → `Forbidden`; 0 reads of `/etc/passwd`.
  - **TC-UNIT-007** MIME map: png/jpg/jpeg/gif/svg/webp → correct `image/*` + ext.
  - **TC-UNIT-008** remote `https://` skipped → empty artifacts; node unchanged.
  - **TC-UNIT-011** token-in-bytes → filename is sha256 of bytes (not the token); rendered body has 0 token occurrences.
  - **TC-UNIT-012** determinism: same input → identical `AssetSet` across calls.
  - **TC-UNIT-013** in-doc dedup: same image referenced twice → 1 artifact, both nodes rewritten to the same filename.
- [x] **P2.5** Commit: `feat(assets): GH-26 path-safe content-hashed AssetResolver`. ✓ COMMITTED (88dee57)

## Phase 3 — `computePlan` wiring

- [x] **P3.1** In `src/app/push-flow.ts`, add `assets?: Artifact[]` to
  `PlanEntry` (optional → existing callers/tests unaffected).
- [x] **P3.2** Construct one `AssetResolver` at the top of `computePlan`
  (rooted at the content root identified in P0.3). In the per-doc loop, after
  `mdastToHast(mdast)` and **before** `target.renderBody(hast, ...)`:
  ```ts
  const assetResult = await resolver.resolve(hast, path);
  if (!assetResult.ok) return assetResult;   // Forbidden(path-traversal) aborts the plan
  const assetSet = assetResult.value;
  ```
  The HAST now carries dedup filenames, so the subsequent `renderBody` emits
  correct `<ri:attachment>` bodies with no renderer change.
- [x] **P3.3** Populate `ContentHash.attachmentHashes` from `assetSet` (convert
  to the exact shape recorded in P0.2). Replace the current
  `attachmentHashes: {}` with the populated map.
- [x] **P3.4** Stash `assets: assetSet.artifacts` on each `PlanEntry`
  (both the bound-doc and the unbound-Create branches).
- [x] **P3.5** Unit-test hook: add a `computePlan` unit case
  (**TC-UNIT-009**) proving a changed-only-image flips `SyncState` from
  `NO_CHANGE` (two snapshots differing only in `attachmentHashes` → not
  `NO_CHANGE`). This may live in the existing `computePlan` test file or a new
  `tests/unit/app/push-flow-assets.test.ts`.
- [x] **P3.6** Commit: `feat(safe-publish): GH-26 wire AssetResolver into computePlan`. ✓ COMMITTED (3d87fbb)

## Phase 4 — `applyPlan` upload wiring

- [x] **P4.1** Extract a small helper
  `uploadAssets(target, pageId, artifacts): Promise<Result<Record<string,string>, MarkSyncError>>`
  in `push-flow.ts`:
  for each `artifact`: `const found = await target.attachmentExists(pageId, artifact.hash)`;
  if `!found.ok` → return the error; if `found.value === true` → skip (0
  writes); else `const up = await target.uploadAttachment(pageId, artifact)`;
  if `!up.ok` → return the error (caller blocks per-document); collect
  `filename → hash`. Returns the merged `attachmentHashes` map.
- [x] **P4.2** In the **Create** path of `processEntry`, **after** `createPage`
  succeeds and **before/with** the journal append + binding construction: if
  `entry.assets?.length`, call `uploadAssets(...)`. On error → per-document
  block (`{ uuid, outcome: "blocked", error }`). On success → merge the
  returned map into `newBinding.attachmentHashes` (currently `{}`).
- [x] **P4.3** In the **Update** path, **after** a successful `updatePage`
  (both the first-write and the 409-reapply paths) and **before**
  `finalizeSuccessfulUpdate`: if `entry.assets?.length`, call `uploadAssets`.
  On error → per-document block. On success → merge into the binding passed to
  `finalizeSuccessfulUpdate` so `binding.attachmentHashes` carries the new set.
- [x] **P4.4** Confirm the asset-upload step does NOT get its own journal `op`
  (assets are sub-operations of the page create/update mutation, consistent
  with the existing journal schema `create | update`). Document this in a code
  comment at the upload site.
- [x] **P4.5** Commit: `feat(safe-publish): GH-26 wire asset upload/reuse into applyPlan`. ✓ COMMITTED (05b6426)

## Phase 5 — Format coverage + remote pass-through + large-asset (integration)

- [x] **P5.1** Write `tests/integration/assets/asset-upload.test.ts` with a
  **mock `TargetSystem`** that records `attachmentExists` / `uploadAttachment`
  calls (count + args) and is programmable (`existsReturn: boolean`,
  `uploadReturn: Result`). The real `AssetResolver` runs against a real temp fs.
  Cover:
  - **TC-INTEGRATION-001** reuse: `exists=true` → `uploadAttachment` called 0×; binding.attachmentHashes populated.
  - **TC-INTEGRATION-002** update on change: new hash, `exists=false` → `uploadAttachment` called 1×; **assert no `/child/attachment/{attId}/data` URL was hit** (the mock URL recorder sees only the create endpoint).
  - **TC-INTEGRATION-003** format matrix: png/jpg/gif/svg/webp each → body references `marksync-asset-<hash>.<ext>`; upload happened.
  - **TC-INTEGRATION-004** remote `https://` → body has `<ri:url>`; `uploadAttachment` 0×.
  - **TC-INTEGRATION-005** pipeline e2e: doc with a local image → body contains `<ri:attachment ri:filename="marksync-asset-<hash>.<ext>"/>`; after apply the mock's attachment list contains it; `PageBinding.attachmentHashes` carries the hash.
  - **TC-INTEGRATION-006** large-asset + isolation: doc A >25 MB (warn) + doc B whose upload returns `TooLarge` → A applies, B blocks, run continues; >25 MB warning emitted.
- [x] **P5.2** Implement the >25 MB warning: in `uploadAssets` (or the
  resolver), if `artifact.bytes.byteLength > 25 * 1024 * 1024` → push a warning
  string onto the run's warnings (do NOT abort). Wire the warning to surface in
  the `ApplyReport`/`CommandResult.warnings` if straightforward; otherwise log
  to the plan warnings.
- [x] **P5.3** Commit: `test(assets): GH-26 asset upload/reuse/format/isolation integration tests`. ✓ COMMITTED (48deddd)

## Phase 6 — Quality gate & cleanup

- [x] **P6.1** Run `bun run check` (lint + typecheck + tests). Fix any failures.
  Target: 0 failures, 0 dependency-violations (dep-cruiser). ✓ 989 pass, 0 fail, no dep violations
- [x] **P6.2** Verify no new `MarkSyncError` arms were introduced
  (`src/domain/errors.ts` unchanged) and the `assertNeverMarkSyncError`
  exhaustiveness check still compiles. ✓ No new arms; uses existing Forbidden and TooLarge
- [x] **P6.3** Verify dep-cruiser tier rules: `src/domain/assets/` may NOT
  import from `src/infra/` or `src/app/` (domain is innermost). The resolver
  imports only `hast` types, `node:path`, `node:fs`, `crypto`, the
  `TargetSystem`-agnostic `Artifact` type (from `#domain/target/port`), and the
  domain errors/Result. Add a dep-cruiser test fixture if the repo pattern
  requires it. ✓ No dep violations found
- [x] **P6.4** Final commit if any cleanup: `chore(assets): GH-26 lint/typecheck pass`.
- [x] **P6.5** Confirm `bun run check` is green; report test counts. ✓ 989 pass, 0 fail

## Phase 7 — Code Review Remediation (Iteration 1)

Populated by `@reviewer` iter-1 (`code-review/review-iter-1.yaml`). Status:
FAIL — 1 critical / 5 high / 3 medium / 2 low. The confinement core, naming
single-authority (non-SVG), domain purity, error-model reuse, and dep-cruiser
rules are sound; the blockers below must land before DoR/DoD sign-off.

### F-1 (critical) — SVG naming divergence breaks user-authored SVG images
- [ ] **P7.1** Reconcile the domain `assetFilename()` and infra
  `attachmentFilename()` for SVG so the HAST `<ri:attachment>` filename equals
  the uploaded filename. Preferred: gate the `marksync-mermaid-` infra prefix on
  an explicit mermaid marker (NOT mime alone) so user `.svg` →
  `marksync-asset-<hash>.svg` on BOTH sides; OR pass the HAST filename through
  to upload so the server name matches. Update DEC-1 note + spec F-4 to reflect
  the functional requirement (filenames MUST agree), not just a "documented
  divergence".
- [ ] **P7.2** Add an integration assertion (TC-INTEGRATION-003 svg row +
  TC-INTEGRATION-005) that the uploaded attachment filename EQUALS the HAST
  `ri:attachment` filename for svg (drive through the real infra
  `attachmentFilename`, see P7.5).
- [ ] **P7.3** Update `tests/unit/domain/assets/naming.test.ts` TC-UNIT-010 SVG
  case to assert domain === infra for user SVG (not "documented divergence").

### F-2 / F-10 (high/low) — applyPlan upload wiring untested; uploadAssets private
- [ ] **P7.4** Export `uploadAssets` from `src/app/push-flow.ts` (test seam; no
  CLI-surface widening).
- [ ] **P7.5** Rewrite TC-INTEGRATION-001 (reuse) and TC-INTEGRATION-002 (update
  / no-`/data`) to call the REAL `uploadAssets` with a recording mock target —
  assert `attachmentExists` is called BEFORE `uploadAttachment`, 0 uploads on
  exists=true, 1 upload on exists=false. Remove the inline `uploadHelper`.
- [ ] **P7.6** Add one `applyPlan` integration test carrying `entry.assets`
  through the Create path; assert `PageBinding.attachmentHashes` is populated
  and the upload count matches (covers the real Create branch; mirror an Update
  + a 409-reapply variant if low-cost).

### F-3 (high) — TC-UNIT-005 root-prefix trick is a false positive
- [ ] **P7.7** Fix TC-UNIT-005: make the evil sibling dir + secret file ACTUALLY
  exist (drop the timestamp mismatch so realpath succeeds), then assert
  Forbidden + 0 reads. The rejection must come from the `rootReal + path.sep`
  prefix check, not a realpath miss.

### F-4 (high) — TC-UNIT-003 URL-encoded traversal is a false positive
- [ ] **P7.8** Fix TC-UNIT-003: `path.resolve` does not URL-decode — either
  replace with a genuinely-decoded traversal fixture (target file exists,
  escapes root after resolution) or, if encoded srcs are reachable from the
  markdown pipeline, add a decode step in the resolver and test it. Remove the
  incorrect "path.resolve will decode" comment.

### F-5 (high) — sha256Hex ignores byteOffset/byteLength
- [ ] **P7.9** Change `sha256Hex` to `crypto.subtle.digest("SHA-256", bytes)`
  (pass the Uint8Array view, not `bytes.buffer`). Add a unit test hashing a
  subarray view (`bigBuffer.subarray(4,8)`) and assert it equals the hash of
  those exact bytes (not the whole slab).

### F-6 (high) — TC-UNIT-009 asset drift missing (P3.5 checked but absent)
- [ ] **P7.10** Add TC-UNIT-009: two `ContentHash` via `buildContentHash`
  differing ONLY in `attachmentHashes` → `classify` returns a state !=
  NO_CHANGE. (CHECKED_BUT_MISSING plan gap for AC-7 / NFR-3.)

### F-7 (medium) — TC-INTEGRATION-006 large-asset + isolation missing
- [ ] **P7.11** Add TC-INTEGRATION-006: two-doc applyPlan — doc A >25 MB asset
  (warning emitted, doc applies), doc B upload returns `TooLarge` (413) → doc B
  blocks, run continues, writes count reflects A only. Requires real
  `uploadAssets` (P7.4).

### F-8 (medium) — >25 MB warning not surfaced
- [ ] **P7.12** Wire the >25 MB warning into `ApplyReport.warnings` /
  `CommandResult.warnings` (thread a warnings sink through `uploadAssets`);
  remove the `console.warn` + TODO. The asset hash must not leak to stderr
  outside the redaction contract (ADR-0011).

### F-9 (medium) — dedup lookup misses distinct src → same file
- [ ] **P7.13** Key the in-doc dedup rewrite lookup by canonical path
  (`Map<canonicalPath, ResolvedAsset>`) so a second node whose src differs but
  resolves to an already-processed file still gets the dedup filename. Add a
  unit test: `image.png` + `./image.png` (or absolute-equivalent) → both nodes
  rewritten to the same filename, 1 artifact.

### F-11 (low) — mock uploadAttachment hardcodes .png
- [ ] **P7.14** Make the mock `uploadAttachment` derive the filename via the
  real `attachmentFilename` (import from `#infra/confluence/attachments`) so the
  mock mirrors production naming and TC-INTEGRATION-005's per-format filename
  assertion is meaningful.

### Re-review gate
- [ ] **P7.15** Run `bun run check` (target 0 fail, no dep violations). Re-run
  `@reviewer` (iteration 2) — every [x] above must be evidenced in code/tests;
  F-1, F-3, F-4, F-5 are release-blocking and must be PASS before DoR/DoD.

---

## Notes for the coder

- **Do NOT edit** `src/infra/confluence/attachments.ts`,
  `src/domain/target/port.ts`, `src/infra/confluence/render/storage.ts`, or
  `src/domain/errors.ts`. They are consumed as-is. If you believe a change is
  required, STOP and surface it to PM (it likely reopens the spec).
- **Path-traversal confinement is the release-blocking AC.** The test suite
  (TC-UNIT-001..006) must prove 0 bytes are read for an escaping path — use an
  injected `readBytes` that records calls, and assert it was never invoked for
  the outside path.
- **Naming is single-authority (DEC-1):** full sha256, `marksync-asset-`
  prefix. The story file's `<first24>` note is superseded.
- **`resolve` may need to be async** (crypto.subtle.digest is async). Update
  the `computePlan` call site to `await` it; `computePlan` is already async.
- **Commit per phase** with Conventional Commit prefixes (`feat(assets):`,
  `feat(safe-publish):`, `test(assets):`, `chore(assets):`). Include `GH-26` in
  each subject. Do NOT commit `.ai/local/pm-context.yaml` (git-ignored).

## Revision Log

- **2026-07-13 — review iter-1 (`@reviewer`):** FAIL. Appended Phase 7
  remediation (P7.1–P7.15). 11 findings (1c/5h/3m/2l). Release-blocking:
  F-1 (SVG naming breaks user images + idempotency), F-3/F-4 (two path-traversal
  AC tests are false positives — pass on non-existent paths, not confinement),
  F-5 (sha256Hex hashes the wrong byte range for sub-array views), F-6 (TC-UNIT-
  009 asset-drift test missing though P3.5 checked). See
  `code-review/review-iter-1.yaml`.
