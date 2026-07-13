---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-25-test-plan
status: Proposed
created: 2026-07-13T00:00:00Z
last_updated: 2026-07-13T00:00:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E4, mermaid, code-policy, CEO-DEC-1, security]
version_impact: patch
summary: "Test plan for Mermaid code-policy default — validates config enum lock-step, mermaid preservation as byte-stable code macros, and injection-safety of adversarial payloads (NFR-SEC-5). Uses unit and golden-fixture tiers; no Mermaid-DOM or E2E (no renderer exists)."
links:
  change_spec: ./chg-GH-25-spec.md
  implementation_plan: null
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E4-S1] Mermaid rendering (re-scoped: code policy default)

## 1. Scope and Objectives

This test plan validates the Mermaid code-policy default change (GH-25), which makes the `code` policy (preserve-as-code block) the explicit MS-0002 operating behavior. The change is small: it resolves a config/ADR terminology mismatch, corrects a misleading `render` default, and proves mermaid preservation is byte-stable and injection-safe with golden and adversarial fixtures.

**Core behavior to protect:**
- Config schema/type lock-step ensures enum consistency (NFR-4, RSK-2/RSK-3 mitigation).
- Mermaid fences are deterministically preserved as Confluence code macros with `language=mermaid` (F-2, NFR-2).
- Adversarial payloads in mermaid source cannot inject executable content (NFR-SEC-5, NFR-1).

