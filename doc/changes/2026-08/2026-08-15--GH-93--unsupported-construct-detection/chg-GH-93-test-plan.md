---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: chg-GH-93-test-plan
status: Proposed
created: 2026-08-15
last_updated: 2026-08-15
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0003, feature, priority:high, reverse-conversion, E1]
version_impact: minor
summary: "Test plan for completing unsupported-construct detection in the reverse converter: granular per-class diagnostic codes (assignment map unit-pinned per spec Appendix A / TDR-0014, exact code strings pinned literal — consumers route on code only), attribute-level detection over the mirror allowlist (one aggregated diagnostic per element, sorted deduplicated names, never values, K1 carve-out byte-identical), task-list child integrity, page-context echo on all diagnostic arms with omit-when-absent byte-compat, and the storage-side adversarial corpus extended to GH-31 alignment (12/12 categories incl. zero-diagnostic canonical counterparts) plus new-class fixtures (complex layout incl. the orphaned-layout TDR-0014 pin, exotic attributes incl. multi-attribute + K1-on-macro negative control, task-list stray child, page context incl. parse-error-with-page). Unit + golden adversarial tiers only; existing suites are the regression net; 0 CLI delta."
links:
  change_spec: ./chg-GH-93-spec.md
  implementation_plan: ./chg-GH-93-plan.md # to be created in phase 4 (delivery_planning)
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS3-E1-S2] Unsupported-construct detection — granular stable diagnostic codes + page locations (PDR-0002 C-4)

## 1. Scope and Objectives

This test plan validates the completion of unsupported-construct detection in the GH-92 reverse converter. The core behaviors to protect: (1) **granular per-class classification** — every non-canonical construct class (foreign/unknown macro, complex layout, exotic attribute, unknown element, structural fallback) emits its own stable blocking code, with the assignment map (spec Appendix A, confirmed by TDR-0014) unit-pinned against **exact literal code strings** (F-1, F-5, NFR-4); (2) **zero silent drops** — attributes beyond the mirror allowlist (Appendix C) and non-`ac:task` children of `ac:task-list` become located blocking diagnostics, never vanish (F-2, F-3, C-4); (3) **page + element location** — caller-supplied page context echoed verbatim into every diagnostic arm, omitted entirely when absent so context-free output stays byte-identical to the GH-92 form (F-4, DEC-2); (4) **GH-31-aligned adversarial corpus** — 12/12 categories with pinned sidecar expectations including zero-diagnostic canonical counterparts as the false-positive guard, mechanically enforced by the extended runner inventory (F-6, DEC-3); (5) **preservation** — K1 carve-out byte-identical, corpus-A round-trip byte-equality unchanged, forward fixtures untouched, zero CLI delta (F-7, NFR-3).

The central design risks this plan guards against: **self-referential re-pinning** — the two emitted-code re-assignments (unknown macros, unknown elements) require re-baselining existing sidecars with output from the classifier under test, so a classification bug could pin itself (RSK-2); the countermeasure is a scripted construct/location-stability check against `main` (only the `code` value may change — TC-RPIN-001) plus the independently normative assignment map (Appendix A) asserted literal-by-literal before any sidecar is trusted. Secondary risks: **mirror-allowlist false positives** on canonical corpora (RSK-1 — countered by the zero-diagnostic sweep over corpus A + forward golden + K1 variants, TC-FP-001), **layout double-reporting** (RSK-7 — countered by the exactly-one-diagnostic-per-layout-tree pin incl. the orphaned-layout edge, TC-LAY-001/002), and **diagnostic storms** on attribute-rich tables (RSK-5 — countered by the one-aggregated-diagnostic-per-element pin over a multi-attribute fixture, TC-ATTR-001).

### 1.1 In Scope

- **Assignment-map freeze** (unit): `REVERSE_CODES` registry snapshot (exactly 7 codes, additions-only vs 0.9.0) + per-Appendix-A-row construct-class→code assertions with literal code strings — the mechanical enforcement of TDR-0014 C-1/C-2/C-3/C-6 and NFR-4
- **Granular classification** (unit): unknown macros (children not separately diagnosed), complex layouts (one construct per layout tree at the outermost element, incl. the orphaned layout-family TDR-0014 pin), unknown elements vs retained structural fallback, attribute-level detection with sorted/deduplicated name enumeration and no values, task-list child integrity (both child classes)
- **Page context** (unit): verbatim echo on blocking / informational / parse-error arms; partial context never synthesized; omit-when-absent byte-compat with the GH-92 form; `sourcePath` absorption; optional-parameters-only signature growth
- **Determinism + parity** (unit + golden adversarial): convert-twice deep-equality under the new codes and fields, input-order-independent attribute enumeration, fast-fail first blocking deep-equals collect-all first diagnostic
- **Aligned adversarial corpus** (golden adversarial): 5 new GH-31 counterpart fixtures (macro-code, raw-html-inline, emoji, long-page, mixed task/regular lists — the supported ones pinning zero-diagnostic conversions), new-class fixtures (complex layout, orphaned layout, exotic attributes incl. multi-attribute + K1-on-macro negative control, task-list stray child), 2 page-context fixtures (blocking+informational echo; parse-error-with-page); runner category-inventory extension to 12/12 + new classes; sidecar schema extension (`page?`); PII grep-audit over the extended set
- **Reviewed sidecar re-baseline** for the two re-assigned classes (7 existing sidecars; construct/location asserted stable, only `code` changes)
- **False-positive guard** (golden): zero-new-diagnostics sweep over corpus A (26), the forward golden corpus (33 pairs, byte-unmodified), corpus-B committed expectations, K1 variants (byte-identical output, zero diagnostics), and the synthetic-artifact fixture (exactly its pinned 1 informational)
- **Library-only boundary** (structural + CI): 0 CLI delta, `ReverseError` stays a standalone union, all pre-existing tiers green, version 0.9.0 → 0.10.0

### 1.2 Out of Scope & Known Gaps

- No CLI testing of any kind — no command, flag, output envelope, exit code (NG-1); the contract is library-level (DM-1)
- No `resolve`/`import` (E2/E3) flow tests — no diffing, patch generation, lock/state writes, diagnostic *presentation* UX (NG-2); this change only makes the payload sufficient
- No forward-pipeline or forward-fixture modification (NG-3) — the unmodified `storage-renderer.test.ts` suite is the tripwire
- No canonical-subset expansion testing (NG-4) — `ac:layout` becomes *detected*, not *supported*; there is no layout-conversion happy path to test
- No integration / e2e-mock / e2e-live / BDD / Mermaid-DOM scenarios — no I/O, lifecycle, or rendering surface; those tiers run unchanged as regression signal
- No adopt-verbatim escape hatch or resolution-path UX (NG-5); no partial/suppressed-construct conversion mode (NG-6)
- Attribute-level byte positions are out of scope (spec OQ-2 resolved element-level); tests pin element-start locations + enumerated names only
- Real-partner-corpus validation is out of scope (synthetic corpus per GH-31 precedent; E3 evidence later, spec §7.2)
- Performance is **informational only** (NFR-5 ≤ 200 ms p95 per page; extended-corpus CI runtime within the golden-tier budget) — timings recorded, no hard CI gate beyond suite runtime

## 2. References

