---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-18-document-identity-uuid-v7
status: Updated
created: 2026-07-09T00:00:00Z
last_updated: 2026-07-09T12:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E3, safe-publish, critical, identity, safety, foundation]
links:
  change_spec: ./chg-GH-18-spec.md
  story: ../../../planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S1--document-identity.md
  adr_0006: ../../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md
  feature_spec: ../../../spec/features/feature-safe-publish.md
  typescript_rules: ../../../.ai/rules/typescript.md
  testing_strategy: ../../../.ai/rules/testing-strategy.md
  architecture: ../../../overview/architecture-overview.md
  ubiquitous_language: ../../../overview/ubiquitous-language.md
  env_example: ../../../../.env.example
  gh17_plan_precedent: ../2026-07-08--GH-17--auth-provider/chg-GH-17-plan.md
  gh15_plan_precedent: ../2026-07-07--GH-15--config-system/chg-GH-15-plan.md
summary: >
  Deliver MS-0002 document identity (MS2-E3 — Safe Publish Core, first story): an
  immutable, source-side **UUID v7** generated at first-publish and stored in
  Markdown front-matter (`marksync.uuid`), plus a **FATAL duplicate-UUID
  detector** (INV-SAFE-3) and the `PageBinding` record shape. Establishes the
  identity half of ADR-0006 (C-1 identity survives clones/branches/renames;
  C-4 duplicate fatal). All identity logic lives in `src/domain/identity/`
  (branded `DocumentId` VO, `generateUuidV7`, byte-stable `injectUuid`/`readUuid`,
  O(n) `detectDuplicateUuids`); the `PageBinding` type lives in
  `src/domain/binding/`. `injectUuid` is a PURE domain string transform —
  byte-stable (preserves the rest of the doc byte-for-byte except the injected
  key, NO whitespace normalization) and idempotent (never overwrites an existing
  UUID). `marksync init` is extended to assign a UUID v7 to each discovered
  managed doc's front-matter via a new application-tier orchestrator (the CLI
  tier may not import domain, dep-cruiser-enforced). The existing `DuplicateUuid`
  arm in `MarkSyncError` (already present from GH-14, including its
  `assertNeverMarkSyncError` case) is consumed unchanged — NO union churn. Out of
  scope: lock persistence (E3-S2), drift classification (E3-S5), the actual
  Confluence write (E3-S4/E3-S6).
version_impact: minor
---

# IMPLEMENTATION PLAN — GH-18: [MS2-E3-S1] Document identity (UUID v7) + front-matter binding

## Context and Goals

This plan delivers **document identity** for MS-0002 (epic MS2-E3 — Safe Publish
Core, first story). It is the identity capability the lock (E3-S2), the markdown
pipeline (E3-S3), the push flow (E3-S6), and `marksync init` will consume: a
durable, immutable, source-side **UUID v7** stored in `marksync.uuid` front-matter
that survives clones, branches, renames, and CI (ADR-0006 C-1), with
**duplicate-UUID detection FATAL before any write** (INV-SAFE-3 / ADR-0006 C-4).
Concretely it establishes:

- the **`DocumentId` value object** — a branded type `type DocumentId = string &
  { __brand: "DocumentId" }` (ADR-0006 Identity section) that prevents accidental
  string substitution, plus `generateUuidV7()` (via `uuid` v9+ `v7()`), an
  `isUuidV7` predicate, an `assertUuidV7` assertion, and a `parseDocumentId` that
  returns `Result<DocumentId, DocumentIdError>`;
- the **byte-stable front-matter binding** — `readUuid(source): DocumentId |
  undefined` (tolerant) and `injectUuid(source): { source; uuid }` (idempotent,
  writes only if absent, preserves every other byte);
- the **fatal duplicate detector** — `detectDuplicateUuids(docs): Result<void,
  MarkSyncError>` → `err({ kind: "DuplicateUuid"; uuid; paths })` on any UUID on
  >1 doc (O(n) via `Map<uuid, path[]>`); docs missing a UUID are NOT duplicates
  (they get one at first publish);
- the **`PageBinding` record shape** (blueprint §3, ADR-0006 Shared-base schema)
  — `{ uuid, sourcePath, pageId, parentPageId, pageVersion, sourceCommit,
  sourceContentHash, renderedBodyHash, remoteBodyHash, attachmentHashes,
  operationId, synchronizedAt, toolVersion }`; this story defines the TYPE +
  identity-binding semantics only (E3-S2 implements lock persistence);
- **`marksync init` UUID assignment** — inject a UUID v7 into each discovered
  managed doc's front-matter (write the file); this story implements the identity
  assignment step, full `init` orchestration is later.

The plan is derived entirely from the authoritative story
`MS2-E3-S1--document-identity.md` (7 deliverables, 6 testable ACs) and ADR-0006
(C-1, C-4, Identity section). It invents no requirements.

> **Scope-source note.** The change spec `chg-GH-18-spec.md` (same folder) is the
> **contract authority**; at plan-authoring time it is not yet created
> (`specification` lifecycle phase pending — see `chg-GH-18-pm-notes.yaml`). This
> plan operationalizes the authoritative story file plus the `clarify_scope`
> intake verification; where the spec later diverges, the spec wins on contract
> matters (AC wording, DEC table) and this plan is reconciled in a revision-log
> entry. The five binding decisions below are encoded as committed.

### Binding decisions

> Resolved at intake / plan authoring from the story + existing source state
> (`chg-GH-18-pm-notes.yaml`). They are committed here; delivery must not
> re-litigate them.

- **PD-1 — Domain-tier identity uses the `yaml` package directly; it CANNOT
  reuse the app-tier `parseFrontMatter`.** The story's "Use the YAML parser from
  E2-S2" refers to the **`yaml` dependency** (`^2.9.0`, the same package
  `src/app/document-config.ts` imports), NOT the application helper
  `parseFrontMatter()`. Identity lives in `src/domain/identity/`, and
  `src/domain/` may import **nothing** tiered (dep-cruiser
  `domain-may-not-import-app` + `domain-may-not-import-infra`, both severity
  `error` — **enforced**, unlike GH-17's app→infra gap). Consequences:
  - `src/domain/identity/frontmatter.ts` imports `uuid` + `yaml` (third-party,
    allowed — not tiers) + domain siblings (`#domain/identity/uuid`,
    `#domain/identity/document-id`) only. It re-implements the gray-matter fence
    detection **without** the app helper's CRLF→LF normalization (byte-stability
    forbids normalization — PD-3).
  - The application-tier orchestrator (Phase 5) MAY import `#domain/identity/*`
    (app→domain ✓) and is where any file I/O lives.
- **PD-2 — `injectUuid` is a pure domain string transform; `marksync init`
  UUID assignment is application-orchestrated; the CLI delegates.** File discovery
  + read/write-back is application-tier (a new `src/app/identity-assign.ts`),
  which calls the pure `injectUuid` per doc; `src/cli/commands/init.ts` calls that
  app function. This respects the tier matrix: domain is pure (no I/O), app does
  file I/O via the domain transform, CLI delegates to app and imports **no**
  `#domain/*` (`presentation-may-not-import-domain`, dep-cruiser-enforced). The
  existing `initCommand` stays presentation-thin (it already delegates config
  writing to `#app/config-template`).
