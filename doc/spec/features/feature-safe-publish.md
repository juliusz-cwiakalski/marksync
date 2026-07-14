---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: SPEC-SAFE-PUBLISH
status: Current
created: 2026-07-06
last_updated: 2026-07-14
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: [GH-18, GH-19, GH-20, GH-22, GH-23, GH-24, GH-25, GH-26, GH-27, GH-62, GH-63, GH-74, GH-76, GH-77]
  decisions: [ADR-0005, ADR-0006, ADR-0010, ADR-0011]
  contracts: []
---

# Feature Specification: Safe Publish Pipeline

> The trust wedge: publish Markdown from Git to Confluence without ever silently
> overwriting remote work.

## 1. Overview

The safe publish pipeline is the core of MarkSync's MS-0002 MVP. It reads
Markdown files from a Git repository, converts them to Confluence Storage Format,
and publishes to Confluence Cloud with document identity, drift detection, and
conflict classification that **refuses to silently overwrite remote work**.

## 2. Business Context

### 2.1 Problem Statement

- **Problem:** Teams manage documentation in Markdown (engineers, AI agents, CI)
  but need it visible on Confluence. Existing tools either require manual
  copy-paste, lose formatting, or lack safety guarantees.
- **Affected Users:** Developers, technical writers, CI pipelines, AI agents.
- **Business Impact:** Without safe automation, teams either don't sync (docs go
  stale) or use unsafe tools (silent data loss).

### 2.2 Goals & Success Metrics

- **Primary Goal:** A Git→Confluence publish that never silently overwrites
  remote work and explains every mutation before applying it.
- **KPIs:**
  - Drift detection effectiveness: 100% (no silent overwrite)
  - Semantic idempotency: second unchanged push writes 0 pages
  - Conflict false-positive rate: <5%

## 3. Functionality

### 3.1 Capabilities

- **Document identity:** immutable UUID v7 in source front-matter
  (`marksync.uuid`); Confluence page ID = remote identity; title/path are
  mutable.
- **Lock file:** a single committed `marksync.lock.yml` at the repo root —
  versioned (`version: 1`) with a per-target `targets:` map of
  `DocumentId → PageBinding`, serialized line-oriented and UUID-ordered so two
  branches adding different documents merge cleanly, and written atomically (temp
  + rename). It is the shared base (last known remote state per document), holds
  no secrets, and survives clones/branches/CI. *(delivered — GH-19)*
- **State primitives:** the disposable `.marksync/{cache,journal,conflicts}/`
  cache (deleting it changes no plan — ADR-0006 C-3), the pure
  `marksync.metadata` content-property cross-check (`reconcileWithProperty` →
  `LockDirty`; `rebuildLockFromConfluence` reconstructs a lost lock), and the
  `sync.allowBranches` branch gate (`ForbiddenBranch` on non-allowed branches).
  *(delivered — GH-19)*
- **Drift detection:** classifies each bound document as `NO_CHANGE` /
  `LOCAL_AHEAD` / `REMOTE_AHEAD` / `DIVERGED` / `REMOTE_MISSING` /
  `LOCAL_MISSING` via a pure three-way `classify({ local?, base, remote })`.
  The classifier keeps two hash domains strictly apart: **local drift**
  compares canonical hashes (`local.canonicalHash !== base.renderedBodyHash`)
  plus title, parent-page-id, and attachment-set facets; **remote drift**
  compares raw hashes (`remote.bodyHash !== base.remoteBodyHash`) — the
  `remoteBodyHash` is the sha256 of the Confluence-stored Storage XHTML,
  refreshed via a post-write fetch-back so Confluence body normalization
  never false-triggers remote drift on an idempotent rerun. *(delivered —
  GH-22; raw-to-raw remote comparison + fetch-back — GH-62)*
- **Safe publish:** create / update / no-op based on drift classification.
  Unsafe overwrites blocked by default. Realized by `computePlan` (pure dry-run)
  + `applyPlan` (parent-first, isolated, journaled write path) at
  `src/app/push-flow.ts` *(delivered — GH-23)*.
- **Local images & attachments:** `AssetResolver` (`src/domain/assets/resolver.ts`)
  walks the rendered HAST for local `img` nodes, resolves each `src` relative to
  the document and **confined to the configured root** (canonicalize via
  `realpath` + prefix check, symlink-aware — release-blocking security gate,
  NFR-SEC-7), reads the bytes, derives MIME from the extension, computes a sha256
  identity, and rewrites the node so the Storage render references the dedup
  filename `marksync-asset-<sha256>.<ext>` (`assetFilename`, `src/domain/assets/naming.ts`).
  Remote (`http(s)`) images are skipped (they render as `<ri:url>`). `computePlan`
  resolves assets per document, populates `ContentHash.attachmentHashes` (so asset
  drift is visible to the classifier), and stashes the `Artifact[]` on the plan
  entry; `applyPlan` uploads each asset after Create/Update unless
  `target.attachmentExists` is true (0 re-uploads on an idempotent rerun,
  NFR-PERF-4) and persists the resulting hashes into `PageBinding.attachmentHashes`.
  *(delivered — GH-26)*