- Change specification: `chg-GH-93-spec.md` (authoritative for F/DM/NFR/DEC/OQ/AC IDs; §17 ACs; Appendix A normative code-assignment map, Appendix B normative GH-31 alignment map, Appendix C normative mirror attribute allowlist)
- Decision record: `doc/decisions/TDR-0014-reverse-diagnostics-granular-code-taxonomy.md` — frozen taxonomy (DEC-1 confirmed), constraints C-1..C-7, and the **two clarifying pins**: (1) orphaned layout-family elements classify as ONE `reverse/complex-layout` at the outermost family element present; (2) consumers route on the `code` string only — never `construct` text or `class` labels
- PM notes: `chg-GH-93-pm-notes.yaml` (TDR-0014 pins restated for test-plan + plan; OQ-2/OQ-4 spec-resolved; OQ-3 minor bump PM-confirmed)
- Ticket: GitHub issue GH-93 (scope authority with PDR-0002 C-4)
- Testing strategy: `.ai/rules/testing-strategy.md` (tiers, golden snapshot rules, over-mocking guardrail, `mock.module` ban per GH-103, CI wiring)
- TypeScript conventions: `.ai/rules/typescript.md` (test placement mirrors `src/`, `#`-aliases in tests, no `any` in helpers)
- Existing test spec this change extends (phase 7 updates it): `doc/quality/test-specs/test-spec-reverse-conversion.md`
- ADR-0005 (canonical subset, K1 carve-out, "do not silently degrade"), PDR-0002 (C-4), TDR-0012/TDR-0013 (parse/serialize substrates)
- Implementation under test (current state): `src/infra/confluence/parse/reverse.ts` (`reverseStorage` / `reverseStorageCollectAll`; `ReverseOptions.sourcePath` reserved-unused at intake), `src/domain/markdown/reverse-diagnostics.ts` (`REVERSE_CODES` — 3 codes at baseline)
- Test infrastructure extended by this plan: `tests/golden/adversarial/reverse-classification-runner.test.ts` (sidecar deep-equality, category inventory, parity/determinism/PII assertions), `tests/adversarial-storage/` (9 fixture+sidecar pairs), `tests/golden/markdown/reverse-round-trip.test.ts` + `reverse-readback.test.ts` (corpus-A guardrails, K1 variants), `tests/unit/domain/markdown/reverse-diagnostics.test.ts`, `tests/unit/infra/confluence/parse/reverse-parser.test.ts`
- Precedent plans: `chg-GH-92-test-plan.md` (format, harness mechanics, structural regression checks), `chg-GH-31-test-plan.md` (adversarial tier conventions), `chg-GH-103-test-plan.md` (guard self-test pattern, `mock.module` ban)

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | Foreign/unknown macro → blocking `reverse/unknown-macro` with macro construct identity + element `line:column`; macro children not separately diagnosed; fast-fail/collect-all agree per instance | TC-TAXO-002, TC-CORP-001, TC-RPIN-001, TC-DET-001 | Covered |
| AC-F1-2 | `ac:layout` tree (any depth) → exactly ONE blocking `reverse/complex-layout` at the outermost layout element, zero per-section/per-cell diagnostics, both contract modes | TC-LAY-001, TC-LAY-002, TC-CORP-001, TC-CORP-002 | Covered |
| AC-F1-3 | Non-canonical element (`div`, inline `span`, unknown `ac:*`) → blocking `reverse/unknown-element` with identity + location; structural violations (table nested in `td`/`th`) stay on the retained `reverse/unsupported-construct` fallback | TC-ELEM-001, TC-TAXO-002, TC-RPIN-001 | Covered |
| AC-F2-1 | Attributes beyond the mirror allowlist → exactly one blocking `reverse/unsupported-attribute` per element, offending names sorted + deduplicated, element-start location, no attribute values; multiple offending elements → one diagnostic each; both modes agree | TC-ATTR-001, TC-ATTR-002, TC-CORP-002, TC-CORP-003 | Covered |
| AC-F2-2 | K1 read-back form (`ac:schema-version`/`ac:macro-id` on `ac:structured-macro`) → zero diagnostics, output byte-identical to the attribute-free variant (carve-out preserved, re-asserted over existing K1 fixtures) | TC-ATTR-002, TC-FP-001, TC-CORP-002 | Covered |
| AC-F3-1 | Non-`ac:task` child of `ac:task-list` → blocking diagnostic (class per F-1 rules) at the child's location, never a silent drop; canonical mixed task/regular-list body → zero diagnostics | TC-TASK-001, TC-CORP-001, TC-CORP-002 | Covered |
| AC-F4-1 | Page context echoed verbatim into every diagnostic arm (blocking, informational, parse-error); absent → field omitted, output byte-identical to the context-free GH-92 form; signatures optional-parameters only | TC-PAGE-001, TC-PAGE-002, TC-PAGE-003, TC-CORP-002 | Covered |
| AC-F4-2 | Determinism under the new codes/fields (twice in-process, across runs; identically ordered attribute enumerations; verbatim page echo) + fast-fail first blocking deep-equals collect-all first diagnostic | TC-DET-001, TC-CORP-003 | Covered |
| AC-F5-1 | 12/12 GH-31 categories have storage-side counterparts with pinned sidecar expectations — supported categories (emoji, long-page, macro-code, mixed task/regular lists) pin zero-diagnostic conversions; every counterpart deep-equals its sidecar | TC-CORP-001, TC-CORP-003 | Covered |
| AC-F5-2 | New classes each ≥1 fixture — complex layout, exotic table attributes (incl. multi-attribute single element), task-list misplaced child, page-context echo (incl. parse-error with page) — and the PII grep-audit passes over the extended set | TC-CORP-002, TC-CORP-003 | Covered |
| AC-F6-1 | Every non-canonical element and attribute instance in the complete aligned corpus appears in exactly one pinned diagnostic — zero unclassified, zero silent drops (mechanically enforced by sidecar deep-equality over full diagnostic arrays) | TC-CORP-003, TC-CORP-001 | Covered |
| AC-F7-1 | Corpus A (26) + forward golden (33) + K1 variants → zero new diagnostics; corpus-A round-trip byte-equality 100%; forward fixtures byte-unmodified | TC-FP-001 | Covered |
| AC-F7-2 | 0 new commands/flags/output changes; `ReverseError` remains a standalone union (not a `MarkSyncError` kind); all pre-existing tiers green | TC-CLI-001 | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

No API or EVT surface exists (spec §8.1/§8.2: no HTTP, no CLI, no events). Data-model elements:

| ID | Description | TC ID(s) | Status |
|----|-------------|----------|--------|
| DM-1 | Reverse contract options extension: optional caller-supplied page context (`pageId?`, `title?`, `sourcePath?`); `sourcePath` absorbed as convenience; optional-parameters-only signature growth | TC-PAGE-001, TC-PAGE-002, TC-PAGE-003 | Covered |
| DM-2 | Diagnostic payload extension: page context on every arm (omitted when absent); blocking class discriminator widens to the granular codes; `construct` + element `location` unchanged; no content echoes, attribute names only | TC-PAGE-001, TC-PAGE-002, TC-ATTR-001, TC-TAXO-002 | Covered |
| DM-3 | `REVERSE_CODES` registry: additions-only growth (4 new codes, 0 removals/renames); emitted-assignment change for two classes; assignment map normative and unit-pinned | TC-TAXO-001, TC-TAXO-002, TC-RPIN-001 | Covered |
| DM-4 | Adversarial corpus + sidecar schema: GH-31 alignment (12/12) + new-class fixtures; sidecar entries pin `{ code, construct, location, page? }`; category inventory requires the new classes; PII audit covers additions | TC-CORP-001, TC-CORP-002, TC-CORP-003, TC-RPIN-001 | Covered |

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | TC ID(s) | Status / Notes |
|--------|-------------|----------|----------------|
| NFR-1 | Detection completeness: 100% of non-canonical elements **and attributes** in the aligned corpus produce diagnostics; 0 silent drops; 0 unclassified instances | TC-CORP-003, TC-CORP-001, TC-ATTR-001, TC-TASK-001 | Covered — enforced mechanically by full-array sidecar deep-equality over the whole corpus |
| NFR-2 | Determinism: deep-equal diagnostics across repeated conversions; attribute enumerations sorted + deduplicated; page echo verbatim (no synthesis) | TC-DET-001, TC-ATTR-001, TC-PAGE-001, TC-CORP-003 | Covered |
| NFR-3 | No false positives on canonical input: 0 new diagnostics over corpus A + forward golden + K1 variants; corpus-A byte-equality 100%; forward fixtures byte-unmodified | TC-FP-001 | Covered |
| NFR-4 | Code stability: registry additions-only; every code value unit-pinned; assignment map normative; re-assignment post-E2/E3-bind forbidden | TC-TAXO-001, TC-TAXO-002, TC-RPIN-001 | Covered |
| NFR-5 | Performance: ≤ 200 ms p95 per page Storage→Markdown (informational); extended adversarial corpus CI runtime within the golden-tier budget (informational) | TC-CORP-001 (long-page counterpart: timings recorded), §7.4 (suite runtime observed) | Covered (informational by design — no hard gate; mirrors the GH-92 OQ-T3 posture) |
| NFR-6 | Payload hygiene: codes/construct/location/page only — no element text, no attribute **values** (names only), no content echoes; page context caller-supplied, never extracted from the body | TC-ATTR-001, TC-TAXO-002, TC-PAGE-001 | Covered |

## 4. Test Types and Layers

Tier assignments follow the spec AC tier column and `.ai/rules/testing-strategy.md`:

| Tier | Applies? | Role in this change |
|------|----------|---------------------|
| Unit | **Directly** | Registry snapshot + assignment-map pins (literal code strings), per-class classification behavior (macro / layout / orphan / element / attribute / task-list), page-context echo + omit-when-absent + `sourcePath` absorption, determinism probes (shuffled attribute order), fast-fail/collect-all parity on hand-built inputs |
| Integration | **Not applicable** (regression only) | No adapter boundary touched — classification is pure HAST→diagnostics over an already-parsed body (NG-7). Existing suite runs unmodified as green-tree signal |
| Golden fixture | **Directly** (extension only) | Zero-new-diagnostics sweeps + K1 byte-compat re-assertion ride the existing `reverse-round-trip.test.ts` / `reverse-readback.test.ts` harnesses — **assertions added, fixtures unmodified** |
| Golden adversarial | **Directly** | The extended storage-side corpus (GH-31 alignment 12/12 + new classes), runner inventory extension, sidecar schema (`page?`), sidecar deep-equality incl. zero-diagnostic counterparts, PII audit over the extended set, reviewed sidecar re-baseline |
| Mermaid-DOM | **Not applicable** (regression only) | Render-policy artifacts remain parsed-as-data (informational diagnostic); nothing renders on reverse |
| Gherkin / BDD | **Not applicable** (regression only) | Lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) untouched by a pure classification change; `bun run test:bdd` unchanged |
| E2E (mock) | **Not applicable** (regression only) | No sync-pipeline surface; the `e2e-mock` CI job stays green unmodified |
| E2E (live-sandbox) | **Not applicable** | No network behavior; separate opt-in gate, unchanged |

**Explicit statement (per spec §7.2/NG-1):** no integration, e2e, BDD, or Mermaid-DOM scenarios apply — everything new lives in the unit and golden-adversarial tiers (plus additive golden-fixture assertions); all other tiers are the unchanged regression net asserted green by TC-CLI-001.

### 4.1 Unit Tests

- **Framework**: `bun:test` (TDR-0004)
- **Root/pattern**: `tests/unit/**/*.test.ts`, mirroring `src/` layout (`.ai/rules/typescript.md` residence rules)
- **Files**:
  - `tests/unit/domain/markdown/reverse-diagnostics.test.ts` (EXISTING – Update) — TC-TAXO-001/002: registry snapshot (7 literal code strings, additions-only), per-Appendix-A-row assignment assertions
  - `tests/unit/infra/confluence/parse/reverse.test.ts` (NEW — mirrors `src/infra/confluence/parse/reverse.ts`) — TC-ATTR-001/002, TC-LAY-001/002, TC-ELEM-001, TC-TASK-001, TC-PAGE-001/002/003, TC-DET-001: classifier + contract behavior on hand-built minimal Storage strings
- **Conventions**: `#`-prefixed import aliases; hand-built minimal Storage strings (file fixtures would be overkill at this granularity); committed golden fixtures may be read directly (no mocks); no `any` in helpers
- **Routing-pin rule (TDR-0014 pin 2 — applies to every code assertion in this change):** assertions compare `diagnostic.code` against **literal strings** (e.g. `expect(d.code).toBe("reverse/unknown-macro")`) — never against `REVERSE_CODES.*` constants alone (the registry snapshot separately proves the constants equal the literals), never against `construct` text, never against TypeScript `class` labels. The tests are the first consumer: they route on `code` exactly as E2/E3 will.

### 4.2 Golden Adversarial Tests

