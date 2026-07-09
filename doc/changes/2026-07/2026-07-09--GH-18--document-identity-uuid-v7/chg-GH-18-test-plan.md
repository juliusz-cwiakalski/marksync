---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-18-test-plan
status: Proposed
created: 2026-07-09T00:05:00Z
last_updated: 2026-07-09T00:05:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish-core, critical]
version_impact: minor (additive)
summary: "Test plan for the document-identity story (MS2-E3-S1 / GH-18): immutable UUID v7 generation + the branded DocumentId VO, byte-stable idempotent front-matter binding (read/inject `marksync.uuid`), the duplicate-UUID detector returning Result<void, MarkSyncError> with the fatal `DuplicateUuid` arm (INV-SAFE-3), the PageBinding lock-record type, the `marksync init` UUID-assignment step, and the identity-survives-path-and-reclone guarantees (ADR-0006 C-1/C-4). Exercised at Unit + Integration + Golden tiers; the release-blocking INV-SAFE-3 end-to-end 'duplicate UUID halts with zero writes' is a contributing BDD scenario whose step defs live in E5-S1 (GH-29) but whose fixture + detector-level assertion originate here. Domain logic is tested with REAL inputs/outputs, no mocked dependencies (over-mocking guardrail)."
links:
  change_spec: "./chg-GH-18-spec.md (pending — specification phase; the story file is authoritative per PM notes)"
  implementation_plan: "./chg-GH-18-plan.md (pending — delivery_planning phase)"
  story_authoritative: doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S1--document-identity.md
  feature_spec: doc/spec/features/feature-safe-publish.md
  testing_strategy: .ai/rules/testing-strategy.md
  typescript_rules: .ai/rules/typescript.md
  decision: doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md
  invariant_catalog: doc/inception/analysis/id-prefix-catalog.md
  nonfunctional_spec: doc/spec/nonfunctional.md
---

# Test Plan - [MS2-E3-S1] Document identity (UUID v7) + front-matter binding

## 1. Scope and Objectives

This plan verifies the immutable document-identity half of ADR-0006 introduced by
GH-18: `generateUuidV7()` / `isUuidV7()` / `assertUuidV7()` (`src/domain/identity/uuid.ts`),
the branded `DocumentId` value object + `parseDocumentId`
(`src/domain/identity/document-id.ts`), byte-stable idempotent front-matter binding
`injectUuid()` / `readUuid()` (`src/domain/identity/frontmatter.ts`), the
duplicate-UUID detector `detectDuplicateUuids()` returning `Result<void,
MarkSyncError>` (`src/domain/identity/duplicate-detector.ts`), the `PageBinding`
lock-record type (`src/domain/binding/`), and the `marksync init` UUID-assignment
step. The Confluence page ID (the remote identity) and lock persistence are
**out of scope** (E3-S2).

The core integrity risks this plan guards against are: (a) a **duplicate UUID
not being fatal before any write** — the release-blocking **INV-SAFE-3** /
NFR-REL-8 guarantee (ADR-0006 C-4); (b) `injectUuid` **normalizing whitespace** or
otherwise mutating the doc body / existing front-matter when it should be
byte-stable and idempotent (AC3); (c) `injectUuid` **overwriting an existing**
`marksync.uuid` (identity must be immutable once assigned — ADR-0006 C-1); (d)
identity being **bound to path/title** instead of the UUID, so a rename or
re-clone loses it (C-1); (e) `generateUuidV7` producing a non-v7 (wrong
version/variant bits) or a non-time-sortable value; and (f) a **dependency-cruiser
tier violation** — identity modules are in `src/domain/` and must import nothing
upward (no infra/app/cli).

Per `.ai/rules/testing-strategy.md` and the story's Test matrix, this story is
exercised at **Unit + Integration** tiers, plus a **Golden fixture** for the
byte-stable `injectUuid` output. **INV-SAFE-3 is validated at Unit level here
(the detector) + Gherkin level in E5-S1 (GH-29)** — the testing-strategy table
pins INV-SAFE-3 to "Unit + Gherkin"; the Gherkin step definitions and the
end-to-end "zero writes" assertion live in E5-S1 but consume the duplicated-UUID
**fixture** and **detector** authored here. E2E (live-sandbox) and the Storage
renderer are **out of scope** for this story.

### 1.1 In Scope

- **UUID v7 generation/validation** — `generateUuidV7()` returns a string
  matching the RFC 9562 v7 shape (version 7 + variant bits; 36 chars); two
  successive calls produce a time-sortable (monotonic non-decreasing) order;
  `isUuidV7`/`assertUuidV7` accept v7 and reject v4 / nil / non-uuid / malformed.
- **`DocumentId` branded VO** — `parseDocumentId(valid v7)` → a `DocumentId`
  (string `& { __brand: "DocumentId" }`); the brand is opaque so a bare `string`
  is not assignable to it (compile-time guard against accidental substitution).
- **Front-matter binding (`injectUuid` / `readUuid`)** —
  - doc with **no** front-matter → inject creates the block + `marksync.uuid`;
  - doc with front-matter but **no** `marksync.uuid` → adds the key without
    disturbing existing keys or the body;
  - doc with an **existing** `marksync.uuid` → **never overwrites** (idempotent;
    returns the existing uuid; bytes unchanged);
  - **byte-stable**: the only difference between input and injected output is the
    injected `marksync.uuid` line — body + existing front-matter are byte-identical
    (NO whitespace normalization, line-ending preservation);
  - **idempotent**: `inject(inject(src)).source === inject(src).source` byte-for-byte
    AND the same uuid;
  - `readUuid` returns the `DocumentId` when present, `undefined` when absent.
- **Duplicate detector (`detectDuplicateUuids`)** — two docs sharing a uuid →
  `err({ kind: "DuplicateUuid"; uuid; paths: [both] })`; all distinct → `ok`;
  docs **missing** a uuid are **NOT** duplicates (they get one at first publish);
  3+ docs sharing one uuid → `paths[]` lists all colliding paths; empty input →
  `ok`. The `DuplicateUuid` arm already exists in `MarkSyncError` (errors.ts);
  GH-18 adds **no new error arm**.
- **`PageBinding` record type** — carries the full ADR-0006 §3 lock schema
  (`uuid, sourcePath, pageId, parentPageId, pageVersion, sourceCommit,
  sourceContentHash, renderedBodyHash, remoteBodyHash, attachmentHashes,
  operationId, synchronizedAt, toolVersion`). GH-18 defines the TYPE +
  identity-binding semantics; lock persistence is E3-S2.
- **`marksync init` UUID assignment** — when `init` discovers managed docs it
  injects a v7 UUID into each doc's front-matter (writes the file); idempotent on
  re-run (no overwrite). This story implements the identity-assignment step; full
  `init` orchestration is later.
- **Identity survives path/clone (ADR-0006 C-1)** — a doc moved/renamed
  (different `sourcePath`) retains its UUID via `readUuid`; a re-clone (fresh
  checkout with committed front-matter) recovers the same UUIDs **without**
  regeneration.

### 1.2 Out of Scope & Known Gaps

- **Lock file persistence** (E3-S2) — `PageBinding` is typed here; reading/writing
  the lock file, atomic write, and the versioned schema are E3-S2. No lock I/O is
  exercised.
- **Drift classification** (E3-S5) and the **actual write to Confluence**
  (E3-S4/E3-S6) — the duplicate detector is consumed by E3-S6 as the pre-write
  safety gate; the **end-to-end "zero Confluence writes"** proof is the INV-SAFE-3
  Gherkin scenario in E5-S1 (GH-29) driving the real sync engine against a
  `Bun.serve` mock target. GH-18 owns the detector unit proof + the duplicated
  fixture; the cross-story split is recorded as OQ-TP-1.
- **Full `marksync init` orchestration** — only the UUID-assignment step is in
  scope; discovery wiring, target bootstrap, and the rest of `init` are later
  stories.
- **Concurrency / same-millisecond UUID v7 collision** — the detector is the
  safety net; collision probability is negligible at ≤500 pages (story R1,
  CEO-recorded). No dedicated collision test (random bits are not testable beyond
  the regex + ordering).
- **Content-property cross-check** (`marksync.metadata`) — E3-S4/E3-S6 concern.
- **Storage renderer / Mermaid-DOM / E2E (live-sandbox) tiers** — not applicable;
  no renderer, no Confluence network in this story.
- **BDD step definitions** — the `duplicate-uuid-fatal.feature` Gherkin wiring
  (step defs, `@cucumber/cucumber`) is E5-S1 (GH-29). GH-18 contributes only the
  fixture + the detector-level assertion that the Gherkin will drive (TC-BDD-001).

## 2. References

