---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-18
  type: feat
  status: Proposed
  slug: document-identity-uuid-v7
  title: "[MS2-E3-S1] Document identity (UUID v7) + front-matter binding — immutable source-side identity + duplicate-UUID detection fatal before any write"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E3, safe-publish, critical, security]
  version_impact: minor
  audience: internal
  security_impact: medium
  risk_level: high
  dependencies:
    internal: [MS2-E2-S1 (GH-14), MS2-E2-S2 (GH-15), MS2-E2-S3 (GH-16), MS2-E2-S4 (GH-17), MS2-E3-S2 (blocked), MS2-E3-S3 (blocked), MS2-E3-S5 (blocked), MS2-E3-S6 (blocked)]
    external: [uuid (v9+, RFC 9562 v7), yaml (^2.9.0)]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Establish immutable MarkSync document identity — a UUID v7 generated at first-publish and bound into source front-matter (`marksync.uuid`), plus duplicate-UUID detection that is FATAL before any write (INV-SAFE-3) — so each Markdown document has a durable identifier independent of path/title/page-ID, forming the identity half of ADR-0006 (C-1, C-4) and the safety foundation for drift detection and the zero-silent-overwrite brand promise.

## 1. SUMMARY

This is the **first story of epic MS2-E3 (Safe publish core)** and the identity half of ADR-0006. It delivers immutable, source-side document identity: a **UUID v7** generated per managed document and persisted in front-matter under the `marksync.uuid` key; a **`DocumentId`** branded value object (a Ubiquitous-Language term) wrapping a v7 string so a plain string can never be substituted for an identity; **front-matter binding** that writes the UUID once and reads it back byte-stably and idempotently; and a **duplicate-UUID detector** that returns `err(DuplicateUuid)` when two documents share an identity — the pre-write safety gate (INV-SAFE-3 / ADR-0006 C-4). It also fixes the **`PageBinding`** record shape (a Ubiquitous-Language term) as a TYPE with identity-binding semantics only; lock persistence is E3-S2.

This is the identity foundation for the rest of MS2-E3. The lock (E3-S2), the markdown pipeline (E3-S3), drift classification (E3-S5), and the sync engine (E3-S6) all consume the `DocumentId` type, the v7 generator, `readUuid`/`injectUuid`, `detectDuplicateUuids`, and the `PageBinding` shape landed here. Getting identity wrong is a brand-defining failure (R-VAL-4): identity must survive clones, branches, renames, and re-clone without regeneration (ADR-0006 C-1). UUID v7 is chosen over v4/KSUID for time-sortable prefixes + solid library support + zero schema-change cost vs v4 (ADR-0006 Identity section).

