---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-26
  type: feat
  status: Proposed
  slug: attachments-images
  title: "[MS2-E4-S2] Attachments and images — path-safe content-hashed local-image resolution, reuse-on-unchanged, v1 attachment upload wired into the sync engine"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E4, safe-publish, attachments, security, path-traversal, idempotency]
  version_impact: minor
  audience: internal
  security_impact: high
  risk_level: medium
  dependencies:
    internal: [MS2-E3-S3 (GH-20 markdown pipeline), MS2-E3-S4 (GH-21 Confluence adapter + TargetSystem port + AttachmentService), MS2-E3-S5 (GH-22 drift classifier / ContentHash.attachmentHashes), MS2-E3-S6 (GH-23 sync engine computePlan/applyPlan)]
    external: [Confluence Cloud REST v1 attachment API]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Make local images in Markdown actually appear on Confluence — by discovering image references in the HAST, resolving them **path-safely** (no traversal outside the configured root — a release-blocking security gate), content-hashing each asset so unchanged images are reused (0 re-uploads on an idempotent rerun, NFR-PERF-4), uploading via the already-delivered v1 `AttachmentService`, and rewriting the rendered Storage body so each `<ac:image>` references the hash-derived dedup filename (`marksync-asset-<sha256>.<ext>`). Remote (`http(s)`) images already render as `<ri:url>` and are untouched.

## 1. SUMMARY

This is the **second story of epic MS2-E4 (Features)** — local images & attachments. It delivers:

1. **`AssetResolver`** (`src/domain/assets/resolver.ts`) — a pure-ish domain service that walks the rendered HAST for local `img` nodes, resolves each `src` **relative to the document** and **confined to the configured root** (canonicalize + prefix check, symlink-aware via `realpath`), rejects `../` traversal and symlink escapes with `Forbidden { operation: "path-traversal" }`, reads the bytes, derives the MIME from the extension, computes the sha256 identity, and rewrites the HAST image node so its Storage render carries the hash-derived filename.
2. **Asset naming** (`src/domain/assets/naming.ts`) — the domain-side filename helper, **reconciled** with the existing infra `attachmentFilename()` (DEC-1): the resolver produces an `Artifact { bytes, mime, hash }` carrying the **full** sha256 hex, and reuses the existing infra name derivation `marksync-asset-<hash>.<ext>`. The `<first24(sha256)>` note in the story file is superseded by the already-shipped infra scheme (full hash) to avoid a second, divergent naming authority.
3. **Sync-engine wiring** — `computePlan` resolves assets per document (populating `ContentHash.attachmentHashes` and stashing the `Artifact[]` on the plan entry); `applyPlan` uploads each asset on Create/Update **after** the page write, skipping any asset whose hash already exists on the page (`target.attachmentExists` → 0 writes on reuse), and persists the resulting hashes into `PageBinding.attachmentHashes` so drift classification detects asset changes.
4. **Pipeline integration** — local images render as `<ac:image><ri:attachment ri:filename="marksync-asset-<hash>.<ext>"/></ac:image>` (the existing `imageMacro` already emits this shape; the resolver ensures the filename is the dedup key). Remote images already render as `<ri:url>` — no change.

