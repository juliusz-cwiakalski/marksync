---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/ubiquitous-language-template.md
ados_distribution: redistributable
id: UBIQUITOUS-LANGUAGE
status: Draft
created: 2026-07-05
last_updated: 2026-07-13
owners: [Juliusz Ćwiąkalski]
area: domain
document_classification: current-truth
links:
  related_decisions: [ADR-0005, ADR-0006, ADR-0010, ADR-0011, PDR-0001, TDR-0003]
  related_changes: [GH-15, GH-17, GH-18, GH-19, GH-20, GH-21, GH-22, GH-23, GH-24, GH-26]
  summary: "Ubiquitous language — the precise, bounded-context vocabulary binding domain concepts to code for MarkSync's Markdown-to-TargetSystem synchronization domain."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Ubiquitous Language

_The authoritative, binding vocabulary for MarkSync's synchronization bounded
context. Names core domain concepts (aggregates, entities, value objects, domain
events) and their relationships. Distinct from the reader-friendly
[glossary](glossary.md) (see Documentation Handbook §9)._

## Bounded context scope

- **Context:** Markdown-to-TargetSystem Synchronization ("MarkSync Core")
- **Boundaries:**
  - **In scope:** document identity, source-side document model, target-system
    page model, shared-base state, sync-state classification, plan/apply
    orchestration, drift detection, concurrency control, provenance, push flow,
    reverse-conversion interface, repository-owned configuration (`marksync.yml`).
  - **Out of scope (neighbouring contexts):** Confluence REST API specifics
    (isolated behind `ConfluenceClient` adapter — see context map); Git plumbing
    (isolated behind `Repository` port); Mermaid rendering mechanics (isolated
    behind `Renderer` port); CLI presentation/output formatting (presentation
    tier).

## Terms

### Aggregates

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Document Identity** | The immutable, source-side identity of a managed document: a UUID v7 in front-matter. Survives clones, branches, CI, and title/path changes. Duplicate identities are fatal before any write (INV-SAFE-3). Aggregate logic lives in `src/domain/identity/` — `generateUuidV7`, `DocumentId`/`parseDocumentId`, `injectUuid`/`readUuid` (front-matter binding), `detectDuplicateUuids`. | Aggregate root | 1:1 → Source Document; 1:1 → Page Binding |
| **Managed Document** | A source Markdown file that MarkSync tracks and synchronizes. Has a Document Identity, a source path, content (Markdown AST), and a position in the hierarchy. | Aggregate | 1:1 → Document Identity; 1:1 → Source Document; 0..1 → Page Binding |

### Entities

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Source Document** | The Markdown file as read from a committed Git revision. Has: front-matter (including UUID), MDAST content, resolved assets, and a relative path within the configured root. | Entity (within Managed Document) | belongs to → Managed Document |
| **Page Binding** | The durable mapping between a Document Identity and a target-system page. Records: page ID, parent page ID, last-known remote version, content hashes, and the shared-base snapshot. Code construct: the `PageBinding` interface (`src/domain/binding/page-binding.ts`) — landed as a type with identity-binding semantics (GH-18); first-persisted into the committed lock by GH-19 (`src/app/lock.ts`). | Entity (within Document Identity) | 1:1 → Target Page; 1:1 → Shared Base |
| **Target Page** | The remote page as seen from the target system. Has: page ID, title, version number, optional body representation (Storage/ADF), content properties, and attachments. Exposed through the port as the `Page` value object `{ id; title; version; body? }` (`src/domain/target/port.ts`). | Entity (behind TargetSystem port) | belongs to → Page Binding; has → Content Properties |
| **Shared Base** | The agreed "last published" snapshot for a document: body hash, attachment hashes, version number, and provenance commit. Stored in the committed lock (`marksync.lock.yml`, `src/app/lock.ts`); enables drift detection by comparison with current Source Document and Target Page. | Entity (within Page Binding) | belongs to → Page Binding |