- **Concurrency control:** decentralized optimistic concurrency — Confluence 409
  on stale `version.number` + operation-ID dedup + stale-plan expiry + CI
  concurrency-group templates. Three pure domain gates
  (`assertOperationFresh`/`assertPlanNotExpired`/`decideOnConflict` at
  `src/domain/state/`) are wired into the `applyPlan` write path
  (`src/app/push-flow.ts`): operation-freshness + stale-plan-expiry run before
  each document write, and a 409 re-fetch-once policy on `Conflict` (max 1
  re-fetch + 1 reapply, no loop) with per-document isolation. *(delivered —
  GH-24)*
- **Minimal repair:** `repair-state` for stale locks and interrupted-apply
  journal replay. The append-only journal writer + `replayJournal`
  (`src/app/journal.ts`) is the partial-apply recovery basis *(delivered — GH-23)*.
- **Provenance:** every managed page carries provenance in two channels.
  - **Visible panel** — `buildProvenancePanel(meta)` (`src/infra/confluence/provenance.ts`)
    emits a Confluence Storage XHTML `{info}` macro placed at the page footer
    showing source path, Git revision (head SHA + branch), and last-sync
    timestamp. A stable HTML-comment marker `<!-- marksync:provenance-panel -->`
    (`PROVENANCE_PANEL_MARKER`) is embedded for identification. `appendProvenancePanel`
    (`src/app/push-flow.ts`) appends the panel to the write body only — it is a
    post-render Storage-string append that never enters the HAST, so the drift
    classifier's canonical hash (HAST-derived) excludes it by construction. Two
    syncs of identical content at different times therefore produce the same
    HAST hash → `NO_CHANGE` (no false drift, NFR-PERF-4). The panel is gated by
    `config.provenance.visiblePanel` (default `true`); `Plan.visiblePanel` is set
    in `computePlan` and threaded through `applyPlan`→`processEntry` to the
    Create/Update/reapply write sites (never to the hash).
  - **Machine content property** — `bindingToProperty` writes a 14-field JSON
    string to the `marksync.metadata` content property on every successful sync:
    `schemaVersion, projectId, targetId, documentId, sourcePath, sourceCommit,
    sourceBranch, sourceContentHash, renderedBodyHash, toolVersion,
    synchronizedAt, operationId, commitCount, trimMarker`. The `sourceBranch`,
    `commitCount`, and `trimMarker` fields are optional on `PageBinding` and the
    lock schema for backward-compatible reading. Per ADR-0010 privacy, the
    property stores only `commitCount` + `trimMarker` — never commit subjects
    (subjects appear only in `version.message`, via `formatVersionMessageWithMeta`
    which returns the message + the `trimMarker`).
  - **Direct-edit classification** — `classifyVersion(version): "marksync" | "direct"`
    returns `"marksync"` when `version.message` starts with the `marksync git`
    prefix (`PROVENANCE_PREFIX`), otherwise `"direct"` (NFR-REL-9). Consumed by
    `doctor` and future reverse-sync (MS-0005+) to identify non-MarkSync-authored
    versions. *(delivered — GH-27)*

### 3.2 Key user flows

```
plan → (dry-run diff) → apply → (create/update/no-op/move per document)
```

Each document is processed independently; a failure on one does not block others
(per-document isolation).

### 3.3 Edge cases & error handling

- **Duplicate UUID:** fatal before any write (premortem §5.2).
- **UUID-less discovered document:** a committed discovered document lacking
  `marksync:uuid` is excluded from plan entries and emits one warning per
  document: `{path}: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync`.
  UUID-less documents are not duplicates; identity assignment is never performed
  at plan/sync time (run `marksync init`, commit, then re-sync).
- **Remotely deleted managed page:** never silently re-created; emit warning +
  require explicit `--adopt` or `--rebind`.
- **403 on locked page ID:** warn + skip (page exists but inaccessible); do not
  treat as deleted.
- **Partial apply:** journal-based replay; `repair-state` recovers.
- **Concurrent CI runs:** older plan must not overwrite newer (409 + dedup).

## 4. Technical Architecture

### 4.1 Design

Ports-and-adapters. The sync engine operates on abstract `Document` entities and
a `TargetSystem` port. The Confluence adapter is the sole implementation.