- **PD-3 — Byte-stability is achieved by surgical text insertion, NOT
  `yaml.stringify`-round-tripping the front-matter.** `injectUuid` MUST preserve
  the rest of the document byte-for-byte except the injected key — NO whitespace
  normalization, NO key reordering, NO re-quoting (AC: "running twice yields the
  same UUID and the same doc bytes (minus whitespace normalization which must be
  NONE — byte-stable)"). Re-serializing the parsed YAML map would reformat the
  whole block and corrupt formatting the author chose; instead, `injectUuid`
  locates the front-matter block boundaries and inserts the `marksync.uuid` key
  with minimal text surgery (append a `marksync.uuid:` line to the block — or
  prepend a fresh   `---\nmarksync:\n  uuid: <generated-v7>\n---\n` block when none exists — where
  `<generated-v7>` is the freshly generated `DocumentId`).
  A dedicated byte-stability test asserts `injectUuid`'s output is a strict
  superset of the input bytes (Phase 2 — the load-bearing test for AC).
- **PD-4 — `parseDocumentId` uses a narrow domain-local `DocumentIdError`, NOT a
  new `MarkSyncError` union arm.** The intake verified the `DuplicateUuid` arm
  already exists and **no union change is needed**; adding a new
  `InvalidDocumentId` arm to the global union would force the full GH-15/GH-17
  Phase-1 exhaustiveness churn (union + `assertNeverMarkSyncError` +
  `mapMarkSyncErrorToCommandError` + `CODE_TO_EXIT`) across three tiers for a
  parse helper that no publish-path consumer surfaces as a distinct error class
  yet. Instead `document-id.ts` declares `type DocumentIdError = { kind:
  "InvalidDocumentId"; value: string }` and `parseDocumentId(s): Result<DocumentId,
  DocumentIdError>`. `readUuid` stays tolerant (`DocumentId | undefined` —
  undefined if absent/malformed, mirroring the `parseFrontMatter` never-throws
  contract). If a future consumer needs a malformed-UUID failure on the publish
  path with an exit code, promote `DocumentIdError` to a union arm at that story
  (flagged in Open Questions). `assertUuidV7(s): asserts s is DocumentId` throws
  for true invariant-violation paths (typescript.md "throw is for invariant
  violations"). **[PM-RECON-1 Decision A — AUTHORITATIVE]** This position
  (`Result<DocumentId, DocumentIdError>`, narrow domain-local type, NOT a
  `MarkSyncError` arm) is confirmed authoritative; the spec is being reconciled
  to match it. No substance change in iter-2.
- **PD-5 — `uuid` v9+ ships its own bundled TypeScript types; `@types/uuid` is
  NOT required.** Verified at plan time (`npm view uuid types` →
  `./dist/index.d.ts`). Phase 0 runs only `bun add uuid`; no `@types/uuid`.

### Open questions

- **`version_impact` (no field in the story front matter).** Defaulting to
  `minor` per the GH-15 / GH-16 / GH-17 precedent (each bumped a minor for an
  equivalently additive foundation story) and the additive nature of this change
  (new dependency + new domain modules + a new init capability; no breaking
  contract change — the consumed `DuplicateUuid` arm pre-exists). The final phase
  applies `0.3.0 → 0.4.0`; confirm with the maintainer if the 0.x minor-vs-patch
  convention differs. *(Specification detail — no `@decision-advisor` escalation
  unless the maintainer disagrees.)*
- **Promote `DocumentIdError` to a `MarkSyncError` union arm?** (PD-4.) Defer
  until a publish-path consumer needs a malformed-UUID exit code. Not blocking
  for this story — `detectDuplicateUuids` already surfaces the safety-critical
  duplicate case via the existing `DuplicateUuid` arm. *(Delivery-time detail.)*
- **R1 — same-millisecond UUID v7 collision risk** (two devs add docs
  concurrently). CEO-resolved in the story: UUID v7 includes random bits;
  collision probability negligible at ≤500 pages; the duplicate detector is the
  safety net regardless. No action beyond shipping the detector (Phase 3).

## Scope

### In Scope

- **D-1** — `src/domain/identity/uuid.ts` (new): `UUID_V7_REGEX`, `generateUuidV7():
  DocumentId` (via `uuid` v9+ `v7()`), `isUuidV7(s): boolean`, `assertUuidV7(s):
  asserts s is DocumentId`. v7 regex validation (RFC 9562: version nibble `7`,
  valid variant).
- **D-2** — `src/domain/identity/document-id.ts` (new): branded
  `type DocumentId = string & { __brand: "DocumentId" }`; narrow
  `type DocumentIdError = { kind: "InvalidDocumentId"; value: string }`;
  `parseDocumentId(s): Result<DocumentId, DocumentIdError>` (PD-4).
- **D-3** — `src/domain/identity/frontmatter.ts` (new): `readUuid(source):
  DocumentId | undefined` (tolerant — undefined on absent/malformed); `injectUuid(
  source): { source: string; uuid: DocumentId }` (idempotent — writes a UUID only
  if absent; byte-stable — preserves the rest of the doc byte-for-byte except the
  injected key, NO normalization; PD-3 surgical insertion via the `yaml`
  package). Touches ONLY the front-matter block.
- **D-4** — `src/domain/identity/duplicate-detector.ts` (new): `detectDuplicateUuids(
  docs: { path: string; uuid?: DocumentId }[]): Result<void, MarkSyncError>` →
  `err({ kind: "DuplicateUuid"; uuid; paths: string[] })` on any UUID on >1 doc
  (O(n) via `Map<uuid, path[]>`); `ok` otherwise. Docs missing a UUID are NOT
  duplicates. Consumes the **existing** `DuplicateUuid` arm (no union change).
- **D-5** — `src/domain/binding/page-binding.ts` (new): the `PageBinding` record
  (`{ uuid: DocumentId; sourcePath; pageId; parentPageId; pageVersion;
  sourceCommit; sourceContentHash; renderedBodyHash; remoteBodyHash;
  attachmentHashes: Record<string,string>; operationId; synchronizedAt;
  toolVersion }`) + identity-binding semantics (C-1) + an `isPageBinding` type
  guard. TYPE only — no persistence (E3-S2).
- **D-6** — `src/app/identity-assign.ts` (new) + `src/cli/commands/init.ts`
  (updated): the application-tier orchestrator (`assignUuidsFromDisk` over
  discovered managed docs — read, `injectUuid` if absent, write back, return
  summary) and the `marksync init` integration (PD-2 — CLI delegates to app,
  imports no domain).
- **D-7** — Unit + integration tests (paths/tiers per PM-RECON-1 Decision C): uuid
  generation/regex/assert (`tests/domain/identity/uuid.test.ts` — Unit),
  `DocumentId` branding + parse (`tests/domain/identity/document-id.test.ts` —
  Unit), front-matter read/inject idempotency + byte-stability (inline exact-string
  assertion — NOT a `tests/golden/` fixture) + body preservation + re-clone recovery
  + path-independence (`tests/domain/identity/frontmatter.test.ts` — Unit),
  duplicate detection incl. the INV-SAFE-3 fatal test (TC-DUP-001) + the halt-signal
  (TC-DUP-007) + the scale smoke (TC-SCALE-001)
  (`tests/domain/identity/duplicate-detector.test.ts` — Unit), `PageBinding`
  structural/branding (`tests/domain/binding/page-binding.test.ts` — Unit), the init
  UUID assignment via real file I/O in OS temp dirs
  (`tests/integration/identity/identity-assign.test.ts` — Integration). The
  **`DuplicateUuid` fatal unit test** (deliverable 7) lives in
  `duplicate-detector.test.ts` (TC-DUP-001). A BDD contributing scenario is drafted
  under `tests/bdd/features/` only; step defs are deferred to E5-S1 (GH-29) — out of
  this plan's implementation scope.

### Out of Scope

- **Lock file persistence** (E3-S2) — `PageBinding` lands as a TYPE here; reading
  /writing the committed lock is a later story.
- **Drift classification** (E3-S5) — consumes `PageBinding` but does not produce it
  here.
- **The actual write to Confluence** (E3-S4/E3-S6) — including wiring
  `detectDuplicateUuids` as the pre-write safety gate in the push flow (that
  integration test originates the fixture here via TC-DUP-001 but the push-flow
  call site is E3-S6).
- **Full `marksync init` discovery/orchestration** — this story implements the
  identity-assignment *step* (inject UUIDs into discovered docs); full init
  discovery semantics are later (story deliverable 6 caveat).
- **`marksync.metadata` remote content property / cross-check** (ADR-0006 Shared
  base) — infra/write-path, E3-S4.
- **New `MarkSyncError` union arm for malformed UUID** (PD-4) — deferred until a
  publish-path consumer needs it.
- **BDD step defs + zero-writes E2E** (PM-RECON-1 Decision C) — GH-18 has no write
  path, so the zero-writes E2E + BDD step definitions are deferred to E5-S1
  (GH-29). This story contributes only a DRAFT feature scenario under
  `tests/bdd/features/` (a documentation contribution, not implemented here).
- **Full system-spec reconciliation** (`feature-safe-publish.md` identity
  capability current-truth update, `ubiquitous-language.md` `DocumentId`/
  `PageBinding` code-binding, `id-prefix-catalog.md` INV-SAFE-3, ADR-0006
  implementation-plan items) — flagged for lifecycle phase 7 (`@doc-syncer`).

### Constraints

- **Tier rules** (`.ai/rules/typescript.md`, `architecture-overview.md`). For this
  story the dep-cruiser enforcement is the **load-bearing guard** (unlike GH-17's
  app→infra gap): the live `.dependency-cruiser.cjs` ships **4** `forbidden`
  rules (severity `error`) — `domain→infra`, `domain→app`, `cli→domain`,
  `cli→infra` — and **all four** are exercised by this change:
  - `src/domain/identity/*` + `src/domain/binding/*` import **nothing** tiered —
    **dep-cruiser-enforced** (`domain→infra`, `domain→app`). They import only
    third-party (`uuid`, `yaml`) + domain siblings. `check:boundaries` is the
    load-bearing guard for identity/binding purity.
  - `src/app/identity-assign.ts` may import `domain` (+ infra via ports); **not**
    `cli`. It imports `#domain/identity/*` (+ node `fs`, + `#app/config` for
    `selectFiles`). The app→cli / app→infra directions are NOT dep-cruiser rules,
    but this module adds no such import.
  - `src/cli/commands/init.ts` may import `app` only — **not** `domain`,
    **not** `infra` — **dep-cruiser-enforced** (`cli→domain`, `cli→infra`). It
    calls the new `#app/identity-assign` and names **no** domain type (the
    `Result` flows in structurally, GH-15/GH-16/GH-17 precedent).
- **Strict TS** (`verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitAny`): type-only imports use
  `import type` / inline `type` modifiers (one statement per module —
  `import { type DocumentId, generateUuidV7 } from "#domain/identity/uuid"`);
  `array[i]` is `T | undefined`; the optional `uuid?` on the detector input is
  absent-not-undefined (`exactOptionalPropertyTypes`).
- **ESM-only**; path aliases via `package.json` `"imports"` (`#domain/*`,
  `#app/*`, …). No new alias required (`#domain/identity/uuid` resolves via
  `#domain/*`). Tests MUST use `#`-aliases, not deep relative paths
  (`.ai/rules/typescript.md` "Tests use import aliases").
- **Branding pattern** (ADR-0006 / story Technical approach):
  `type DocumentId = string & { __brand: "DocumentId" }`. Branding is nominal — a
  bare `string` cannot be assigned to `DocumentId`; the brand is constructed only
  inside `generateUuidV7` / `parseDocumentId` (the brand-erection seams).
- **`uuid` v9+ for `v7()`** (ADR-0006 — v7 over v4 for time-sortability; KSUID
  rejected on TS-library weakness). First consuming story → Phase 0 `bun add uuid`
  (PD-5 — bundled types, no `@types/uuid`).
- **Byte-stability** (AC): `injectUuid` preserves the rest of the doc
  byte-for-byte except the injected key; NO whitespace normalization (PD-3).
- **Canonical front-matter key** (story Q1, resolved): `marksync.uuid` (under the
  `marksync` namespace, alongside the GH-15 `marksync.title`/`parent`/`exclude`
  overrides). Read by exact path.
- **Error discipline** (`.ai/rules/typescript.md`): domain functions return
  `Result<T, E>` (never `throw` for expected failures); `throw`/`assertUuidV7` is
  for invariant violations only. The existing `DuplicateUuid` arm is consumed
  unchanged — NO `errors.ts` edit.
- **Comments discipline** (`.ai/rules/typescript.md`): ≤ 3-line file headers;
  self-documenting code; cite the authority once at the load-bearing point
  (e.g. ADR-0006 C-1/C-4, INV-SAFE-3); no bare compliance tags, no signature
  restatements, no spec duplication.
- **Quality gate:** `bun run check` = lint + format:check + typecheck + test +
  check:boundaries; must exit 0 (AC-6). Conventional Commits (commitlint + husky);
  each phase = one logical commit; `check:boundaries` green at every commit.

### Risks

- **RSK-1 — `injectUuid` is NOT byte-stable** (the highest-severity risk; AC +
  ADR-0006 C-1). If `injectUuid` round-trips the front-matter through
  `yaml.stringify`, it reformats the author's block (key order, quoting, flow vs
  block style, trailing whitespace) — corrupting diffs and violating the
  byte-stability AC. Mitigated by PD-3 (surgical text insertion) and a dedicated
  byte-stability test (Phase 2): the test asserts the output equals the input
  with ONLY the `marksync.uuid` key inserted, byte-for-byte, and that a second
  `injectUuid` call is a no-op returning identical bytes.
- **RSK-2 — A duplicate UUID is NOT detected (safety regression).** INV-SAFE-3 is
  brand-defining (R-VAL-4). Mitigated by the O(n) `Map<uuid, path[]>` detector
  (Phase 3) returning `err(DuplicateUuid)` on ANY UUID on >1 doc, and a unit test
  proving a duplicated-UUID fixture yields the fatal error (TC-DUP-001 —
  deliverable 7). The push-flow call site (E3-S6) is later; the detector + test
  originate here.
- **RSK-3 — Domain purity violation** (identity/binding importing a tier). Mitigated
  by `check:boundaries` — the `domain→infra` / `domain→app` rules ARE dep-cruiser-
  enforced (severity `error`), so a stray `#app/*` import in
  `src/domain/identity/frontmatter.ts` fails the build. This is the load-bearing
  guard for identity purity (no `rg` workaround needed, unlike GH-17).
- **RSK-4 — Same-millisecond UUID v7 collision** (two devs add docs concurrently).
  CEO-resolved (story R1): v7 random bits make collision negligible at ≤500 pages;
  the duplicate detector is the safety net. No action beyond shipping Phase 3.
- **RSK-5 — `marksync init` rewrites docs it should not** (overwrites an existing
  UUID, or writes outside the corpus). Mitigated by `injectUuid` idempotency
  (never overwrites — AC) and by the app orchestrator operating only on
  `selectFiles`-discovered managed docs (Phase 5).
- **RSK-6 — `uuid` v9+ type resolution breaks under `verbatimModuleSyntax`.** The
  `uuid` package is CommonJS-rooted; under strict ESM + `verbatimModuleSyntax` the
  import shape matters (`import { v7 } from "uuid"` vs default). Mitigated by a
  Phase 0 typecheck gate immediately after `bun add uuid` (the first thing that
  consumes the dep) and following the package's documented ESM usage.

### Success Metrics

- `generateUuidV7()` produces a v7 (time-sortable prefix; matches the v7 regex —
  version nibble `7`, valid variant) (AC-2).
- `injectUuid` is idempotent: running twice yields the same UUID and the same doc
  bytes (byte-stable — NO whitespace normalization) (AC-3).
- A doc moved/renamed (different `sourcePath`) retains its UUID — identity is
  independent of path (ADR-0006 C-1) (AC-4).
- A re-clone (fresh checkout with the committed front-matter) recovers the same
  UUIDs without regeneration — `readUuid` reads the committed `marksync.uuid`
  (AC-5).
- **INV-SAFE-3:** a fixture with two docs sharing `marksync.uuid` →
  `detectDuplicateUuids` returns `err({ kind: "DuplicateUuid"; uuid; paths })`
  listing both paths (AC-1, deliverable 7).
- `bun run check` (lint + format:check + typecheck + test + check:boundaries)
  exits 0; identity/binding import no tier (AC-6).

## Phases

> Each phase is one logical Conventional Commit and is independently verifiable by
> the listed command(s). Files are listed as `path (new | updated)`. Tier
> placements respect the dependency-direction matrix (see Constraints): identity
> lives in `src/domain/identity/` and binding in `src/domain/binding/` — both
> **dep-cruiser-enforced** pure domain (`domain→infra` / `domain→app`). `bun run
> check:boundaries` is run in **every** phase as the load-bearing purity guard for
> this story. Suggested commit scopes: `feat(identity):`, `feat(binding):`,
> `feat(init):`.

---

### Phase 0: Install the `uuid` dependency + boundary/typecheck sanity

**Goal**: Add the `uuid` v9+ dependency that `generateUuidV7` consumes (the first
consuming story for `uuid` per `typescript.md` "Planned" list), then immediately
verify it resolves under strict ESM + `verbatimModuleSyntax` and that the
boundaries are still clean. No production code uses it yet — this is the
dependency-only commit so Phase 1 has a compile target.

**Tasks**:

- [x] **0.1** Run `bun add uuid` (resolves `^9.0.0`+, which provides `v7()`
      per RFC 9562). Confirm `package.json` `dependencies` gains `"uuid"` and the
      lockfile updates. **Do NOT add `@types/uuid`** — `uuid` v9+ ships its own
      bundled types (`./dist/index.d.ts`, verified — PD-5). **NFR-13 note
      (PM-RECON-1 / Finding 7):** `uuid` is a zero-dependency package, so the
      ≤20-transitive-dependency budget (NFR-13) is satisfied trivially; no
      separate verification step is needed. The license/transitive-dependency
      audit runs via the repo quality gate (`bun run check` / CI).
      — DONE: resolved `uuid@14.0.1` (`^14.0.1`, v9+ family — provides `v7()`);
      `package.json` deps + `bun.lock` updated; no `@types/uuid` added; types at
      `./dist/index.d.ts`.
- [x] **0.2** Boundary/typecheck sanity: confirm `bun run typecheck` exits 0 (the
      new dep introduces no type error under `verbatimModuleSyntax` /
      `isolatedModules`); `bun run check:boundaries` exits 0 (no tier violation);
      `rg '"uuid"' src/` → empty (nothing imports it yet — the import lands in
      Phase 1). Record the resolved `uuid` version in the execution log.
      — DONE: `bun run typecheck` exit 0; `bun run check:boundaries` exit 0
      (34 modules, 40 deps cruised, no violations); `rg '"uuid"' src/` empty.

**Acceptance Criteria**:

- Must: `package.json` `dependencies` includes `uuid` (v9+); `bun.lock` updated;
      no `@types/uuid` added (PD-5).
- Must: `bun run typecheck` + `bun run check:boundaries` exit 0 (RSK-6
      precondition — the dep resolves cleanly under strict ESM).
- Must: NFR-13 satisfied — `uuid` adds zero transitive dependencies (verified
      trivially; the transitive/license audit runs in `bun run check` / CI).
- Should: the resolved `uuid` version recorded for traceability.

**Files and modules**:

- Code areas: `package.json` (updated — `dependencies`), `bun.lock` (updated).
- System docs: none.

**Tests**:

- `bun run typecheck`; `bun run check:boundaries`; `rg '"uuid"' src/` → empty.

**Completion signal**: `chore(deps): add uuid v9 for document identity v7 generation`

---

### Phase 1: UUID v7 generation + DocumentId value object

**Goal**: Deliver D-1 and D-2 — the pure-domain identity primitives: `uuid.ts`
(generation + validation) and `document-id.ts` (the branded `DocumentId` VO +
`parseDocumentId`). These are the foundation every later deliverable consumes; they
import only `uuid` (third-party) + domain siblings — `check:boundaries`-enforced.

**Tasks**:

- [ ] **1.1** Create `src/domain/identity/uuid.ts` (new):
      - `export const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
        (RFC 9562: the 13th hex digit is `7` for version; the 17th hex digit is
        `8`/`9`/`a`/`b` for the variant). Case-insensitive.
      - `generateUuidV7(): DocumentId` — calls `v7()` from `uuid` and brands the
        result (the brand-erection seam). A fresh v7 is always valid, so no
        re-validation needed.
      - `isUuidV7(s: string): boolean` — `UUID_V7_REGEX.test(s)` (predicate;
        accepts a bare `string`).
      - `assertUuidV7(s: string): asserts s is DocumentId` — throws on a malformed
        value (the invariant-violation path; typescript.md "throw is for invariant
        violations"). The assertion narrows to `DocumentId` on success — the second
        brand-erection seam.
      - Imports: `uuid` (`v7`) + `#domain/identity/document-id` (for the
        `DocumentId` brand). No tiered import.
      - ≤ 3-line header citing ADR-0006 (UUID v7 identity) once.
