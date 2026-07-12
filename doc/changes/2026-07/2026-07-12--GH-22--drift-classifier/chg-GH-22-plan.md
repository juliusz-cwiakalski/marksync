---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-22-drift-classifier
status: Proposed
created: 2026-07-12T00:00:00Z
last_updated: 2026-07-12T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, domain, drift, reliability]
links:
  change_spec: ./chg-GH-22-spec.md
  story: ../../../planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S5--drift-classifier.md
  feature_spec: ../../../spec/features/feature-safe-publish.md
  adr_0006: ../../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md
  ubiquitous_language: ../../../overview/ubiquitous-language.md
  architecture_overview: ../../../overview/architecture-overview.md
  typescript_rules: ../../../../.ai/rules/typescript.md
  testing_strategy: ../../../../.ai/rules/testing-strategy.md
  result_contract: ../../../../src/domain/result.ts
  errors_contract: ../../../../src/domain/errors.ts
  canonicalize_contract: ../../../../src/domain/render/canonicalize.ts
  page_binding_contract: ../../../../src/domain/binding/page-binding.ts
  reconcile_sibling: ../../../../src/domain/state/reconcile.ts
  unsupported_classifier_pattern: ../../../../src/domain/markdown/unsupported.ts
  boundary_test_precedent: ../../../../tests/unit/domain/target/boundary-negative.test.ts
  reconcile_test_precedent: ../../../../tests/unit/domain/state/reconcile.test.ts
  gh21_plan_precedent: ../2026-07-09--GH-21--confluence-adapter/chg-GH-21-plan.md
summary: >
  Deliver MS2-E3-S5 (epic MS2-E3 — Safe Publish Core, fifth story): the
  decision half of the safe-publish pipeline. A pure three-way drift
  classifier `classify({ local?, base?, remote }) → Result<SyncState,
  MarkSyncError>` over canonical semantic hashes (+ title + parent + attachment
  facets, R1) that sorts each bound document into one of six Ubiquitous-Language
  `SyncState` values and maps each to a safe `Action` — so the sync engine
  (E3-S6) can decide create/update/no-op/move while blocking unsafe overwrites
  by default (INV-SAFE-1) and never silently re-creating a remotely-deleted
  managed page (INV-SAFE-2 / NFR-REL-6). Four additive pure-domain modules
  under `src/domain/state/`: `sync-state.ts` (the 6-value enum + zod output
  schema + `RemoteState` union + `SharedBase` view), `hashes.ts` (`ContentHash`
  VO + `rawHash`/`canonicalHash`/`attachmentHash`, delegating verbatim to GH-20's
  `contentHash(canonicalize(hast))` and owning the deferred wire-format prefix),
  `classifier.ts` (`classify` — the core of the trust wedge), and `actions.ts`
  (`SyncState → Action`). `local` is optional (DEC-1 — expresses `LOCAL_MISSING`);
  `forbidden` is not a seventh state (Q1 — surfaces as `err(Forbidden)`); no new
  `MarkSyncError` arms (DEC-3 — `RemoteMissing`/`Forbidden`/`Conflict` reused
  verbatim). No infrastructure imports (NFR-MAINT-1); a dep-cruiser negative
  probe proves it. Blocks MS2-E3-S6 (sync engine).
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-22: [MS2-E3-S5] Drift classifier — three-way {local, base, remote} sync-state classification

## Context and Goals

This plan delivers the **judgement half** of MS-0002's safe-publish pipeline (epic
MS2-E3, fifth story). Where GH-21 delivered the *channel* the pipeline writes
through, this story delivers the *decision* that gates every write — the pure
pre-write three-way comparison ADR-0006 §5.4 mandates. Until it lands, the sync
engine (E3-S6) has no function to call: it cannot classify a bound document as
unchanged / locally-changed / remotely-changed / diverged / remotely-deleted /
locally-deleted, cannot decide create/update/no-op/move, and — most critically —
cannot block unsafe overwrites (INV-SAFE-1) or refuse to silently re-create a
remotely-deleted managed page (INV-SAFE-2 / NFR-REL-6). Concretely this plan
establishes four additive pure-domain modules under `src/domain/state/`:

- **`sync-state.ts`** — the six-value `SyncState` enum (matching the UL §Sync
  State exactly) + its zod output-boundary schema (UL binding rule 3) + the
  `RemoteState` discriminated union (`present` / `missing` / `forbidden`) + the
  `SharedBase` read view over `PageBinding` (F-3, F-4, DM-1/3/6).