### 4.2 Core components

| Component | Responsibility |
|---|---|
| Markdown pipeline | `parseMarkdown` (`src/domain/markdown/parse.ts`, remark + remark-frontmatter + remark-gfm → `stripCommentNodes` strips comment-only `html` nodes) → MDAST→HAST bridge `mdastToHast` (`src/domain/markdown/mdast-to-hast.ts`) → unsupported-node classifier emitting the pre-existing `UnsupportedConstruct` arm (`src/domain/markdown/unsupported.ts`) → canonicalizer + `contentHash` sha256 (`src/domain/render/canonicalize.ts`) → HAST→Storage XHTML visitor `renderStorage` (`src/infra/confluence/render/storage.ts`, returns `{ body, hash, warnings }`); 33 golden `.md`/`.storage.xhtml` fixture pairs (`tests/golden/fixtures/markdown/`) *(delivered — GH-20; Mermaid render-policy + front-matter stripping — GH-25, GH-63; HTML/link-reference comment stripping — GH-77)*. **Non-rendering-annotation carve-out (no silent drop):** the unsupported-node classifier never silently drops a *rendering* construct (ADR-0005 "do not silently degrade"). Non-rendering annotations — YAML front-matter (GH-63), HTML comments (`<!-- … -->`), and link-reference comments (`[//]: # (…)`) — are stripped at the parse stage (MDAST), before MDAST→HAST conversion, treating sync-to-Confluence as a render step; the same principle as Mermaid SVG comment-stripping for digest stability ([feature-mermaid-rendering.md §3.3 rule 1](./feature-mermaid-rendering.md)). The carve-out is narrow — only **comment-only** raw nodes are removed; a raw node mixing real HTML with a comment, or purely real HTML, keeps its behavior unchanged (block-level → `UnsupportedConstruct: raw-html-block`; inline raw HTML still escaped, GH-20 DEC-4) *(GH-77)* |
| Identity service | UUID v7 assignment, front-matter management |
| State manager | Committed `marksync.lock.yml` load/save/merge (`loadLock`/`saveLock`/`mergeBindings`, `src/app/lock.ts`), disposable `.marksync/` cache layout (`src/app/cache.ts`), pure content-property cross-check (`src/domain/state/reconcile.ts`), branch gate (`assertBranchAllowed`, `src/app/branch.ts`) *(delivered — GH-19)* |
| Drift classifier | Pure `classify({ local?, base?, remote }) → Result<SyncState, MarkSyncError>` three-way classifier (`src/domain/state/classifier.ts`); `ContentHash` VO carrying the canonical-body + title + parent + attachment facets (`src/domain/state/hashes.ts`); six-value `SyncState` enum + `RemoteState` union + `SharedBase` view (`src/domain/state/sync-state.ts`); `SyncState → Action` mapping `NoOp`/`Update`/`Block`/`Skip` (`src/domain/state/actions.ts`) *(delivered — GH-22)* |
| Sync engine | The use-case orchestration that ties the trust wedge together. `computePlan(config, lock, git, target) → Promise<Result<Plan, MarkSyncError>>` is the pure no-writes dry-run: branch gate → discover committed docs via the `Repository` port → **exclude UUID-less docs from entries and emit one warning per document** (`{path}: no marksync:uuid — run 'marksync init' to assign identity, then commit and re-sync`) → duplicate-UUID fatal gate → parse/render/hash via `TargetSystem.renderBody` → resolve cross-page links → **resolve assets** (`AssetResolver`, path-safe, content-addressed) → fetch remote state → classify → emit a reviewable `Plan` (each `PlanEntry` carries `assets?: Artifact[]` and `ContentHash.attachmentHashes`). `applyPlan(plan, target, lock, opts) → Promise<Result<ApplyReport, MarkSyncError>>` is the only write path: parent-first ordering, per-document isolation, journal-before-lock, provenance via `formatVersionMessage` + `formatVersionMessageWithMeta` (message + `trimMarker`), **visible panel injection (`appendProvenancePanel`, gated by `Plan.visiblePanel` from `config.provenance.visiblePanel`; appended to the write body only, never to the HAST hash)**, **full 14-field `marksync.metadata` enrichment via `bindingToProperty` (`sourceBranch`/`commitCount`/`trimMarker`)**, **`classifyVersion` direct-edit predicate**, **per-entry asset upload after Create/Update (reuse-on-exists, `PageBinding.attachmentHashes` replacement — current run's complete set replaces the old set, pruning stale entries; GH-76)**, **post-write fetch-back (GET the page, store `rawHash(fetchedBody)` as `remoteBodyHash` so Confluence normalization does not false-trigger remote drift; falls back to `rawHash(renderedBody)` + warning on failure)**, 409 Conflict surfaced as drift (re-fetch-once policy), atomic lock + `marksync.metadata` per doc. Append-only journal (`.marksync/journal/<run-id>.jsonl`) + `replayJournal` for partial-apply recovery. Modules: `src/app/push-flow.ts`, `src/app/journal.ts`, `src/domain/hierarchy/link-resolver.ts`, `src/domain/git/port.ts`, `src/infra/git/shell-git.ts`, `src/infra/confluence/provenance.ts` *(delivered — GH-23; asset wiring — GH-26; fetch-back — GH-62; provenance panel + property enrichment + classifyVersion — GH-27)* |
| Asset resolver | Path-safe, content-addressed local-image resolution. `AssetResolver` (`src/domain/assets/resolver.ts`, `{ root, readBytes? }` + `resolve(hast, docPath): Promise<Result<AssetSet, MarkSyncError>>`) walks HAST `img` nodes, resolves each local `src` relative to the doc confined to the configured root (`realpath` + prefix check, symlink-aware → `Forbidden(path-traversal)` with 0 bytes read on escape, NFR-SEC-7), sha256-identifies each asset, and rewrites the node to the dedup filename (`assetFilename`, `src/domain/assets/naming.ts` → `marksync-asset-<sha256>.<ext>`); returns an `AssetSet { artifacts, srcMap }`. Remote `http(s)` images are skipped. `computePlan`/`applyPlan` consume it. *(delivered — GH-26)* |
| Concurrency gates | Decentralized optimistic-concurrency backstop for overlapping CI plans. Pure domain gates under `src/domain/state/`: `assertOperationFresh` (operation-ID freshness via UUID-v7 time-prefix comparison) at `operation-freshness.ts`; `assertPlanNotExpired` (stale-plan expiry window, default 15 min, conservative boundary) at `plan-expiry.ts`; `decideOnConflict` + `Decision` (409 re-fetch-once policy: reapply vs block over the `SyncState` matrix) at `conflict-policy.ts`; `uuidV7Timestamp` timestamp extractor at `src/domain/identity/uuid.ts`. Wired into `applyPlan`/`processEntry` with per-document isolation *(delivered — GH-24)* |
| Confluence adapter | `TargetSystem` port implementation (v2/v1 API) |

### 4.3 Key decisions

- **ADR-0005:** Storage Format write target (not ADF).
- **ADR-0006:** UUID v7 + committed lock + disposable cache + decentralized 409
  concurrency (C-5: two overlapping plans never let the older overwrite the
  newer; C-6: no shared coordination service — all exchange lives in Git lock +
  Confluence 409/content properties).
- **ADR-0010:** Squash provenance via `version.message` (compact Git summary).
- **ADR-0011:** `CommandResult<T>` structured output + centralized redaction.

## 5. Acceptance criteria (cross-cutting)

- [ ] **INV-SAFE-1:** No silent overwrite — a `REMOTE_AHEAD`/`DIVERGED`
      document is blocked, never auto-overwritten.
- [ ] **INV-SAFE-2:** A remotely-deleted managed page is never silently
      re-created (`REMOTE_MISSING` blocked without `--adopt`/`--rebind`).
- [ ] **INV-SAFE-3:** Duplicate UUID is fatal before any write.
- [ ] **NFR-REL-5:** Two overlapping CI plans: older must not overwrite newer.
- [ ] **INV-SEC-1:** No credential appears in any output path (logs, plans,
      state, diagnostics, `version.message`, cache).
- [ ] Semantic idempotency: second unchanged push writes 0 pages.
- [ ] **NFR-SEC-7 (path-traversal confinement):** a local image referencing an
      escape vector (relative `..`, absolute, symlink, URL-encoded, nested `..`,
      root-prefix) → `Forbidden(path-traversal)` and **0** bytes are read outside
      the configured root. *(delivered — GH-26)*
- [ ] Asset idempotency (NFR-PERF-4): an unchanged image → `attachmentExists`
      true → **0** attachment uploads; a changed image → new sha256 → upload.
      *(delivered — GH-26)*
- [ ] Drift classification: `NO_CHANGE` / `LOCAL_AHEAD` / `REMOTE_AHEAD` /
      `DIVERGED` / `REMOTE_MISSING` / `LOCAL_MISSING` all correctly detected.

## 6. References

- [ADR-0005](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md)
- [ADR-0006](../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md)
- [ADR-0010](../../decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md)
- [ADR-0011](../../decisions/ADR-0011-cli-output-strategy.md)
- [NFRs](../nonfunctional.md)
- [Roadmap MS-0002](../../overview/02-roadmap.md)
