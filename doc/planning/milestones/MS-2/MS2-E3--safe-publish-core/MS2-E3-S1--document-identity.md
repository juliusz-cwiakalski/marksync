---
id: MS2-E3-S1
title: "document-identity (UUID v7)"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: 2d
gh_issue: GH-18
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006]
dependencies: { blocks: [MS2-E3-S2, MS2-E3-S5, MS2-E3-S6], blocked_by: [MS2-E2-S1, MS2-E2-S2] }
cross_cutting: [INV-SAFE-3]
---

# MS2-E3-S1 — Document identity (UUID v7) + front-matter binding

## Goal
Immutable MarkSync document identity: a **UUID v7** generated at first-publish and stored in source front-matter (`marksync.uuid`); **duplicate-UUID detection is FATAL before any write** (INV-SAFE-3). The Confluence page ID is the remote identity (mutable, recorded in the lock — E3-S2).

## Background
This is the identity half of ADR-0006 (C-1 identity survives clones/branches/renames; C-4 duplicate fatal). Identity is SEPARATE from the shared base (E3-S2) and the cache. Getting identity wrong is a brand-defining failure (R-VAL-4). UUID v7 (not v4/KSUID) chosen for time-sortability + library solidity (blueprint §9). Depends on E2-S2 (front-matter parsing).

> **Invariant naming note:** duplicate-UUID-fatal = `INV-SAFE-3` per the canonical `id-prefix-catalog.md` (INV-SAFE-1 = no silent overwrite; INV-SAFE-2 = no silent re-create of REMOTE_MISSING; INV-SAFE-3 = duplicate-UUID fatal).

## Detailed scope (deliverables)
1. **`src/domain/identity/uuid.ts`** — `generateUuidV7(): string` (via `uuid` v9+ `v7()`), `isUuidV7(s)`, `assertUuidV7(s)`.
2. **`src/domain/identity/document-id.ts`** — `DocumentId` VO (branded type around a UUID v7 string); `parseDocumentId`.
3. **`src/domain/identity/frontmatter.ts`** — read/write `marksync.uuid` in a doc's front-matter. `injectUuid(source: string): {source:string; uuid:DocumentId}` writes a UUID if absent; `readUuid(source): DocumentId | undefined`. Idempotent: never overwrites an existing UUID.
4. **`src/domain/identity/duplicate-detector.ts`** — `detectDuplicateUuids(docs: {path; uuid?}[]): Result<void, MarkSyncError>` → returns `err({kind:"DuplicateUuid"; uuid; paths[]})` if any UUID appears on >1 doc; `ok` otherwise. **Docs missing a UUID are NOT duplicates** (they get one at first publish).
5. **Lock binding hook** — define the `PageBinding` record shape (blueprint §3): `{uuid, sourcePath, pageId, parentPageId, pageVersion, sourceCommit, sourceContentHash, renderedBodyHash, remoteBodyHash, attachmentHashes, operationId, synchronizedAt, toolVersion}`. E3-S1 defines the TYPE + the identity-binding semantics; E3-S2 implements lock persistence.
6. **`marksync init` UUID assignment** — when `init` discovers managed docs, inject a UUID v7 into each doc's front-matter (write the file). This story implements the identity assignment step; full `init` orchestration is later.
7. **`DuplicateUuid` fatal semantics** — the push flow (E3-S6) calls `detectDuplicateUuids` as the FIRST step and HALTS with zero writes on a duplicate. This story provides the detector + a unit test proving a duplicated-UUID fixture yields the fatal error.

## Technical approach
- `uuid` v9+ provides `v7()`. Brand the type: `type DocumentId = string & { __brand: "DocumentId" }` to prevent accidental string substitution.
- Front-matter write must preserve the rest of the doc byte-for-byte except the injected key. Use the YAML parser from E2-S2 to touch ONLY the front-matter block.
- Duplicate detection is O(n) via a `Map<uuid, path[]>`.

## Interface contracts (what other stories consume)
- `DocumentId` type + `generateUuidV7` consumed by `init`, `push-flow` (E3-S6), and lock (E3-S2).
- `detectDuplicateUuids()` consumed by E3-S6 as the pre-write safety gate (INV-SAFE-3).
- `PageBinding` type consumed by E3-S2 (lock), E3-S5 (drift), E3-S6 (sync).
- `readUuid`/`injectUuid` consumed by the markdown pipeline (E3-S3) and config overrides.

## Acceptance criteria (testable)
- [ ] **INV-SAFE-3:** a fixture with two docs sharing `marksync.uuid` → `detectDuplicateUuids` returns `err(DuplicateUuid)` listing both paths; an integration-level assertion (in E3-S6 or here) proves ZERO writes occur. (BDD scenario in E5-S1 covers the end-to-end invariant.)
- [ ] `generateUuidV7` produces a v7 (time-sortable prefix; matches the v7 regex).
- [ ] `injectUuid` is idempotent: running twice yields the same UUID and the same doc bytes (minus whitespace normalization which must be NONE — byte-stable).
- [ ] A doc moved/renamed (different `sourcePath`) retains its UUID (identity independent of path — ADR-0006 C-1).
- [ ] A re-clone (fresh checkout with the committed front-matter) recovers the same UUIDs without regeneration.
- [ ] `bun run check` green; boundary check (identity is in `domain/`, no infra import).

## Test matrix
| Tier | This story |
|---|---|
| Unit | v7 generation/regex, inject idempotency, duplicate detection (dup → error; no-dup → ok; missing-uuid not-a-dup), DocumentId branding |
| Integration | inject preserves doc body; re-clone fixture recovers UUID |
| BDD | (contributing scenario) "duplicate UUID halts with zero writes" — the step def lives in E5-S1 but the fixture/assertion originates here |

## Definition of Done
UUID v7 generation + front-matter binding + duplicate detection (fatal) + PageBinding type; identity independent of path/title; survives re-clone. AC list is the DoD.

## Out of scope
- Lock file persistence (E3-S2).
- Drift classification (E3-S5).
- The actual write to Confluence (E3-S4/E3-S6).

## Risks / open questions (CEO-resolved)
- **R1:** Two devs add docs concurrently → same-millisecond UUID v7 collision risk. → UUID v7 includes random bits; collision probability negligible at our scale (≤500 pages). Duplicate detector is the safety net regardless. CEO-recorded.
- **Q1:** Where to store the UUID in front-matter. → `marksync.uuid` (under the `marksync` namespace, alongside other overrides). Confirmed.