> **Invariant naming note:** the GH-18 issue body AC references "INV-SAFE-2", but the duplicate-UUID-fatal invariant is **INV-SAFE-3** per the canonical `id-prefix-catalog.md`, the story file, the feature spec (`feature-safe-publish.md` §5), and ADR-0006 (INV-SAFE-1 = no silent overwrite; INV-SAFE-2 = no silent re-create of REMOTE_MISSING; INV-SAFE-3 = duplicate-UUID fatal). INV-SAFE-3 is the governing invariant for this change; "INV-SAFE-2" in the issue body is a label typo, not blocking.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-14 (MS2-E2-S1) and GH-15 (MS2-E2-S2) are merged** (the story's `blocked_by` dependencies, both satisfied). The codebase has the strict TS+Bun toolchain with binding dep-cruiser tier enforcement (severity `error`), the `Result<T, E>` primitive with `ok`/`err` constructors (`src/domain/result.ts`), and the exhaustive `MarkSyncError` discriminated union with its `assertNeverMarkSyncError` `never`-check (`src/domain/errors.ts`). The `DuplicateUuid` arm **already exists** in that union: `{ kind: "DuplicateUuid"; uuid: string; paths: string[] }` — landed speculatively with the union and already handled in every exhaustive site (`assertNeverMarkSyncError`, the application-tier mapper, `CODE_TO_EXIT` → invariant class 50 / `DUPLICATE_UUID`). This story is the **first consumer** of that arm.
- **GH-16 (CLI framework) and GH-17 (auth provider) are merged** and on `main`. The output pipeline (`CommandResult<T>` + `OutputService` + centralized `Redactor`) and the credential provider exist. The `marksync init` command exists as a config-scaffolding handler (GH-15); this story extends it with the identity-assignment step.
- **The identity and binding modules are empty skeletons.** `src/domain/identity/` and `src/domain/binding/` hold only `.gitkeep` — ready for this story. Per the Ubiquitous-Language binding rule 4, Document Identity logic lives in `src/domain/identity/` and Page Binding logic lives in `src/domain/binding/`; both are domain-tier modules that import nothing.
- **The `yaml` package is installed** (`^2.9.0`, used by the config system GH-15) and is available for front-matter parsing. The **`uuid` package is NOT yet installed** — this is the first consuming story; delivery includes `bun add uuid` (v9+ for the RFC 9562 `v7()` function). `uuid` is on the typescript.md planned-dependency list for MS-0002 E3.
- **ADR-0006 is the load-bearing decision.** Its Identity section mandates UUID v7 in source front-matter (`marksync.uuid`), immutable and path/title/page-ID-independent (C-1); its C-4 constraint mandates duplicate-UUID detection is fatal before any write (INV-SAFE-3); its Verification Criteria fix the "duplicated-UUID fixture aborts with 0 writes" window to MS-0002.
- **CEO-resolved items are binding.** R1 (same-millisecond v7 collision): negligible at target scale (≤500 pages) due to v7's random bits; the duplicate detector is the safety net regardless. Q1 (where to store the UUID): `marksync.uuid`, under the `marksync` namespace alongside other overrides.

### 2.2 Pain Points / Gaps

- **No durable document identity.** Without a UUID, "the same document" is whatever a path or title says it is — both mutable. Renames break identity; re-clone can't recover a binding; two CI runs can't agree. This is exactly the premortem's "wrong state model" failure (§5.1, §5.2) and a brand-defining risk (R-VAL-4).
- **No duplicate-UUID safety gate.** INV-SAFE-3 (and ADR-0006 C-4) require that two source documents sharing an identity halt the entire plan before any write. The `DuplicateUuid` error arm exists in the union but is **unconsumed** — there is no detector that produces it, so the invariant is currently unenforced.
- **No front-matter identity binding.** The UUID must be persisted where it survives clone/branch/CI — i.e., committed in the Markdown file's front-matter — and the write must be byte-stable and idempotent (no whitespace normalization, never overwrite an existing UUID). No such read/write capability exists.
- **No `DocumentId` value object.** Without a branded type, a plain `string` (a path, a title, a page ID) could be passed where an identity is required — a silent correctness hole the type system should close.
- **No `PageBinding` shape.** The lock (E3-S2), drift classifier (E3-S5), and sync engine (E3-S6) all need the durable mapping between a `DocumentId` and a target page. The shape must be fixed once, here, even though persistence is E3-S2.
- **A detection-vs-fatalism tension.** typescript.md frames duplicate-UUID as a `throw` invariant violation (§Error handling), while the story specifies `detectDuplicateUuids(): Result<void, MarkSyncError>`. These must be reconciled by design (DEC-1) so the detector is a pure domain function returning `Result` and the fatal semantics are realized by the caller — consistent with each other and with the push-flow's "FIRST step, halt with zero writes" contract.

## 3. PROBLEM STATEMENT

Because there is no durable document identity, no front-matter UUID binding, no duplicate-UUID detector, and no `DocumentId`/`PageBinding` domain model, MarkSync cannot yet answer "what is the same document across clones/branches/CI, independent of path/title/page-ID" — so drift detection, concurrency control, and the zero-silent-overwrite brand promise have no identity foundation to stand on, and the INV-SAFE-3 safety gate is unenforceable — so this story must build the identity half of ADR-0006 (C-1, C-4) once, before the lock (E3-S2), the markdown pipeline (E3-S3), drift classification (E3-S5), or the sync engine (E3-S6) can be delivered.

## 4. GOALS

- **G-1**: Deliver UUID v7 generation — `generateUuidV7()` producing RFC 9562 v7 strings (time-sortable prefix), plus `isUuidV7(s)` and `assertUuidV7(s)` guards (F-1).
- **G-2**: Deliver the `DocumentId` branded value object — `string & { __brand: "DocumentId" }` — and `parseDocumentId` so an identity is a distinct type, not a plain string (F-2).
- **G-3**: Deliver front-matter identity binding — `injectUuid(source)` (writes a UUID if absent; idempotent; byte-stable) and `readUuid(source)` (F-3).
- **G-4**: Deliver the duplicate-UUID detector — `detectDuplicateUuids(docs)` returning `Result<void, MarkSyncError>` → `err({ kind: "DuplicateUuid", uuid, paths })` when any UUID appears on >1 doc; docs missing a UUID are NOT duplicates (F-4).
- **G-5**: Fix the `PageBinding` record shape as a TYPE with identity-binding semantics only — the durable mapping between a `DocumentId` and a target page; persistence is E3-S2 (F-5).
- **G-6**: Deliver the `marksync init` identity-assignment step — when init discovers managed docs, inject a UUID v7 into each doc's front-matter (write the file). This story implements the assignment step; full init orchestration is later (F-6).
- **G-7**: Verify INV-SAFE-3 fatal semantics at the detector level — a duplicated-UUID fixture yields `err(DuplicateUuid)`; the detector is the pre-write safety gate the push flow (E3-S6) will call FIRST (F-7, DEC-1).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| v7 format correctness | every `generateUuidV7()` output matches the v7 regex (version nibble = 7, RFC 9562 variant); two values generated ≥1 ms apart sort in timestamp order |
| inject idempotency | running `injectUuid` twice on the same source yields the **same UUID** and **byte-identical** output (0 bytes diff vs the first injection) |
| inject body preservation | the Markdown body **below** the front-matter is **byte-identical** before and after injection (0 bytes diff); only the front-matter block changes |
| inject once-only | a source that already has a `marksync.uuid` is returned **unchanged** (0 bytes diff) with its existing UUID; never overwritten |
| duplicate detection | a fixture with two docs sharing `marksync.uuid` → `err(DuplicateUuid)` listing **both** paths; a no-dup corpus → `ok`; a corpus with UUID-less docs → `ok` (UUID-less ≠ duplicate) |
| identity path-independence (ADR-0006 C-1) | a fixture doc renamed/moved (different `sourcePath`) retains its UUID; `readUuid` returns the same `DocumentId` |
| re-clone recovery (ADR-0006 C-1) | a fixture cloned with committed front-matter recovers the same UUIDs **without** regeneration (`injectUuid` is a no-op on already-bound docs) |
| DocumentId branding | a plain `string` is a compile error where a `DocumentId` is required (verified by a `@ts-expect-error` test) |
| duplicate detection scale | `detectDuplicateUuids` over a ≤500-doc corpus completes in **≤ 5 ms (p95)** on reference hardware (O(n)) |
| tier purity | identity/binding modules import **0** app/cli/infra modules; dep-cruiser `domain-may-not-import-*` rules pass |
| quality gate | `bun run check` (lint + typecheck + test + boundaries) exits **0** |

### 4.2 Non-Goals

- **NG-1**: Lock file persistence — E3-S2. This story fixes the `PageBinding` TYPE and identity-binding semantics only; reading/writing the committed lock is E3-S2.
- **NG-2**: Drift classification (`NO_CHANGE` / `LOCAL_AHEAD` / `REMOTE_AHEAD` / `DIVERGED` / `REMOTE_MISSING` / `LOCAL_MISSING`) — E3-S5.
- **NG-3**: The actual write to Confluence (the push/apply flow) — E3-S4 (Confluence adapter) and E3-S6 (sync engine). This story provides the pre-write safety gate the push flow calls FIRST; it does not write.
- **NG-4**: The full `marksync init` orchestration (full discovery, hierarchy, config prompts) — later. This story implements the identity-assignment step only (inject a UUID into each discovered managed doc).
- **NG-5**: The integration-level "duplicate UUID halts the push flow with ZERO writes" end-to-end assertion. The push flow does not exist yet (E3-S6); this story provides the detector + the detector-level `err(DuplicateUuid)` assertion + the fixture. The end-to-end "zero writes" assertion belongs to E3-S6 and the E5-S1 BDD scenario (testing-strategy.md INV-SAFE-3 = Unit + Gherkin).
- **NG-6**: UUID migration tooling for corpora that already have v4/other IDs — MS-0002 is greenfield; no migration path is built.
- **NG-7**: Reconsidering UUID v7 vs v4/KSUID — ADR-0006 is settled and is being **implemented**, not reopened (DEC-3).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | UUID v7 generation + guards | Produces immutable, time-sortable identities (ADR-0006 Identity). `generateUuidV7()` + `isUuidV7(s)` + `assertUuidV7(s)` are the single source of identity minting consumed by `init`, `injectUuid`, and the push flow. |
| F-2 | `DocumentId` value object (branded) | A distinct type for identity so a plain `string` (path/title/page-ID) can never be substituted where a UUID is required. UL-bound; the canonical name in `ubiquitous-language.md`. |
| F-3 | Front-matter identity binding | Persists the UUID where it survives clone/branch/CI: committed in the Markdown front-matter under `marksync.uuid`. `injectUuid` is idempotent and byte-stable; `readUuid` recovers it. |
| F-4 | Duplicate-UUID detector | The pre-write safety gate (INV-SAFE-3 / ADR-0006 C-4). Returns `Result<void, MarkSyncError>` → `err(DuplicateUuid)` when an identity is shared. UUID-less docs are NOT duplicates (they get one at first publish). |
| F-5 | `PageBinding` record shape (TYPE only) | The durable mapping between a `DocumentId` and a target page (UL-bound). This story fixes the TYPE and identity-binding semantics; lock persistence is E3-S2. |
| F-6 | `marksync init` UUID assignment | The identity-assignment step: when init discovers managed docs, inject a UUID v7 into each doc's front-matter (write the file). Full init orchestration is later. |
| F-7 | Duplicate-UUID fatal-semantics verification | A duplicated-UUID fixture yields `err(DuplicateUuid)` at the detector level — the proof that the pre-write safety gate works. The detector is what the push flow (E3-S6) calls FIRST and halts on (DEC-1). |

### 5.1 Capability Details

- **F-1 (UUID v7 generation + guards).** `generateUuidV7(): string` produces RFC 9562 version-7 UUIDs (the `uuid` package v9+ `v7()`). v7 carries a Unix-millisecond timestamp prefix (time-sortable, improving lock-file locality and reducing merge conflicts when two branches add docs concurrently) plus random bits. `isUuidV7(s): boolean` validates the canonical 36-char shape with version nibble = 7 and the RFC 9562 variant; `assertUuidV7(s): asserts s is DocumentId` is the narrowing guard used at boundaries. v7 is chosen over v4 (time-sortable) and KSUID (TS/JS library ecosystem is weak; v7 has zero schema-change cost vs v4) — ADR-0006 Identity section, DEC-3.

- **F-2 (`DocumentId` value object).** `DocumentId` is a branded type `string & { __brand: "DocumentId" }` — a plain `string` is a compile error where a `DocumentId` is required. `parseDocumentId(s): Result<DocumentId, MarkSyncError>` validates a candidate string with `isUuidV7` and returns the branded `DocumentId` or a typed error. `DocumentId` is the Ubiquitous-Language term for the Document Identity value (the UUID itself); it is the canonical identifier every downstream consumer (`PageBinding.uuid`, the lock, drift, sync) declares. The aggregate root is Document Identity; its logic lives in `src/domain/identity/` (UL binding rule 4).

- **F-3 (Front-matter identity binding).** `injectUuid(source: string): { source: string; uuid: DocumentId }` reads a Markdown document; if a `marksync.uuid` is **absent**, it generates one (F-1) and writes it into the front-matter under the `marksync` namespace (DEC-2) using the installed `yaml` parser, returning the updated source + the UUID. If a UUID is **already present**, it is returned unchanged — **never overwritten** (idempotent). The write touches **only** the front-matter block: the Markdown body below it is byte-identical before and after. No whitespace normalization occurs — the rest of the front-matter and the document are preserved byte-for-byte. `readUuid(source): DocumentId | undefined` recovers the UUID from front-matter (or returns `undefined` if absent/malformed/missing front-matter — it never throws). The key is `marksync.uuid` (CEO Q1), consistent with the existing `marksync.*` front-matter override namespace consumed by the GH-15 document-config resolver.

- **F-4 (Duplicate-UUID detector).** `detectDuplicateUuids(docs: { path: string; uuid?: DocumentId }[]): Result<void, MarkSyncError>` is a pure O(n) function (a `Map<uuid, path[]>`). If any UUID appears on **more than one** document, it returns `err({ kind: "DuplicateUuid"; uuid; paths })` (the first collision encountered; the paths are the offending documents). If no UUID is shared, it returns `ok`. **A document with no UUID is NOT a duplicate** — it simply has not been assigned an identity yet and will get one at first publish (`injectUuid`). The detector imports only domain primitives (`Result`, `MarkSyncError`) — no infra/app/cli.

- **F-5 (`PageBinding` record shape — TYPE only).** The `PageBinding` record (UL term) is the durable mapping between a `DocumentId` and a target page. The shape fixed here (per ADR-0006 Alt-1 + the blueprint §3 schema) is: `{ uuid: DocumentId; sourcePath: string; pageId: string; parentPageId: string; pageVersion: number; sourceCommit: string; sourceContentHash: string; renderedBodyHash: string; remoteBodyHash: string; attachmentHashes: Record<string, string>; operationId: string; synchronizedAt: string; toolVersion: string }`. This story defines the **type** and the **identity-binding semantics** (the `uuid` field binds a `DocumentId` to a page; `pageId` is the mutable remote identity recorded in the lock) — **not** persistence. Reading/writing the committed, versioned lock is E3-S2. Page Binding logic lives in `src/domain/binding/` (UL binding rule 4).

- **F-6 (`marksync init` UUID assignment).** When `marksync init` discovers managed documents (per the GH-15 file-selection + document-config resolution), it runs `injectUuid` on each discovered managed doc and **writes the file** with the injected UUID. This is the identity-assignment step ADR-0006 Implementation-Plan item 1 calls for. Full `init` orchestration (interactive prompts, hierarchy, full discovery) is out of scope (NG-4); this story wires only the identity-assignment step.

- **F-7 (Duplicate-UUID fatal-semantics verification).** A fixture with two documents sharing `marksync.uuid` is fed to `detectDuplicateUuids`; the result is `err({ kind: "DuplicateUuid"; uuid; paths: [both paths] })`. This is the detector-level proof of INV-SAFE-3 / ADR-0006 C-4. The end-to-end "the push flow halts with ZERO writes" assertion belongs to E3-S6 (the push flow does not exist yet) and the E5-S1 BDD scenario — but the **fixture and the detector-level assertion originate here** (story Test matrix). The detector returns `Result` so the caller decides fatality; the push flow (E3-S6) treats the `err` as fatal and halts before any write (DEC-1).

## 6. USER & SYSTEM FLOWS

```
Flow 1 — First-publish identity assignment (marksync init):
  Operator runs `marksync init` (or a later first-publish path)
    → init discovers managed docs (GH-15 file selection)
    → for each doc: readUuid(source)
       → absent → generateUuidV7() → injectUuid writes marksync.uuid → file written
       → present → leave unchanged (idempotent; never overwrite)
    → each managed doc now carries an immutable UUID v7 in committed front-matter.

Flow 2 — Identity survives clone/branch/rename (ADR-0006 C-1):
  A doc is moved/renamed in Git (different sourcePath)
    → readUuid(source) returns the SAME DocumentId (UUID is in front-matter, not the path)
  A fresh clone checks out the committed Markdown
    → readUuid(source) recovers the same UUIDs WITHOUT regeneration (injectUuid is a no-op).

Flow 3 — Pre-write duplicate-UUID safety gate (INV-SAFE-3 / ADR-0006 C-4):
  Push flow (E3-S6, later) gathers docs → detectDuplicateUuids(docs) as the FIRST step
    → no shared UUID → ok → proceed to plan
    → two docs share a UUID → err(DuplicateUuid{ uuid, paths })
       → caller treats as FATAL → halt with ZERO writes (this story proves the detector arm;
         the push-flow wiring + end-to-end "zero writes" is E3-S6 / E5-S1 BDD).

Flow 4 — Identity flows into the PageBinding (consumed by E3-S2/E3-S5/E3-S6):
  A PageBinding is constructed { uuid: DocumentId, sourcePath, pageId, ... }
    → the uuid field binds this DocumentId to a target page
    → persisted in the committed lock (E3-S2); compared for drift (E3-S5); updated on sync (E3-S6).
  This story fixes the TYPE; persistence is E3-S2.

Flow 5 — DuplicateUuid error flows through the GH-16 output contract (already wired):
  detectDuplicateUuids returns err(DuplicateUuid)
    → (at the push-flow boundary, E3-S6) the application tier maps kind:"DuplicateUuid"
       → { code, message, retryable:false } → CODE_TO_EXIT → invariant class 50
    → OutputService redacts + renders → non-zero exit. No write occurred.
  The error arm and its mapping already exist (GH-14/GH-16); this story is the first producer.
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- UUID v7 generation + `isUuidV7` + `assertUuidV7` guards (F-1).
- The `DocumentId` branded value object + `parseDocumentId` (F-2).
- Front-matter identity binding — `injectUuid` (idempotent, byte-stable, once-only) + `readUuid` (F-3).
- The duplicate-UUID detector — `detectDuplicateUuids` → `err(DuplicateUuid)` (F-4).
- The `PageBinding` record shape as a TYPE + identity-binding semantics (F-5).
- The `marksync init` identity-assignment step (F-6).
- Detector-level INV-SAFE-3 verification (duplicated-UUID fixture → `err(DuplicateUuid)`) + the fixture (F-7).
- Installing `uuid` (v9+) as the first consuming story (delivery detail).

### 7.2 Out of Scope

- [OUT] Lock file persistence (committed, versioned lock read/write) — E3-S2 (NG-1).
- [OUT] Drift classification (6-state classifier, canonical hashing) — E3-S5 (NG-2).
- [OUT] The actual write to Confluence (Confluence adapter + sync engine) — E3-S4 / E3-S6 (NG-3).
- [OUT] Full `marksync init` orchestration (interactive prompts, full discovery, hierarchy) — later (NG-4).
- [OUT] The end-to-end "duplicate UUID halts the push flow with ZERO writes" assertion — E3-S6 + E5-S1 BDD; this story contributes the detector + detector-level assertion + fixture (NG-5).
- [OUT] UUID migration tooling for v4/other-ID corpora — MS-0002 is greenfield (NG-6).
- [OUT] Reconsidering UUID v7 vs v4/KSUID — ADR-0006 is settled (NG-7, DEC-3).

### 7.3 Deferred / Maybe-Later

- **End-to-end INV-SAFE-3 BDD scenario** — the Gherkin step definition lives in E5-S1 (testing-strategy.md INV-SAFE-3 = Unit + Gherkin); this story contributes the fixture + the detector-level assertion it originates from.
- **Lock persistence of `PageBinding`** — E3-S2 consumes the type landed here; revisit if the type needs a field the lock format can't express.
- **UUID regeneration / re-binding tooling** — a `repair-state` path (R-USA-3) may need to re-bind a corrupted identity; deferred to the repair story.
- **`marksync.uuid` collision reporting beyond the first** — the detector reports the first collision; a "report all collisions" mode is deferred unless operations need it.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A — this story introduces no HTTP endpoints and contacts no remote system. Identity is entirely source-side and local. The Confluence adapter (E3-S4) and the push flow (E3-S6) are downstream consumers.

### 8.2 Events / Messages

No events are introduced. The Ubiquitous-Language defines a **"Duplicate UUID Detected"** domain event (triggers → Halt) as the conceptual signal, but this story realizes it as the `err(DuplicateUuid)` return of the detector (a `Result` value, not an emitted event) — the push flow (E3-S6) consumes it. No event bus / pub-sub is wired in MS-0002.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `DocumentId` | Branded value object `string & { __brand: "DocumentId" }`. The canonical identity value. Constructed only via `generateUuidV7()` + branding or `parseDocumentId` (which validates v7 first). UL-bound. |
| DM-2 | `marksync.uuid` front-matter key | The single identity-bearing front-matter field, under the `marksync` namespace (DEC-2). Value is a v7 UUID string. Consumed by `readUuid`/`injectUuid` and the GH-15 document-config resolver's `uuid` override path. |
| DM-3 | `PageBinding` record | `{ uuid: DocumentId; sourcePath; pageId; parentPageId; pageVersion; sourceCommit; sourceContentHash; renderedBodyHash; remoteBodyHash; attachmentHashes: Record<string,string>; operationId; synchronizedAt; toolVersion }`. UL-bound. TYPE + identity-binding semantics only; persistence is E3-S2. |
| DM-4 | `detectDuplicateUuids` detector input shape | `{ path: string; uuid?: DocumentId }[]` — a list of documents with optional identities. A missing `uuid` is not a duplicate. |
| DM-5 | `DuplicateUuid` error arm (reused, first-consumed) | `{ kind: "DuplicateUuid"; uuid: string; paths: string[] }` — already in `MarkSyncError` (GH-14) and already mapped to invariant exit class 50 / `DUPLICATE_UUID` (GH-16). This story is the first **producer**. |

> Note: `Result<T, E>` and the `DuplicateUuid` arm already exist (GH-14/GH-16). This story adds **no** new domain error kind and **no** new presentation-layer code/exit mapping — it is the first consumer of an arm landed speculatively. The net-new domain types are `DocumentId` (DM-1) and `PageBinding` (DM-3).

### 8.4 External Integrations

No external services are contacted. The runtime dependency introduced is **`uuid`** (v9+, RFC 9562 `v7()`) — on the typescript.md planned-dependency list for MS-0002 E3 and the first consuming story. The existing **`yaml`** (^2.9.0) is reused for front-matter parsing. Both are zero/low-transitive-dependency, MIT-licensed, Bun-compatible; transitive-dependency count and licenses are verified at delivery (NFR-SEC-4). No HTTP/crypto/coloring libraries.

### 8.5 Backward Compatibility

N/A for released artifacts — MS-0002 is pre-release (v0.0.0). This story populates two empty skeleton modules (`src/domain/identity/`, `src/domain/binding/`) and extends the existing `marksync init` command with an additive identity-assignment step. It adds **no** new `MarkSyncError` kind and **no** new presentation-layer code/exit mapping — the `DuplicateUuid` arm and its pipeline were landed speculatively in GH-14/GH-16. The `marksync.uuid` front-matter key is net-new in committed Markdown; on a corpus where it is absent, `injectUuid` adds it; where present, it is preserved (never overwritten). The `DocumentId` / `PageBinding` types are new — no existing consumer breaks.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | v7 format correctness | every `generateUuidV7()` output matches the v7 regex (canonical 36-char, version nibble = 7, RFC 9562 variant); two values generated ≥1 ms apart sort in non-descending order (time-sortable prefix) |
| NFR-2 | inject idempotency | running `injectUuid` twice on the same source yields the **same UUID** and **byte-identical** output (0 bytes diff vs the first injection) |
| NFR-3 | inject body preservation | the Markdown body **below** the front-matter is **byte-identical** before and after injection (0 bytes diff); no whitespace normalization |
| NFR-4 | inject once-only | a source that already has a `marksync.uuid` is returned **unchanged** (0 bytes diff) with its existing UUID; never overwritten |
| NFR-5 | readUuid tolerance | a source with absent/malformed front-matter or a non-v7 `marksync.uuid` → `readUuid` returns `undefined` and **never throws** |
| NFR-6 | duplicate detection (collision) | a fixture with two docs sharing `marksync.uuid` → `err(DuplicateUuid)` listing **both** paths |
| NFR-7 | duplicate detection (clean) | a no-dup corpus → `ok`; a corpus containing UUID-less docs → `ok` (UUID-less ≠ duplicate) |
| NFR-8 | identity path-independence (ADR-0006 C-1) | a fixture doc renamed/moved (different `sourcePath`) retains its UUID; `readUuid` returns the same `DocumentId` |
| NFR-9 | re-clone recovery (ADR-0006 C-1) | a fixture with committed front-matter recovers the same UUIDs **without** regeneration (`injectUuid` is a no-op on already-bound docs) |
| NFR-10 | DocumentId branding | a plain `string` is a compile error where a `DocumentId` is required (verified by a `@ts-expect-error` test) |
| NFR-11 | duplicate detection scale | `detectDuplicateUuids` over a ≤500-doc corpus completes in **≤ 5 ms (p95)** on reference hardware (O(n), single pass) |
| NFR-12 | tier purity | identity/binding modules import **0** app/cli/infra modules; dep-cruiser `domain-may-not-import-infra|-app|-cli` rules pass |
| NFR-13 | dependency hygiene | `uuid` is a runtime dep on the allowed/planned list; **≤ 20** transitive dependencies; license-audit rejects GPL/AGPL/LGPL/UNLICENSED (NFR-SEC-4) |
| NFR-14 | quality gate | `bun run check` (lint + typecheck + test + boundaries) exits **0** |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry (NFR-SEC-3 — no outbound telemetry). Observability for identity flows through the established GH-16 contract: a `DuplicateUuid` detection surfaces (at the push-flow boundary, E3-S6) as `CommandResult.error: { code: "DUPLICATE_UUID", message (redacted), retryable: false }` with a **stable** `code` (NFR-OBS-3), already mapped to invariant exit class 50. Per typescript.md logging conventions, no raw detector input (document paths, UUIDs beyond what is needed for the diagnostic) is serialized to logs — only structural identifiers (`{ kind: "DuplicateUuid" }`); the `paths[]` and `uuid` on the error arm are operational context surfaced via the stable `error` channel, not free-form logging. UUIDs are not secrets (they are committed in source front-matter) but are treated as structured data, not log prose.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Brand-defining failure: identity is wrong (path/title-bound, non-idempotent, lost on re-clone) — undermines the entire safety promise (R-VAL-4) | H | M | Implement strictly per ADR-0006 C-1: UUID in committed front-matter, branded `DocumentId`, byte-stable idempotent injection; verify path-independence (NFR-8) and re-clone recovery (NFR-9) with fixtures; `bun run check` gates. | L |
| RSK-2 | Front-matter byte-stability break: `injectUuid` normalizes whitespace / reorders keys / alters the body, producing noisy diffs and merge conflicts | H | M | Touch **only** the front-matter block via the `yaml` parser; preserve the rest byte-for-byte; assert body + second-run output are byte-identical (NFR-2, NFR-3). | L |
| RSK-3 | Result-vs-throw tension: typescript.md frames duplicate-UUID as a `throw` invariant, but the story specifies `detectDuplicateUuids(): Result<void, MarkSyncError>` — inconsistent fatality semantics | M | M | DEC-1: the detector is a pure domain function returning `Result` (caller decides fatality); the push flow (E3-S6) treats the `err` as fatal and halts with zero writes. The `throw` guidance applies to the push-flow boundary, not the pure detector. Verified at detector level here (F-7); end-to-end at E3-S6 / E5-S1. | L |
| RSK-4 | Same-millisecond UUID v7 collision (two devs add docs concurrently) | M | L | v7 carries random bits beyond the timestamp; collision probability is negligible at target scale (≤500 pages). The duplicate detector (F-4) is the safety net regardless — a collision becomes a fatal, diagnosable error, not a silent corruption. CEO-recorded (R1). | L |
| RSK-5 | `uuid` package fails under `bun build --compile` (native-ish concerns, ESM shape) | M | L | `uuid` is a pure-JS zero-dependency library on the allowed/planned list; the delivery smoke-test gate (`bun build --compile`) catches a compile failure before merge (consistent with the TDR-0002 precedent). | L |
| RSK-6 | A UUID-less corpus is misclassified as "all duplicates" (the detector treats missing UUIDs as duplicates) | H | L | Explicit: docs missing a UUID are **NOT** duplicates (F-4, NFR-7); a unit test asserts a UUID-less corpus → `ok`. | L |
| RSK-7 | `marksync init` overwrites an existing committed UUID (data loss of an established identity) | H | L | `injectUuid` is once-only by construction (NFR-4): a present UUID is returned unchanged, never overwritten; a unit test asserts 0 bytes diff on an already-bound source. | L |

## 12. ASSUMPTIONS

- GH-14 (MS2-E2-S1) and GH-15 (MS2-E2-S2) are merged and provide `Result<T, E>` with `ok`/`err`, the `MarkSyncError` union + `assertNeverMarkSyncError`, and the `DuplicateUuid` arm `{ kind: "DuplicateUuid"; uuid; paths }` already handled in every exhaustive site (mapper + `CODE_TO_EXIT` → invariant class 50 / `DUPLICATE_UUID`). This story is the first producer; no error-model change is needed.
- GH-16 (CLI framework) and GH-17 (auth provider) are merged; the output pipeline and credential provider exist and are reused unchanged.
- ADR-0006 (C-1 identity survives clones/branches/renames; C-4 duplicate fatal) and its Identity section (UUID v7 choice; `marksync.uuid` key) are settled and being **implemented**, not reconsidered.
- The CEO-resolved items are binding: R1 (same-millisecond v7 collision is negligible; the detector is the safety net); Q1 (UUID stored at `marksync.uuid` under the `marksync` namespace).
- The `yaml` package (^2.9.0, from GH-15) is available for front-matter parsing; the `uuid` package (v9+) is installed as part of delivery (first consuming story; on the typescript.md planned list).
- The GH-15 document-config resolver already reads a `marksync.uuid` front-matter override path; this story makes `marksync.uuid` the identity-bearing field, consistent with that namespace.
- The `src/domain/identity/` and `src/domain/binding/` skeletons are empty and ready; identity/binding are domain-tier modules that import nothing (UL binding rule 4).
- The Ubiquitous-Language terms `DocumentId` and `PageBinding` are the canonical code identifiers (UL binding rules 1–2); no synonyms.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E2-S1 (GH-14) | Provides `Result<T,E>`, `MarkSyncError`/`assertNeverMarkSyncError`, the `DuplicateUuid` arm (first consumer), the TS+Bun toolchain, dep-cruiser enforcement, binding CI. Merged. |
| Depends on | MS2-E2-S2 (GH-15) | Provides the config system, the `yaml` dependency, the document-config resolver's `marksync.*` namespace, and the `marksync init` command this story extends. Merged. |
| Depends on | MS2-E2-S3 (GH-16) | Provides the `CommandResult<T>`/`OutputService` contract the `DuplicateUuid` arm already maps to (invariant class 50). Merged. |
| Depends on | ADR-0006 | The load-bearing decision: C-1 (identity survives), C-4 (duplicate fatal), the Identity section (UUID v7, `marksync.uuid`), the `PageBinding` schema. |
| Depends on | typescript.md | Tier rules (identity/binding are domain, import nothing), branded-type pattern, `Result<T,E>`, `#imports` aliases, allowed/planned dependency list (`uuid`). |
| Depends on | ubiquitous-language.md | `DocumentId`, `PageBinding`, "Duplicate UUID Detected" event are UL terms that bind to code (rules 1, 2, 4, 5). |
| Depends on | testing-strategy.md | INV-SAFE-3 = Unit + Gherkin; over-mocking guardrail (domain logic tested with real inputs). |
| Depends on | `uuid` (v9+) | RFC 9562 `v7()`. First consuming story — installed at delivery. |
| Blocks | MS2-E3-S2 (lock / state manager) | Consumes the `PageBinding` type + `DocumentId`. |
| Blocks | MS2-E3-S3 (markdown pipeline) | Consumes `readUuid`/`injectUuid`/`DocumentId`. |
| Blocks | MS2-E3-S5 (drift classifier) | Consumes `DocumentId` + `PageBinding`. |
| Blocks | MS2-E3-S6 (sync engine / push flow) | Consumes `generateUuidV7`, `DocumentId`, `detectDuplicateUuids` (the FIRST-step pre-write gate), `PageBinding`. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Should `assertUuidV7` throw or return `Result` on a malformed input? | typescript.md's "assertXxx" naming convention implies a throw/narrow; `parseDocumentId` already provides the `Result` path. | Resolved for delivery: `assertUuidV7` is an assertion-style narrowing guard (`asserts s is DocumentId`) used at internal boundaries where a non-v7 is a programmer error; `parseDocumentId` is the `Result`-returning path for untrusted input. (Specification detail — no `@decision-advisor` escalation.) |
| OQ-2 | Exact `uuid` version pin + whether to add `@types/uuid`. | `uuid` ships its own types; the version is locked after the `bun build --compile` smoke test (TDR-0002 precedent). | Resolve at delivery via the smoke-test gate. (Specification detail — no `@decision-advisor` escalation.) |

> No question requires `@decision-advisor` escalation: ADR-0006 is settled, and the CEO-resolved items (R1, Q1) are binding. The detection-vs-throw tension is resolved by DEC-1.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **`detectDuplicateUuids` returns `Result<void, MarkSyncError>`; fatal semantics are realized by the caller (E3-S6), not the detector (resolves the Result-vs-throw tension).** The detector is a pure domain function: it returns `err({ kind: "DuplicateUuid"; uuid; paths })` on a collision and `ok` otherwise. It does **not** throw. The push flow (E3-S6) calls it as the FIRST step and treats the `err` as fatal — halting with zero writes (INV-SAFE-3 / ADR-0006 C-4). | typescript.md (§Error handling) frames duplicate-UUID as a `throw` invariant violation, while the story specifies `detectDuplicateUuids(): Result<void, MarkSyncError>`. These are consistent once split by responsibility: a pure detector returns `Result` so any caller can branch (testability + the over-mocking guardrail — domain logic returns values, not throws), and the *operational* fatality (halt the plan, zero writes) is the push-flow boundary's job, where `throw`/map-to-`CommandResult` is appropriate. This story proves the detector arm (F-7); the end-to-end "zero writes" wiring is E3-S6 / E5-S1 BDD (NG-5). | 2026-07-09 |
| DEC-2 | **The UUID is stored at `marksync.uuid` under the `marksync` namespace** (alongside the existing `marksync.*` front-matter overrides consumed by the GH-15 document-config resolver). | CEO-resolved (story Q1). One namespace for all MarkSync front-matter; the resolver already reads `marksync.uuid` as an override path, so making it the identity-bearing field is consistent and avoids a second namespace. | 2026-07-09 |
| DEC-3 | **UUID v7 over v4/KSUID**, via the `uuid` package v9+ (RFC 9562 `v7()`). | ADR-0006 Identity section: v7 is time-sortable (improves lock-file locality + reduces merge conflicts when two branches add docs); KSUID was rejected on TS/JS-library weakness (the original `ksuid` npm is unmaintained; alternatives unproven); v7 has the same 36-char shape as v4 (zero schema-change cost) and solid library support. | 2026-07-09 |
| DEC-4 | **`DocumentId` is a branded type** `string & { __brand: "DocumentId" }`, constructed only via `generateUuidV7()` + branding or `parseDocumentId` (which validates v7 first). | A plain `string` (path/title/page-ID) must never stand where an identity is required. Branding makes that a compile error (NFR-10), closing a silent-correctness hole the type system can enforce for free. `DocumentId` is the UL term (binding rule 1). | 2026-07-09 |
| DEC-5 | **`PageBinding` is landed as a TYPE + identity-binding semantics only; lock persistence is E3-S2.** The shape matches ADR-0006 Alt-1 + blueprint §3 (`uuid`, `sourcePath`, `pageId`, `parentPageId`, `pageVersion`, `sourceCommit`, `sourceContentHash`, `renderedBodyHash`, `remoteBodyHash`, `attachmentHashes`, `operationId`, `synchronizedAt`, `toolVersion`). | E3-S2/S5/S6 all need the shape; fixing it once here unblocks them. Persisting (atomic write, line-oriented mergeable format, committed) is a distinct concern owned by E3-S2 (ADR-0006 Shared base). Landing the type now does not commit to a persistence format. | 2026-07-09 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| Identity module (`src/domain/identity/`) | New — `generateUuidV7`/`isUuidV7`/`assertUuidV7`, `DocumentId`/`parseDocumentId`, `injectUuid`/`readUuid`, `detectDuplicateUuids` (UL binding rule 4 residence) |
| Binding module (`src/domain/binding/`) | New — `PageBinding` record shape (TYPE + identity-binding semantics; UL binding rule 4 residence) |
| `marksync init` identity-assignment step | Extended — inject a UUID v7 into each discovered managed doc's front-matter (additive to the GH-15 config-scaffolding handler) |
| `MarkSyncError` union + exhaustive sites | Unchanged — the `DuplicateUuid` arm and its mapper/`CODE_TO_EXIT` mapping already exist (GH-14/GH-16); this story is the first producer |
| Front-matter contract (`marksync.uuid`) | New — the single identity-bearing front-matter field (consistent with the existing `marksync.*` namespace) |
| Runtime dependency (`uuid`) | New (v9+; first consuming story; on the typescript.md planned list) |

## 17. ACCEPTANCE CRITERIA

> Each AC maps to the story file's acceptance criteria (INV-SAFE-3, v7 generation, inject idempotency, path-independence, re-clone recovery, `bun run check` + boundary), which constitute the Definition of Done.

| ID | Criterion | Linked | Story AC |
|----|-----------|--------|----------|
| AC-F1-1 | **Given** `generateUuidV7()` is called, **when** its output is validated, **then** it matches the v7 regex (version nibble = 7, RFC 9562 variant) and two values generated ≥1 ms apart sort in non-descending order. | F-1, NFR-1 | v7 generation |
| AC-F3-1 | **Given** a Markdown source without a `marksync.uuid`, **when** `injectUuid` runs, **then** it returns a source with `marksync.uuid` set to a fresh v7; and **when** `injectUuid` runs **again** on that result, **then** the UUID is **unchanged** and the output is **byte-identical** (0 bytes diff) — idempotent. | F-3, NFR-2, NFR-4 | inject idempotency |
| AC-F3-2 | **Given** a Markdown source with body content, **when** `injectUuid` runs, **then** the body **below** the front-matter is **byte-identical** before and after (0 bytes diff; no whitespace normalization); and **given** a source that already has a `marksync.uuid`, **when** `injectUuid` runs, **then** it is returned **unchanged** (0 bytes diff) — once-only. | F-3, NFR-3, NFR-4 | inject idempotency |
| AC-F3-3 | **Given** a source with absent/malformed front-matter or a non-v7 `marksync.uuid`, **when** `readUuid` runs, **then** it returns `undefined` and **does not throw**. | F-3, NFR-5 | (readUuid tolerance) |
| AC-F4-1 (INV-SAFE-3) | **Given** a fixture with two documents sharing the same `marksync.uuid`, **when** `detectDuplicateUuids` runs, **then** it returns `err({ kind: "DuplicateUuid"; uuid; paths: [both paths] })`. | F-4, F-7, DM-5, NFR-6 | INV-SAFE-3 |
| AC-F4-2 | **Given** a corpus with no shared UUIDs (including docs with **no** UUID), **when** `detectDuplicateUuids` runs, **then** it returns `ok` (UUID-less ≠ duplicate). | F-4, NFR-7 | (no-dup / UUID-less) |
| AC-F2-1 | **Given** a plain `string` is passed where a `DocumentId` is required, **when** the code is type-checked, **then** it is a compile error (verified by a `@ts-expect-error` test); and `parseDocumentId` of a valid v7 returns a `DocumentId`, of an invalid string returns a typed error. | F-2, DM-1, NFR-10 | (DocumentId branding) |
| AC-F1-2 (ADR-0006 C-1, path-independence) | **Given** a fixture document is moved/renamed (different `sourcePath`), **when** `readUuid` runs on the moved source, **then** it returns the **same** `DocumentId`. | F-2, F-3, NFR-8 | identity independent of path |
| AC-F1-3 (ADR-0006 C-1, re-clone recovery) | **Given** a fixture with committed front-matter (UUID present), **when** `injectUuid` runs, **then** it is a **no-op** (0 bytes diff) and returns the existing UUID — recovered **without** regeneration. | F-3, NFR-9 | re-clone recovery |
| AC-F4-3 | **Given** a ≤500-doc corpus, **when** `detectDuplicateUuids` runs, **then** it completes in **≤ 5 ms (p95)** on reference hardware (O(n), single pass). | F-4, NFR-11 | (scale) |
| AC-F1-4 | **Given** the identity/binding modules are domain-tier, **when** `bun run check` (lint + typecheck + test + boundaries) runs, **then** it exits **0** — identity/binding import **0** app/cli/infra modules (dep-cruiser `domain-may-not-import-*` pass). | F-1..F-5, NFR-12, NFR-14 | `bun run check` green + boundary |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main`.** Depends on GH-14 + GH-15 (both merged); GH-16/GH-17 (merged) are reused unchanged. Blocks E3-S2, E3-S3, E3-S5, E3-S6.
- **Merge strategy:** Conventional Commits (TDR-0008); commit type `feat` with a `domain/identity` (or `feat(identity)`) scope is appropriate.
- **Ordering within the story:** install `uuid` (v9+) and verify the `bun build --compile` smoke test FIRST (RSK-5), then land the pure domain modules (`DocumentId` F-2, the v7 generator F-1, the detector F-4, the `PageBinding` type F-5) — these are independent and each testable in isolation. Land `injectUuid`/`readUuid` (F-3) with its byte-stability + idempotency tests together so the byte-stable contract is consistent from the first commit (RSK-2). Land the `marksync init` assignment step (F-6) last, after `injectUuid` is proven. The INV-SAFE-3 fixture + detector assertion (F-7) lands with the detector.
- **After merge:** E3-S2 consumes `PageBinding` + `DocumentId`; E3-S3 consumes `readUuid`/`injectUuid`; E3-S5 consumes `DocumentId`/`PageBinding`; E3-S6 consumes `generateUuidV7`, `DocumentId`, `detectDuplicateUuids` (the FIRST-step pre-write gate), and `PageBinding`. The `DuplicateUuid` arm becomes a *produced* error, not just a speculatively-landed one.
- **Communication:** the PR description should note the DEC-1 detection-vs-throw resolution, the `DocumentId`/`PageBinding` UL-bound types, the byte-stable `injectUuid` contract, the `marksync.uuid` namespace (DEC-2), and the UUID-v7 choice (DEC-3) so downstream stories align.
- **Phase 7 doc-sync (`@doc-syncer`):** update `ubiquitous-language.md` to bind `DocumentId` and `PageBinding` to their code constructs (rules 1, 2 — the UL entries already exist; this PR makes them live); update `feature-safe-publish.md` §3.1 (Document identity capability → current-truth once implemented); `id-prefix-catalog.md` (INV-SAFE-3 — now produced); ADR-0006 Implementation-Plan item 1 (`marksync init`/first-publish generates a UUID — delivered here) and the `PageBinding` type item.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A for migration — MS-0002 is greenfield; no corpus carries a prior identity scheme (NG-6). The **seeding** artifact is the `marksync init` identity-assignment step (F-6): on a UUID-less corpus, init injects a fresh v7 into each discovered managed doc's front-matter; on an already-bound corpus, init is a no-op (NFR-9). There is no migration from v4/other IDs in MS-0002.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A for personal data — document identity is a UUID v7 (a randomized, non-identifying token) stored in committed Markdown front-matter; it carries no personal/PII data. The `paths[]` on a `DuplicateUuid` error are source file paths (already part of the committed corpus), not personal data. No outbound telemetry (NFR-SEC-3); no external system is contacted by this story. The UUID is not a secret (it is committed in source), but it is treated as structured operational data, not free-form log prose (§10).

## 21. SECURITY REVIEW HIGHLIGHTS

- **INV-SAFE-3 enforced via the detector + the established error pipeline.** A duplicate identity yields `err(DuplicateUuid)` (F-4); the arm already maps to invariant exit class 50 / `DUPLICATE_UUID` (GH-16). The detector is the pre-write safety gate the push flow (E3-S6) calls FIRST (DEC-1).
- **Identity integrity is a security-adjacent property.** A corrupted/swapped identity (path-bound, overwritten, lost on re-clone) would let the wrong document bind to a page — the foundation of a silent-overwrite. Byte-stable idempotent injection (NFR-2/3/4), path-independence (NFR-8), re-clone recovery (NFR-9), and once-only assignment (RSK-7) close this by construction.
- **No new error arm, no new presentation surface.** This story produces an existing arm; it adds no new `MarkSyncError` kind and no new code/exit mapping, so the exhaustive-integrity guarantees from GH-14/GH-16 are unchanged.
- **Dependency supply chain.** `uuid` (v9+) is a pure-JS, zero/low-transitive-dependency, MIT-licensed library on the allowed/planned list; `bun build --compile` smoke-tested at delivery (RSK-5); license-audit rejects copyleft (NFR-13, NFR-SEC-4).
- **No secrets in identity.** The `marksync.uuid` is a randomized identifier, not a credential; it is safe to commit and surface. No credential is read, stored, or emitted by this story.

## 22. MAINTAINABILITY & OPERATIONS IMPACT

- **The identity contract is a hard shared contract.** E3-S2/S3/S5/S6 all consume `DocumentId`, `generateUuidV7`, `readUuid`/`injectUuid`, `detectDuplicateUuids`, and `PageBinding`; signature/type changes ripple to all four. The branded `DocumentId` (DEC-4) and the fixed `PageBinding` shape (DEC-5) are the stable seams.
- **Adding a new identity consumer is cheap.** A consumer calls `readUuid`/`parseDocumentId` and receives a branded `DocumentId`; the type system prevents misuse. The detector is a pure function reusable by any flow that needs the pre-write gate.
- **The byte-stability bar is set here.** `injectUuid`'s "touch only the front-matter, preserve the rest byte-for-byte" discipline (NFR-2/3) is the standing precedent for any future front-matter-writing capability (e.g. the lock cross-check, the content-property mirror).
- **The error arm graduates from speculative to produced.** The `DuplicateUuid` arm was landed speculatively in GH-14; this story is its first producer, exercising the full `kind → code → exitCode` pipeline end-to-end at the detector level (the push-flow wiring is E3-S6).
- **Tier discipline is exercised here.** Identity/binding are pure domain modules that import nothing (UL binding rule 4 + dep-cruiser) — the precedent for the rest of the safe-publish domain (state classifier, hierarchy planner) landing in `src/domain/`.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Document identity | The immutable, source-side identity of a managed document: a UUID v7 in front-matter. Survives clones, branches, CI, and title/path changes (ADR-0006 C-1). |
| `DocumentId` | The branded value object `string & { __brand: "DocumentId" }` wrapping a v7 UUID. UL-bound. Constructed only via `generateUuidV7()` + branding or `parseDocumentId`. |
| `marksync.uuid` | The single identity-bearing front-matter field, under the `marksync` namespace (DEC-2). |
| `generateUuidV7` | Produces an RFC 9562 version-7 UUID (time-sortable prefix + random bits) via the `uuid` package v9+. |
| `injectUuid` | Writes a v7 UUID into a doc's front-matter if absent; idempotent, byte-stable, once-only. Returns `{ source, uuid }`. |
| `readUuid` | Recovers the `DocumentId` from a doc's front-matter, or `undefined` (never throws). |
| `detectDuplicateUuids` | Pure O(n) detector: `err(DuplicateUuid)` if any UUID is shared by >1 doc; `ok` otherwise. UUID-less docs are not duplicates. |
| `DuplicateUuid` | The `MarkSyncError` arm `{ kind: "DuplicateUuid"; uuid; paths }` — already in the union (GH-14); first produced here; maps to invariant exit class 50. |
| `PageBinding` | The durable mapping between a `DocumentId` and a target page (UL-bound). TYPE + identity-binding semantics landed here; persistence is E3-S2. |
| INV-SAFE-3 | The invariant: duplicate UUID is fatal before any write (ADR-0006 C-4; feature-safe-publish.md §5). (The GH-18 issue body's "INV-SAFE-2" is a label typo — INV-SAFE-2 = no silent re-create of REMOTE_MISSING.) |
| UUID v7 | RFC 9562 version-7 UUID: 36-char canonical shape, version nibble = 7, carrying a Unix-ms timestamp prefix. Chosen over v4 (time-sortable) and KSUID (library weakness) — ADR-0006. |

## 24. APPENDICES

### Appendix A — Story AC → Spec AC traceability

| Story AC | Spec AC(s) | Capability / NFR |
|---|---|---|
| INV-SAFE-3 (two docs share `marksync.uuid` → `err(DuplicateUuid)` listing both paths; zero writes proven at E3-S6) | AC-F4-1, AC-F4-2 | F-4, F-7, DM-5, NFR-6, NFR-7 |
| `generateUuidV7` produces a v7 (time-sortable prefix; matches the v7 regex) | AC-F1-1 | F-1, NFR-1 |
| `injectUuid` idempotent (twice → same UUID + same doc bytes; no whitespace normalization) | AC-F3-1, AC-F3-2 | F-3, NFR-2, NFR-3, NFR-4 |
| A doc moved/renamed retains its UUID (ADR-0006 C-1) | AC-F1-2 | F-2, F-3, NFR-8 |
| A re-clone recovers the same UUIDs without regeneration | AC-F1-3 | F-3, NFR-9 |
| `bun run check` green; boundary check (identity in `domain/`, no infra import) | AC-F1-4 | F-1..F-5, NFR-12, NFR-14 |
| (DocumentId branding — derived from the branded-type deliverable) | AC-F2-1 | F-2, DM-1, NFR-10 |
| (readUuid tolerance — derived from the read deliverable) | AC-F3-3 | F-3, NFR-5 |
| (duplicate detection scale — derived from the O(n) approach) | AC-F4-3 | F-4, NFR-11 |

### Appendix B — ADR-0006 constraint → spec capability traceability

| ADR-0006 Constraint | Specified by |
|---|---|
| C-1 (identity survives clones/branches/renames/CI) | F-2, F-3, AC-F1-2, AC-F1-3, NFR-8, NFR-9 |
| C-4 (duplicate identity fatal before any write) | F-4, F-7, DEC-1, AC-F4-1, NFR-6 |
| Identity section (UUID v7 in `marksync.uuid`; page ID = remote identity; title/path mutable) | F-1, F-3, DEC-2, DEC-3, DM-2 |
| Shared base (`PageBinding` schema) | F-5, DEC-5, DM-3 |

### Appendix C — Authoritative sources

- **Story scope (authoritative):** `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S1--document-identity.md` — Goal, Detailed scope (7 deliverables), Interface contracts, Acceptance criteria, Test matrix, CEO-resolved R1/Q1, the INV-SAFE-2→INV-SAFE-3 naming note.
- **Identity/state decision:** `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` — C-1 (identity survives), C-4 (duplicate fatal), Identity section (UUID v7, `marksync.uuid`, page ID = remote identity), Shared base (`PageBinding` schema), Verification Criteria.
- **Feature spec:** `doc/spec/features/feature-safe-publish.md` — §3.1 Document identity capability, §3.3 Duplicate UUID fatal, §5 cross-cutting AC (INV-SAFE-3).
- **Epic:** `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3--epic.md` — epic scope + success criteria (INV-SAFE-3).
- **Coding conventions:** `.ai/rules/typescript.md` — tier rules (identity/binding are domain, import nothing), branded-type pattern, `Result<T,E>`, `DuplicateUuid` arm definition, `#imports` aliases, allowed/planned dependency list (`uuid`).
- **Testing strategy:** `.ai/rules/testing-strategy.md` — INV-SAFE-3 = Unit + Gherkin; over-mocking guardrail (domain logic tested with real inputs).
- **Ubiquitous language:** `doc/overview/ubiquitous-language.md` — `DocumentId`/`Document Identity`/`PageBinding`/`Page Binding`/"Duplicate UUID Detected" terms + binding rules 1, 2, 4, 5.
- **Existing primitives:** `src/domain/result.ts` (`Result<T,E>` + `ok`/`err`), `src/domain/errors.ts` (`DuplicateUuid` arm + `assertNeverMarkSyncError`), `src/domain/identity/` + `src/domain/binding/` (empty `.gitkeep` skeletons), `package.json` (`yaml` ^2.9.0; `uuid` not yet installed).

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | spec-writer (GH-18) | Initial specification — formalized from the authoritative story file MS2-E3-S1, ADR-0006 (C-1 identity survives, C-4 duplicate fatal, Identity/Shared-base sections), feature-safe-publish.md (§3.1, §5), the epic MS2-E3, typescript.md (branded types, `Result<T,E>`, tier rules, `DuplicateUuid` arm), testing-strategy.md (INV-SAFE-3 = Unit + Gherkin), and ubiquitous-language.md (`DocumentId`/`PageBinding` UL binding). Encodes the DEC-1 detection-vs-throw resolution, the DEC-2 `marksync.uuid` namespace, the DEC-3 UUID-v7 choice, the DEC-4 branded `DocumentId`, and the DEC-5 `PageBinding`-type-only scope. Notes the INV-SAFE-2→INV-SAFE-3 label-typo in the issue body and governs on INV-SAFE-3. |

---

## AUTHORING GUIDELINES

- **Seed:** The authoritative scope is the story file `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S1--document-identity.md` (DoR-ready). This spec formalizes that story; it does not invent new requirements or expand scope. The story's Goal / Detailed scope (7 deliverables) / Acceptance criteria / Out-of-scope map directly to the Goals (G-1..G-7), Capabilities (F-1..F-7), Acceptance Criteria (AC-*), and Non-Goals (NG-1..NG-7) here.
- **Sources cited:** story MS2-E3-S1, ADR-0006 (C-1, C-4, Identity, Shared base), feature-safe-publish.md (§3.1, §3.3, §5), epic MS2-E3, typescript.md, testing-strategy.md, ubiquitous-language.md, the existing `result.ts`/`errors.ts` primitives, and the empty `identity/`/`binding/` skeletons.
- **No implementation detail:** module paths appear as **architectural residence** (where a capability lives per the UL binding rule 4 + typescript.md residence rules), consistent with the GH-15/GH-16/GH-17 specs and `architecture-overview.md` — not as step-by-step file-creation tasks. The precise module split within `src/domain/identity/` and `src/domain/binding/`, the exact branded-type helper shape, and the yaml round-trip mechanics are delivery decisions for the plan-writer/coder.
- **Invariant-naming correction:** the GH-18 issue body AC references "INV-SAFE-2", but the duplicate-UUID-fatal invariant is INV-SAFE-3 per the canonical `id-prefix-catalog.md`, the story file, the feature spec, and ADR-0006. The story file is authoritative (pm-instructions: "Git files are authoritative for story scope"). This spec governs on INV-SAFE-3 and treats "INV-SAFE-2" as a non-blocking label typo (recorded in the PM notes).
- **Result-vs-throw resolution (DEC-1):** typescript.md (§Error handling) frames duplicate-UUID as a `throw` invariant violation, while the story specifies `detectDuplicateUuids(): Result<void, MarkSyncError>`. The spec reconciles these by responsibility: the pure detector returns `Result`; the push-flow boundary (E3-S6) realizes the fatal/halt semantics. Both are consistent with the story's "FIRST step, halt with zero writes" contract and the testing-strategy INV-SAFE-3 = Unit + Gherkin tiering.
- **CEO-resolved items** carried forward: R1 (same-millisecond v7 collision negligible; detector is the safety net) → RSK-4; Q1 (UUID at `marksync.uuid`) → DEC-2. No item requires `@decision-advisor` escalation (ADR-0006 is settled).
- **Open items** (`assertUuidV7` throw-vs-Result; exact `uuid` version pin) are captured as OQ-1/OQ-2 but flagged as specification/delivery-time details, not `@decision-advisor` escalations.
- **First-producer framing:** the `DuplicateUuid` error arm, its application-tier mapper case, and its `CODE_TO_EXIT` mapping already exist (landed speculatively in GH-14/GH-16). This story is the first **producer**; it adds no new error kind and no new presentation surface — reflected in DM-5, §8.5, §16, and §21.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-18)
- [x] `owners` has at least one entry (Juliusz Ćwiąkalski)
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-)
- [x] Acceptance criteria reference at least one F-/NFR-/DM- ID and use Given/When/Then
- [x] NFRs include measurable values (v7 regex + sort order; 0 bytes diff; ≤5 ms p95; ≤20 transitive deps; `bun run check` exit 0; compile-error branding)
- [x] Risks include Impact & Probability
- [x] No implementation details (module paths are architectural residence per UL binding rule 4, not task steps; no code-level instructions)
- [x] No content duplicated from linked docs (ADR-0006 / story / typescript.md / UL referenced, not reproduced)
- [x] Front matter validates per front_matter_rules
