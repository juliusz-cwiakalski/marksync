---
id: MS2-E3-S5
title: "drift-classifier"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: 2d
gh_issue: GH-22
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0006]
dependencies: { blocks: [MS2-E3-S6], blocked_by: [MS2-E3-S1, MS2-E3-S2, MS2-E3-S4] }
cross_cutting: [INV-SAFE-1, NFR-REL-1, NFR-REL-2, NFR-REL-3, NFR-REL-6]
---

# MS2-E3-S5 — Drift classifier (5-state, no silent overwrite)

## Goal
The **core of the trust wedge**: a pure domain function that compares `{local, base, remote}` and classifies each document into one of 5 states, so the sync engine can decide create/update/no-op/move and **block unsafe overwrites by default** (INV-SAFE-1). A remotely-deleted managed page is NEVER silently re-created (INV-SAFE-2 / NFR-REL-6).

## Background
This is a **pre-write three-way comparison** — NOT the write-time 409 (that's E3-S7's optimistic-concurrency backstop). ADR-0006 C-1..C-5. False positives <5% (NFR-REL-3); effectiveness 100% (NFR-REL-2). The classifier is pure domain logic (no infra imports); it consumes the hashes computed by E3-S3 and the base from E3-S2 and the remote from E3-S4 (via the port, fetched by E3-S6).

## The 5 states
| State | Meaning | Default action |
|---|---|---|
| `NO_CHANGE` | local hash == base hash == remote hash | no-op |
| `REMOTE_BEHIND` | local changed, remote == base | update (safe) |
| `REMOTE_AHEAD` | local == base, remote changed | block (remote moved since last sync) |
| `DIVERGED` | local AND remote both changed vs base | block (conflict) |
| `REMOTE_MISSING` | binding exists (pageId in lock) but remote says 404 | **block — never silently re-create** (INV-SAFE-2) |

## Detailed scope (deliverables)
1. **`src/domain/state/classifier.ts`** — `classify(input: {local: ContentHash; base?: SharedBase; remote: RemoteState}): Result<SyncState, MarkSyncError>`. Pure function. Compares **canonical semantic hashes** (raw + canonical + normalized + attachment, blueprint §2 / ADR-0006 §5.4) — not raw bytes alone, so whitespace-only changes don't trigger false positives (R-FEA-8).
2. **`src/domain/state/hashes.ts`** — the canonical-hash composition: `rawHash` (source bytes), `canonicalHash` (normalized HAST), `attachmentHash` (combined attachment hashes). The classifier compares `canonicalHash` primarily; `rawHash` is informational.
3. **`src/domain/state/actions.ts`** — map `SyncState → Action`: `NO_CHANGE→NoOp`, `REMOTE_BEHIND→Update`, `REMOTE_AHEAD→Block`, `DIVERGED→Block`, `REMOTE_MISSING→Block`. `--adopt`/`--rebind` flags (handled in E3-S6) override `REMOTE_MISSING` to rebind — but NEVER by default.
4. **`RemoteMissing` invariant** — when a binding's pageId returns 404 (fetched by E3-S4), classify `REMOTE_MISSING` and return a `Block` action with the `RemoteMissing` error carrying the pageId + uuid. E3-S6 surfaces it; never auto-recreates.
5. **False-positive guard (NFR-REL-3)** — canonicalization is conservative: only normalize changes that are **semantically irrelevant** (whitespace collapsing in paragraphs, attribute ordering). Do NOT normalize away content differences. Unit-test the boundary.

## Technical approach
- Pure function over value objects — trivially unit-testable with fixtures (no mocks).
- Hashes are `sha256` hex strings; comparison is string equality after canonicalization.
- The "remote" input is a discriminated union: `{kind:"present"; bodyHash; version}` | `{kind:"missing"}` | `{kind:"forbidden"}` (403 — from E3-S4). `forbidden` → a distinct handling path (warn+skip, not a state) — E3-S6 treats it; the classifier returns a `Forbidden` flag the engine logs.

## Interface contracts (what other stories consume)
- `classify()` + `SyncState` enum consumed by E3-S6 (the planner).
- `Action` mapping consumed by E3-S6 (the applier).
- The canonical-hash function consumed by E3-S6 (to compute local hashes before classify).

## Acceptance criteria (testable)
- [ ] **INV-SAFE-1 / NFR-REL-1:** a `REMOTE_AHEAD` or `DIVERGED` fixture → classifier returns the block state; an integration assertion (E3-S6/BDD) proves NO write occurs.
- [ ] **INV-SAFE-2 / NFR-REL-6:** a `REMOTE_MISSING` fixture → `Block` + `RemoteMissing`; NEVER auto-re-create (E3-S6 honors the block).
- [ ] All 5 states correctly detected by unit fixtures (one fixture per state + the forbidden path).
- [ ] **NFR-REL-3 (<5% false positives):** a fixture suite of semantically-unchanged-but-superficially-different docs (whitespace, attribute order) → classified `NO_CHANGE`; a suite of real changes → correctly NOT `NO_CHANGE`.
- [ ] **NFR-REL-2 (100% effectiveness):** every supported remote-edit scenario in the fixture suite is detected.
- [ ] Semantic idempotency precondition: local hash == base hash == remote hash → `NO_CHANGE` (drives the "2nd push writes 0" target in E3-S6).
- [ ] `bun run check` green; classifier is pure (no infra import; boundary check).

## Test matrix
| Tier | This story |
|---|---|
| Unit | one fixture per state; false-positive suite (semantic-only diffs → NO_CHANGE); real-change suite; canonicalization determinism |
| Integration | (contributing) classifier fed by real hashes from E3-S3 against golden fixtures |
| BDD | (E5-S1 wires) INV-SAFE-1, INV-SAFE-2 Gherkin scenarios driven by classifier output |

## Definition of Done
5-state classifier pure function; all states + REMOTE_MISSING invariant + false-positive guard covered; idempotency precondition holds. AC list is the DoD.

## Out of scope
- The apply (create/update/move writes) — E3-S6.
- The 409 write-time concurrency — E3-S7.
- Conflict resolution/reverse sync (MS-0004/MS-0005+).

## Risks / open questions (CEO-resolved)
- **R1:** Hashing only the body misses metadata drift (title/parent change). → The classifier compares `title` and `parentPageId` too; a title/parent change with same body → `REMOTE_BEHIND` (move/update). CEO-recorded.
- **Q1:** Should `forbidden` (403) be a 6th state? → No; it's an access condition, not a sync state. E3-S6 warns+skips. The enum stays at 5. Confirmed.