**Data or security integrity risks:**
- If config enum drifts between type and schema, invalid configs may be accepted (NFR-4 failure).
- If mermaid preservation is not byte-stable, sync could cause spurious updates (NFR-REL-4 regression).
- Injection-safety must hold at mermaid-specific granularity (defense-in-depth, complementing GH-20's general proof).

**Regressions that motivated this plan:**
- No explicit test proved mermaid fences are preserved as code macros at mermaid granularity (generic code-block coverage only).
- No adversarial mermaid fixtures proved XSS payloads are inert in the code-macro output.
- Config default was misleadingly `"render"` with no renderer, eroding trust.

### 1.1 In Scope

- Config domain tests: schema validation (valid `"code"`/`"render"`/`"skip"`; invalid policy rejected), default correctness (`loadConfig` → `"code"`), starter template verification.
- Golden fixture tests: mermaid fence preservation as code macro with `language=mermaid`, byte-stability across N≥3 renders.
- Adversarial fixture tests: mermaid source containing `<script>`, `onerror=`, `javascript:`, and `]]>` payloads yields 0 executable content.
- Quality gate: `bun run check` exits 0.

### 1.2 Out of Scope & Known Gaps

- [OUT] Mermaid-DOM tests (no renderer exists — deferred to MS-0003+ per CEO-DEC-1).
- [OUT] E2E tests against live Confluence (code-macro output is pure string-building; push-flow integration already covered by existing sync-engine tests).
- [OUT] Policy-driven pipeline branching in MS-0002 (all values produce code macro; branching activates in MS-0003+ when renderer lands).
- [OUT] Chromium / `mmdc` / Kroki fallback rungs (ADR-0002 rungs 2–6 — deferred).
- [OUT] SVG/PNG output, attachment hashing, `MermaidRenderer`, `SVGSanitizer` — all deferred to MS-0003+.

## 2. References

- [Change Specification](./chg-GH-25-spec.md) — authoritative requirements and acceptance criteria
- [Testing Strategy](.ai/rules/testing-strategy.md) — 6-tier strategy, coverage rules, golden-fixture conventions
- [ADR-0002](../../decisions/ADR-0002-mermaid-rendering-strategy.md) — fallback ladder, `code` policy as rung 7
- [TDR-0004](../../decisions/TDR-0004-testing-runner.md) — bun:test runner, over-mocking guardrail
- [ADR-0005](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md) — Storage renderer target
- [ADR-0006](../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md) — lifecycle invariants (INV-SEC-1)
- [GH-15](../../2026-07/2026-07-07--GH-15--config-system/chg-GH-15-spec.md) — config system, schema/type lock-step convention
- [GH-20](../../2026-07/2026-07-09--GH-20--markdown-pipeline/chg-GH-20-spec.md) — Markdown pipeline, golden-fixture infrastructure, general injection-safety proof

## 3. Coverage Overview

### 3.1 Functional Coverage (F-#, AC-#)

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC-F1-1 | `loadConfig` with no `render.mermaid` → `policy === "code"` | TC-CONF-001, TC-CONF-004 | Covered |
| AC-F1-2 | config with `policy: "render"` accepted; pipeline emits code macro (documented fallback) | TC-CONF-002, TC-MERM-001 | Covered |
| AC-F1-3 | joint valid/invalid config tests pass with updated enum; `"code"` accepted, invalid rejected (schema/type lock-step) | TC-CONF-002, TC-CONF-003 | Covered |
| AC-F2-1 | ```` ```mermaid ```` fence → Storage contains `<ac:structured-macro ac:name="code">` with `<ac:parameter ac:name="language">mermaid</ac:parameter>` + CDATA body | TC-MERM-001 | Covered |
| AC-F2-2 | same mermaid fence rendered N≥3 times → byte-identical (0 bytes diff) | TC-MERM-002 | Covered |
| AC-F3-1 | adversarial mermaid payloads (`<script>`, `onerror=`, `javascript:`, CDATA-breakout `]]>`) → 0 executable content in Storage output | TC-MERM-003, TC-MERM-004, TC-MERM-005, TC-MERM-006 | Covered |
| AC-F4-1 | starter template (`marksync init`) → `loadConfig` → `policy === "code"` | TC-CONF-004 | Covered |
| AC-CHECK | `bun run check` exits 0 | All TCs | Covered |

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

| ID | Element | TC ID(s) | Status |
|----|---------|----------|--------|
| DM-1 | `MermaidPolicy` type enum (`"code" \| "render" \| "skip"`) | TC-CONF-002, TC-CONF-003 | Covered |
| DM-2 | `render.mermaid.policy` JSON schema enum | TC-CONF-002, TC-CONF-003 | Covered |
| DM-3 | `render.mermaid.policy` default in `applyDefaults` and starter template | TC-CONF-001, TC-CONF-004 | Covered |

### 3.3 Non-Functional Coverage (NFR-#)

| ID | Requirement | TC ID(s) | Status |
|----|-------------|----------|--------|
| NFR-1 | Mermaid injection safety (NFR-SEC-5) — 0 `<script>`, 0 `on*`, 0 `javascript:` in Storage output | TC-MERM-003, TC-MERM-004, TC-MERM-005, TC-MERM-006 | Covered |
| NFR-2 | Byte-stability of code-macro output (NFR-REL-4) — 0 bytes diff across N≥3 renders | TC-MERM-002 | Covered |
| NFR-3 | Remote rendering opt-in (NFR-PRIV-2) — default config sends 0 diagram bytes remotely | TC-CONF-001 (policy is local-only) | Covered |
| NFR-4 | Config schema/type lock-step — 100% of joint valid/invalid config tests pass | TC-CONF-002, TC-CONF-003 | Covered |
| NFR-5 | Conversion latency (NFR-PERF-5) — ≤200 ms p95 (informational) | Covered by existing GH-20 golden suite (no new latency impact) | Covered |

## 4. Test Types and Layers

Per the [testing strategy](.ai/rules/testing-strategy.md), this change uses the **unit** and **golden-fixture** tiers only. The Mermaid-DOM and E2E tiers are **not** applicable because no renderer exists in this change (deferred to MS-0003+ per CEO-DEC-1).

### Unit tests

- **Framework**: `bun:test`
- **Root directory**: `tests/unit/`
- **Coverage**:
  - Config schema validation (enum lock-step with type) — `tests/unit/domain/config/schema.test.ts`
  - Config default behavior — `tests/unit/app/config.test.ts`
  - Starter template verification — `tests/unit/app/config.test.ts`
- **No mocks** — use real `ajv` validator (TDR-0004 over-mocking guardrail).

### Golden fixture tests

- **Framework**: `bun:test` with `toMatchSnapshot` / `toMatchInlineSnapshot`
- **Root directory**: `tests/golden/markdown/`
- **Coverage**:
  - Mermaid preservation as code macro — `tests/golden/markdown/storage-renderer.test.ts`
  - Byte-stability across repeated renders — `tests/golden/markdown/storage-renderer.test.ts`
  - Adversarial payload injection safety — `tests/golden/markdown/injection-safety.test.ts`
- **Fixture location**: `tests/golden/fixtures/markdown/mermaid-*.md` + `.storage.xhtml`
- **File snapshots** for Storage XHTML (byte-stable, reviewable in PR diffs).
- **No DOM execution** — pure string building (parser → HAST → Storage renderer).

### Excluded tiers (with justification)

- **Mermaid-DOM**: No renderer exists in this change (deferred to MS-0003+). The code policy emits a code macro; no SVG rendering occurs.
- **Integration**: Not needed — config tests are unit-level; storage renderer is exercised by golden fixtures (real parser/renderer, no mocks per TDR-0004 guardrail).
- **E2E**: Not needed — code-macro output is pure string-building; push-flow integration is already covered by existing sync-engine tests (GH-23). No live Confluence interaction required.
- **Gherkin/BDD**: Not needed — lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) are unchanged; no new invariants are introduced.

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Level | Priority | AC Coverage |
|-------|-------|------|-------|----------|-------------|
| TC-CONF-001 | Default policy is "code" when render.mermaid omitted | Happy Path | Critical | High | AC-F1-1 |
| TC-CONF-002 | Schema accepts valid policy values (code, render, skip) | Happy Path | Critical | High | AC-F1-2, AC-F1-3, NFR-4 |
| TC-CONF-003 | Schema rejects invalid policy values | Negative | Critical | High | AC-F1-3, NFR-4 |
| TC-CONF-004 | Starter template ships with policy: code | Happy Path | Critical | High | AC-F4-1 |
| TC-MERM-001 | Mermaid fence preserved as code macro with language=mermaid | Happy Path | Critical | High | AC-F2-1, AC-F1-2 |
| TC-MERM-002 | Same mermaid input N≥3 renders → byte-identical | Regression | Critical | High | AC-F2-2, NFR-2 |
| TC-MERM-003 | Adversarial script payload is inert (0 <script> in output) | Negative | Critical | High | AC-F3-1, NFR-1 |
| TC-MERM-004 | Adversarial onerror payload is inert (0 live on* handlers) | Negative | Critical | High | AC-F3-1, NFR-1 |
| TC-MERM-005 | Adversarial javascript: URI is inert (0 javascript: URIs) | Negative | Critical | High | AC-F3-1, NFR-1 |
| TC-MERM-006 | CDATA breakout sequence is inert (no actual CDATA termination) | Negative | Critical | High | AC-F3-1, NFR-1 |

### 5.2 Scenario Details

#### TC-CONF-001 - Default policy is "code" when render.mermaid omitted

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, F-4, AC-F1-1, NFR-3, NFR-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts`
**Tags**: @backend, @config, @defaults