- **Framework**: `bun:test`, real pipeline — the existing runner pattern (`tests/golden/adversarial/reverse-classification-runner.test.ts`, GH-92), extended in place
- **Runner extensions required** (mechanics, normative for the implementation):
  1. **Sidecar schema**: entries widen to `{ code, construct, location, page? }` (`page` deep-compared when present); parse-error sidecars widen to `{ parseError: true, detail, page? }`
  2. **Success branch**: a sidecar that is an **empty array** (`[]`) pins a zero-diagnostic canonical conversion — collect-all returns `ok` with an empty diagnostics array and fast-fail returns `ok` (conversion succeeds). The current runner assumes every non-parse-error fixture blocks; it must branch on sidecar emptiness. The existing 9 fixtures are unaffected (all non-empty)
  3. **Page-context opt-in**: fixtures exercising page context are declared via a committed companion `<name>.page-context.json` (the exact caller-supplied page object the runner passes as options). Context-free fixtures have no companion → the runner calls with no options → omit-when-absent byte-compat is preserved and existing sidecars need no page re-pin (test-design decision D-TST-4, §7.1)
  4. **Category inventory extension**: the coverage assertions extend to require all 12 Appendix B counterpart categories present with their mapped expectations, plus each new class ≥1 fixture (complex layout incl. orphaned layout, exotic attributes incl. multi-attribute + K1-on-macro negative control, task-list stray child, page context incl. parse-error-with-page)
  5. **PII audit**: walks the directory — automatically covers the new fixtures; the bare-ID scoped-out expectation must remain limited to the known fixtures (`storage-macro-jira`, `storage-multiple-unsupported`)
- **Fixtures**: `tests/adversarial-storage/*.storage.xhtml` + `*.classification.json` — 12 new pairs + 2 page-context companions (§6.2); the set stays beside (not inside) `tests/adversarial/` so the existing `pii-audit.test.ts` directory walk is unaffected (GH-92 PD-5 precedent)

### 4.3 Golden Fixture Tests (extension only)

- **Framework**: the existing `tests/golden/markdown/reverse-round-trip.test.ts` + `reverse-readback.test.ts` harnesses, real pipeline, **no fixture modifications**
- **Additive assertions**: zero-diagnostics sweep over corpus A (26) on every round-trip iteration; K1 variants re-asserted zero-diagnostic + byte-identical to attr-free variants; corpus-B committed expectations unchanged; the synthetic-artifact fixture keeps exactly its pinned 1 informational diagnostic; committed snapshots remain the across-run lock — **no `--update-snapshots` in this change** (byte-equality is unchanged by design; a snapshot diff here is a regression, not a re-baseline)

### 4.4 Harness Mechanics (normative for the implementation)

**Assignment-map unit pin (TC-TAXO-002)** — one representative probe per Appendix A row:

```
row "Foreign/unknown macro"       : <ac:structured-macro ac:name="jira"/>…
  → collectAll → diagnostics[0].code === "reverse/unknown-macro"        // literal, blocking
row "Complex layout"              : <ac:layout><ac:layout-section><ac:layout-cell><p>x</p></…>
  → exactly 1 diagnostic, code === "reverse/complex-layout"             // literal, blocking
row "Non-canonical attribute"     : <table><tbody><tr><td colspan="2">x</td></tr></…>
  → diagnostics[0].code === "reverse/unsupported-attribute"             // literal, blocking
row "Non-canonical element"       : <div>x</div> → "reverse/unknown-element"      // literal, blocking
row "Structural violation"        : table nested in <td> → "reverse/unsupported-construct" (retained)
row "Marksync synthetic artifact" : render-policy image → "marksync/synthetic-artifact" (informational, unchanged)
row "Malformed Storage"           : mismatched tags → "reverse/parse-error" (error arm, unchanged)
```

**Attribute aggregation (TC-ATTR-001)** — spec Flow 1, DEC-5:

```
storage  = <table><tbody><tr><td colspan="2" rowspan="3" style="…" class="x" data-table-width="…">…</td>
                       <td style="…">y</td></tr></tbody></table>
all      = reverseStorageCollectAll(storage)
expect(all.diagnostics).toHaveLength(2)                     // one per offending element — never per attribute
expect(all.diagnostics[0].code).toBe("reverse/unsupported-attribute")
expect(all.diagnostics[0].location).toEqual(elementStart(td₁))          // element-start, not attribute position
// construct identity enumerates the offending names SORTED + DEDUPLICATED (exact display form = OQ-T1;
// sidecars pin whatever ships — sorted-ness + determinism are the assertions), plus:
expect(namesEnumeratedSorted(d0.construct)).toEqual(
  ["class","colspan","data-table-width","rowspan","style"])             // lexicographic
expect(JSON.stringify(all.diagnostics)).not.toMatch(/attribute-value-probes/)  // NO values in the payload (NFR-6)
```

**Layout single-construct rule (TC-LAY-001/002)** — DEC-4 + TDR-0014 pin 1:

```
full tree    : <ac:layout><ac:layout-section><ac:layout-cell>…<ac:layout-cell>…</…> (any depth)
  → exactly 1 blocking "reverse/complex-layout", location = outermost <ac:layout> start
  → zero per-section/per-cell diagnostics (and zero additional diagnostics for inner
    canonical content — the tree is ONE construct, macro-children precedent)
orphan tree  : <ac:layout-section><ac:layout-cell><p>x</p></…> (NO ac:layout ancestor)
  → exactly 1 blocking "reverse/complex-layout" at the OUTERMOST family element present (the section)
  → never "reverse/unknown-element", never per-cell multiples    // TDR-0014 pin — by rule, not accident
sibling trees: two independent <ac:layout> trees in one body → exactly 2 diagnostics (one per tree)
```

**Page-context echo (TC-PAGE-001)** — DEC-2, exercised per arm:

```
page   = { pageId: "12345", title: "Runbook", sourcePath: "docs/runbook.md" }
blocking arm      : reverseStorage(bodyWithUnknownMacro, { page }).error.page deep-equals page (verbatim)
informational arm : collectAll(bodyWithSyntheticImage, { page }).value.diagnostics[0].page deep-equals page
parse-error arm   : reverseStorage(malformed, { page }).error.page deep-equals page
partial context   : { pageId: "7" } → echoed as { pageId: "7" } — title/sourcePath NEVER synthesized (NFR-2)
```

**Omit-when-absent byte-compat (TC-PAGE-002)**:

```
without    = reverseStorageCollectAll(storageX)                    // no options
withUndef  = reverseStorageCollectAll(storageX, undefined)         // explicit undefined
expect(JSON.stringify(without.diagnostics)).toBe(JSON.stringify(withUndef.diagnostics))
// serialized diagnostics contain no "page" key — shape- and byte-identical to the GH-92 form
// (golden corroboration: the 9 existing context-free sidecars pass unmodified — TC-RPIN-001/TC-CORP-003)
```

**Fast-fail / collect-all parity under new fields (TC-DET-001)** — extends the GH-92 §4.4 mechanic: the first **blocking** entry in collect-all deep-equals the fast-fail error on `code`/`construct`/`location`/`page` (informational-first orderings compare field-level, GH-92 F-15 precedent).

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage | Test Type |
|-------|-------|------|-------|----------|-------------|-----------|
| TC-TAXO-001 | Registry snapshot: exactly 7 codes, literal strings, additions-only vs 0.9.0 | Regression | Critical | High | AC-F1-1..3 (codes exist), F-5, NFR-4, DM-3 | Unit |
| TC-TAXO-002 | Assignment-map pin: every Appendix A row → mapped literal code + severity | Negative | Critical | High | AC-F1-1, AC-F1-3, AC-F2-1, F-1, F-5, NFR-4, DM-3 | Unit |
| TC-ELEM-001 | Non-canonical elements → `reverse/unknown-element`; structural violations stay on the fallback | Negative | Critical | High | AC-F1-3, F-1, DM-2 | Unit |
| TC-LAY-001 | Complex layout: exactly one `reverse/complex-layout` per layout tree at the outermost element | Negative | Critical | High | AC-F1-2, DEC-4, DM-2 | Unit |
| TC-LAY-002 | Orphaned layout family: one `reverse/complex-layout` at the outermost family element present | Corner Case | Critical | High | AC-F1-2, DEC-4, TDR-0014 pin 1 | Unit |
| TC-ATTR-001 | Attribute aggregation: one diagnostic per element, sorted dedup names, element-start location, no values | Negative | Critical | High | AC-F2-1, DEC-5, NFR-2, NFR-6 | Unit |
| TC-ATTR-002 | Mirror-allowlist boundary: canonical attrs silent; K1 silent on macros only; K1 names elsewhere diagnosed | Edge Case | Critical | High | AC-F2-1, AC-F2-2 (unit arm), Appendix C, DEC-5 | Unit |
| TC-TASK-001 | Task-list integrity: stray children diagnosed by class at the child; canonical mixed lists zero-diagnostic | Negative | Critical | High | AC-F3-1, DEC-6, F-3 | Unit |
| TC-PAGE-001 | Page-context echo verbatim on blocking, informational, and parse-error arms; partial context never synthesized | Happy Path | Critical | High | AC-F4-1, DEC-2, DM-1, DM-2, OQ-4 | Unit |
| TC-PAGE-002 | Omit-when-absent byte-compat + optional-parameters-only signatures | Regression | Critical | High | AC-F4-1, DEC-2, DM-1, RSK-4 | Unit |
| TC-PAGE-003 | `sourcePath` absorption + precedence (explicit page wins, no merge) | Edge Case | Important | High | AC-F4-1, DEC-2, DM-1 | Unit |
| TC-DET-001 | Determinism + fast-fail/collect-all parity under the new codes and fields | Corner Case | Critical | High | AC-F4-2, NFR-2, F-4, F-5 | Unit + Golden adversarial |
| TC-CORP-001 | GH-31 alignment 12/12: every category has a pinned counterpart; supported categories pin zero-diagnostic conversions | Happy Path | Critical | High | AC-F5-1, DEC-3, DM-4, NFR-5 | Golden adversarial |
| TC-CORP-002 | New-class fixture inventory (layout incl. orphan, exotic attrs incl. multi-attribute + K1 negative control, task-list child, page context incl. parse-error-with-page) + PII audit | Regression | Critical | High | AC-F5-2, DM-4, NFR-1 | Golden adversarial |
| TC-CORP-003 | Completeness over the full corpus: sidecar deep-equality of entire diagnostic arrays — zero unclassified, zero silent drops | Negative | Critical | High | AC-F6-1, AC-F5-1, NFR-1, NFR-2 | Golden adversarial |
| TC-RPIN-001 | Reviewed sidecar re-baseline: only `code` changes on the 7 affected sidecars; construct/location stable; review-visible | Regression | Critical | High | F-5, spec §8.5, RSK-2, DM-3 | Golden adversarial + Semi-automated review |
| TC-FP-001 | False-positive guard: zero new diagnostics over corpus A + forward golden + K1 variants; byte-equality unchanged | Regression | Critical | High | AC-F7-1, AC-F2-2, NFR-3, F-7 | Golden |
| TC-CLI-001 | Library-only boundary: 0 CLI delta, standalone `ReverseError`, all pre-existing tiers green, v0.10.0 | Regression | Critical | High | AC-F7-2, NG-1, DM-1 | CI + Manual (structural) |

