---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-92-test-plan
status: Proposed
created: 2026-08-15
last_updated: 2026-08-15
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0003, feature, priority:critical, reverse-conversion, E1]
version_impact: minor
summary: "Test plan for the reverse converter (Storage Format → Markdown): golden round-trip harness over the partitioned 33-fixture corpus (corpus A byte-equality via normalize, corpus B explicit expectations), Storage-only read-back fixtures (panel strip, render-policy artifact, K1 variants), a Storage-side adversarial set mirroring the GH-31 taxonomy, normalizer fixed-point properties, and diagnostic-model unit tests. Golden fixture + golden adversarial + unit tiers only — no adapter/network surface (spec §8.1/NG-5)."
links:
  change_spec: ./chg-GH-92-spec.md
  implementation_plan: ./chg-GH-92-plan.md # to be created in phase 4 (delivery_planning)
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS3-E1-S1] Reverse converter — Confluence Storage Format → Markdown (canonical GFM subset, deterministic)

## 1. Scope and Objectives

This test plan validates the reverse converter — Confluence Storage Format → canonical Markdown — and its verification harness. The core behaviors to protect: (1) **100% round-trip fidelity** on canonical fixtures (`reverse(forward(md)) === normalize(md)` byte-wise, NFR-1); (2) **determinism** of reverse output in-process and across runs (NFR-2); (3) **marksync-structure handling on read-back** — provenance panel stripped, mermaid code macro unwrapped, render-policy synthetic images classified informationally, K1 attributes ignored (F-3); (4) **C-4 diagnostics** — every non-canonical Storage construct blocks with a stable code + construct identity + Storage location, never silently dropped (F-4, PM-DEC-1); (5) the **canonical normalizer's** determinism, idempotence, and fixed-point properties (F-5, DEC-3); (6) the **library-only boundary** — zero CLI surface, forward pipeline and its 33 golden pairs byte-unchanged (F-6, NG-1/NG-3).

The central design risk this plan guards against is **self-reference**: the round-trip AC compares the reverse converter against a normalizer that shares its canonical-form definition (RSK-1) — if either side is "fixed" to satisfy the other, the AC becomes vacuous. The countermeasures are structural: one normative form (spec Appendix B) binds both, the fixed-point properties are asserted independently (AC-F5-1), corpus-B fixtures pin **explicit expected bytes** rather than derived equality, and the forward golden suite stays green unmodified as the regression tripwire. Secondary risks: real read-back Storage drifting beyond the K1 evidence (RSK-2), and forward/reverse mirror divergence as the subset evolves (RSK-6) — both mitigated by directory-driven harnesses that fail CI on any unpartitioned fixture or subset expansion (AC-F2-1).

### 1.1 In Scope

- Golden-tier **round-trip harness** over the existing 33-pair corpus, partitioned per spec DEC-7/DM-4: corpus A (26 canonical fixtures — byte-equality), corpus B (7 annotation/defensive fixtures — explicit expectations), plus a committed partition manifest whose completeness is asserted (AC-F2-1's mechanical guardrail)
- **Storage-only reverse fixtures**: existing `provenance-panel.storage.xhtml` (panel strip) and `mermaid-render-policy.storage.xhtml` (synthetic artifact); NEW K1 attribute variants of macro-bearing canonical fixtures and one realistic combined read-back fixture (AC-F3-1, AC-F3-3)
- **Mermaid code-macro unwrap** fidelity — fence bytes identical to CDATA content (AC-F3-2)
- **Storage-side adversarial set** (new fixtures under `tests/adversarial-storage/`, runner under `tests/golden/adversarial/`) mirroring the GH-31 category taxonomy, regression-locking reverse diagnostics incl. fast-fail/collect-all parity (AC-F4-1)
- **Diagnostic model** unit tests: two-class taxonomy (DEC-1), stable codes, location payload shape, no content echoes (DM-2, NFR-5), malformed-Storage parse-error arm (NFR-4)
- **Normalizer** property tests: deterministic, idempotent, canonical output is a fixed point (AC-F5-1, DM-3)
- **Determinism**: convert-twice in-process + committed-snapshot across-run lock (AC-F1-2, NFR-2)
- **Regression boundary**: all existing tiers green, 33 forward golden pairs unmodified, 0 CLI surface delta (AC-F6-1)

### 1.2 Out of Scope & Known Gaps

- No CLI testing of any kind — no command, flag, output envelope, exit code (NG-1, PM-DEC-2); the contract is library-level (DM-1)
- No `resolve`/`import` flow tests — no diffing, patching, lock/state writes, Git operations (NG-2; E2/E3 scope)
- No modification to the forward converter, its fixtures, or its committed output (NG-3) — the existing `storage-renderer.test.ts` suite runs **unmodified** as the tripwire
- No integration / e2e-mock / e2e-live scenarios — the converter performs zero I/O (NG-5, spec §8.1); those tiers run unchanged as regression signal only
- No canonical-subset expansion testing (NG-6) — the harness must *fail* on unaccompanied expansion, not support it silently
- No BDD scenarios — lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) are untouched by a pure conversion function
- No Mermaid-DOM rendering — the render-policy artifact is *parsed as data* (image → diagnostic), never rendered
- Performance is **informational only** (NFR-3 ≤ 200 ms p95 per page) — timings recorded in the round-trip runner; no hard CI gate beyond a generous sanity ceiling (see §8.3 OQ-T3)
- No partial/suppressed-construct conversion mode (spec §7.3, DEC-2 deferred)

## 2. References