- [ ] **1.2** Create `src/domain/identity/document-id.ts` (new):
      - `export type DocumentId = string & { readonly __brand: "DocumentId" }`
        (the branded VO — ADR-0006 / story Technical approach). A bare `string`
        cannot be assigned to it.
      - `export type DocumentIdError = { kind: "InvalidDocumentId"; value: string }`
        (PD-4 — domain-local; NOT a `MarkSyncError` arm).
      - `parseDocumentId(s: string): Result<DocumentId, DocumentIdError>` —
        `isUuidV7(s)` (imported from `#domain/identity/uuid`) → `Result.ok(s as
        DocumentId)`; else `Result.err({ kind: "InvalidDocumentId", value: s })`.
      - Imports: `#domain/identity/uuid` (`isUuidV7`), `#domain/result`. Note the
        cross-reference: `uuid.ts` imports `DocumentId` from `document-id.ts` while
        `document-id.ts` imports `isUuidV7` from `uuid.ts` — break the cycle by
        having `document-id.ts` own the `DocumentId` type (no runtime import) and
        `uuid.ts` import only the type via `import type { DocumentId }`. Confirm no
        runtime circular import (`bun run typecheck` + a smoke import in the test).
      - ≤ 3-line header; cite ADR-0006 C-1 once.
- [ ] **1.3** Create `tests/domain/identity/uuid.test.ts` (new) — **Unit**; uses
      import aliases (`#domain/identity/uuid`); no mocks (real `v7()`).
      - **TC-UUID-001 (AC-2):** `generateUuidV7()` matches `UUID_V7_REGEX`; the
        13th hex digit is `7`; the 17th is in `[89ab]`.
      - **TC-UUID-002 (AC-2 / time-sortability):** two `generateUuidV7()` calls
        ~10 ms apart produce monotonically non-decreasing first-8-hex (the 48-bit
        unix-ms prefix) — the time-sortable property (the reason v7 was chosen over
        v4).
      - **TC-UUID-003:** `isUuidV7` accepts a known v7 (from `generateUuidV7`) and
        a literal v7; rejects a v4, a truncated string, an empty string, a v7 with
        a wrong variant digit, and a v7 with a wrong version digit (`8` instead of
        `7`).
      - **TC-UUID-004:** `assertUuidV7` returns void (and narrows to `DocumentId`)
        on a valid v7; throws on a malformed value.
      - **TC-UUID-005 (uniqueness smoke):** 1000 `generateUuidV7()` calls produce
        1000 distinct strings (sanity — not a collision-proof guarantee).
