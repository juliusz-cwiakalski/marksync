---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/ubiquitous-language-template.md
ados_distribution: redistributable
id: UBIQUITOUS-LANGUAGE
status: Draft
created: 2026-07-05
last_updated: 2026-07-05
owners: [Juliusz Ćwiąkalski]
area: domain
document_classification: current-truth
links:
  related_decisions: [ADR-0005, ADR-0006, ADR-0010, ADR-0011, PDR-0001]
  related_changes: []
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
    reverse-conversion interface.
  - **Out of scope (neighbouring contexts):** Confluence REST API specifics
    (isolated behind `ConfluenceClient` adapter — see context map); Git plumbing
    (isolated behind `Repository` port); Mermaid rendering mechanics (isolated
    behind `Renderer` port); CLI presentation/output formatting (presentation
    tier).

## Terms

### Aggregates

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Document Identity** | The immutable, source-side identity of a managed document: a UUID v7 in front-matter. Survives clones, branches, CI, and title/path changes. Duplicate identities are fatal before any write (INV-SAFE-3). | Aggregate root | 1:1 → Source Document; 1:1 → Page Binding |
| **Managed Document** | A source Markdown file that MarkSync tracks and synchronizes. Has a Document Identity, a source path, content (Markdown AST), and a position in the hierarchy. | Aggregate | 1:1 → Document Identity; 1:1 → Source Document; 0..1 → Page Binding |

### Entities

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Source Document** | The Markdown file as read from a committed Git revision. Has: front-matter (including UUID), MDAST content, resolved assets, and a relative path within the configured root. | Entity (within Managed Document) | belongs to → Managed Document |
| **Page Binding** | The durable mapping between a Document Identity and a target-system page. Records: page ID, parent page ID, last-known remote version, content hashes, and the shared-base snapshot. Persisted in the lock file. | Entity (within Document Identity) | 1:1 → Target Page; 1:1 → Shared Base |
| **Target Page** | The remote page as seen from the target system. Has: page ID, version number, body representation (Storage/ADF), content properties, and attachments. | Entity (behind TargetSystem port) | belongs to → Page Binding; has → Content Properties |
| **Shared Base** | The agreed "last published" snapshot for a document: body hash, attachment hashes, version number, and provenance commit. Stored in the lock file; enables drift detection by comparison with current Source Document and Target Page. | Entity (within Page Binding) | belongs to → Page Binding |

### Value Objects

| Term | Meaning | Type | Relationships |
|---|---|---|---|
| **Sync State** | The classification of a document relative to local/base/remote. Values: `NO_CHANGE`, `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING`. Determined by the state classifier from three-way comparison. | Value object (enum) | produced by → State Classifier |
| **Body Representation** | The concrete format of a page body: Confluence Storage Format (XHTML + `ac:`/`ri:`) or ADF. MarkSync writes Storage (ADR-0005); reverse conversion reads either. | Value object | emitted by → Target System |
| **Content Hash** | A deterministic hash of a document or asset body. Used for idempotency detection: if local hash equals shared-base hash, the document is unchanged. Computed from canonical + normalized content. | Value object (string) | computed from → Source Document / Target Page |
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
| **Duplicate UUID Detected** | Two source documents share the same Document Identity UUID. Fatal before any write (INV-SAFE-3). | Domain event | triggers → Halt |
| **Remote Missing Detected** | A managed page's remote returned not-found. The invariant (INV-SAFE-2) prevents silent re-creation; the user must explicitly acknowledge. | Domain event | produces → Conflict |
| **Lock Updated** | The lock file's shared-base entry for a document was atomically updated after a successful publish. | Domain event | — |
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

## Context map

_How this context relates to neighbouring bounded contexts._

| Neighbouring context | Relationship | Notes |
|---|---|---|
| **Confluence REST API** | Customer/supplier (anti-corruption layer) | The Confluence adapter (`ConfluenceClient`) is an ACL: it translates REST v2/v1 responses into MarkSync domain objects (`Target Page`, `Body Representation`, `Content Properties`). All REST version distinctions are isolated here (A-FEA-6). MarkSync depends on the API but the ACL protects the domain from API churn. |
| **Git** | Customer/supplier (anti-corruption layer) | The `Repository` port (implemented by shell-Git, TDR-0003) is an ACL: it translates Git operations into `Source Document` reads. MarkSync reads committed snapshots only; never pushes/pulls. |
| **Mermaid Rendering** | Conformist (service) | The `Renderer` port (implemented by official `mermaid` + jsdom, ADR-0002) produces deterministic `Artifact` bytes. MarkSync conforms to the renderer's output contract; the `Mermaid Artifact Manager` handles dedup/existence. |
| **CLI Presentation** | Customer (downstream) | The CLI presentation tier consumes domain/application services and renders output (human/JSON/NDJSON) via the output service. The domain does not know about CLI formatting. |
| **Filesystem** | Open Host Service | Config/lock files are plain YAML; the cache is disposable. No translation needed; the domain treats them as serialized state. |
| **OS Keyring** | Open Host Service | Credential storage; the domain's `Credential Provider` reads from keyring or env, never logging secrets. |

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