| Artifact | Path |
|----------|------|
| Story (authoritative scope) | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S1--document-identity.md` |
| Change specification | `./chg-GH-18-spec.md` _(pending — specification phase)_ |
| Implementation plan | `./chg-GH-18-plan.md` _(pending — delivery_planning phase)_ |
| PM notes | [`./chg-GH-18-pm-notes.yaml`](./chg-GH-18-pm-notes.yaml) |
| Testing strategy | [`.ai/rules/testing-strategy.md`](../../../.ai/rules/testing-strategy.md) (tiers + over-mocking guardrail; INV-SAFE-3 = Unit + Gherkin) |
| TypeScript conventions | [`.ai/rules/typescript.md`](../../../.ai/rules/typescript.md) (branded types, `#`-imports, tier rules, `Result<T,E>`) |
| Decision (load-bearing) | [ADR-0006](../../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md) (C-1 identity survives; C-4 duplicate fatal) |
| Feature spec | [`doc/spec/features/feature-safe-publish.md`](../../../spec/features/feature-safe-publish.md) §3.1 (identity), §5 (INV-SAFE-3) |
| Non-functional spec | [`doc/spec/nonfunctional.md`](../../../spec/nonfunctional.md) (NFR-REL-8 duplicate-UUID fatal) |
| Invariant catalog | [`doc/inception/analysis/id-prefix-catalog.md`](../../../inception/analysis/id-prefix-catalog.md) (INV-SAFE-3) |
| BDD wiring story (step defs) | `doc/planning/milestones/MS-2/MS2-E5--quality-and-ops/MS2-E5-S1--quality-gate-wiring.md` (`duplicate-uuid-fatal.feature`) |
| Sync engine (detector consumer) | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S6--sync-engine.md` |
| `Result<T,E>` primitive | `src/domain/result.ts` (`ok` / `err`) |
| `MarkSyncError` union + `DuplicateUuid` arm | `src/domain/errors.ts` (arm already present; GH-18 adds none) |
| Error-kind → code/exit map (existing) | `src/app/cli-error-map.ts`, `src/cli/output/exit-codes.ts` (`DUPLICATE_UUID` → exit 50, already wired) |

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

> The 6 acceptance criteria below are the story ACs (the authoritative list,
> reproduced from the story's "Acceptance criteria"). All 6 MUST appear, covered
> or TODO. The `F-IDENTITY-*` / `DM-IDENTITY-*` codes are test-plan-local labels
> (the change spec is pending); they will be reconciled to the spec's `F-#` /
> `AC-#` once `chg-GH-18-spec.md` lands — kept local to avoid TC churn (mirrors
> the GH-17 convention).

| Story AC | Description | F-# (prov.) | TC ID(s) | Status |
|----------|-------------|-------------|----------|--------|
| AC-1 (INV-SAFE-3) | Two docs sharing `marksync.uuid` → `detectDuplicateUuids` returns `err({kind:"DuplicateUuid"; uuid; paths[]})` listing both paths; an integration-level assertion proves the fatal signal is produced pre-write (ZERO writes end-to-end is the E5-S1 Gherkin consuming this fixture). | F-IDENTITY-4, NFR-REL-8 | TC-DUP-001, TC-DUP-002, TC-DUP-003, TC-DUP-005, TC-DUP-006, TC-DUP-007, TC-BDD-001 | Covered |
| AC-2 | `generateUuidV7` produces a v7 (time-sortable prefix; matches the v7 regex). | F-IDENTITY-1, F-IDENTITY-2 | TC-UUID-001, TC-UUID-002, TC-UUID-003, TC-UUID-004, TC-DOCID-001, TC-DOCID-002 | Covered |
| AC-3 | `injectUuid` is idempotent — running twice yields the same UUID and the same doc bytes (byte-stable, NO whitespace normalization). | F-IDENTITY-3 | TC-INJECT-001, TC-INJECT-002, TC-INJECT-003, TC-INJECT-004, TC-INJECT-005, TC-INJECT-006, TC-INJECT-007, TC-INJECT-008, TC-INIT-002 | Covered |
| AC-4 | A doc moved/renamed (different `sourcePath`) retains its UUID (identity independent of path — ADR-0006 C-1). | F-IDENTITY-3 | TC-IDSTABLE-001 | Covered |
| AC-5 | A re-clone (fresh checkout with committed front-matter) recovers the same UUIDs without regeneration. | F-IDENTITY-3 | TC-IDSTABLE-002, TC-INJECT-008 | Covered |
| AC-6 | `bun run check` green; dependency-cruiser boundary check (identity in `domain/`, no infra/app/cli import). | F-IDENTITY-6 | TC-GATE-001, TC-BND-001, TC-DOCID-002, TC-BIND-001 | Covered (gate) |