- [ ] **1.4** Create `tests/domain/identity/document-id.test.ts` (new) — **Unit**.
      - **TC-DOCID-001 (branding):** a `DocumentId` is assignable to `string` but a
        bare `string` is NOT assignable to `DocumentId` (compile-time assertion via
        a `// @ts-expect-error` line — the brand is nominal).
      - **TC-DOCID-002:** `parseDocumentId` on a valid v7 → `Result.ok` with a
        `DocumentId`; on a malformed value → `Result.err({ kind:
        "InvalidDocumentId", value })`.
      - **TC-DOCID-003:** `generateUuidV7()`'s output parses via
        `parseDocumentId` → `ok` (the two brand-erection seams agree).

**Acceptance Criteria**:

- Must: `generateUuidV7()` produces a v7 matching `UUID_V7_REGEX` with the
      time-sortable prefix (AC-2 / TC-UUID-001..002).
- Must: a bare `string` is not assignable to `DocumentId` (the brand is nominal —
      TC-DOCID-001 `@ts-expect-error`).
- Must: `src/domain/identity/*.ts` import only `uuid` + domain siblings —
      `check:boundaries` clean (`domain→infra` / `domain→app` enforced; RSK-3).
- Must: no runtime circular import between `uuid.ts` and `document-id.ts` (the
      type-only cross-import breaks the cycle).
- Must: `bun run typecheck` exits 0 under strict + `verbatimModuleSyntax`.

**Files and modules**:

- Code areas: `src/domain/identity/uuid.ts` (new), `src/domain/identity/document-id.ts`
  (new). Consumes the Phase-0 `uuid` dep + `#domain/result`.
- System docs: none.

**Tests**:

- `bun test tests/domain/identity/uuid.test.ts`
- `bun test tests/domain/identity/document-id.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(identity): add UUID v7 generation and DocumentId value object`

---

### Phase 2: Byte-stable front-matter UUID read/inject

**Goal**: Deliver D-3 — `readUuid` (tolerant) and `injectUuid` (idempotent,
byte-stable). This is the **load-bearing phase for the byte-stability AC** (RSK-1):
`injectUuid` must preserve the rest of the document byte-for-byte except the
injected key. Uses the `yaml` package directly (PD-1 — domain may not import the
app `parseFrontMatter`) and surgical text insertion (PD-3 — not a
`yaml.stringify` round-trip).

**Tasks**:

- [ ] **2.1** Create `src/domain/identity/frontmatter.ts` (new):
      - `readUuid(source: string): DocumentId | undefined` — locate the leading
        gray-matter block (`---` … `---`/`...`); parse the fenced YAML with the
        `yaml` package; read `marksync.uuid` if it is a string; return
        `parseDocumentId(value)`'s `ok` value, else `undefined` (tolerant — absent,
        malformed fences, or a malformed value all yield `undefined`; never
        throws, mirroring the app `parseFrontMatter` contract). If no front-matter
        block → `undefined`.
      - `injectUuid(source: string): { source: string; uuid: DocumentId }` —
        **idempotent**: if `readUuid(source)` returns a `DocumentId`, return
        `{ source, uuid }` UNCHANGED (byte-identical — never overwrites an existing
        UUID; AC / RSK-5). If absent:
        - generate a fresh `generateUuidV7()`;
        - insert `marksync.uuid` carrying the generated v7 into the front-matter
          by **surgical text insertion** (PD-3): if a front-matter block exists,
          append a `uuid: <generated-v7>` line under the `marksync:` map (or add
          the whole `marksync:` map + `uuid` key if `marksync:` is absent) without
          disturbing any other byte; if NO front-matter block exists, prepend a
          fresh `---\nmarksync:\n  uuid: <generated-v7>\n---\n` block;
        - return `{ source: <the new source string>, uuid }` (where `<the new
          source string>` is the surgically-updated text).
        - The insertion MUST NOT normalize whitespace, reorder keys, re-quote, or
          touch the document body (PD-3 / AC).
      - Imports: `yaml` (`parse as parseYaml`), `#domain/identity/uuid`
        (`generateUuidV7`), `#domain/identity/document-id` (`parseDocumentId`,
        `type DocumentId`). No tiered import.
      - ≤ 3-line header citing ADR-0006 (`marksync.uuid` identity) + the
        byte-stability invariant once.
- [ ] **2.2** Create `tests/domain/identity/frontmatter.test.ts` (new) — **Unit**.
      Byte-stability is an inline **exact-string assertion in this file** (NOT a
      separate `tests/golden/` fixture, NOT an integration file — PM-RECON-1
      Decision C / Finding 3d). Uses import aliases; no mocks.
      - **TC-FM-001 (read present):** `readUuid` on a doc with a valid
        `marksync.uuid` → the `DocumentId`; on a doc with no front-matter →
        `undefined`; on a doc with front-matter but no `marksync.uuid` →
        `undefined`.
      - **TC-FM-002 (read tolerant):** `readUuid` on a malformed value (a v4, a
        non-uuid string) → `undefined` (not a throw); on malformed fences (no
        closer) → `undefined`.
      - **TC-FM-003 (inject into absent — adds):** `injectUuid` on a doc with no
        front-matter → prepends a `---\nmarksync:\n  uuid: <generated-v7>\n---\n`
        block; the body is unchanged; the returned `uuid` parses via
        `parseDocumentId` → `ok`.
      - **TC-FM-004 (inject idempotent — never overwrites):** `injectUuid` on a doc
        that already has a `marksync.uuid` returns the source BYTE-IDENTICAL and
        the existing uuid; a second `injectUuid` on the already-injected output
        returns the same bytes and the same uuid (AC).
      - **TC-FM-005 (inject into existing `marksync` map):** a doc with an existing
        `marksync:` map (e.g. `marksync:\n  title: Foo`) gains `uuid:` under it
        without disturbing the `title` key or its formatting.
      - **TC-FM-006 (CRLF preservation):** a CRLF document's `\r\n` sequences
        outside the inserted key are preserved byte-for-byte (no LF normalization —
        PD-3; contrast the app `parseFrontMatter` which normalizes).
      - **TC-FM-007 (byte-stability — exact-string, AC-3 / RSK-1):** take a
        representative fixture string (front-matter with several keys + a
        multi-paragraph body with code fences/tables); `injectUuid`, then assert the
        output EQUALS the input with ONLY the single `uuid:` line inserted — compare
        via exact-string equality (`assert.strictEqual(output, expectedWithLine)`)
        and confirm the body substring is byte-identical. Then `injectUuid` again on
        the output → exact-string identical to the first output (idempotency).
        (Folded from the former `tests/integration/identity-frontmatter.test.ts` —
        PM-RECON-1 Decision C; replaces the byte-array-superset assertion.)
      - **TC-FM-008 (re-clone recovery — AC-5):** take `injectUuid`'s committed
        output, then `readUuid` on it → returns the SAME `DocumentId` (identity
        survives re-clone — no regeneration).
      - **TC-FM-009 (path-independence — AC-4):** `readUuid` depends only on the
        front-matter content; the same block yields the same uuid regardless of any
        path (ADR-0006 C-1).

      > No separate `tests/integration/identity-frontmatter.test.ts` and no
      > `tests/golden/` fixture (PM-RECON-1 Decision C / Finding 3a+3d): the
      > byte-stability, re-clone, and path-independence assertions are inline unit
      > cases (TC-FM-007..009) in this file.