### 5.2 Scenario Details

#### TC-TAXO-001 - Registry snapshot: exactly 7 codes, literal strings, additions-only

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, NFR-4, DM-3, TDR-0014 C-1/C-6, AC-F1-1..3 (code existence)
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/reverse-diagnostics.test.ts`
**Tags**: @backend, @unit, @diagnostics, @contract-freeze

**Preconditions**:

- The extended `REVERSE_CODES` registry implemented (DM-3)

**Steps**:

1. Enumerate `REVERSE_CODES` values; assert the set contains **exactly 7** entries: `reverse/unknown-macro`, `reverse/complex-layout`, `reverse/unsupported-attribute`, `reverse/unknown-element`, `reverse/unsupported-construct`, `marksync/synthetic-artifact`, `reverse/parse-error`
2. Assert each value equals its **literal string** as written in the test — never a self-referential constant-to-constant comparison
3. Assert the three 0.9.0 values (`reverse/unsupported-construct`, `marksync/synthetic-artifact`, `reverse/parse-error`) are present and unchanged — 0 removals, 0 renames (additions-only, TDR-0014 C-1)
4. Assert the 5 blocking-path codes are pairwise distinct and distinct from the informational and parse-error codes (bounded vocabulary, TDR-0014 C-6: growth by class only — the snapshot makes accidental growth review-visible)

**Expected Outcome**:

- The registry is exactly the frozen 7-code set with literal-pinned values; any accidental addition, removal, or rename fails CI (NFR-4)

---

#### TC-TAXO-002 - Assignment-map pin: every Appendix A row → mapped literal code + severity

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-5, AC-F1-1, AC-F1-3, AC-F2-1, NFR-4, DM-2, DM-3, TDR-0014 C-2/C-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/markdown/reverse-diagnostics.test.ts` (assignment rows via the real contract entry points)
**Tags**: @backend, @unit, @diagnostics, @contract-freeze

**Preconditions**:

- Classifier extension implemented (F-1, F-2)

**Steps**:

1. For each Appendix A row, run `reverseStorageCollectAll` on a minimal hand-built representative Storage probe (§4.4 mapping): jira macro; full `ac:layout` tree; `td colspan`; `div`; table nested in `td`; render-policy synthetic image; malformed XML
2. Assert each probe's diagnostic `code` equals the mapped **literal string** (`"reverse/unknown-macro"`, `"reverse/complex-layout"`, `"reverse/unsupported-attribute"`, `"reverse/unknown-element"`, `"reverse/unsupported-construct"`, `"marksync/synthetic-artifact"`, `"reverse/parse-error"`) — per the routing-pin rule (§4.1): never `construct` text, never `class` labels, never bare constants
3. Assert severities: the four new classes + the fallback are **blocking**; synthetic-artifact stays **informational**; parse-error stays the error arm (exactly two severity classes — TDR-0014 C-4)
4. Assert the macro probe emits exactly one diagnostic for the macro construct — the macro's children are not separately diagnosed (AC-F1-1 clause)

**Expected Outcome**:

- 100% of Appendix A rows covered by construct-class→code assertions; the normative assignment map is mechanically frozen — code drift fails CI, not E2/E3 (NFR-4; TDR-0014 verification criterion 1)

---

#### TC-ELEM-001 - Non-canonical elements → `reverse/unknown-element`; structural violations stay on the fallback

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-5, AC-F1-3, DM-2, DM-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse.test.ts`
**Tags**: @backend, @unit, @classification

**Preconditions**:

- Granular classification implemented

**Steps**:

1. Feed Storage with a block-level `div`, an inline `span`, and an unknown `ac:*` element (e.g. `ac:widget`) — each in its own probe and all three in one mixed body
2. Assert each produces a blocking diagnostic with code `"reverse/unknown-element"`, the element identity in `construct`, and the element's `line:column` location
3. Feed a table nested inside `td`/`th`: assert the code is still `"reverse/unsupported-construct"` (the retained structural fallback — unchanged class, Appendix A row 5)
4. In the mixed body, assert collect-all lists the diagnostics in document order and fast-fail's first blocking deep-equals collect-all's first (full parity in TC-DET-001)

**Expected Outcome**:

- Every non-canonical element class yields its own blocking code with identity + location; structural violations keep the fallback code — the F-1 partition holds element-by-element (AC-F1-3)

---

#### TC-LAY-001 - Complex layout: exactly one `reverse/complex-layout` per layout tree at the outermost element

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-2, DEC-4, DM-2, RSK-7
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse.test.ts`
**Tags**: @backend, @unit, @classification, @layout

**Preconditions**:

- Layout classification implemented (F-1, DEC-4)

**Steps**:

1. Feed an `ac:layout` tree with nested `ac:layout-section`/`ac:layout-cell` at ≥2 depth levels, cells containing canonical content (`p`, a small table)
2. Assert **exactly one** blocking diagnostic: code `"reverse/complex-layout"`, location = the outermost `ac:layout` element start
3. Assert zero per-section and zero per-cell diagnostics — and zero additional diagnostics for canonical content inside cells (the tree is ONE construct; sections/cells/inner content are part of it — DEC-4 plus the macro-children precedent)
4. Feed a body with two sibling `ac:layout` trees: assert exactly 2 diagnostics (one per tree), each located at its own outermost element
5. Assert both contract modes agree: fast-fail error deep-equals collect-all's first blocking on code/construct/location

**Expected Outcome**:

- One diagnostic per layout tree, located at the outermost layout element, in both modes — no double-reporting (RSK-7 closed by pin, not by accident)

---

#### TC-LAY-002 - Orphaned layout family: one diagnostic at the outermost family element present

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-2, DEC-4, TDR-0014 clarifying pin 1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse.test.ts`
**Tags**: @backend, @unit, @classification, @layout, @edge-case

**Preconditions**:

- Layout classification implemented with the orphan rule reading "outermost layout-family element present" (TDR-0014 pin — the edge case is classified by rule, not by implementation accident)

**Steps**:

1. Feed `ac:layout-section` > `ac:layout-cell` with **no** `ac:layout` ancestor: assert exactly one blocking `"reverse/complex-layout"` located at the outermost family element present (the section's start)
2. Assert the code is **never** `"reverse/unknown-element"` for any layout-family element
3. Assert there are **never** multiple per-cell diagnostics for the orphaned family
4. Feed a lone `ac:layout-cell` (no ancestors at all): assert exactly one `"reverse/complex-layout"` at the cell
5. Both contract modes agree per instance

**Expected Outcome**:

- Orphaned layout-family elements classify as ONE `reverse/complex-layout` construct at the outermost family element present — the TDR-0014 pin holds verbatim (AC-F1-2 extended to the orphan edge)

---

#### TC-ATTR-001 - Attribute aggregation: one diagnostic per element, sorted dedup names, no values

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-1, DEC-5, NFR-2, NFR-6, RSK-5, DM-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse.test.ts`
**Tags**: @backend, @unit, @attributes, @determinism

**Preconditions**:

- Attribute pass over canonical elements implemented (F-2; mirror allowlist per Appendix C)

**Steps**:

1. Feed a `td` carrying all five ticket-named exotic attributes (`colspan`, `rowspan`, `style`, `class`, `data-table-width`): assert **exactly one** blocking `"reverse/unsupported-attribute"` diagnostic for that element — never one per attribute (aggregation bounds diagnostic storms, RSK-5)
2. Assert the construct identity enumerates the offending attribute **names sorted and deduplicated** (lexicographic; see OQ-T1 on the exact display form). Probe determinism by writing the same element with shuffled source attribute order in two bodies and asserting identical diagnostics — input-order independence (NFR-2)
3. Assert the location is the **element start** `line:column` (element-level per spec OQ-2; attribute byte positions are out of scope)
4. Assert the serialized payload contains **no attribute values** anywhere (NFR-6 — values can carry user content; names only)
5. Feed a body with multiple offending elements (two exotic `td`s + an `ac:image` with user-set `ac:width`/`ac:align`): assert one diagnostic per element, document order, distinct locations
6. Both contract modes agree per instance; same input twice → deep-equal diagnostics

**Expected Outcome**:

- Every attribute violation is diagnosed exactly once per element with deterministic sorted-name enumeration, element-start location, and a value-free payload (AC-F2-1 complete)

---

#### TC-ATTR-002 - Mirror-allowlist boundary: canonical attrs silent; K1 silent on macros only

**Scenario Type**: Edge Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, F-7, AC-F2-1, AC-F2-2 (unit arm), DEC-5, Appendix C, NFR-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse.test.ts`
**Tags**: @backend, @unit, @attributes, @boundary

**Preconditions**:

- Mirror allowlist implemented exactly per Appendix C (an attribute is canonical on an element iff the forward converter emits it there)

**Steps**:

1. **Canonical-attribute silence**: feed every allowlisted pairing — `a[href]`, `ac:image[ac:alt]`, `ri:attachment[ri:filename]`, `ri:url[ri:value]`, `ac:structured-macro[ac:name]`, `ac:parameter[ac:name]`, plus a no-attribute sweep over the remaining canonical elements — assert zero diagnostics on all
2. **K1 carve-out confined to macros**: feed `ac:structured-macro[ac:name="code", ac:schema-version, ac:macro-id]` — assert zero diagnostics and output byte-identical to the attribute-free variant (the carve-out survives verbatim)
3. **K1 names elsewhere are exotic**: feed `p[ac:macro-id]` and `td[ac:schema-version]` — assert blocking `"reverse/unsupported-attribute"` for each (sanctioned on macros only, per ADR-0005 spike K1)
4. Structural (pretty-print) whitespace and the provenance-panel strip remain silent (GH-92 DEC-6) — no attribute-pass regressions on the silent classes

**Expected Outcome**:

- The allowlist boundary is exactly Appendix C: canonical vocabulary silent, K1 silent on `ac:structured-macro` only, everything else diagnosed — the false-positive surface pinned at unit granularity before the corpus sweeps (AC-F2-1/AC-F2-2 boundary)

---

#### TC-TASK-001 - Task-list integrity: stray children diagnosed by class; canonical mixed lists zero-diagnostic

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, DEC-6, DM-2
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse.test.ts`
**Tags**: @backend, @unit, @task-lists

