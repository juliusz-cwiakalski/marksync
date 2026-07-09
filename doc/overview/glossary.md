---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/glossary-template.md
ados_distribution: redistributable
id: GLOSSARY
status: Draft
created: 2026-07-05
last_updated: 2026-07-09
owners: [Juliusz Ćwiąkalski]
area: domain
document_classification: current-truth
links:
  related_decisions: [ADR-0001, ADR-0005, ADR-0006, ADR-0010, ADR-0011, PDR-0001]
  related_changes: [GH-15, GH-17, GH-18]
  summary: "Reader-friendly glossary of terms and acronyms used across the MarkSync repository."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Glossary

_A broad, reader-friendly list of terms and acronyms. Domain model elements that
have a precise binding to code (aggregates, entities, value objects, domain
events) also appear in the [ubiquitous language](ubiquitous-language.md). See the
Documentation Handbook §9 for the glossary-vs-UL distinction._

## Terms

| Term / acronym | Definition | Category | Related UL term |
|---|---|---|---|
| **ADF** | Atlassian Document Format — Confluence's JSON-based body representation for v2 API. MarkSync writes Storage Format, not ADF (ADR-0005); reverse conversion reads either. | Confluence | Body Representation |
| **Adapter** | A module that implements a port defined by the domain/application layer. The Confluence adapter is the first and currently the only `TargetSystem` implementor. | Architecture | Target System |
| **Adopt** | Bring a pre-existing Confluence page into MarkSync's managed set without losing its content. Depends on reverse sync; tracked as A-VAL-3. | Product | — |
| **Agent** | An AI coding/documentation agent that operates MarkSync non-interactively via CLI + JSON output. One of three operator personas. | Operator | — |
| **Apply** | Execute the mutations described in a plan against the target system. Always preceded by plan/dry-run. | Process | Plan |
| **API Token** | Atlassian's classic/direct authentication: an email + token pair. The guaranteed `MS-0002` auth path. Stored in OS keyring or env. | Auth | — |
| **Beachhead** | The narrow, must-work segment that proves the product's value before expansion. For MarkSync `MS-0002`, the beachhead is safe one-way publish with drift detection. | Strategy | — |
| **Branch restriction** | Sync is allowed only on configured `allowBranches` (default `["main"]`); override via `MARKSYNC_ALLOW_BRANCHES`. Docs sync as "deployment." | Safety | — |
| **Canonical subset** | The documented set of GFM Markdown constructs MarkSync guarantees to convert faithfully. Out-of-subset constructs are preserved safely or flagged. | Domain | Markdown Document |
| **CI-first** | The design principle that MarkSync must work identically in local, agent, and CI contexts — differing only in auth. | Architecture | — |
| **Cliffy** | The CLI framework (@cliffy/command + @cliffy/prompt + @cliffy/flags) chosen for MarkSync (TDR-0002). | Tooling | — |
| **Cloud** | Confluence Cloud — the Atlassian SaaS hosting model. The only supported target in `MS-0002` (NFR-COMP-3). | Confluence | — |
| **ConfigAjvError** | A plain-data entry for one ajv validation error (`instancePath`, `schemaPath`, `keyword`, `message`, `params`), carried by `ConfigError`. Domain-owned serializable shape — not a re-export of ajv's `ErrorObject`. | Tooling | ConfigError |
| **ConfigError** | The config-failure arm of the `MarkSyncError` union (`kind: "InvalidConfig"`): carries the config `path`, the `ConfigAjvError[]`, and an AI-readable `humanMessage` naming the field path, expected shape, and a suggested fix. Returned by `loadConfig` on any expected failure (missing file, malformed YAML, schema violation). | Domain | — |
| **AccountIdentity** | The success payload of `validateCredentials` (`src/domain/credentials.ts`): `{ accountId, displayName }`, parsed from Confluence's v2 `user/by-me` response. | Auth | AccountIdentity |
| **AuthError** | The auth-failure arm of the `MarkSyncError` union (`kind: "Auth"`), discriminated on `authKind`: `MissingCredentials`, `InvalidBaseUrl`, `InvalidCredentials`, `AuthUnreachable`. Emitted by the credential provider (`resolveCredentials`/`validateCredentials`); maps to four stable `AUTH_*` codes → exit 20 (`EXIT_AUTH`). | Domain | AuthError |
| **ConfluenceCredentials** | The resolved Confluence credential (`src/domain/credentials.ts`): `{ baseUrl, authHeader (opaque), email (masked), mode: "api-token" }`. The raw API token is not a field — only the opaque `Basic` header survives resolution (INV-SEC-1). | Auth | ConfluenceCredentials |
| **Conflict** | A state where local and remote have diverged from the shared base and cannot be safely auto-resolved. Surfaced explicitly, never auto-resolved. | Process | Sync State |
| **Content property** | A key-value pair attached to a Confluence page via the v2 API. MarkSync uses `marksync.metadata` for lock cross-check data. | Confluence | — |
| **Credential** | Authentication material: API token or OAuth refresh token. Stored in OS keyring or env, never in project files. | Security | — |
| **Data Center** | Atlassian's self-hosted Confluence offering. Deferred to `MS-0009`. | Confluence | — |
| **Determinism** | The property that the same input always produces the same output. Required for the Storage renderer (ADR-0002 C-1) and Mermaid rendering. | Quality | — |
| **Disposable cache** | The `.marksync/` directory, which is gitignored and never needed for correctness. Contains rendered bodies, journal, and conflict workspaces. | State | — |
| **Doctor** | A health-check command that discovers capabilities, permissions, and visibility before any create/adopt. Minimal in `MS-0002`; full in `MS-0003`. | CLI | — |
| **DocumentId** | The branded value object (`string & { __brand: "DocumentId" }`, `src/domain/identity/document-id.ts`) that carries a managed document's UUID v7 — the canonical identity value. A plain `string` cannot be used where a `DocumentId` is required; constructed via `generateUuidV7()` or `parseDocumentId(s)`. | Domain | Document Identity |
| **Drift** | A state where the remote (Confluence) page has changed since the last shared base, so a naive publish would overwrite unsaved work. | Process | Sync State |
| **Dry-run** | A plan-only mode that reports what would happen without performing any write. First-class; no mutation without a reviewable plan. | CLI | Plan |
| **Exit Code** | A stable, machine-parseable code returned per error class. `0` = clean; non-zero = error class. | Operability | Exit Code |
| **Front-matter** | The YAML block between leading `---` fences at the top of a Markdown document; carries per-document `marksync.*` overrides (`title`, `parent`, `uuid`, `exclude`). Tolerated when absent or malformed. | Domain | — |
| **FSE** | Full-Stack Environment — the 10 AI-friendliness attributes assessed in the FSE audit. | Process | — |
| **GFM** | GitHub Flavored Markdown — the Markdown dialect MarkSync targets (tables, task lists, strikethrough). | Domain | — |
| **Golden fixture** | A captured snapshot of deterministic output (e.g., rendered Storage XHTML) used for regression testing. | Testing | — |
| **Hexagonal** | Ports-and-adapters architecture: domain/application core owns logic; adapters supply IO (Git, Confluence, filesystem, keyring, stdout). | Architecture | — |
| **Hierarchy mirroring** | Computing the intended Confluence page-tree shape from selected files under `root` (e.g. `docs/a/b.md` → intended parent `docs/a/`). `mirror` derives parents from directories; `flat` attaches all pages to the configured parent anchor. Structure only — no page-id resolution. | Domain | Intended Hierarchy |
| **Idempotent rerun** | A second semantically-unchanged push performs 0 writes. A `MS-0002` success metric. | Quality | — |
| **Journal** | A per-run log (`<run-id>.jsonl`) recording each mutation immediately, enabling partial-apply recovery via `repair-state`. | State | Journal Entry |
| **JSON Schema** | A JSON-based schema language used to validate MarkSync config and lock files (via `ajv`). | Tooling | — |
| **Keyring** | The OS-managed credential store (macOS Keychain, Windows Credential Manager, Linux Secret Service). Optional for `MS-0002`; env-token is the guaranteed path. | Security | — |
| **Lifecycle invariant** | A release-blocking property enforced via Gherkin/BDD: INV-SAFE-1 (no silent overwrite), INV-SAFE-2 (no silent re-create of REMOTE_MISSING), INV-SAFE-3 (duplicate-UUID fatal), INV-SEC-1 (no secrets in output). | Safety | — |
| **Lock file** | A committed, versioned file recording per-document bindings: UUID → page ID, parent, version, hashes, shared base. Like `package-lock.json` for npm. | State | Shared Base |
| **Managed page** | A Confluence page tracked by MarkSync (has a UUID + lock entry + content property). | Domain | Managed Document |
| **marksync init** | CLI command that writes a valid starter `marksync.yml` (round-trips through `loadConfig`, refuses to overwrite an existing file), then assigns a UUID v7 to each discovered managed document's front-matter (`marksync.uuid`). UUID injection is idempotent — a document that already carries an identity is left unchanged. | CLI | — |
| **marksync.yml** | The repository-owned YAML configuration file consumed by every MarkSync use-case. Shape defined by the v1 JSON Schema (`src/domain/config/schema.json`); holds no secrets. | State | — |
| **MDAST** | Markdown Abstract Syntax Tree — the parsed tree format produced by `remark`. | Domain | — |
| **Mermaid** | A diagram-as-code language (flowcharts, sequence diagrams, etc.). MarkSync renders it via the official library in-process (ADR-0002). | Domain | — |
| **NDJSON** | Newline-Delimited JSON — one JSON object per line. A machine-readable output format. | Operability | — |
| **NSM** | North Star Metric — the primary success measure. MarkSync's NSM is "automation coverage of documentation publishing." | Strategy | — |
| **OAuth 3LO** | OAuth 2.0 three-legged authorization — Atlassian's modern auth flow. Deferred beyond `MS-0002`; API token is the `MS-0002` path. | Auth | — |
| **Operation ID** | A per-run identifier used for decentralized concurrency dedup: if two runners submit the same operation ID, the stale one is rejected. | Safety | Operation ID |
| **Operator** | Any entity that runs MarkSync: human, AI agent, or CI pipeline. All share identical core behaviour; only auth differs. | Product | — |
| **Optimistic concurrency** | A concurrency model where writes are allowed but checked for staleness at commit time (Confluence 409 on stale `version.number`). No pessimistic locking. | Safety | — |
| **PageBinding** | The durable mapping record between a `DocumentId` and a target-system page (`src/domain/binding/page-binding.ts`): page ID, parent, version, content hashes, and shared-base snapshot. Type + identity-binding semantics are landed; lock persistence is E3-S2. | Domain | Page Binding |
| **Plan** | A deterministic, reviewable description of what MarkSync will do before any write. Always available via dry-run. | Process | — |
| **Port** | An interface defined in domain/application that adapters implement. Primary seams: `TargetSystem`, `Repository`, `Renderer`. | Architecture | — |
| **Premortem** | A prospective analysis imagining the project has failed, then working backward to identify causes. See `doc/inception/analysis/failure-premortem.md`. | Process | — |
| **ProjectConfig** | The fully-typed, defaults-applied configuration object returned by `loadConfig` (`src/domain/config/types.ts`). Every field is present after defaults run; the root of the mirrored config type set (`TargetConfig`, `SyncConfig`, `RenderConfig`, `OutputConfig`). | Domain | — |
| **Provenance** | Source-path + Git revision + last-sync metadata on every managed page. Both machine (content property) and human (panel/footer) visible. | Quality | — |
| **Redaction** | The process of stripping secrets from all output paths (logs, plans, state, diagnostics). Enforced by construction (NFR-SEC-2). | Security | — |
| **Remark** | The Markdown → MDAST parser library MarkSync uses (part of the unified ecosystem). | Tooling | — |
| **repair-state** | A command for recovering from stale locks or interrupted-apply journal replay. Minimal in `MS-0002`; expanded in `MS-0004`. | CLI | — |
| **Repository** | The `Repository` port/interface abstracting Git operations. Shell-Git is the implementor (TDR-0003); `isomorphic-git` is the swap option. | Architecture | — |
| **Reverse sync** | Confluence → Git reconciliation: reads remote Storage/ADF, reverse-converts to Markdown patch, writes to conflict workspace, **never** auto-commits. Deferred to `MS-0005+`. | Process | — |
| **Run ID** | A unique identifier per sync execution. Used for journal tracking and partial-apply recovery. | State | Run |
| **Sandbox** | A dedicated Confluence test space for live E2E testing. Not per-suite; isolated from the fast test loop. | Testing | — |
| **SBOM** | Software Bill of Materials — a machine-readable inventory of components/dependencies. Generated per release (NFR-SEC-4). | Security | — |
| **selectFiles** | Pure application function returning the path subset matching `select` globs minus `exclude` globs, given a caller-supplied path list. Zero Git I/O — the Git adapter supplies the paths. | Domain | — |
| **Shared base** | The agreed "last published" state for a document, recorded in the lock file. Enables drift detection by comparing local/base/remote. | Domain | Shared Base |
| **Squash (sync)** | One Confluence page version per MarkSync sync, with a compact provenance summary in `version.message`. The `MS-0002` default (ADR-0010). | Process | — |
| **Storage Format** | Confluence's XHTML-based body representation with `ac:`/`ri:` macros. MarkSync's write target (ADR-0005). | Confluence | Body Representation |
| **Sync state** | The classification of a document relative to local/base/remote: NO_CHANGE, LOCAL_AHEAD, REMOTE_AHEAD, DIVERGED, REMOTE_MISSING, etc. | Domain | Sync State |
| **Target system** | The remote publishing surface abstracted by the `TargetSystem` port. Confluence is the first implementor. | Architecture | Target System |
| **TargetConfig** | The per-target shape (`type`, `spaceKey`, `parentPageId`) within the `targets` map of `marksync.yml`. `MS-0002` ships a single Confluence target. | Domain | — |
| **Trust wedge** | The core value proposition: safe one-way publish with drift detection that refuses to silently overwrite. | Strategy | — |
| **UUID v7** | A time-sortable unique identifier (RFC 9562) used for immutable document identity in source front-matter (ADR-0006). | Domain | Document Identity |
| **Version message** | The Confluence page version's `message` field. MarkSync writes provenance (Git commit head + summary) into it (ADR-0010). | Confluence | — |
| **WebCrypto** | The Web Crypto API (`crypto.subtle`) used for hashing — no external crypto dependency. Standards-compliant across runtimes. | Tooling | — |
| **Zod** | A TypeScript-first runtime typing library used at IO boundaries (config, plan, diagnostics). | Tooling | — |