**Capability (F-IDENTITY-#, provisional) rollup:**

| F-IDENTITY-# (prov.) | Capability | TC ID(s) |
|----------------------|------------|----------|
| F-IDENTITY-1 | UUID v7 generation (`generateUuidV7`) — v7 shape, time-sortability | TC-UUID-001, TC-UUID-002 |
| F-IDENTITY-2 | UUID v7 validation (`isUuidV7` / `assertUuidV7`) + `DocumentId` branded VO (`parseDocumentId`) | TC-UUID-003, TC-UUID-004, TC-DOCID-001, TC-DOCID-002 |
| F-IDENTITY-3 | Front-matter binding (`injectUuid` / `readUuid`) — idempotent, byte-stable; identity survives path/re-clone | TC-INJECT-001..008, TC-IDSTABLE-001, TC-IDSTABLE-002, TC-INIT-002 |
| F-IDENTITY-4 | Duplicate-UUID detector (`detectDuplicateUuids`) → fatal `DuplicateUuid` (INV-SAFE-3) | TC-DUP-001..007, TC-BDD-001 |
| F-IDENTITY-5 | `PageBinding` lock-record type (ADR-0006 §3 schema) | TC-BIND-001 |
| F-IDENTITY-6 | `marksync init` UUID assignment + tier isolation + `bun run check` | TC-INIT-001, TC-BND-001, TC-GATE-001 |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No REST/HTTP endpoints and no events/messages are owned by this story (it is pure
domain logic; no Confluence network). Data-model coverage:

| DM-# (prov.) | Element | Description | TC ID(s) |
|--------------|---------|-------------|----------|
| DM-IDENTITY-1 | `DocumentId` | Branded VO `string & { __brand: "DocumentId" }` around a UUID v7 string; `parseDocumentId` constructs it. Prevents accidental string substitution at compile time. | TC-DOCID-001, TC-DOCID-002, TC-INJECT-006 |
| DM-IDENTITY-2 | `marksync.uuid` front-matter binding | `injectUuid(source): { source: string; uuid: DocumentId }` writes the key if absent (never overwrites); `readUuid(source): DocumentId \| undefined` reads it. Stored under the `marksync` namespace. | TC-INJECT-001..008, TC-IDSTABLE-001, TC-IDSTABLE-002, TC-INIT-001, TC-INIT-002 |
| DM-IDENTITY-3 | `detectDuplicateUuids` result | `detectDuplicateUuids(docs): Result<void, MarkSyncError>` → on collision `err({ kind: "DuplicateUuid"; uuid: string; paths: string[] })` (the `DuplicateUuid` arm already on `MarkSyncError`); else `ok`. Docs missing a uuid are not collisions. | TC-DUP-001..007 |
| DM-IDENTITY-4 | `PageBinding` lock-record type | `{ uuid, sourcePath, pageId, parentPageId, pageVersion, sourceCommit, sourceContentHash, renderedBodyHash, remoteBodyHash, attachmentHashes, operationId, synchronizedAt, toolVersion }` (ADR-0006 §3). Type + identity-binding semantics here; persistence in E3-S2. | TC-BIND-001 |

**Public interface contracts consumed downstream** (verified as side-effects of
the scenarios above):

| Contract | Consumer | Verified by |
|----------|----------|-------------|
| `generateUuidV7()` / `DocumentId` | `init`, `push-flow` (E3-S6), lock (E3-S2) | TC-UUID-001..004, TC-DOCID-001..002 |
| `detectDuplicateUuids()` — pre-write safety gate (INV-SAFE-3) | `push-flow` (E3-S6) — called FIRST, halts on `err` | TC-DUP-001, TC-DUP-007, TC-BDD-001 |
| `PageBinding` type | lock (E3-S2), drift (E3-S5), sync (E3-S6) | TC-BIND-001 |
| `readUuid` / `injectUuid` | markdown pipeline (E3-S3), config overrides, `init` | TC-INJECT-001..008, TC-INIT-001 |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR-# / INV-# | Requirement | Threshold | TC ID(s) | Status |
|---------------|-------------|-----------|----------|--------|
| INV-SAFE-3 | Duplicate-UUID is fatal before any write | Detector returns `err(DuplicateUuid)` on a duplicated fixture; end-to-end "zero writes" proven by the E5-S1 Gherkin (contributing fixture here) | TC-DUP-001, TC-DUP-007, TC-BDD-001 | Covered (Unit here; Gherkin in E5-S1) |
| NFR-REL-8 | Duplicate-UUID fatal | Two source docs with the same UUID halt before any write | TC-DUP-001, TC-DUP-007 | Covered |
| (correctness) | `injectUuid` byte-stability + idempotency | Output differs from input by EXACTLY the injected key; second inject is a byte-identical no-op; NO whitespace normalization | TC-INJECT-004, TC-INJECT-005, TC-INJECT-007 | Covered (Golden) |
| (tier isolation) | Identity modules live in `domain/`, import nothing upward | `check:boundaries` clean; no `#infra/`/`#app/`/`#cli/` import from `src/domain/identity/` or `src/domain/binding/` | TC-BND-001 | Covered (boundary gate) |
| (type safety) | `DocumentId` brand is opaque; `PageBinding` is structurally complete | `tsc --noEmit` exits 0; brand rejects bare `string` | TC-DOCID-002, TC-BIND-001 | Covered (typecheck gate) |

## 4. Test Types and Layers

Per `.ai/rules/testing-strategy.md` and the story's Test matrix, this story is
exercised at the **Unit**, **Integration**, and **Golden fixture** tiers. INV-SAFE-3
is validated at **Unit** here (the detector) + **Gherkin** in E5-S1 (GH-29). There
is no Storage renderer (no Golden XHTML) and no Confluence network (no E2E) in
this story.

| Layer | Applies | Runner | Root directory | Pattern |
|-------|---------|--------|----------------|---------|
| **Unit** | Yes (primary — uuid, document-id, duplicate-detector, inject/read logic) | `bun:test` | `tests/unit/` mirroring `src/` | `*.test.ts` |
| **Integration** | Yes (real YAML parse round-trip on fixture files; re-clone recovery; init assignment; pre-write halt signal) | `bun:test` | `tests/integration/` | `*.test.ts` |
| **Golden fixture** | Yes (byte-stable `injectUuid` output — input/expected-output fixture pair) | `bun:test` `toMatchSnapshot` / byte compare | `tests/golden/` + `tests/golden/fixtures/` | `*.md` fixtures |
| Mermaid-DOM | No | — | — | — |
| **BDD (Gherkin)** | Contributing only — fixture + detector assertion here; step defs in E5-S1 | `@cucumber/cucumber` (E5-S1) | `tests/bdd/features/` | `*.feature` |
| E2E (live-sandbox) | No | — | — | no Confluence network in this story |
| Type-level (compile safety) | Yes — branded `DocumentId` + `PageBinding` structural completeness | `bun run typecheck` | — | `tsc --noEmit` gate |

**Test-file layout (mirrors `src/` per testing-strategy.md / typescript.md):**

```
src/domain/identity/uuid.ts              → tests/unit/domain/identity/uuid.test.ts
src/domain/identity/document-id.ts       → tests/unit/domain/identity/document-id.test.ts
src/domain/identity/frontmatter.ts       → tests/unit/domain/identity/frontmatter.test.ts
src/domain/identity/duplicate-detector.ts → tests/unit/domain/identity/duplicate-detector.test.ts
src/domain/binding/page-binding.ts       → tests/unit/domain/binding/page-binding.test.ts
injectUuid byte-stability (golden)       → tests/golden/identity/inject-uuid.snapshot.test.ts
                                            tests/golden/fixtures/identity/{no-frontmatter,bare-frontmatter,existing-uuid}.md (+ .expected.md)
inject round-trip / re-clone (integration) → tests/integration/identity/frontmatter.test.ts
marksync init UUID assignment (integration) → tests/integration/identity/init-uuid.test.ts
DuplicateUuid pre-write halt (integration)  → tests/integration/identity/duplicate-detector.test.ts (TC-DUP-007)
BDD contributing fixture                  → tests/bdd/features/duplicate-uuid-fatal.feature (fixture authored here; step defs in E5-S1)
```

> **Layout note:** testing-strategy.md §"File naming" sketches `tests/domain/…`;
> the established repo convention (from `bunfig.toml` `root = "tests"` + the
> GH-14..17 precedent) is the `tests/unit/…` / `tests/integration/…` /
> `tests/golden/…` split. This plan follows the established convention. Tests use
> the `#domain/*` import alias (package.json `"imports"`), NOT deep relative
> paths (typescript.md §"Tests use import aliases").

**Over-mocking guardrail compliance (TDR-0004 §"Test-design guardrail").** This
plan is guardrail-compliant: every function under test (`generateUuidV7`,
`isUuidV7`/`assertUuidV7`, `parseDocumentId`, `injectUuid`/`readUuid`,
`detectDuplicateUuids`) is a **pure domain function** and is tested with **real
inputs and real outputs** — real v7 strings, real front-matter fixtures, real
UUID fixtures — with **no mocked dependencies**. The over-mocking guardrail
explicitly forbids mocking domain logic and forbids validating lifecycle
invariants (INV-SAFE-3) through mocks alone. INV-SAFE-3 is covered by (a) the
Unit detector test on a real duplicated fixture (TC-DUP-001) and (b) the E5-S1
Gherkin driving the real sync engine — never by a mock asserting "the detector
was called". There is no `Bun.serve` mock in this story (no HTTP); the only
"fake" surface is deterministic in-memory fixture strings.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-UUID-001 | `generateUuidV7()` matches the v7 regex + has version/variant bits | Happy Path | Critical | High | AC-2 |
| TC-UUID-002 | Successive `generateUuidV7()` calls are time-sortable (monotonic non-decreasing) | Corner Case | Critical | High | AC-2 |
| TC-UUID-003 | `isUuidV7` accepts valid v7; rejects v4 / nil / non-uuid / malformed | Edge Case | Critical | High | AC-2 |
| TC-UUID-004 | `assertUuidV7` returns on valid; throws on invalid | Negative | Important | Medium | AC-2 |
| TC-DOCID-001 | `parseDocumentId(valid v7)` → `DocumentId`; invalid → typed failure | Happy Path | Important | Medium | AC-2 |
| TC-DOCID-002 | `DocumentId` brand is opaque — bare `string` not assignable (compile guard) | Corner Case | Important | Medium | AC-2, AC-6 |
| TC-INJECT-001 | `injectUuid` on doc with NO front-matter → creates block + `marksync.uuid`; body preserved | Happy Path | Critical | High | AC-3 |
| TC-INJECT-002 | `injectUuid` on doc with front-matter but no `marksync.uuid` → adds key, existing keys/body untouched | Happy Path | Critical | High | AC-3 |
| TC-INJECT-003 | `injectUuid` on doc with EXISTING `marksync.uuid` → does NOT overwrite; bytes unchanged | Corner Case | Critical | High | AC-3 |
| TC-INJECT-004 | `injectUuid` is idempotent — inject twice → same uuid AND byte-identical output | Corner Case | Critical | High | AC-3 |
| TC-INJECT-005 | Byte-stability — output differs from input by EXACTLY the injected key line (golden) | Corner Case | Critical | High | AC-3 |
| TC-INJECT-006 | `readUuid` returns `DocumentId` when present; `undefined` when absent | Happy Path | Important | Medium | AC-3, AC-5 |
| TC-INJECT-007 | `injectUuid` preserves CRLF / trailing newline / blank-line / comment structure | Edge Case | Important | Medium | AC-3 |
| TC-INJECT-008 | `inject` → write → re-read round-trips the same UUID (real YAML parse) | Integration | Important | Medium | AC-3, AC-5 |
| TC-DUP-001 | Two docs sharing `marksync.uuid` → `err(DuplicateUuid)` listing BOTH paths (INV-SAFE-3) | Negative | Critical | High | AC-1 |
| TC-DUP-002 | All docs distinct UUIDs → `ok` | Happy Path | Critical | High | AC-1 |
| TC-DUP-003 | Docs MISSING a uuid are NOT duplicates → `ok` | Corner Case | Critical | High | AC-1 |
| TC-DUP-004 | Empty input → `ok` | Corner Case | Minor | Low | AC-1 |
| TC-DUP-005 | 3+ docs sharing one uuid → `paths[]` lists all colliding paths | Corner Case | Important | Medium | AC-1 |
| TC-DUP-006 | `DuplicateUuid` is the existing `MarkSyncError` arm; flows via `Result` + error-map → `DUPLICATE_UUID` / exit 50 (no new arm) | Regression | Important | Medium | AC-1, AC-6 |
| TC-DUP-007 | Duplicated fixture fed to the pre-write detection yields `err` (halt signal) BEFORE any write (domain-level INV-SAFE-3) | Negative | Critical | High | AC-1 |
| TC-BIND-001 | `PageBinding` record carries the full ADR-0006 §3 lock schema | Corner Case | Important | Medium | AC-6 |
| TC-IDSTABLE-001 | Doc moved/renamed (different `sourcePath`) retains its UUID via `readUuid` (C-1) | Corner Case | Critical | High | AC-4 |
| TC-IDSTABLE-002 | Re-clone fixture — fresh checkout recovers the SAME UUIDs without regeneration | Corner Case | Critical | High | AC-5 |
| TC-INIT-001 | `marksync init` injects a v7 UUID into each discovered managed doc (writes the file) | Happy Path | Important | Medium | AC-3 |
| TC-INIT-002 | `marksync init` is idempotent — re-run does NOT overwrite existing UUIDs | Corner Case | Important | Medium | AC-3 |
| TC-BDD-001 | Contributing scenario "duplicate UUID halts with zero writes" — fixture + detector assertion here; step defs + end-to-end in E5-S1 | Manual (cross-story) | Critical | High | AC-1 |
| TC-GATE-001 | `bun run check` (lint + typecheck + test + boundaries) exits 0 | Regression | Critical | High | AC-6 |
| TC-BND-001 | dependency-cruiser — identity modules in `domain/`, no infra/app/cli import | Regression | Critical | High | AC-6 |

### 5.2 Scenario Details

#### TC-UUID-001 - `generateUuidV7()` matches the v7 regex + has version/variant bits

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-1, DM-IDENTITY-1, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/uuid.test.ts`
**Tags**: @backend

**Preconditions**:

- The `uuid` package (v9+, providing `v7()`) is installed (`bun add uuid` is part
  of delivery — GH-18 is the first consuming story).

**Steps**:

1. Call `generateUuidV7()` N times (e.g. 100).
2. For each value, assert it matches the RFC 9562 v7 regex (36 chars,
   `xxxxxxxx-xxxx-7xxx-[89ab]xxx-xxxxxxxxxxxx` — version nibble `7`, variant
   bits `[89ab]`).
3. Assert the timestamp-prefix portion decodes to a millisecond ≥ the time the
   batch started (v7 embeds a Unix-ms prefix).

**Expected Outcome**:

- Every generated value is a well-formed UUID v7 with the correct version and
  variant bits — the time-sortable, schema-stable identity chosen in ADR-0006.

---

#### TC-UUID-002 - Successive `generateUuidV7()` calls are time-sortable (monotonic non-decreasing)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-1, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/uuid.test.ts`
**Tags**: @backend

**Preconditions**:

- A tight loop generating values within the same millisecond and across a small
  sleep boundary.

**Steps**:

1. Generate a sequence `a = generateUuidV7()` … `b = generateUuidV7()`.
2. Assert `a <= b` by lexicographic (string) comparison — v7's ms-prefix makes
   same-run sequences monotonic non-decreasing.
3. (Optional) Sleep past a ms boundary and assert a later value's decoded ms >
   an earlier value's ms.

**Expected Outcome**:

- The v7 time-sortable prefix holds: lock-file locality and reduced merge
   conflicts (ADR-0006 Identity rationale) depend on monotonic ordering.

---

#### TC-UUID-003 - `isUuidV7` accepts valid v7; rejects v4 / nil / non-uuid / malformed

**Scenario Type**: Edge Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-2, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/uuid.test.ts`
**Tags**: @backend

**Preconditions**:

- A parametrized table of: valid v7 (accept), v4 string (reject), nil UUID
  (`00000000-0000-0000-0000-000000000000`, reject), all-zeros-ish garbage, a
  short string, a 36-char string with wrong version nibble, wrong variant bits,
  `undefined`/`null`/`""`/non-string.

**Steps**:

1. For each table row, call `isUuidV7(candidate)`.
2. Assert it returns `true` only for the valid-v7 rows and `false` for every
   other row.

**Expected Outcome**:

- `isUuidV7` is a sound type guard: it accepts exactly well-formed v7 values and
  rejects every other shape, so `parseDocumentId`/front-matter reads cannot
  mis-bind a non-v7 string as identity.

---

#### TC-UUID-004 - `assertUuidV7` returns on valid; throws on invalid

**Scenario Type**: Negative
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-2, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/uuid.test.ts`
**Tags**: @backend

**Steps**:

1. Call `assertUuidV7(<valid v7>)` — assert it does not throw (and returns/void
   as documented).
2. Call `assertUuidV7("not-a-uuid")` — assert it throws (invariant-violation
   throw, per the two-layer error strategy; a typed/guarded throw is acceptable
   here since this is an invariant guard, not an expected domain failure).

**Expected Outcome**:

- `assertUuidV7` is the fail-fast guard for invariant violations only; expected
  parse failures go through `Result` (TC-DOCID-001).

---

#### TC-DOCID-001 - `parseDocumentId(valid v7)` → `DocumentId`; invalid → typed failure

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-2, DM-IDENTITY-1, AC-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/document-id.test.ts`
**Tags**: @backend

**Preconditions**:

- `parseDocumentId` is the documented constructor for the branded VO from an
  untrusted string (front-matter read path).

**Steps**:

1. `parseDocumentId(<valid v7>)` → assert it returns a `DocumentId` whose value
   equals the input and `isUuidV7` of it is `true`.
2. `parseDocumentId(<invalid>)` → assert it returns the documented failure (a
   `Result.err` / typed throw per the module's chosen contract — pin the actual
   shape at delivery, see OQ-TP-4).

**Expected Outcome**:

- The branded VO is constructed only from valid v7 strings; invalid input is
  rejected at the boundary, never smuggled into the domain as a `DocumentId`.

---

#### TC-DOCID-002 - `DocumentId` brand is opaque — bare `string` not assignable (compile guard)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-2, DM-IDENTITY-1, AC-2, AC-6
**Test Type(s)**: Unit (typecheck gate)
**Automation Level**: Automated (via `bun run typecheck`)
**Target Layer / Location**: `tests/unit/domain/identity/document-id.test.ts`; gate = `bun run typecheck`
**Tags**: @backend

**Preconditions**:

- `DocumentId = string & { __brand: "DocumentId" }` (story technical approach).

**Steps**:

1. Assert a `DocumentId` IS assignable to `string` (it extends string).
2. Assert a bare `string` is NOT assignable to `DocumentId` (the brand rejects
   it) — encode this as a compile-time expectation (e.g. a
   `// @ts-expect-error` line that a bare `string` assignment to `DocumentId`
   fails).
