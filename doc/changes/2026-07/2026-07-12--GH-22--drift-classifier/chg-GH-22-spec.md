---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-22
  type: feat
  status: Proposed
  slug: drift-classifier
  title: "[MS2-E3-S5] Drift classifier — three-way {local, base, remote} sync-state classification (6-state enum, no silent overwrite, REMOTE_MISSING invariant)"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [MS-0002, MS2-E3, safe-publish, critical, domain, drift, reliability]
  version_impact: minor
  audience: internal
  security_impact: medium
  risk_level: high
  dependencies:
    internal: [MS2-E3-S1 (GH-18 document identity), MS2-E3-S2 (GH-19 lock/PageBinding/state module), MS2-E3-S3 (GH-20 canonicalize/contentHash), MS2-E3-S4 (GH-21 TargetSystem port), MS2-E3-S6 (blocked)]
    external: []
---

# CHANGE SPECIFICATION

> **PURPOSE**: Deliver the pure domain function at the core of MarkSync's trust wedge — a three-way `{local, base, remote}` comparison that classifies each bound document into one of the six Ubiquitous-Language `SyncState` values and maps each to a safe action — so the sync engine (E3-S6) can decide create/update/no-op/move while **blocking unsafe overwrites by default** (INV-SAFE-1) and **never silently re-creating a remotely-deleted managed page** (INV-SAFE-2 / NFR-REL-6).

## 1. SUMMARY

This is the **fifth story of epic MS2-E3 (Safe publish core)** and the **decision half** of the safe-publish pipeline: where GH-21 delivered the *channel* the pipeline writes through, this story delivers the *judgement* that decides whether a write is safe. It is pure domain logic — no infrastructure imports, no I/O, trivially unit-testable with fixtures — consumed entirely by E3-S6 (the sync engine). It delivers:

1. **A pure `classify()` function** — `classify(input: { local?: ContentHash; base?: SharedBase; remote: RemoteState }): Result<SyncState, MarkSyncError>`. A three-way comparison over canonical semantic hashes (not raw bytes) plus title and parent identity (R1). `local` is **optional** to express `LOCAL_MISSING` (binding in the lock, source document gone from Git) — a resolution of the story's prose signature, which showed `local` required (DEC-1).
2. **A `ContentHash` value object** — the local-document snapshot: `rawHash` (sha256 of source bytes — informational), `canonicalHash` (delegates to the existing `contentHash(canonicalize(hast))` from GH-20 — the primary comparison basis), `attachmentHash` (deterministic digest over the sorted attachment set), plus `title` + `parentPageId` (the R1 metadata facets). Reuses GH-20 verbatim; re-implements no sha256 canonicalization (DEC-2).
3. **The `SyncState` enum** — exactly six values matching the Ubiquitous Language §Sync State: `NO_CHANGE`, `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING`. Validated at the output boundary (UL binding rule 3).
4. **The `RemoteState` discriminated union** — `{ kind: "present"; bodyHash; version; title?; parentPageId? }` | `{ kind: "missing" }` | `{ kind: "forbidden"; pageId }`. `forbidden` is **not** a seventh state (Q1): it surfaces as `err(Forbidden)` for E3-S6 to warn+skip.
5. **The `Action` mapping** — `SyncState → Action`: `NO_CHANGE→NoOp`, `LOCAL_AHEAD→Update`, `REMOTE_AHEAD→Block(Conflict)`, `DIVERGED→Block(Conflict)`, `REMOTE_MISSING→Block(RemoteMissing)`, `LOCAL_MISSING→Skip` (warn). The engine (E3-S6) honors every `Block`; `--adopt`/`--rebind` overrides are wired there, never here.

This story reuses `Result<T, E>`, the existing `RemoteMissing`/`Forbidden`/`Conflict` `MarkSyncError` arms (no new error kinds), the GH-20 `canonicalize`/`contentHash`, and the GH-19 `PageBinding` (the `SharedBase` source). It joins the existing `src/domain/state/reconcile.ts` sibling under `src/domain/state/`. It **blocks** MS2-E3-S6 (sync engine), which consumes `classify()` + `SyncState` + `Action` + the canonical-hash function as its interface contracts.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **GH-18, GH-19, GH-20, GH-21 are all merged** — this story's `blocked_by` dependencies are satisfied. GH-18 delivered `DocumentId` (the UUID v7 branded value object). GH-19 delivered the committed lock (`marksync.lock.yml`), the disposable `.marksync/` cache, the `PageBinding` interface, and the pure content-property cross-check sibling module `src/domain/state/reconcile.ts`. GH-20 delivered the Markdown pipeline culminating in `canonicalize(hast)` + `contentHash(canonical)`. GH-21 delivered the `TargetSystem` port and its Confluence adapter (the remote surface the engine will translate into `RemoteState`).
- **The canonical hash seam already exists and explicitly defers to this story.** `src/domain/render/canonicalize.ts` (GH-20) owns `canonicalize(hast: Root): CanonicalHast` (a position-free, property-sorted, structural-whitespace-dropped canonical form) and `contentHash(canonical): string` (raw lowercase-hex sha256 over a deterministic stable-stringify). Its header states verbatim: *"The wire-format prefix is the consumer's concern (E3-S5) — this owns the deterministic digest only."* This story is that consumer (DEC-2): the `ContentHash.canonicalHash` delegates to `contentHash(canonicalize(hast))` and adds any wire-format prefix; it re-implements no sha256 logic.
- **The `SharedBase` source already exists.** `PageBinding` (`src/domain/binding/page-binding.ts`, GH-18/GH-19) carries `sourceContentHash` (raw), `renderedBodyHash` (canonical), `remoteBodyHash`, `attachmentHashes: Record<string, string>`, plus `pageId`, `parentPageId`, `pageVersion`, `uuid`, `sourceCommit`. This is the shared-base snapshot the classifier consumes as its `base` input — no new base type is needed; the classifier takes a `SharedBase` view over it.
- **The error channel already carries every arm this story needs.** `src/domain/errors.ts` already has `RemoteMissing { pageId }`, `Forbidden { pageId; operation }`, and `Conflict { pageId; baseVersion; remoteVersion }`. The classifier returns these via `Result<SyncState, MarkSyncError>` — **no new error kinds are introduced** (DEC-3). `assertNeverMarkSyncError` is therefore untouched.
- **The state-module sibling already sets the residence pattern.** `src/domain/state/reconcile.ts` is the existing pure state module (content-property cross-check + lost-lock rebuild); it imports only `#domain/*` and returns `Result<_, MarkSyncError>`. The new modules join it under `src/domain/state/`, following the same purity and import discipline.
- **The boundary is already enforced.** `.dependency-cruiser.cjs` declares `domain-may-not-import-infra` at severity `error`; `bun run check` runs `check:boundaries`. The existing negative test `tests/unit/domain/target/boundary-negative.test.ts` is the proven pattern for proving a `src/domain/**` purity rule fires (it creates an ephemeral probe, runs dep-cruiser, asserts the violation, cleans up). This story's purity AC mirrors that pattern for the classifier.
- **ADR-0006 is the load-bearing state-model decision** — settled, `Accepted`. Its constraints C-1..C-6 establish the durable identity (UUID v7), the committed shared base (the lock), the disposable cache, and the safety invariants this classifier enforces: INV-SAFE-1 (zero silent overwrites), INV-SAFE-2 (a remotely-deleted managed page is never silently re-created). The classifier is the pre-write three-way comparison ADR-0006 §5.4 / the premortem insist on — **not** the write-time 409 backstop (that is E3-S7).
- **The Ubiquitous Language fixes the enum and its binding rule.** `ubiquitous-language.md` §Sync State normatively defines the six values, and binding rule 3 states: *"Sync states are an enum … with exactly the values listed above. No ad-hoc state strings. Enforcement: zod schema validation at the state-classifier output boundary."* This story realizes both the enum and that enforcement.
- **The architecture contract sketches (but does not finalize) the signature.** `architecture-overview.md` §"Internal interface contracts" line ~239 records `classify(local, base, remote) → SyncState` with `—` errors. The realized contract refines this to a single input object returning `Result<SyncState, MarkSyncError>` (DEC-4) — the positional form cannot express `LOCAL_MISSING` (absent `local`) nor surface `forbidden` as an error. This reconciliation is a phase-7 doc-sync item (§18), not a decision gap.