## Acronyms

_Expand every acronym at first use; keep the expanded list here._

| Acronym | Expansion | First-use location |
|---|---|---|
| ADF | Atlassian Document Format | `doc/overview/glossary.md` / ADR-0005 |
| ADR | Architecture Decision Record | `doc/decisions/` |
| BDR | Business Decision Record | `id-prefix-catalog.md` |
| BDD | Behaviour-Driven Development | `testing-strategy.md` |
| CI | Continuous Integration | `01-north-star.md` |
| CLI | Command-Line Interface | `01-north-star.md` |
| CQL | Confluence Query Language | `doc/inception/integration-scenarios/14-search-cql.md` |
| C4 | Context, Container, Component, Code (diagram levels) | `architecture-overview.md` |
| DOM | Document Object Model | `ADR-0002` |
| DX | Developer Experience | `02-roadmap.md` |
| E2E | End-to-End (test tier) | `TDR-0004` |
| ESM | ECMAScript Modules | `tech-stack.md` |
| FSE | Full-Stack Environment | `fse-audit.md` |
| GFM | GitHub Flavored Markdown | `tech-stack.md` |
| HAST | HTML Abstract Syntax Tree | `tech-stack.md` |
| JTBD | Jobs To Be Done | `personas-jtbd.md` |
| MDAST | Markdown Abstract Syntax Tree | `tech-stack.md` |
| MLP | Minimum Lovable Product | `02-roadmap.md` (MS-0003) |
| MVP | Minimum Viable Product | `02-roadmap.md` (MS-0002) |
| MCP | Model Context Protocol | `02-roadmap.md` |
| NFR | Non-Functional Requirement | `nonfunctional.md` |
| NSM | North Star Metric | `01-north-star.md` |
| ODR | Operational Decision Record | `id-prefix-catalog.md` |
| OAuth 3LO | OAuth 2.0 Three-Legged Authorization | `doc/inception/integration-scenarios/18-oauth-3lo.md` |
| OST | Opportunity-Solution Tree | `opportunity-solution-tree.md` |
| PDR | Product Decision Record | `doc/decisions/PDR-0001` |
| PRD | Product Requirements Document | `project-inception.md` |
| SBOM | Software Bill of Materials | `NFR-SEC-4` |
| SVG | Scalable Vector Graphics | `ADR-0002` |
| TDR | Technical Decision Record | `doc/decisions/TDR-0001` |
| UL | Ubiquitous Language | `ubiquitous-language.md` |
| UUID | Universally Unique Identifier | `ADR-0006` |
| XHTML | EXtensible HyperText Markup Language | `ADR-0005` |

## See also

_Link to the ubiquitous language and any global glossary._

- [`ubiquitous-language.md`](./ubiquitous-language.md) — the binding domain vocabulary (aggregates, entities, value objects, domain events).
- [`id-prefix-catalog.md`](../inception/analysis/id-prefix-catalog.md) — stable ID prefixes (ADR-, MS-, NFR-, INV-, etc.).
- [`01-north-star.md`](./01-north-star.md) — product vision, mission, and strategy.
- [`architecture-overview.md`](./architecture-overview.md) — component map and module governance.