This story **reuses every preceding contract without redefinition**: the `TargetSystem` port (`uploadAttachment`/`attachmentExists`/`listAttachments` + `Artifact`/`AttachmentRef`), the v1 `AttachmentService` (including the 400 "same file name" → reuse signal and the 413 → `TooLarge` mapping), `computePlan`/`applyPlan`/`PlanEntry`/`PageBinding`/`ContentHash`, and the `imageMacro` renderer. It introduces **no new `MarkSyncError` arms** (`Forbidden { operation }` and `TooLarge` already exist).

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-20 (markdown pipeline) is merged.** `parseMarkdown` → `mdastToHast` produces a HAST whose local image nodes are `element` nodes with `tagName: "img"` and `properties.src` carrying the raw Markdown path. `renderStorage` → `imageMacro(img)` already emits `<ac:image><ri:attachment ri:filename="<basename>"/></ac:image>` for local images and `<ac:image><ri:url ri:value="<src>"/></ac:image>` for `http(s)` images — BUT the local branch uses the **raw `src` basename**, not a content-addressed filename, and the bytes are never uploaded. So a local image that renders in Markdown breaks on Confluence today.
- **GH-21 (Confluence adapter + TargetSystem port) is merged.** The `AttachmentService` (`src/infra/confluence/attachments.ts`) ships `upload(pageId, artifact)`, `exists(pageId, hash)`, and `list(pageId)`. The 400 "Cannot add a new attachment with same file name" response is **already mapped** to the idempotency signal (`resolveExisting` returns the matching `AttachmentRef` so the result is 0 writes). `attachmentFilename(artifact)` produces `marksync-asset-<hash>.<ext>` for binary images and `marksync-mermaid-<hash>.svg` for SVG. The `/data` in-place update path is **intentionally not exposed** — because hash-naming means changed bytes always produce a new filename → a fresh create, never a same-name duplicate. HTTP 413 is mapped to the `TooLarge { pageId, what }` error. The `TargetSystem` port exposes `uploadAttachment`/`attachmentExists`/`listAttachments` and the `Artifact { bytes: Uint8Array; mime: string; hash: string }` / `AttachmentRef { id, pageId, filename, hash, version }` types — all delivered.
- **GH-22 (drift classifier) is merged.** `ContentHash` already carries an `attachmentHashes` facet (the classifier compares attachment sets across local/base/remote), and `buildContentHash` already accepts an `attachmentHashes` input. Today `computePlan` passes `attachmentHashes: {}` (empty) — so asset changes are invisible to drift detection.
- **GH-23 (sync engine) is merged.** `computePlan` (pure dry-run) and `applyPlan` (parent-first, per-document-isolated, journaled write path) are delivered. `PlanEntry` carries `{ uuid, sourcePath, state, action, hashes, renderedBody }`. `PageBinding` already carries an `attachmentHashes` field, plumbed through the classifier `SharedBase` and the lock. The Create and Update paths journal + update the binding + put `marksync.metadata` + save the lock atomically per document — but they perform **no attachment upload**.
- **The MS-0001 spike (H4) validated the v1 attachment API** — the upload endpoint, the 400-duplicate-filename idempotency signal, and the format matrix. The `AttachmentService` implements that contract.
- **No `src/domain/assets/` module exists.** There is no asset resolver, no path-confinement check, and no wiring between image discovery and the attachment upload path.

### 2.2 Pain Points / Gaps

- **Local images are broken on Confluence.** `imageMacro` emits the raw `src` basename as `ri:filename`, but no attachment with that name is ever uploaded, so the image does not render.
- **There is no path-safety gate.** A Markdown doc can reference `../../etc/passwd` (or an absolute path, a symlink that escapes root, a URL-encoded traversal, nested `..`, or a root-prefix trick) and the renderer would happily emit it as an attachment filename. MarkSync reads and uploads arbitrary bytes from the filesystem based on Markdown-authored paths — a path-traversal vulnerability unless confined. There is currently no confinement check.
- **Asset identity is not content-addressed.** Without a content hash, MarkSync cannot tell an unchanged image from a changed one — so it cannot satisfy "unchanged image → no re-upload" (NFR-PERF-4 idempotency for assets) and cannot detect asset drift in the classifier.
- **`computePlan` passes empty `attachmentHashes`.** Asset changes have no effect on the `SyncState`, so changing only an image would classify as `NO_CHANGE` and skip the upload silently.
- **`applyPlan` never uploads attachments.** Even if assets were resolved and hashed, the write path has no upload step.
- **No symlink defense.** Even a naive "reject `..`" check is bypassable via symlinks; confinement must canonicalize real paths (story R1, CEO-resolved).

## 3. PROBLEM STATEMENT

Because there is no asset resolver, no path-confinement gate, no content-addressing of image bytes, and no upload step in the sync engine, a Markdown doc that references a local image renders with a broken `<ri:attachment>` pointing at a non-existent filename on Confluence — and worse, the renderer would willingly emit a path derived from arbitrary Markdown-authored input with no confinement, so a doc referencing `../../etc/passwd` (or a symlink that escapes root) could cause MarkSync to read and upload bytes outside the configured root. Until this story delivers a path-safe `AssetResolver` that confines resolution to the root (rejecting traversal and symlink escapes with `Forbidden { operation: "path-traversal" }`), content-addresses each asset by sha256 so unchanged images are reused and changed images are detected, populates `ContentHash.attachmentHashes` so the classifier sees asset drift, rewrites the rendered body so `<ac:image>` references the `marksync-asset-<hash>.<ext>` dedup filename, and adds an upload step to `applyPlan` that skips assets whose hash already exists on the page (0 writes on reuse, NFR-PERF-4), MS-0002 cannot publish a document that contains a local image — which is a basic, expected capability of a Markdown→wiki publisher.

## 4. GOALS