**Preconditions**:

- Task-list child handling extended (F-3, DEC-6)

**Steps**:

1. Feed an `ac:task-list` containing a non-canonical child (e.g. `span`): assert a blocking `"reverse/unknown-element"` diagnostic **located at the child**
2. Feed an `ac:task-list` containing an individually-canonical but misplaced child (e.g. `p`): assert a blocking `"reverse/unsupported-construct"` diagnostic at the child (structural-fallback class)
3. Feed a mixed task list — canonical `ac:task` children plus one stray: assert only the stray is diagnosed; the canonical tasks are never separately flagged
4. Feed a canonical mixed task/regular-list body (regular `ul`/`ol` alongside `ac:task-list`): assert conversion succeeds with **zero diagnostics** (the supported GH-31 category stays supported — false-positive guard)
5. Both contract modes agree per instance

**Expected Outcome**:

- No child of `ac:task-list` is ever silently dropped: unknown children → `unknown-element`, misplaced canonical children → structural fallback, both located at the child; canonical task lists stay zero-diagnostic (AC-F3-1 both clauses)

---

#### TC-PAGE-001 - Page-context echo verbatim on all diagnostic arms

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, DEC-2, DM-1, DM-2, OQ-4, NFR-2, NFR-6
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse.test.ts`
**Tags**: @backend, @unit, @page-context

**Preconditions**:

- Page-context option implemented (DM-1) and threaded into all diagnostic arms (DM-2)

**Steps**:

1. **Blocking arm**: `reverseStorage(bodyWithUnknownMacro, { page: { pageId: "12345", title: "Runbook", sourcePath: "docs/runbook.md" } })` — assert the fast-fail error carries `page` **deep-equal to the supplied object** (verbatim echo, no synthesis)
2. **Informational arm**: collect-all over a body with a render-policy synthetic image + the same page — assert the informational `marksync/synthetic-artifact` diagnostic carries the same verbatim `page` (OQ-4: uniform echo)
3. **Parse-error arm**: malformed Storage + page — assert the `StorageParseError` carries the same verbatim `page` (the arm E2/E3 will hit on corrupted fetches)
4. **Partial context**: `{ pageId: "7" }` only — assert the echo is exactly `{ pageId: "7" }`; `title`/`sourcePath` are never invented (NFR-2 no-synthesis)
5. **No body extraction**: a body whose text content resembles a title/path — assert the page context is only ever the caller-supplied object (the library never extracts identity from the body, NFR-6)

**Expected Outcome**:

- Every diagnostic arm echoes the caller-supplied page context verbatim — one rendering path for E2/E3; partial contexts pass through as-is (AC-F4-1 echo clause)

---

#### TC-PAGE-002 - Omit-when-absent byte-compat + optional-parameters-only signatures

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, DEC-2, DM-1, RSK-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse.test.ts`
**Tags**: @backend, @unit, @page-context, @regression

**Preconditions**:

- Page-context option implemented as optional (DM-1)

**Steps**:

1. Call both contract entry points **without options** and with explicit `undefined` on identical Storage covering all diagnostic classes (blocking, informational success, parse-error): assert the results are deep-equal and **byte-identical** after JSON serialization
2. Assert the serialized diagnostics contain **no `page` key** — the field is omitted entirely, not `null`-valued (shape- and byte-identical to the context-free GH-92 form)
3. Assert existing in-tree call sites compile unchanged: the existing runner, golden harnesses, and unit suites call `reverseStorage(body)` / `reverseStorageCollectAll(body)` with zero edits and typecheck green (optional-parameters-only growth; TC-CLI-001 re-verifies no call-site churn structurally)
4. Golden-tier corroboration: the 9 existing context-free sidecars (post code re-pin, TC-RPIN-001) pass the runner's deep-equality **without any page field** — the committed contract form is unchanged

**Expected Outcome**:

- Context-free output is byte-identical to GH-92; existing callers and sidecars are unaffected unless they opt in — RSK-4 closed by pin (AC-F4-1 omit clause + signature clause)

---

#### TC-PAGE-003 - `sourcePath` absorption + precedence

**Scenario Type**: Edge Case
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-4, AC-F4-1, DEC-2, DM-1
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse.test.ts`
**Tags**: @backend, @unit, @page-context

**Preconditions**:

- Reserved `sourcePath` option absorbed as a convenience (DEC-2)

**Steps**:

1. Call with `{ sourcePath: "docs/x.md" }` and **no explicit page context**: assert diagnostics carry `page === { sourcePath: "docs/x.md" }` — the reserved option populates the page context's `sourcePath` (only that key; nothing else synthesized)
2. Call with both `{ sourcePath: "top.md", page: { pageId: "9" } }`: assert the echo is exactly `{ pageId: "9" }` — the explicit page wins **verbatim, no merge** (absorption applies only "when no explicit page context is given"; interpretation pinned here — see OQ-T2)
3. Repeat both probes on a blocking body and a parse-error body (both arms exercise absorption identically); same input twice → identical echo (determinism)

**Expected Outcome**:

- The reserved option is absorbed exactly as specified, with explicit page taking precedence and no field merging — the convenience path is deterministic and arm-uniform

---

#### TC-DET-001 - Determinism + fast-fail/collect-all parity under new codes and fields

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, F-5, AC-F4-2, NFR-2, DM-2
**Test Type(s)**: Unit + Golden adversarial
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/infra/confluence/parse/reverse.test.ts` (hand-built); `tests/golden/adversarial/reverse-classification-runner.test.ts` (fixture-driven)
**Tags**: @backend, @unit, @golden, @determinism, @parity

**Preconditions**:

- Granular codes + page context implemented

**Steps**:

1. Hand-built mixed body (unknown macro + layout + exotic `td` + stray task-list child) with page context: convert twice in-process — assert the two collect-all results are deep-equal (identically ordered attribute enumerations, verbatim page echo)
2. Shuffle the source order of attributes on the exotic element between two otherwise-identical bodies: assert identical diagnostics (sorted enumeration is input-order-independent)
3. Fast-fail vs collect-all: assert the fast-fail error deep-equals collect-all's **first blocking** diagnostic on `code`/`construct`/`location`/`page` — parity preserved under the new codes and the new field (informational-first orderings compare the first *blocking* entry, GH-92 F-15 precedent)
4. Golden arm: the runner's per-fixture determinism assertions (classify twice → byte-identical) extend automatically over the enlarged corpus; committed sidecars are the across-run lock — deep-equality must hold on every CI run and machine

**Expected Outcome**:

- Diagnostics are deterministic in-process and across runs under the granular taxonomy; per-instance verdicts are identical in both contract modes incl. the page field (AC-F4-2 both clauses)

---

#### TC-CORP-001 - GH-31 alignment 12/12 with pinned counterparts

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, AC-F5-1, DEC-3, DM-4, Appendix B, NFR-5
**Test Type(s)**: Golden adversarial
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/adversarial/reverse-classification-runner.test.ts`; fixtures `tests/adversarial-storage/` (§6.2)
**Tags**: @backend, @golden, @adversarial, @alignment

**Preconditions**:

- 5 new counterpart fixtures committed with pinned sidecars: `storage-macro-code` (`[]`), `storage-raw-html-inline` (1× `"reverse/unknown-element"`), `storage-emoji` (`[]`), `storage-long-page` (`[]`), `storage-mixed-task-regular-lists` (`[]`); the 7 existing counterparts re-pinned per Appendix B (TC-RPIN-001)

**Steps**:

1. Runner asserts the **alignment inventory**: every Appendix B row resolves to a storage-side fixture with a committed sidecar — jira/toc/expand/info-non-panel/app-gliffy → `"reverse/unknown-macro"`; macro-code/emoji/long-page/mixed-lists → `[]` (zero-diagnostic); nested-tables → `"reverse/unsupported-construct"`; raw-html-block → `"reverse/unknown-element"`; raw-html-inline → `"reverse/unknown-element"` with the direction-dependent outcome (forward escapes inline HTML, reverse blocks the element) documented by the pinned expectation itself
2. For each zero-diagnostic counterpart: collect-all returns `ok` with an empty diagnostics array (deep-equals `[]`) **and** conversion succeeds — the supported categories are proven not over-detected (the false-positive guard inside the adversarial tier)
3. For each blocking counterpart: collect-all deep-equals the sidecar (code/construct/location, `page` where provided) and fast-fail blocks on the first entry
4. Long-page counterpart (≥50 KB / ≥1000 lines storage-side): classify twice → byte-identical (determinism pinned); record per-fixture timing against the NFR-5 informational ≤ 200 ms p95 ceiling (no hard gate)

**Expected Outcome**:

- 12/12 GH-31 categories have storage-side counterparts whose diagnostics deep-equal their pinned sidecars; supported categories pin zero-diagnostic conversions — alignment is mechanical, not aspirational (AC-F5-1; KPI "GH-31 categories with storage-side counterparts: 12/12")

---

#### TC-CORP-002 - New-class fixture inventory + PII audit over the extended set

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, AC-F5-2, DM-4, NFR-1, TDR-0014 pin 1
**Test Type(s)**: Golden adversarial
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/adversarial/reverse-classification-runner.test.ts`
**Tags**: @backend, @golden, @adversarial, @inventory, @pii

**Preconditions**:

- New-class fixtures committed (§6.2): `storage-complex-layout`, `storage-orphaned-layout`, `storage-exotic-attributes`, `storage-k1-macro-negative`, `storage-task-list-stray-child`, `storage-page-context`, `storage-malformed-page-context` (+ `.page-context.json` companions for the last two)

**Steps**:

1. Extend the runner's category-coverage inventory to require each new class ≥1 fixture: complex layout (full tree), **orphaned layout** (the TDR-0014 pin fixture — required as a category, satisfied by name, never accidentally), exotic table attributes incl. a **multi-attribute single element** (≥2 offending names on one `td`) and the **K1-on-macro negative control** (`storage-k1-macro-negative` pinning `[]`), task-list misplaced child (both child classes), page-context echo (blocking arm) and **parse-error with page**
2. Assert each new-class fixture's sidecar deep-equality (rides the TC-CORP-003 loop) — e.g. `storage-complex-layout` pins exactly 1 `"reverse/complex-layout"`; `storage-orphaned-layout` pins exactly 1 at the outermost family element; `storage-page-context` pins `page` on every entry incl. the informational one; `storage-malformed-page-context` pins `{ parseError: true, detail, page }`
3. PII grep-audit over the extended set: email pattern → 0 matches; internal-ticket-URL pattern → 0 matches; bare-ID pattern → matches only in the known scoped-out fixtures (`storage-macro-jira`, `storage-multiple-unsupported`) — **no new scoped-out entries** (new fixtures are synthetic and sanitized by construction)

**Expected Outcome**:

- The ticket's added classes are each mechanically represented (KPI 4/4: complex layout, exotic attribute, task-list child, page context — each with ≥1 fixture + sidecar); the extended corpus passes the PII audit (AC-F5-2)

---