**Preconditions**:
- A valid `marksync.yml` file exists with version, root, and targets configured, but no `render.mermaid` section.

**Steps**:
1. Call `loadConfig` on the minimal valid config (no `render.mermaid` section).
2. Assert that `config.render.mermaid.policy === "code"`.
3. Repeat with a config that has `render.mermaid` present but missing the `policy` field.
4. Assert that the default is still `"code"`.

**Expected Outcome**:
- `loadConfig` returns a config with `policy === "code"` when `render.mermaid` is omitted.
- When `render.mermaid` exists but `policy` is omitted, the default is still `"code"`.

**Notes / Clarifications**:
- This tests the `applyDefaults` function in `src/app/config.ts`.
- Verifies that the default changed from the misleading `"render"` to the honest `"code"`.

---

#### TC-CONF-002 - Schema accepts valid policy values (code, render, skip)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-2, AC-F1-3, DM-1, DM-2, NFR-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/config/schema.test.ts`
**Tags**: @backend, @config, @schema

**Preconditions**:
- The JSON schema is compiled with the real `ajv` validator.

**Steps**:
1. Validate a minimal valid config with `render.mermaid.policy: "code"`.
2. Validate a config with `render.mermaid.policy: "render"`.
3. Validate a config with `render.mermaid.policy: "skip"`.
4. For each, assert `ajv.validate` returns `true`.