- **G-1**: Deliver the `AssetResolver` — walk HAST `img` nodes; resolve local `src` relative to the doc, confined to the configured root (canonicalize + prefix check, symlink-aware); reject traversal/escape with `Forbidden { operation: "path-traversal" }`; read bytes, derive MIME, compute sha256; rewrite the HAST node so the Storage render carries the dedup filename (F-1).
- **G-2**: Deliver asset naming reconciled with the existing infra `attachmentFilename()` — the resolver produces `Artifact { hash: fullSha256Hex }` and reuses the shipped `marksync-asset-<hash>.<ext>` scheme (DEC-1).
- **G-3**: Wire `computePlan` — resolve assets per doc; populate `ContentHash.attachmentHashes`; stash `Artifact[]` on the plan entry; the rendered body references the dedup filenames (F-2).
- **G-4**: Wire `applyPlan` — on Create/Update, after the page write, upload each asset unless `target.attachmentExists(pageId, hash)` is true (0 writes on reuse); persist the resulting hashes into `PageBinding.attachmentHashes` (F-3).
- **G-5**: Path-traversal confinement is a release-blocking security gate — multiple escape vectors (relative `..`, absolute paths, symlinks, URL-encoded traversal, nested `..`, root-prefix tricks) are rejected and never read (NFR-SEC-path, §9 NFR mapping note).
- **G-6**: Semantic idempotency extends to assets — a second unchanged push performs 0 attachment uploads (NFR-PERF-4).
- **G-7**: Format coverage — png, jpg, gif, svg, webp all upload and reference correctly.
- **G-8**: `bun run check` green.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| path-traversal confinement (release-blocking) | `../../etc/passwd` (and absolute/symlink/URL-encoded/nested/root-prefix vectors) → `Forbidden(path-traversal)`; **0** bytes read outside root |
| asset reuse (NFR-PERF-4) | unchanged image → `attachmentExists` true → **0** `uploadAttachment` calls (asserted via mock target); changed image → new hash → upload |
| asset drift detection | changing only an image flips the `SyncState` away from `NO_CHANGE` (asserted via the classifier over `attachmentHashes`) |
| pipeline correctness | a doc with a local image → Storage body contains `<ri:attachment ri:filename="marksync-asset-<hash>.<ext>"/>`; the attachment exists after apply |
| remote images | `http(s)` image → `<ri:url>` reference, **0** uploads |
| format coverage | png/jpg/gif/svg/webp all upload + reference correctly |
| large asset handling | >25 MB → warning; HTTP 413 → `TooLarge` per-document block (per-document isolation) |
| no secrets in output (INV-SEC-1 / NFR-SEC-1) | **0** credential/token occurrences in any output path (attachment hashes/filenames, plan JSON, apply report, version.message) |
| quality gate | `bun run check` exits **0** |

### 4.2 Non-Goals

- **NG-1**: Mermaid diagram rendering (E4-S1). The `marksync-mermaid-` filename prefix is **reserved** in `attachmentFilename()` but the mermaid manager is deferred to MS-0003+ per CEO-DEC-1 (GH-25 shipped only the `code` policy). This story does not build a mermaid SVG generator.
- **NG-2**: Remote image caching/proxying. `http(s)` images render as `<ri:url>` and are never downloaded or uploaded.
- **NG-3**: Attachment metadata editing (labels, descriptions). Minimal for MS-0002.
- **NG-4**: A `/data` in-place attachment update path. By design (GH-21), hash-naming means changed bytes always produce a new filename → a fresh create; the `/data` version-bump path is intentionally unreachable.
- **NG-5**: Reimplementing the `AttachmentService`, the `TargetSystem` port, `Artifact`/`AttachmentRef`, or `imageMacro`. All are reused as-is.
- **NG-6**: New `MarkSyncError` arms. `Forbidden { operation }` and `TooLarge { pageId, what }` already exist.
- **NG-7**: Asset de-duplication across pages. An asset is scoped to the page it appears on (Confluence attachments are per-page). Cross-page reuse is a future concern.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | `AssetResolver` (path-safe, content-addressed) | Walk HAST `img` nodes; resolve local `src` relative to the doc, confined to the configured root; reject traversal/symlink escapes → `Forbidden(path-traversal)`; sha256-identify; rewrite the HAST node with the dedup filename. The security gate + the dedup-key producer. |
| F-2 | `computePlan` asset wiring | Resolve assets per document; populate `ContentHash.attachmentHashes`; stash `Artifact[]` on `PlanEntry`; the rendered body references the dedup filenames. Makes asset drift visible to the classifier. |
| F-3 | `applyPlan` upload wiring | On Create/Update, after the page write, upload each asset unless it already exists (`attachmentExists` → skip, 0 writes); persist hashes into `PageBinding.attachmentHashes`. |
| F-4 | Asset naming (reconciled) | Domain filename helper consistent with the existing infra `attachmentFilename()` — full sha256 hash, `marksync-asset-<hash>.<ext>` (DEC-1). |
| F-5 | MIME / format coverage | Derive MIME from the extension; support png/jpg/gif/svg/webp (the formats Confluence accepts). |

### 5.1 Capability Details