### 2.2 Pain Points / Gaps

- **No classifier exists.** There is no `classify()` function, no `SyncState` enum, no `Action` mapping, and no canonical-hash composition (`ContentHash` VO) in the codebase. E3-S6 (the sync engine) has no decision function to call — it cannot decide create/update/no-op/move, and it cannot block. MS-0002 cannot publish a single already-bound page safely until this lands.
- **The trust wedge has no enforcement point.** INV-SAFE-1 (zero silent overwrites) and INV-SAFE-2 (remotely-deleted managed page never silently re-created) are stated invariants with no code that classifies drift and refuses to overwrite. Without a `REMOTE_AHEAD`/`DIVERGED`/`REMOTE_MISSING` classification producing a `Block`, the engine would have no signal to stop on.
- **The false-positive guard is unbuilt.** NFR-REL-3 (<5% conflict false-positive rate) depends on comparing **canonical** semantic hashes (whitespace-invariant, attribute-order-invariant), not raw bytes. The GH-20 canonicalizer provides the conservative normalization; nothing yet composes it into a `ContentHash` VO and compares on `canonicalHash`. Without this, a whitespace-only re-save would look like a change and produce false drift.
- **The idempotency precondition has no enforcer.** NFR-PERF-4 (a second semantically-unchanged push performs 0 writes) rests on `local == base == remote → NO_CHANGE`. That three-way equality check is precisely the classifier's `NO_CHANGE` path — it does not exist yet.
- **The `REMOTE_MISSING` path has no default-block.** A binding whose `pageId` returns 404 has no classification that blocks re-creation by default. The story obligation (INV-SAFE-2 / NFR-REL-6) — block unless an explicit `--adopt`/`--rebind` (wired in E3-S6) — needs a `REMOTE_MISSING` state and a `Block(RemoteMissing)` action to exist first.
- **The `forbidden` access condition has no classifier handling.** A 403 on a bound page is neither a sync state nor a silent skip; it must surface as `err(Forbidden)` so E3-S6 warns and skips without deleting/recreating (mirroring GH-21 DEC-4). The classifier must distinguish it from `REMOTE_MISSING`.

## 3. PROBLEM STATEMENT

Because no pure three-way drift classifier, `SyncState` enum, `Action` mapping, or canonical-hash composition exists, the sync engine (E3-S6) has no decision function to call — so MarkSync cannot classify a bound document as unchanged / locally-changed / remotely-changed / diverged / remotely-deleted / locally-deleted, cannot decide create/update/no-op/move, and — most critically — cannot block unsafe overwrites by default (INV-SAFE-1) or refuse to silently re-create a remotely-deleted managed page (INV-SAFE-2 / NFR-REL-6) — which means the brand-defining zero-silent-overwrite promise has no enforcement point, the semantic-idempotency target ("second unchanged push writes 0", NFR-PERF-4) has no `NO_CHANGE` producer, and the false-positive guard (NFR-REL-3) has no canonical-comparison basis — so this story must deliver the pure `classify()` function, the six-value `SyncState` enum, the `ContentHash` value object, the `RemoteState` union, and the `SyncState → Action` mapping, reusing the GH-20 canonicalizer and the existing `MarkSyncError` arms without duplication, before E3-S6 can ship any safe publish.

## 4. GOALS