**Expected Outcome**:
- All three policy values (`"code"`, `"render"`, `"skip"`) are accepted by the schema.
- Schema validation passes with no errors.

**Notes / Clarifications**:
- This extends the existing `schema.test.ts` (GH-15) with mermaid-specific enum coverage.
- Ensures schema/type lock-step (NFR-4, RSK-2/RSK-3 mitigation).

---

#### TC-CONF-003 - Schema rejects invalid policy values

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC-F1-3, DM-1, DM-2, NFR-4
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/domain/config/schema.test.ts`
**Tags**: @backend, @config, @schema

**Preconditions**:
- The JSON schema is compiled with the real `ajv` validator.

**Steps**:
1. Validate a config with `render.mermaid.policy: "svg"` (unknown value).
2. Validate a config with `render.mermaid.policy: "png"` (unknown value).
3. Validate a config with `render.mermaid.policy: null` (wrong type).
4. Validate a config with `render.mermaid.policy: 123` (wrong type).
5. For each, assert `ajv.validate` returns `false`.
6. Assert that validation errors contain the `enum` keyword at instancePath `/render/mermaid/policy`.

**Expected Outcome**:
- Invalid policy values are rejected by the schema.
- Validation errors explicitly point to the `enum` constraint at the correct path.

**Notes / Clarifications**:
- This extends the existing invalid-fixture coverage in `schema.test.ts`.
- Ensures schema/type lock-step (NFR-4, RSK-2/RSK-3 mitigation).

---

#### TC-CONF-004 - Starter template ships with policy: code

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-4, AC-F4-1, DM-3
**Test Type(s)**: Unit
**Automation Level**: Automated
**Target Layer / Location**: `tests/unit/app/config.test.ts`
**Tags**: @backend, @config, @starter

**Preconditions**:
- The starter template is read from `src/app/config-template.ts` (or generated source).

**Steps**:
1. Load the starter template config (the same content `marksync init` writes).
2. Parse it via `loadConfig`.
3. Assert that `config.render.mermaid.policy === "code"`.

**Expected Outcome**:
- The starter template ships with `policy: "code"` (not `"render"`).
- `loadConfig` successfully parses the starter template without errors.

**Notes / Clarifications**:
- This tests `src/app/config-template.ts` (or the generated starter config).
- Ensures new users start with the honest default.

---

#### TC-MERM-001 - Mermaid fence preserved as code macro with language=mermaid

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-1, AC-F1-2
**Test Type(s)**: Golden Fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/storage-renderer.test.ts`
**Tags**: @backend, @golden, @mermaid, @storage

**Preconditions**:
- A golden fixture `mermaid-code-policy.md` contains a valid mermaid diagram.

**Steps**:
1. Read `mermaid-code-policy.md` fixture (input Markdown).
2. Parse it via `parseMarkdown`, bridge via `mdastToHast`, render via `renderStorage`.
3. Assert result is `ok`.
4. Assert the output body matches the committed `mermaid-code-policy.storage.xhtml`.
5. Assert the output contains `<ac:structured-macro ac:name="code">`.
6. Assert the output contains `<ac:parameter ac:name="language">mermaid</ac:parameter>`.
7. Assert the mermaid source is inside `<ac:plain-text-body><![CDATA[...]]></ac:plain-text-body>`.