- **F-1 (`AssetResolver`).** A service at `src/domain/assets/resolver.ts`, constructed with `{ root: string; readBytes: (absPath: string) => Uint8Array }` (the `readBytes` hook is injectable for unit tests; the production default uses `node:fs.realpath` + `readFileSync`, so confinement is evaluated on canonical paths). It exposes `resolve(hast, docPath): Result<AssetSet, MarkSyncError>`. For each HAST `element` node with `tagName === "img"` whose `properties.src` is a string:
  - If `src` starts with `http://` or `https://` → **skip** (remote; renders as `<ri:url>`; no upload).
  - Otherwise treat `src` as a local path: resolve it **relative to the document's directory** (`path.resolve(path.dirname(docPath), src)`), then **confine**:
    1. Compute the canonical root: `fs.realpath(root)`.
    2. Compute the canonical target: `fs.realpath(resolved)` (this resolves symlinks — story R1, CEO-resolved).
    3. Assert the canonical target is **within** the canonical root (the canonical target equals the root OR starts with `root + path.sep`). If not → `Result.err({ kind: "Forbidden", operation: "path-traversal", ... })`. **No bytes are read** on a confinement failure.
  - On confinement success: read the bytes via `readBytes(canonicalTarget)`, derive the MIME from the extension (png/jpg/jpeg/gif/svg/webp → the corresponding `image/*`; unknown → `application/octet-stream`), compute `hash = sha256(bytes)` as a lowercase hex string (via `crypto.subtle` — no crypto lib), build the `Artifact { bytes, mime, hash }`, and **rewrite the HAST node**: set `properties.src` to the dedup filename `marksync-asset-<hash>.<ext>` (produced via the naming helper) so the subsequent `renderStorage` → `imageMacro` emits the correct `<ri:attachment ri:filename="...">`. Preserve `properties.alt` (rendered as `ac:alt`).
  - The resolver returns an `AssetSet { artifacts: Artifact[]; srcMap: Map<originalSrc, ResolvedAsset> }` where `ResolvedAsset = { filename, hash, mime, canonicalPath }`.
  - Repeated references to the same image within one doc produce one `Artifact` (deduped by canonical path / hash) and rewrite both nodes to the same filename.
  - The resolver is deterministic: same HAST + same bytes → same `AssetSet`.

- **F-2 (`computePlan` asset wiring).** In `computePlan`, after `mdastToHast` and **before** `target.renderBody`, call `assetResolver.resolve(hast, docPath)`:
  - On `Forbidden(path-traversal)` → return the error from `computePlan` (a security failure aborts the plan; it is not a per-doc skip).
  - On success → the HAST now carries the dedup filenames; `renderBody` then emits the correct `<ri:attachment>` bodies. Populate `ContentHash.attachmentHashes` from the `AssetSet` (a stable mapping, e.g. `Record<filename, hash>` — match the shape the existing `ContentHash`/classifier consumes). Stash `AssetSet.artifacts` on the `PlanEntry` (new optional field `assets?: Artifact[]`) so `applyPlan` can upload them.

- **F-3 (`applyPlan` upload wiring).** In `applyPlan`, for a `Create` or `Update` action, **after** the page create/update succeeds (so the page exists to attach to), for each `Artifact` in `entry.assets`:
  1. `const found = await target.attachmentExists(pageId, artifact.hash)` — if `!found.ok` → per-document block (per-document isolation; surface the transport error).
  2. If `found.value === true` → **skip** the upload (0 writes — reuse; NFR-PERF-4).
  3. If `found.value === false` → `await target.uploadAttachment(pageId, artifact)` — on `TooLarge` (HTTP 413) → per-document block; on other `MarkSyncError` → per-document block; on success → record the `AttachmentRef`.
  4. Collect the resulting `{ filename → hash }` map into the binding's `attachmentHashes` (the binding is already updated + journaled + saved by the existing Create/Update path; the asset hashes join it so the next classify sees them).
  - The upload step is journaled as part of the per-document mutation (the existing journal records `op: "create" | "update"`; asset uploads are sub-operations of the page mutation — they do not get their own journal `op` for MS-0002, consistent with the existing journal schema DM-4).
  - On a `NoOp`/`Skip`/`Block` → no upload (0 writes).

- **F-4 (Asset naming, DEC-1).** `src/domain/assets/naming.ts` exports a domain helper that produces `marksync-asset-<hash>.<ext>` from `{ hash, mime }` — **identical** to the existing infra `attachmentFilename()` for non-SVG assets. The resolver uses this helper to compute the filename it writes into the HAST, and the infra `AttachmentService` independently derives the same filename from the `Artifact` at upload time — the two must agree byte-for-byte (an invariant test asserts it). SVG uses the `marksync-mermaid-` prefix in the infra (reserved for E4-S1); for user-authored `.svg` images this story maps svg to `marksync-asset-` to keep user assets and (future) mermaid assets in separate namespaces — **specify this explicitly in the plan** and assert via the invariant test. (If the infra `attachmentFilename` cannot be changed without affecting the reserved mermaid path, the domain helper is the sole authority for the HAST rewrite and the infra is left as-is; the test asserts they agree for non-SVG.)