- **`hashes.ts`** — the `ContentHash` value object + `rawHash(bytes)` +
  `canonicalHash(hast)` (delegating to GH-20's `contentHash(canonicalize(hast))`
  and adding the wire-format prefix GH-20's header defers to E3-S5) +
  `attachmentHash(attachmentHashes)` (F-2, DM-2). Re-implements no sha256.
- **`classifier.ts`** — `classify(input) → Result<SyncState, MarkSyncError>`,
  the pure three-way comparison over canonical hash + title + parent + attachment
  facets (F-1, F-6, DM-4).
- **`actions.ts`** — the `Action` type + `actionFor(state, ctx)` mapping
  (`NoOp`/`Update`/`Block(MarkSyncError)`/`Skip`) that E3-S6 honors (F-5, DM-5).

The plan is derived entirely from the authoritative spec `chg-GH-22-spec.md`
(6 capabilities F-1..F-6, 6 decisions DEC-1..DEC-6, story CEO-resolutions R1/Q1,
13 acceptance criteria AC-F1-1..AC-Q-1, 11 NFRs, 7 risks, OQ-1..OQ-4 all
resolved during clarify_scope), the test plan `chg-GH-22-test-plan.md`
(TC-STATE-001..006, TC-FORBIDDEN-001, TC-FALSEPOS-001..005, TC-REALCHG-001..005,
TC-METADATA-001/002, TC-EDGE-001, TC-HASH-001/002, TC-ACTION-001..006,
TC-BOUNDARY-001, TC-PURITY-001/002, TC-GATE-001), the story file
`MS2-E3-S5--drift-classifier.md`, ADR-0006 (C-1..C-6, INV-SAFE-1/2, §5.4), the UL
§Sync State + binding rule 3, and the **existing code seams read and verified**.
It invents no requirements. The change spec is the contract authority; this plan
operationalizes it.

### Verified reused contracts (DO NOT re-implement)

> The coder MUST reuse these verbatim. Re-implementing any of them is a defect.

- **`src/domain/render/canonicalize.ts` (GH-20)** — exports `canonicalize(hast:
  Root): CanonicalHast` (position-free, property-sorted, structural-whitespace-
  dropped) and `contentHash(canonical: CanonicalHast): string` (raw lowercase-hex
  sha256 over a stable-stringify). Its header states verbatim: _"The wire-format
  prefix is the consumer's concern (E3-S5) — this owns the deterministic digest
  only."_ **This story is that consumer (DEC-2).** `hashes.canonicalHash`
  delegates to `contentHash(canonicalize(hast))` and prepends the wire prefix.
- **`src/domain/binding/page-binding.ts` (GH-18/GH-19)** — `PageBinding` carries
  `pageId`, `parentPageId`, `pageVersion`, `uuid`, `sourceContentHash`,
  `renderedBodyHash` (canonical), `remoteBodyHash`, `attachmentHashes:
  Record<string,string>`, `sourceCommit`. This is the `SharedBase` source —
  **unchanged** (DM-6 is a read view, not an edit).
- **`src/domain/errors.ts`** — `MarkSyncError` already has every arm this story
  needs: `RemoteMissing { pageId }`, `Forbidden { pageId; operation }`,
  `Conflict { pageId; baseVersion; remoteVersion }`. **No new arms (DEC-3).**
  `assertNeverMarkSyncError` is therefore **untouched** — the typecheck staying
  green is itself the proof no arm was added (NFR-9).
- **`src/domain/result.ts`** — `Result<T,E>` + `Result.ok` / `Result.err`.
- **`src/domain/state/reconcile.ts` (GH-19)** — the sibling pure state module
  (imports only `#domain/*`; returns `Result<_, MarkSyncError>`). The new modules
  join it under `src/domain/state/` and follow the same purity/import discipline.
- **`src/domain/markdown/unsupported.ts` (GH-20)** — the "classifier" style
  reference (a pure function returning `MarkSyncError | null` over a value
  object; ≤ 3-line header; one ADR cite at the load-bearing point).
- **`tests/unit/domain/target/boundary-negative.test.ts` (GH-21)** — the purity-
  probe pattern (ephemeral `src/domain/__boundary_probe__.ts`, `bunx depcruise
  src`, assert `domain-may-not-import-infra` fires, cleanup in
  `beforeAll`/`afterEach`/`afterAll`). `.gitignore` already lists
  `src/domain/__boundary_probe__.ts`.

### Binding decisions (plan-level)

> Plan-level decisions (PD-*) operationalize the spec. The spec's DEC-1..DEC-6
> and the story's CEO-resolved R1/Q1 are committed and not re-litigated here;
> PD-* fill the implementation-level choices the spec leaves open.

- **PD-1 — `ContentHash` carries the R1 metadata facets (`title`, `parentPageId`)
  alongside the three hash facets.** The spec signature is
  `classify({ local?: ContentHash; … })` (F-1) and the test plan's TC-METADATA-001
  literally reads _"`local.title` differs"_ — i.e. the `local` object exposes
  `.title`. R1 requires title/parentPageId as comparison facets. Therefore
  `ContentHash` is the local-document snapshot the classifier compares: it carries
  `rawHash`, `canonicalHash`, `attachmentHash` (the three _hash_ facets asserted
  by TC-HASH-001) **plus** `title` and `parentPageId` (the R1 metadata facets).
  TC-HASH-001's "three facets" wording refers to the three hash fields and does
  not forbid the metadata fields. This keeps the spec signature `local?:
  ContentHash` literal and makes TC-METADATA-001/002 directly expressible.
- **PD-2 — Wire-format prefix = `sha256:` (a single named constant in
  `hashes.ts`), matching the committed-lock convention.** GH-20's `contentHash`
  returns a bare lowercase-hex sha256 and defers the prefix to E3-S5. The lock
  convention (visible in `tests/unit/domain/state/reconcile.test.ts` fixtures:
  `"sha256:src"`, `"sha256:rend"`) is `sha256:`-prefixed digests. So
  `hashes.canonicalHash(hast) = HASH_WIRE_PREFIX + contentHash(canonicalize(hast))`
  with `HASH_WIRE_PREFIX = "sha256:"` exported as a named constant. `rawHash` and
  `attachmentHash` use the same prefix. **All three comparison sides must share
  this format**: `base.renderedBodyHash` (PageBinding, already prefixed) and the
  engine-supplied `remote.bodyHash` (E3-S6 canonicalizes remote with the same
  function). The constant is the single knob.
- **PD-3 — Title-facet attribution: `title` is compared local-vs-remote and
  attributed to local; `parentPageId` is three-way (base carries it).**
  `PageBinding` (the `SharedBase` source) carries `parentPageId` but **no
  `title`** in MS-0002, so the title facet cannot be a true three-way comparison.
  Per R1 the desired outcome is unambiguous (_"a title/parent change with an
  identical body ⇒ `LOCAL_AHEAD`"_): a `local.title !== remote.title` mismatch
  contributes to **local-changed** only (the local is the source of the intended
  title; a remote-only rename cannot be distinguished from "local not yet
  published" without a base title, and MS-0002 does not track one). `parentPageId`
  is a proper three-way facet (`base.parentPageId` exists). This makes
  TC-METADATA-001/002 produce `LOCAL_AHEAD` deterministically. (Detecting
  remote-side title edits separately is a post-MS-0002 refinement.)
- **PD-4 — Boundary negative test uses a state-scoped ephemeral probe
  (`src/domain/state/__boundary_probe__.ts`), distinct from the GH-21 target/
  probe to avoid parallel-run collision.** dep-cruiser's `from: { path:
  "src/domain/" }` matches any file under `src/domain/`, so a state-scoped probe
  fires the same `domain-may-not-import-infra` rule. Using a distinct path from
  `tests/unit/domain/target/boundary-negative.test.ts` (which writes
  `src/domain/__boundary_probe__.ts`) avoids two tests racing the same file when
  `bun test` runs them in parallel. The probe is created at runtime, cruised with
  the **production** `.dependency-cruiser.cjs` via `bunx depcruise src`, and
  deleted in `beforeAll`/`afterEach`/`afterAll` (cleanup is load-bearing — a
  leaked probe permanently breaks `depcruise src`). The path is added to
  `.gitignore`. The probe is never committed.
- **PD-5 — `actionFor(state, ctx)` takes a context carrying `base` + `remote`
  so `Block` errors carry the required identity/version fields.** The `Action`'s
  `Block(Conflict)` needs `pageId` (from `base.pageId`), `baseVersion` (from
  `base.pageVersion`), `remoteVersion` (from `remote.version`); `Block(RemoteMissing)`
  needs `pageId` (from `base.pageId`); `NoOp`/`Update`/`Skip` carry the document
  identity (`uuid` from `base.uuid`). So the mapping is not a pure
  `SyncState → Action` function — it is `actionFor(state, ctx: { base: SharedBase;
  remote: RemoteState }): Action`. (The test plan's `mapAction(STATE)` references
  map to this `actionFor`; the coder exports `actionFor`.) `actionFor` is only
  ever called on `ok` states — the `forbidden` path returns `err(Forbidden)` from
  `classify` and never reaches `actionFor`.

### Open questions

> Surfaced, not decided. None blocks delivery; each has a safe default that the
> coder adopts and lifecycle phase 7 (`@doc-syncer`) reconciles.

- **`classify` signature reconciliation (spec DEC-4 — architecture-overview
  drift).** `architecture-overview.md` §"Internal interface contracts" (~line
  239) sketches the positional `classify(local, base, remote) → SyncState`. The
  realized signature is `classify(input) → Result<SyncState, MarkSyncError>`
  (DEC-4 — the positional form cannot express `LOCAL_MISSING` nor surface
  `forbidden` as an error). Reconciling that doc row is a **phase-7 doc-sync
  item, NOT a coder task** (out of scope here — the coder touches only `src/` and
  `tests/`).
- **System-spec / UL bindings (lifecycle phase 7).** Tagging the delivered
  modules in `feature-safe-publish.md` §4.2, binding `State Classifier` /
  `SyncState` / `ContentHash` / `Action` / `RemoteState` in
  `ubiquitous-language.md`, and `related_changes += GH-22` are `@doc-syncer`
  tasks — explicitly **not** done in this plan.

### Out of scope

- **Plan/apply orchestration** — E3-S6 (the sync engine sequences writes via the
  GH-21 port; it calls `classify` + `actionFor`). This story classifies; it does
  not write (spec NG-1).
- **The write-time 409 optimistic-concurrency backstop** — E3-S7. This classifier
  is the **pre-write** three-way comparison (spec NG-2).
- **Conflict resolution / reverse sync** — MS-0004 / MS-0005+ (NG-3).
- **The `--adopt` / `--rebind` override wiring** — E3-S6; the classifier blocks
  `REMOTE_MISSING` by default (NG-4).
- **New `MarkSyncError` kinds** — every outcome reuses `RemoteMissing`/
  `Forbidden`/`Conflict` verbatim (NG-5, DEC-3). `assertNeverMarkSyncError` is
  untouched.
- **Classification of base-absent (new) documents** — the engine handles `create`
  directly; the classifier is bound-documents-only (NG-6, DEC-5).
- **Remote body hashing / fetching** — the engine supplies `RemoteState.bodyHash`
  pre-computed; the classifier compares (NG-7).
- **Reconsidering the six-state enum or the canonicalization basis** — the UL
  §Sync State and GH-20 are authoritative and consumed, not reopened (NG-8).
- **BDD/Gherkin scenarios** — deferred to E5-S1 (INV-SAFE-1/INV-SAFE-2 scenarios
  driven by classifier output). This plan delivers Tier-1 unit fixtures only.
- **System-spec / architecture-doc / UL reconciliation** — lifecycle phase 7
  (`@doc-syncer`): tag the delivered components in `feature-safe-publish.md`
  §4.2; reconcile the `classify` signature in `architecture-overview.md`
  (DEC-4); bind terms in `ubiquitous-language.md` (`related_changes += GH-22`).
  **The coder does NOT touch `doc/spec/**` or `doc/overview/**` in this plan.**
- **Version bump** — repo bumps at release boundaries, not per change (GH-19/
  GH-20/GH-21 precedent; `version_impact: minor` is advisory).

### Constraints

- **Tier rules** (`.ai/rules/typescript.md`, dep-cruiser-enforced at severity
  `error`): the four new modules under `src/domain/state/` are **domain**; they
  import only `#domain/*` (`#domain/render/canonicalize`, `#domain/binding/
  page-binding`, `#domain/errors`, `#domain/result`, `#domain/identity/document-id`)
  + type-only `hast` (for `canonicalHash`'s HAST input) + value `zod` (for the
  output-boundary schema). **No** `#infra/*`, `#app/*`, `#cli/*`, `#shared/*`.
  dep-cruiser's active rules (`domain-may-not-import-infra`,
  `domain-may-not-import-app`) enforce this at severity `error`; the Phase 4
  negative test **proves** the rule fires on a `src/domain/state/` breach.
- **Strict TS** (`verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`): one import
  statement per module with inline `type` modifier; `zod` and `hast` imported as
  value/type as appropriate; `SyncState` is a plain union/`as const` (NOT `const
  enum` — `isolatedModules` forbids it); the `RemoteState` union's optional
  `title?`/`parentPageId?` use optional properties under `exactOptionalPropertyTypes`
  (conditional spread over mutation). The `classify` switch over `remote.kind`
  plus the boolean `localChanged`/`remoteChanged` matrix must be exhaustive.
- **ESM-only**; path aliases via `package.json` `"imports"` (`#domain/*`).
  Tests use `#`-aliases, not deep relative paths (typescript.md). `bunfig.toml`
  `root = "tests"` applies.
- **Error discipline** (typescript.md §"Error handling"): `classify` returns
  `Result<SyncState, MarkSyncError>` — never `throw` for the `forbidden` path
  (it is `err(Forbidden)`, an expected condition). `throw` is reserved for
  invariant violations only (none anticipated here). No `throw new Error("…")`
  in domain code.
- **Comment discipline** (AGENTS.md / typescript.md): ≤ 3-line file headers;
  self-documenting code; cite ADR-0006 (INV-SAFE-1/2, §5.4) once at the
  load-bearing point in `classifier.ts`; cite GH-20 once at the delegation point
  in `hashes.ts`; no bare `(DEC-x)`/`(NFR-x)` alphabet-soup tags, no spec
  restatements, no JSDoc restating signatures.
- **No new dependencies.** `zod` is already installed (`^4.4.3`, GH-21). No HTTP
  library, no crypto library (native `node:crypto` only, as `canonicalize.ts`
  already uses). `hashes.rawHash`/`attachmentHash` use `node:crypto.createHash`
  directly (matching the GH-20 precedent).
- **Quality gate:** `bun run check` = lint + format:check + typecheck + test +
  check:boundaries; must exit 0 (AC-Q-1). Conventional Commits (commitlint +
  husky, 72-char header); each phase = one logical commit; `check:boundaries`
  green at every commit.

### Risks

- **RSK-1 — A `REMOTE_AHEAD`/`DIVERGED` fixture is misclassified as
  `LOCAL_AHEAD`/`NO_CHANGE` → a remote edit is silently overwritten**
  (NFR-REL-1 / INV-SAFE-1; spec RSK-1). Mitigated by Phase 2: pure deterministic
  logic over value objects; the exhaustive state fixture suite
  (TC-STATE-001..006) + the canonical comparison basis (PD-2 delegation to GH-20's
  conservative canonicalizer) + the write-time 409 backstop (E3-S7, defense in
  depth).
- **RSK-2 — A `REMOTE_MISSING` fixture is misclassified as a safe update/re-create
  → a deleted page is silently re-created** (NFR-REL-6 / INV-SAFE-2; spec RSK-2).
  Mitigated by Phase 2: `remote.kind === "missing"` with a binding present ⇒
  `ok(REMOTE_MISSING)` ⇒ `Block(RemoteMissing)` by default (PD-5); TC-STATE-005
  asserts it; `--adopt`/`--rebind` override lives only in E3-S6.
- **RSK-3 — The false-positive guard is too aggressive — real content changes are
  normalized away** (NFR-REL-2; spec RSK-3). Mitigated by Phase 2: the delegation
  to GH-20's **conservative** canonicalizer (drops only structural whitespace,
  sorts properties, never alters text) + the real-change suite (TC-REALCHG-001..005)
  asserts genuine changes are detected.
- **RSK-4 — The false-positive guard is too weak — whitespace/attribute churn
  triggers false drift** (NFR-REL-3; spec RSK-4). Mitigated by Phase 2: comparison
  on `canonicalHash` (whitespace/attribute-order invariant by GH-20's
  construction) + the false-positive suite (TC-FALSEPOS-001..005) asserts
  semantic-only diffs → `NO_CHANGE`.
- **RSK-5 — A boundary violation sneaks in** (a state module imports infra)
  (NFR-MAINT-1; spec RSK-5). Mitigated by dep-cruiser + the Phase 4 negative
  test (PD-4) proving the rule fires on a `src/domain/state/` breach.
- **RSK-6 — Title/parent metadata drift is missed because only the body hash is
  compared** (spec RSK-6). Mitigated by Phase 2: R1 — the classifier compares
  `title` and `parentPageId` alongside the canonical body hash and attachment set
  (PD-1/PD-3); TC-METADATA-001/002 assert detection.
- **RSK-7 — The "both local + remote missing" edge is classified
  non-deterministically or as a re-create** (spec RSK-7). Mitigated by Phase 2:
  DEC-6 fixes the deterministic choice — `LOCAL_MISSING` (source-gone is the
  operator-actionable signal); TC-EDGE-001 asserts it.

### Success Metrics

- **boundary purity (NFR-1 / AC-F1-1)** — 0 files under `src/domain/state/`
  import anything from `src/infra/**`; the Phase 4 negative probe proves the rule
  fires.
- **zero silent overwrites (NFR-2 / AC-F3-3, AC-F3-4 / INV-SAFE-1)** —
  `REMOTE_AHEAD`/`DIVERGED` fixtures → the block state → `Block(Conflict)`;
  100% of block fixtures blocked.
- **REMOTE_MISSING invariant (NFR-3 / AC-F3-5 / INV-SAFE-2)** — fixture →
  `ok(REMOTE_MISSING)` → `Block(RemoteMissing)`; never auto-re-created (E3-S6
  honors the block).
- **false-positive guard (NFR-4 / AC-F2-1 / NFR-REL-3)** — the 5-fixture
  semantic-only-diff suite → `NO_CHANGE`.
- **effectiveness (NFR-5 / AC-F2-2 / NFR-REL-2)** — the 5-fixture real-change
  suite → correctly NOT `NO_CHANGE`.
- **semantic idempotency (NFR-6 / AC-F3-1 / NFR-PERF-4)** — `local == base ==
  remote` on canonical hash + title + parent + attachments → `NO_CHANGE`.
- **6-state + forbidden detection (NFR-7)** — one fixture per state + the
  forbidden path → correct classification (6/6 + forbidden).
- **canonical-comparison basis (NFR-8)** — drift decided on `canonicalHash`
  (+ title/parent/attachment), never `rawHash` alone; `rawHash` informational.
- **error-model stability (NFR-9)** — no new `MarkSyncError` arms;
  `assertNeverMarkSyncError` untouched; `bun run typecheck` stays green.
- **output-boundary validation (NFR-10 / UL rule 3)** — the zod schema rejects
  ad-hoc state strings (TC-BOUNDARY-001).
- **quality gate (NFR-11 / AC-Q-1)** — `bun run check` exits 0.

---

## Execution Strategy

Six phases, one logical commit each (Phase 0 is branch setup + baseline). The
ordering follows the dependency lattice: Phase 0 creates the branch and
re-baselines the gate; **Phase 1 lands the type/VO foundation** (`sync-state.ts`
+ `hashes.ts`) — everything downstream depends on it; **Phase 2 lands the
`classify()` core** + its exhaustive classifier fixtures (the largest phase —
the trust wedge); **Phase 3 lands the `Action` mapping** + its dedicated suite;
**Phase 4 lands the boundary negative test** (purity proof, last so it cruises
the complete module set); **Phase 5 runs the full gate** and hands the doc risks
to lifecycle phase 7. `bun run check:boundaries` runs in every phase. Suggested
commit scopes: `feat(state)`, `test(state)`, `chore(state)`. The coder executes
via `/run-plan GH-22 execute all remaining phases no review`.

---

### Phase 0: Branch + baseline gate

**Goal**: Create the feature branch and re-baseline the gate so every subsequent
phase starts green. Confirm the reused contracts (canonicalize/page-binding/
errors/result/reconcile) are present and unchanged — they are the delegation
targets and must not be re-implemented.

**Tasks**:

- [x] **0.1** From `main`, create and checkout `feat/GH-22/drift-classifier`
      (`git checkout -b feat/GH-22/drift-classifier main`). Confirm base is
      `main` at `d53a8ff` (GH-21 merged) or newer. ✓
- [x] **0.2** Run `bun run check` (lint + format:check + typecheck + test +
      check:boundaries); confirm it exits 0 on the untouched tree (the baseline).
      Record the baseline pass count for the Phase 5 delta. ✓ (773 tests passed)
- [x] **0.3** Re-verify the reused contracts the coder MUST delegate to (read,
       do not edit):
       - `src/domain/render/canonicalize.ts` — `canonicalize(hast)` +
         `contentHash(canonical)` exist; header defers the wire-prefix to E3-S5
         (⇒ PD-2). ✓
       - `src/domain/binding/page-binding.ts` — `PageBinding` carries
         `renderedBodyHash`, `attachmentHashes`, `parentPageId`, `pageId`,
         `pageVersion`, `uuid` (⇒ the `SharedBase` source; no `title` ⇒ PD-3). ✓
       - `src/domain/errors.ts` — `RemoteMissing`/`Forbidden`/`Conflict` arms +
         `assertNeverMarkSyncError` exist (⇒ DEC-3, untouched). ✓
       - `src/domain/result.ts` — `Result<T,E>` + `Result.ok`/`Result.err`. ✓
       - `src/domain/state/reconcile.ts` — the sibling purity/import pattern. ✓
       - `tests/unit/domain/target/boundary-negative.test.ts` — the probe pattern
         (⇒ Phase 4 / PD-4). ✓

**Acceptance Criteria**:

- Must: on branch `feat/GH-22/drift-classifier`; `bun run check` exits 0
  (baseline green).
- Must: the six reused contracts above are present and unmodified.

**Files and modules**:

- Code areas: none (setup only).
- System docs: none.

**Tests**:

- Manual: `git branch --show-current` → `feat/GH-22/drift-classifier`;
  `bun run check` exits 0.

**Completion signal**: _(setup phase — no code commit; baseline gate recorded)_

---

### Phase 1: Foundation types & value objects — `sync-state.ts` + `hashes.ts` (F-2, F-3, F-4, DM-1/2/3/6)

**Goal**: Deliver the type/VO foundation everything downstream depends on — the
six-value `SyncState` enum + its zod output schema + the `RemoteState`
discriminated union + the `SharedBase` read view (in `sync-state.ts`), and the
`ContentHash` value object + `rawHash`/`canonicalHash`/`attachmentHash` helpers
owning the deferred wire-format prefix (in `hashes.ts`). No classifier logic yet.
This phase satisfies F-2/F-3/F-4 and feeds Phase 2 + Phase 3.

> **Decision context (inline, do not re-derive):**
> - **DEC-2 / PD-2**: `canonicalHash` DELEGATES to GH-20's
>   `contentHash(canonicalize(hast))`; re-implements no sha256. The wire prefix
>   (`sha256:`, a named constant) lands here — GH-20's header defers it to E3-S5.
> - **F-3 / UL §Sync State / binding rule 3**: exactly six values — `NO_CHANGE`,
>   `LOCAL_AHEAD`, `REMOTE_AHEAD`, `DIVERGED`, `REMOTE_MISSING`, `LOCAL_MISSING`.
>   The story's "5-state" prose title is stale (pm-notes #1); six is canonical.
> - **F-4 / Q1**: `RemoteState` has three arms — `present` / `missing` /
>   `forbidden`. `forbidden` is an access condition, **not** a seventh state; it
>   surfaces as `err(Forbidden)` in Phase 2.
> - **PD-1**: `ContentHash` carries the three hash facets **plus** `title` and
>   `parentPageId` (the R1 metadata facets) so the spec signature
>   `local?: ContentHash` holds and TC-METADATA's `local.title` is expressible.

**Tasks**:

- [x] **1.1** Create `src/domain/state/sync-state.ts` (new):
       - `SyncState` — a plain union/`as const` (NOT `const enum` —
         `isolatedModules` forbids it) over the six UL values:
         `NO_CHANGE | LOCAL_AHEAD | REMOTE_AHEAD | DIVERGED | REMOTE_MISSING |
         LOCAL_MISSING`. Export an `as const` tuple/array `SYNC_STATES` listing
         them (drives the zod schema + the exhaustiveness anchor).
       - `SyncStateSchema` — a `zod` enum/literal schema over the six values
         (UL binding rule 3 — output-boundary validation; NFR-10). Export it;
         `classify` (Phase 2) parses its return through it. **TC-BOUNDARY-001**
         (Phase 2) asserts it rejects ad-hoc strings.
       - `RemoteState` — discriminated union:
         `{ kind: "present"; bodyHash: string; version: number; title?: string;
         parentPageId?: string }` | `{ kind: "missing" }` |
         `{ kind: "forbidden"; pageId: string }`. `missing` carries **no** `pageId`
         (the `RemoteMissing` error's `pageId` comes from `base` in Phase 3).
       - `SharedBase` — the read projection over `PageBinding` the classifier
         consumes: `{ uuid: DocumentId; pageId: string; parentPageId: string;
         pageVersion: number; renderedBodyHash: string; attachmentHashes:
         Record<string, string> }`. **`PageBinding` itself is unchanged** —
         `SharedBase` is a structural view (Pick-like). No `title` (PD-3).
       - Imports: `#domain/identity/document-id` (type), value `zod`. **No**
         `#infra/*`/`#app/*`/`#cli/*`. ≤ 3-line header citing ADR-0006 / UL once. ✓
- [x] **1.2** Create `src/domain/state/hashes.ts` (new):
       - `HASH_WIRE_PREFIX = "sha256:" as const` — the single wire-format constant
         (PD-2; matches the lock convention in `reconcile.test.ts` fixtures).
       - `rawHash(source: string | Uint8Array): string` —
         `HASH_WIRE_PREFIX + createHash("sha256").update(source).digest("hex")`.
         Informational only (would differ on whitespace; NOT the comparison basis
         — NFR-8). Uses `node:crypto` directly (GH-20 precedent).
       - `canonicalHash(hast: Root): string` — **DELEGATES**:
         `HASH_WIRE_PREFIX + contentHash(canonicalize(hast))`. Imports
         `canonicalize` + `contentHash` from `#domain/render/canonicalize`.
         Re-implements no sha256/canonicalization (DEC-2). This is the comparison
         basis (F-6).
       - `attachmentHash(attachmentHashes: Record<string, string>): string` — a
         deterministic digest over the **sorted** attachment set so attachment
         add/remove/order never perturb it: sort keys, serialize to a stable form
         (e.g. `key\0hash` lines joined), sha256, prefix. (New composition logic
         — NOT a GH-20 re-implementation; it digests the caller-supplied
         per-attachment hashes.)
       - `ContentHash` — the local-document snapshot VO (PD-1):
         `{ rawHash: string; canonicalHash: string; attachmentHash: string;
         title: string; parentPageId: string }`. The three hash facets
         (TC-HASH-001) + the two R1 metadata facets.
       - `buildContentHash(input: { source: string | Uint8Array; hast: Root;
         attachmentHashes: Record<string, string>; title: string; parentPageId:
         string }): ContentHash` — convenience builder calling the three helpers
         and bundling the metadata.
       - Imports: `#domain/render/canonicalize` (value), `node:crypto`
         (`createHash`), type-only `hast` (`Root`). **No** `#infra/*`/`#app/*`/
         `#cli/*`. ≤ 3-line header citing GH-20 + DEC-2 once at the delegation. ✓
- [x] **1.3** Create `tests/unit/domain/state/hashes.test.ts` (new) — **Unit**
       (no mocks; pure functions over real inputs):
       - **TC-HASH-001 (F-2 / DM-2):** construct a `ContentHash` via
         `buildContentHash` from a small HAST + source bytes + an attachment set +
         title + parent. Assert all three hash facets are non-empty `sha256:`
         -prefixed strings; assert `canonicalHash !== rawHash` (proves
         canonicalization ran — the bare-bytes digest differs from the canonical
         digest). ✓
       - **TC-HASH-002 (F-2 / NFR-8):** construct `ContentHash` from the same
         input N (≥3) times; assert every `canonicalHash` is identical
         (deterministic — no random IDs/timestamps perturb the digest). Also
         assert the same HAST with superficially different source bytes (extra
         whitespace) yields the same `canonicalHash` (the delegation to GH-20's
         conservative canonicalizer is the false-positive guard). ✓

**Acceptance Criteria**:

- Must: `SyncState` has exactly the six UL values; `SyncStateSchema` accepts each
  and rejects at least one ad-hoc string (F-3; ready for TC-BOUNDARY-001).
- Must: `canonicalHash` delegates to `contentHash(canonicalize(hast))` —
  `grep "createHash" src/domain/state/hashes.ts` shows it only in `rawHash`/
  `attachmentHash`, NOT in `canonicalHash` (DEC-2 / PD-2).
- Must: all four new modules compile under strict TS; **no** `#infra/*`/
  `#app/*`/`#cli/*` import in `src/domain/state/` (AC-F1-1 positive side;
  `check:boundaries` green).
- Must: `bun run check` exits 0 (TC-HASH-001/002 green; no regression).

**Files and modules**:

- Code areas: `src/domain/state/sync-state.ts` (new),
  `src/domain/state/hashes.ts` (new).
- System docs: none (binding `SyncState`/`ContentHash`/`RemoteState` in the UL is
  lifecycle phase 7).

**Tests**:

- `bun test tests/unit/domain/state/hashes.test.ts`
- `bun run typecheck` + `bun run check:boundaries`.

**Completion signal**: `feat(state): SyncState enum + RemoteState union + ContentHash VO + hash helpers (GH-22)`

---

### Phase 2: The `classify()` core — `classifier.ts` + classifier fixtures (F-1, F-6, DM-4; AC-F3-1..F3-6, AC-F4-1, AC-F2-1, AC-F2-2, AC-F5-1, AC-F6-1, NFR-2..NFR-8)

**Goal**: Deliver F-1 + F-6 — the pure three-way `classify({ local?, base?,
remote }) → Result<SyncState, MarkSyncError>` function: the core of the trust
wedge. It compares `canonicalHash` + title + parent + attachment facets (R1),
realizes the full classification truth table (spec §24), returns
`err(Forbidden)` for the `forbidden` path (Q1), and validates its output through
`SyncStateSchema` (UL rule 3). This is the largest phase — every state, the
false-positive guard, the real-change guard, the metadata facets, the both-missing
edge, and the forbidden path are proven by fixtures.

> **Decision context (inline, do not re-derive):**
> - **DEC-1**: `local` is **OPTIONAL** in the input. Absent `local` with a
>   binding present ⇒ `LOCAL_MISSING` (TC-STATE-006). The story's prose
>   "local required" is resolved to optional.
> - **DEC-5**: the classifier is **bound-documents-only** — invoked only when a
>   binding exists (`base` present). Base-absent (new) documents are NOT one of
>   the six states; the engine handles `create` directly. `base` is optional in
>   the type as a lenient accommodation, but the contract precondition is "called
>   only for bound documents".
> - **DEC-6**: both `local` absent AND `remote.kind === "missing"` with a binding
>   ⇒ `LOCAL_MISSING` deterministically (source-gone is the operator-actionable
>   signal; re-creating would risk INV-SAFE-2). TC-EDGE-001.
> - **Q1**: `remote.kind === "forbidden"` ⇒ `err({ kind: "Forbidden"; pageId:
>   remote.pageId; operation: "read" })`. NOT a `SyncState`. TC-FORBIDDEN-001.
> - **R1 / PD-1 / PD-3**: comparison facets are canonical body hash (three-way),
>   `parentPageId` (three-way via `base.parentPageId`), attachment set, and
>   `title` (local-vs-remote, attributed to local). A title/parent change with an
>   identical body ⇒ `LOCAL_AHEAD`. TC-METADATA-001/002.
> - **DEC-3**: the `forbidden` error reuses the existing `Forbidden` arm verbatim.
>   **No new `MarkSyncError` kinds.** Do NOT edit `src/domain/errors.ts`.
>
> **Authoritative classification truth table (spec §24 — precondition: `base`
> present):**
>
> | `local` | `remote.kind` | local changed vs base | remote changed vs base | → `SyncState` |
> |---------|---------------|----------------------|------------------------|---------------|
> | present | present | no | no | `NO_CHANGE` |
> | present | present | yes | no | `LOCAL_AHEAD` |
> | present | present | no | yes | `REMOTE_AHEAD` |
> | present | present | yes | yes | `DIVERGED` |
> | present | missing | — | — | `REMOTE_MISSING` |
> | absent | present | — | — | `LOCAL_MISSING` |
> | absent | missing | — | — | `LOCAL_MISSING` (DEC-6) |
> | _any_ | forbidden | — | — | `err(Forbidden)` (Q1) |
>
> _"changed vs base" includes canonical body hash, `parentPageId`, attachment set,
> and (for local) `title` vs remote (PD-3)._

**Tasks**:

- [x] **2.1** Create `src/domain/state/classifier.ts` (new):
       - `ClassifyInput` — `{ local?: ContentHash; base?: SharedBase; remote:
         RemoteState }` (DEC-1 `local?` optional; DEC-5 `base?` optional-lenient).
       - `classify(input: ClassifyInput): Result<SyncState, MarkSyncError>`:
         1. If `input.remote.kind === "forbidden"` → return
            `Result.err({ kind: "Forbidden"; pageId: input.remote.pageId;
            operation: "read" })` (Q1 — short-circuit before any state). ✓
         2. If `input.local === undefined` → return `Result.ok(SyncState.
            LOCAL_MISSING)` (DEC-1; covers TC-STATE-006 **and** TC-EDGE-001 —
            whether `remote.kind` is `present` or `missing`, absent local ⇒
            `LOCAL_MISSING` per DEC-6). ✓
         3. If `input.remote.kind === "missing"` → return
            `Result.ok(SyncState.REMOTE_MISSING)` (TC-STATE-005; `local` is
            present here — step 2 already handled absent-local). ✓
         4. Now `local` present, `remote.kind === "present"`, `base` present
            (DEC-5 precondition). Compute the change booleans against `base`:
            - `localChanged = local.canonicalHash !== base.renderedBodyHash
              || local.parentPageId !== base.parentPageId
              || local.attachmentHash !== attachmentHash(base.attachmentHashes)
              || local.title !== remote.title` (PD-3 — title vs remote). ✓
            - `remoteChanged = remote.bodyHash !== base.renderedBodyHash
              || remote.parentPageId !== base.parentPageId
              || (remote.title !== undefined && remote.title !== local.title
                  && /* title not already counted as localChanged via remote.title
                        equality — see PD-3 */) ...`
              — attribute title mismatch to **local** only (PD-3); `remoteChanged`
              covers body/parent only. ✓
            - Matrix → `NO_CHANGE` / `LOCAL_AHEAD` / `REMOTE_AHEAD` / `DIVERGED`
              (truth table rows 1-4). ✓
         5. Validate the chosen value through `SyncStateSchema.parse(...)` (UL
            rule 3 — no ad-hoc state string escapes; NFR-10). On the impossible
            parse failure, throw (invariant violation — not a Result error). ✓
       - Imports: `#domain/state/sync-state` (`SyncState`, `SyncStateSchema`,
         type `RemoteState`/`SharedBase`), `#domain/state/hashes` (type
         `ContentHash`, `attachmentHash`), `#domain/errors` (type `MarkSyncError`),
         `#domain/result` (`Result`). **No** `#infra/*`/`#app/*`/`#cli/*`.
         ≤ 3-line header citing ADR-0006 §5.4 + INV-SAFE-1/2 once. ✓
       - **Exhaustiveness**: the `remote.kind` switch + the
         `localChanged`/`remoteChanged` boolean matrix must cover every path; use
         a terminal `assertNever`-style guard (or `_exhaustive: never` on the
         `remote.kind` default) so adding a future `RemoteState` kind is a compile
         error. ✓