**Expected Outcome**:
- Mermaid fence is preserved as a code macro with `language=mermaid`.
- Output byte-matches the committed snapshot (golden fidelity).
- Mermaid source is verbatim inside CDATA (no transformation).

**Notes / Clarifications**:
- Extends the existing `storage-renderer.test.ts` with a mermaid-specific fixture.
- The fixture should contain a representative diagram (e.g., flowchart).
- Tests the existing `codeMacro` visitor (no new render logic).

---

#### TC-MERM-002 - Same mermaid input N≥3 renders → byte-identical

**Scenario Type**: Regression
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC-F2-2, NFR-2
**Test Type(s)**: Golden Fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/storage-renderer.test.ts`
**Tags**: @backend, @golden, @mermaid, @determinism

**Preconditions**:
- A mermaid fence is rendered successfully (as in TC-MERM-001).

**Steps**:
1. Render the same mermaid fixture 3 times (N=3).
2. Compare all outputs: `output1 === output2`, `output2 === output3`.
3. Assert byte difference is 0.
4. Optionally, render 5 times and assert all are byte-identical.

**Expected Outcome**:
- All renders produce byte-identical output.
- 0 bytes diff across runs (determinism, NFR-2).

**Notes / Clarifications**:
- Validates that the renderer is pure (no timestamps, no random IDs).
- Fulfills ADR-0002 C-1 (renderer determinism) at mermaid granularity.
- The mermaid fixture can be the same as TC-MERM-001.

---

#### TC-MERM-003 - Adversarial script payload is inert (0 <script> in output)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-1, NFR-SEC-5
**Test Type(s)**: Golden Fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/injection-safety.test.ts`
**Tags**: @backend, @golden, @security, @mermaid, @injection

**Preconditions**:
- An adversarial mermaid fixture contains `<script>alert(1)</script>` in the diagram source.

**Steps**:
1. Render a ```` ```mermaid ```` fence containing `graph TD; A[<script>alert(1)</script>];`.
2. Parse and render via the full pipeline (no mocks).
3. Count occurrences of `<script` in the output body.
4. Assert count is 0.
5. Assert the output contains `&lt;script&gt;` or similar escaped text.

**Expected Outcome**:
- 0 `<script>` tags survive in the Storage output (NFR-SEC-5).
- The payload appears as inert escaped text inside the CDATA code body.

**Notes / Clarifications**:
- Extends the existing `injection-safety.test.ts` (GH-20) with mermaid-specific payloads.
- The code policy is safe by construction (CDATA-wrapped), but this is defense-in-depth proof.
- Test should use the existing helper `countOutsideCdata` to avoid counting inert text inside CDATA.

---

#### TC-MERM-004 - Adversarial onerror payload is inert (0 live on* handlers)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-1, NFR-SEC-5
**Test Type(s)**: Golden Fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/injection-safety.test.ts`
**Tags**: @backend, @golden, @security, @mermaid, @injection

**Preconditions**:
- An adversarial mermaid fixture contains an `onerror` handler in the diagram source.

**Steps**:
1. Render a ```` ```mermaid ```` fence containing `graph TD; A[<img src=x onerror=alert(1)>];`.
2. Parse and render via the full pipeline.
3. Count occurrences of live `on*` event handlers (`onerror`, `onclick`, `onload`, etc.) in the output body OUTSIDE CDATA.
4. Assert count is 0.
5. Assert the payload appears as inert text inside CDATA.

**Expected Outcome**:
- 0 live `on*` event handlers survive in the Storage output (NFR-SEC-5).
- The `onerror=` payload is inert as escaped text inside CDATA.

**Notes / Clarifications**:
- Use `countOutsideCdata` helper (from existing `injection-safety.test.ts`) to count real XML elements, not inert text.
- Tests multiple `on*` handlers if feasible, but `onerror` is the canonical case.

---

#### TC-MERM-005 - Adversarial javascript: URI is inert (0 javascript: URIs)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-1, NFR-SEC-5
**Test Type(s)**: Golden Fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/injection-safety.test.ts`
**Tags**: @backend, @golden, @security, @mermaid, @injection