### Value Objects

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Sync State** | The classification of a document relative to local/base/remote. Values: `NO_CHANGE`, `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING`. Determined by the state classifier from three-way comparison. | Value object (enum) | produced by → State Classifier |
| **Body Representation** | The concrete format of a page body: Confluence Storage Format (XHTML + `ac:`/`ri:`) or ADF. MarkSync writes Storage (ADR-0005); reverse conversion reads either. For page bodies the Storage XHTML is produced by the `renderStorage` HAST→Storage visitor (`src/infra/confluence/render/storage.ts`) as the `body` field of its `RenderedBody` payload (`{ body, hash, warnings }`) *(delivered — GH-20)*. | Value object | emitted by → Target System |
| **Content Hash** | A deterministic hash of a document or asset body. Used for idempotency detection: if local hash equals shared-base hash, the document is unchanged. Computed from canonical + normalized content. For page bodies, realized by `contentHash(canonicalHast): string` in `src/domain/render/canonicalize.ts` — a raw lowercase-hex `sha256` digest over `canonicalize(hast)` (a position-free, property-sorted canonical HAST, so attribute order and source positions never perturb the digest). First-produced by GH-20; consumed by drift detection (E3-S5 `renderedBodyHash`) and Mermaid/attachment dedup (E4-S1/E4-S2). The function returns the raw digest only; any wire-format prefix (e.g. `sha256:`) is the binding consumer's concern (E3-S5), not the hash function's. That consumer is delivered: the `ContentHash` value object (`src/domain/state/hashes.ts`, GH-22) is the local-document snapshot the drift classifier compares — its `canonicalHash` field delegates to this digest and prepends the `sha256:` prefix (the comparison basis), while `rawHash` (raw source bytes) is informational only, `attachmentHash` is a deterministic digest over the sorted attachment set, and `title` + `parentPageId` are the identity facets whose drift (with an identical body) is still `LOCAL_AHEAD`. | Value object (string) | computed from → Source Document / Target Page |
| **RemoteState** | The adapter-agnostic shape of a target page as supplied to the State Classifier by the sync engine: `{ kind: "present"; bodyHash; version; title?; parentPageId? }` \| `{ kind: "missing" }` \| `{ kind: "forbidden"; pageId }` (`src/domain/state/sync-state.ts`, GH-22). `forbidden` is an access condition, **not** a sync state — it surfaces as `err(Forbidden)` so the engine warns + skips without deleting/recreating. The engine builds it from the `TargetSystem` port (200 → present; 404 → missing; 403 → forbidden). | Value object (discriminated union) | input to → State Classifier |
| **AssetSet** | The resolved-asset result returned by the Asset Resolver: `{ artifacts: Artifact[]; srcMap: Map<originalSrc, ResolvedAsset> }` where `ResolvedAsset = { filename; hash; mime; canonicalPath }` (`src/domain/assets/resolver.ts`, GH-26). The artifacts are uploaded by `applyPlan`; `filename` is the `marksync-asset-<sha256>.<ext>` dedup key written into the rendered body; repeated references to the same image within a doc produce one artifact (deduped by canonical path). | Value object | produced by → Asset Resolver |
| **Action** | The write decision the sync engine acts on, mapped from a `SyncState` by `actionFor` (`src/domain/state/actions.ts`, GH-22): `NoOp` (`NO_CHANGE`), `Update` (`LOCAL_AHEAD`), `Block(MarkSyncError)` (`REMOTE_AHEAD`/`DIVERGED` → `Conflict`; `REMOTE_MISSING` → `RemoteMissing`), `Skip` (`LOCAL_MISSING`, warn). The engine honors every `Block`; `--adopt`/`--rebind` overrides are wired downstream, never in the classifier. | Value object (discriminated union) | produced by → State Classifier |
| **DocumentId** | The branded value object (`string & { __brand: "DocumentId" }`, `src/domain/identity/document-id.ts`) carrying a UUID v7 — the canonical identity value of a Document Identity. Constructed only via `generateUuidV7()` (which brands) or `parseDocumentId(s)` (which validates v7 first, returning `Result<DocumentId, DocumentIdError>`). A plain `string` cannot stand where a `DocumentId` is required. | Value object (branded string) | member of → Document Identity; stored at → `marksync.uuid` |
| **Provenance** | The source-path + Git-revision + last-sync metadata. Appears both as machine content-property (`marksync.metadata`) and human-visible panel/footer. Written into `version.message` on each Confluence page version (ADR-0010). | Value object | attached to → Target Page |
| **Operation ID** | A unique per-run identifier (`op_<runId>`, where `runId` is a UUID v7) used for decentralized concurrency dedup. Each plan carries one; the remote `marksync.metadata` content property records the last-applied operation ID. The pure gate `assertOperationFresh` (`src/domain/state/operation-freshness.ts`, GH-24) compares the plan's operation id against the remote via the embedded UUID-v7 time prefix — if the remote is strictly newer, the plan is stale → `StalePlan` (no write). Defense in depth: Confluence's server-enforced 409 on `version.number` backstops any clock skew. | Value object (string) | scoped to → Run |
| **StalePlan** | The concurrency-block arm (`kind: "StalePlan"`) of `MarkSyncError`: a plan aborted before writing because it is stale or expired. Produced in two cases — operation-ID staleness (the remote `marksync.metadata.operationId` records a newer operation; `expiredAt: ""`) and plan-window expiry (the plan's age exceeds `sync.stalePlanMinutes`, default 15; `expiredAt` = the ISO instant the plan crossed the boundary, conservative: at/over the window = expired). Per-document: a `StalePlan` blocks only that document; the run continues. | Value object (error) | member of → MarkSyncError |
| **Run** | A single execution of a MarkSync sync command. Has a unique run ID, a journal (`<run-id>.jsonl`), and an operation ID. Partial-apply recovery uses the journal. The `runId` is a UUID v7 (time-sortable) and `operationId` is `op_<runId>` — both emitted by `computePlan` (`src/app/push-flow.ts`, GH-23) and carried on the `Plan`/`ApplyReport`. | Value object | has → Operation ID; has → Journal |
| **Journal Entry** | A single mutation recorded in the run journal immediately after execution. Enables idempotent partial-apply replay. Realized as the `JournalEntry` type (`{ ts; op: "create" \| "update"; pageId; uuid; outcome: "success" \| "failed" }`) appended to `.marksync/journal/<run-id>.jsonl` by the writer returned from `openJournal` (`src/app/journal.ts`, GH-23); the entry carries no bodies or tokens (INV-SEC-1). `op` is `create \| update` for MS-0002 (`move` is reserved for future parent-reparenting). | Value object | belongs to → Run |
| **Plan** | A deterministic, reviewable description of what MarkSync will do: a list of intended mutations with their sync states and hashes. Produced before any write; available via dry-run. Realized as the `Plan` type `{ runId; operationId; entries: PlanEntry[]; provenance }` emitted by `computePlan` (`src/app/push-flow.ts`, GH-23). A `PlanEntry` carries `{ uuid; sourcePath; state: SyncState \| "NEW"; action: PlanAction; hashes: ContentHash; renderedBody }`, where `PlanAction` extends the GH-22 `Action` (`NoOp`/`Update`/`Block`/`Skip`) with an app-tier `Create` arm for unbound documents (the GH-22 classifier is bound-documents-only — there is no `base` to classify a new doc against). | Value object | produced by → Planner / computePlan |
| **ApplyReport** | The output of `applyPlan` (`src/app/push-flow.ts`, GH-23): `{ runId; results: Array<{ uuid; outcome: "created" \| "updated" \| "noop" \| "skipped" \| "blocked"; error? }>; writes; skips; blocks }`. The aggregate `writes` count (`created + updated`) is the semantic-idempotency assertion point (NFR-PERF-4: a second unchanged push yields `writes === 0`); `blocks` is the INV-SAFE-1/2 evidence point. Per-document isolation means one `blocked` entry does not abort the run. | Value object | produced by → applyPlan |
| **Diagnostic Code** | A stable, machine-readable code for a known failure class, paired with human remediation text. `MS-0003` target; `MS-0002` informational. | Value object (string) | emitted by → Output Service |
| **Exit Code** | A stable, machine-parseable return code per error class. `0` = clean; non-zero = error class. | Value object (integer) | emitted by → Output Service |

### Domain Events

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Plan Computed** | The dry-run pipeline completed and emitted a reviewable `Plan` with zero writes. Realized as the `ok(Plan)` return value of `computePlan` (`src/app/push-flow.ts`, GH-23) — a typed value surfaced through `CommandResult<Plan>`, not a bus-emitted event. Carries the run ID, operation ID, and per-entry sync states + actions. | Domain event | produces → Plan |
| **Page Published** | A target-system page was created or updated by MarkSync (the per-mutation "Mutation Applied" signal, spec §8.2). Carries: page ID, new version, provenance, operation ID. Realized as the `created`/`updated` outcomes collected in `ApplyReport.results` (`src/app/push-flow.ts`, GH-23); each successful create/update journals a `JournalEntry` then atomically updates the binding + `marksync.metadata` property. | Domain event | triggers → Lock Update |
| **Drift Detected** | A managed page's remote state diverged from the shared base; publish was blocked to prevent silent overwrite. Carries: page ID, sync state, base/remote hashes. | Domain event | produces → Conflict |
| **Duplicate UUID Detected** | Two source documents share the same Document Identity UUID. Fatal before any write (INV-SAFE-3). Realized as `err({ kind: "DuplicateUuid"; uuid; paths })` returned by `detectDuplicateUuids` (`src/domain/identity/duplicate-detector.ts`) — a `Result` value, not an emitted event; the push flow treats it as fatal and halts. | Domain event | triggers → Halt |
| **Remote Missing Detected** | A managed page's remote returned not-found. The invariant (INV-SAFE-2) prevents silent re-creation; the user must explicitly acknowledge. | Domain event | produces → Conflict |
| **Lock Updated** | The lock file's shared-base entry for a document was atomically updated after a successful publish. Realized by `saveLock`/`mergeBindings` (`src/app/lock.ts`), which serialize line-oriented UUID-ordered YAML and write it atomically (`src/infra/lock/store.ts`). | Domain event | — |
| **Journal Written** | A mutation was journaled immediately after execution, enabling partial-apply recovery. Realized by the `JournalWriter.append` returned from `openJournal` (`src/app/journal.ts`, GH-23) — appended BEFORE the lock updates (crash safety); `replayJournal` reads the JSONL for repair-state (E4-S4). | Domain event | — |

### Domain Services

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **State Classifier** | Domain service that compares Source Document, Shared Base, and Target Page to produce a Sync State. Core of the trust wedge: determines when a publish is safe vs. when drift is detected. Realized as the pure `classify({ local?, base?, remote }) → Result<SyncState, MarkSyncError>` function (`src/domain/state/classifier.ts`, GH-22); invoked only for bound documents; `local` is optional (absent ⇒ `LOCAL_MISSING`); `remote.kind === "forbidden"` surfaces as `err(Forbidden)` rather than a sync state. | Domain service | produces → Sync State, Action |
| **Concurrency Gates** | The pure domain functions enforcing decentralized optimistic concurrency (ADR-0006 C-5/C-6): `assertOperationFresh` (operation-ID freshness via UUID-v7 time-prefix comparison), `assertPlanNotExpired` (stale-plan expiry, conservative boundary), and `decideOnConflict` (409 re-fetch-once: `Decision = "reapply" \| "block"` over the `SyncState` matrix) — `src/domain/state/{operation-freshness,plan-expiry,conflict-policy}.ts`. The `uuidV7Timestamp` extractor anchors both expiry and freshness via the `runId`'s embedded UUID-v7 timestamp (`src/domain/identity/uuid.ts`, DEC-7 — no new `Plan` field). Wired into `applyPlan`/`processEntry` (`src/app/push-flow.ts`) with per-document isolation (GH-24). | Domain service | consumes → Operation ID, Sync State; produces → StalePlan, Decision |
| **Hierarchy Planner** | Domain service that builds the page graph from source documents: titles, parents, cross-page links. Ensures parent-first ordering for safe apply. | Domain service | produces → Plan |
| **Link Resolver** | Domain service that resolves local Markdown cross-document links to target-system page IDs/URLs so internal links work after sync. Realized as the pure `resolveLink(sourcePath, target, bindings) → Result<PageRef \| string, MarkSyncError>` (`src/domain/hierarchy/link-resolver.ts`, GH-23): a resolved `.md` link returns the target `PageRef`; an unresolvable `.md` link returns `err(UnresolvedLink)` (never a silently-broken URL); external/anchor/non-`.md` targets pass through untouched. | Domain service | used by → Hierarchy Planner |
| **Asset Resolver** | Domain service that resolves local images referenced from Markdown for upload. Realized as `AssetResolver` (`src/domain/assets/resolver.ts`, GH-26): `{ root, readBytes? }` + `resolve(hast, docPath): Promise<Result<AssetSet, MarkSyncError>>`. Walks HAST `img` nodes, resolves each local `src` relative to the doc confined to the configured root (`realpath` + prefix check, symlink-aware → `Forbidden(path-traversal)` with 0 bytes read on escape, NFR-SEC-7), sha256-identifies each asset, and rewrites the node to the dedup filename; remote `http(s)` images are skipped. The `assetFilename` helper (`src/domain/assets/naming.ts`) produces `marksync-asset-<sha256>.<ext>` (reconciled with the infra `attachmentFilename()` for non-SVG). | Domain service | produces → AssetSet; consumed by → Push Executor |
| **Mermaid Artifact Manager** | Domain service that calculates Mermaid content hashes, detects whether a hash already exists on the target, and orchestrates render→upload→reference. | Domain service | used by → Push Executor |
| **TargetSystem** | The domain-owned port (`interface TargetSystem`, `src/domain/target/port.ts`) abstracting the remote publishing surface. Declares `renderBody`, `getPage`, `createPage`, `updatePage`, `movePage`, `getProperty`, `putProperty`, `uploadAttachment`, `attachmentExists`, `listAttachments`, `searchPages`, `getRestrictions`. No target-specific type appears in its surface; every operation returns `Result<T, MarkSyncError>`. The domain/application tiers call ONLY through this seam; infrastructure implements it (GH-21). The seam a future non-Confluence adapter plugs into. | Domain service (port) | implemented by → ConfluenceTarget |
| **Repository** | The domain-owned port (`interface Repository`, `src/domain/git/port.ts`) abstracting the Git document source. Declares `readCommitted(ref, patterns)` (committed file bytes at a ref), `headSha()`, `currentBranch()`, and `listCommitSubjects(range?)` (the provenance hook). Read-only — never fetches/pushes/pulls. Every operation returns `Result<T, MarkSyncError>`; malformed paths/refs throw at the boundary (invariant guard, TDR-0003 C-4). Infrastructure implements it via the shell-git adapter (`createShellGit`, `src/infra/git/shell-git.ts`, GH-23). The seam E3-S7/E4 stories extend without rework. | Domain service (port) | implemented by → shell-git adapter |

### Infrastructure Services

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Push Executor** | The application-tier use-case orchestration that performs ordered safe writes via the `TargetSystem` port, journals each mutation, and handles optimistic concurrency (409 surfaced as drift; on `Conflict`, re-fetch + re-classify ONCE then reapply-or-block — max 1 re-fetch + 1 reapply, no loop). Realized as `computePlan` (pure, no-writes dry-run) + `applyPlan` (parent-first, per-document isolation, journal-before-lock, provenance via `formatVersionMessage`) at `src/app/push-flow.ts` (GH-23; concurrency gates wired in GH-24). Port construction is wired through the app-tier factory `createRepository`/`createTarget` (`src/app/ports.ts`). (Listed here because it owns the journal/409 contract the domain depends on; the orchestration is application-tier, while the primitives it delegates to — `writeAtomic`, the shell-git adapter — remain infrastructure.) | Application service | consumes → Plan; produces → Page Published, Drift Detected |
| **ConfluenceTarget** | The sole `TargetSystem` port implementor (`class ConfluenceTarget implements TargetSystem`, `src/infra/confluence/target.ts`). Composes the `ConfluenceClient` + `PageService` + `PropertyService` + `AttachmentService` + `SearchService` + `RestrictionsService`; `renderBody` delegates to the GH-20 `renderStorage`. An anti-corruption layer: it translates Confluence REST v2/v1 responses into adapter-agnostic port value types, isolating every v1/v2 distinction (A-FEA-6). | Infrastructure service (adapter) | implements → TargetSystem |

### Configuration

_Repository-owned configuration is the typed contract every use-case consumes.
The JSON Schema (`src/domain/config/schema.json`, draft-07, v1) is the source of
truth for the shape; the TypeScript types mirror it; the application-tier loader
validates with ajv and returns a typed result (GH-15). Identifiers below bind to
their code constructs (typescript.md UL-binding rule)._

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **marksync.yml** | The repository-owned YAML configuration file consumed by every MarkSync use-case. Shape defined by the v1 JSON Schema; holds no secrets (credentials live in env/keyring). | File (config) | parsed by → Config Loader |
| **ProjectConfig** | The fully-typed, defaults-applied configuration returned by `loadConfig` on success (`src/domain/config/types.ts`). Every field is present after defaults run; `ProjectConfigInput` is the pre-defaults raw shape ajv validates. | Value object | produced by → Config Loader |
| **TargetConfig** | The per-target shape (`type`, `spaceKey`, `parentPageId`) within the `targets` map. MS-0002 ships a single Confluence target. | Value object | contained in → ProjectConfig |
| **DocumentConfig** | The per-document resolved config: `sourcePath`, `title`, `intendedParent`, optional `uuid`, and `exclude` flag (`src/app/document-config.ts`). Derived downstream; front-matter overrides apply on top. | Value object | produced by → Document Config Resolver |
| **ConfigError** | The config-failure arm (`kind: "InvalidConfig"`) of the `MarkSyncError` union: carries `path`, `ConfigAjvError[]`, and an AI-readable `humanMessage` (field path + expected vs actual + suggested fix). `loadConfig` narrows its `Result` error to this arm. | Value object (error) | member of → MarkSyncError |
| **Config Loader** | Application service (`loadConfig`/`applyDefaults`, `src/app/config.ts`) that reads `marksync.yml`, parses YAML, ajv-validates (`allErrors`), applies defaults, and returns `Result<ProjectConfig, ConfigError>`. Pure: the only I/O is reading the single config file (no Git/tree access). | Application service | produces → ProjectConfig; emits → ConfigError |
| **File Selector** | Application service (`selectFiles`, `src/app/config.ts`) returning the subset of a caller-supplied path list matching `select` globs minus `exclude` globs (de-duplicated, sorted). Zero Git I/O — the Git adapter supplies the paths. | Application service | consumes → ProjectConfig |
| **Document Config Resolver** | Application service (`resolveDocumentConfig`/`parseFrontMatter`, `src/app/document-config.ts`) that merges per-document `marksync.*` front-matter overrides (`title`/`parent`/`uuid`/`exclude`) over the derived base. Tolerates absent/malformed front-matter (never throws). | Application service | produces → DocumentConfig |
| **Intended Hierarchy** | The intended Confluence page-tree shape computed from selected files under `root` (structure only — no page-id resolution). `mirror` derives each page's parent from its directory; `flat` attaches all pages to the configured parent anchor. | Value object | produced by → Intended Hierarchy Builder |
| **Intended Hierarchy Builder** | Domain service (`intendedParent`/`buildIntendedHierarchy`, `src/domain/config/hierarchy.ts`) computing the intended parent path per selected file. Pure path logic over canonicalized forward-slash paths. | Domain service | produces → Intended Hierarchy |
| **marksync init** | CLI command that writes a valid starter `marksync.yml` (round-trips through `loadConfig`, refuses to overwrite an existing file), then assigns a UUID v7 to each discovered managed document's front-matter by delegating to `assignUuidsFromDisk` (`src/app/identity-assign.ts`). UUID injection is idempotent — a document that already carries a `marksync.uuid` is left unchanged. | CLI command | validates via → Config Loader; delegates UUID assignment to → `assignUuidsFromDisk` |

### Credentials / Auth

_The application-tier credential provider isolates Confluence auth from every
consumer: it resolves the canonical env vars into an opaque auth header and
validates the credential against Confluence, never retaining the raw token
(GH-17 / INV-SEC-1). Names bind to their code constructs
(`src/domain/credentials.ts`, `src/app/credentials.ts`)._

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **ConfluenceCredentials** | The resolved Confluence credential consumers receive (`src/domain/credentials.ts`): `{ baseUrl, authHeader, email (masked), mode: "api-token" }`. `authHeader` is an opaque `"Basic …"` secret never serialized to any output path; the raw token is not a field on the object. | Value object | produced by → Credential Provider |
| **AccountIdentity** | The success payload of `validateCredentials` (`src/domain/credentials.ts`): `{ accountId, displayName }`, parsed from Confluence's v2 `user/by-me` response. | Value object | produced by → Credential Provider |
| **AuthError** | The auth-failure arm (`kind: "Auth"`) of the `MarkSyncError` union, discriminated further on `authKind` (`MissingCredentials` \| `InvalidBaseUrl` \| `InvalidCredentials` \| `AuthUnreachable`). The credential provider narrows its `Result` error channel to this arm. | Value object (error) | member of → MarkSyncError |
| **Credential Provider** | Application service (`resolveCredentials` / `validateCredentials` / `maskEmail`, `src/app/credentials.ts`) that reads the canonical env vars, builds the opaque `authHeader`, masks the email, and probes Confluence's v2 `user/by-me` endpoint via an injected `fetch`. Imports only `#domain/*`; the raw token is consumed inside `base64` and never stored on a returned object. | Application service | produces → ConfluenceCredentials, AccountIdentity; emits → AuthError |

### State (shared base, lock, cache)

_Committed shared base + disposable cache + content-property cross-check + branch
gate (ADR-0006 C-2 / C-3 / Cross-check / Branch restriction). Names bind to their
code constructs._

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Lock (LockFile)** | The committed, versioned shared-base file `marksync.lock.yml` at the repo root: `{ version: 1; targets: Record<targetId, { documents: Record<DocumentId, PageBinding> }> }`. Serialized line-oriented and UUID-ordered for clean cross-branch merges; written atomically (temp + `fs.rename`); holds no secrets. Code: `LockFile`/`LockTarget` (`src/domain/config/lock-types.ts`, mirrors `lock-schema.json` v1), loader/saver/merger `loadLock`/`saveLock`/`serializeLock`/`mergeBindings` (`src/app/lock.ts`), atomic store `writeAtomic` (`src/infra/lock/store.ts`). A missing lock is the initial state `ok(empty LockFile)`, not an error. | Value object (committed artifact) | holds → Shared Base (per Page Binding) |
| **Disposable Cache** | The gitignored `.marksync/` tree, split into `cache/` (CI-cacheable, reconstructable artifacts), `journal/` (run-specific), and `conflicts/` (run-specific). Deleting the whole tree changes no plan (ADR-0006 C-3). Overridable via `MARKSYNC_CACHE_DIR`. Code: `resolveCacheDir`/`ensureCacheLayout`/`CACHE_SUBDIRS` (`src/app/cache.ts`). | Value object (infrastructure) | distinct from → Lock (the lock is the base; the cache is never needed for correctness) |
| **Content-Property Cross-Check** | Pure domain functions comparing the lock against the remote `marksync.metadata` content property (ADR-0006 Cross-check; no I/O — the property fetch is the Confluence adapter). `reconcileWithProperty` flags a `sourceCommit` mismatch as `LockDirty`; `rebuildLockFromConfluence` reconstructs a `PageBinding` from the remote property + page facts + hashes (the lost-lock recovery path). Code: `src/domain/state/reconcile.ts`. | Domain service | consumes → Page Binding, MetadataProperty; produces → LockDirty |
| **Branch Gate** | Application decision confining sync to `sync.allowBranches` (default `["main"]`) — Markdown sync treated as a documentation deployment. `MARKSYNC_ALLOW_BRANCHES` augments the allowed set for the process (feature-branch previews); deny produces `ForbiddenBranch`. Code: `assertBranchAllowed` (`src/app/branch.ts`). | Application service | produces → ForbiddenBranch |
| **MetadataProperty** | The remote `marksync.metadata` content property (system spec §9.3): `{ schemaVersion, projectId, targetId, documentId, sourcePath, sourceCommit, sourceContentHash, renderedBodyHash, toolVersion, synchronizedAt, operationId }`. Caller-supplied input to the cross-check; fetched by the Confluence adapter. | Value object | input to → Content-Property Cross-Check |
| **CorruptLock** | The corrupt-lock arm (`kind: "CorruptLock"`) of `MarkSyncError`: a present-but-invalid lock (bad `version`, missing field, unparseable YAML). Distinct recovery action (regenerate / `rebuildLockFromConfluence`) from `LockDirty` (property tamper → reconcile). Carries `path`, optional `ajvErrors`, and an AI-readable `humanMessage`. | Value object (error) | member of → MarkSyncError |
| **LockError** | The lock-failure arms of `MarkSyncError` (`CorruptLock` \| `LockDirty` \| `ConcurrentWrite`) — the narrowed `Result` error `loadLock`/`saveLock` declare (`src/domain/config/lock-types.ts` re-exports it), mirroring `ConfigError`/`AuthError`. | Value object (error) | member of → MarkSyncError |

### Target System (port value types + transport errors)

_The adapter-agnostic value types the `TargetSystem` port exchanges, plus the
transport-failure `MarkSyncError` arms the Confluence adapter produces. Names
bind to their code constructs (`src/domain/target/port.ts` for the types;
`src/domain/errors.ts` for the arms; GH-21)._

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **RenderedBody** | The `{ body; hash; warnings }` payload returned by `TargetSystem.renderBody`. `body` is the target-specific body string (Confluence Storage XHTML); `hash` is the deterministic content hash; `warnings` are non-fatal render warnings. | Value object | produced by → TargetSystem.renderBody |
| **RenderBodyOptions** | `{ sourcePath }` — the per-render options threaded onto any `renderBody` failure (e.g. an `UnsupportedConstruct` carries the offending source path). | Value object | input to → TargetSystem.renderBody |
| **Page** | The target page as seen through the port: `{ id; title; version; body? }` — identity + version + optional body. Returned by `getPage`/`createPage`/`updatePage`/`movePage`; the v2 read surfaces the body on demand. (Bound to the **Target Page** entity above.) | Value object | returned by → TargetSystem |
| **CreatePageRequest** | `{ parentId; title; body; baseHash?; message? }` — create a page under a parent. `representation:"storage"` is the adapter's concern, not the caller's. | Value object | input to → TargetSystem.createPage |
| **UpdatePageRequest** | The port request for `TargetSystem.updatePage`: `{ pageId; title; body; baseVersion; message? }`. The `title` is carried unchanged (the Confluence v2 PUT requires it); `baseVersion` is the version the caller believes is current (the target rejects a stale value with 409). | Value object | consumed by → TargetSystem.updatePage |
| **MovePageRequest** | `{ pageId; parentId }` — reparent a page. | Value object | input to → TargetSystem.movePage |
| **Artifact** | `{ bytes; mime; hash }` — a binary artifact to upload (rendered Mermaid SVG, resolved asset). `hash` is the dedup key. | Value object | input to → TargetSystem.uploadAttachment |
| **AttachmentRef** | `{ id; pageId; filename; hash; version }` — a reference to a stored attachment, keyed by the hash-derived filename. | Value object | returned by → TargetSystem (`uploadAttachment`/`listAttachments`) |
| **PageRef** | `{ id; title }` — a discovered page via CQL search (id + title only — minimal). | Value object | returned by → TargetSystem.searchPages |
| **PageRestrictions** | `{ pageId; restricted }` — a page's view/edit restriction state (minimal — supports the permission-awareness story, R-FEA-10). | Value object | returned by → TargetSystem.getRestrictions |
| **RateLimited** | The transport-failure arm (`kind: "RateLimited"`) of `MarkSyncError`: produced when Confluence 429 backoff is exhausted (after max retries). Carries optional `retryAfterMs` (last observed `Retry-After`) for the caller's retry decision — no secret material. Distinct kind from `RemoteUnreachable` because the recovery action differs (wait-and-retry vs alert-operator). | Value object (error) | member of → MarkSyncError |
| **RemoteUnreachable** | The transport-failure arm (`kind: "RemoteUnreachable"`) of `MarkSyncError`: produced on exhausted-5xx backoff, a network failure, or a zod schema-validation failure (remote-shape drift). Carries optional `status` (for 5xx) and a non-secret `cause`. The recovery action (server-down / alert-operator) differs from `RateLimited`. | Value object (error) | member of → MarkSyncError |

## Context map

_How this context relates to neighbouring bounded contexts._

| Neighbouring context | Relationship | Notes |
|---|---|---|
| **Confluence REST API** | Customer/supplier (anti-corruption layer) | The Confluence adapter (`ConfluenceTarget`, composing `ConfluenceClient` + per-surface services) is an ACL: it translates REST v2/v1 responses into MarkSync domain objects (`Target Page`, `Body Representation`, `Content Properties`). All REST version distinctions are isolated here (A-FEA-6). MarkSync depends on the API but the ACL protects the domain from API churn. |
| **Git** | Customer/supplier (anti-corruption layer) | The `Repository` port (implemented by shell-Git, TDR-0003) is an ACL: it translates Git operations into `Source Document` reads. MarkSync reads committed snapshots only; never pushes/pulls. |
| **Mermaid Rendering** | Conformist (service) | The `Renderer` port (design target — official `mermaid` + headless DOM, ADR-0002) produces deterministic `Artifact` bytes; the `Mermaid Artifact Manager` handles dedup/existence. **MS-0002 ships the `code` policy** (rung 7 — mermaid fences preserved as code macros, GH-25); the renderer port is deferred to MS-0003+ pending a faithful-render path (GH-11 H4 FAIL / CEO-DEC-1). |
| **CLI Presentation** | Customer (downstream) | The CLI presentation tier consumes domain/application services and renders output (human/JSON/NDJSON) via the output service. The domain does not know about CLI formatting. |
| **Filesystem** | Open Host Service | Config (`marksync.yml`) and lock files are plain YAML validated against JSON Schema (ajv) at the load boundary; the cache is disposable. The domain consumes the typed result, not the raw file. |
| **OS Keyring** | Open Host Service | Credential storage (deferred for MS-0002 — `keytar`, OPEN-Q8). The application-tier Credential Provider resolves Confluence credentials from env in MS-0002; a future keyring source slots behind the same resolution seam. The raw token is never logged. |

## Binding rules

_The rules that keep code and conversation using these terms consistently._

1. **One term, one meaning.** Each UL term maps to exactly one code construct
   (interface, type, class, or enum). If the code uses a different name, either
   rename the code or update the UL — not both silently.
   - **Enforcement:** code review gate (Phase 5 `code-review-instructions.md`);
     `.ai/rules/typescript.md` naming conventions.

2. **No synonyms in code.** The codebase uses the UL term as the canonical
   identifier (class name, interface name, type name). Abbreviations are allowed
   only in local variables; public APIs use the full UL term.
   - **Enforcement:** linter naming rules; code review.

3. **Sync states are an enum.** The `Sync State` value object is a TypeScript
   enum/union with exactly the values listed above. No ad-hoc state strings.
   - **Enforcement:** `zod` schema validation at the state-classifier output
     boundary.

4. **Aggregate boundaries are module boundaries.** `Document Identity` logic
   lives in `src/domain/identity/`; `Page Binding` logic lives in
   `src/domain/binding/`. Cross-references go through the aggregate root, never
   directly to internal entities.
   - **Enforcement:** module-residence rules in `architecture-overview.md`;
     dependency-cruiser import boundaries (TDR-0006).

5. **Domain events are typed.** Each domain event has a TypeScript discriminated
   union member. The push executor emits and the lock store consumes them.
   - **Enforcement:** `zod` schema on the event boundary.

6. **Translation at context boundaries.** When a neighbouring context uses a
   different term (e.g., Confluence "content" → MarkSync "Target Page"), the
   adapter performs the translation. The domain never sees foreign terms.
   - **Enforcement:** adapter isolation rule (A-FEA-6); module boundary
     heuristics.

7. **New terms require a UL entry.** When a new domain concept is introduced
   (e.g., a new sync state, a new domain event), it must be added to this
   document in the same PR that introduces the code.
   - **Enforcement:** code review gate; UL-update checklist in PR template
     (Phase 5).