- [x] **2.2** Create `tests/unit/domain/state/classifier.test.ts` (new) —
       **Unit**, pure fixtures, no mocks. Build small `ContentHash`/`SharedBase`/
       `RemoteState` helpers (real `buildContentHash` over tiny HASTs; string
       hashes for `base`/`remote` where the comparison is the point, not the
       digest). Cover:
       - **TC-STATE-001 (AC-F3-1 / NFR-6 / NFR-PERF-4):** all three agree on
         canonical hash + title + parent + attachments → `ok(NO_CHANGE)`. ✓
       - **TC-STATE-002 (AC-F3-2 / NFR-7):** local changed, remote == base →
         `ok(LOCAL_AHEAD)`. ✓
       - **TC-STATE-003 (AC-F3-3 / NFR-2 / INV-SAFE-1):** local == base, remote
         changed → `ok(REMOTE_AHEAD)`. ✓
       - **TC-STATE-004 (AC-F3-4 / NFR-2 / INV-SAFE-1):** both changed vs base →
         `ok(DIVERGED)`. ✓
       - **TC-STATE-005 (AC-F3-5 / NFR-3 / INV-SAFE-2):** binding present,
         `remote.kind === "missing"` → `ok(REMOTE_MISSING)`. ✓
       - **TC-STATE-006 (AC-F3-6 / DEC-1):** binding present, `local` absent →
         `ok(LOCAL_MISSING)`. ✓
       - **TC-FORBIDDEN-001 (AC-F4-1 / Q1 / NFR-7):** `remote.kind ===
         "forbidden"` → `err({ kind: "Forbidden"; pageId; operation: "read" })`;
         assert it is NOT an `ok(SyncState)`. ✓
       - **TC-FALSEPOS-001..005 (AC-F2-1 / NFR-4 / NFR-8):** five superficial diffs
         that the verified GH-20 canonicalizer provably normalizes to identical
         `canonicalHash` — (001) structural-whitespace text-node count between
         block siblings (ws-only + `\n`, dropped by `isStructuralWhitespace`);
         (002) multiple newline-containing ws nodes between blocks collapsed;
         (003) HTML attribute order (`sortProperties`); (004) raw-HTML node vs
         text node for the same literal value (`raw`→`text` branch); (005)
         empty-line count change (structural ws dropped) → each `ok(NO_CHANGE)`. ✓
         These prove the canonical-comparison basis via the GH-20 delegation —
         the classifier must NOT consult `rawHash`. Do NOT assert `NO_CHANGE` for
         internal-whitespace collapse or code-block trimming (GH-20 does not
         normalize those — they are real changes).
       - **TC-REALCHG-001..005 (AC-F2-2 / NFR-5):** five genuine content edits
         (text change, heading add/remove, link URL change, table cell change,
         code-block language change) → each NOT `NO_CHANGE` (i.e. `LOCAL_AHEAD`). ✓
       - **TC-METADATA-001 (AC-F5-1 / R1 / PD-3):** body identical but
         `local.title` differs → `ok(LOCAL_AHEAD)`. ✓
       - **TC-METADATA-002 (AC-F5-1 / R1):** body + title identical but
         `local.parentPageId !== base.parentPageId` → `ok(LOCAL_AHEAD)`. ✓
       - **TC-EDGE-001 (AC-F6-1 / DEC-6):** `local` absent AND
         `remote.kind === "missing"` with a binding → `ok(LOCAL_MISSING)`
         deterministically (not `REMOTE_MISSING`). ✓
       - **TC-BOUNDARY-001 (NFR-10 / UL rule 3):** `SyncStateSchema.parse(...)`
         throws on an ad-hoc string (e.g. `"SOMETHING_ELSE"`); accepts each of the
         six values. (Target-layer per test plan: `classifier.test.ts`.) ✓
       - _Note:_ the `mapAction(...)` assertions in the TC-STATE steps land in
         Phase 3 (`actions.test.ts`); this phase asserts the `classify()` return
         value exhaustively. ✓