**Preconditions**:
- An adversarial mermaid fixture contains a `javascript:` URI in the diagram source.

**Steps**:
1. Render a ```` ```mermaid ```` fence containing a node with a URL: `graph TD; A["<a href=javascript:alert(1)>click</a>"];`.
2. Parse and render via the full pipeline.
3. Count occurrences of `javascript:` in the output body OUTSIDE CDATA.
4. Assert count is 0.
5. Assert the `javascript:` text appears as inert escaped content inside CDATA.

**Expected Outcome**:
- 0 `javascript:` URIs survive as executable links in the Storage output (NFR-SEC-5).
- The `javascript:` payload is inert as escaped text inside CDATA.

**Notes / Clarifications**:
- Use `countOutsideCdata` helper to count real attributes, not inert text.
- Validates that code-macro bodies cannot inject executable URIs.

---

#### TC-MERM-006 - CDATA breakout sequence is inert (no actual CDATA termination)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC-F3-1, NFR-1, NFR-SEC-5
**Test Type(s)**: Golden Fixture
**Automation Level**: Automated
**Target Layer / Location**: `tests/golden/markdown/injection-safety.test.ts`
**Tags**: @backend, @golden, @security, @mermaid, @injection

**Preconditions**:
- An adversarial mermaid fixture contains the CDATA terminator sequence `]]>` in the diagram source.

**Steps**:
1. Render a ```` ```mermaid ```` fence containing `graph TD; A["Hello]]>World"];`.
2. Parse and render via the full pipeline.
3. Assert the output body is well-formed XML (can be parsed).
4. Assert the `]]>` sequence is split by the `cdata()` helper (per GH-20 spike-H6 rule).
5. Assert no actual CDATA termination occurs that would allow content injection.

**Expected Outcome**:
- The output XML remains well-formed (no malformed CDATA sections).
- The `]]>` sequence is inert (split or escaped) inside the code body.
- No content injection is possible via CDATA breakout.

**Notes / Clarifications**:
- The existing `cdata()` helper in `src/infra/confluence/render/storage.ts` already splits `]]>` (GH-20).
- This test validates that the helper works correctly for mermaid content (defense-in-depth).

## 6. Environments and Test Data

### Required environments

- **Local-dev**: All tests run in the local development environment (Bun runtime, no external services).
- No test, staging, or production environments are required (no live Confluence, no network calls).

### Test data generation and cleanup

- **Golden fixtures**: Committed `tests/golden/fixtures/markdown/mermaid-*.md` and `.storage.xhtml` files.
  - `mermaid-code-policy.md` — valid mermaid diagram for preservation testing.
  - `mermaid-adversarial.md` — adversarial payloads for injection-safety testing.
- **Config fixtures**: Minimal valid/invalid configs embedded in test files (no external fixture files).
- No test data cleanup is required (no temporary files, no state mutation).

### Isolation strategy

- All tests are pure (no filesystem writes except reading committed fixtures).
- Config tests use in-memory objects (no `.marksync/` cache mutation).
- Golden tests read committed files and assert against committed snapshots.
- No test pollution (each test is independent).

## 7. Automation Plan and Implementation Mapping