- **F-5 (MIME / format coverage).** The resolver maps extensions to MIMEs: `.png → image/png`, `.jpg/.jpeg → image/jpeg`, `.gif → image/gif`, `.svg → image/svg+xml`, `.webp → image/webp`. The format matrix (png/jpg/gif/svg/webp) is covered by integration tests that assert each uploads and renders the correct `<ri:attachment>` filename with the right extension.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — computePlan with a local image (the `marksync plan` path):
  for each discovered doc:
    parseMarkdown(bytes) → mdastToHast → hast
    assetResolver.resolve(hast, docPath):
      for each local img node:
        resolve src relative to doc dir → confine to root (realpath + prefix) →
          on escape → err(Forbidden path-traversal) → computePlan returns the error
        readBytes → sha256 → Artifact{bytes,mime,hash} → rewrite node.src = marksync-asset-<hash>.<ext>
      → AssetSet{artifacts, srcMap}
    target.renderBody(hast) → { body (now references dedup filenames), hash, warnings }
    buildContentHash({ ..., attachmentHashes: filename→hash from AssetSet }) → ContentHash
    entry.assets = AssetSet.artifacts
  → Plan emitted; 0 writes.

Flow 2 — applyPlan Create with a local image:
  target.createPage(...) → Page (page now exists)
  for each artifact in entry.assets:
    target.attachmentExists(pageId, hash)?
      true  → skip (reuse — 0 writes)
      false → target.uploadAttachment(pageId, artifact) → AttachmentRef
            → on TooLarge → per-doc block
  binding.attachmentHashes = { filename→hash }
  journal{op:"create"} → saveLock → putProperty   (existing path, now carrying asset hashes)

Flow 3 — Idempotent rerun (NFR-PERF-4, asset reuse):
  second push, image unchanged:
    resolver produces the same hash → same filename → same attachmentHashes
    classify → NO_CHANGE → NoOp → applyPlan skips → 0 writes, 0 uploads

Flow 4 — Image changed:
  bytes differ → new sha256 → new filename → attachmentHashes differ
    classify → LOCAL_AHEAD → Update
    applyPlan: attachmentExists(newHash)? false → uploadAttachment (new file)
    (old attachment remains on the page; Confluence keeps both — acceptable for MS-0002)

Flow 5 — Path traversal attempt (security gate):
  doc references ![](../../etc/passwd)
    resolve → realpath escapes root → Forbidden{operation:"path-traversal"}
    computePlan returns the error → 0 bytes read, 0 writes