**Acceptance Criteria**:

- Must: every truth-table row produces the exact `SyncState` (TC-STATE-001..006);
  the `forbidden` path returns `err(Forbidden)` not a state (TC-FORBIDDEN-001)
  (NFR-7).
- Must: `REMOTE_AHEAD`/`DIVERGED` fixtures → the block states (100% of block
  fixtures blocked — INV-SAFE-1 / NFR-2); `REMOTE_MISSING` → `ok(REMOTE_MISSING)`
  (INV-SAFE-2 / NFR-3).
- Must: the 5-fixture false-positive suite → `NO_CHANGE` (NFR-4); the 5-fixture
  real-change suite → NOT `NO_CHANGE` (NFR-5).
- Must: title/parent drift with identical body → `LOCAL_AHEAD` (R1 / NFR-8);
  both-missing edge → `LOCAL_MISSING` (DEC-6).
- Must: `SyncStateSchema` rejects ad-hoc strings (NFR-10).
- Must: **no new `MarkSyncError` kinds** — `src/domain/errors.ts` is untouched
  (`git diff src/domain/errors.ts` empty); the `Forbidden` arm is reused verbatim
  (DEC-3 / NFR-9).
- Must: `classifier.ts` imports no `#infra/*`/`#app/*`/`#cli/*`; `bun run check`
  exits 0.