- Change specification: `chg-GH-92-spec.md` (authoritative for AC/F/DM/NFR/DEC IDs; §17 ACs, Appendix A construct mirror, Appendix B canonical emission form, DEC-1..DEC-7)
- Ticket: GitHub issue GH-92 (scope authority with PDR-0002)
- PM notes: `chg-GH-92-pm-notes.yaml` (PM-DEC-1 diagnostics in scope; PM-DEC-2 no CLI; watch items all resolved in-spec)
- Implementation plan: `chg-GH-92-plan.md` — pending (phase 4); this plan pins test-side mechanics, module paths track the plan's naming (spec DEC-4 latitude)
- Testing strategy: `.ai/rules/testing-strategy.md` (tiers, golden snapshot rules, over-mocking guardrail, `mock.module` ban per GH-103, CI wiring)
- TypeScript conventions: `.ai/rules/typescript.md` (test placement mirrors `src/`, `#`-aliases in tests, no `any` in helpers)
- ADR-0005 (canonical GFM subset, Storage target, spike K1 read-back normalizations), ADR-0002 (C-1 determinism posture), PDR-0002 (E1 scope, C-4 never-silently-dropped), TDR-0004 (runner + test-design guardrail)
- Forward implementation (consumed as-is): `src/infra/confluence/render/storage.ts` (visitor), `src/infra/confluence/provenance.ts` (`PROVENANCE_PANEL_MARKER`), `src/domain/markdown/parse.ts`, `src/domain/markdown/unsupported.ts` (`findUnsupported`/`findAllUnsupported` parity precedent), `src/domain/mermaid/transform.ts`
- Golden runner pattern: `tests/golden/markdown/storage-renderer.test.ts` (fixture loading, error-sidecar branching, byte + snapshot double pinning)
- Adversarial runner pattern: `tests/golden/adversarial/classification-runner.test.ts` (fidelity / no-silent-drop / drift-stability over sidecar-pinned fixtures; GH-31)
- Precedent plans: `chg-GH-31-test-plan.md` (adversarial tier conventions), `chg-GH-103-test-plan.md` (tier-applicability table, guard-test self-test pattern, `mock.module` ban)

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Corpus-A round-trip: `reverse(forward(md)) === normalize(md)` byte-wise, 100% of canonical fixtures (h1–h6, paragraph, strong/em/nested emphasis, strikethrough, inline code, fenced code with language, plain/query-amp links, remote/attachment images, unordered/ordered/nested lists, task lists, tables, blockquote, hr, kitchensink, mermaid code-policy) — 0 mismatches | TC-RT-001, TC-RT-002 (corpus-B arm) | Covered |
| AC-F1-2 | Determinism: same Storage converted twice in a run and across separate runs → byte-identical (0 nondeterminism sources) | TC-RT-003, TC-RT-004, TC-RADV-002 | Covered |
| AC-F2-1 | Guardrail automation: any fixture added or subset expanded is automatically included — a failing/unincluded expansion fails CI | TC-RT-005 | Covered |
| AC-F3-1 | Provenance panel (marker-identified `ac:name="info"` macro, incl. the committed fixture form) → 0 panel content, 0 wrapper elements, 0 marker traces, no blocking diagnostic | TC-RT-006 | Covered |
| AC-F3-2 | `language=mermaid` code macro with CDATA body → ```mermaid fence with source bytes identical to CDATA content, 0 macro-wrapper artifacts | TC-RT-007 (plus corpus-A `code-block-mermaid` / `mermaid-code-policy` under TC-RT-001) | Covered |
| AC-F3-3 | K1 attribute variants (`ac:schema-version`/`ac:macro-id`) → conversion succeeds, output identical to attr-free variant, no diagnostic, attrs never in output | TC-RT-008 | Covered |
| AC-F4-1 | Storage-side adversarial set → per-fixture blocking `unsupported-construct` diagnostic (stable code + construct identity + Storage location sufficient to locate the element), never silently dropped, never content; collect-all lists every instance with identical per-instance verdicts | TC-RADV-001, TC-RADV-002, TC-RDIAG-001, TC-RDIAG-002 | Covered |
| AC-F4-2 | `ac:image` + `ri:filename="marksync-mermaid-<hash>.svg"` (alt "Mermaid diagram") → informational `marksync-synthetic-artifact` diagnostic, image not emitted as content, conversion not blocked | TC-RT-009, TC-RDIAG-004 | Covered |
| AC-F5-1 | Normalizer deterministic + idempotent (`N(N(md)) === N(md)`); canonical Storage → `N(reverse(storage)) === reverse(storage)` (fixed point) | TC-NORM-001, TC-NORM-002 | Covered |
| AC-F6-1 | 0 new commands/flags/output changes; all existing tiers green; 33 forward golden pairs pass unmodified | TC-REG-001 | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No API or EVT surface exists in this change (spec §8.1/§8.2: N/A — no HTTP, no CLI, no events). Data-model elements:

| ID | Description | TC ID(s) | Status |
|----|-------------|----------|--------|
| DM-1 | Reverse conversion contract (library-level): Storage string in → canonical Markdown + informational diagnostics out; blocking diagnostics and parse errors as error arms; fast-fail + collect-all parity | TC-RT-001..009 (success/informational arms), TC-RDIAG-002/003 (error arms, parity) | Covered |
| DM-2 | Reverse diagnostic model: `unsupported-construct` (blocking) + `marksync-synthetic-artifact` (informational), each with stable per-class code, construct identity, Storage location; no content echoes | TC-RDIAG-001, TC-RDIAG-002, TC-RDIAG-004, TC-RADV-001 | Covered |
| DM-3 | Canonical Markdown emission form (normative, spec Appendix B) shared by serializer and normalizer | TC-NORM-001, TC-NORM-002, TC-RT-001 | Covered |
| DM-4 | Round-trip corpus partition (corpus A / corpus B / Storage-only / adversarial) as committed manifest | TC-RT-005 (manifest completeness), §6.2 (inventory) | Covered |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status / Notes |
|--------|-------------|----------|----------------|
| NFR-1 | Round-trip fidelity (reverse direction, extends NFR-REL-4): 100% of corpus A, 0 mismatches, re-runs on every subset expansion | TC-RT-001, TC-RT-005 | Covered — equality is byte-wise; the manifest guardrail is the expansion lock |
| NFR-2 | Determinism: byte-identical across repeated in-process conversions and separate runs; 0 timestamps/UUIDs/iteration-order effects | TC-RT-003, TC-RT-004, TC-RADV-002 | Covered |
| NFR-3 | Conversion performance ≤ 200 ms p95 per page (informational) | TC-RT-001 (step 5 — timings recorded; sanity ceiling, see OQ-T3) | Covered (informational by design) |
| NFR-4 | Parsing robustness: standards-based parser (0 regex extraction), entity unescaping + CDATA (incl. split `]]>`) correct on all corpus fixtures; malformed Storage → stable parse error, never crash | TC-RPARSE-001, TC-RDIAG-003; harness-wide via TC-RT-001 (real parser on every fixture) | Covered |
| NFR-5 | Converter safety: parsed content never executed, 0 network calls, 0 egress; diagnostics carry codes/locations, not content echoes | TC-RDIAG-001 (payload shape), §7.3 guardrail note (structural: pure functions, no fetch — `bun run check` green without network) | Covered |

## 4. Test Types and Layers

Tier assignments follow the spec AC tier column and `.ai/rules/testing-strategy.md`:

| Tier | Applies? | Role in this change |
|------|----------|---------------------|
| Unit | **Directly** | Normalizer properties (idempotence, determinism), diagnostic model (classes, codes, location payload, parity, malformed arm), Storage-parse substrate specifics (entities, CDATA incl. split `]]>`, namespaced elements) |
| Integration | **Not applicable** (regression only) | No adapter boundary is touched — the converter's input is a Storage string, zero I/O (spec §8.1/NG-5). Existing integration suite runs unmodified as green-tree signal |
| Golden fixture | **Directly** | Round-trip harness (corpus A/B), Storage-only read-back fixtures, determinism locks, partition-manifest guardrail, normalizer fixed point over the corpus |
| Golden adversarial | **Directly** | Storage-side adversarial set (extends the GH-31 taxonomy to Storage inputs): classification fidelity vs sidecars, no-silent-drop, collect-all parity, determinism |
| Mermaid-DOM | **Not applicable** (regression only) | Render-policy artifacts are parsed as data (image → informational diagnostic); no diagram is rendered on reverse |
| Gherkin / BDD | **Not applicable** (regression only) | Lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) are untouched by a pure conversion function; runs via `bun run test:bdd` unchanged |
| E2E (mock) | **Not applicable** (regression only) | No sync-pipeline surface; the `e2e-mock` CI job must stay green unmodified |
| E2E (live-sandbox) | **Not applicable** | No network behavior to validate; separate opt-in gate, unchanged |

**Explicit statement (per spec §8.1/NG-5):** no integration or e2e tier applies to this change — there is no adapter, network, or CLI surface. Everything new lives in the unit, golden-fixture, and golden-adversarial tiers; all other tiers are the unchanged regression net asserted green by TC-REG-001.

### 4.1 Unit Tests

- **Framework**: `bun:test` (TDR-0004)
- **Root/pattern**: `tests/unit/**/*.test.ts`, mirroring `src/` layout (`.ai/rules/typescript.md` residence rules)
- **Files** (paths track the plan's final module naming — spec DEC-4 latitude; these are the defaults under the mirror layout):
  - `tests/unit/domain/markdown/normalize.test.ts` — TC-NORM-001 (deterministic, idempotent over corpus fixtures)
  - `tests/unit/domain/markdown/reverse-diagnostics.test.ts` — TC-RDIAG-001/002/004 (diagnostic shape, parity, informational class)
  - `tests/unit/infra/confluence/parse/reverse-parser.test.ts` — TC-RPARSE-001, TC-RDIAG-003 (entities, CDATA, namespaces; malformed → stable parse error)
- **Conventions**: `#`-prefixed import aliases; hand-built minimal Storage/HAST inputs where fixture files would be overkill; no `any` in helpers

### 4.2 Golden Fixture Tests

- **Framework**: `bun:test` with the real pipeline — `parseMarkdown`, `mdastToHast`, `renderStorage`, and the new `reverse` / `normalize` entry points. **No mocks** (TDR-0004 guardrail; see §7.3)
- **Root**: `tests/golden/markdown/`
- **Files**:
  - `reverse-round-trip.test.ts` — TC-RT-001..005, TC-NORM-002 (corpus A/B, determinism, guardrail, fixed point)
  - `reverse-readback.test.ts` — TC-RT-006..009 (panel strip, mermaid unwrap, K1 tolerance, render-policy artifact — the Storage-only fixture set)
- **Fixture layout** (full inventory in §6.2):
  - Existing corpus untouched: `tests/golden/fixtures/markdown/*.md` + `*.storage.xhtml` (33 pairs) + 2 `*.unsupported.txt` sidecars
  - NEW Storage-only fixtures added to the same dir (no `.md` twin → invisible to the forward loader, which globs `*.md`): `code-block-python-k1.storage.xhtml`, `mermaid-code-policy-k1.storage.xhtml`, `readback-realistic.storage.xhtml`
  - NEW committed partition manifest: `tests/golden/fixtures/markdown/round-trip-partition.json`
  - NEW reverse-expectation sidecars in a **subdirectory** `tests/golden/fixtures/markdown/reverse/` (`<name>.md` = expected reverse Markdown, `<name>.json` = expected diagnostics array where non-empty) — a subdirectory keeps every expectation file invisible to the forward suite's `readdirSync(...).filter(f => f.endsWith(".md"))` loader, honoring NG-3 without touching it
- **Snapshot rules**: corpus-A reverse outputs additionally pinned with `toMatchSnapshot` (the across-run determinism lock, TC-RT-004); updates only via explicit reviewed `bun test --update-snapshots`, never in CI; Bun version pinned per strategy

### 4.3 Golden Adversarial Tests