Flow 6 — Remote image:
  ![](https://cdn/example.png) → resolver skips (http) → imageMacro emits <ri:url> → 0 uploads
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- `AssetResolver` at `src/domain/assets/resolver.ts` — path-safe (root-confined, symlink-aware), content-addressed (sha256), HAST-rewriting (F-1).
- Asset naming at `src/domain/assets/naming.ts` — reconciled with infra `attachmentFilename()` (F-4, DEC-1).
- `computePlan` wiring — resolve per doc; populate `ContentHash.attachmentHashes`; stash `Artifact[]` on `PlanEntry` (F-2).
- `applyPlan` wiring — upload-on-missing after Create/Update; reuse-on-exists; persist hashes into `PageBinding.attachmentHashes` (F-3).
- MIME derivation + format matrix (png/jpg/gif/svg/webp) (F-5).
- Path-traversal confinement (release-blocking security gate) — relative `..`, absolute, symlink, URL-encoded, nested `..`, root-prefix vectors (G-5).
- Unit tests: path-traversal vectors, naming determinism + infra-agreement invariant, hash stability, MIME map.
- Integration tests: resolver + mock target upload/reuse/update cycle; format matrix; remote-url pass-through; >25 MB warning + 413 → `TooLarge` per-doc block; asset drift flips `SyncState`.

### 7.2 Out of Scope

- [OUT] Mermaid diagram rendering (E4-S1 — NG-1). The `marksync-mermaid-` prefix is reserved; the manager is deferred to MS-0003+ (CEO-DEC-1).
- [OUT] Remote image caching/proxying (NG-2).
- [OUT] Attachment metadata editing — labels, descriptions (NG-3).
- [OUT] The `/data` in-place attachment update path (NG-4 — unreachable by design).
- [OUT] Reimplementing `AttachmentService`, the `TargetSystem` port, `Artifact`/`AttachmentRef`, or `imageMacro` (NG-5).
- [OUT] New `MarkSyncError` arms (NG-6).
- [OUT] Cross-page asset de-duplication (NG-7).

### 7.3 Deferred / Maybe-Later

- **Cross-page asset reuse** — an asset referenced by multiple pages is uploaded once per page today; a shared-asset pool is a future concern.
- **Attachment GC** — stale attachments (referenced by an old version but no longer in the doc) are not deleted for MS-0002; Confluence retains history. A cleanup pass is deferred.
- **E2E live-sandbox image upload** — covered by E5-S1 (the story's test matrix defers E2E to E5-S1).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — the resolver issues no HTTP calls. All attachment HTTP flows through the existing `TargetSystem` port (`uploadAttachment`/`attachmentExists`/`listAttachments`) whose `AttachmentService` (GH-21) owns the v1 REST surface, the 400-duplicate-filename reuse signal, and the 413 → `TooLarge` mapping.

### 8.2 Events / Messages

No event bus. The conceptual **Asset Resolved** and **Asset Uploaded / Reused** signals are realized as typed values in the `AssetSet` and the `ApplyReport` (via the existing per-entry outcomes), surfaced through the established `CommandResult` contract. No new journal `op` (asset uploads are sub-operations of the page create/update mutation, consistent with DM-4).

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `AssetResolver` (NEW, domain/assets) | `{ root, readBytes }` + `resolve(hast, docPath): Result<AssetSet, MarkSyncError>`. Symlink-aware root confinement; sha256 identity; HAST rewrite. |
| DM-2 | `AssetSet` (NEW, domain/assets) | `{ artifacts: Artifact[]; srcMap: Map<string, ResolvedAsset> }` where `ResolvedAsset = { filename; hash; mime; canonicalPath }`. |
| DM-3 | `PlanEntry.assets` (NEW optional field, app/push-flow) | `assets?: Artifact[]` — the resolved artifacts for `applyPlan` to upload. Optional ⇒ existing callers/tests unaffected. |
| DM-4 | `ContentHash.attachmentHashes` (POPULATED) | Already exists (GH-22); this story populates it from the `AssetSet` instead of passing `{}`. No type change. |
| DM-5 | `PageBinding.attachmentHashes` (POPULATED) | Already exists (GH-19); this story persists the uploaded-asset hashes into it on Create/Update. No type change. |
| DM-6 | Asset naming helper (NEW, domain/assets/naming.ts) | `assetFilename({ hash, mime }): string` → `marksync-asset-<hash>.<ext>`. Must agree with infra `attachmentFilename()` for non-SVG (invariant test). |
| DM-7 | Error model — **no change** | Path-traversal → existing `Forbidden { operation: "path-traversal" }`; oversize → existing `TooLarge { pageId, what }`. No new arms. |

### 8.4 External Integrations

- **Confluence Cloud REST v1 attachment API** — accessed exclusively through the existing `TargetSystem` port. This story adds `uploadAttachment`/`attachmentExists` call sites in `applyPlan`; no new endpoints, no direct REST.
- **Local filesystem** — the resolver reads image bytes via `node:fs` (canonical `realpath` + `readFileSync`), confined to the configured root. No writes to the filesystem.

### 8.5 Backward Compatibility

N/A for released artifacts (MS-0002 is pre-release). This story is **additive**: a new domain module (`src/domain/assets/`), one optional `PlanEntry` field (`assets?`), and two new call sites in `computePlan`/`applyPlan`. The `TargetSystem` port, `AttachmentService`, `imageMacro`, `ContentHash`, `PageBinding`, and the `MarkSyncError` union are **unchanged**. The `attachmentFilename()`/`assetFilename()` agreement is enforced by an invariant test (DEC-1).

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | path-traversal confinement (release-blocking security gate) | `../../etc/passwd` + absolute/symlink/URL-encoded/nested/root-prefix vectors → `Forbidden(path-traversal)`; **0** bytes read outside root |
| NFR-2 | asset reuse / idempotency (NFR-PERF-4) | unchanged image → `attachmentExists` true → **0** `uploadAttachment` calls (asserted via mock target) |
| NFR-3 | asset drift detection | changing only an image flips the `SyncState` away from `NO_CHANGE` (classifier over `attachmentHashes`) |
| NFR-4 | symlink defense (story R1, CEO-resolved) | a symlink whose target escapes root → `Forbidden(path-traversal)` (realpath evaluated before the prefix check) |
| NFR-5 | large-asset handling (story Q1, CEO-resolved) | >25 MB → warning; HTTP 413 → `TooLarge` per-document block (per-document isolation; not a fatal abort) |
| NFR-6 | no secrets in output (INV-SEC-1 / NFR-SEC-1) | **0** credential/token occurrences in any output path (attachment hashes/filenames, plan JSON, apply report, version.message) — attachment filenames carry only the content hash + extension |
| NFR-7 | format coverage | png/jpg/gif/svg/webp upload + reference correctly |
| NFR-8 | determinism | same HAST + same bytes → same `AssetSet` (sha256 identity; stable filename) |
| NFR-9 | per-document isolation (carry-over) | a `TooLarge`/transport error on one doc's asset → that doc blocks; the run continues for others |
| NFR-10 | naming-agreement invariant (DEC-1) | the domain `assetFilename()` and the infra `attachmentFilename()` agree for non-SVG assets (invariant test) |
| NFR-11 | quality gate | `bun run check` exits **0** |

### NFR mapping note (PM DOC-1 — for `@doc-syncer` phase 7)

The story file's `cross_cutting` cites **NFR-SEC-5** for path-safety, but NFR-SEC-5 in `doc/spec/nonfunctional.md` is "Converter injection safety" (macro injection), **not** path traversal. Path-traversal confinement is a release-blocking security gate but currently has **no explicit NFR ID** in the system spec. This spec cites it as a standalone release-blocking requirement (NFR-1/NFR-4 above) referencing the security baseline (`doc/guides/security-baseline.md`) and the NFR-SEC family. `@doc-syncer` should reconcile the system spec in phase 7 — either add a path-safety NFR row (e.g. NFR-SEC-7 "Path-traversal confinement") or map it explicitly — and correct the story file's NFR-SEC-5 citation. This is non-blocking for delivery.

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry (NFR-SEC-3). Observability is structural:

- **`CommandResult<Plan>` / `CommandResult<ApplyReport>`** — unchanged envelope; the apply report's per-entry outcomes now reflect asset-upload blocks (`TooLarge`) via the existing `error` field.
- **Attachment filenames as provenance** — `marksync-asset-<sha256>.<ext>` is a content-addressed, reviewable dedup key visible in the rendered Storage body and the Confluence attachment list. It carries no secrets (only the content hash).
- **Plan JSON** — `PlanEntry.assets` (when present) makes the resolved asset set reviewable in the dry-run plan before any write (plan-before-write, NFR-OBS-5).

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Path-traversal: a crafted `src` reads/uploads bytes outside root (release-blocking) | H | M | Canonicalize both root and target via `realpath` (resolves symlinks — story R1); prefix check before any read; on escape → `Forbidden(path-traversal)` with **0** bytes read; AC asserts multiple vectors. | L |
| RSK-2 | Symlink escape bypasses a naive `..` check (story R1) | H | M | `realpath` the target before the prefix check; reject if the canonical target escapes root. AC asserts a symlink-escaping fixture. | L |
| RSK-3 | Asset reuse leaks: unchanged image is re-uploaded every run (NFR-PERF-4) | M | M | `attachmentExists(pageId, hash)` gate before upload; AC asserts 0 `uploadAttachment` calls on reuse via mock target. | L |
| RSK-4 | Asset drift is invisible (changing only an image classifies `NO_CHANGE`) | M | M | Populate `ContentHash.attachmentHashes` from the resolver; AC asserts a changed-only-image flips `SyncState`. | L |
| RSK-5 | Domain and infra naming diverge → HAST filename ≠ uploaded filename (broken image) | H | L | DEC-1: resolver produces full-sha256 `Artifact` and reuses infra scheme; invariant test asserts `assetFilename()` === infra `attachmentFilename()` for non-SVG. | L |
| RSK-6 | A credential leaks into an attachment filename/hash/output (INV-SEC-1) | H | L | Filenames carry only the content hash + extension; hashes are sha256 of image bytes (never of credential-bearing content); redaction layer (ADR-0011) covers output paths. | L |
| RSK-7 | Large asset aborts the whole run instead of one doc (per-document isolation) | M | L | `TooLarge` (HTTP 413) → per-document block; the run continues; AC asserts isolation. >25 MB → warning (not fatal). | L |
| RSK-8 | SVG namespace collision with reserved mermaid prefix | M | L | User-authored `.svg` maps to `marksync-asset-`; the `marksync-mermaid-` prefix stays reserved for E4-S1. Invariant test + explicit plan note. | L |

## 12. ASSUMPTIONS

- The configured **content root** is the directory from which the `select` globs resolve (the project content root). Image paths are resolved relative to each document's directory and confined to that root. (Exact config field wired by the plan/coder.)
- ADR-0005 (Storage Format) and ADR-0006 (state model) are settled. The `imageMacro` renderer (ADR-0005) and the `ContentHash.attachmentHashes`/`PageBinding.attachmentHashes` facets (ADR-0006) are the integration surfaces.
- GH-20, GH-21, GH-22, GH-23 are merged and their contracts are stable; this story consumes them as-is.
- Confluence accepts png/jpg/gif/svg/webp attachments via the v1 API (validated by the MS-0001 spike H4).
- Hash-naming makes `/data` in-place update unreachable by design (GH-21); changed assets are always fresh creates. This is accepted for MS-0002.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E3-S3 (GH-20 markdown pipeline) | `mdastToHast` HAST with `img` nodes; `imageMacro` renderer. Merged. |
| Depends on | MS2-E3-S4 (GH-21 Confluence adapter) | `AttachmentService` (upload/exists/list + 400→reuse + 413→TooLarge), `attachmentFilename()`, `TargetSystem` port, `Artifact`/`AttachmentRef`. Merged. |
| Depends on | MS2-E3-S5 (GH-22 drift classifier) | `ContentHash.attachmentHashes` facet. Merged. |
| Depends on | MS2-E3-S6 (GH-23 sync engine) | `computePlan`/`applyPlan`/`PlanEntry`/`PageBinding`. Merged. |
| Depends on | ADR-0005 | Storage Format write target (the `<ac:image>`/`<ri:attachment>`/`<ri:url>` shapes). |
| Depends on | ADR-0006 | State model — `attachmentHashes` as a drift facet. |
| Reuses | `CommandResult<T>` / `MarkSyncError` (GH-14..GH-21) | `Forbidden { operation }`, `TooLarge`. No new arms. |
| Blocks | E5-S1 (BDD + E2E) | Live-sandbox image upload + reuse is an E5-S1 E2E scenario. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Exact config field for the content root | The resolver is "rooted at the configured content root". The precise `config.*` field (e.g. `config.content.root` vs the directory of `config.select`) is wired by the plan/coder against the existing `ProjectConfig` shape. Non-blocking — the requirement (confine to the content root) is unambiguous. | Open (non-blocking; resolved at planning) |

## 15. ACCEPTANCE CRITERIA

Each AC is testable and traces to a story AC + NFR.

- **AC-1 (path safety, story AC + NFR-1/NFR-4):** A Markdown doc referencing `../../etc/passwd` (and a fixture suite covering: relative `..`, absolute paths, symlink-escape, URL-encoded traversal, nested `..`, root-prefix tricks) → `computePlan` returns `Forbidden { operation: "path-traversal" }`; **0** bytes are read outside the root (assert the file-read hook is never invoked for an escaping path).
- **AC-2 (reuse / idempotency, story AC + NFR-2):** An unchanged image → `target.attachmentExists(pageId, hash)` returns true → **0** `uploadAttachment` calls (assert via a mock target call counter); a changed image → new hash → `uploadAttachment` is called.
- **AC-3 (update on change, story AC + NG-4):** Same logical image, changed bytes → new sha256 → new filename → a fresh create (the `/data` path is intentionally unreachable by design — confirm in a test that no `/data` call is made).
- **AC-4 (format coverage, story AC + NFR-7):** png, jpg, gif, svg, webp each upload and render the correct `<ri:attachment ri:filename="marksync-asset-<hash>.<ext>"/>` with the right extension.
- **AC-5 (remote image, story AC):** An `http(s)` image → `<ac:image><ri:url ri:value="..."/></ac:image>` in the Storage body; **0** uploads.
- **AC-6 (pipeline integration, story AC):** A doc with a local image → the Storage body contains `<ri:attachment ri:filename="marksync-asset-<hash>.<ext>"/>`; after `applyPlan`, the attachment exists on the page (assert via the mock/real target's attachment list).
- **AC-7 (asset drift detection, NFR-3):** Changing only an image (body text unchanged) flips the `SyncState` away from `NO_CHANGE` (assert via the classifier over the populated `attachmentHashes`).
- **AC-8 (naming-agreement invariant, DEC-1/NFR-10):** The domain `assetFilename({ hash, mime })` and the infra `attachmentFilename(artifact)` produce identical strings for non-SVG assets.
- **AC-9 (large-asset handling, story Q1 + NFR-5):** An asset >25 MB emits a warning; an HTTP 413 from the target → `TooLarge` and the doc blocks while the run continues (per-document isolation).
- **AC-10 (no secrets in output, INV-SEC-1/NFR-SEC-1):** **0** credential/token occurrences in the rendered body, attachment filenames, plan JSON, apply report, or `version.message`.
- **AC-11 (quality gate):** `bun run check` exits **0**.

## 16. REFERENCES

- [Story MS2-E4-S2](../../planning/milestones/MS-2/MS2-E4--features/MS2-E4-S2--attachments-images.md)
- [Feature spec — safe publish](../../spec/features/feature-safe-publish.md)
- [NFRs](../../spec/nonfunctional.md)
- [Security baseline](../../guides/security-baseline.md)
- [ADR-0005 — Storage Format](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md)
- [ADR-0006 — document identity & shared base](../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md)
- [ADR-0010 — provenance](../../decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md)
- [ADR-0011 — CLI output strategy](../../decisions/ADR-0011-cli-output-strategy.md)
- [Testing strategy](../../../.ai/rules/testing-strategy.md)