**Acceptance Criteria**:

- Must: `readUuid` is tolerant (undefined on absent/malformed, never throws) and
      returns the committed UUID on a valid doc (TC-FM-001..002).
- Must: `injectUuid` is idempotent — an already-assigned doc returns byte-identical
      source + the existing uuid (AC-3 / TC-FM-004); a second pass is a no-op
      (TC-FM-007).
- Must: **byte-stability** — `injectUuid`'s output is the input with ONLY the
      `uuid` key inserted; the body and every other front-matter byte are
      preserved (PD-3 / AC-3 / RSK-1 / TC-FM-007 — inline exact-string unit
      assertion, NO golden/integration fixture per PM-RECON-1 Decision C). NO
      whitespace normalization (TC-FM-006).
- Must: re-clone recovers the same UUID without regeneration (AC-5 / TC-FM-008);
      identity is path-independent (AC-4 / TC-FM-009).
- Must: `check:boundaries` clean (frontmatter imports `yaml` + domain siblings
      only).

**Files and modules**:

- Code areas: `src/domain/identity/frontmatter.ts` (new). Consumes Phase 1
  (`uuid`, `document-id`) + `yaml`.
- System docs: none.

**Tests**:

- `bun test tests/domain/identity/frontmatter.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(identity): add byte-stable front-matter UUID read and inject`

---

### Phase 3: Fatal duplicate-UUID detector (INV-SAFE-3)

**Goal**: Deliver D-4 + deliverable 7 — the O(n) `detectDuplicateUuids` that makes
a duplicate UUID FATAL before any write (ADR-0006 C-4 / INV-SAFE-3), and the unit
test proving a duplicated-UUID fixture yields the fatal error. Consumes the
**existing** `DuplicateUuid` arm — NO `errors.ts` change.

**Tasks**:

- [ ] **3.1** Create `src/domain/identity/duplicate-detector.ts` (new):
      - `detectDuplicateUuids(docs: { path: string; uuid?: DocumentId }[]): Result<
        void, MarkSyncError>` — iterate once, build a `Map<string, string[]>`
        keyed by the uuid string, pushing each doc's `path`; docs with `uuid ===
        undefined` are SKIPPED (they get a uuid at first publish — NOT duplicates).
        After the pass, if any map entry has `paths.length > 1`, return `Result.err(
        { kind: "DuplicateUuid"; uuid: <the duplicated key>; paths: <the sharing
        paths> })` — `uuid` set to the duplicated key, `paths` set to the sharing
        paths. **First-collision-only reporting** (PM-RECON-1 Decision B / matches
        the spec): a single `DuplicateUuid` error is returned carrying ONE uuid and
        its sharing paths; report the first colliding uuid (deterministic order by
        sorting the map keys or scanning in input order). Do NOT enumerate every
        colliding uuid in one error. Otherwise `Result.ok(undefined)`.
      - Imports: `#domain/errors` (`type MarkSyncError`), `#domain/result`,
        `#domain/identity/document-id` (`type DocumentId`). No tiered import.
      - ≤ 3-line header citing ADR-0006 C-4 / INV-SAFE-3 once at the
        load-bearing point.