- **Framework**: `bun:test`, real pipeline (mirror of `tests/golden/adversarial/classification-runner.test.ts`, GH-31)
- **Runner**: `tests/golden/adversarial/reverse-classification-runner.test.ts` — TC-RADV-001/002, golden-side execution of TC-RDIAG-002's multi-instance parity
- **Fixtures**: NEW `tests/adversarial-storage/*.storage.xhtml` + `*.classification.json` sidecars (runners under `tests/golden/`, fixtures at top level beside `tests/adversarial/` — the GH-31 DEC-5 runner/fixture split, relocated per plan PD-5: a subdirectory of `tests/adversarial/` would crash the pii-audit directory walk with EISDIR)
- **Sidecar schema**: an array of expected blocking diagnostics (`{ code, construct, location }` per instance) — OR the object `{ "parseError": true }` for the malformed-Storage fixture, asserting the distinct parse-error arm

### 4.4 Harness Mechanics (normative for the implementation)

**Round-trip byte equality (TC-RT-001)** — spec Flow 1, executed per corpus-A fixture:

```
md       = read(`${name}.md`)
forward  = renderStorage(mdastToHast(parseMarkdown(md))).value.body   // real pipeline, in-memory
result   = reverse(forward)                                          // DM-1 contract
expected = normalize(md)                                             // forward parse stage → canonical serializer
expect(result.ok).toBe(true)
expect(result.value.markdown).toBe(expected)           // byte-wise — 0 diff tolerance
expect(result.value.markdown).toMatchSnapshot(`${name}.reverse`)
expect(result.value.markdown).not.toMatch(/<(ac|ri):/)  // better failure message than raw equality
```

The forward output is rendered in-memory per spec Flow 1; its byte-stability against the committed `.storage.xhtml` goldens remains enforced by the **unmodified** `storage-renderer.test.ts` (NG-3 tripwire) — the round-trip harness does not duplicate that assertion.

**Determinism, in-process (TC-RT-003)**: for every corpus-A fixture and every Storage-only fixture, convert the same Storage twice in one process; assert the two `result.value` objects are deep-equal (Markdown bytes **and** diagnostic arrays identical). Mirrors TC-MERM-002 / TC-ADVERSARIAL-006 precedent; ×2 matches AC-F1-2's "converted twice within a run" exactly.

**Determinism, across runs (TC-RT-004)**: the committed `toMatchSnapshot` layer — reverse outputs snapshotted in run N (locally, reviewed) must byte-match in run N+1, on CI's ubuntu runner, on every push. Any cross-run/cross-machine nondeterminism breaks the committed snapshot; re-baselining is an explicit reviewed action per strategy snapshot rules. This is the across-run proof AC-F1-2 requires, achievable without a CLI entry point (PM-DEC-2 forbids one; a subprocess-spawn test would need one).

**Fast-fail / collect-all parity (TC-RDIAG-002, TC-RADV-001)** — for each adversarial fixture with N ≥ 1 unsupported instances:

```
first = reverseFastFail(storage)        // error arm: first blocking diagnostic
all   = reverseCollectAll(storage)      // enumeration: every instance, same per-instance verdicts
expect(all.diagnostics[0]).toEqual(first.error)   // parity — identical verdict, first instance
expect(all.diagnostics).toHaveLength(N)           // exhaustive — no truncation
// per-instance stability: same code + construct + location shape in both modes
```

**Guardrail auto-inclusion (TC-RT-005)** — the harness is directory-driven, never a hand-listed fixture array:

```
manifest    = read("round-trip-partition.json")   // { corpusA[], corpusB[], storageOnly[], excluded[]{name,reason} }
discoveredMd          = glob("*.md")              // 33 today
discoveredStorageOnly = orphan "*.storage.xhtml"  // no .md twin
expect(symmetricDifference(discoveredMd, A ∪ B ∪ excluded)).toBeEmpty()
expect(symmetricDifference(discoveredStorageOnly, manifest.storageOnly)).toBeEmpty()
```

A fixture dropped into the directory without a manifest entry fails CI with an instructive message ("classify me: A, B, storageOnly, or excluded+reason") — adding a fixture or expanding the subset without 100% pass cannot be silently skipped (AC-F2-1).

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage | Test Type |
|-------|-------|------|-------|----------|-------------|-----------|
| TC-RT-001 | Corpus-A round-trip: byte equality `reverse(forward(md)) === normalize(md)` — 26/26 | Happy Path | Critical | High | AC-F1-1, NFR-1, NFR-3 | Golden |
| TC-RT-002 | Corpus-B explicit reverse expectations (annotation/defensive fixtures) | Edge Case | Important | High | AC-F1-1 (corpus-B arm), DM-4 | Golden |
| TC-RT-003 | Reverse determinism in-process (convert twice, deep-equal) | Corner Case | Critical | High | AC-F1-2, NFR-2 | Golden |
| TC-RT-004 | Reverse determinism across runs (committed snapshot layer) | Corner Case | Critical | High | AC-F1-2, NFR-2 | Golden |
| TC-RT-005 | Partition-manifest completeness — guardrail auto-inclusion | Regression | Critical | High | AC-F2-1, DM-4, NFR-1 | Golden |
| TC-RT-006 | Provenance-panel strip on read-back (0 content, 0 wrapper, 0 marker, 0 diagnostics) | Happy Path | Critical | High | AC-F3-1, DEC-6 | Golden |
| TC-RT-007 | Mermaid code-macro unwrap: fence bytes identical to CDATA, 0 wrapper artifacts | Happy Path | Critical | High | AC-F3-2 | Golden |
| TC-RT-008 | K1 attribute tolerance: output identical to attr-free variant, 0 diagnostics | Happy Path | Critical | High | AC-F3-3, NFR-4 | Golden |
| TC-RT-009 | Render-policy synthetic image: informational diagnostic, not content, not blocking | Edge Case | Critical | High | AC-F4-2, DEC-1 | Golden |
| TC-NORM-001 | Normalizer properties: deterministic + idempotent on all corpus fixtures | Happy Path | Critical | High | AC-F5-1, DM-3 | Unit |
| TC-NORM-002 | Canonical fixed point: `N(reverse(storage)) === reverse(storage)` over corpus A | Corner Case | Critical | High | AC-F5-1, DM-3, RSK-1 | Golden |
| TC-RDIAG-001 | Blocking diagnostic shape: stable code + construct identity + location; no content echo | Negative | Critical | High | AC-F4-1, DM-2, NFR-5 | Unit |
| TC-RDIAG-002 | Fast-fail / collect-all parity + exhaustive multi-instance enumeration | Negative | Critical | High | AC-F4-1, DEC-2 | Unit + Golden adversarial |
| TC-RDIAG-003 | Malformed Storage → stable parse-error arm, never a crash | Negative | Critical | High | AC-F4-1 (error-arm clause), NFR-4 | Unit |
| TC-RDIAG-004 | Informational `marksync-synthetic-artifact` reported alongside successful conversion | Happy Path | Important | High | AC-F4-2, DEC-1, DM-2 | Unit |
| TC-RPARSE-001 | Storage parse substrate: XML entities, CDATA incl. split `]]>`, `ac:`/`ri:` namespaces | Edge Case | Important | High | NFR-4, F-1 | Unit |
| TC-RADV-001 | Storage-side adversarial classification equals sidecars (no silent drop, never content) | Negative | Critical | High | AC-F4-1, DM-2 | Golden adversarial |
| TC-RADV-002 | Adversarial determinism: classify + convert twice → byte-identical | Corner Case | Important | High | AC-F1-2, NFR-2 | Golden adversarial |
| TC-REG-001 | Library-only boundary: 0 CLI delta, forward fixtures unmodified, all tiers green | Regression | Critical | High | AC-F6-1, F-6 | CI + Manual (structural) |

### 5.2 Scenario Details

#### TC-RT-001 - Corpus-A round-trip: byte equality, 26/26 fixtures

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-5, AC-F1-1, NFR-1, NFR-3, DM-3, G-2
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-round-trip.test.ts`
**Tags**: @backend, @golden, @fidelity

**Preconditions**:

- `reverse` (DM-1) and `normalize` (F-5) entry points exported from the new modules
- The 26 corpus-A fixtures present and listed in `round-trip-partition.json` (§6.2)

**Steps**:

1. Load the partition manifest; iterate every corpus-A fixture (26 — one per canonical construct family per AC-F1-1's enumeration)
2. For each: render Storage via the real forward pipeline (`parseMarkdown` → `mdastToHast` → `renderStorage`), in-memory
3. Convert back via `reverse(forwardBody)` — the DM-1 contract including internal panel strip / K1 tolerance (no harness-side preprocessing)
4. Compute `normalize(fixture.md)` — forward parse stage (incl. annotation stripping) then canonical-form serialization (spec Appendix B)
5. Assert `result.value.markdown === expected` **byte-wise**; record per-fixture conversion duration and report corpus p95 against the NFR-3 informational ceiling

**Expected Outcome**:

- 26/26 fixtures byte-equal — 0 mismatches (NFR-1)
- Reverse output contains zero `<ac:` / `<ri:` substrings across the whole corpus (0 wrapper artifacts)
- Reported p95 per-page conversion time ≤ 200 ms on the corpus (informational; see OQ-T3)

**Notes / Clarifications**:

- The committed forward goldens' byte-stability is enforced by the unmodified `storage-renderer.test.ts` — this harness uses the in-memory forward output per spec Flow 1 and does not re-assert the committed `.storage.xhtml` files
- The `code-block-mermaid` and `mermaid-code-policy` fixtures exercise the mermaid unwrap inside the corpus loop; TC-RT-007 adds the byte-level CDATA assertions on top

---

#### TC-RT-002 - Corpus-B explicit reverse expectations (annotation/defensive fixtures)

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-2, F-5, AC-F1-1 (corpus-B arm), DEC-6, DEC-7, DM-4
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-round-trip.test.ts`; expectations in `tests/golden/fixtures/markdown/reverse/<name>.md` (+ `<name>.json` where diagnostics are expected)
**Tags**: @backend, @golden, @annotations

