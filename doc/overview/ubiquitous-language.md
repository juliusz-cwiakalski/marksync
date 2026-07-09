---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/ubiquitous-language-template.md
ados_distribution: redistributable
id: UBIQUITOUS-LANGUAGE
status: Draft
created: 2026-07-05
last_updated: 2026-07-09
owners: [Juliusz Ćwiąkalski]
area: domain
document_classification: current-truth
links:
  related_decisions: [ADR-0005, ADR-0006, ADR-0010, ADR-0011, PDR-0001]
  related_changes: [GH-15, GH-17, GH-18, GH-19]
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
| **Target Page** | The remote page as seen from the target system. Has: page ID, version number, body representation (Storage/ADF), content properties, and attachments. | Entity (behind TargetSystem port) | belongs to → Page Binding; has → Content Properties |
| **Shared Base** | The agreed "last published" snapshot for a document: body hash, attachment hashes, version number, and provenance commit. Stored in the committed lock (`marksync.lock.yml`, `src/app/lock.ts`); enables drift detection by comparison with current Source Document and Target Page. | Entity (within Page Binding) | belongs to → Page Binding |

### Value Objects

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Sync State** | The classification of a document relative to local/base/remote. Values: `NO_CHANGE`, `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING`. Determined by the state classifier from three-way comparison. | Value object (enum) | produced by → State Classifier |
| **Body Representation** | The concrete format of a page body: Confluence Storage Format (XHTML + `ac:`/`ri:`) or ADF. MarkSync writes Storage (ADR-0005); reverse conversion reads either. | Value object | emitted by → Target System |
| **Content Hash** | A deterministic hash of a document or asset body. Used for idempotency detection: if local hash equals shared-base hash, the document is unchanged. Computed from canonical + normalized content. | Value object (string) | computed from → Source Document / Target Page |
| **DocumentId** | The branded value object (`string & { __brand: "DocumentId" }`, `src/domain/identity/document-id.ts`) carrying a UUID v7 — the canonical identity value of a Document Identity. Constructed only via `generateUuidV7()` (which brands) or `parseDocumentId(s)` (which validates v7 first, returning `Result<DocumentId, DocumentIdError>`). A plain `string` cannot stand where a `DocumentId` is required. | Value object (branded string) | member of → Document Identity; stored at → `marksync.uuid` |
| **Provenance** | The source-path + Git-revision + last-sync metadata. Appears both as machine content-property (`marksync.metadata`) and human-visible panel/footer. Written into `version.message` on each Confluence page version (ADR-0010). | Value object | attached to → Target Page |
| **Operation ID** | A unique per-run identifier used for decentralized concurrency dedup. If two runners submit the same operation, the stale one is rejected via Confluence 409 + dedup. | Value object (string) | scoped to → Run |
| **Run** | A single execution of a MarkSync sync command. Has a unique run ID, a journal (`<run-id>.jsonl`), and an operation ID. Partial-apply recovery uses the journal. | Value object | has → Operation ID; has → Journal |
| **Journal Entry** | A single mutation recorded in the run journal immediately after execution. Enables idempotent partial-apply replay. | Value object | belongs to → Run |
| **Plan** | A deterministic, reviewable description of what MarkSync will do: a list of intended mutations (create/update/no-op/move/skip) with their sync states and hashes. Produced before any write; available via dry-run. | Value object | produced by → Planner |
| **Diagnostic Code** | A stable, machine-readable code for a known failure class, paired with human remediation text. `MS-0003` target; `MS-0002` informational. | Value object (string) | emitted by → Output Service |
| **Exit Code** | A stable, machine-parseable return code per error class. `0` = clean; non-zero = error class. | Value object (integer) | emitted by → Output Service |

### Domain Events

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Page Published** | A target-system page was created or updated by MarkSync. Carries: page ID, new version, provenance, operation ID. | Domain event | triggers → Lock Update |
| **Drift Detected** | A managed page's remote state diverged from the shared base; publish was blocked to prevent silent overwrite. Carries: page ID, sync state, base/remote hashes. | Domain event | produces → Conflict |
| **Duplicate UUID Detected** | Two source documents share the same Document Identity UUID. Fatal before any write (INV-SAFE-3). Realized as `err({ kind: "DuplicateUuid"; uuid; paths })` returned by `detectDuplicateUuids` (`src/domain/identity/duplicate-detector.ts`) — a `Result` value, not an emitted event; the push flow treats it as fatal and halts. | Domain event | triggers → Halt |
| **Remote Missing Detected** | A managed page's remote returned not-found. The invariant (INV-SAFE-2) prevents silent re-creation; the user must explicitly acknowledge. | Domain event | produces → Conflict |
| **Lock Updated** | The lock file's shared-base entry for a document was atomically updated after a successful publish. Realized by `saveLock`/`mergeBindings` (`src/app/lock.ts`), which serialize line-oriented UUID-ordered YAML and write it atomically (`src/infra/lock/store.ts`). | Domain event | — |
| **Journal Written** | A mutation was journaled immediately after execution, enabling partial-apply recovery. | Domain event | — |

### Domain Services

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **State Classifier** | Domain service that compares Source Document, Shared Base, and Target Page to produce a Sync State. Core of the trust wedge: determines when a publish is safe vs. when drift is detected. | Domain service | produces → Sync State |
| **Hierarchy Planner** | Domain service that builds the page graph from source documents: titles, parents, cross-page links. Ensures parent-first ordering for safe apply. | Domain service | produces → Plan |
| **Link Resolver** | Domain service that resolves local Markdown cross-document links to target-system page IDs/URLs so internal links work after sync. | Domain service | used by → Hierarchy Planner |
| **Asset Resolver** | Domain service that prepares images/attachments: safe path resolution, content hashing, deduplication. | Domain service | — |
| **Mermaid Artifact Manager** | Domain service that calculates Mermaid content hashes, detects whether a hash already exists on the target, and orchestrates render→upload→reference. | Domain service | used by → Push Executor |

### Infrastructure Services

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Push Executor** | Infrastructure service that performs ordered safe writes via the `TargetSystem` port, journals each mutation, and handles optimistic concurrency (409). Included here because it owns the journal/409 contract that the domain depends on. | Infrastructure service | consumes → Plan; produces → Page Published, Drift Detected |

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

## Context map

_How this context relates to neighbouring bounded contexts._

| Neighbouring context | Relationship | Notes |
|---|---|---|
| **Confluence REST API** | Customer/supplier (anti-corruption layer) | The Confluence adapter (`ConfluenceClient`) is an ACL: it translates REST v2/v1 responses into MarkSync domain objects (`Target Page`, `Body Representation`, `Content Properties`). All REST version distinctions are isolated here (A-FEA-6). MarkSync depends on the API but the ACL protects the domain from API churn. |
| **Git** | Customer/supplier (anti-corruption layer) | The `Repository` port (implemented by shell-Git, TDR-0003) is an ACL: it translates Git operations into `Source Document` reads. MarkSync reads committed snapshots only; never pushes/pulls. |
| **Mermaid Rendering** | Conformist (service) | The `Renderer` port (implemented by official `mermaid` + jsdom, ADR-0002) produces deterministic `Artifact` bytes. MarkSync conforms to the renderer's output contract; the `Mermaid Artifact Manager` handles dedup/existence. |
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