- **G-1**: Deliver the pure `classify(input)` three-way classifier returning `Result<SyncState, MarkSyncError>`, with **no infrastructure imports** (F-1).
- **G-2**: Deliver the `ContentHash` value object — `rawHash` + `canonicalHash` (delegating to GH-20's `contentHash(canonicalize(hast))`) + `attachmentHash` + `title` + `parentPageId` (R1 facets) — the local-document snapshot that is the false-positive guard (F-2).
- **G-3**: Deliver the six-value `SyncState` enum matching the Ubiquitous Language exactly, with zod validation at the output boundary (UL binding rule 3) (F-3).
- **G-4**: Deliver the `RemoteState` discriminated union (`present` | `missing` | `forbidden`) — the adapter-agnostic remote shape the engine (E3-S6) builds from the `TargetSystem` port (F-4).
- **G-5**: Deliver the `Action` type and the `SyncState → Action` mapping — `NoOp`/`Update`/`Block(MarkSyncError)`/`Skip` — with `REMOTE_AHEAD`/`DIVERGED`→`Block(Conflict)`, `REMOTE_MISSING`→`Block(RemoteMissing)`, `LOCAL_MISSING`→`Skip` (F-5).
- **G-6**: Deliver the false-positive guard — the classifier compares `canonicalHash` (+ title + parent + attachment facets), never `rawHash` alone — so semantically-irrelevant differences do not trigger drift (F-2, F-6).

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| zero silent overwrites (NFR-REL-1 / INV-SAFE-1) | a `REMOTE_AHEAD` or `DIVERGED` fixture → classifier returns the block state; **100%** of block fixtures blocked |
| REMOTE_MISSING invariant (NFR-REL-6 / INV-SAFE-2) | a `REMOTE_MISSING` fixture → `ok(REMOTE_MISSING)` → `Block(RemoteMissing)`; the page is **never** auto-re-created (E3-S6 honors the block) |
| 6-state detection | one fixture per state **+** the `forbidden` path → correct classification (**6/6** states + forbidden) |
| false-positive rate (NFR-REL-3) | a fixture suite of semantically-unchanged-but-superficially-different docs (whitespace, attribute order) → `NO_CHANGE`; a real-change suite → correctly **not** `NO_CHANGE` (framed as fixture suites, not a literal %) |
| effectiveness (NFR-REL-2) | **every** supported remote-edit scenario in the fixture suite is detected |
| semantic idempotency (NFR-PERF-4) | `local == base == remote` on canonical hash + title + parent + attachments → `NO_CHANGE` (drives "second push writes 0") |
| boundary purity (NFR-MAINT-1) | **0** files under `src/domain/state/` import anything from `src/infra/**`; a dep-cruiser negative probe proves the rule fires |
| error-model stability | **no** new `MarkSyncError` arms; `RemoteMissing`/`Forbidden`/`Conflict` reused verbatim; `assertNeverMarkSyncError` untouched |
| quality gate | `bun run check` exits **0** |

### 4.2 Non-Goals

- **NG-1**: The apply (create/update/move writes) — E3-S6 (sync engine). This story classifies; it does not write.
- **NG-2**: The write-time 409 optimistic-concurrency backstop — E3-S7. This classifier is the **pre-write** three-way comparison; the 409 is the decentralized last-line gate.
- **NG-3**: Conflict resolution / reverse sync — MS-0004 / MS-0005+.
- **NG-4**: The `--adopt` / `--rebind` override behavior — wired in E3-S6. The classifier blocks `REMOTE_MISSING` by default; the flags override that decision downstream, never here.
- **NG-5**: New `MarkSyncError` kinds — every classifier outcome maps to an **existing** arm (`RemoteMissing`/`Forbidden`/`Conflict`). No error-model change is in scope (DEC-3).
- **NG-6**: Classification of base-absent (brand-new) documents — a document with no binding is **not** one of the six states; the engine handles `create` directly without invoking the classifier (boundary, §7.1 / DEC-5).
- **NG-7**: Computing remote body hashes — the engine (E3-S6) fetches the remote page via the `TargetSystem` port and supplies `RemoteState` with a pre-computed `bodyHash`; the classifier compares, it does not fetch or hash remote content.
- **NG-8**: Reconsidering the six-state enum or the canonicalization basis — the UL (§Sync State) and GH-20 (`canonicalize`/`contentHash`) are authoritative and being **consumed**, not reopened.

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | Pure `classify()` three-way classifier | The core of the trust wedge: a pure function over value objects that compares `{local, base, remote}` and returns `Result<SyncState, MarkSyncError>`. Pure ⇒ no mocks ⇒ trivially fixture-testable (typescript.md testing-strategy). No infrastructure imports (NFR-MAINT-1). |
| F-2 | `ContentHash` value object (local-document snapshot) | The false-positive guard (NFR-REL-3) AND the carrier of the R1 metadata facets. Bundles `rawHash` (informational), `canonicalHash` (the comparison basis — delegates to GH-20's `contentHash(canonicalize(hast))` so whitespace/attribute-order never perturb the digest), `attachmentHash` (deterministic digest over the sorted attachment set), **plus `title` and `parentPageId`** — the local-document identity facets R1 requires the classifier to compare (a title/parent change with an identical body is still `LOCAL_AHEAD`). Reuses GH-20 verbatim — re-implements no sha256 logic (DEC-2). |
| F-3 | `SyncState` enum (six values) + output-boundary validation | Exactly the UL §Sync State values: `NO_CHANGE`, `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING`. No ad-hoc state strings; zod validates the classifier output (UL binding rule 3). |
| F-4 | `RemoteState` discriminated union | The adapter-agnostic remote shape (`present` / `missing` / `forbidden`) the engine builds from the `TargetSystem` port. `forbidden` is an access condition, **not** a seventh state (Q1) — it surfaces as `err(Forbidden)`. |
| F-5 | `Action` type + `SyncState → Action` mapping | The decision the engine acts on: `NO_CHANGE→NoOp`, `LOCAL_AHEAD→Update`, `REMOTE_AHEAD/DIVERGED→Block(Conflict)`, `REMOTE_MISSING→Block(RemoteMissing)`, `LOCAL_MISSING→Skip`. The engine honors every `Block`. |
| F-6 | False-positive guard via canonical comparison | The classifier compares `canonicalHash` (+ title + parent + attachment facets), **never** `rawHash` alone. `rawHash` is informational only. Semantically-irrelevant differences ⇒ `NO_CHANGE` (NFR-REL-3). |

### 5.1 Capability Details

- **F-1 (`classify`).** A pure function `classify(input: { local?: ContentHash; base?: SharedBase; remote: RemoteState }): Result<SyncState, MarkSyncError>`. It performs the **pre-write three-way comparison** ADR-0006 §5.4 requires. The comparison facets are: canonical body hash, title, parent page id, and the attachment set (R1 — title/parent drift with an identical body is still `LOCAL_AHEAD`). The classifier is **invoked only for bound documents** (a binding exists ⇒ `base` present); the engine handles the create-path for base-absent documents directly (DEC-5). It compares pre-computed hashes; it does **not** fetch, parse, or hash. Returns `ok(SyncState)` for the six states and `err(Forbidden)` when `remote.kind === "forbidden"`. `local` is **optional** to express `LOCAL_MISSING` (binding present, source document absent) — resolving the story's prose signature, which showed `local` required yet also requires `LOCAL_MISSING` (DEC-1).

- **F-2 (`ContentHash` VO).** The **local-document snapshot** the classifier compares on the `local` side: it bundles the three semantic-hash facets — `rawHash` (sha256 of the raw source bytes — informational; would differ on whitespace, so it is **not** the comparison basis), `canonicalHash` (the comparison basis — delegates to the existing `contentHash(canonicalize(hast))` from `src/domain/render/canonicalize.ts`, then applies any wire-format prefix that consumer's concern; this is the exact delegation the GH-20 header defers to E3-S5), and `attachmentHash` (a deterministic digest over the sorted attachment set so attachment add/remove/order never perturb it) — **plus `title` and `parentPageId`**, the local identity facets R1 requires (title/parent drift with an identical body is still `LOCAL_AHEAD`; without these facets on `local`, TC-METADATA-001/002's `local.title`/`local.parentPageId` would be unexpressible). This composes GH-20; it re-implements no canonicalization or sha256 (DEC-2). The precondition for the false-positive guard is that the GH-20 canonicalizer is conservative — it is: structural-whitespace text nodes (whitespace-only **and** newline-containing) are dropped, element properties are stably sorted, `raw`-HTML nodes become text, and source `position` is never copied (verified by reading the module). It does **not** collapse internal whitespace within a text node and does **not** trim code-block text — so those are real changes, not false positives (see test-plan false-positive suite).

- **F-3 (`SyncState` enum).** A TypeScript enum/union with **exactly** the six UL values — `NO_CHANGE`, `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING`. UL binding rule 3 fixes both the value set and its enforcement: a zod schema validates the classifier's output at the boundary (no ad-hoc state string can escape). The story's prose title ("5-state") is stale; six states is canonical per the UL, the feature spec §3.1/§5, and story Q1 (pm-notes decision #1).

- **F-4 (`RemoteState` union).** A discriminated union: `{ kind: "present"; bodyHash: string; version: number; title?: string; parentPageId?: string }` | `{ kind: "missing" }` | `{ kind: "forbidden"; pageId: string }`. The engine (E3-S6) builds this from the `TargetSystem` port: `present` from a successful `getPage`; `missing` from a 404 (`RemoteMissing`); `forbidden` from a 403 (`Forbidden`). `forbidden` is **not** a seventh sync state (Q1): the classifier returns `err({ kind: "Forbidden"; pageId; operation: "read" })` so E3-S6 warns+skips without deleting/recreating (mirroring GH-21 DEC-4). `missing` carries no `pageId` — the `pageId` for the `RemoteMissing` error comes from `base`.

- **F-5 (`Action` mapping).** A pure mapping from each `SyncState` to an `Action`: `NO_CHANGE → NoOp`; `LOCAL_AHEAD → Update`; `REMOTE_AHEAD → Block(Conflict)`; `DIVERGED → Block(Conflict)`; `REMOTE_MISSING → Block(RemoteMissing)`; `LOCAL_MISSING → Skip`. The `Action` carries the document identity (`uuid`) and, for `Block`, the typed `MarkSyncError` — `Conflict { pageId; baseVersion; remoteVersion }` (versions from `base.pageVersion` and `remote.version`) for `REMOTE_AHEAD`/`DIVERGED`, and `RemoteMissing { pageId }` (from `base.pageId`) for `REMOTE_MISSING`. This satisfies the story's "pageId + uuid" requirement at the `Action` level while reusing the existing error arms verbatim (DEC-3). `--adopt`/`--rebind` override `REMOTE_MISSING` to rebind — but **only** in E3-S6; the classifier blocks by default.

- **F-6 (False-positive guard).** The classifier's drift decision uses `canonicalHash` (whitespace-invariant, attribute-order-invariant, position-invariant) as the body comparison basis, augmented by title, parent, and attachment-set facets. `rawHash` is never the comparison basis. Therefore a re-save that only changes insignificant whitespace or attribute ordering yields an identical `canonicalHash` ⇒ `NO_CHANGE` (no false drift). Real content changes alter the canonical form ⇒ a non-`NO_CHANGE` state. This is the operational realization of NFR-REL-3, resting on the GH-20 canonicalizer's conservative normalization.

## 6. USER & SYSTEM FLOWS

```
Flow 0 — Precondition (when the classifier is NOT called):
  a document with NO binding (brand-new, base absent) → the engine (E3-S6) handles
  `create` directly. The classifier is invoked ONLY for bound documents (DEC-5).

Flow 1 — Semantic idempotency (NO_CHANGE — drives "second push writes 0"):
  local.canonicalHash == base.renderedBodyHash == remote.bodyHash
    AND title/parent/attachments all match across local/base/remote
    → ok(NO_CHANGE) → NoOp.   (NFR-PERF-4)

Flow 2 — Safe local update (LOCAL_AHEAD):
  local changed (canonical/title/parent/attachment) AND remote == base
    → ok(LOCAL_AHEAD) → Update.   (the only state that writes)

Flow 3 — Remote moved since last sync (REMOTE_AHEAD — the zero-silent-overwrite gate):
  local == base AND remote changed
    → ok(REMOTE_AHEAD) → Block(Conflict).   (INV-SAFE-1 / NFR-REL-1)
  The engine NEVER auto-overwrites; it surfaces drift for the operator.

Flow 4 — Both sides changed (DIVERGED):
  local changed AND remote changed
    → ok(DIVERGED) → Block(Conflict).   (INV-SAFE-1 / NFR-REL-1)

Flow 5 — Remotely-deleted managed page (REMOTE_MISSING — never silently re-created):
  binding present (base) AND remote.kind == "missing"
    → ok(REMOTE_MISSING) → Block(RemoteMissing).   (INV-SAFE-2 / NFR-REL-6)
  The engine blocks; only an explicit --adopt/--rebind (E3-S6) can rebind. Default = block.

Flow 6 — Source document gone (LOCAL_MISSING):
  binding present (base) AND local absent
    → ok(LOCAL_MISSING) → Skip (warn).   (auto-delete/rebind is MS-0004; never silently ignored)

Flow 7 — Both gone, base present (edge case #3 — deterministic choice):
  binding present AND local absent AND remote.kind == "missing"
    → ok(LOCAL_MISSING) → Skip.   (DEC-6: source-gone is the operator-actionable signal)

Flow 8 — Forbidden access (NOT a state):
  remote.kind == "forbidden"
    → err(Forbidden).   (Q1: access condition, not a sync state; engine warns+skips, never deletes/recreates)
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- The pure `classify(input)` three-way classifier returning `Result<SyncState, MarkSyncError>` (F-1).
- The `ContentHash` value object (`rawHash` + `canonicalHash` + `attachmentHash` + `title` + `parentPageId` — the R1 metadata facets) delegating to GH-20's `contentHash(canonicalize(hast))` (F-2).
- The six-value `SyncState` enum + zod output-boundary validation (F-3).
- The `RemoteState` discriminated union (`present` / `missing` / `forbidden`) (F-4).
- The `Action` type + the `SyncState → Action` mapping (F-5).
- The `SharedBase` view over `PageBinding` the classifier consumes (the read shape; no change to `PageBinding` itself).
- The false-positive guard via canonical comparison (F-6).
- Unit fixtures: one per state + the `forbidden` path; a false-positive suite (semantic-only diffs → `NO_CHANGE`); a real-change suite (→ not `NO_CHANGE`); title/parent drift → `LOCAL_AHEAD` (R1); the both-missing edge (DEC-6).
- The boundary negative test proving the classifier imports no infrastructure (AC-F1-1).

### 7.2 Out of Scope

- [OUT] The apply (create/update/move writes) — E3-S6 (NG-1).
- [OUT] The write-time 409 optimistic-concurrency backstop — E3-S7 (NG-2).
- [OUT] Conflict resolution / reverse sync — MS-0004 / MS-0005+ (NG-3).
- [OUT] The `--adopt` / `--rebind` override wiring — E3-S6; the classifier blocks `REMOTE_MISSING` by default (NG-4).
- [OUT] New `MarkSyncError` kinds — every outcome reuses `RemoteMissing`/`Forbidden`/`Conflict` (NG-5, DEC-3).
- [OUT] Classification of base-absent (new) documents — the engine handles `create` directly; the classifier is bound-documents-only (NG-6, DEC-5).
- [OUT] Remote body hashing / fetching — the engine supplies `RemoteState` with a pre-computed `bodyHash` (NG-7).
- [OUT] Reconsidering the six-state enum or the canonicalization basis — UL / GH-20 authoritative (NG-8).

### 7.3 Deferred / Maybe-Later

- **Automatic `LOCAL_MISSING` removal/rebind** — MS-0004 (reverse sync). For MS-0002 the classifier emits `LOCAL_MISSING → Skip` (warn); it never silently ignores, and never auto-deletes the binding.
- **Richer `forbidden` recovery** — `doctor` (E5-S2) will surface visibility/permission gaps; the classifier only emits `err(Forbidden)` for the engine to warn+skip.
- **Expanding the compared field set beyond body/title/parent/attachments** — deferred consistent with the `reconcile.ts` precedent (AC-F5-1 there compares `sourceCommit` only for MS-0002).

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A. The classifier is pure domain logic — it issues no HTTP calls and defines no endpoints. The remote surface is supplied by the engine (E3-S6) as a pre-built `RemoteState` derived from the `TargetSystem` port (GH-21).

### 8.2 Events / Messages

No event bus in MS-0002. The conceptual signals the UL names — **Drift Detected** (`REMOTE_AHEAD`/`DIVERGED`), **Remote Missing Detected** (`REMOTE_MISSING`) — are realized as `Result<SyncState, MarkSyncError>` values and `Action`s consumed by E3-S6, which surfaces them through the established `CommandResult` contract. The classifier produces typed values; it emits nothing.

### 8.3 Data Model Impact

| ID | Element | Description |
|----|---------|-------------|
| DM-1 | `SyncState` enum (NEW, domain/state) | Six values matching UL §Sync State exactly. Resides in the state module under `src/domain/state/`. zod-validated at the classifier output boundary (UL binding rule 3). |
| DM-2 | `ContentHash` value object (NEW, domain/state) | `{ rawHash; canonicalHash; attachmentHash; title; parentPageId }` — the local-document snapshot. `canonicalHash` delegates to GH-20's `contentHash(canonicalize(hast))` (+ any wire-format prefix). `title`+`parentPageId` carry the R1 metadata facets. Reuses GH-20; no sha256 re-implementation (DEC-2). (Folds plan PD-1 into the spec — the spec, not the plan, owns the `local` input shape.) |
| DM-3 | `RemoteState` discriminated union (NEW, domain/state) | `{ kind:"present"; bodyHash; version; title?; parentPageId? }` \| `{ kind:"missing" }` \| `{ kind:"forbidden"; pageId }`. `forbidden` is an access condition, not a state (Q1). |
| DM-4 | `classify(input)` function + input shape (NEW, domain/state) | `classify({ local?: ContentHash; base?: SharedBase; remote: RemoteState }): Result<SyncState, MarkSyncError>`. `local` optional (DEC-1); invoked only for bound documents (DEC-5). |
| DM-5 | `Action` type + `SyncState → Action` mapping (NEW, domain/state) | `NoOp` \| `Update` \| `Block(MarkSyncError)` \| `Skip`. Carries the document identity (`uuid`); `Block` carries the typed error (`Conflict`/`RemoteMissing`). |
| DM-6 | `SharedBase` view (NEW read shape, domain/state) | The classifier's read projection over `PageBinding` — the base canonical hash, attachment hashes, parent page id, page id, page version. `title` is **not** a base facet (`PageBinding` carries no title in MS-0002) — title is a local-vs-remote facet carried on `ContentHash` (DM-2). `PageBinding` itself is **unchanged**. |
| DM-7 | Error-model — **no change** | `RemoteMissing`/`Forbidden`/`Conflict` are reused verbatim (DEC-3). `assertNeverMarkSyncError` is untouched. No new `MarkSyncError` arms. |

### 8.4 External Integrations

None. The classifier is pure domain logic with **zero** external dependencies — no Confluence, no Git, no network, no filesystem. It consumes only value objects supplied by the engine. Reused internal seams: GH-20 `canonicalize`/`contentHash` (the `canonicalHash` basis), GH-19 `PageBinding` (the `SharedBase` source), `Result<T, E>` + the existing `MarkSyncError` arms (`RemoteMissing`/`Forbidden`/`Conflict`).

### 8.5 Backward Compatibility

N/A for released artifacts (MS-0002 is pre-release). This story is purely **additive**: new modules under `src/domain/state/`, a new enum, new value objects, a new function — no existing public signature changes. `PageBinding`, `canonicalize`, `contentHash`, `Result`, `MarkSyncError`, and `assertNeverMarkSyncError` are all **unchanged** (no error-arm additions, so no exhaustiveness-handler sites to update). The architecture-overview §"Internal interface contracts" row for `classify` (positional `classify(local, base, remote) → SyncState`, `—` errors) is reconciled to the realized `classify(input) → Result<SyncState, MarkSyncError>` as a phase-7 doc-sync item (DEC-4, §18) — a documentation correction, not a compatibility break.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-1 | boundary purity (NFR-MAINT-1) | **0** files under `src/domain/state/` import anything from `src/infra/**`; a dep-cruiser negative probe (the `boundary-negative.test.ts` pattern) proves the rule fires |
| NFR-2 | zero silent overwrites (NFR-REL-1 / INV-SAFE-1) | a `REMOTE_AHEAD` or `DIVERGED` fixture → the block state; **100%** of block fixtures blocked |
| NFR-3 | REMOTE_MISSING invariant (NFR-REL-6 / INV-SAFE-2) | a `REMOTE_MISSING` fixture → `ok(REMOTE_MISSING)` → `Block(RemoteMissing)`; the page is **never** auto-re-created (E3-S6 honors the block; asserted downstream) |
| NFR-4 | false-positive rate (NFR-REL-3) | a fixture suite of semantically-unchanged-but-superficially-different docs (whitespace, attribute order) → `NO_CHANGE`; a real-change suite → correctly **not** `NO_CHANGE` |
| NFR-5 | effectiveness (NFR-REL-2) | **every** supported remote-edit scenario in the fixture suite is detected (no silent miss) |
| NFR-6 | semantic idempotency (NFR-PERF-4) | `local == base == remote` on canonical hash + title + parent + attachments → `NO_CHANGE` |
| NFR-7 | 6-state + forbidden detection | one fixture per state **plus** the `forbidden` path → correct classification (**6/6** + forbidden) |
| NFR-8 | canonical-comparison basis | the classifier decides drift on `canonicalHash` (+ title/parent/attachment facets), **never** on `rawHash` alone; `rawHash` is informational |
| NFR-9 | error-model stability | **no** new `MarkSyncError` arms; `assertNeverMarkSyncError` untouched; `bun run check` typecheck stays green |
| NFR-10 | output-boundary validation (UL rule 3) | a zod schema validates the classifier's `SyncState` output — no ad-hoc state string escapes |
| NFR-11 | quality gate | `bun run check` exits **0** |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

No product telemetry (the classifier is a pure function emitting no outbound data — consistent with NFR-SEC-3 / NFR-PRIV-1). Observability is indirect: the typed `SyncState` and `Action` values (and the `Forbidden`/`Conflict`/`RemoteMissing` errors they carry) are the structured signals E3-S6 surfaces through the established `CommandResult` contract as stable `error.code` values mapped to exit classes. The `Block` actions are the audit trail for every refused overwrite (the basis of the INV-SAFE-1/INV-SAFE-2 evidence). Mapping `Action`/`SyncState` to exit codes is an E3-S6/doc-sync concern, not a classifier decision.

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Brand-defining: the classifier misclassifies a `REMOTE_AHEAD`/`DIVERGED` case as `LOCAL_AHEAD`/`NO_CHANGE` → a remote edit is silently overwritten (NFR-REL-1 / INV-SAFE-1; ADR-0006) | H | L | Pure deterministic logic over value objects; exhaustive fixture suite (one per state + the false-positive/real-change suites); the canonical comparison basis (F-6) is whitespace/attribute-invariant; AC-F3-3/AC-F3-4 assert the block states; the write-time 409 (E3-S7) is a defense-in-depth backstop. | L |
| RSK-2 | A `REMOTE_MISSING` case is misclassified as a safe update/re-create → a deleted page is silently re-created (NFR-REL-6 / INV-SAFE-2) | H | L | `remote.kind === "missing"` with a binding present ⇒ `ok(REMOTE_MISSING)` ⇒ `Block(RemoteMissing)` by default (F-5); AC-F3-5 asserts it; `--adopt`/`--rebind` override lives only in E3-S6. | L |
| RSK-3 | The false-positive guard is too aggressive — real content changes are normalized away → drift missed (effectiveness, NFR-REL-2) | H | L | The GH-20 canonicalizer is **conservative**: it drops only structural whitespace and sorts properties; it does not alter text content (verified by reading the module). The real-change suite (AC-F2-2) asserts genuine changes are detected. | L |
| RSK-4 | The false-positive guard is too weak — whitespace/attribute churn triggers false drift (NFR-REL-3) | M | L | The classifier compares `canonicalHash` (F-6/F-8), which is whitespace/attribute-order invariant by GH-20's construction; the false-positive suite (AC-F2-1) asserts semantic-only diffs → `NO_CHANGE`. | L |
| RSK-5 | A boundary violation sneaks in (the classifier imports infrastructure) (NFR-MAINT-1) | M | L | dep-cruiser (`check:boundaries`) enforces `domain→infra` at severity `error`; AC-F1-1 mirrors the `boundary-negative.test.ts` probe pattern. | L |
| RSK-6 | Title/parent metadata drift is missed because only the body hash is compared (R1) | M | M | R1 (CEO-resolved): the classifier compares title and parent page id alongside the canonical body hash and attachment set; a title/parent change with an identical body ⇒ `LOCAL_AHEAD`; AC-F5-1 asserts it. | L |
| RSK-7 | The "both local + remote missing" edge is classified non-deterministically or as a re-create | M | L | DEC-6 fixes a deterministic choice: `LOCAL_MISSING` (source-gone is the operator-actionable signal; re-creating would violate INV-SAFE-2). | L |

## 12. ASSUMPTIONS

- ADR-0006 (state model) is settled (`Accepted`) and being **implemented**, not reopened. Its INV-SAFE-1/INV-SAFE-2 invariants are the classifier's enforcement obligations; the committed lock (`PageBinding`) is the `SharedBase` source.
- The Ubiquitous Language §Sync State (six values) and binding rule 3 (zod output validation) are authoritative; the story's "5-state" prose title is stale (pm-notes decision #1) — six states is canonical.
- GH-20's `canonicalize`/`contentHash` are correct and conservative (structural whitespace dropped, properties sorted, raw→text) — verified by reading `src/domain/render/canonicalize.ts`. This is the precondition for the false-positive guard (NFR-REL-3).
- GH-21's `TargetSystem` port is the source of the remote facts the engine (E3-S6) translates into `RemoteState` (404 → `missing`; 403 → `forbidden`; 200 → `present`). The classifier consumes the union; it does not call the port.
- The engine (E3-S6) supplies `RemoteState.bodyHash` as a **pre-computed** canonical semantic hash of the remote body (it fetches via the port and canonicalizes). The classifier compares; it does not hash remote content.
- The classifier is invoked **only for bound documents** (a binding exists ⇒ `base` present). Base-absent (new) documents take the create-path directly (DEC-5).
- `MarkSyncError` already provides every arm the classifier needs (`RemoteMissing`/`Forbidden`/`Conflict`); no error-model change is required (DEC-3).
- Downstream consumer E3-S6 (sync engine) is blocked on this story and will adopt `classify()` + `SyncState` + `Action` + the `ContentHash`/canonical-hash function as specified here.

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | MS2-E3-S1 (GH-18 document identity) | `DocumentId` — the uuid carried by `Action`/bindings. Merged. |
| Depends on | MS2-E3-S2 (GH-19 lock/PageBinding/state module) | `PageBinding` (the `SharedBase` source); `src/domain/state/reconcile.ts` (the sibling the new modules join). Merged. |
| Depends on | MS2-E3-S3 (GH-20 markdown pipeline) | `canonicalize(hast)` + `contentHash(canonical)` — the `canonicalHash` basis; its header defers the wire-prefix to E3-S5. Merged. |
| Depends on | MS2-E3-S4 (GH-21 TargetSystem port) | Defines the remote facts the engine translates into `RemoteState`. Merged. |
| Depends on | ADR-0006 | Load-bearing: the three-way comparison, INV-SAFE-1/INV-SAFE-2, the committed shared base. |
| Depends on | Ubiquitous Language §Sync State + binding rule 3 | Normative: the six-value enum and the zod output-validation enforcement. |
| Reuses | `Result<T,E>` / `MarkSyncError` (GH-14/GH-15) | The error channel + the reused arms (`RemoteMissing`/`Forbidden`/`Conflict`). No new arms. |
| Reuses | `src/domain/render/canonicalize.ts` (GH-20) | `canonicalize`/`contentHash` — the `canonicalHash` basis. Unchanged. |
| Reuses | `src/domain/binding/page-binding.ts` (GH-18/GH-19) | `PageBinding` — the `SharedBase` source. Unchanged. |
| Blocks | MS2-E3-S6 (sync engine) | Consumes `classify()` + `SyncState` + `Action` + the canonical-hash function as its interface contracts. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| OQ-1 | Is `forbidden` (403) a seventh `SyncState`? | The remote can return 403 on a bound page; the enum has six values. | **RESOLVED (story Q1, CEO):** No. `forbidden` is an access condition, not a sync state. The enum stays at six (matching the UL). The classifier returns `err(Forbidden)`; E3-S6 warns+skips, never deletes/recreates. |
| OQ-2 | Should the classifier compare only the body hash, or also title/parent metadata? | Body-only hashing misses a rename/reparent with an identical body. | **RESOLVED (story R1, CEO):** Compare title and parent page id alongside the canonical body hash and attachment set. A title/parent change with an identical body ⇒ `LOCAL_AHEAD`. |
| OQ-3 | The story's `classify(local: ContentHash, …)` shows `local` required, but `LOCAL_MISSING` requires `local` absent — contradiction? | A required `local` cannot express "source document gone". | **RESOLVED (PM clarify_scope 2026-07-12):** Make `local` **optional** in the input object (DEC-1). Absent `local` with a binding present ⇒ `LOCAL_MISSING`. |
| OQ-4 | When both `local` and `remote` are missing but a binding exists, which state? | Both-gone is ambiguous between `LOCAL_MISSING` and `REMOTE_MISSING`. | **RESOLVED (PM clarify_scope 2026-07-12, DEC-6):** `LOCAL_MISSING` — source-gone is the operator-actionable signal, and re-creating would risk violating INV-SAFE-2. |

> No question requires `@decision-advisor` escalation: ADR-0006 and the UL are settled, GH-20's canonicalizer is verified conservative, every error arm already exists, and OQ-1..OQ-4 were resolved during clarify_scope (story CEO decisions R1/Q1 + PM design resolutions DEC-1/DEC-6). The architecture-overview `classify`-signature reconciliation (DEC-4) is a phase-7 doc-sync item, not a decision gap.

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **`local` is OPTIONAL in the `classify` input** (`{ local?: ContentHash; base?: SharedBase; remote: RemoteState }`). | The story's prose signature shows `local: ContentHash` required, yet `LOCAL_MISSING` (binding present, source document gone — an AC + a UL state) requires `local` to be ABSENT. Making it optional resolves the contradiction cleanly and expresses `LOCAL_MISSING` directly. (OQ-3.) | 2026-07-12 |
| DEC-2 | **`ContentHash.canonicalHash` DELEGATES to the existing `contentHash(canonicalize(hast))` (GH-20); no sha256/canonicalization is re-implemented.** | The GH-20 module header explicitly defers the wire-format prefix to "E3-S5" and owns the deterministic digest. Reusing it avoids duplication, keeps one canonicalization authority, and makes the false-positive guard (NFR-REL-3) rest on GH-20's verified-conservative normalization. `rawHash` (source bytes) is informational only. | 2026-07-12 |
| DEC-3 | **No new `MarkSyncError` arms. The classifier reuses `RemoteMissing`, `Forbidden`, and `Conflict` verbatim.** | Every classifier outcome maps to an existing arm with the matching recovery action. `REMOTE_AHEAD`/`DIVERGED` → `Block(Conflict)`; `REMOTE_MISSING` → `Block(RemoteMissing)`; `forbidden` → `err(Forbidden)`. Reuse keeps `assertNeverMarkSyncError` untouched (no exhaustiveness sites to update) and the error model stable. The story's "pageId + uuid" requirement is satisfied at the `Action` level (the `Action` carries the document identity; the error carries `pageId`). | 2026-07-12 |
| DEC-4 | **The realized signature is `classify(input) → Result<SyncState, MarkSyncError>` (single input object, Result return), refining architecture-overview's positional `classify(local, base, remote) → SyncState`.** | The positional form cannot express `LOCAL_MISSING` (absent `local`, DEC-1) nor surface `forbidden` as an error. The Result channel carries `err(Forbidden)`. This is a refinement of the sketched contract; reconciling the architecture-overview row is a phase-7 doc-sync item (§18). | 2026-07-12 |
| DEC-5 | **The classifier is bound-documents-only — invoked only when a binding exists (`base` present). Base-absent (new) documents are NOT one of the six states; the engine handles `create` directly.** | The six states all presuppose a shared base. A new document has no base to compare against, so classification is meaningless; the create-path does not need the classifier. `base` is optional in the type as a lenient accommodation, but the contract precondition is "called only for bound documents". | 2026-07-12 |
| DEC-6 | **When both `local` and `remote` are missing but a binding exists, classify `LOCAL_MISSING` (→ Skip/warn).** | The binding is orphaned. `LOCAL_MISSING` surfaces the source-side action (restore the document or remove the binding) — the operator's actual lever. Classifying `REMOTE_MISSING` would imply a re-create/rebind decision that risks INV-SAFE-2. Deterministic choice (OQ-4). | 2026-07-12 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `classify()` + input shape (`src/domain/state/`) | New — pure three-way classifier (`Result<SyncState, MarkSyncError>`) |
| `ContentHash` value object (`src/domain/state/`) | New — `rawHash` + `canonicalHash` (delegates to GH-20) + `attachmentHash` + `title` + `parentPageId` (R1 facets) |
| `SyncState` enum (`src/domain/state/`) | New — six UL values; zod-validated at the output boundary |
| `RemoteState` discriminated union (`src/domain/state/`) | New — `present` / `missing` / `forbidden` |
| `Action` type + `SyncState → Action` mapping (`src/domain/state/`) | New — `NoOp` / `Update` / `Block(MarkSyncError)` / `Skip` |
| `SharedBase` view (`src/domain/state/`) | New read projection over `PageBinding` |
| `src/domain/render/canonicalize.ts` (GH-20) | **Unchanged** — reused (`canonicalize`/`contentHash`) |
| `src/domain/binding/page-binding.ts` (GH-18/GH-19) | **Unchanged** — reused (`PageBinding` = `SharedBase` source) |
| `src/domain/errors.ts` | **Unchanged** — reused (`RemoteMissing`/`Forbidden`/`Conflict`); no new arms |
| `src/domain/result.ts` | **Unchanged** — reused (`Result<T,E>`) |
| `src/domain/state/reconcile.ts` (GH-19) | **Unchanged** — sibling module; the new modules join it |

## 17. ACCEPTANCE CRITERIA

> Each AC maps to the story file's acceptance criteria, which constitute the Definition of Done.

| ID | Criterion | Linked | Story AC |
|----|-----------|--------|----------|
| AC-F1-1 | **Given** the change is complete, **when** a probe under `src/domain/state/` imports anything from `src/infra/**`, **then** dep-cruiser (`check:boundaries`) **fails**; and **given** the production source, **then** **0** files under `src/domain/state/` import from `src/infra/**` — the classifier is pure. | F-1, NFR-1 | AC (purity / `bun run check`) |
| AC-F3-1 | **Given** a fixture where local/base/remote agree on canonical hash + title + parent + attachments, **when** `classify` runs, **then** it returns `ok(NO_CHANGE)` (semantic idempotency — NFR-PERF-4). | F-3, F-6, NFR-6 | AC (idempotency precondition) |
| AC-F3-2 | **Given** a fixture where local changed and remote == base, **when** `classify` runs, **then** it returns `ok(LOCAL_AHEAD)` → `Update`. | F-3, F-5, NFR-7 | AC (all 6 states detected) |
| AC-F3-3 | **Given** a fixture where local == base and remote changed, **when** `classify` runs, **then** it returns `ok(REMOTE_AHEAD)` → `Block(Conflict)` (INV-SAFE-1 / NFR-REL-1). | F-3, F-5, NFR-2 | AC (INV-SAFE-1 / NFR-REL-1) |
| AC-F3-4 | **Given** a fixture where both local and remote changed vs base, **when** `classify` runs, **then** it returns `ok(DIVERGED)` → `Block(Conflict)`. | F-3, F-5, NFR-2 | AC (INV-SAFE-1 / NFR-REL-1) |
| AC-F3-5 | **Given** a fixture where a binding exists (`base` present) and `remote.kind === "missing"`, **when** `classify` runs, **then** it returns `ok(REMOTE_MISSING)` → `Block(RemoteMissing)`; the page is **never** auto-re-created (INV-SAFE-2 / NFR-REL-6). | F-3, F-4, F-5, NFR-3 | AC (INV-SAFE-2 / NFR-REL-6) |
| AC-F3-6 | **Given** a fixture where a binding exists and `local` is absent, **when** `classify` runs, **then** it returns `ok(LOCAL_MISSING)` → `Skip` (warn) (DEC-1). | F-1, F-3, F-5, NFR-7 | AC (all 6 states detected) |
| AC-F4-1 | **Given** a fixture where `remote.kind === "forbidden"`, **when** `classify` runs, **then** it returns `err({ kind: "Forbidden"; pageId; operation })` — **not** a `SyncState` (Q1). | F-4, NFR-7 | AC (forbidden path) |
| AC-F2-1 | **Given** a false-positive suite of semantically-unchanged-but-superficially-different documents (insignificant whitespace, attribute reordering), **when** each is classified against an unchanged base/remote, **then** every case returns `ok(NO_CHANGE)` (NFR-REL-3). | F-2, F-6, NFR-4, NFR-8 | AC (NFR-REL-3) |
| AC-F2-2 | **Given** a real-change suite of genuine content edits, **when** each is classified, **then** no case returns `NO_CHANGE` — every drift is detected (NFR-REL-2). | F-2, F-6, NFR-5 | AC (NFR-REL-2) |
| AC-F5-1 | **Given** a fixture where the body is identical but the title or parent page id changed locally (R1), **when** `classify` runs, **then** it returns `ok(LOCAL_AHEAD)` (metadata drift detected). | F-5, F-6, NFR-8 | AC (all 6 states / R1) |
| AC-F6-1 | **Given** a fixture where a binding exists and both `local` is absent and `remote.kind === "missing"`, **when** `classify` runs, **then** it returns `ok(LOCAL_MISSING)` deterministically (DEC-6). | F-1, F-3, NFR-7 | AC (edge case) |
| AC-Q-1 | **Given** the change is complete, **when** `bun run check` (lint + format:check + typecheck + test + check:boundaries) runs, **then** it exits **0** — including the typecheck proving no error-model change and the zod output-boundary validation. | F-3, NFR-1, NFR-9, NFR-10, NFR-11 | AC (`bun run check` green) |

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Single PR to `main`** on branch `feat/GH-22/drift-classifier`. Depends on GH-18, GH-19, GH-20, GH-21 — all merged. Purely additive: new modules under `src/domain/state/`; no existing signature or error-model change. Blocks MS2-E3-S6 (sync engine).
- **Merge strategy:** Conventional Commits (TDR-0008); a `feat(domain)` scope is appropriate. Suggested landing order: (1) the `SyncState` enum + zod output schema; (2) the `ContentHash` VO + `RemoteState` union + `SharedBase` view; (3) `classify()` with one fixture per state; (4) the `Action` mapping; (5) the false-positive + real-change + title/parent + both-missing suites; (6) the boundary negative test. Each step is independently testable.
- **After merge:** E3-S6 wires `classify()` into the plan/apply loop, supplies `RemoteState` from the `TargetSystem` port, and honors every `Block` (including `--adopt`/`--rebind` for `REMOTE_MISSING`); E3-S7 adds the write-time 409 backstop; E5-S1 wires the BDD scenarios for INV-SAFE-1/INV-SAFE-2 driven by classifier output.
- **Phase 7 doc-sync (`@doc-syncer`) — flagged, NOT done here:**
  - **`feature-safe-publish.md` §4.2 "Drift classifier" row** is currently a stub ("Canonical hash comparison → `NO_CHANGE` / `LOCAL_AHEAD` / etc.") — update it to reference the delivered modules (`classify` / `ContentHash` / `SyncState` / `Action`) and tag *(delivered — GH-22)*.
  - **`architecture-overview.md` §"Internal interface contracts"** line ~239 records `classify(local, base, remote) → SyncState` (positional, `—` errors) — reconcile it to the realized `classify(input) → Result<SyncState, MarkSyncError>` (DEC-4).
  - **`ubiquitous-language.md`** — bind the `State Classifier` / `Sync State` / `Content Hash` terms to the delivered code constructs; add `Action` / `RemoteState` if not present; `related_changes` += GH-22.
  - **`doc/spec/features/feature-safe-publish.md` `links.related_changes`** += GH-22.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A — MS-0002 is greenfield. The classifier is a pure function with no persisted state of its own; it consumes the existing `PageBinding` (GH-19) and produces transient `SyncState`/`Action` values. No lock, cache, or property migration is performed by this story.

## 20. PRIVACY / COMPLIANCE REVIEW

N/A. The classifier is a pure domain function: it processes document content hashes and page identifiers already held in the committed lock (no secrets — ADR-0006 C-2), it issues no network calls (NFR-SEC-3 / NFR-PRIV-1), and it serializes nothing to any output path. It carries no PII and no credentials. The hashes it compares are content digests destined for the operator's own Confluence target.

## 21. SECURITY REVIEW HIGHLIGHTS

- **No secrets handling** — the classifier consumes hashes and page identifiers; it never sees credentials, tokens, or the `authHeader` (those are isolated in GH-17/GH-21). NFR-SEC-1 / INV-SEC-1 are satisfied by construction (nothing to leak).
- **The safety invariants are the security-relevant properties.** INV-SAFE-1 (zero silent overwrites) and INV-SAFE-2 (remotely-deleted page never silently re-created) are enforced by the `Block` actions on `REMOTE_AHEAD`/`DIVERGED`/`REMOTE_MISSING` (F-5). A misclassification would be brand-defining — mitigated by the exhaustive fixture suite + the write-time 409 backstop (E3-S7) (RSK-1/RSK-2).
- **The false-positive guard is a safety property, not merely a UX one.** Normalizing away a real content change would silently miss drift (NFR-REL-2). The guard rests on GH-20's **conservative** canonicalizer (whitespace/property-order only — never text content), asserted by the real-change suite (AC-F2-2) — RSK-3.
- **`forbidden` is never treated as "missing".** A 403 surfaces as `err(Forbidden)`, never as `REMOTE_MISSING`, so a permission gap cannot cause a delete+recreate or a silent skip (mirrors GH-21 DEC-4).

## 22. MAINTENANCE & OPERATIONS IMPACT

- The classifier is pure and deterministic — its behavior is fully specified by its inputs and exhaustively covered by fixtures; regressions surface as fixture failures, not as runtime drift. Adding a new comparison facet is a localized change to the comparison logic plus one fixture per affected state.
- The canonical-hash authority is **single**: GH-20's `canonicalize`/`contentHash`. If the canonicalization rules ever change, the false-positive/effectiveness behavior changes in exactly one upstream place; the classifier's delegation (DEC-2) means it tracks that change automatically. This is the highest-leverage maintenance dependency to document.
- The `SyncState` enum is the contract every downstream consumer (E3-S6, E3-S7, BDD scenarios) switches over; UL binding rule 3's zod output validation ensures no ad-hoc state string can leak. Adding a state would be a UL + consumer-wide change (none is anticipated for MS-0002).
- The `Action` mapping is the single place `SyncState → write decision` lives; the `--adopt`/`--rebind` override is deliberately downstream (E3-S6) so the classifier's default remains "block unsafe".

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| `SyncState` | The six-value classification of a bound document relative to local/base/remote: `NO_CHANGE`, `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING` (UL §Sync State). |
| `ContentHash` | The local-document snapshot value object: `rawHash` (informational), `canonicalHash` (comparison basis, delegates to GH-20), `attachmentHash`, plus `title` + `parentPageId` (R1 metadata facets). |
| `SharedBase` | The classifier's read projection over `PageBinding` — the last-synced snapshot (canonical hash, attachment hashes, parent, page id, version). Carries no `title` (`PageBinding` has none in MS-0002). |
| `RemoteState` | The adapter-agnostic remote shape: `present` / `missing` / `forbidden`. `forbidden` is an access condition, not a sync state. |
| `Action` | The decision mapped from a `SyncState`: `NoOp` / `Update` / `Block(MarkSyncError)` / `Skip`. The engine honors every `Block`. |
| three-way comparison | The pre-write `{local, base, remote}` drift classification (ADR-0006 §5.4) — distinct from the write-time 409 backstop (E3-S7). |
| false-positive guard | Comparing `canonicalHash` (whitespace/attribute-invariant) so semantically-irrelevant differences ⇒ `NO_CHANGE` (NFR-REL-3). |
| INV-SAFE-1 | Invariant: zero silent overwrites — a `REMOTE_AHEAD`/`DIVERGED` document is blocked, never auto-overwritten. |
| INV-SAFE-2 | Invariant: a remotely-deleted managed page is never silently re-created (`REMOTE_MISSING` blocked without `--adopt`/`--rebind`). |

## 24. APPENDICES

- **Classification truth table** (the core of F-1; precondition: a binding exists, i.e. `base` present):

  | `local` | `remote.kind` | local changed vs base | remote changed vs base | → `SyncState` | → `Action` |
  |---------|---------------|----------------------|------------------------|---------------|------------|
  | present | present | no | no | `NO_CHANGE` | `NoOp` |
  | present | present | yes | no | `LOCAL_AHEAD` | `Update` |
  | present | present | no | yes | `REMOTE_AHEAD` | `Block(Conflict)` |
  | present | present | yes | yes | `DIVERGED` | `Block(Conflict)` |
  | present | missing | — | — | `REMOTE_MISSING` | `Block(RemoteMissing)` |
  | absent | present | — | — | `LOCAL_MISSING` | `Skip` (warn) |
  | absent | missing | — | — | `LOCAL_MISSING` | `Skip` (warn) — DEC-6 (both-gone edge) |
  | *any* | forbidden | — | — | *(not a state)* | `err(Forbidden)` — Q1 |

  *"changed vs base" includes canonical body hash, title, parent page id, and the attachment set (R1).* *Base-absent (new doc) is not classified — engine handles `create` directly (DEC-5).*

- **Authoritative sources:** the story file `MS2-E3-S5--drift-classifier.md` (scope, AC, DoD, CEO-resolved R1/Q1); the feature spec `feature-safe-publish.md` (§3.1 drift detection, §4.2 component row, §5 AC); ADR-0006 (C-1..C-6, INV-SAFE-1/2, §5.4 three-way comparison); `ubiquitous-language.md` §Sync State + binding rule 3 (normative enum + zod enforcement); `nonfunctional.md` (NFR-REL-1/2/3/6, NFR-PERF-4, NFR-MAINT-1); `architecture-overview.md` §"Internal interface contracts" line ~239 (`classify` sketch).
- **Reused contracts verified present:** `src/domain/render/canonicalize.ts` (`canonicalize`/`contentHash` — header defers wire-prefix to E3-S5); `src/domain/binding/page-binding.ts` (`PageBinding` — the `SharedBase` source); `src/domain/errors.ts` (`RemoteMissing`/`Forbidden`/`Conflict` arms; `assertNeverMarkSyncError`); `src/domain/result.ts` (`Result<T,E>` + `Result.ok`/`Result.err`); `src/domain/state/reconcile.ts` (the sibling state module — purity/import pattern); `tests/unit/domain/target/boundary-negative.test.ts` (the purity-probe pattern).
- **Structural/quality reference:** the GH-21 spec (`chg-GH-21-spec.md`) — same epic, immediately preceding, established the section depth and the DEC/OQ/RSK conventions used here.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-12 | spec-writer (ADOS) | Initial specification. |

---

## AUTHORING GUIDELINES

Authored by `@spec-writer` per the standard phase-2 specification flow. Sources: the story file MS2-E3-S5 (authoritative scope — deliverables, ACs, DoD, out-of-scope, CEO-resolved R1/Q1), the feature spec `feature-safe-publish.md` (§3.1/§4.2/§5), `architecture-overview.md` (§"Internal interface contracts" line ~239 — the `classify` sketch, reconciled in DEC-4), ADR-0006 (C-1..C-6, INV-SAFE-1/2, §5.4), `ubiquitous-language.md` (§Sync State — normative six-value enum; binding rule 3 — zod output enforcement), and `nonfunctional.md` (NFR-REL-1/2/3/6, NFR-PERF-4, NFR-MAINT-1). Existing code seams were **read and verified**, not assumed: `src/domain/render/canonicalize.ts` (confirmed `canonicalize`/`contentHash` exist and the header defers the wire-prefix to E3-S5 ⇒ DEC-2 delegation), `src/domain/binding/page-binding.ts` (confirmed `PageBinding` carries the base hashes + `pageId`/`parentPageId`/`pageVersion` ⇒ the `SharedBase` source), `src/domain/errors.ts` (confirmed `RemoteMissing`/`Forbidden`/`Conflict` already exist ⇒ DEC-3 no new arms), `src/domain/result.ts` (`Result<T,E>`), `src/domain/state/reconcile.ts` (the sibling purity/import pattern), and `tests/unit/domain/target/boundary-negative.test.ts` (the purity-probe pattern ⇒ AC-F1-1). The story's "5-state" prose title was treated as stale per pm-notes decision #1 (six states is UL-canonical). The `local`-required contradiction (DEC-1), the both-missing edge (DEC-6), and the base-absent boundary (DEC-5) were resolved from story context during clarify_scope (pm-notes) — not invented. The GH-21 spec was the structural/quality reference; the template (`doc/templates/change-spec-template.md`) defines structure. No question required `@decision-advisor` escalation.

## VALIDATION CHECKLIST

- [x] `change.ref` matches `GH-22`
- [x] `owners` has at least one entry
- [x] `status` is "Proposed"
- [x] All sections present in order (1-25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, AC-, NFR-, RSK-, DEC-, DM-, OQ-, NG-, G-)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details beyond module residence (no step-by-step code)
- [x] No content duplicated from linked docs (cited, not copied)
- [x] Front matter validates per the template