**Preconditions**:

- The 6 corpus-B fixtures with reverse expectations (§6.2) have committed `.reverse.md` sidecars (empty file permitted — e.g. `mixed-html-comment`), generated once by running reverse and then **human-reviewed** (see risk R-TST-2 on self-referential pinning)

**Steps**:

1. For each corpus-B fixture (except `raw-html-block-real`, which is manifest-excluded as forward-only): read the committed Storage side (`.storage.xhtml`), run `reverse`, and compare the Markdown output byte-wise to `reverse/<name>.md`
2. Where a `reverse/<name>.json` exists, deep-compare emitted diagnostics; where absent, assert 0 diagnostics
3. Assert specifically per fixture class:
   - `frontmatter`, `html-comment-block`, `link-ref-comment`: output equals the canonical body; **no** front-matter / comment / reference-definition is ever synthesized (DEC-6 — reverse never invents metadata)
   - `html-comment-inline`: output pins the exact serializer bytes for the double-space text form (pinned, not derived — this is why the fixture is corpus B)
   - `raw-html-inline-real`: output pins the canonical escaping of literal `<b>`/`</b>` text; raw HTML is never emitted
   - `mixed-html-comment`: empty Storage → empty Markdown, 0 diagnostics

**Expected Outcome**:

- Every corpus-B fixture's reverse output byte-matches its committed explicit expectation; diagnostics match sidecars exactly
- Annotations are never re-synthesized; the corpus-B fixtures never assert round-trip equality (DEC-7 — forcing them into corpus A would mandate a weakened normalizer)

---

#### TC-RT-003 - Reverse determinism in-process (convert twice)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-2, NFR-2, G-1
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-round-trip.test.ts`
**Tags**: @backend, @golden, @determinism

**Preconditions**:

- Reverse pipeline callable on arbitrary Storage strings

**Steps**:

1. For every corpus-A fixture and every Storage-only fixture (committed `.storage.xhtml` used directly as input here): convert the identical Storage string twice within the test process
2. Deep-compare the two results — Markdown bytes and diagnostic arrays
3. Assert `expect(out1).toEqual(out2)` and `expect(out1.markdown).toBe(out2.markdown)`

**Expected Outcome**:

- All double conversions byte-identical — 0 nondeterminism sources (no timestamps, no UUIDs, no map-iteration-order effects) in-process

---

#### TC-RT-004 - Reverse determinism across runs (committed snapshot layer)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-2, NFR-2
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-round-trip.test.ts`; snapshots in `tests/golden/markdown/__snapshots__/` (generated; committed)
**Tags**: @backend, @golden, @determinism, @ci

**Preconditions**:

- Corpus-A reverse outputs snapshotted (decision D-TST-1, §7.1) in an initial reviewed run

**Steps**:

1. Every corpus-A conversion in TC-RT-001 additionally asserts `toMatchSnapshot(`${name}.reverse`)`
2. CI (fast loop, every push) re-executes on a different machine/run than the snapshot baseline — a mismatch fails the suite
3. Verify `--update-snapshots` never appears in any CI invocation (strategy snapshot rule); re-baselining is a reviewed local action only

**Expected Outcome**:

- Committed snapshots byte-match reverse output on every subsequent run and environment — the across-run clause of AC-F1-2 enforced mechanically, without a CLI entry point (PM-DEC-2 forbids the subprocess alternative)
- Snapshot files are PR-reviewable renditions of the canonical emission form (secondary benefit: reviewers see the canonical Markdown in diffs)

---

#### TC-RT-005 - Partition-manifest completeness (guardrail auto-inclusion)

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-1, DM-4, NFR-1, RSK-6
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-round-trip.test.ts`; manifest `tests/golden/fixtures/markdown/round-trip-partition.json`
**Tags**: @backend, @golden, @guardrail

**Preconditions**:

- Manifest committed with `corpusA` (26), `corpusB` (7), `storageOnly` (5), `excluded` (1: `raw-html-block-real`, reason: forward-error fixture, no Storage form)

**Steps**:

1. Discover all `*.md` files in the fixtures dir (33 today); assert the symmetric difference between discovery and `corpusA ∪ corpusB ∪ excluded-names` is empty
2. Discover orphan `*.storage.xhtml` files (no `.md` twin — 5 today: the 2 existing Storage-only + 3 new); assert the symmetric difference with `manifest.storageOnly` is empty
3. Assert every `excluded` entry carries a non-empty reason
4. Negative self-test (GH-103 TC-GUARD-002 pattern): feed the completeness helper an unlisted fixture name and assert it **fails** — proving the guardrail detects, not just passes

**Expected Outcome**:

- No fixture can exist outside the harness: any added fixture (or subset-expansion fixture) that is unpartitioned or failing breaks CI — AC-F2-1's "mechanically enforcing" clause
- Classification of a new fixture is a conscious, reviewed manifest edit (mirrors the strategy's explicit-snapshot-update discipline)

---

#### TC-RT-006 - Provenance-panel strip on read-back

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, DEC-6, NFR-5 (panel carries Git metadata — stripped pre-conversion)
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-readback.test.ts`; fixtures `provenance-panel.storage.xhtml` + `readback-realistic.storage.xhtml`
**Tags**: @backend, @golden, @provenance

**Preconditions**:

- `provenance-panel.storage.xhtml` (existing — info macro with `<!-- marksync:provenance-panel -->` marker, Source/Git-revision/Last-sync body) and `readback-realistic.storage.xhtml` (new — canonical body + K1 attrs + appended panel) committed

**Steps**:

1. Convert `provenance-panel.storage.xhtml` alone: assert `result.ok === true`; output is empty Markdown; diagnostics array is empty (DEC-6 — strip is silent)
2. Convert `readback-realistic.storage.xhtml`: assert output byte-equals `normalize(kitchensink.md)` (panel appended after the body changes nothing); 0 diagnostics
3. In both outputs assert: 0 occurrences of the marker string, `ac:structured-macro`, `ac:rich-text-body`, `Source:`, `Git revision:`, `Last sync:` (no panel prose leakage)
4. Edge boundary: an `ac:name="info"` macro **without** the marker must NOT be stripped — covered adversarially by `storage-macro-info-no-marker` (TC-RADV-001); this test asserts the positive strip only

**Expected Outcome**:

- Panel content, wrapper elements, and marker traces: 0 in output; no blocking diagnostic; Git metadata (SHA/branch/timestamp) never flows into reverse-converted Markdown (spec §20)

---

#### TC-RT-007 - Mermaid code-macro unwrap: fence bytes identical to CDATA

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-3, AC-F3-2
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-readback.test.ts`; fixtures `mermaid-code-policy.storage.xhtml`, `code-block-mermaid.storage.xhtml`, `mermaid-code-policy-k1.storage.xhtml`
**Tags**: @backend, @golden, @mermaid

**Preconditions**:

- Committed code-macro fixtures with CDATA bodies present

**Steps**:

1. Convert `mermaid-code-policy.storage.xhtml` (committed golden — not re-rendered): assert output is a ```mermaid fenced block (opening fence with the `mermaid` language identifier, closing fence)
2. Extract the CDATA content bytes from the fixture (`ac:plain-text-body` body) and the fence-interior bytes from the output; assert **byte-identical** source preservation
3. Assert 0 macro-wrapper artifacts: output contains no `ac:structured-macro`, `ac:parameter`, `ac:plain-text-body`, `CDATA` remnants
4. Repeat 1–3 for `code-block-mermaid` (short form) and `mermaid-code-policy-k1` (K1-attributed form — output must equal the attr-free output)

**Expected Outcome**:

- Every `language=mermaid` code macro unwraps to a ```mermaid fence with source bytes identical to the CDATA content; zero wrapper artifacts (AC-F3-2)

---

#### TC-RT-008 - K1 attribute tolerance: output identical to attr-free variant

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-3, NFR-4, RSK-2
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-readback.test.ts`; fixtures `code-block-python-k1.storage.xhtml`, `mermaid-code-policy-k1.storage.xhtml`, `readback-realistic.storage.xhtml`
**Tags**: @backend, @golden, @readback

**Preconditions**:

- New K1-variant fixtures committed: canonical Storage with `ac:schema-version` + `ac:macro-id` injected on macros, plus a trivial self-closing whitespace form (spike K1's second normalization)

**Steps**:

1. Convert `code-block-python-k1.storage.xhtml`; convert the attr-free `code-block-python.storage.xhtml` (committed golden); assert the two outputs are **byte-identical**
2. Assert 0 diagnostics on the K1 variant (attributes ignored silently — F-3d)
3. Assert output contains neither `ac:schema-version` nor `ac:macro-id` (never emitted)
4. Repeat for `mermaid-code-policy-k1` vs `mermaid-code-policy`; the `readback-realistic` fixture (K1 + panel combined) is asserted in TC-RT-006 step 2

**Expected Outcome**:

- K1 read-back form converts to exactly the attribute-free output — success, identical bytes, no diagnostics, no attribute leakage (AC-F3-3)

**Notes / Clarifications**:

- The expectation is **derived** (equality with the attr-free conversion), not generated from the K1 run — avoiding self-referential pinning (R-TST-2)

---

#### TC-RT-009 - Render-policy synthetic image: informational diagnostic, not content

**Scenario Type**: Edge Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, F-4, AC-F4-2, DEC-1, DM-2, RSK-5
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-readback.test.ts`; fixture `mermaid-render-policy.storage.xhtml` (existing)
**Tags**: @backend, @golden, @mermaid

**Preconditions**:

- `mermaid-render-policy.storage.xhtml` committed (h1 + `ac:image` alt "Mermaid diagram" + `ri:attachment ri:filename="marksync-mermaid-<hash>.svg"`)

**Steps**:

1. Convert the fixture; assert `result.ok === true` (conversion not blocked)
2. Assert exactly one informational diagnostic of class `marksync-synthetic-artifact`, carrying the construct identity and a Storage location (payload shape per DM-2; no content echo)
3. Assert the output contains the heading as Markdown and **zero** image syntax for the synthetic attachment (`![`, `marksync-mermaid-`, `ac:image`, `ri:attachment` all absent)
4. Deep-compare emitted diagnostics to the committed `reverse/mermaid-render-policy.json` sidecar

**Expected Outcome**:

- Conversion succeeds; the loss is explicit (informational diagnostic), located, never silent, and the synthetic image is never emitted as content (AC-F4-2, DEC-1)

---

#### TC-NORM-001 - Normalizer properties: deterministic + idempotent

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, AC-F5-1, DM-3, DEC-3, RSK-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/normalize.test.ts`
**Tags**: @backend, @unit, @normalizer

**Preconditions**:

- `normalize` exported from the domain-tier normalizer module (final name per plan; DEC-4)

**Steps**:

1. For every corpus-A and corpus-B `.md` fixture (loaded from the golden fixtures dir — unit tests may read committed files; no mocks): compute `N1 = normalize(md)` and `N2 = normalize(md)`; assert `N1 === N2` (deterministic)
2. Compute `N(N1)`; assert `N(N1) === N1` (idempotent — normalizing canonical form is a no-op)
3. Spot-check canonical-form invariants on `N1` outputs per spec Appendix B: ATX headings only, `-` bullets, `1.` ordered form, `*`/`**`/`~~` emphasis, backtick fences, inline link/image form, single blank-line block separation

**Expected Outcome**:

- Determinism and idempotence hold for 100% of corpus fixtures; emitted form conforms to the normative Appendix B rules

---

#### TC-NORM-002 - Canonical fixed point over corpus A

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, AC-F5-1, DM-3, DEC-3, RSK-1
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-round-trip.test.ts`
**Tags**: @backend, @golden, @normalizer

**Preconditions**:

- `reverse` and `normalize` both available

**Steps**:

1. For each corpus-A fixture: `R = reverse(forward(md))`; assert `normalize(R.markdown) === R.markdown` byte-wise
2. This assertion is deliberately **not** implied by TC-RT-001 + TC-NORM-001 alone: it pins the fixed point directly on reverse output, so a serializer/normalizer divergence fails here even if TC-RT-001 had been "fixed" by weakening the normalizer (the RSK-1 tripwire)

**Expected Outcome**:

- Reverse output is a fixed point of the normalizer for all 26 corpus-A fixtures — the shared canonical-form definition (DEC-3) is proven, not assumed

---

#### TC-RDIAG-001 - Blocking diagnostic shape: stable code + construct + location; no content echo

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, DM-2, DEC-1, NFR-5
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/reverse-diagnostics.test.ts`
**Tags**: @backend, @unit, @diagnostics

**Preconditions**:

- Reverse diagnostic model implemented (DM-2) with per-class stable codes

**Steps**:

1. Feed minimal hand-built Storage strings each containing one non-canonical construct (an unknown macro, a non-canonical element)
2. Assert the blocking arm: diagnostic class `unsupported-construct`; a **stable per-class code** (exact code value pinned in the test — codes are a public-ish surface once shipped, spec §22); construct identity matching the offending element/macro; a Storage-source location whose payload is sufficient to locate the element (line:column, element path, or both — final shape per OQ-3; the test pins whatever ships)
3. Assert the payload carries **no free-form content echo**: serializing the diagnostic must not include the element's text children (NFR-5 / INV-SEC-1 posture)
4. Same input twice → identical diagnostic (deep-equal)

**Expected Outcome**:

- Every non-canonical construct yields the two-part identity contract (code + construct) plus location; payload is structural, never content

---

#### TC-RDIAG-002 - Fast-fail / collect-all parity + exhaustive enumeration

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, DEC-2, DM-1
**Test Type(s)**: Unit + Golden adversarial
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/reverse-diagnostics.test.ts` (hand-built multi-instance inputs); `tests/golden/adversarial/reverse-classification-runner.test.ts` (fixture-driven, incl. `storage-multiple-unsupported`)
**Tags**: @backend, @unit, @golden, @parity

**Preconditions**:

- Both contract modes exported (fast-fail default + collect-all enumeration, mirroring `findUnsupported`/`findAllUnsupported`)

**Steps**:

1. Hand-built: Storage with 3+ unsupported instances at different depths/branches → fast-fail returns the first; collect-all returns all N in document order; assert `collectAll[0]` deep-equals the fast-fail error (identical per-instance verdicts: same code, same construct, same location)
2. Hand-built: Storage with only supported constructs → both modes report zero blocking diagnostics
3. Fixture-driven: `storage-multiple-unsupported.storage.xhtml` (new adversarial fixture) → collect-all length matches the sidecar's instance count exactly; no truncation, no duplicates
4. Cross-mode stability: every collect-all instance's verdict equals what fast-fail reports when run on a variant containing only that instance

**Expected Outcome**:

- Parity proven: identical per-instance verdicts in both modes; exhaustive enumeration (C-4: every instance listed); mirrors the forward GH-20 DEC-1 / GH-31 TC-ADVERSARIAL-002/003 precedent on Storage inputs

---

#### TC-RDIAG-003 - Malformed Storage → stable parse-error arm, never a crash

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4 (parse-error clause), NFR-4, DM-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse-parser.test.ts`; adversarial companion fixture `tests/adversarial-storage/storage-malformed.storage.xhtml` (+ `{ "parseError": true }` sidecar) run in TC-RADV-001
**Tags**: @backend, @unit, @negative

**Preconditions**:

- Chosen XML/XHTML parser integrated (OQ-1 resolved by the plan/decision record)

**Steps**:

1. Feed malformed Storage samples: mismatched tags, unclosed macro body, invalid entity, truncated CDATA
2. Assert each returns the distinct **parse-error arm** (a stable error, not a per-construct diagnostic) — conversion does not proceed
3. Assert no exception escapes the contract boundary (never a crash; typed error per the repo error strategy)
4. Same malformed input twice → identical error (deterministic failure)

**Expected Outcome**:

- Malformed input is a stable, typed parse error — never a crash, never a partial/garbage conversion (NFR-4)

**Notes / Clarifications**:

- Which byte sequences count as malformed depends on the parser's strictness (strict XML vs lenient HTML parsing — OQ-1); the fixture/samples must be crafted against the **chosen** parser's error contract. Flagged as OQ-T1.

---

#### TC-RDIAG-004 - Informational `marksync-synthetic-artifact` alongside success

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-3, F-4, AC-F4-2, DEC-1, DM-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/reverse-diagnostics.test.ts`
**Tags**: @backend, @unit, @diagnostics

**Preconditions**:

- Two-class taxonomy implemented (DM-2)

**Steps**:

1. Hand-built Storage: canonical paragraph + `ac:image` with `ri:filename="marksync-mermaid-<hash>.svg"` and alt "Mermaid diagram"
2. Assert success arm with exactly one informational diagnostic of class `marksync-synthetic-artifact` (stable code pinned), construct identity + location present
3. Boundary checks (why this class exists — DEC-1): (a) a **user** attachment image (`ri:filename` not matching the `marksync-mermaid-` pattern) converts to `![alt](filename)` with 0 diagnostics; (b) alt text other than "Mermaid diagram" on a marksync-mermaid filename still classifies informationally (filename is the discriminator); (c) the informational diagnostic never flips conversion to blocking
4. Payload carries no content echo (structural fields only)

**Expected Outcome**:

- Recognized marksync artifacts are reported informationally alongside successful conversion; user images are never misclassified (DEC-1's common-path protection runs both ways)

---

#### TC-RPARSE-001 - Storage parse substrate: entities, CDATA (incl. split `]]>`), namespaces

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-1, NFR-4, spec Appendix A
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse-parser.test.ts`
**Tags**: @backend, @unit, @parser