- [ ] **3.2** Create `tests/domain/identity/duplicate-detector.test.ts` (new) —
      **Unit**; the safety-critical test (release-blocking per the testing-strategy
      INV-SAFE-3 row; no mocks — real fixtures). The halt-signal case (TC-DUP-007)
      folds IN HERE — no separate integration file (PM-RECON-1 Decision C / Finding
      3a).
      - **TC-DUP-001 (INV-SAFE-3 / AC-1 / deliverable 7 — the fatal test):** a
        fixture with TWO docs sharing the same `marksync.uuid` →
        `detectDuplicateUuids` returns `err({ kind: "DuplicateUuid"; uuid; paths })`
        listing BOTH paths (order-independent compare). This is the test that
        proves the invariant.
      - **TC-DUP-002 (no-dup → ok):** three docs each with a distinct uuid →
        `Result.ok`.
      - **TC-DUP-003 (missing-uuid not-a-dup):** two docs BOTH missing a uuid →
        `Result.ok` (they get one at first publish — never a duplicate).
      - **TC-DUP-004 (mixed):** one doc missing a uuid + two docs sharing a uuid →
        `err(DuplicateUuid)` naming the two sharing docs only (the missing-uuid
        doc's path is NOT in `paths`).
      - **TC-DUP-005 (3-way dup lists all 3):** three docs sharing one uuid →
        `err(DuplicateUuid)` with `paths.length === 3`.
      - **TC-DUP-006 (error-arm regression — NOT the scale test):** reserved in the
        test-plan for the `DuplicateUuid` error-arm regression (error shape,
        non-throw contract, `Result` discipline). Do NOT repurpose this ID for the
        scale test (PM-RECON-1 Decision G / Finding 4).
      - **TC-DUP-007 (halt-signal — folded in per PM-RECON-1 Decision C):** assert
        the returned error on a duplicate IS the fatal `DuplicateUuid` — the halt
        signal a write flow would gate on. The error is RETURNED, not thrown. GH-18
        has no write path, so the zero-writes E2E is deferred to E5-S1 (GH-29).
      - **TC-SCALE-001 (scale smoke — NFR, PM-RECON-1 Decision D):** a synthetic
        500-doc corpus with one duplicate pair → `detectDuplicateUuids` COMPLETES
        WITHOUT ERROR and returns `err(DuplicateUuid)` naming the pair. O(n) is
        guaranteed BY CONSTRUCTION (single pass, `Map<uuid, path[]>`) — no strict
        ms-p95 assertion (CI-flaky; the scale requirement is demoted to an NFR in
        the spec).

**Acceptance Criteria**:

- Must: **INV-SAFE-3** — a duplicated-UUID fixture yields `err({ kind:
      "DuplicateUuid"; uuid; paths })` listing every sharing path (AC-1 /
      TC-DUP-001 — deliverable 7).
- Must: docs missing a UUID are NOT duplicates (TC-DUP-003..004).
- Must: `detectDuplicateUuids` returns `Result` (never throws for the expected
      duplicate case — typescript.md error discipline).
- Must: consumes the EXISTING `DuplicateUuid` arm — `errors.ts` is NOT edited
      (intake-verified).
- Must: `check:boundaries` clean (detector imports domain siblings + `#domain/result`
      + `#domain/errors` only).

**Files and modules**:

- Code areas: `src/domain/identity/duplicate-detector.ts` (new). Consumes Phase 1
  (`document-id`) + `#domain/errors` (existing `DuplicateUuid`) + `#domain/result`.
- System docs: none.

**Tests**:

- `bun test tests/domain/identity/duplicate-detector.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(identity): add fatal duplicate-UUID detector (INV-SAFE-3)`

---

### Phase 4: PageBinding type + identity-binding semantics

**Goal**: Deliver D-5 — the `PageBinding` record shape (blueprint §3, ADR-0006
Shared-base schema) with the `uuid` field typed as the branded `DocumentId` and a
one-line identity-binding semantics note (C-1). TYPE only — no persistence (that
is E3-S2); this story defines what E3-S2/E3-S5/E3-S6 will consume.

**Tasks**:

- [ ] **4.1** Create `src/domain/binding/page-binding.ts` (new):
      - `export interface PageBinding { uuid: DocumentId; sourcePath: string;
        pageId: string; parentPageId: string; pageVersion: number; sourceCommit:
        string; sourceContentHash: string; renderedBodyHash: string;
        remoteBodyHash: string; attachmentHashes: Record<string, string>;
        operationId: string; synchronizedAt: string; toolVersion: string; }`
        (exactly the 13 fields the story + ADR-0006 list). The `uuid` field is the
        branded `DocumentId` (imported via `import type { DocumentId } from
        "#domain/identity/document-id"` — binding → identity ✓, both domain).
      - `isPageBinding(value: unknown): value is PageBinding` — a structural type
        guard (typescript.md naming: `isXxx()`) checking the required string/number
        keys are present with the right primitive shape (the `uuid` presence, not
        its v7 validity — validation is `parseDocumentId`'s job).
      - ≤ 3-line header citing ADR-0006 (Shared-base schema) + the C-1
        identity-binding semantics (the uuid is the durable identity; pageId is
        the mutable remote identity recorded in the lock — E3-S2) once.
- [ ] **4.2** Create `tests/domain/binding/page-binding.test.ts` (new) — **Unit**.
      - **TC-PB-001 (structural shape):** a complete literal `PageBinding` (with a
        `DocumentId` uuid) satisfies the interface (compile-time); a literal
        missing any of the 13 fields is a compile error (`@ts-expect-error`).
      - **TC-PB-002 (branding):** `PageBinding.uuid` is `DocumentId` — a bare
        `string` literal for `uuid` is a compile error (`@ts-expect-error`); a
        `generateUuidV7()` value is accepted.
      - **TC-PB-003:** `isPageBinding` accepts a well-formed object; rejects one
        missing `uuid`, one with a non-string `pageId`, and a non-object.

**Acceptance Criteria**:

- Must: `PageBinding` exposes exactly the 13 fields (story + ADR-0006 schema);
      `uuid: DocumentId` (branded) (TC-PB-001..002).
- Must: `isPageBinding` narrows structurally (TC-PB-003).
- Must: `check:boundaries` clean (`src/domain/binding/*` imports only domain
      siblings — `domain→infra` / `domain→app` enforced).

**Files and modules**:

- Code areas: `src/domain/binding/page-binding.ts` (new). Consumes Phase 1
  (`type DocumentId`).
- System docs: none.

**Tests**:

- `bun test tests/domain/binding/page-binding.test.ts`
- `bun run typecheck`; `bun run check:boundaries`.

**Completion signal**: `feat(binding): add PageBinding type with identity-binding semantics`

---

### Phase 5: `marksync init` UUID assignment (application orchestrator + CLI wiring)

**Goal**: Deliver D-6 — inject a UUID v7 into each discovered managed doc's
front-matter when `marksync init` runs. Per PD-2: a new application-tier
orchestrator owns the file I/O (discover → read → `injectUuid` if absent → write
back → summary); the CLI `init` command delegates to it and imports NO domain
(dep-cruiser `cli→domain` enforced). This story implements the identity-assignment
*step*; full init discovery orchestration is later (story deliverable 6 caveat).

**Tasks**:

- [ ] **5.1** Create `src/app/identity-assign.ts` (new) — the application-tier
      orchestrator:
      - `export interface AssignedDoc { sourcePath: string; uuid: DocumentId;
        written: boolean; }` — `written` is true when a UUID was injected (file
        changed), false when one already existed (idempotent skip).
      - `export function assignUuidsFromDisk(cwd: string): Promise<Result<
        AssignedDoc[], MarkSyncError>>` — the disk-bound orchestrator the CLI calls:
        discover managed docs via `selectFiles` (reuse `#app/config`'s `selectFiles`
        + `loadConfig`), read each via `node:fs/promises`, run `injectUuid` (Phase 2)
        per doc, write back ONLY the changed docs via `node:fs/promises`'s
        `writeFile`, return the per-doc summary. Returns `Result` so the CLI maps
        errors through the existing `resultErrorFromAppResult` adapter (GH-16
        precedent); config-load failures reuse the existing `ConfigError` channel
        (`loadConfig`'s `Result`), and unexpected IO failures propagate to the CLI
        entrypoint's INTERNAL catch (the existing throw→INTERNAL pattern —
        GH-15/GH-16/GH-17 precedent) — **no new error arm**. Uses real
        `node:fs/promises` directly; the integration test (5.3) exercises it via OS
        temp dirs (PM-RECON-1 Decision C — Integration tier; no injectable sink
        needed).
      - Imports: `node:fs/promises`, `node:path`, `#domain/identity/frontmatter`
        (`injectUuid`), `#domain/identity/document-id` (`type DocumentId`),
        `#domain/result`, `#app/config` (`selectFiles`, `loadConfig`). No `#cli/*`,
        no `#infra/*`.
      - ≤ 3-line header citing the story + PD-2 once.
- [ ] **5.2** Update `src/cli/commands/init.ts` (updated) — after the existing
      `writeStarterConfig` succeeds, call `assignUuidsFromDisk(dir)` and fold its
      result into the `CommandResult` via the existing `resultErrorFromAppResult`
      adapter (PD-2 — CLI delegates to app; names no domain type). If config
      creation is refused (already exists), the existing behavior is preserved
      (OQ-TP-1) — UUID assignment runs only on a successful init (asserted in the
      integration test, 5.3 / TC-ASSIGN-005). Keep the handler presentation-thin:
      it never imports `#domain/*` / `#infra/*` (dep-cruiser-enforced). Summarize
      assigned/skipped counts in the success `CommandResult` message (structural
      counts only — safe to surface).
- [ ] **5.3** Create `tests/integration/identity/identity-assign.test.ts` (new) —
      **Integration tier**, real file I/O via OS temp dirs (`fs.mkdtemp`), no mocks
      (PM-RECON-1 Decision C / Finding 3b — init tests are Integration, not Unit).
      Each test builds a tiny corpus on disk (a temp dir + `.marksync` config +
      managed `.md` files), runs `assignUuidsFromDisk(tmpDir)`, and asserts on the
      written files.
      - **TC-ASSIGN-001 (inject into absent):** one doc with no front-matter →
        `written: true`; the file on disk now contains a `marksync.uuid` matching
        the returned uuid; `parseDocumentId` accepts it.
      - **TC-ASSIGN-002 (idempotent skip):** one doc that already has a
        `marksync.uuid` → `written: false`; the file is NOT rewritten (bytes
        unchanged — AC / RSK-5).
      - **TC-ASSIGN-003 (mixed corpus):** a corpus of N docs, some with / some
        without a uuid → exactly the without-uuid docs are written, each exactly
        once; the with-uuid docs are skipped.
      - **TC-ASSIGN-004 (byte-stability through the orchestrator):** a doc with
        rich front-matter + body that gets a uuid injected is written back
        byte-identical to `injectUuid`'s direct output (read the file back from
        disk and compare — the orchestrator does not reformat; it writes
        `injectUuid`'s bytes straight to disk).
      - **TC-ASSIGN-005 (refused-overwrite init does not assign):** when config
        creation is refused (config already exists), UUID assignment does NOT run
        (preserved behavior — OQ-TP-1).

      > No separate `tests/unit/app/identity-assign.test.ts` and no extension of
      > `tests/unit/cli/commands/init.test.ts` for UUID assignment (PM-RECON-1
      > Decision C): the init UUID-assignment behavior is covered by this single
      > Integration test through real disk.

**Acceptance Criteria**:

- Must: `src/cli/commands/init.ts` imports NO `#domain/*` / `#infra/*`
      (dep-cruiser `cli→domain` / `cli→infra` enforced); the new
      `src/app/identity-assign.ts` imports `#domain/*` + `#app/*` only —
      `check:boundaries` clean (PD-2 / RSK-3).
- Must: `marksync init` injects a UUID v7 into each discovered managed doc's
      front-matter and writes the file (D-6 / TC-ASSIGN-001).
- Must: a doc that already has a UUID is NOT rewritten (idempotent — AC / RSK-5 /
      TC-ASSIGN-002).
- Must: the orchestrator is byte-stable through the write path (TC-ASSIGN-004) —
      it writes `injectUuid`'s bytes straight to disk, no reformatting.
- Must: a refused-overwrite init does NOT assign UUIDs (TC-ASSIGN-005 / OQ-TP-1).
- Should: the Integration test uses real OS temp dirs (no mocks) per
      PM-RECON-1 Decision C.

**Files and modules**:

- Code areas: `src/app/identity-assign.ts` (new), `src/cli/commands/init.ts`
  (updated). Consumes Phase 2 (`injectUuid`) + `#app/config` + the existing CLI
  result adapter.
- System docs: none.

**Tests**:

- `bun test tests/integration/identity/identity-assign.test.ts`
- `bun run typecheck`; `bun run check:boundaries` (PD-2 load-bearing for the CLI
  tier).

**Completion signal**: `feat(init): assign UUID v7 to discovered docs on marksync init`

---

### Phase 6: Boundaries verification, version bump, and finalize

**Goal**: Verify the load-bearing purity invariant — identity/binding import no
tier (here `check:boundaries` IS the guard, unlike GH-17) — apply the
`version_impact: minor` bump per repo conventions, run the final full quality gate,
and confirm every AC has a passing test with no stray placeholders. Full
system-spec reconciliation is lifecycle phase 7 (`@doc-syncer`); this phase does
only trivial inline touch-ups.

**Tasks**:

- [ ] **6.1** **Boundaries verification:** `bun run check:boundaries` exits 0 (the
      4 dep-cruiser rules — `domain→infra`, `domain→app`, `cli→domain`,
      `cli→infra` — all green; identity/binding purity + CLI purity enforced).
      `rg '#infra|#app' src/domain/identity/ src/domain/binding/` → empty (no
      tiered import in the domain modules — the third-party `uuid`/`yaml` imports
      are allowed). `rg '#domain|#infra' src/cli/commands/init.ts` → empty (the
      CLI delegates to app only). Record the dep-cruise module count in the
      execution log.
- [ ] **6.2** Apply the version bump per repo conventions for
      `version_impact: minor`: `package.json` `0.3.0` → `0.4.0`; update
      `CLI_VERSION` in `src/cli/commands/router.ts` (line 41) to match
      (lock-step with `package.json` until a runtime version source is wired —
      GH-15/GH-16/GH-17 precedent). Confirm with the maintainer if the 0.x
      minor-vs-patch convention differs (Open Questions).
- [ ] **6.3** Inline documentation touch-ups (full doc-sync is lifecycle phase 7):
      ensure the new modules have compliant ≤ 3-line headers citing the
      load-bearing authority (ADR-0006 C-1/C-4, INV-SAFE-3) at the decision point
      only — no tier-rule essays, no bare compliance tags. Flag the following for
      `@doc-syncer` (do NOT rewrite here): `feature-safe-publish.md` identity
      capability (current-truth update now that identity is implemented);
      `ubiquitous-language.md` `DocumentId`/`PageBinding` code-binding entries
      (aggregate-boundary rule 4 already names `src/domain/identity/` +
      `src/domain/binding/`); `id-prefix-catalog.md` INV-SAFE-3 traceability;
      ADR-0006 Implementation Plan items 1 (init UUID assignment) + partial;
      `typescript.md` "Planned" → "Installed" for `uuid`.
- [ ] **6.4** Final review sweep: confirm all phase tasks are checked, every AC
      (AC-1..AC-6) has a passing test mapped in the Test Scenarios table, and
      there are no stray `<...>` placeholders or TODOs in shipped code
      (`rg "TODO|FIXME|XXX|HACK" src/` → none).
- [ ] **6.5** Run the full quality gate: `bun run check` (lint + format:check +
      typecheck + test + check:boundaries) — must exit 0 (AC-6). Re-confirm the
      Phase-3 INV-SAFE-3 test (TC-DUP-001) is green and the Phase-2 byte-stability
      test (TC-FM-007, inline unit assertion) is green.

**Acceptance Criteria**:

- Must: `check:boundaries` 0 violations; `rg '#infra|#app' src/domain/identity/
      src/domain/binding/` → empty; `rg '#domain|#infra' src/cli/commands/init.ts`
      → empty (the purity invariants — RSK-3).
- Must: version bumped per `version_impact: minor` (`0.3.0 → 0.4.0`) in both
      `package.json` and `CLI_VERSION`.
- Must: `bun run check` exits 0 (AC-6); the INV-SAFE-3 (TC-DUP-001) and
      byte-stability (TC-FM-007) tests green.
- Must: every AC (AC-1..AC-6) maps to ≥ 1 passing test (Test Scenarios table); no
      stray placeholders/TODOs in shipped code.
- Should: doc-sync items flagged for `@doc-syncer` recorded in
      `chg-GH-18-pm-notes.yaml` for lifecycle phase 7.

**Files and modules**:

- Code areas: `package.json` (version bump), `src/cli/commands/router.ts`
  (`CLI_VERSION`), ≤ 3-line header touch-ups in the new domain modules.
- System docs: none rewritten here (flagged for lifecycle phase 7 /
      `@doc-syncer`).

**Tests**:

- `bun run check` (the full gate — AC-6).
- `rg '#infra|#app' src/domain/identity/ src/domain/binding/` → empty;
  `rg '#domain|#infra' src/cli/commands/init.ts` → empty.

**Completion signal**: `feat(identity): finalize document identity and bump version`

---

## Test Scenarios

| ID | Scenario | Phases | AC |
|----|----------|--------|----|
| TS-1 | Two docs share `marksync.uuid` → `detectDuplicateUuids` returns `err({ kind: "DuplicateUuid"; uuid; paths })` listing both paths (the fatal test) | 3 | AC-1 / INV-SAFE-3 |
| TS-2 | `generateUuidV7()` matches the v7 regex (version nibble `7`, valid variant); two calls ~10 ms apart are time-sortable (non-decreasing 48-bit ms prefix) | 1 | AC-2 |
| TS-3 | `injectUuid` is idempotent: an already-assigned doc returns byte-identical source + existing uuid; a second pass is a no-op | 2 | AC-3 |
| TS-4 | `injectUuid` byte-stability: the output is the input with ONLY the `uuid` key inserted; body + every other front-matter byte preserved; NO whitespace normalization (incl. CRLF) — inline exact-string unit assertion (TC-FM-007), NOT a golden/integration fixture | 2 | AC-3 / RSK-1 |
| TS-5 | A doc moved/renamed (different `sourcePath`) retains its UUID — identity independent of path (ADR-0006 C-1) | 2 | AC-4 |
| TS-6 | A re-clone (fresh checkout with committed front-matter) recovers the same UUID via `readUuid` — no regeneration | 2 | AC-5 |
| TS-7 | `bun run check` (lint + format:check + typecheck + test + boundaries) exits 0; identity/binding import no tier | 0–6 | AC-6 |
| TS-8 | `DocumentId` is a branded nominal type — a bare `string` is not assignable to it (`@ts-expect-error`) | 1 | PD-4 / branding |
| TS-9 | `parseDocumentId` on a valid v7 → `ok(DocumentId)`; on a malformed value → `err({ kind: "InvalidDocumentId"; value })` (narrow domain-local error — NO union arm added) | 1 | PD-4 |
| TS-10 | `readUuid` is tolerant — absent/malformed front-matter or a malformed value → `undefined`, never throws | 2 | D-3 |
| TS-11 | `detectDuplicateUuids`: no-dup → `ok`; missing-uuid docs are NOT duplicates; a 3-way dup lists all 3 paths; mixed (1 missing + 2 sharing) names only the sharing pair | 3 | AC-1 / D-4 |
| TS-12 | `PageBinding` has exactly the 13 fields with `uuid: DocumentId` (branded); `isPageBinding` narrows structurally | 4 | D-5 |
| TS-13 | `marksync init` injects a UUID v7 into each discovered doc without one and writes the file; docs that already have a UUID are NOT rewritten (idempotent) | 5 | D-6 / RSK-5 |
| TS-14 | The CLI `init` command imports no `#domain/*` / `#infra/*`; `src/app/identity-assign.ts` imports `#domain/*` + `#app/*` only; `src/domain/identity/*` + `src/domain/binding/*` import no tier (`check:boundaries`-enforced) | 1–5 | PD-1 / PD-2 / RSK-3 |
| TS-15 | `uuid` v9+ resolves under strict ESM + `verbatimModuleSyntax`; bundled types (no `@types/uuid`) | 0 | PD-5 / RSK-6 |
| TS-16 | The orchestrator writes `injectUuid`'s bytes straight to disk (byte-stability through the init write path — no reformatting) | 5 | PD-3 / RSK-1 |
| TS-17 | **TC-SCALE-001 (NFR, PM-RECON-1 Decision D):** a 500-doc corpus with one duplicate pair → `detectDuplicateUuids` completes without error and returns `err(DuplicateUuid)`; O(n) by construction (single pass + `Map`), NO strict ms-p95 assertion | 3 | NFR (complexity) |
| TS-18 | **TC-DUP-007 (halt-signal, PM-RECON-1 Decision C):** a duplicate yields the fatal `DuplicateUuid` error, RETURNED not thrown — the halt signal a write flow gates on (zero-writes E2E deferred to E5-S1 / GH-29) | 3 | AC-1 / INV-SAFE-3 |
| TS-19 | **NFR-13 (PM-RECON-1 / Finding 7):** `uuid` is zero-dependency — the ≤20-transitive-dep budget is satisfied trivially; license/transitive audit runs via `bun run check` / CI (no separate step) | 0 | NFR-13 |

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Authoritative story | `doc/planning/milestones/MS-2/MS2-E3--safe-publish-core/MS2-E3-S1--document-identity.md` | Scope |
| Change spec (contract authority — to be created) | `./chg-GH-18-spec.md` | Spec |
| PM notes | `./chg-GH-18-pm-notes.yaml` | Orchestration |
| ADR-0006 (identity + shared-base state model) | `doc/decisions/ADR-0006-document-identity-and-shared-base-state-model.md` | Decision |
| Feature spec (safe publish) | `doc/spec/features/feature-safe-publish.md` | System doc |
| Ubiquitous language (`DocumentId`, `PageBinding`, `Document Identity`) | `doc/overview/ubiquitous-language.md` | System doc |
| Sibling plan (precedent — additive foundation, dep-cruiser nuance) | `../2026-07-08--GH-17--auth-provider/chg-GH-17-plan.md` | Plan |
| Sibling plan (union-arm / Result precedent) | `../2026-07-07--GH-15--config-system/chg-GH-15-plan.md` | Plan |
| UUID v7 generation + validation | `src/domain/identity/uuid.ts` | Code (new — D-1) |
| `DocumentId` value object + parse | `src/domain/identity/document-id.ts` | Code (new — D-2) |
| Byte-stable front-matter read/inject | `src/domain/identity/frontmatter.ts` | Code (new — D-3) |
| Fatal duplicate-UUID detector | `src/domain/identity/duplicate-detector.ts` | Code (new — D-4) |
| `PageBinding` type + identity-binding semantics | `src/domain/binding/page-binding.ts` | Code (new — D-5) |
| Application-tier UUID-assignment orchestrator | `src/app/identity-assign.ts` | Code (new — D-6) |
| `marksync init` UUID assignment wiring | `src/cli/commands/init.ts` | Code (updated — D-6) |
| Existing `DuplicateUuid` arm (consumed unchanged) | `src/domain/errors.ts` | Code (unchanged) |
| Existing `Result<T,E>` (`Result.ok`/`Result.err`) | `src/domain/result.ts` | Code (unchanged) |
| uuid unit tests | `tests/domain/identity/uuid.test.ts` | Test (new — D-7, Unit) |
| document-id unit tests | `tests/domain/identity/document-id.test.ts` | Test (new — D-7, Unit) |
| frontmatter unit tests (read/inject + inline byte-stability TC-FM-007 + re-clone TC-FM-008 + path-independence TC-FM-009) | `tests/domain/identity/frontmatter.test.ts` | Test (new — D-7, Unit) |
| duplicate-detector unit tests (INV-SAFE-3 fatal TC-DUP-001 + halt-signal TC-DUP-007 + scale smoke TC-SCALE-001) | `tests/domain/identity/duplicate-detector.test.ts` | Test (new — D-7, Unit) |
| PageBinding structural tests | `tests/domain/binding/page-binding.test.ts` | Test (new — D-7, Unit) |
| identity-assign integration tests (init UUID assignment, real file I/O via temp dirs) | `tests/integration/identity/identity-assign.test.ts` | Test (new — D-7, Integration) |
| BDD contributing scenario (DRAFT only — step defs deferred to E5-S1 / GH-29) | `tests/bdd/features/` | Test (contributed draft — D-7) |
| Coding rules (tiers, branding, Result, comments) | `.ai/rules/typescript.md` | Convention |
| Testing strategy (INV-SAFE-3 release-blocking, over-mocking guardrail) | `.ai/rules/testing-strategy.md` | Convention |
| Architecture (tier matrix, dep-cruiser rules) | `doc/overview/architecture-overview.md` | System doc |
| `uuid` dependency (RFC 9562 v7) | `package.json` → `dependencies` | Dependency (new — Phase 0) |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | plan-writer (GH-18) | Initial plan — 7 phases (0–6) derived from story `MS2-E3-S1` (7 deliverables, 6 ACs) and ADR-0006 (C-1 identity survives clones/branches/renames; C-4 duplicate fatal). **PD-1 (domain purity / `yaml` direct):** identity lives in `src/domain/identity/` which may import nothing tiered (dep-cruiser `domain→infra` / `domain→app` enforced), so `frontmatter.ts` uses the `yaml` package directly and CANNOT reuse the app-tier `parseFrontMatter` (the story's "YAML parser from E2-S2" = the `yaml` dependency, not the helper). **PD-2 (init is application-orchestrated):** `injectUuid` is a pure domain string transform; the file I/O lives in a new `src/app/identity-assign.ts`; `src/cli/commands/init.ts` delegates and imports no domain (dep-cruiser `cli→domain` enforced). **PD-3 (byte-stability via surgical insertion):** `injectUuid` does NOT round-trip front-matter through `yaml.stringify` (that would reformat the author's block); it inserts the `marksync.uuid` key with minimal text surgery — preserves the rest of the doc byte-for-byte (NO whitespace normalization). **PD-4 (narrow `DocumentIdError`, no union arm):** `parseDocumentId` returns `Result<DocumentId, DocumentIdError>` with a domain-local `DocumentIdError`; the intake-verified existing `DuplicateUuid` arm is consumed unchanged (no Phase-1 exhaustiveness churn). **PD-5 (`uuid` v9+ bundled types):** `@types/uuid` NOT required (verified). Phasing: Phase 0 installs `uuid`; Phase 1 uuid.ts + document-id.ts; Phase 2 byte-stable frontmatter.ts (load-bearing byte-stability test); Phase 3 duplicate-detector.ts (INV-SAFE-3 fatal test — deliverable 7); Phase 4 PageBinding type; Phase 5 init UUID assignment; Phase 6 boundaries + version bump `0.3.0 → 0.4.0` + `bun run check` green. Out of scope: lock persistence (E3-S2), drift (E3-S5), the Confluence write (E3-S4/E3-S6). `version_impact: minor` defaulted from the GH-15/GH-16/GH-17 precedent (open question). Note: the change spec `chg-GH-18-spec.md` is not yet authored at plan time; this plan operationalizes the authoritative story + intake verification and will be reconciled if the spec diverges. |
| 1.1 | 2026-07-09 | plan-writer (GH-18) | **iter-2 — PM-RECON-1 reconciliation** (DoR iter-1 Findings 3, 4, 5, 7). Brought the plan into compliance with the authoritative spec/test-plan reconciliation decisions. **Decision E / Finding 5 (namespace):** renamed this plan's `DEC-1..DEC-5` → `PD-1..PD-5` (Plan Decisions) throughout to avoid colliding with the spec's `DEC-#` namespace (the line-770 reference to the prior plans' throw→INTERNAL pattern was reworded to `GH-15/GH-16/GH-17 precedent` to remove the ambiguity). **Decision C / Finding 3 (test layout + tiers):** realigned all test paths/tiers to the authoritative layout — Unit tests now live at `tests/domain/...` (not `tests/unit/domain/...`): `tests/domain/identity/{uuid,document-id,frontmatter,duplicate-detector}.test.ts` + `tests/domain/binding/page-binding.test.ts`; the init UUID-assignment test moved to `tests/integration/identity/identity-assign.test.ts` (Integration, real file I/O via OS temp dirs — was Unit with an in-memory sink). Folded the former `tests/integration/identity-frontmatter.test.ts` INTO `frontmatter.test.ts` as inline exact-string unit assertions (TC-FM-007 byte-stability, TC-FM-008 re-clone, TC-FM-009 path-independence) — NO separate `tests/golden/` fixture and NO integration file. Folded TC-DUP-007 (halt-signal) INTO `duplicate-detector.test.ts` (no separate integration file; GH-18 has no write path → zero-writes E2E deferred to E5-S1 / GH-29). Removed the separate `tests/unit/app/identity-assign.test.ts` and the `tests/unit/cli/commands/init.test.ts` extension (consolidated into the single integration test). Simplified the orchestrator to real `node:fs/promises` (dropped the injectable sink). A BDD contributing scenario is a DRAFT under `tests/bdd/features/` only (step defs out of scope — E5-S1 / GH-29). **Decision G / Finding 4 (TC-ID integrity):** the 500-doc scale test is `TC-SCALE-001` (NOT `TC-DUP-006`); TC-DUP-006 stays the error-arm regression owned by the test-plan. **Decision D (scale):** TC-SCALE-001 asserts O(n) by construction + a coarse "completes on 500 docs without error" smoke; NO strict ms-p95 assertion (CI-flaky; scale demoted to an NFR). **Decision B (collision reporting):** confirmed first-collision-only (a single `DuplicateUuid` error carrying one uuid + its paths) — explicit note added to Phase 3. **Decision A (parseDocumentId):** PD-4 substance unchanged and confirmed AUTHORITATIVE (`Result<DocumentId, DocumentIdError>`, narrow domain-local type, NOT a `MarkSyncError` arm); the spec is being reconciled to match. **Finding 7 (NFR-13):** added a note that `uuid` is zero-dependency so the ≤20-transitive-dep budget is satisfied trivially; license/transitive audit runs via `bun run check` / CI (no separate step). Test Scenarios table gained TS-17 (scale), TS-18 (halt-signal), TS-19 (NFR-13); Artifacts + Execution Log realigned to the new paths/tiers. No phase added/removed; no PD-1..PD-5 substance changed except PD-4's confirmatory annotation. |

## Execution Log

<!-- Populated during delivery (lifecycle phase 6, @coder). One row per phase. -->

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| 0 | ✅ DONE | 2026-07-09 | 2026-07-09 | _pending_ | `bun add uuid` → resolved `uuid@14.0.1` (v9+, bundled types, no `@types/uuid`); `typecheck` exit 0; `check:boundaries` exit 0 (34 modules, 40 deps); `rg '"uuid"' src/` empty. NFR-13 trivially satisfied (zero transitive deps). |
| 1 | pending | — | — | — | uuid.ts (generation + assert) + document-id.ts (branded VO + parse) + unit tests |
| 2 | pending | — | — | — | frontmatter.ts (byte-stable read/inject, idempotent) + unit tests (byte-stability inline TC-FM-007; NO integration/golden file) |
| 3 | pending | — | — | — | duplicate-detector.ts (INV-SAFE-3 fatal, first-collision-only) + unit tests (TC-DUP-001 fatal, TC-DUP-007 halt-signal, TC-SCALE-001 scale smoke) |
| 4 | pending | — | — | — | page-binding.ts (PageBinding type + identity-binding semantics) + structural tests |
| 5 | pending | — | — | — | identity-assign.ts (app orchestrator, real fs) + init.ts UUID-assignment wiring + integration test (temp dirs) |
| 6 | pending | — | — | — | boundaries verification + version bump (0.3.0 → 0.4.0) + `bun run check` green |