3. Confirm `bun run typecheck` exits 0 with the `@ts-expect-error` present (and
   would fail if the brand were dropped).

**Expected Outcome**:

- The brand prevents accidental string substitution at compile time — a
  `pageId` or arbitrary string cannot be passed where a `DocumentId` is required.

---

#### TC-INJECT-001 - `injectUuid` on doc with NO front-matter → creates block + `marksync.uuid`; body preserved

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-3, DM-IDENTITY-2, AC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/frontmatter.test.ts`
**Tags**: @backend

**Preconditions**:

- A fixture doc with **no** YAML front-matter block (just a Markdown body).

**Steps**:

1. `const { source, uuid } = injectUuid(noFmDoc)`.
2. Assert `isUuidV7(uuid)` is `true`.
3. Assert the returned `source` now has a front-matter block containing
   `marksync.uuid: <uuid>` and the original body is present byte-for-byte after
   the block.

**Expected Outcome**:

- A doc lacking front-matter gets a fresh v7 + a well-formed block; the body is
  untouched. This is the `marksync init` first-publish path.

---

#### TC-INJECT-002 - `injectUuid` on doc with front-matter but no `marksync.uuid` → adds key, existing keys/body untouched

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-3, DM-IDENTITY-2, AC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/frontmatter.test.ts`
**Tags**: @backend

**Preconditions**:

- A fixture doc with a front-matter block carrying other keys
  (e.g. `title: …`, `marksync.spaceKey: …`) but **no** `marksync.uuid`.

**Steps**:

1. `injectUuid(doc)`.
2. Assert the output front-matter still contains every original key with the
   same values AND now also contains `marksync.uuid`.
3. Assert the body after the block is byte-identical to the input body.

**Expected Outcome**:

- The injector touches ONLY the `marksync.uuid` key; pre-existing front-matter
  and the body are preserved.

---

#### TC-INJECT-003 - `injectUuid` on doc with EXISTING `marksync.uuid` → does NOT overwrite; bytes unchanged

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-3, DM-IDENTITY-2, AC-3, ADR-0006 C-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/frontmatter.test.ts`
**Tags**: @backend

**Preconditions**:

- A fixture doc whose front-matter already has `marksync.uuid: <known v7>`.

**Steps**:

1. `const { source, uuid } = injectUuid(docWithExistingUuid)`.
2. Assert `uuid === <known v7>` (the existing one, NOT a fresh one).
3. Assert `source === docWithExistingUuid` byte-for-byte (zero mutation).

**Expected Outcome**:

- Identity is immutable once assigned: `injectUuid` never overwrites an existing
  `marksync.uuid` and changes no bytes. This is the idempotency + immutability
  core (ADR-0006 C-1).

---

#### TC-INJECT-004 - `injectUuid` is idempotent — inject twice → same uuid AND byte-identical output

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-3, DM-IDENTITY-2, AC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/frontmatter.test.ts`
**Tags**: @backend