**Preconditions**:

- Standards-based parser behind the Storage→HAST stage (NFR-4 — regex extraction prohibited; structural review confirms no regex-extraction path ships)

**Steps**:

1. Entities: Storage with `&amp;` `&lt;` `&gt;` `&quot;` `&#39;` in text and attribute values → assert unescaped to literal characters in the resulting Markdown (with canonical re-escaping per Appendix B)
2. CDATA: code-macro body containing a split `]]>` sequence (content ending in `]]` followed by content starting such that the terminator splits — the NFR-4 case) and content with leading/trailing blank lines → assert literal byte preservation through the fence
3. Namespaces: `ac:`/`ri:` elements and attributes parse into HAST-shaped nodes with identifiable names (structured access, not string scraping)
4. Trivial self-closing whitespace forms (K1) parse as empty/whitespace nodes

**Expected Outcome**:

- Entity unescaping, CDATA extraction (incl. split sequences), and namespaced-element handling are correct on all probes — the parse substrate holds on every case the corpus plus K1 evidence defines

---

#### TC-RADV-001 - Storage-side adversarial classification equals sidecars

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, DM-2, DEC-1, GH-31 taxonomy
**Test Type(s)**: Golden adversarial
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/adversarial/reverse-classification-runner.test.ts`; fixtures `tests/adversarial-storage/*`
**Tags**: @backend, @golden, @adversarial, @no-silent-drop

**Preconditions**:

- New Storage-side adversarial set committed (§6.2 table): unknown macros (`storage-macro-toc`, `storage-macro-expand`), the panel-strip boundary (`storage-macro-info-no-marker`), app constructs (`storage-macro-jira`, `storage-app-gliffy`), `storage-nested-tables`, non-canonical elements (`storage-raw-html-block`), `storage-multiple-unsupported`, `storage-malformed` — each with a `*.classification.json` sidecar (or `{ "parseError": true }`)

**Steps**:

1. For each fixture: run the collect-all classification; serialize emitted diagnostics; deep-compare to the committed sidecar (exact equality: every instance present, none missing, none extra — the no-silent-drop assertion)
2. Assert conversion fails fast on every blocking fixture; the offending construct **never appears in any output** (there is no partial output — DEC-2)
3. Assert each diagnostic's code/construct/location match the sidecar entry
4. Category coverage inventory (GH-31 TC-ADVERSARIAL-001 pattern): assert the set represents every required category — unknown macros ≥ 2 kinds, non-panel info macro, app/gliffy class, nested tables, non-canonical elements, multi-instance, malformed

**Expected Outcome**:

- 100% of Storage-side adversarial classes produce blocking diagnostics with stable code + construct identity + location; 0 silent drops; 0 content emission — C-4 regression-locked in the reverse direction

---

#### TC-RADV-002 - Adversarial determinism: classify + convert twice

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: AC-F1-2, NFR-2, F-4
**Test Type(s)**: Golden adversarial
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/adversarial/reverse-classification-runner.test.ts`
**Tags**: @backend, @golden, @determinism

**Preconditions**:

- Adversarial fixtures + runner available

**Steps**:

1. For each adversarial fixture: run the full classification/conversion twice in-process
2. Deep-compare serialized outputs (diagnostics JSON byte-identical; identical error arms)
3. Compare against the committed sidecars in both runs (stability across the sidecar comparison too)

**Expected Outcome**:

- Byte-identical classification and error arms on repeated runs — deterministic diagnostics (mirrors TC-ADVERSARIAL-006)

---

#### TC-REG-001 - Library-only boundary: 0 CLI delta, forward fixtures unmodified, all tiers green

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, AC-F6-1, DM-1, NG-1, NG-3, G-6
**Test Type(s)**: CI (full-suite green) + Manual (structural diff verification)
**Automation Level**: Semi-automated (CI executes the suites; the structural checks are scripted/reviewed at delivery and DoD)
**Target Layer / Location**: CI fast loop + `e2e-mock` job + `bun run test:bdd`; structural checks via `git diff main --stat` at review/DoD
**Tags**: @ci, @regression, @quality-gate

**Preconditions**:

- Change complete on the branch; version bumped 0.8.2 → 0.9.0 (DEC-5)

**Steps**:

1. Structural: `git diff main --stat` shows (a) **0 modified** existing files under `tests/golden/fixtures/markdown/` (additions only — the 33 pairs and 2 sidecars byte-stable), (b) 0 changes under `src/cli/` and `tests/unit/cli*/`/`tests/integration/cli/` (no new command/flag/output), (c) `tests/golden/markdown/storage-renderer.test.ts` unmodified
2. `bun test tests/unit/ tests/integration/ tests/golden/` — 0 failures (unit + integration + golden + golden-adversarial, incl. all new suites)
3. `bun run check` green end-to-end (lint + format:check + typecheck + suite + boundaries)
4. `bun run test:bdd` green; CI `e2e-mock` job green on the PR (both unchanged, regression signal)
5. Confirm `package.json` version = 0.9.0 and no new CLI wiring in `src/cli/commands/`

**Expected Outcome**:

- All existing tiers green; the 33 forward golden pairs pass unmodified; zero CLI surface delta — the library-only boundary (PM-DEC-2) verified structurally, not just by absence of tests

## 6. Environments and Test Data

### 6.1 Required Environments

- **Local development**: Bun (pinned version per CI), filesystem fixture access — no network, no secrets, no Confluence space, no DOM
- **CI (GitHub Actions)**: ubuntu runner, Bun 1.2.23, secrets-free — all new tests land in the existing fast-loop `test` step (`bun test tests/unit/ tests/integration/ tests/golden/` auto-discovers them; zero workflow edits); the unchanged `e2e-mock` job and `test:bdd` step serve as regression signal
- **No other environments**: nothing opt-in, nothing scheduled

### 6.2 Test Data — Corpus Partition and New Fixtures (DM-4, DEC-7)

**Corpus A — canonical round-trip fixtures (26, all existing; assert `reverse(forward(md)) === normalize(md)`):**

`heading-h1`, `heading-h2`, `heading-h3`, `heading-h4`, `heading-h5`, `heading-h6`, `paragraph`, `strong`, `em`, `strong-em-nested`, `strikethrough-del`, `code-inline`, `code-block-python`, `code-block-mermaid`, `mermaid-code-policy`, `link-plain`, `link-query-amp`, `image-remote`, `image-attachment`, `unordered-list`, `ordered-list-nested`, `task-list`, `table`, `blockquote`, `hr`, `kitchensink`

(Construct-family note: ordered nesting is covered by `ordered-list-nested`; no separate plain-`ordered-list` fixture exists in the corpus and none is invented — AC-F1-1's family enumeration maps onto exactly these 26.)

**Corpus B — annotation/defensive fixtures (7, all existing; assert explicit expectations):**

| Fixture | Reverse input | Explicit expectation |
|---|---|---|
| `frontmatter` | body-only Storage (front-matter never reaches Storage) | canonical body; front-matter never synthesized (DEC-6); 0 diagnostics |
| `html-comment-block` | `<h1>` + `<p>` (comment stripped forward) | canonical body; comment never synthesized; 0 diagnostics |
| `html-comment-inline` | `<p>Before  after.</p>` | exact serializer bytes pinned in sidecar (double-space form — pinned, not derived); 0 diagnostics |
| `link-ref-comment` | `<h1>` + `<p>` | canonical body; no reference definitions synthesized; 0 diagnostics |
| `mixed-html-comment` | empty Storage (forward error fixture w/ empty golden) | empty Markdown; 0 diagnostics |
| `raw-html-inline-real` | `<p>Text &lt;b&gt;raw&lt;/b&gt; inline.</p>` | canonical escaping of literal `<b>` text pinned in sidecar; raw HTML never emitted; 0 diagnostics |
| `raw-html-block-real` | — (no Storage form; forward-error fixture) | **manifest-excluded (forward-only)** — its `.unsupported.txt` keeps serving the forward classification; nothing to reverse |

**Storage-only reverse fixtures (5 = 2 existing + 3 new):**

| Fixture | Status | Covers |
|---|---|---|
| `provenance-panel.storage.xhtml` | existing | panel strip (AC-F3-1) |
| `mermaid-render-policy.storage.xhtml` | existing | synthetic-artifact diagnostic (AC-F4-2) |
| `code-block-python-k1.storage.xhtml` | **NEW** | K1 attrs on a code macro (AC-F3-3) |
| `mermaid-code-policy-k1.storage.xhtml` | **NEW** | K1 attrs on the mermaid macro (AC-F3-3 + AC-F3-2) |
| `readback-realistic.storage.xhtml` | **NEW** | Flow-2 shape: canonical (kitchensink) body + K1 attrs + appended panel — the composite read-back a real `resolve`/`import` will fetch (F-3a+F-3d together; RSK-2 evidence) |

**NEW Storage-side adversarial set (`tests/adversarial-storage/`, top level per PD-5, extends the GH-31 taxonomy):**

| Fixture | GH-31 category mirrored | Sidecar expectation |
|---|---|---|
| `storage-macro-toc.storage.xhtml` | unknown macro (`{toc}`) | 1 blocking diagnostic |
| `storage-macro-expand.storage.xhtml` | unknown macro (`{expand}`) | 1 blocking diagnostic |
| `storage-macro-info-no-marker.storage.xhtml` | info macro **without** panel marker — the strip boundary | 1 blocking diagnostic (NOT stripped — proves marker discrimination, AC-F3-1 edge) |
| `storage-macro-jira.storage.xhtml` | app macro (jira) | 1 blocking diagnostic |
| `storage-app-gliffy.storage.xhtml` | app/gliffy-class construct | 1 blocking diagnostic |
| `storage-nested-tables.storage.xhtml` | nested tables (single-level table is canonical; nesting is not) | 1+ blocking diagnostics |
| `storage-raw-html-block.storage.xhtml` | non-canonical XHTML element (`<div>` block) | 1 blocking diagnostic |
| `storage-multiple-unsupported.storage.xhtml` | multi-instance (parity/enumeration input) | N blocking diagnostics, collect-all exhaustive |
| `storage-malformed.storage.xhtml` | malformed XML (parse-error arm) | `{ "parseError": true }` |

**Reverse-expectation sidecars (`tests/golden/fixtures/markdown/reverse/`, NEW):** one `<name>.md` (expected reverse Markdown; empty allowed) for each corpus-B fixture with a Storage form (6) and each Storage-only fixture (5); one `<name>.json` (expected diagnostics) where diagnostics are expected (`mermaid-render-policy` at minimum). Plus the partition manifest `round-trip-partition.json` (NEW).

**Fixture totals: 34 new committed files** — 3 Storage-only fixtures + 12 reverse sidecars (11 `.md` + ≥1 `.json`) + 18 adversarial files (9 fixtures + 9 sidecars) + 1 manifest. The corpus-A/B fixtures themselves: **0 new, 0 modified** (NG-3).

### 6.3 Test Data Generation and Cleanup

- **Corpus A**: derived at runtime (`normalize(fixture.md)`) — nothing generated or committed beyond snapshots
- **Corpus-B / Storage-only expectations**: generated once by running reverse, then **human-reviewed** before commit (mirrors the GH-31 sidecar process); K1 expectations are derived (equality with attr-free output), not generated — see R-TST-2
- **Adversarial sidecars**: generated from the classifier, then reviewed; they pin the diagnostic contract (code + construct + location), not incidental bytes
- **Snapshots**: initial baseline via reviewed local run; explicit `--update-snapshots` only, never in CI
- **Cleanup**: none — all test data is committed and immutable; no temp state, no network, no live systems

### 6.4 Isolation Strategy

- All new suites exercise **pure functions** over committed files: no shared mutable state, no environment variables, no network — parallelizable by construction
- The `reverse/` expectations subdirectory and the manifest are invisible to the forward golden loader (which filters `*.md` in the top-level dir only) — the forward suite's `exactly 33` inventory lock stays green **without modification** (verified against the loader source at intake)
- No mocks of any kind (see §7.3) — nothing can leak between test files (the GH-103 lesson applied by zero-mocking rather than by seams)

## 7. Automation Plan and Implementation Mapping

### 7.1 Test-design decisions (spec-delegated latitude, pinned here)

- **D-TST-1 — Corpus-A reverse outputs get a `toMatchSnapshot` layer.** Purpose: the across-run determinism lock AC-F1-2 requires (TC-RT-004); secondary benefit — PR-reviewable canonical-form renditions. Rejected alternative: hashing outputs (weaker failure diagnostics, unreviewable). Cost: one generated `.snap` file. Strategy snapshot rules apply (explicit re-baseline only).
- **D-TST-2 — Corpus-B expectations live in a `reverse/` subdirectory, not `<name>.reverse.md` sidecars in the main dir.** Any file ending in `.md` in the main dir would be picked up by the unmodifiable forward loader (NG-3) and break it; a subdirectory is invisible to its `readdirSync` + `endsWith(".md")` filter. Verified against the `storage-renderer.test.ts` loader source at intake.
- **D-TST-3 — The partition manifest is a committed JSON with a completeness assertion + negative self-test** (TC-RT-005), rather than convention-based partitioning (e.g., name prefixes). Explicit classification is a conscious, reviewed act; convention-based partitioning silently mis-buckets (a hypothetical `ordered-list.md` addition would look canonical to a name-based glob regardless of intent). Mirrors the GH-103 guard self-test pattern.

### 7.2 Implementation mapping

| TC ID | Test File | Execution Command | Mocking Requirements | Implementation Status |
|-------|-----------|-------------------|---------------------|----------------------|
| TC-RT-001..005, TC-NORM-002 | `tests/golden/markdown/reverse-round-trip.test.ts` (NEW) | `bun test tests/golden/markdown/reverse-round-trip.test.ts` | None — real pipeline (TDR-0004) | To Implement |
| TC-RT-006..009 | `tests/golden/markdown/reverse-readback.test.ts` (NEW) | `bun test tests/golden/markdown/reverse-readback.test.ts` | None | To Implement |
| TC-NORM-001 | `tests/unit/domain/markdown/normalize.test.ts` (NEW) | `bun test tests/unit/domain/markdown/normalize.test.ts` | None — reads committed fixtures | To Implement |
| TC-RDIAG-001/002/004 | `tests/unit/domain/markdown/reverse-diagnostics.test.ts` (NEW) | `bun test tests/unit/domain/markdown/reverse-diagnostics.test.ts` | None — hand-built inputs | To Implement |
| TC-RPARSE-001, TC-RDIAG-003 | `tests/unit/infra/confluence/parse/reverse-parser.test.ts` (NEW) | `bun test tests/unit/infra/confluence/parse/reverse-parser.test.ts` | None | To Implement |
| TC-RADV-001/002, TC-RDIAG-002 (golden arm) | `tests/golden/adversarial/reverse-classification-runner.test.ts` (NEW) | `bun test tests/golden/adversarial/reverse-classification-runner.test.ts` | None — real pipeline | To Implement |
| TC-REG-001 | CI fast loop + `e2e-mock` job + `test:bdd` + structural `git diff main --stat` checks | `bun test tests/unit/ tests/integration/ tests/golden/ && bun run check && bun run test:bdd` | N/A | Existing suites – No Change + review checklist |
| Forward tripwire | `tests/golden/markdown/storage-renderer.test.ts` | (existing) | None | **Existing – No Change** (must stay green unmodified) |

Unit-test file paths mirror the final `src/` module layout; if the plan (phase 4) names modules differently (DEC-4 latitude), the test paths follow the modules — the TC↔file mapping above is the contract.

### 7.3 Over-mocking guardrail compliance (TDR-0004 / GH-103)

- **`mock.module` is banned** repo-wide (strategy anti-pattern; enforced by the existing scanning guard `tests/unit/meta/no-mock-module.test.ts`, GH-103) — this plan uses **zero** module mocking anywhere
- **No mocks at all are needed**: the system under test is a set of pure functions (Storage string → Markdown string + diagnostics); the forward pipeline consumed by the harness (`parseMarkdown`, `mdastToHast`, `renderStorage`) is the **real** implementation — golden-tier fidelity through real parser/renderer fixtures is exactly the guardrail's preferred alternative
- Fault injection: not applicable (no network, no I/O to fail); adapter-boundary mocks: not applicable (no adapter touched)
- The existing `mock.module` scanning guard runs over the new files automatically — a violation fails CI without any new wiring

### 7.4 Estimates and CI impact

| Item | Estimate |
|---|---|
| New test files | 6 (2 golden, 1 golden-adversarial, 3 unit) |
| Test scenarios (TC IDs) | 19 |
| Parametrized `test()` cases at runtime | ~75–85 (26 corpus-A × {equality, snapshot, determinism, fixed-point} + 6 corpus-B + 5 Storage-only + 9 adversarial × {classification, determinism} + ~20 unit cases) |
| New committed fixture files | 34 (§6.2) + 1 generated snapshot file |
| New CI jobs / workflow edits | **0** — everything auto-discovered by the existing fast-loop glob |
| Added fast-loop runtime | ~5–10 s (in-process string transforms over small fixtures; no DOM, no network, no subprocesses) |
| Touched existing tests | **0** — every existing suite (incl. `storage-renderer.test.ts`) runs unmodified |

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Probability | Mitigation |
|----|------|--------|-------------|------------|
| R-TST-1 | Normalizer weakened to make the round-trip AC pass (RSK-1's test-side face) — the AC becomes self-referential | H | M | TC-NORM-002 pins the fixed point **directly on reverse output**; TC-NORM-001 pins Appendix B invariants on `normalize` output; corpus-B pins explicit bytes — a weakened normalizer breaks these independently of TC-RT-001 |
| R-TST-2 | Corpus-B / Storage-only expectations generated **by the converter under test** pin its bugs (self-referential sidecars) | M | M | Two-layer review: (a) human review of every sidecar at commit (GH-31 process); (b) K1 + panel expectations are **derived** (equality with attr-free / body-only variants — TC-RT-006/008), not generated; (c) corpus-B annotation fixtures cross-checkable against `normalize(md)` minus annotations by the reviewer |
| R-TST-3 | Real read-back Storage varies beyond the K1 fixtures (editor normalization drift — spec RSK-2) → round-trip fails outside the corpus | H | M | K1-variant + `readback-realistic` fixtures encode the K1 evidence; failures on real corpora are *correct* C-4 behavior until evidence expands the set (PDR-0002 revisit trigger); E3 partner-corpus evidence will feed new fixtures through the manifest guardrail |
| R-TST-4 | Parser choice (OQ-1) changes malformed-input semantics after these tests are written — lenient HTML vs strict XML disagree on what "malformed" means | M | M | TC-RDIAG-003 samples are crafted against the **chosen** parser's contract (plan-phase dependency); the adversarial `storage-malformed` fixture is authored after OQ-1 resolves; the parse-error *arm* is asserted regardless of parser |
| R-TST-5 | Snapshot re-baselining used to "fix" determinism failures instead of fixing the converter | M | L | Strategy snapshot rule (explicit reviewed `--update-snapshots`, never in CI) + reviewer checklist: a reverse-output snapshot change in a PR must be justified line-by-line (it is a canonical-form change or a bug fix) |
| R-TST-6 | Diagnostic-location shape churn (OQ-3 unresolved) churns every adversarial sidecar | M | M | Sidecars pin the contract that ships at delivery; OQ-3 resolution before E2/E3 binds may require one reviewed sidecar migration — acceptable, flagged here so it is expected, not emergent |
| R-TST-7 | Corpus-A count drift: the forward suite's `exactly 33` lock vs any future `.md` addition in the shared dir | L | L | This change adds **no** `.md` files to the main dir (all additions are `.storage.xhtml`-only or in `reverse/`); future corpus growth updates both locks consciously in one PR (the manifest guardrail forces the pairing) |

### 8.2 Assumptions

- A-1: The 33-pair corpus inventory read at intake (`main @ 80065a4`) is complete and current: 26 corpus-A + 7 corpus-B fixtures, 2 `.unsupported.txt` sidecars, 2 Storage-only fixtures — the partition in §6.2 enumerates all of them
- A-2: The forward golden loader (`storage-renderer.test.ts`) ignores every non-`.md` file and every subdirectory in the fixtures dir (verified against its source: `readdirSync(...).filter(f => f.endsWith(".md"))`) — new Storage-only fixtures, the manifest, and the `reverse/` subdir are invisible to it, keeping NG-3 holdable with zero modifications
- A-3: `normalize` is (or wraps) the same canonical serializer the reverse converter uses — the spec's DEC-3 single-definition requirement; the tests treat divergence as a failure (TC-NORM-002), never as plan latitude
- A-4: Bun's `toMatchSnapshot` is deterministic across runs on the pinned Bun version and OS matrix in use (same mechanism as the existing forward snapshots — established repo practice, ADR-0002 C-1 posture)
- A-5: Unit tests may read committed golden fixtures from disk (pure file reads — not I/O-boundary mocking); precedent: the golden runners themselves and GH-31's PII audit
- A-6: The reverse contract exposes (or is trivially wrapped to expose) a collect-all mode alongside fast-fail — DM-1/DEC-2 guarantee the parity contract; exact export shape is plan latitude
- A-7: NFR-3's ≤ 200 ms p95 is comfortably achievable in-process for corpus-sized fixtures (the forward renderer's equivalent is already in the fast loop) — the informational assertion is expected to pass with wide margin; if it proves flaky, it is demoted to recorded timings (OQ-T3)

### 8.3 Open Questions

| ID | Question | Blocking? | Owner / Resolution path |
|----|----------|-----------|------------------------|
| OQ-T1 | XML/XHTML parser selection (spec OQ-1) determines the malformed-Storage samples (TC-RDIAG-003) and entity/CDATA edge semantics (TC-RPARSE-001) | **Blocks fixture authoring for TC-RDIAG-003's adversarial companion only** — all other scenarios are parser-agnostic (written against the DM-1/DM-2 contracts) | @decision-advisor via the plan phase (spec §13 dependency gate); tests authored after the TDR lands |
| OQ-T2 | Diagnostic-location granularity (spec OQ-3: line:column vs element path vs both) fixes the sidecar `location` field shape | No — sidecars pin whatever ships; a later OQ-3 resolution may migrate sidecars in one reviewed change (R-TST-6) | E2/E3 planning per spec; flagged so DoR does not treat sidecar shape as accidental |
| OQ-T3 | Should the NFR-3 p95 timing assertion gate CI or only be recorded (informational per spec)? | No | This plan gates at the generous 200 ms ceiling with per-fixture timings reported; demote to record-only via a one-line change if CI variance appears — @runner decides at first green run |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-08-15 | test-plan-writer (GH-92) | Initial test plan — 19 scenarios across golden-fixture / golden-adversarial / unit tiers; corpus partition pinned (26 A / 7 B / 5 Storage-only / 9 adversarial-new, DEC-7/DM-4); harness mechanics normative (byte-equality, in-process + snapshot determinism, fast-fail/collect-all parity, manifest guardrail); test-design decisions D-TST-1..3; no integration/e2e/BDD/Mermaid-DOM scenarios (spec §8.1/NG-5) with rationale; over-mocking guardrail compliance note (zero mocks, `mock.module` ban per GH-103). |
| 0.2 | 2026-08-15 | test-plan amendment (PM reopen) | PD-5: relocate Storage-side adversarial fixtures from a storage/ subdirectory under tests/adversarial/ (would crash the adversarial pii-audit directory walk with EISDIR) to top-level tests/adversarial-storage/ — aligns with plan v1.0 |

## 10. Test Execution Log

Populated during delivery phases 6–10 by `@coder`, `@runner`, and `@pm` (dod_check).

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| TC-RT-001 | TBD | TBD | Pending execution |
| TC-RT-002 | TBD | TBD | Pending execution |
| TC-RT-003 | TBD | TBD | Pending execution |
| TC-RT-004 | TBD | TBD | Pending execution |
| TC-RT-005 | TBD | TBD | Pending execution |
| TC-RT-006 | TBD | TBD | Pending execution |
| TC-RT-007 | TBD | TBD | Pending execution |
| TC-RT-008 | TBD | TBD | Pending execution |
| TC-RT-009 | TBD | TBD | Pending execution |
| TC-NORM-001 | TBD | TBD | Pending execution |
| TC-NORM-002 | TBD | TBD | Pending execution |
| TC-RDIAG-001 | TBD | TBD | Pending execution |
| TC-RDIAG-002 | TBD | TBD | Pending execution |
| TC-RDIAG-003 | TBD | TBD | Pending execution — samples authored after OQ-1 resolves |
| TC-RDIAG-004 | TBD | TBD | Pending execution |
| TC-RPARSE-001 | TBD | TBD | Pending execution |
| TC-RADV-001 | TBD | TBD | Pending execution |
| TC-RADV-002 | TBD | TBD | Pending execution |
| TC-REG-001 | TBD | TBD | Pending execution (structural checks at DoD) |

---