| TC ID | Test file to create or update | Execution command | Mocking requirements | Implementation status |
|-------|-------------------------------|-------------------|----------------------|----------------------|
| TC-CONF-001 | `tests/unit/app/config.test.ts` (add test case) | `bun test tests/unit/app/config.test.ts` | No mocks (real loader) | To Implement |
| TC-CONF-002 | `tests/unit/domain/config/schema.test.ts` (extend valid fixtures) | `bun test tests/unit/domain/config/schema.test.ts` | No mocks (real ajv) | To Implement |
| TC-CONF-003 | `tests/unit/domain/config/schema.test.ts` (extend invalid fixtures) | `bun test tests/unit/domain/config/schema.test.ts` | No mocks (real ajv) | To Implement |
| TC-CONF-004 | `tests/unit/app/config.test.ts` (add test case) | `bun test tests/unit/app/config.test.ts` | No mocks (real template) | To Implement |
| TC-MERM-001 | `tests/golden/markdown/storage-renderer.test.ts` (extend with mermaid fixture) | `bun test tests/golden/markdown/storage-renderer.test.ts` | No mocks (real parser/renderer) | To Implement |
| TC-MERM-002 | `tests/golden/markdown/storage-renderer.test.ts` (add determinism test) | `bun test tests/golden/markdown/storage-renderer.test.ts` | No mocks (real parser/renderer) | To Implement |
| TC-MERM-003 | `tests/golden/markdown/injection-safety.test.ts` (add mermaid script test) | `bun test tests/golden/markdown/injection-safety.test.ts` | No mocks (real parser/renderer) | To Implement |
| TC-MERM-004 | `tests/golden/markdown/injection-safety.test.ts` (add mermaid onerror test) | `bun test tests/golden/markdown/injection-safety.test.ts` | No mocks (real parser/renderer) | To Implement |
| TC-MERM-005 | `tests/golden/markdown/injection-safety.test.ts` (add mermaid javascript: test) | `bun test tests/golden/markdown/injection-safety.test.ts` | No mocks (real parser/renderer) | To Implement |
| TC-MERM-006 | `tests/golden/markdown/injection-safety.test.ts` (add mermaid CDATA test) | `bun test tests/golden/markdown/injection-safety.test.ts` | No mocks (real parser/renderer) | To Implement |

### Fixture files to create

- `tests/golden/fixtures/markdown/mermaid-code-policy.md` — valid mermaid diagram input
- `tests/golden/fixtures/markdown/mermaid-code-policy.storage.xhtml` — expected code-macro output
- `tests/golden/fixtures/markdown/mermaid-adversarial.md` — adversarial payloads (script, onerror, javascript:, ]]>)
- `tests/golden/fixtures/markdown/mermaid-adversarial.storage.xhtml` — expected inert output

### Quality gate

- All tests run via `bun test tests/unit/ tests/golden/` (fast loop CI).
- `bun run check` exits 0 (AC-CHECK).

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-T-1 | Golden fixture snapshots may diverge if Bun versions affect XML formatting (unlikely — string building) | L | L | Pin Bun version per release; re-baseline snapshots as an explicit, reviewed action if Bun changes affect output (ADR-0002 C-1) | L |
| RSK-T-2 | Config schema/type lock-step may break if enum values are added inconsistently | L | L | Update schema, type, and tests in lock-step per GH-15 convention; AC-F1-3 explicitly validates this | L |
| RSK-T-3 | Adversarial fixture coverage may miss a payload class (false confidence) | L | L | The code policy is safe by construction (CDATA + XML-escaping), independent of payload coverage; fixtures are defense-in-depth, not the primary control. GH-20 already proved general injection safety. | L |

### 8.2 Assumptions

- The existing `codeMacro` visitor in `src/infra/confluence/render/storage.ts` is correct and deterministic (this change adds mermaid-specific proof, not new render logic).
- The JSON schema in `src/domain/config/schema.json` and the TypeScript type in `src/domain/config/types.ts` are updated in lock-step by the implementation (NFR-4).
- The `cdata()` helper in `src/infra/confluence/render/storage.ts` already splits `]]>` sequences correctly (GH-20 spike-H6 rule).
- MS-0002 is pre-release, so config-surface changes (new enum value, changed default) are non-breaking.

### 8.3 Open Questions

None — all ACs are covered and testable. No blocking questions remain.

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-13 | test-plan-writer (AI) | Initial test plan — covers config lock-step, mermaid preservation, byte-stability, and injection safety with unit and golden-fixture tiers. |

## 10. Test Execution Log

| TC ID | Run Date | Result | Notes |
|-------|----------|--------|-------|
| (Populated during execution) | | | |

---