**Preconditions**:

- A fixture doc with no `marksync.uuid` (so the first inject writes one).

**Steps**:

1. `const first = injectUuid(doc).source; const r2 = injectUuid(first);`.
2. Assert `r2.source === first` byte-for-byte (Buffer/byte comparison, not a
   normalized string compare).
3. Assert `injectUuid(first).uuid === r2.uuid` (the uuid assigned on the first
   pass is the one preserved).

**Expected Outcome**:

- Running `injectUuid` twice is a no-op after the first pass: same uuid, same
  bytes. Byte comparison (not normalized) is mandatory — whitespace
  normalization would silently pass a string compare and fail this byte compare.

---

#### TC-INJECT-005 - Byte-stability — output differs from input by EXACTLY the injected key line (golden)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-3, DM-IDENTITY-2, AC-3
**Test Type(s)**: Golden fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/identity/inject-uuid.snapshot.test.ts` + `tests/golden/fixtures/identity/*.md` (+ `.expected.md`)
**Tags**: @backend

**Preconditions**:

- Committed fixture pairs: `no-frontmatter.md` → `.expected.md`,
  `bare-frontmatter.md` → `.expected.md`, `existing-uuid.md` → `.expected.md`.
  Fixtures include trailing whitespace, blank lines, and a comment line that must
  survive verbatim.

**Steps**:

1. For each fixture pair, `injectUuid(readFixture(input))` using a **fixed** v7
   (inject a deterministic uuid in tests — e.g. an injectable generator — so the
   snapshot is byte-stable; the random generator is exercised separately in
   TC-UUID-001/002).
2. Assert the output byte-equals the committed `.expected.md` (`Buffer.from(out)
   equals Buffer.from(expected)`).
3. Additionally assert that stripping the single injected `marksync.uuid` line
   from the output recovers the input bytes exactly (proving the diff is ONLY
   that line).

**Expected Outcome**:

- The injector's output is byte-stable and reviewable in a PR diff; the only
   change it ever makes is adding (once) the `marksync.uuid` key. This is the
   AC-3 byte-stability proof and the guard against accidental whitespace
   normalization.

**Notes / Clarifications**:

- `injectUuid` must accept an injectable UUID generator (DI) so the golden
  snapshot is deterministic — see OQ-TP-3. The generator default remains the
  real `generateUuidV7`.

---

#### TC-INJECT-006 - `readUuid` returns `DocumentId` when present; `undefined` when absent

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-3, DM-IDENTITY-1, DM-IDENTITY-2, AC-3, AC-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/frontmatter.test.ts`
**Tags**: @backend

**Preconditions**:

- Three fixtures: (a) front-matter with `marksync.uuid`; (b) front-matter
  without it; (c) no front-matter at all.

**Steps**:

1. `readUuid(a)` → assert it returns a `DocumentId` equal to the fixture's uuid.
2. `readUuid(b)` → assert it returns `undefined`.
3. `readUuid(c)` → assert it returns `undefined`.

**Expected Outcome**:

- `readUuid` is a sound reader for the binding; absence is `undefined`, never an
  exception. This is the read half that `init`/re-clone (AC-5) and the duplicate
  detector rely on.

---

#### TC-INJECT-007 - `injectUuid` preserves CRLF / trailing newline / blank-line / comment structure

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-3, DM-IDENTITY-2, AC-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/frontmatter.test.ts`
**Tags**: @backend

**Preconditions**:

- Parametrized fixtures with: CRLF line endings; a file with no trailing
  newline; leading/trailing blank lines; a `#` comment inside front-matter.

**Steps**:

1. For each fixture, `injectUuid(src)` (fixed generator).
2. Assert the line-ending style of the **body** and the existing front-matter is
   preserved (CRLF stays CRLF, LF stays LF); the injected key uses the file's
   dominant line ending.
3. Assert a trailing newline (present or absent) is preserved on the whole doc;
   the comment line survives verbatim.

**Expected Outcome**:

- No whitespace normalization anywhere: line endings, trailing newline, blank
  lines, and comments are byte-preserved. This sharpens AC-3 against the YAML
  parser's tendency to re-emit normalized output.

---

#### TC-INJECT-008 - `inject` → write → re-read round-trips the same UUID (real YAML parse)

**Scenario Type**: Integration
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-3, DM-IDENTITY-2, AC-3, AC-5
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/identity/frontmatter.test.ts`
**Tags**: @backend

**Preconditions**:

- A temp file written with `injectUuid`'s output, then re-opened.

**Steps**:

1. `injectUuid(doc)` → write `source` to a temp `.md` file.
2. Re-read the file from disk; call `readUuid(fileContents)`.
3. Assert the re-read `DocumentId` equals the `uuid` injected in step 1.

**Expected Outcome**:

- The binding survives a real serialize → disk → parse round-trip through the
  `yaml` parser (the cross-check that the written key is what gets read back).
  Supports the re-clone guarantee (AC-5).

---

#### TC-DUP-001 - Two docs sharing `marksync.uuid` → `err(DuplicateUuid)` listing BOTH paths (INV-SAFE-3)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-4, DM-IDENTITY-3, AC-1, INV-SAFE-3, NFR-REL-8, ADR-0006 C-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/duplicate-detector.test.ts`
**Tags**: @backend, @security

**Preconditions**:

- A fixture set: two docs whose `marksync.uuid` is the SAME v7, at distinct
  `sourcePath`s (`docs/a.md`, `docs/b.md`).

**Steps**:

1. `const result = detectDuplicateUuids([{ path: "docs/a.md", uuid: SHARED }, { path: "docs/b.md", uuid: SHARED }])`.
2. Assert `result.ok === false`.
3. Assert `result.error.kind === "DuplicateUuid"`.
4. Assert `result.error.uuid === SHARED`.
5. Assert `result.error.paths` contains exactly BOTH `"docs/a.md"` and
   `"docs/b.md"` (order-tolerant comparison).

**Expected Outcome**:

- A duplicated UUID yields the typed fatal `DuplicateUuid` error naming the
  shared uuid and BOTH colliding paths. This is the load-bearing INV-SAFE-3 unit
  proof; E3-S6's push flow consumes this `err` to halt before any write.

---

#### TC-DUP-002 - All docs distinct UUIDs → `ok`

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-4, DM-IDENTITY-3, AC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/duplicate-detector.test.ts`
**Tags**: @backend

**Steps**:

1. `detectDuplicateUuids([{ path: "a.md", uuid: U1 }, { path: "b.md", uuid: U2 }, …])`
   with all-distinct uuids.
2. Assert `result.ok === true`.

**Expected Outcome**:

- A clean doc set passes the gate — no false positives.

---

#### TC-DUP-003 - Docs MISSING a uuid are NOT duplicates → `ok`

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-4, DM-IDENTITY-3, AC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/duplicate-detector.test.ts`
**Tags**: @backend

**Preconditions**:

- Several docs with `uuid: undefined` (no `marksync.uuid` yet).

**Steps**:

1. `detectDuplicateUuids([{ path: "a.md" }, { path: "b.md" }, { path: "c.md" }])`
   (no uuids at all).
2. Assert `result.ok === true`.
3. Mix: one doc with a uuid + several without → assert still `ok` (a present
   uuid colliding with nothing is fine).

**Expected Outcome**:

- Docs missing a uuid are NOT collisions — they will each get one at first
  publish. Flagging them as duplicates would block every fresh `init`.

---

#### TC-DUP-004 - Empty input → `ok`

**Scenario Type**: Corner Case
**Impact Level**: Minor
**Priority**: Low
**Related IDs**: F-IDENTITY-4, DM-IDENTITY-3, AC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/duplicate-detector.test.ts`
**Tags**: @backend

**Steps**:

1. `detectDuplicateUuids([])`.
2. Assert `result.ok === true`.

**Expected Outcome**:

- An empty managed set is not an error.

---

#### TC-DUP-005 - 3+ docs sharing one uuid → `paths[]` lists all colliding paths

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-4, DM-IDENTITY-3, AC-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/duplicate-detector.test.ts`
**Tags**: @backend

**Preconditions**:

- Three docs sharing one uuid; plus a separate collision on a second uuid.

**Steps**:

1. `detectDuplicateUuids([{path:"a.md",uuid:X},{path:"b.md",uuid:X},{path:"c.md",uuid:X},{path:"d.md",uuid:Y},{path:"e.md",uuid:Y}])`.
2. Assert `err` with `kind:"DuplicateUuid"`.
3. Assert the reported `paths`/`uuid` identifies a real collision (whether the
   detector reports the first collision or aggregates all — pin the actual
   contract at delivery; both X and Y collisions must be discoverable, see
   OQ-TP-2).

**Expected Outcome**:

- Multi-doc and multi-collision inputs are handled without truncation; the
  diagnostic surfaces enough to locate every offender.

---

#### TC-DUP-006 - `DuplicateUuid` is the existing `MarkSyncError` arm; flows via `Result` + error-map → `DUPLICATE_UUID` / exit 50 (no new arm)

**Scenario Type**: Regression
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-4, DM-IDENTITY-3, AC-1, AC-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/identity/duplicate-detector.test.ts` (+ regression side-check against the existing `tests/unit/app/cli-error-map.test.ts` / `tests/unit/cli/output/exit-codes.test.ts`)
**Tags**: @backend

**Preconditions**:

- The `DuplicateUuid` arm already exists in `src/domain/errors.ts`; the map
  `DuplicateUuid → DUPLICATE_UUID → EXIT_INVARIANT (50)` is already wired (GH-16)
  and already covered by `tests/unit/domain/result.test.ts`,
  `tests/unit/app/cli-error-map.test.ts`, `tests/unit/cli/output/exit-codes.test.ts`.

**Steps**:

1. Produce a `DuplicateUuid` error from the detector (as in TC-DUP-001).
2. Assert it is a valid `MarkSyncError` member and flows through `Result` without
   a new arm (the union is unchanged by GH-18).
3. (Regression side-check) Re-assert the existing `DUPLICATE_UUID → 50` mapping
   still resolves — no regression from the new detector wiring.

**Expected Outcome**:

- GH-18 adds NO new `MarkSyncError` kind (unlike GH-17's `Auth` arm): the
  `DuplicateUuid` arm pre-exists and the detector simply produces it. The
  stable `DUPLICATE_UUID`/exit-50 contract still holds.

---

#### TC-DUP-007 - Duplicated fixture fed to the pre-write detection yields `err` (halt signal) BEFORE any write (domain-level INV-SAFE-3)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-4, DM-IDENTITY-3, AC-1, INV-SAFE-3, NFR-REL-8
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/identity/duplicate-detector.test.ts`
**Tags**: @backend, @security

**Preconditions**:

- The duplicated fixture from TC-DUP-001. A thin domain-level "pre-write gate"
  wrapper (the call site E3-S6 will use) that runs `detectDuplicateUuids` first
  and, on `err`, halts WITHOUT invoking any write — OR, if no such wrapper is
  authored here, the integration proves the detector's `err` is the signal the
  write phase keys on (see OQ-TP-1).

**Steps**:

1. Feed the duplicated doc set to the pre-write detection step.
2. Assert it returns `err(DuplicateUuid)` (the halt signal).
3. Assert the (injectable) write phase is **never invoked** when the gate returns
   `err` — i.e. zero writes are dispatched (a write-counter/spy stays at 0). If
   no write path exists in this story, document that the end-to-end "zero
   Confluence writes" proof is the E5-S1 Gherkin (TC-BDD-001) and assert the
   halt-signal contract only.

**Expected Outcome**:

- INV-SAFE-3's fatal signal is produced at the domain boundary, pre-write. The
   detector's `err` is the gate E3-S6 consumes; the full zero-writes end-to-end
   proof lives in the E5-S1 Gherkin driving the real sync engine (cross-ref
   TC-BDD-001). No mock is used to assert the invariant.

**Notes / Clarifications**:

- This scenario satisfies the AC-1 "integration-level assertion (in E3-S6 or
  here)". The ownership split between "domain halt signal here" and "end-to-end
  zero writes in E5-S1/E3-S6" is OQ-TP-1.

---

#### TC-BIND-001 - `PageBinding` record carries the full ADR-0006 §3 lock schema

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-5, DM-IDENTITY-4, AC-6
**Test Type(s)**: Unit (structural / typecheck)
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/binding/page-binding.test.ts`
**Tags**: @backend

**Preconditions**:

- `PageBinding` is defined in `src/domain/binding/` (record type).

**Steps**:

1. Construct a `PageBinding` literal with every field from ADR-0006 §3:
   `uuid, sourcePath, pageId, parentPageId, pageVersion, sourceCommit,
   sourceContentHash, renderedBodyHash, remoteBodyHash, attachmentHashes,
   operationId, synchronizedAt, toolVersion`.
2. Assert the object's keys equal that exact set (structural assertion).
3. Assert `uuid` is typed `DocumentId` (the brand binds identity to the binding)
   — a compile-time + runtime check.
4. Confirm `bun run typecheck` exits 0 (a missing or extra field fails to compile).

**Expected Outcome**:

- The lock-record shape matches ADR-0006 §3 exactly; identity (`DocumentId`) is
  the binding's key. Persistence is E3-S2; here only the type is fixed.

---

#### TC-IDSTABLE-001 - Doc moved/renamed (different `sourcePath`) retains its UUID via `readUuid` (C-1)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-3, DM-IDENTITY-2, AC-4, ADR-0006 C-1
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/identity/frontmatter.test.ts`
**Tags**: @backend

**Preconditions**:

- A fixture doc with a committed `marksync.uuid`. The same bytes are "moved" to
  a new path.

**Steps**:

1. Read the doc's UUID at `docs/old-name.md`.
2. Copy the identical bytes to `docs/new-name.md` (a rename/move).
3. `readUuid` the new path's contents; assert it returns the SAME `DocumentId`.

**Expected Outcome**:

- Identity is independent of `sourcePath`/title — it lives in the front-matter,
  so a rename preserves it (ADR-0006 C-1). This is the AC-4 proof.

---

#### TC-IDSTABLE-002 - Re-clone fixture — fresh checkout recovers the SAME UUIDs without regeneration

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-3, DM-IDENTITY-2, AC-5, ADR-0006 C-1/C-2
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/identity/frontmatter.test.ts`
**Tags**: @backend

**Preconditions**:

- A committed-fixture corpus (several `.md` files each with a stable
  `marksync.uuid`), representing what survives in Git.

**Steps**:

1. Snapshot the committed UUIDs from the corpus via `readUuid`.
2. Simulate a fresh clone: re-read the same files into fresh buffers (no
   in-memory state) and `readUuid` again.
3. Assert every recovered UUID equals the committed one — NO regeneration
   occurred (no call to `generateUuidV7` for docs that already have a uuid).

**Expected Outcome**:

- A re-clone recovers identity from the committed front-matter alone; identity
  is not cache-derived and does not require regeneration (ADR-0006 C-1/C-2).

---

#### TC-INIT-001 - `marksync init` injects a v7 UUID into each discovered managed doc (writes the file)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-6, DM-IDENTITY-2, AC-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/identity/init-uuid.test.ts`
**Tags**: @backend

**Preconditions**:

- A temp project tree with several managed docs (some with a uuid, some
  without). The `marksync init` identity-assignment step is wired (discovery is
  the story's stated scope; full orchestration is later).

**Steps**:

1. Run the `marksync init` UUID-assignment step over the tree.
2. For each doc that lacked a uuid, assert the file on disk now contains a valid
   `marksync.uuid` (v7).
3. Assert the injected uuid is stable: re-running `readUuid` returns it.

**Expected Outcome**:

- First-publish identity assignment writes a v7 into each managed doc's
  front-matter — the `init` half of ADR-0006 Implementation Plan item 1.

---

#### TC-INIT-002 - `marksync init` is idempotent — re-run does NOT overwrite existing UUIDs

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: F-IDENTITY-6, DM-IDENTITY-2, AC-3
**Test Type(s)**: Integration
**Automation Level**: Automated
**Target Layer / Location**: `tests/integration/identity/init-uuid.test.ts`
**Tags**: @backend

**Preconditions**:

- A tree where some docs already carry a `marksync.uuid`.

**Steps**:

1. Snapshot the existing uuids.
2. Run the `marksync init` assignment step again.
3. Assert every pre-existing uuid is unchanged (byte-for-byte) and no new uuid
   was generated for docs that already had one.

**Expected Outcome**:

- `init` honours immutability: re-running never reassigns identity (delegates to
  `injectUuid`'s idempotency, TC-INJECT-003).

---

#### TC-BDD-001 - Contributing scenario "duplicate UUID halts with zero writes" — fixture + detector assertion here; step defs + end-to-end in E5-S1

**Scenario Type**: Manual (cross-story)
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-4, DM-IDENTITY-3, AC-1, INV-SAFE-3, NFR-REL-8
**Test Type(s)**: BDD (Gherkin) — fixture + detector assertion authored in GH-18; step definitions wired in E5-S1 (GH-29)
**Automation Level**: Semi-automated (fixture + unit assertion automated here; `.feature` + step defs land in E5-S1)
**Target Layer / Location**: `tests/bdd/features/duplicate-uuid-fatal.feature` (fixture/scenario authored here); step defs `tests/bdd/steps/duplicate-uuid-fatal.steps.ts` (E5-S1)
**Tags**: @backend, @security, @bdd

**Preconditions**:

- The INV-SAFE-3 Gherkin scenario is part of the TDR-0007 mandatory floor
  (`duplicate-uuid-fatal.feature`). Its step definitions drive the **real** sync
  engine (E3-S6) against a `Bun.serve` mock Confluence (E5-S1 scope).

**What GH-18 contributes**:

1. The **duplicated-UUID fixture** (two docs sharing `marksync.uuid`) — the same
   fixture as TC-DUP-001.
2. The **detector-level assertion** that this fixture yields
   `err(DuplicateUuid)` (TC-DUP-001) — the unit proof the Gherkin builds on.
3. A draft of the `.feature` scenario body (the Given/When/Then for "duplicate
   UUID halts with zero writes") so E5-S1 only wires the step defs against the
   real engine.

**What GH-18 does NOT contribute**:

- The `@cucumber/cucumber` wiring, `test:bdd` script, step definitions, and the
  end-to-end **"zero writes" assertion** (driving the real sync engine against
  the mock target) — these are E5-S1 (GH-29). The over-mocking guardrail requires
  the invariant to be validated through the real engine (integration-level), not
  a mock of domain logic.

**Steps** (the contributed `.feature` draft):

1. **Given** a corpus with two docs sharing the same `marksync.uuid`.
2. **When** a sync (plan + apply) is run.
3. **Then** `detectDuplicateUuids` returns `err(DuplicateUuid)` naming both paths.
4. **And** ZERO writes are dispatched to Confluence (the apply halts).

**Expected Outcome**:

- The INV-SAFE-3 release-blocking invariant is owned end-to-end by the E5-S1
  Gherkin; GH-18 supplies the fixture + the detector unit proof + the scenario
  draft, so the invariant is traceable from this story even though the wiring
  lands later.

---

#### TC-GATE-001 - `bun run check` (lint + typecheck + test + boundaries) exits 0

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-1..6, AC-6
**Test Type(s)**: Manual (quality gate)
**Automation Level**: Automated (via CI)
**Target Layer / Location**: gate = `bun run check`
**Tags**: @backend

**Steps**:

1. Run `bun run check` (= lint + format:check + typecheck + test +
   check:boundaries).
2. Assert exit 0.

**Expected Outcome**:

- All gates green: Biome lint/format, `tsc --noEmit` strict (incl. the
  `DocumentId` brand + `PageBinding` structural completeness), all tests pass,
  dep-cruiser boundaries clean. This is the AC-6 gate.

---

#### TC-BND-001 - dependency-cruiser — identity modules in `domain/`, no infra/app/cli import

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-IDENTITY-1..5, AC-6, ADR-0006, NFR (tier isolation)
**Test Type(s)**: Manual (boundary gate)
**Automation Level**: Automated (via CI)
**Target Layer / Location**: gate = `bun run check:boundaries` (+ `rg` side-check)
**Tags**: @backend

**Steps**:

1. Run `bun run check:boundaries` (dependency-cruiser).
2. Run `rg '#infra/|#app/|#cli/' src/domain/identity src/domain/binding` → assert
   empty (identity imports nothing upward).
3. Confirm identity modules import only `#domain/*` (e.g. `#domain/errors`,
   `#domain/result`) or the `uuid` library — no tier violations.

**Expected Outcome**:

- Identity is pure domain: it defines ports/types and depends on nothing upward.
  This is the AC-6 boundary check and the ADR-0006 separation-of-concerns guard
  (identity ≠ shared base ≠ cache).

## 6. Environments and Test Data

- **Environment:** local-dev (`bun:test` in-process). No Confluence tenant, no
  network egress, no `Bun.serve` mock in this story (no HTTP). All tests are
  deterministic and hermetic.
- **Runner:** `bun:test` (TDR-0004). Test roots `tests/unit/`,
  `tests/integration/`, `tests/golden/` per `bunfig.toml` (`root = "tests"`).
- **Deterministic UUIDs in tests:** the real `generateUuidV7` is exercised for
  shape/ordering (TC-UUID-001/002) but the **byte-stability** scenarios
  (TC-INJECT-005/007) inject a **fixed** v7 via an injectable generator so the
  golden snapshots are byte-stable. See OQ-TP-3.
- **Fixtures:**
  - Front-matter fixtures: `no-frontmatter.md`, `bare-frontmatter.md`,
    `existing-uuid.md`, plus CRLF / no-trailing-newline / comment variants —
    committed under `tests/golden/fixtures/identity/` (input + `.expected.md`
    pairs) and reused by the unit tests.
  - Duplicate-UUID fixture: two docs sharing a known v7 — the same fixture
    TC-DUP-001 and the E5-S1 Gherkin (TC-BDD-001) consume.
  - Re-clone corpus: several `.md` files with stable committed uuids.
- **Integration harness:** writes `injectUuid` output to a temp file and re-reads
  it (TC-INJECT-008); simulates move/rename and re-clone by re-reading fixture
  bytes (TC-IDSTABLE-001/002). No real Git operations are required (identity
  lives in front-matter bytes); if a real temp Git repo is preferred for the
  re-clone scenario, use the established Git-adapter temp-repo pattern.
- **Isolation:** every test is pure-functional on input strings/fixtures; no
  cross-test shared state. Temp files are written under a per-test tmp dir and
  cleaned up in teardown.
- **New runtime dependency:** `uuid` (v9+, for `v7()`) — GH-18 is the first
  consuming story (`bun add uuid` is a delivery step). `uuid` is zero/low-dep,
  MIT-licensed, already on the typescript.md "Planned" allowed list. The
  license/vuln scan is the repo-wide GH-14 gate; no new audit gate is introduced
  here.

## 7. Automation Plan and Implementation Mapping

| TC ID(s) | Test file | Status | Mocking | Command |
|----------|-----------|--------|---------|---------|
| TC-UUID-001..004 | `tests/unit/domain/identity/uuid.test.ts` | To Implement | None (real v7 strings) | `bun test tests/unit/domain/identity/uuid.test.ts` |
| TC-DOCID-001 | `tests/unit/domain/identity/document-id.test.ts` | To Implement | None (real v7 input) | `bun test tests/unit/domain/identity/document-id.test.ts` |
| TC-DOCID-002 | `tests/unit/domain/identity/document-id.test.ts` | To Implement | None (typecheck `@ts-expect-error`) | `bun run typecheck` |
| TC-INJECT-001..004, TC-INJECT-006, TC-INJECT-007 | `tests/unit/domain/identity/frontmatter.test.ts` | To Implement | None (real front-matter fixtures; injectable fixed generator for byte assertions) | `bun test tests/unit/domain/identity/frontmatter.test.ts` |
| TC-INJECT-005 | `tests/golden/identity/inject-uuid.snapshot.test.ts` + `tests/golden/fixtures/identity/*.md` | To Implement (golden) | None (committed byte fixtures; injectable fixed generator) | `bun test tests/golden/identity/inject-uuid.snapshot.test.ts` |
| TC-DUP-001..006 | `tests/unit/domain/identity/duplicate-detector.test.ts` | To Implement (+ regression side-check vs existing error-map/exit-code tests) | None (real uuid fixtures) | `bun test tests/unit/domain/identity/duplicate-detector.test.ts` |
| TC-DUP-007 | `tests/integration/identity/duplicate-detector.test.ts` | To Implement | None (real fixture; write-counter spy only if a thin gate wrapper is authored — OQ-TP-1) | `bun test tests/integration/identity/duplicate-detector.test.ts` |
| TC-BIND-001 | `tests/unit/domain/binding/page-binding.test.ts` | To Implement | None (structural/typecheck) | `bun test tests/unit/domain/binding/page-binding.test.ts` + `bun run typecheck` |
| TC-INJECT-008, TC-IDSTABLE-001, TC-IDSTABLE-002 | `tests/integration/identity/frontmatter.test.ts` | To Implement | None (real file round-trip / fixture re-read) | `bun test tests/integration/identity/frontmatter.test.ts` |
| TC-INIT-001, TC-INIT-002 | `tests/integration/identity/init-uuid.test.ts` | To Implement | None (real temp tree; injectable discovery if needed) | `bun test tests/integration/identity/init-uuid.test.ts` |
| TC-BDD-001 | `tests/bdd/features/duplicate-uuid-fatal.feature` (fixture + scenario draft) | To Implement (fixture here; step defs in E5-S1/GH-29) | None (step defs drive the real engine in E5-S1) | `bun run test:bdd` (wired in E5-S1) |
| TC-GATE-001 | (gate) | — | — | `bun run check` |
| TC-BND-001 | (gate) | — | — | `bun run check:boundaries` (+ `rg` side-check) |

**Execution / ordering notes:**

- All Unit + Integration + Golden tests run in the fast CI loop
  (`bun test tests/unit/ tests/integration/ tests/golden/`).
- TC-DOCID-002 (brand compile guard) and TC-BIND-001 (structural completeness) are
  enforced by `bun run typecheck`, which is part of `bun run check` (AC-6).
- Implement the identity modules top-down — `uuid.ts` → `document-id.ts` →
  `frontmatter.ts` (depends on both) → `duplicate-detector.ts` (depends on
  `DocumentId`/`errors`) → `binding/page-binding.ts` — so each test file can land
  with its module.
- **`injectUuid` must accept an injectable UUID generator** so the byte-stability
  golden snapshots (TC-INJECT-005/007) are deterministic; the default generator
  remains the real `generateUuidV7` (OQ-TP-3).
- **Only allowed "fake" surface:** an injectable fixed UUID generator for
  deterministic byte snapshots, and (optionally) a write-counter spy in TC-DUP-007.
  No mocking of the YAML parse, the detector, or any domain logic — per the
  over-mocking guardrail. INV-SAFE-3 is asserted on a real duplicated fixture +
  the real detector, and the end-to-end zero-writes proof is the real-engine
  Gherkin in E5-S1.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Mitigation |
|----|------|--------|------------|
| TR-1 | `injectUuid` silently normalizes whitespace (line endings, trailing newline, blank lines) via the YAML round-trip, breaking byte-stability + idempotency | H | TC-INJECT-004/005/007 assert byte-exact comparison (Buffer equality, not normalized string compare); golden fixture pair is reviewable in the PR diff. |
| TR-2 | `injectUuid` overwrites an existing `marksync.uuid`, violating immutability (C-1) | H | TC-INJECT-003 asserts zero mutation + same uuid on a doc that already has one. |
| TR-3 | The duplicate detector mis-classifies missing-uuid docs as duplicates, blocking every fresh `init` | H | TC-DUP-003 asserts docs missing a uuid are NOT collisions. |
| TR-4 | The detector's diagnostic drops a colliding path (reports only the first), hiding an offender | M | TC-DUP-001/005 assert BOTH/all colliding paths are surfaced (OQ-TP-2 pins single-vs-aggregate reporting). |
| TR-5 | `generateUuidV7` produces a non-v7 (wrong version/variant) or non-sortable value | M | TC-UUID-001/002/003 assert the v7 regex, version/variant bits, and monotonic ordering. |
| TR-6 | Identity modules leak an upward import (domain → infra/app/cli), violating tier isolation | M | TC-BND-001 (`check:boundaries` + `rg` side-check) fails CI on any upward import. |
| TR-7 | A non-deterministic UUID makes the byte-stability golden snapshot flaky | M | TC-INJECT-005/007 inject a fixed v7 via an injectable generator (OQ-TP-3); the random generator is tested separately. |
| TR-8 | The "zero writes" INV-SAFE-3 proof is split across stories (detector here, end-to-end in E5-S1) and falls through the cracks | H | TC-DUP-001 (unit) + TC-DUP-007 (domain halt signal) + TC-BDD-001 (cross-story Gherkin) make the split explicit; OQ-TP-1 tracks ownership. |

### 8.2 Assumptions

- GH-14 (project scaffolding) and GH-15 (config system — front-matter/YAML
  parsing via the `yaml` package) are merged and provide: `Result<T,E>` (`ok`/
  `err`), the `MarkSyncError` union with the **already-present** `DuplicateUuid`
  arm + `assertNeverMarkSyncError`, and the strict TS+Bun toolchain. (Both
  dependencies are resolved per `chg-GH-18-pm-notes.yaml`; `src/domain/identity/`
  and `src/domain/binding/` are empty `.gitkeep` skeletons ready for this story.)
- The `DuplicateUuid` arm and its `DUPLICATE_UUID → EXIT_INVARIANT (50)` mapping
  already exist (landed in GH-16); GH-18 adds **no new error arm** and no new
  exit code. The detector simply produces the existing arm.
- The `uuid` package (v9+) provides `v7()` (RFC 9562); GH-18 is the first
  consuming story and will `bun add uuid`.
- `DocumentId` is `string & { __brand: "DocumentId" }` and `parseDocumentId`
  constructs it from a validated v7 (story technical approach).
- Identity is stored under the `marksync` namespace at `marksync.uuid`
  (story Q1, confirmed).
- INV-SAFE-3 is pinned to "Unit + Gherkin" in testing-strategy.md; the Gherkin
  wiring is E5-S1 (GH-29). GH-18 owns the Unit proof + the duplicated fixture +
  the `.feature` scenario draft.
- The correct invariant label is **INV-SAFE-3** (duplicate-UUID fatal); the GH-18
  issue body's "INV-SAFE-2" reference is a label typo, resolved in PM notes
  (INV-SAFE-2 = no silent re-create of REMOTE_MISSING). The story file is
  authoritative.

### 8.3 Open Questions

| ID | Question | Blocking? | Owner | Notes |
|----|----------|-----------|-------|-------|
| OQ-TP-1 | Where does the AC-1 "integration-level assertion proving ZERO writes" live — a thin domain-level pre-write gate authored here (TC-DUP-007), or solely the E5-S1 Gherkin driving the real sync engine (E3-S6)? | No (TC-DUP-007 documents the chosen boundary) | @coder (delivery) / @pm | The story says "in E3-S6 or here". This plan covers the detector unit proof (TC-DUP-001) + a domain halt-signal integration assertion (TC-DUP-007) + the cross-story Gherkin (TC-BDD-001). If no write path exists in GH-18, TC-DUP-007 asserts the halt-signal contract and the end-to-end zero-writes is E5-S1's. |
| OQ-TP-2 | Does `detectDuplicateUuids` report only the FIRST collision or aggregate ALL collisions (and within a collision, all paths)? | No | @coder (delivery) | Story interface says `paths: string[]` per collision. TC-DUP-005 pins the actual contract (single-first vs aggregated); the diagnostic must surface enough to locate every offender. |
| OQ-TP-3 | Does `injectUuid` accept an injectable UUID generator (for deterministic byte-stable golden snapshots), and does it preserve the file's line-ending style verbatim? | No | @coder (delivery) | Assumed yes (DI for testability; no normalization per AC-3). TC-INJECT-005/007 depend on it. Pin the generator signature + CRLF-preservation behaviour at delivery. |
| OQ-TP-4 | Does `parseDocumentId` return `Result<DocumentId, …>` (expected-failure channel) or throw (invariant guard) on invalid input? | No | @coder (delivery) | Two-layer error strategy: expected parse failures should use `Result`; `assertUuidV7` is the throw-on-invariant guard. TC-DOCID-001 pins the actual shape. |
| OQ-TP-5 | Are the test-plan-local `F-IDENTITY-*` / `DM-IDENTITY-*` labels adopted/reconciled by `chg-GH-18-spec.md` when it lands? | No | @spec-writer / @test-plan-writer | Mirrors the GH-17 OQ-TP-3 pattern; kept local to avoid TC churn. Reconcile to the spec's `F-#` / `AC-#` once the spec lands. |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09T00:05:00Z | test-plan-writer (GH-18) | Initial test plan — 28 scenarios traced to AC-1..AC-6: TC-UUID-001..004 (v7 generation/validation); TC-DOCID-001..002 (branded DocumentId VO + compile guard); TC-INJECT-001..008 (front-matter inject/read: idempotency, byte-stability golden, CRLF/blank-line preservation, round-trip); TC-DUP-001..007 (duplicate detector incl. INV-SAFE-3 fatal `DuplicateUuid` on a real duplicated fixture + domain-level pre-write halt signal); TC-BIND-001 (PageBinding lock-record schema); TC-IDSTABLE-001/002 (identity survives rename + re-clone — C-1); TC-INIT-001/002 (`marksync init` UUID assignment + idempotency); TC-BDD-001 (contributing INV-SAFE-3 Gherkin fixture + scenario draft — step defs in E5-S1/GH-29); TC-GATE-001 + TC-BND-001 (`bun run check` + dependency-cruiser). Provisional F-IDENTITY-1..6 / DM-IDENTITY-1..4 mapped to NFR-REL-8 / INV-SAFE-3 (spec pending). Derived from the authoritative story `MS2-E3-S1--document-identity.md`, `.ai/rules/testing-strategy.md` (Unit + Integration + Golden; INV-SAFE-3 = Unit + Gherkin; over-mocking guardrail → real inputs/outputs, no mocked domain logic), `.ai/rules/typescript.md` (branded types, `#`-imports, tier rules), ADR-0006 (C-1/C-4), and the existing `Result`/`MarkSyncError` primitives. Notes: the `DuplicateUuid` arm already exists (GH-16) — GH-18 adds no new error arm; E2E/Storage-renderer/BDD-wiring out of scope. |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| _(populated during delivery — phase 6 / quality_gates)_ | | | |