**Files and modules**:

- Code areas: `src/domain/state/classifier.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/state/classifier.test.ts`
- `bun run typecheck` + `bun run check:boundaries`.

**Completion signal**: `feat(state): classify() three-way drift classifier — 6 states + forbidden + false-positive guard (GH-22)`

---

### Phase 3: The `Action` mapping — `actions.ts` + action suite (F-5, DM-5; AC-F3-2..F3-6, NFR-2/NFR-3)

**Goal**: Deliver F-5 — the `Action` type and the `SyncState → Action` mapping
the sync engine (E3-S6) acts on: `NoOp` / `Update` / `Block(MarkSyncError)` /
`Skip`. `REMOTE_AHEAD`/`DIVERGED` → `Block(Conflict)`; `REMOTE_MISSING` →
`Block(RemoteMissing)`; `LOCAL_MISSING` → `Skip`; `LOCAL_AHEAD` → `Update`;
`NO_CHANGE` → `NoOp`. `Block` carries the typed `MarkSyncError` with the required
identity/version fields (reused verbatim — DEC-3) and every `Action` carries the
document identity (`uuid`).

> **Decision context (inline, do not re-derive):**
> - **DEC-3**: all `Block` errors reuse `Conflict`/`RemoteMissing` verbatim —
>   `Conflict { pageId; baseVersion; remoteVersion }` (versions from
>   `base.pageVersion` + `remote.version`) for `REMOTE_AHEAD`/`DIVERGED`;
>   `RemoteMissing { pageId }` (from `base.pageId`) for `REMOTE_MISSING`. **No
>   new arms; do NOT edit `errors.ts`.**
> - **PD-5**: `actionFor(state, ctx)` takes `{ base: SharedBase; remote:
  RemoteState }` so `Block` can populate `pageId`/`baseVersion`/`remoteVersion`
  and the identity fields. It is only ever called on `ok` states — `forbidden`
  returns `err` from `classify` and never reaches here.
> - **NG-4**: `REMOTE_MISSING` blocks by default. The `--adopt`/`--rebind`
>   override is wired **only in E3-S6** — never here.

**Tasks**:

- [x] **3.1** Create `src/domain/state/actions.ts` (new):
       - `Action` — discriminated union:
         `{ kind: "NoOp"; uuid: DocumentId }` |
         `{ kind: "Update"; uuid: DocumentId }` |
         `{ kind: "Block"; uuid: DocumentId; error: MarkSyncError }` |
         `{ kind: "Skip"; uuid: DocumentId; reason: "LOCAL_MISSING" }`.
         (Every arm carries `uuid` from `base.uuid` — the document identity;
         `Block` carries the typed `MarkSyncError`; `Skip` carries the reason.) ✓
       - `ActionContext` — `{ base: SharedBase; remote: RemoteState }` (PD-5). ✓
       - `actionFor(state: SyncState, ctx: ActionContext): Action`:
         - `NO_CHANGE` → `{ kind: "NoOp"; uuid: ctx.base.uuid }`. ✓
         - `LOCAL_AHEAD` → `{ kind: "Update"; uuid: ctx.base.uuid }`. ✓
         - `REMOTE_AHEAD` / `DIVERGED` → `{ kind: "Block"; uuid: ctx.base.uuid;
           error: { kind: "Conflict"; pageId: ctx.base.pageId; baseVersion:
           ctx.base.pageVersion; remoteVersion: ctx.remote.kind === "present" ?
           ctx.remote.version : ctx.base.pageVersion } }`. (For these states
           `remote` is `present`; the guard is defensive.) ✓
         - `REMOTE_MISSING` → `{ kind: "Block"; uuid: ctx.base.uuid; error:
           { kind: "RemoteMissing"; pageId: ctx.base.pageId } }`. ✓
         - `LOCAL_MISSING` → `{ kind: "Skip"; uuid: ctx.base.uuid; reason:
           "LOCAL_MISSING" }`. ✓
         - Exhaustive switch with a terminal `never` guard (a future `SyncState`
           value is a compile error — UL rule 3 keeps the enum closed). ✓
       - Imports: `#domain/state/sync-state` (`SyncState`, type `SharedBase`/
         `RemoteState`), `#domain/identity/document-id` (type `DocumentId`),
         `#domain/errors` (type `MarkSyncError`). **No** `#infra/*`/`#app/*`/
         `#cli/*`. ≤ 3-line header citing ADR-0006 / INV-SAFE-1/2 once. ✓