#### TC-CORP-003 - Completeness: full-array sidecar deep-equality over the whole corpus

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-2, F-3, F-6, AC-F6-1, AC-F5-1, NFR-1, NFR-2, DM-4
**Test Type(s)**: Golden adversarial
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/adversarial/reverse-classification-runner.test.ts`
**Tags**: @backend, @golden, @adversarial, @no-silent-drop

**Preconditions**:

- Complete extended corpus committed: 9 existing (7 re-pinned, 2 unchanged) + 12 new fixtures + 2 companions

**Steps**:

1. For every fixture in `tests/adversarial-storage/` (directory-driven, never a hand-listed array): run collect-all; deep-compare the **entire** diagnostics array to the committed sidecar (code, construct, location, `page?` where the fixture opts in) — every non-canonical element and attribute instance appears in exactly one pinned diagnostic; nothing missing, nothing extra, nothing unclassified
2. Success branch: sidecar `[]` → `ok === true`, empty diagnostics, conversion succeeds (the runner's new branch; existing non-empty fixtures keep the blocking branch)
3. Parse-error branch: `{ parseError: true, detail, page? }` → both modes return the `StorageParseError` with matching detail/location/page; never a crash, never partial output
4. Parity + determinism per fixture (existing runner assertions, now over the enlarged set): fast-fail first blocking deep-equals collect-all first blocking; classify twice → byte-identical
5. Zero-diagnostic discipline: the canonical counterparts (macro-code, emoji, long-page, mixed-lists, k1-macro-negative) are pinned as `[]` **explicitly** — a regression that starts emitting diagnostics there fails the deep-equality loudly

**Expected Outcome**:

- Zero unclassified non-canonical instances, zero silent drops, zero over-detections over the full corpus — detection completeness (NFR-1 / C-4) mechanically enforced by sidecar deep-equality, not by sampling (AC-F6-1)

---

#### TC-RPIN-001 - Reviewed sidecar re-baseline for the two re-assigned classes

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, DM-3, DM-4, spec §8.5, RSK-2, TDR-0014 C-1, NFR-4
**Test Type(s)**: Golden adversarial + Semi-automated (scripted stability check + human review)
**Automation Level**: Semi-automated
**Target Layer / Location**: `tests/adversarial-storage/*.classification.json` (7 edited sidecars); stability check + PR review
**Tags**: @backend, @golden, @rebaseline, @review-visible

**Preconditions**:

- Re-assignment implemented: unknown-macro and unknown-element classes emit their new codes

**Steps**:

1. Re-pin the affected sidecars from classifier output, then human-review each entry against Appendix A: `storage-macro-jira`, `storage-macro-toc`, `storage-macro-expand`, `storage-macro-info-no-marker`, `storage-app-gliffy`, `storage-multiple-unsupported` (all macro entries) → `"reverse/unknown-macro"`; `storage-raw-html-block` (`div`) → `"reverse/unknown-element"`
2. Scripted stability check against `main`: for every re-pinned sidecar, diff old→new and assert **only the `code` values changed** — `construct` and `location` of every entry are byte-stable (the classification didn't move, only the code vocabulary did); any construct/location drift is a classification change masquerading as a re-pin and fails
3. Assert the two untouched sidecars stay untouched: `storage-nested-tables` (still `"reverse/unsupported-construct"` — the fallback row is unchanged) and `storage-malformed` (parse-error form unchanged) — their sidecars must show **zero diff**
4. Process pin: the re-baseline lands as review-visible edits in this change's PR — never a CI snapshot regen (`--update-snapshots` discipline; sidecars are hand-reviewed JSON, and the scripted stability check makes the review mechanical)
5. Post-re-pin, the TC-CORP-003 loop must be green over the re-pinned fixtures (automated confirmation)

**Expected Outcome**:

- The re-assignment churn is contained, verified, and review-visible: 7 sidecars re-pinned with code-only deltas, 2 provably untouched — RSK-2 closed; the additions-only registry contract holds (0 removals/renames — TC-TAXO-001)

---

#### TC-FP-001 - False-positive guard: zero new diagnostics over canonical corpora

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-7, F-2, AC-F7-1, AC-F2-2, NFR-3, RSK-1, Appendix C
**Test Type(s)**: Golden
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/reverse-round-trip.test.ts` + `tests/golden/markdown/reverse-readback.test.ts` (additive assertions; fixtures unmodified)
**Tags**: @backend, @golden, @regression, @false-positive-guard

**Preconditions**:

- Attribute pass + granular classification implemented; the mirror allowlist is exactly the forward emission vocabulary (Appendix C)

**Steps**:

1. **Corpus A (26)**: on every round-trip iteration, assert the diagnostics array is **empty** in addition to the existing byte-equality + snapshot assertions — the attribute pass is silent on the entire mirror vocabulary
2. **Byte-equality unchanged**: `reverse(forward(md)) === normalize(md)` for 26/26; the committed reverse snapshots are **not re-baselined** — any snapshot diff in this change is a regression, not an update (0 `--update-snapshots` runs)
3. **Forward golden (33 pairs)**: the unmodified `storage-renderer.test.ts` suite stays green; `git diff main --stat` shows 0 modified files under `tests/golden/fixtures/markdown/` (fixtures byte-unmodified)
4. **Corpus B (6)**: reverse from the committed Storage forms still deep-equals the committed expectations (all zero-diagnostic today) — no new diagnostics on annotation/defensive fixtures
5. **K1 variants**: `code-block-python-k1`, `mermaid-code-policy-k1`, `readback-realistic` → zero diagnostics; output byte-identical to the attribute-free variants (AC-F2-2 golden arm — the carve-out re-asserted over the existing fixtures)
6. **Synthetic-artifact fixture**: `mermaid-render-policy` still emits exactly its pinned 1 informational diagnostic — no new diagnostics around the informational arm

**Expected Outcome**:

- 0 new diagnostics over corpus A (26) + forward golden (33) + K1 variants; corpus-A round-trip byte-equality 100% unchanged; forward fixtures byte-unmodified — KPI "new diagnostics over canonical inputs: 0"; the mirror-allowlist/forward-vocabulary lockstep fails-together discipline holds (NFR-3)

---

#### TC-CLI-001 - Library-only boundary: 0 CLI delta, standalone ReverseError, all tiers green

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-7, AC-F7-2, NG-1, DM-1, TDR-0014 C-5
**Test Type(s)**: CI (full-suite green) + Manual (structural diff verification)
**Automation Level**: Semi-automated (CI executes the suites; structural checks scripted/reviewed at delivery and DoD)
**Target Layer / Location**: CI fast loop + `e2e-mock` job + `bun run test:bdd`; structural checks via `git diff main --stat`
**Tags**: @ci, @regression, @quality-gate

**Preconditions**:

- Change complete on the branch; version bumped 0.9.0 → 0.10.0 (DEC-7; PM-confirmed OQ-3)

**Steps**:

1. Structural: `git diff main --stat` shows (a) 0 changes under `src/cli/` (no new command/flag/output), (b) 0 modified files under `tests/golden/fixtures/markdown/` (forward fixtures + corpus untouched — additions only), (c) `tests/golden/markdown/storage-renderer.test.ts` unmodified, (d) the only `tests/adversarial-storage/` diffs are the 7 reviewed re-pins (TC-RPIN-001) plus additions
2. `ReverseError` remains a standalone union, not a `MarkSyncError` kind: type-level check; `src/cli/output/exit-codes.ts` / `src/app/cli-error-map.ts` untouched (the forward `UNSUPPORTED_CONSTRUCT` collision note, TDR-0014 FACT); no in-tree code outside the library's own producer modules and tests renders or routes on reverse codes (consumerless re-check at delivery)
3. `bun test tests/unit/ tests/integration/ tests/golden/` — 0 failures (all pre-existing tiers green incl. every suite extended by this plan)
4. `bun run check` green end-to-end (lint + format:check + typecheck + suite + boundaries); `bun run test:bdd` green; CI `e2e-mock` job green on the PR (unchanged, regression signal)
5. Confirm `package.json` version = 0.10.0 and no new CLI wiring under `src/cli/commands/`

**Expected Outcome**:

- Zero CLI surface delta, the error-channel boundary intact, every pre-existing tier green, version 0.10.0 — the library-only boundary verified structurally, not just by absence of tests (AC-F7-2)

## 6. Environments and Test Data

### 6.1 Required Environments

- **Local development**: Bun (pinned version per CI), filesystem fixture access — no network, no secrets, no Confluence space, no DOM
- **CI (GitHub Actions)**: ubuntu runner, Bun 1.2.23, secrets-free — all new tests land in the existing fast-loop `test` step (`bun test tests/unit/ tests/integration/ tests/golden/` auto-discovers them; zero workflow edits); the unchanged `e2e-mock` job and `test:bdd` step serve as regression signal
- **No other environments**: nothing opt-in, nothing scheduled

### 6.2 Test Data — Extended Storage-Side Adversarial Corpus (DM-4, Appendix B)

**Existing 9 fixtures (carry over; sidecars re-pinned only where codes changed — TC-RPIN-001):**

| Fixture | Alignment category (Appendix B) | Sidecar action |
|---|---|---|
| `storage-macro-jira` | Macro: jira | **re-pin** → `reverse/unknown-macro` (code-only delta) |
| `storage-macro-toc` | Macro: toc | **re-pin** → `reverse/unknown-macro` |
| `storage-macro-expand` | Macro: expand | **re-pin** → `reverse/unknown-macro` |
| `storage-macro-info-no-marker` | Macro: info (non-panel) | **re-pin** → `reverse/unknown-macro` |
| `storage-app-gliffy` | App/gliffy class | **re-pin** → `reverse/unknown-macro` |
| `storage-multiple-unsupported` | Multi-instance (parity/enumeration) | **re-pin** (3 macro entries → `reverse/unknown-macro`) |
| `storage-nested-tables` | Nested tables | **unchanged** (still `reverse/unsupported-construct`) |
| `storage-raw-html-block` | Raw HTML block | **re-pin** (`div` → `reverse/unknown-element`) |
| `storage-malformed` | Malformed (parse-error arm) | **unchanged** (parse-error form) |

**NEW GH-31 counterpart fixtures (5) — completing 12/12:**

| Fixture | Category | Sidecar expectation |
|---|---|---|
| `storage-macro-code` | Macro: code (supported) | `[]` — canonical fence conversion, zero diagnostics (false-positive guard) |
| `storage-raw-html-inline` | Raw HTML inline | 1× `reverse/unknown-element` (inline `span`) — the direction-dependent outcome: forward escapes inline HTML (GH-31 `[]`), reverse blocks the element; the pinned expectation *is* the documentation |
| `storage-emoji` | Emoji (supported) | `[]` — canonical passthrough |
| `storage-long-page` | Long page (supported) | `[]` — ≥50 KB / ≥1000 lines storage-side; determinism pinned; perf informational |
| `storage-mixed-task-regular-lists` | Mixed task/regular lists (supported) | `[]` — canonical conversion (the sibling negative case lives in `storage-task-list-stray-child`) |

**NEW ticket-class fixtures (beyond GH-31, 5):**

| Fixture | Class covered | Sidecar expectation |
|---|---|---|
| `storage-complex-layout` | Complex layout (full tree) | exactly 1× `reverse/complex-layout` at the outermost `ac:layout` |
| `storage-orphaned-layout` | Orphaned layout family (**TDR-0014 pin 1**) | exactly 1× `reverse/complex-layout` at the outermost family element present (section with cells, no `ac:layout` ancestor) |
| `storage-exotic-attributes` | Exotic table attributes + `ac:image` user properties | 3× `reverse/unsupported-attribute` (one per offending element; one element carries colspan+rowspan+style+class+data-table-width — the multi-attribute single-element pin) |
| `storage-k1-macro-negative` | K1-on-macro **negative control** | `[]` — `ac:structured-macro` with `ac:schema-version`+`ac:macro-id` converts canonically; the attribute pass must stay silent (carve-out boundary inside the adversarial tier) |
| `storage-task-list-stray-child` | Task-list misplaced children (both classes) | 2 diagnostics: 1× `reverse/unknown-element` (non-canonical child) + 1× `reverse/unsupported-construct` (canonical-but-misplaced child), both at the child locations |

**NEW page-context fixtures (2) + companions:**

| Fixture | Arm covered | Sidecar expectation |
|---|---|---|
| `storage-page-context` (+ `.page-context.json`) | Blocking + informational echo | 2 entries (`marksync/synthetic-artifact` informational + `reverse/unknown-macro` blocking), each pinning the echoed `page` verbatim |
| `storage-malformed-page-context` (+ `.page-context.json`) | Parse-error echo | `{ parseError: true, detail, page }` |

**Fixture totals:** 12 new fixture+sidecar pairs (24 files) + 2 `.page-context.json` companions = **26 new committed files**; 7 existing sidecars edited (code-only deltas); 0 new/modified files under `tests/golden/fixtures/markdown/` (the false-positive sweep is assertions-only). Golden corpus A/B, Storage-only fixtures (incl. the K1 variants), the partition manifest, and the Markdown-side corpus (`tests/adversarial/`, 12 fixtures) are untouched.

### 6.3 Test Data Generation and Cleanup

- **New sidecars**: generated from the classifier, then human-reviewed before commit (GH-31/GH-92 sidecar process); the zero-diagnostic counterparts pin `[]` explicitly; re-pins verified by the scripted construct/location-stability check (TC-RPIN-001) — never a bulk regen
- **Page-context companions**: hand-authored synthetic page objects (`{ pageId, title, sourcePath }` shapes) — no PII, no real IDs
- **Snapshots**: no re-baselining anywhere in this change — corpus-A snapshots, forward goldens, and their like must show zero diff
- **Cleanup**: none — all test data is committed and immutable; no temp state, no network, no live systems

### 6.4 Isolation Strategy

- All suites exercise **pure functions** over committed files or hand-built strings: no shared mutable state, no environment variables, no network — parallelizable by construction
- New adversarial fixtures land in the existing top-level `tests/adversarial-storage/` (not a subdirectory of `tests/adversarial/` — the pii-audit directory walk must stay un-crashable, GH-92 PD-5); the runner walks the directory, so fixture additions are auto-discovered
- No mocks of any kind (§7.3) — nothing can leak between test files
- The `.page-context.json` companions are inert data unless the runner reads them — context-free fixtures and their sidecars are provably unaffected

## 7. Automation Plan and Implementation Mapping

### 7.1 Test-design decisions (spec-delegated latitude, pinned here)

- **D-TST-1 — Code assertions pin literal strings (routing-pin rule).** Every code assertion in units and sidecars uses the literal `"reverse/…"` strings; the registry snapshot (TC-TAXO-001) separately proves `REVERSE_CODES` values equal the literals. Two-sided lock: neither a registry-value drift nor an assertion-refactor-to-constants can silently pass. Rejected: asserting via `REVERSE_CODES.X` everywhere (self-referential — a typo'd registry value would pass), asserting on `construct`/`class` (TDR-0014 pin 2 forbids — not a stable contract).
- **D-TST-2 — Zero-diagnostic expectations are explicit empty sidecars (`[]`), with a runner success branch.** The supported-category counterparts and the K1 negative control pin emptiness positively — over-detection fails loudly. The runner branches on sidecar emptiness (blocking vs success path); the existing 9 fixtures are all non-empty, so the branch is additive.
- **D-TST-3 — Sidecar re-pins are gated by a scripted construct/location-stability check.** Re-pinning from the classifier under test is self-referential (R-TST-2); the stability check against `main` (only `code` may differ) plus the independently normative Appendix A map (TC-TAXO-002) break the self-reference. Rejected: trusting human review alone (the GH-31 process) — the re-assignment makes review mechanical instead.
- **D-TST-4 — Page-context opt-in via companion `<name>.page-context.json`.** The runner passes page options only for fixtures with a committed companion; every other fixture is called with no options, so omit-when-absent byte-compat holds by construction and no existing sidecar needs a page re-pin. Rejected: applying a global page context in the runner (would force re-pinning all sidecars and destroy the byte-compat proof); encoding context inline in sidecar entries (couples expectation data to invocation mechanics).
- **D-TST-5 — No snapshot re-baselining anywhere in this change.** Corpus-A byte-equality is unchanged by design (AC-F7-1); the two code re-assignments touch hand-reviewed JSON sidecars only. Any snapshot diff in the PR is a regression signal, not an update — reviewers treat it as such.

### 7.2 Implementation mapping

| TC ID | Test File | Execution Command | Mocking Requirements | Implementation Status |
|-------|-----------|-------------------|---------------------|----------------------|
| TC-TAXO-001, TC-TAXO-002 | `tests/unit/domain/markdown/reverse-diagnostics.test.ts` (EXISTING – Update) | `bun test tests/unit/domain/markdown/reverse-diagnostics.test.ts` | None — real contract entry points on hand-built inputs | Existing – Update |
| TC-ELEM-001, TC-LAY-001, TC-LAY-002, TC-ATTR-001, TC-ATTR-002, TC-TASK-001, TC-PAGE-001, TC-PAGE-002, TC-PAGE-003, TC-DET-001 (unit arm) | `tests/unit/infra/confluence/parse/reverse.test.ts` (NEW) | `bun test tests/unit/infra/confluence/parse/reverse.test.ts` | None — hand-built Storage strings | To Implement |
| TC-CORP-001, TC-CORP-002, TC-CORP-003, TC-DET-001 (golden arm) | `tests/golden/adversarial/reverse-classification-runner.test.ts` (EXISTING – Update: success branch, page companions, inventory, schema) | `bun test tests/golden/adversarial/reverse-classification-runner.test.ts` | None — real pipeline | Existing – Update |
| TC-RPIN-001 | `tests/adversarial-storage/*.classification.json` (7 edits) + stability check (script or one-off verified diff at review) | sidecar deep-equality via the runner; stability via reviewed diff/script | None | To Implement (data + review gate) |
| TC-FP-001 | `tests/golden/markdown/reverse-round-trip.test.ts` + `reverse-readback.test.ts` (EXISTING – Update: additive zero-diagnostic assertions) | `bun test tests/golden/markdown/` | None | Existing – Update |
| TC-CLI-001 | CI fast loop + `e2e-mock` job + `test:bdd` + structural `git diff main --stat` checks | `bun test tests/unit/ tests/integration/ tests/golden/ && bun run check && bun run test:bdd` | N/A | Existing suites – No Change + review checklist |
| Forward tripwire | `tests/golden/markdown/storage-renderer.test.ts` | (existing) | None | **Existing – No Change** (must stay green unmodified) |
| `mock.module` scanning guard | `tests/unit/meta/no-mock-module.test.ts` | (existing) | N/A | **Existing – No Change** (covers new files automatically) |

Unit-test file paths mirror the final `src/` module layout; if the plan (phase 4) restructures modules, the test paths follow the modules — the TC↔file mapping above is the contract.

### 7.3 Over-mocking guardrail compliance (TDR-0004 / GH-103)

- **`mock.module` is banned** repo-wide (strategy anti-pattern; enforced by the existing scanning guard `tests/unit/meta/no-mock-module.test.ts`) — this plan uses **zero** module mocking anywhere
- **No mocks at all are needed**: the system under test is pure classification over a Storage string; every scenario drives the real `parseStorage` → classifier → diagnostics pipeline with real inputs (hand-built strings or committed fixtures) — exactly the guardrail's preferred alternative
- Fault injection: not applicable (no network, no I/O to fail); adapter-boundary mocks: not applicable (no adapter touched)
- The scanning guard runs over the new files automatically — a violation fails CI without new wiring

### 7.4 Estimates and CI impact

| Item | Estimate |
|-------|----------|
| New test files | 1 (`tests/unit/infra/confluence/parse/reverse.test.ts`) |
| Updated test files | 4 (reverse-diagnostics unit, adversarial runner, reverse-round-trip, reverse-readback) |
| Test scenarios (TC IDs) | 18 |
| Parametrized `test()` cases at runtime | ~120–140 (21 adversarial fixtures × {deep-equality, parity, determinism} + 26 corpus-A × {equality, zero-diagnostic, snapshot} + ~50 unit probes) |
| New committed fixture files | 26 (§6.2) + 0 generated snapshots |
| Sidecar edits | 7 (code-only deltas, review-visible) |
| New CI jobs / workflow edits | **0** — everything auto-discovered by the existing fast-loop glob |
| Added fast-loop runtime | ~5–10 s (in-process string classification; the long-page fixture dominates — observed against the NFR-5 informational budget; no hard gate) |
| Touched existing fixtures | **0** — golden corpus, K1 variants, manifest, and Markdown-side corpus byte-unmodified |

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Probability | Mitigation |
|----|------|--------|-------------|------------|
| R-TST-1 | Mirror allowlist too strict for the canonical corpora → false positives on corpus A / forward golden / K1 variants (RSK-1's test-side face) | H | M | TC-FP-001 sweeps all three canonical corpora with zero-diagnostic assertions; TC-ATTR-002 pins the Appendix C boundary at unit granularity; a future forward-attribute change that breaks the lockstep fails the same sweep (fail-together) |
| R-TST-2 | Re-pinned sidecars generated by the classifier under test pin its bugs (self-referential re-baseline) | H | M | Scripted construct/location-stability check vs `main` — only `code` may change (TC-RPIN-001); the normative Appendix A map asserted literal-by-literal independently (TC-TAXO-002); human review of every sidecar entry |
| R-TST-3 | Layout classification emits inner-content diagnostics (canonical `p`/table inside cells) violating the exactly-one rule — spec pins sections/cells explicitly, inner content only by the "exactly one per tree" reading | M | M | TC-LAY-001 step 3 pins zero additional diagnostics for inner content; the `storage-complex-layout` sidecar pins exactly 1; assumption A-4 documents the reading — flagged to DoR |
| R-TST-4 | Page-context companion mechanism diverges from the delivery plan's implementation → fixtures exercise nothing silently | M | L | D-TST-4 is directory-driven and asserted: TC-CORP-002 inventory requires the page-context fixtures to satisfy their sidecars *with* companions present; a companion-less run of a page fixture fails deep-equality (no `page` on entries) |
| R-TST-5 | Diagnostic storms on attribute-rich multi-element bodies (RSK-5) inflate collect-all and slow the corpus | M | M | Per-element aggregation pinned (TC-ATTR-001 one-diagnostic-per-element; multi-attribute fixture pins the aggregate); NFR-5 timings recorded on the long-page counterpart — informational, no gate |
| R-TST-6 | Runner success-branch addition destabilizes the existing 9 fixtures | M | L | The branch keys on sidecar emptiness; all existing non-parse-error sidecars are non-empty → blocking path byte-identical to today; parse-error path untouched |
| R-TST-7 | TS-level `class`/`kind` union widening churns existing assertions (the runner asserts `kind: "UnsupportedConstruct"` today) | L | M | Tests pin `code` strings only (routing-pin rule); if the union widens additively, the runner's `kind` assertion is updated once, in-change, review-visible; `kind` labels are never treated as contract (TDR-0014 pin 2) |
| R-TST-8 | Snapshot re-baselining used to "fix" false-positive failures instead of fixing the allowlist | M | L | D-TST-5: zero snapshot updates in this change; a snapshot diff in the PR is a regression signal requiring line-by-line justification (strategy snapshot rule) |

### 8.2 Assumptions

- A-1: The intake inventory is current on `feat/GH-93/unsupported-construct-detection` (off `main @ e0211af`): 9 storage-side adversarial pairs; 12 Markdown-side fixtures; golden partition 26 A / 6 B / 1 excluded + 5 Storage-only (incl. 3 K1-bearing); `REVERSE_CODES` at 3 codes; `ReverseOptions.sourcePath` reserved-unused — verified against the working tree at intake (spec §"Grounded in the tree")
- A-2: Unit tests may read committed fixtures from disk (pure file reads — precedent: the golden runners and GH-31's PII audit)
- A-3: `[]` (empty JSON array) is the zero-diagnostic sidecar form (GH-31 precedent: `emoji.classification.json` etc. are `[]`)
- A-4: "Exactly one diagnostic per layout tree" (AC-F1-2, DEC-4) covers canonical content *inside* cells — the tree is one construct, inner content yields no additional diagnostics (the macro-children precedent); if DoR disagrees, only TC-LAY-001 step 3 and one sidecar entry change
- A-5: "12 GH-31 categories" = the 12 Appendix B rows (finer than GH-31's 6-way `corpus-inventory.test.ts` grouping); the runner inventory pins the Appendix B rows
- A-6: Construct-identity strings for the new classes are implementation-defined display text (TDR-0014: not a stable contract); sidecars pin whatever ships; only the macro-name form is spec-pinned (`ac:structured-macro[ac:name="…"]`, existing behavior)
- A-7: The existing runner's `kind: "UnsupportedConstruct"` assertions may be updated once in-change if the error union widens additively (R-TST-7); code-string assertions are the contract
- A-8: Bun `toMatchSnapshot` determinism holds on the pinned version (established repo practice, ADR-0002 C-1 posture) — no new snapshots are added by this change regardless

### 8.3 Open Questions

| ID | Question | Blocking? | Owner / Resolution path |
|----|----------|-----------|------------------------|
| OQ-T1 | Construct-identity display format for the new classes — esp. `reverse/unsupported-attribute` (how attribute names are serialized into `construct`) and `reverse/complex-layout` / `reverse/unknown-element` identity forms | No — construct is display-only (TDR-0014 pin 2); the coder picks a deterministic form, sidecars pin it, sorted+dedup is the assertion. Flagged so DoR does not treat the sidecar bytes as accidental | @coder via the plan; reviewed at PR |
| OQ-T2 | `sourcePath` absorption precedence when both top-level `sourcePath` and explicit `page` are supplied — spec says absorption applies "when no explicit page context is given"; TC-PAGE-003 pins the no-merge reading (explicit page wins verbatim) | No — one-line behavior; confirm at review | @reviewer at PR; spec DEC-2 wording suffices |
| OQ-T3 | NFR-5 CI-runtime budget measurement for the extended corpus (informational) — record-only vs generous ceiling | No | @runner decides at first green run (mirrors GH-92 OQ-T3); default: record-only with a generous sanity ceiling |
| OQ-T4 | Layout inner-content reading (A-4 / R-TST-3) — confirm "exactly one per tree" suppresses inner-content diagnostics | No — unless DoR disagrees with A-4; then one scenario step + one sidecar entry change | DoR gate (@readiness-reviewer); spec DEC-4 if re-opened |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-08-15 | test-plan-writer (GH-93) | Initial test plan — 18 scenarios across unit + golden-adversarial tiers (plus additive golden-fixture assertions and structural CI checks); assignment-map freeze pinned literal-by-literal (TDR-0014 C-1..C-7, routing-pin rule); both TDR-0014 clarifying pins covered by dedicated scenarios/fixtures (TC-LAY-002 orphaned layout; §4.1 routing-pin rule); corpus extension pinned (12/12 alignment + 5 ticket-class fixtures + 2 page-context fixtures, 26 new files); sidecar re-baseline gated by scripted stability check; test-design decisions D-TST-1..5; no integration/e2e/BDD/Mermaid-DOM scenarios (NG-1/NG-7) with rationale; zero mocks, `mock.module` ban per GH-103; 4 open questions (none blocking). |

## 10. Test Execution Log

Populated during delivery phases 6–10 by `@coder`, `@runner`, and `@pm` (dod_check).

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| TC-TAXO-001 | TBD | TBD | Pending execution |
| TC-TAXO-002 | TBD | TBD | Pending execution |
| TC-ELEM-001 | TBD | TBD | Pending execution |
| TC-LAY-001 | TBD | TBD | Pending execution |
| TC-LAY-002 | TBD | TBD | Pending execution — TDR-0014 pin 1 |
| TC-ATTR-001 | TBD | TBD | Pending execution |
| TC-ATTR-002 | TBD | TBD | Pending execution |
| TC-TASK-001 | TBD | TBD | Pending execution |
| TC-PAGE-001 | TBD | TBD | Pending execution |
| TC-PAGE-002 | TBD | TBD | Pending execution |
| TC-PAGE-003 | TBD | TBD | Pending execution |
| TC-DET-001 | TBD | TBD | Pending execution |
| TC-CORP-001 | TBD | TBD | Pending execution |
| TC-CORP-002 | TBD | TBD | Pending execution |
| TC-CORP-003 | TBD | TBD | Pending execution |
| TC-RPIN-001 | TBD | TBD | Pending execution (re-baseline + stability check at delivery) |
| TC-FP-001 | TBD | TBD | Pending execution |
| TC-CLI-001 | TBD | TBD | Pending execution (structural checks at DoD) |