- [x] **3.2** Create `tests/unit/domain/state/actions.test.ts` (new) — **Unit**,
       no mocks. Build a `SharedBase` + `RemoteState.present` fixture carrying
       known `pageId`/`pageVersion`/`version`. Cover:
       - **TC-ACTION-001 (F-5 / DM-5):** `actionFor(NO_CHANGE, ctx)` →
         `{ kind: "NoOp"; uuid }`. ✓
       - **TC-ACTION-002 (F-5):** `actionFor(LOCAL_AHEAD, ctx)` →
         `{ kind: "Update"; uuid }`. ✓
       - **TC-ACTION-003 (F-5 / NFR-2 / INV-SAFE-1):** `actionFor(REMOTE_AHEAD,
         ctx)` → `{ kind: "Block"; uuid; error: { kind: "Conflict"; pageId;
         baseVersion; remoteVersion } }` with the exact `pageId` from
         `base.pageId`, `baseVersion` from `base.pageVersion`, `remoteVersion`
         from `remote.version`. ✓
       - **TC-ACTION-004 (F-5 / NFR-2):** `actionFor(DIVERGED, ctx)` →
         `Block(Conflict)` with the same field provenance. ✓
       - **TC-ACTION-005 (F-5 / NFR-3 / INV-SAFE-2):** `actionFor(REMOTE_MISSING,
         ctx)` → `{ kind: "Block"; uuid; error: { kind: "RemoteMissing"; pageId }
         }` with `pageId` from `base.pageId`. Assert the action carries NO write
         operation (the engine honors the block; never re-creates). ✓
       - **TC-ACTION-006 (F-5):** `actionFor(LOCAL_MISSING, ctx)` →
         `{ kind: "Skip"; uuid; reason: "LOCAL_MISSING" }`. ✓
       - **DEC-3 spot-check:** assert every `Block.error.kind` is one of
         `Conflict`/`RemoteMissing` (no new kind is produced). ✓

**Acceptance Criteria**:

- Must: each `SyncState` maps to the correct `Action` (TC-ACTION-001..006);
  `Block` arms carry the typed `MarkSyncError` with correct `pageId`/
  `baseVersion`/`remoteVersion` provenance (F-5).
- Must: `REMOTE_AHEAD`/`DIVERGED` → `Block(Conflict)`; `REMOTE_MISSING` →
  `Block(RemoteMissing)`; `LOCAL_MISSING` → `Skip` (INV-SAFE-1/2, NFR-2/NFR-3).
- Must: **no new `MarkSyncError` kinds** — only `Conflict`/`RemoteMissing`
  appear as `Block.error.kind` (DEC-3 / NFR-9).
- Must: `actions.ts` imports no `#infra/*`/`#app/*`/`#cli/*`; the `actionFor`
  switch is exhaustive (terminal `never`); `bun run check` exits 0.

**Files and modules**:

- Code areas: `src/domain/state/actions.ts` (new).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/state/actions.test.ts`
- `bun run typecheck` + `bun run check:boundaries`.

**Completion signal**: `feat(state): SyncState → Action mapping (NoOp/Update/Block/Skip) (GH-22)`

---

### Phase 4: Boundary negative test — purity proof for `src/domain/state/` (F-1, AC-F1-1, NFR-1; TC-PURITY-001, TC-PURITY-002)

**Goal**: Deliver AC-F1-1 — prove the production dep-cruiser rule
`domain-may-not-import-infra` fires on a real `src/domain/state/` → `src/infra/**`
breach, and that the production source is clean. This is the NFR-MAINT-1
enforcement proof. It lands last so it cruises the complete four-module set.

> **Decision context (inline, do not re-derive):**
> - **PD-4**: the probe lives at `src/domain/state/__boundary_probe__.ts`
>   (state-scoped, distinct from the GH-21 `src/domain/__boundary_probe__.ts` to
>   avoid parallel-run collision). dep-cruiser's `from: { path: "src/domain/" }`
>   matches it. Created at runtime, cruised with the **production**
>   `.dependency-cruiser.cjs` via `bunx depcruise src`, deleted in
>   `beforeAll`/`afterEach`/`afterAll`. Added to `.gitignore`. Never committed.
> - **Pattern source**: `tests/unit/domain/target/boundary-negative.test.ts`
>   (read it; mirror its structure — `depcruiseSrc()` helper returning parsed
>   violations, belt-and-suspenders cleanup).

**Tasks**:

- [x] **4.1** Add `src/domain/state/__boundary_probe__.ts` to `.gitignore`
       (alongside the existing `src/domain/__boundary_probe__.ts` entry). ✓
- [x] **4.2** Create `tests/unit/domain/state/boundary-negative.test.ts` (new) —
       **Unit/contract**, mirroring `tests/unit/domain/target/boundary-negative.test.ts`:
       - `PROBE_PATH = "src/domain/state/__boundary_probe__.ts"`;
         `PROBE_BODY` imports a real `#infra/*` symbol (e.g.
         `import { ConfluenceClient } from "#infra/confluence/client";` — GH-21
         delivered it) and re-exports it, so dep-cruiser resolves a real
         `src/domain/state/` → `src/infra/` edge. ✓
       - `depcruiseSrc()` — `Bun.spawnSync({ cmd: ["bunx", "depcruise", "src",
         "--output-type", "json"], … })` → parse `summary.violations`. ✓
       - `removeProbe()` — `rmSync(PROBE_PATH, { force: true })` if it exists. ✓
       - `beforeAll(removeProbe)`, `afterEach(removeProbe)`,
         `afterAll(removeProbe)` — load-bearing cleanup (a leaked probe
         permanently breaks `depcruise src`). ✓
       - **TC-PURITY-001 (AC-F1-1 negative):** write the probe; run
         `depcruiseSrc()`; assert a violation with `rule.name ===
         "domain-may-not-import-infra"`, `from === PROBE_PATH`, `to` matches
         `^src/infra/`. ✓
       - **TC-PURITY-002 (AC-F1-1 positive):** with the probe removed, run
         `depcruiseSrc()`; assert **0** `domain-may-not-import-infra` violations
         under `src/domain/state/` (the four production modules are clean). ✓

**Acceptance Criteria**:

- Must: the negative probe fires `domain-may-not-import-infra` with the correct
  `from` (`src/domain/state/__boundary_probe__.ts`) and `to` (`src/infra/**`)
  (AC-F1-1 negative; RSK-5).
- Must: with the probe gone, dep-cruiser reports **0** violations under
  `src/domain/state/` — the four production modules are pure (AC-F1-1 positive;
  NFR-1).
- Must: the probe is gone after the suite (no leaked file); `bun run check` exits
  0 (including `check:boundaries`).

**Files and modules**:

- Code areas: none (test-only phase; the four production modules are complete
  after Phase 3).
- System docs: none.

**Tests**:

- `bun test tests/unit/domain/state/boundary-negative.test.ts`
- `bun run check:boundaries` (green with the probe absent).

**Completion signal**: `test(state): boundary negative test — dep-cruiser proves src/domain/state purity (GH-22)`

---

### Phase 5: Final quality gate + boundary confirmation + doc handoff (AC-Q-1, NFR-11; TC-GATE-001)

**Goal**: Run the full `bun run check` gate green, confirm the dep-cruiser
boundary direction (the four state modules import only `#domain/*` + `zod` +
`hast` types + `node:crypto`), and hand the doc-reconciliation risks to lifecycle
phase 7 (`@doc-syncer`). No new behavior. This is the AC-Q-1 discharge + the
spec-reconciliation handoff (the final release phase per the plan template).

**Tasks**:

- [x] **5.1** Run `bun run check` (lint + format:check + typecheck + test +
      check:boundaries); fix any issue (biome format/lint nits, unused imports,
      `exactOptionalPropertyTypes` adjustments). Confirm all ACs green
      (TC-GATE-001). Report the pass count and the delta vs the Phase 0
      baseline. ✓ (808 tests passed, +35 from baseline of 773. All checks green.)
- [x] **5.2** Confirm the boundary direction explicitly (AC-F1-1 / NFR-1):
      `bun run check:boundaries` passes with **0** violations; assert
      `grep -r "#infra/\|#app/\|#cli/" src/domain/state/` returns nothing — the
      four modules import only `#domain/*` (+ `zod`, `hast` types, `node:crypto`).
      The state modules are pure. ✓ (Confirmed via grep: NO INFRA IMPORTS FOUND)
- [x] **5.3** Confirm **no error-model change** (DEC-3 / NFR-9): `git diff
      src/domain/errors.ts` is empty; `assertNeverMarkSyncError` is untouched;
      `bun run typecheck` green is the proof. ✓ (Verified: no diff on errors.ts)
- [x] **5.4** Hand off the doc risks to lifecycle phase 7 (`@doc-syncer`) —
      **no code/doc change here** (out of the coder's delivery scope):
      - Tag the delivered components in `feature-safe-publish.md` §4.2 "Drift
         classifier" (currently a stub) → reference `classify` / `ContentHash` /
         `SyncState` / `Action` / `RemoteState`; mark *(delivered — GH-22)*.
      - Reconcile `architecture-overview.md` §"Internal interface contracts"
        (~line 239) from the positional `classify(local, base, remote) →
        SyncState` sketch to the realized `classify(input) → Result<SyncState,
        MarkSyncError>` (DEC-4).
      - Bind `State Classifier` / `Sync State` / `Content Hash` / `Action` /
        `RemoteState` / `SharedBase` in `ubiquitous-language.md`;
        `related_changes += GH-22`.
      - `doc/spec/features/feature-safe-publish.md` `links.related_changes` +=
        GH-22. ✓ (Out of coder scope — handoff to phase 7)

**Acceptance Criteria**:

- Must: `bun run check` exits 0 (AC-Q-1 / NFR-11); report the pass count.
- Must: dep-cruiser green; the four state modules import no `#infra/*`/`#app/*`/
  `#cli/*` (AC-F1-1 / NFR-1).
- Must: `src/domain/errors.ts` unchanged (DEC-3 / NFR-9).

**Files and modules**:

- Code areas: none (gate-only phase; opportunistic boy-scout header/format trims
  allowed if biome flags them).
- System docs: none in this phase (doc reconciliation is lifecycle phase 7).

**Tests**:

- `bun run check` (full gate).

**Completion signal**: `chore(state): final quality gate + boundary confirmation + doc handoff for E3-S5 drift classifier (GH-22)`

---

### Phase 6: Code Review Remediation (Iteration 1)

> **Source:** `code-review/review-iter-1.yaml` (local review, status: FAIL).
> **Why:** the classifier/hash/action implementation and the reused-contract
> delegation are correct (canonicalize.ts/errors.ts/result.ts/page-binding.ts
> untouched; INV-SAFE-1/2, DEC-2/3, six-state enum, #domain purity all hold),
> but AC-F2-1/NFR-4/NFR-8 (the false-positive guard) is not genuinely satisfied
> and a misleading error arm was introduced. One critical, one high, plus style
> nits. The PM delegates this phase to `@coder`; re-review follows.

**Goal**: Close the iteration-1 review findings so the change meets its DoD —
make the false-positive guard the thing under test (not the comparator), remove
the misleading `Forbidden`-reuse footgun, and apply the comment/import/log
cleanups.

**Tasks**:

- [x] **6.1 (F-1 — critical)** Rewrite the false-positive and real-change suites
        so they exercise GH-20 normalization end-to-end, not hardcoded hashes.
        In `tests/unit/domain/state/classifier.test.ts`:
        - Added HAST-builder helpers that emit two **structurally different** trees
          per case. For each of TC-FALSEPOS-001..005 built a `baseHast` and a
          `variantHast` that differ ONLY in a way GH-20 normalizes:
          (001) extra newline-whitespace text node between block siblings;
          (002) multiple newline-ws nodes vs one; (003) element with properties
          in different key order; (004) a `raw` node vs a `text` node with the
          same value; (005) different empty-line/newline-ws node count.
        - For each case FIRST assert `canonicalHash(baseHast) ===
          canonicalHash(variantHast)` (proves GH-20 normalizes), THEN feed
          `local = buildContentHash({ hast: variantHast, ... })` against
          `base.renderedBodyHash = canonicalHash(baseHast)` and assert
          `ok(NO_CHANGE)`.
        - Mirror for TC-REALCHG-001..005: built genuine content-edit HAST pairs,
          assert `canonicalHash(baseHast) !== canonicalHash(editHast)`, then
          assert the classifier returns `LOCAL_AHEAD`.
        - Do NOT assert NO_CHANGE for internal-whitespace collapse or code-block
          trimming — GH-20 does not normalize those (real changes). ✓
- [x] **6.2 (F-2 — high)** Remove the misleading base-absent footgun. Made
        `base` required in `ClassifyInput` (`base: SharedBase`, not `base?`) and
        deleted the `base === undefined → err(Forbidden, pageId: "")` branch in
        `classifier.ts`. DEC-5's contract is "classify is invoked only for bound
        documents (base present)"; the type now enforces it. ✓
- [x] **6.3 (F-3 — medium)** Applied comment discipline: kept ONE substantive
        reference per module header at the load-bearing point across
        `sync-state.ts`, `hashes.ts`, `classifier.ts`, `actions.ts`. Converted or
        deleted the bare DEC-/PD-/Q1/F-/NFR- inline tags. Removed the duplicate
        JSDoc in `sync-state.ts`. Headers stay ≤ 3 lines, single authority cite. ✓
- [x] **6.4 (F-4 — low)** Replaced the `require("#domain/state/sync-state")` in
        `classifier.test.ts` (TC-BOUNDARY-001) with an ESM import
        (`import { SyncStateSchema, SyncStateValue } from ...`). ✓
- [x] **6.5 (F-5 — low)** Collapsed the `SYNC_STATES`/`SyncStateValue`
        duplication in `sync-state.ts` to a single enumeration source (kept SYNC_STATES as source, SyncStateValue derives from it). ✓
- [x] **6.6 (F-6 — low)** Deleted the four stale duplicate `⏳` rows in the
        Execution Log table (phases 2-5 listed twice); kept the `✅` rows. ✓
- [x] **6.7** Ran `bun run check` (lint + format:check + typecheck + test +
        check:boundaries); confirmed it exits 0 with 808 tests passing and the rewritten false-positive /
        real-change fixtures genuinely pass through `canonicalHash`. ✓

**Acceptance Criteria**:

- Must: the false-positive fixtures assert `canonicalHash(base) ===
  canonicalHash(variant)` BEFORE asserting `ok(NO_CHANGE)` — the canonical
  comparison basis is the thing under test (F-1; AC-F2-1/NFR-4/NFR-8).
- Must: `ClassifyInput.base` is required; the `err(Forbidden, pageId: "")`
  branch is gone; `Forbidden` is used ONLY for the 403 path (F-2; DEC-3).
- Must: module headers ≤ 3 lines with one authority cite; no bare compliance
  tags; duplicate JSDoc removed (F-3).
- Must: no `require()` in tests; single enumeration source; clean execution log
  (F-4/F-5/F-6).
- Must: `bun run check` exits 0 (AC-Q-1).

**Completion signal**: `fix(state): close GH-22 review-iter-1 findings (false-positive fixtures, base-required type, comment discipline) (GH-22)`

---

### Phase 7: Code Review Remediation (Iteration 2)

> **Source:** `code-review/review-iter-2.yaml` (local review, status: FAIL).
> **Why:** a second-pass review confirmed all iteration-1 findings (Phase 6,
> still unexecuted) and surfaced two new issues iteration 1 missed: a latent
> idempotency defect in the optional `remote.title` comparison, and repeated
> same-module import duplication. This phase addresses ONLY the new findings;
> it does not merge into Phase 6.

**Goal**: Close the iteration-2 findings so the idempotency invariant
(NFR-PERF-4) is robust to an absent `remote.title`, and the new modules match
the sibling `reconcile.ts` import discipline.

**Tasks**:

- [ ] **7.1 (iter-2 F-1 — medium)** Guard the title facet in `classifier.ts`
       so an absent `remote.title` is not treated as local drift. Change
       `local.title !== remote.title` to
       `remote.title !== undefined && local.title !== remote.title` (the
       `remote.kind === "present"` narrowing is already in scope). Add a
       NO_CHANGE fixture where `remote = { kind: "present", bodyHash, version }`
       carries NO `title` and `local` matches `base` on canonical/parent/
       attachments — assert `ok(NO_CHANGE)` (proves NFR-PERF-4 holds without a
       remote title).
- [ ] **7.2 (iter-2 F-2 — low)** Combine same-module imports into one statement
       per module with inline `type` modifier, across:
       - `classifier.ts` (`./hashes` ×2 → 1; `./sync-state` ×2 → 1),
       - `actions.ts` (`./sync-state` ×2 → 1),
       - `classifier.test.ts` (`#domain/state/sync-state` ×3 → 1),
       - `actions.test.ts` (`#domain/state/sync-state` ×3 → 1).
       Example: `import { attachmentHash, type ContentHash } from "./hashes";`.
       Run `bun run format:check` after to confirm the gate stays green.
- [ ] **7.3** Run `bun run check` (lint + format:check + typecheck + test +
       check:boundaries); confirm it exits 0 and the new title-absent fixture
       passes.

**Acceptance Criteria**:

- Must: a `present` remote without `title` classifies `NO_CHANGE` when local
  matches base on body/parent/attachments (iter-2 F-1; NFR-PERF-4).
- Must: every new module and the two affected test files use one import
  statement per module (inline `type` modifier), matching `reconcile.ts`
  (iter-2 F-2; typescript.md import hygiene).
- Must: `bun run check` exits 0 (AC-Q-1).

**Completion signal**: `fix(state): close GH-22 review-iter-2 findings (absent-title idempotency guard, import hygiene) (GH-22)`

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TC-HASH-001 | `ContentHash` composes raw + canonical + attachment facets; `canonicalHash !== rawHash` | 1 | F-2 / DM-2 |
| TC-HASH-002 | `canonicalHash` deterministic across runs; stable under superficial whitespace diff | 1 | F-2 / NFR-8 |
| TC-STATE-001 | local==base==remote on canonical+title+parent+attachments → `ok(NO_CHANGE)` | 2 | AC-F3-1 / NFR-6 |
| TC-STATE-002 | local changed, remote==base → `ok(LOCAL_AHEAD)` | 2 | AC-F3-2 / NFR-7 |
| TC-STATE-003 | local==base, remote changed → `ok(REMOTE_AHEAD)` (INV-SAFE-1) | 2 | AC-F3-3 / NFR-2 |
| TC-STATE-004 | both changed vs base → `ok(DIVERGED)` (INV-SAFE-1) | 2 | AC-F3-4 / NFR-2 |
| TC-STATE-005 | binding present, `remote.kind=="missing"` → `ok(REMOTE_MISSING)` (INV-SAFE-2) | 2 | AC-F3-5 / NFR-3 |
| TC-STATE-006 | binding present, `local` absent → `ok(LOCAL_MISSING)` (DEC-1) | 2 | AC-F3-6 / NFR-7 |
| TC-FORBIDDEN-001 | `remote.kind=="forbidden"` → `err(Forbidden)`, not a `SyncState` (Q1) | 2 | AC-F4-1 / NFR-7 |
| TC-FALSEPOS-001..005 | 5 GH-20-normalized diffs (structural-ws-node count, multi-ws-node collapse, attribute order, raw-vs-text, empty-line count) → `ok(NO_CHANGE)` | 2 | AC-F2-1 / NFR-4 / NFR-8 |
| TC-REALCHG-001..005 | 5 genuine content edits → NOT `NO_CHANGE` | 2 | AC-F2-2 / NFR-5 |
| TC-METADATA-001 | title-only change (body identical) → `ok(LOCAL_AHEAD)` (R1) | 2 | AC-F5-1 / NFR-8 |
| TC-METADATA-002 | parent-only change (body identical) → `ok(LOCAL_AHEAD)` (R1) | 2 | AC-F5-1 / NFR-8 |
| TC-EDGE-001 | `local` absent + `remote.kind=="missing"` + binding → `ok(LOCAL_MISSING)` (DEC-6) | 2 | AC-F6-1 |
| TC-BOUNDARY-001 | `SyncStateSchema` rejects ad-hoc state strings (UL rule 3) | 2 | NFR-10 |
| TC-ACTION-001..006 | `SyncState → Action` mapping; `Block` carries typed error + correct field provenance | 3 | F-5 / DM-5 / NFR-2 / NFR-3 |
| TC-PURITY-001 | dep-cruiser fires `domain-may-not-import-infra` on a `src/domain/state/` probe | 4 | AC-F1-1 / NFR-1 |
| TC-PURITY-002 | production `src/domain/state/` has 0 infra imports (clean-state positive) | 4 | AC-F1-1 / NFR-1 |
| TC-GATE-001 | `bun run check` exits 0 | 5 | AC-Q-1 / NFR-11 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | ./chg-GH-22-spec.md | Spec |
| Test plan | ./chg-GH-22-test-plan.md | Test plan |
| Story file | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S5--drift-classifier.md` | Story |
| `SyncState` enum + zod schema + `RemoteState` union + `SharedBase` view | `src/domain/state/sync-state.ts` | Code (new) |
| `ContentHash` VO + `rawHash`/`canonicalHash`/`attachmentHash` + wire prefix | `src/domain/state/hashes.ts` | Code (new) |
| `classify()` three-way classifier | `src/domain/state/classifier.ts` | Code (new) |
| `Action` type + `actionFor(state, ctx)` mapping | `src/domain/state/actions.ts` | Code (new) |
| Hash unit tests (TC-HASH-001/002) | `tests/unit/domain/state/hashes.test.ts` | Test (new) |
| Classifier fixtures (TC-STATE/FORBIDDEN/FALSEPOS/REALCHG/METADATA/EDGE/BOUNDARY) | `tests/unit/domain/state/classifier.test.ts` | Test (new) |
| Action mapping suite (TC-ACTION-001..006) | `tests/unit/domain/state/actions.test.ts` | Test (new) |
| Boundary negative test (TC-PURITY-001/002; ephemeral probe) | `tests/unit/domain/state/boundary-negative.test.ts` | Test (new) |
| ADR-0006 (state model — INV-SAFE-1/2, §5.4 three-way comparison) | `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` | Decision |
| Ubiquitous Language (§Sync State + binding rule 3) | `doc/overview/ubiquitous-language.md` | Reference |
| Reused seams (DO NOT re-implement) | `src/domain/render/canonicalize.ts` (GH-20), `src/domain/binding/page-binding.ts` (GH-18/19), `src/domain/errors.ts`, `src/domain/result.ts` | Reused |
| Sibling pattern | `src/domain/state/reconcile.ts` + `tests/unit/domain/state/reconcile.test.ts` (GH-19) | Reused |
| Classifier style reference | `src/domain/markdown/unsupported.ts` (GH-20) | Reused |
| Boundary-test pattern | `tests/unit/domain/target/boundary-negative.test.ts` (GH-21) | Reused |
| House-style precedent | `doc/changes/2026-07/2026-07-09--GH-21--confluence-adapter/chg-GH-21-plan.md` | Plan precedent |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-12 | plan-writer | Initial plan. Six phases per the dependency lattice: Phase 0 branch + baseline gate; Phase 1 type/VO foundation (`sync-state.ts` + `hashes.ts` — `SyncState` enum + zod schema + `RemoteState` union + `SharedBase` view + `ContentHash` VO + hash helpers, delegating verbatim to GH-20 and owning the deferred wire prefix); Phase 2 the `classify()` core + exhaustive fixtures (6 states + forbidden + false-positive suite + real-change suite + title/parent + both-missing edge + zod boundary); Phase 3 the `Action` mapping; Phase 4 the dep-cruiser boundary negative test (state-scoped ephemeral probe, PD-4); Phase 5 final gate + doc handoff. Surfaced PD-1..PD-5: ContentHash carries R1 metadata facets; wire prefix `sha256:`; title-facet attribution to local; state-scoped boundary probe; `actionFor(state, ctx)` with base+remote context. Doc reconciliation (DEC-4 signature, UL bindings, feature-spec tag) handed to lifecycle phase 7 — coder touches only `src/` and `tests/`. |
| 1.1 | 2026-07-12 | reviewer | Appended Phase 6 (Code Review Remediation, Iteration 1) from `code-review/review-iter-1.yaml` (status: FAIL). Findings: F-1 critical — TC-FALSEPOS-001..005 are byte-identical to TC-STATE-001 and never exercise GH-20 normalization (AC-F2-1/NFR-4/NFR-8 not genuinely met); F-2 high — base-absent branch reuses `err(Forbidden)` with empty pageId (DEC-3 violation); F-3 medium — bare DEC-/PD-/Q1 tags + multi-authority headers; F-4 low — `require()` in test; F-5 low — `SYNC_STATES`/`SyncStateValue` duplication; F-6 low — stale duplicate execution-log rows. Reused contracts (canonicalize/errors/result/page-binding) verified unmodified; INV-SAFE-1/2, DEC-2/3, six-state enum, #domain purity all hold. |
| 1.2 | 2026-07-12 | reviewer | Appended Phase 7 (Code Review Remediation, Iteration 2) from `code-review/review-iter-2.yaml` (status: FAIL). New findings iteration 1 missed: F-1 medium — `local.title !== remote.title` defeats NO_CHANGE/NFR-PERF-4 when the optional `remote.title` is absent (no fixture covers it); F-2 low — same-module import duplication across `classifier.ts`, `actions.ts`, and both test files (violates typescript.md "one import statement per module"; diverges from `reconcile.ts`). Phase 6 (iter-1) tasks remain unexecuted; status stays FAIL. |

## Execution Log

> Populated during execution by `@coder`; the PM records the completion signal
> (commit) and the `bun run check` result per phase.

| Phase | Status | Started | Completed | Commit | `bun run check` | Notes |
|-------|--------|---------|-----------|--------|------------------|-------|
| 0 — branch + baseline gate | ✅ | 2026-07-12 | 2026-07-12 | 4e46387 (docs: add gh-22 planning artifacts) | ✅ 773 tests | Baseline established. Verified all reused contracts: canonicalize, PageBinding, errors.ts (RemoteMissing/Forbidden/Conflict), Result, reconcile.ts, boundary test pattern. |
| 1 — types + VOs (`sync-state.ts` + `hashes.ts`) | ✅ | 2026-07-12 | 2026-07-12 | 808e13c (feat: sync-state enum + content-hash vo + hash helpers) | ✅ 778 tests (+5) | F-2/F-3/F-4; TC-HASH-001/002; canonicalHash delegates to GH-20 (DEC-2/PD-2). SyncState enum + RemoteState union + SharedBase view + ContentHash VO + hash helpers delivered. |
| 2 — `classify()` core + fixtures | ✅ | 2026-07-12 | 2026-07-12 | e5d74c4 (feat: classify() three-way drift classifier + fixtures) | ✅ 799 tests (+21) | F-1/F-6; TC-STATE-001..006 + FORBIDDEN + FALSEPOS×5 + REALCHG×5 + METADATA×2 + EDGE + BOUNDARY. classify() three-way classifier + all fixtures delivered. |
| 3 — `Action` mapping + suite | ✅ | 2026-07-12 | 2026-07-12 | 688d4a9 (feat: sync-state → action mapping) | ✅ 806 tests (+7) | F-5; TC-ACTION-001..006; no new error arms (DEC-3). SyncState → Action mapping + action suite delivered. errors.ts untouched (verified). |
| 4 — boundary negative test | ✅ | 2026-07-12 | 2026-07-12 | 39d49d0 (test: boundary negative test - src/domain/state purity) | ✅ 808 tests (+2) | AC-F1-1; TC-PURITY-001/002; state-scoped probe (PD-4). Boundary negative test proves src/domain/state/ purity. canonicalize.ts and errors.ts untouched (verified). |
| 5 — final gate + doc handoff | ✅ | 2026-07-12 | 2026-07-12 | a67364c (chore: final quality gate + boundary confirmation) | ✅ 808 tests (+35) | AC-Q-1; boundary clean (0 infra imports); errors.ts unchanged; doc handoff to phase 7. All acceptance criteria met. |
| 6 — code review remediation (iter-1) | ✅ | 2026-07-12 | 2026-07-12 | d720c27 (fix: close GH-22 review-iter-1 findings) | ✅ 808 tests (no delta) | F-1 (rewrote false-positive/real-change suites with canonicalHash assertions), F-2 (base required, deleted err(Forbidden) branch), F-3 (comment discipline - one authority cite), F-4 (ESM import), F-5 (collapsed SYNC_STATES duplication), F-6 (cleaned execution log). All checks pass. |
