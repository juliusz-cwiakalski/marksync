---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-11-test-plan
status: Proposed
created: 2026-07-06T17:13:44Z
last_updated: 2026-07-06T17:13:44Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [spike, ms-0002, mermaid, rendering, adr-0002-validation, adr-0001-validation]
version_impact: none
summary: "Validation plan for the MS2-E1-S1 Mermaid headless-render spike. The 'tests' are spike-validation probes (determinism, Chromium-absence, Bun-compat, fidelity, security, secrets, findings-doc) that call the real mermaid.render() against the real happy-dom global registrant, producing evidence for findings/mermaid-render-spike-findings.md and unblocking the ADR-0002 Part B / MS2-E4-S1 decision."
links:
  change_spec: ./chg-GH-11-spec.md
  implementation_plan: ./chg-GH-11-plan.md   # pending — authored in lifecycle phase 4 (delivery_planning)
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E1-S1] Mermaid headless-render spike

## 1. Scope and Objectives

This is a **load-bearing spike**, not a feature delivery. The behaviour to protect is the
**architectural claim** that the official `mermaid` library renders **deterministically
in-process** (Bun + happy-dom) **without Chromium**, safely, for the canonical Mermaid subset.
The integrity risks are: (a) a hidden Chromium/Puppeteer dependency silently breaking ADR-0001's
single-binary promise; (b) non-deterministic SVG output breaking the idempotent
attachment-reuse guarantee (ADR-0002 C-1); (c) adversarial diagram source injecting
`<script>`/event-handler/`javascript:` into SVG attached to Confluence.

Because this is a spike, the "tests" are **spike-validation probes** — standalone scripts run via
`bun run` inside the spike workspace (`spikes/mermaid-render/`) that produce **evidence** for a
findings document. They are **not** one of the six production test tiers and they are **not** wired
into the project test runner or CI. Each probe maps to one or more hypotheses (H1–H5) and
acceptance criteria (AC1–AC7) from the change specification. The spike's deliverable is the
**findings + evidence + a recommendation**; on PASS, a reusable golden SVG fixture pair and the
recorded normalization rules are left for MS2-E4-S1 and the golden-test tier.

### 1.1 In Scope

- Seven spike-validation probes (one TC per probe), executed via `bun run` in `spikes/mermaid-render/`:
  1. Determinism probe → AC1 / H1
  2. Chromium-absence probe → AC2 / H2
  3. Security probe → AC5 / H5
  4. Fidelity checks → AC4 / H4
  5. Bun-compat execution (runtime invocation) → AC3 / H3
  6. Secrets scan → AC7
  7. Findings-document presence → AC6
- Seven fixtures under `spikes/mermaid-render/fixtures/` (5 canonical diagram types + 2 adversarial).
- Deterministic SVG **normalization rules**, recorded explicitly for MS2-E4-S1 reuse (see §5.3).
- The committed deliverables: `spikes/mermaid-render/` (code + fixtures + normalized golden SVGs)
  and `findings/mermaid-render-spike-findings.md`.

### 1.2 Out of Scope & Known Gaps

- **Production Mermaid-DOM tier.** These probes validate whether the production
  Mermaid-DOM tier (one of the six tiers in `.ai/rules/testing-strategy.md`) is even viable;
  they are **not** that tier. If the spike PASSES, MS2-E4-S1 builds the real Mermaid-DOM tier
  under `tests/` with `bun:test` + happy-dom + preload. (See §4.)
- **The main `src/` tree** — explicitly untouched (spec NG-5). The spike lives entirely under
  `spikes/mermaid-render/` with its own `package.json`.
- **CI wiring.** The spike is **not** wired into `.github/workflows/ci.yml`. It runs locally; the
  findings document is the committed deliverable. (Explicitly noted so the plan-writer / coder do
  not attempt CI integration.)
- **Cross-OS byte determinism as a gate.** Same-OS determinism is the gate (NFR-DET-1);
  cross-OS is a **stretch** goal (NFR-DET-2), recorded as PASS or a documented known-delta,
  with the per-OS-cache-key contingency (spec DEC-3) as the accepted fallback.
- **Content-hash attachment naming** (ADR-0002 hash formula) — implemented in MS2-E4-S1.
- **PNG output and Kroki / `mmdc` / container fallback rungs** — only relevant if H2 fails.
- **The `code` policy fallback** for MS-0002 — a downstream routing outcome, not validated here.

## 2. References

| Reference | Path | Role |
|---|---|---|
| Change specification | `./chg-GH-11-spec.md` | Primary input; AC1–AC7, F-1…F-6, NFR-DET/DEP/RUN/FID/SEC/EVID, H1–H5 |
| Authoritative story | `doc/planning/milestones/MS-2/MS2-E1--spikes/MS2-E1-S1--mermaid-render-spike.md` | Methodology (exact steps), hypotheses, AC checklist, CEO-resolved R1/Q1 |
| Implementation plan | `./chg-GH-11-plan.md` | **Pending** — authored in lifecycle phase 4 (delivery_planning); derived from this test plan |
| Testing strategy | `.ai/rules/testing-strategy.md` | The 6 production tiers; Mermaid-DOM tier setup; over-mocking guardrail |
| TDR-0004 | `doc/decisions/TDR-0004-testing-runner.md` | `bun:test` + happy-dom choice; AI-agent over-mocking guardrail |
| ADR-0002 | `doc/decisions/ADR-0002-mermaid-rendering-strategy.md` | Security Requirements; Part B stop criteria; fallback ladder; C-1 determinism |
| ADR-0001 | `doc/decisions/ADR-0001-implementation-language-and-runtime.md` | TypeScript + Bun single-binary rationale under validation |
| Feature spec | `doc/spec/features/feature-mermaid-rendering.md` | Target in-process renderer capabilities (downstream, not this spike) |

## 3. Coverage Overview

> The spike has **no interfaces** (no REST/HTTP, no events, no production data model — spec §8.1–8.3).
> Therefore §3.2 (Interface Coverage) is N/A and all traceability flows through Functional (§3.1)
> and Non-Functional (§3.3) coverage.

### 3.1 Functional Coverage (F-#, AC-#)

**AC → Probe → Fixture → Evidence traceability matrix.**

| AC ID | Hypothesis | Probe (TC ID) | Fixture(s) | Expected evidence path |
|-------|------------|---------------|------------|------------------------|
| **AC1** | H1 — Determinism | TC-MRSPIKE-001 (determinism) | `flowchart.mmd`, `sequence.mmd`, `class.mmd`, `state.mmd`, `gantt.mmd` | `findings/mermaid-render-spike-findings.md#H1`; persisted normalized SVGs at `spikes/mermaid-render/fixtures/<name>.expected.svg`; per-fixture per-repeat digests |
| **AC2** | H2 — No Chromium | TC-MRSPIKE-002 (chromium-absence) | (any canonical fixture used to drive a render during the process scan) | `findings/mermaid-render-spike-findings.md#H2`; `bun pm ls` tree evidence; process-listing evidence (0 chrome processes during render) |
| **AC3** | H3 — Bun compat | TC-MRSPIKE-005 (bun-compat execution) | all canonical fixtures (the pipeline runs them) | `findings/mermaid-render-spike-findings.md#H3`; `bun run` invocation log showing end-to-end execution with no Node-only fallback |
| **AC4** | H4 — Fidelity | TC-MRSPIKE-004 (fidelity checks) | `flowchart.mmd`, `sequence.mmd`, `class.mmd`, `state.mmd`, `gantt.mmd` | `findings/mermaid-render-spike-findings.md#H4`; non-empty well-formed SVG outputs with expected labels |
| **AC5** | H5 — Security | TC-MRSPIKE-003 (security) | `adversarial-xss.mmd`, `adversarial-script.mmd` | `findings/mermaid-render-spike-findings.md#H5`; adversarial-output scan results (0 `<script>`, 0 `onerror`/`onload`, 0 `javascript:`); confirmation `securityLevel:"strict"` active |
| **AC6** | — Findings doc | TC-MRSPIKE-007 (findings-doc presence) | (none — deliverable artifact) | `findings/mermaid-render-spike-findings.md` (explicit PASS/FAIL per H1–H5 + one clear MS-0002 recommendation) |
| **AC7** | — Secret hygiene | TC-MRSPIKE-006 (secrets scan) | (all committed spike artifacts) | `findings/mermaid-render-spike-findings.md` secrets-hygiene note; secrets-scan result (0 secrets) |

**Per-AC coverage status:**

| AC ID | Description | TC ID(s) | Status |
|-------|-------------|----------|--------|
| AC1 | 5/5 byte-identical normalized SVG per fixture (same OS); cross-OS recorded | TC-MRSPIKE-001 (+ fidelity assertions folded in via TC-MRSPIKE-004) | To implement (probe) |
| AC2 | No `puppeteer`/`playwright`/`chromium` in tree; no chrome process during render | TC-MRSPIKE-002 | To implement (probe) |
| AC3 | `bun run` executes the spike end-to-end (no Node-only fallback) | TC-MRSPIKE-005 (the runtime invocation itself) | To implement (probe) |
| AC4 | All 5 diagram types render non-empty well-formed SVG with expected labels | TC-MRSPIKE-004 (assertions also reused inside TC-MRSPIKE-001) | To implement (probe) |
| AC5 | Adversarial fixtures: 0 `<script>`/event-handler/`javascript:`; `strict` active | TC-MRSPIKE-003 | To implement (probe) |
| AC6 | Findings doc with PASS/FAIL per H1–H5 + clear MS-0002 recommendation | TC-MRSPIKE-007 | To implement (check + manual verdict authoring) |
| AC7 | Zero secrets in any committed artifact | TC-MRSPIKE-006 | To implement (grep check + documented review) |

> **All seven ACs are fully traced.** No AC is left as a TODO. (See §8.3 for the one nuance:
> AC3 has no separate "test" — the runtime invocation is the evidence.)

### 3.2 Interface Coverage (API-#, EVT-#, DM-#)

**N/A.** The spike exposes no REST/HTTP surface (spec §8.1), emits no events (§8.2), and introduces
no production data model (§8.3). It makes no outbound network calls (privacy default preserved —
ADR-0002 C-3). Normalized SVG fixtures and the findings document are spike artifacts only, not
production contracts.

### 3.3 Non-Functional Coverage (NFR-#)

| NFR ID | Requirement | Probe (TC ID) | Evidence path |
|--------|-------------|---------------|---------------|
| NFR-DET-1 | Same-OS determinism: 5/5 byte-identical normalized SVG | TC-MRSPIKE-001 | `findings/...#H1`; `fixtures/*.expected.svg` |
| NFR-DET-2 | Cross-OS determinism (stretch): recorded PASS or known-delta | TC-MRSPIKE-001 (cross-OS arm) | `findings/...#H1` (cross-OS subsection) |
| NFR-DEP-1 | 0 occurrences of `puppeteer`/`playwright`/`chromium` in resolved tree | TC-MRSPIKE-002 | `findings/...#H2`; `bun pm ls` capture |
| NFR-DEP-2 | 0 Chromium/chrome processes spawned during a render run | TC-MRSPIKE-002 | `findings/...#H2`; process-listing capture |
| NFR-RUN-1 | Full probe pipeline runs via Bun with no Node-only fallback | TC-MRSPIKE-005 | `findings/...#H3`; `bun run` log |
| NFR-FID-1 | 5/5 diagram types render non-empty well-formed SVG with expected labels | TC-MRSPIKE-004 | `findings/...#H4`; SVG outputs |
| NFR-SEC-1 | 0 `<script>` tags, 0 `onerror`/`onload`, 0 `javascript:` URIs | TC-MRSPIKE-003 | `findings/...#H5`; adversarial-output scan |
| NFR-SEC-2 | 0 secrets in any committed artifact | TC-MRSPIKE-006 | secrets-scan result; `findings/...` secret-hygiene note |
| NFR-EVID-1 | Explicit PASS/FAIL per H1–H5 + evidence pointers + one MS-0002 recommendation | TC-MRSPIKE-007 | `findings/mermaid-render-spike-findings.md` (the whole document) |

## 4. Test Types and Layers

> **Critical framing:** These are **spike-validation probes**, NOT production tests.

Per `.ai/rules/testing-strategy.md`, the repository defines **six production test tiers**: Unit,
Integration, Golden-fixture, Mermaid-DOM, Gherkin/BDD, and E2E (live-sandbox). The spike's probes
are **none of these**. They are throwaway scripts that produce **evidence for a findings document**,
run via `bun run` (the runtime), **not** `bun test` (the test runner).

The relationship is directional:

- This spike **validates whether the Mermaid-DOM production tier is even viable** (i.e., whether
  `mermaid.render()` works headlessly under happy-dom without Chromium and produces deterministic,
  safe SVG). It is a precondition gate, not the tier itself.
- **If the spike PASSES**, MS2-E4-S1 builds the real **Mermaid-DOM tier** under `tests/` using
  `bun:test` + `happy-dom` (via `@happy-dom/global-registrator` + Bun preload, per
  `.ai/rules/testing-strategy.md` §"Mermaid-DOM test setup"), plus the **golden-fixture tier** for
  byte-stable SVG snapshots reusing the normalization rules recorded here (§5.3).
- **If the spike FAILS** on H2, MS-0002 adopts ADR-0002 ladder rung 7 (`code` policy) and the
  Mermaid-DOM tier is not built for MS-0002 (deferred to MS-0003+). On a catastrophic failure, the
  spike escalates to ADR-0001 language-level reconsideration (spec RSK-3).

| Aspect | Value for this spike |
|---|---|
| Runner | `bun run` (the runtime), invoked on individual probe scripts — **not** `bun test` |
| Workspace | `spikes/mermaid-render/` (standalone; own `package.json`; `node_modules` + ephemeral outputs gitignored) |
| Test type label | `Spike-validation probe` (custom — does not map to any of the 6 production tiers) |
| CI wiring | **None.** Runs locally; findings document is the committed deliverable. Do NOT add to `.github/workflows/ci.yml`. |
| Dependencies under test | `mermaid` 11.x, `happy-dom`, `@happy-dom/global-registrator`, Bun runtime |

## 5. Test Scenarios

### 5.1 Scenario Index

| TC ID | Title | Type | Impact | Priority | AC Coverage |
|-------|-------|------|--------|----------|-------------|
| TC-MRSPIKE-001 | Determinism probe (byte-identical normalized SVG, N=5) | Corner Case | Critical | High | AC1 |
| TC-MRSPIKE-002 | Chromium-absence probe (dep tree + process listing) | Corner Case | Critical | High | AC2 |
| TC-MRSPIKE-003 | Security probe (adversarial output sanitization) | Negative | Critical | High | AC5 |
| TC-MRSPIKE-004 | Fidelity checks (5 diagram types render with labels) | Happy Path | Important | High | AC4 |
| TC-MRSPIKE-005 | Bun-compat execution (runtime invocation is the evidence) | Happy Path | Critical | High | AC3 |
| TC-MRSPIKE-006 | Secrets scan (light, grep-based + documented review) | Corner Case | Important | Medium | AC7 |
| TC-MRSPIKE-007 | Findings-document presence (PASS/FAIL + recommendation) | Happy Path | Critical | High | AC6 |

### 5.2 Scenario Details

---

#### TC-MRSPIKE-001 - Determinism probe (byte-identical normalized SVG)

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-2, AC1, NFR-DET-1, NFR-DET-2, H1 (also exercises NFR-FID-1/AC4 via per-fixture assertions)
**Test Type(s)**: Spike-validation probe
**Automation Level**: Automated
**Target Layer / Location**: `spikes/mermaid-render/probes/determinism.ts`
**Tags**: @spike, @mermaid, @rendering, @determinism

**Preconditions**:

- happy-dom global registered via `@happy-dom/global-registrator` inside the Bun runtime.
- `mermaid.initialize({ startOnLoad:false, securityLevel:"strict", htmlLabels:false, deterministicIds:true, fontFamily:"<fixed policy>" })` has run.
- The 5 canonical fixtures exist: `fixtures/flowchart.mmd`, `sequence.mmd`, `class.mmd`, `state.mmd`, `gantt.mmd`.
- The SVG **normalization rules** (§5.3) are implemented as a single, reusable, pure function (no side effects) so MS2-E4-S1 can lift it verbatim.

**Steps**:

1. For each of the 5 canonical fixtures, render the source `N=5` times sequentially via `await mermaid.render(id, source)` on the **same OS**.
2. Pass each raw SVG through the deterministic normalization pass (§5.3).
3. Compute a digest (e.g., sha256) of each normalized SVG; assert all 5 digests are byte-identical **within the run, per fixture**.
4. Persist the normalized SVG of the first repeat as the golden fixture `fixtures/<name>.expected.svg` (commit-tracked; reused by MS2-E4-S1 and the golden-test tier).
5. (Stretch — cross-OS, NFR-DET-2) Where a second OS is available, repeat once and record the result as PASS **or** a documented known-delta (the per-OS-cache-key contingency per spec DEC-3 applies, not a fail).

**Expected Outcome**:

- 5/5 repeats produce byte-identical **normalized** SVG per fixture on the same OS → **H1 PASS**.
- `fixtures/<name>.expected.svg` committed for each canonical fixture.
- The exact normalization rules are recorded (§5.3) and referenced from the findings doc.
- Cross-OS result recorded as PASS or a documented known-delta (stretch; does not gate AC1).

**Postconditions**:

- Normalized golden SVG pair (source + normalized SVG) left for MS2-E4-S1.
- Normalization rules recorded for E4-S1 reuse (spec G-8, DEC-2, RSK-1 mitigation).

**Notes / Clarifications**:

- Byte-stability is asserted against the **normalized** (not raw) bytes, because Mermaid may emit non-deterministic element IDs even with `deterministicIds:true` (CEO-resolved risk R1; spec DEC-2).
- Fidelity assertions (TC-MRSPIKE-004) MAY be folded into this probe's per-fixture loop; either way AC4 is covered.

---

#### TC-MRSPIKE-002 - Chromium-absence probe

**Scenario Type**: Corner Case
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-3, AC2, NFR-DEP-1, NFR-DEP-2, H2
**Test Type(s)**: Spike-validation probe
**Automation Level**: Automated
**Target Layer / Location**: `spikes/mermaid-render/probes/chromium-absence.ts`
**Tags**: @spike, @mermaid, @rendering, @dependencies, @security

**Preconditions**:

- Spike dependencies installed (`bun install`) in `spikes/mermaid-render/`.
- A render can be driven (reuse the determinism probe's render loop or a single representative fixture).

**Steps**:

1. **Dependency-tree check (NFR-DEP-1):** capture `bun pm ls` output for the spike workspace and assert the resolved dependency tree contains **zero** occurrences of the substrings `puppeteer`, `playwright`, and `chromium` (case-insensitive).
2. **Runtime process check (NFR-DEP-2):** immediately before rendering a fixture, snapshot the OS process listing; render; immediately after, snapshot again. Assert **no** Chromium/chrome process appears in the delta during the render.
3. Persist both pieces of evidence (the filtered `bun pm ls` capture and the process-listing delta) to the spike evidence area and reference them from the findings doc.

**Expected Outcome**:

- 0 occurrences of `puppeteer`/`playwright`/`chromium` in the resolved dependency tree.
- 0 Chromium/chrome processes spawned during a render run.
- → **H2 PASS** (the single-binary, no-mandatory-runtime promise holds).

**Postconditions**:

- If H2 **FAILS**: findings doc records the fallback decision — MS-0002 descends ADR-0002 ladder to rung 7 (`code` policy); this does **not** block MS-0002.

**Notes / Clarifications**:

- Two **independent** checks (tree + process) are required by spec F-3/AC2; either failing alone is enough to FAIL H2.

---

#### TC-MRSPIKE-003 - Security probe (adversarial output sanitization)

**Scenario Type**: Negative
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-5, AC5, NFR-SEC-1, H5 (also references ADR-0002 Security Requirements)
**Test Type(s)**: Spike-validation probe
**Automation Level**: Automated
**Target Layer / Location**: `spikes/mermaid-render/probes/security.ts`
**Tags**: @spike, @mermaid, @security, @xss

**Preconditions**:

- happy-dom registered; `mermaid.initialize` with `securityLevel:"strict"` confirmed accepted by the library (no thrown error / no silent override).
- Adversarial fixtures exist: `fixtures/adversarial-xss.mmd` (an `<img src=x onerror=alert(1)>` payload inside a node label) and `fixtures/adversarial-script.mmd` (a `<script>` injection attempt).

**Steps**:

1. Confirm `securityLevel:"strict"` is the **active** configuration (e.g., read back the initialized config / assert the initialization did not reject `strict`).
2. Render each adversarial fixture under `securityLevel:"strict"` + `htmlLabels:false` + `deterministicIds:true`.
3. Scan each rendered output for: (a) `<script` tags (count must be 0); (b) inline event-handler substrings `onerror`/`onload` (count must be 0); (c) `javascript:` URIs (count must be 0).
4. Persist the scan counts per adversarial fixture and reference them from the findings doc.

**Expected Outcome**:

- Zero `<script>` tags, zero `onerror`/`onload` substrings, zero `javascript:` URIs in the adversarial output.
- `securityLevel:"strict"` confirmed active.
- → **H5 PASS** (ADR-0002 Security Requirements hold for the in-process renderer).

**Postconditions**:

- Evidence (per-fixture scan counts) referenced from `findings/mermaid-render-spike-findings.md#H5`.

**Notes / Clarifications**:

- This validates the safe-defaults posture required of **every** ADR-0002 renderer rung; the adversarial fixtures are malicious **inputs** used only to validate sanitization and are never exfiltrated (spec §20).

---

#### TC-MRSPIKE-004 - Fidelity checks (5 diagram types render with labels)

**Scenario Type**: Happy Path
**Impact Level**: Important
**Priority**: High
**Related IDs**: F-4, AC4, NFR-FID-1, H4
**Test Type(s)**: Spike-validation probe
**Automation Level**: Automated
**Target Layer / Location**: `spikes/mermaid-render/probes/determinism.ts` (folded in) **or** a dedicated `spikes/mermaid-render/probes/fidelity.ts`
**Tags**: @spike, @mermaid, @rendering, @fidelity

**Preconditions**:

- happy-dom registered; Mermaid initialized with the safe ADR-0002 config.
- The 5 canonical fixtures exist with **known, expected node labels** (see §6 fixture table).

**Steps**:

1. For each of the 5 canonical diagram types (flowchart `graph TD`, `sequenceDiagram`, `classDiagram`, state, gantt), render the fixture once.
2. Assert each output is: (a) non-empty; (b) well-formed SVG (parseable; root is `<svg ...>`); (c) contains its expected node label(s) as substring(s) of the SVG text.
3. Record the per-type PASS/FAIL.

**Expected Outcome**:

- 5/5 diagram types render non-empty, well-formed SVG containing the expected node labels.
- → **H4 PASS** (the official library actually functions headlessly for the canonical subset).

**Notes / Clarifications**:

- Expected labels per fixture are enumerated in §6 (e.g., flowchart contains `Hello` / `World`; sequence contains actor names; etc.).
- These assertions MAY be folded into TC-MRSPIKE-001's per-fixture render loop to avoid a redundant render; either structure is acceptable as long as AC4 is explicitly covered.

---

#### TC-MRSPIKE-005 - Bun-compat execution (runtime invocation is the evidence)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-1, AC3, NFR-RUN-1, H3
**Test Type(s)**: Spike-validation probe
**Automation Level**: Automated
**Target Layer / Location**: `spikes/mermaid-render/render.ts` (the spike entry) + the probe pipeline as a whole
**Tags**: @spike, @mermaid, @runtime, @bun

**Preconditions**:

- Bun is the active runtime (`bun --version` available).
- The spike entry (`render.ts`) and the probe scripts are present and runnable via `bun run`.

**Steps**:

1. Execute the spike end-to-end under the Bun runtime: `bun run render.ts` (and each probe via `bun run`).
2. Confirm the pipeline completes (happy-dom registers, Mermaid initializes, fixtures render, probes report) **without** any Node-only fallback (no `node` invocation, no `process.versions.node`-gated branch taken).

**Expected Outcome**:

- `bun run` executes the spike end-to-end with no Node-only fallback.
- → **H3 PASS** (ADR-0001 C-2/C-3 single-binary compatibility of the render path holds).

**Notes / Clarifications**:

- **There is no separate "test" for AC3** — the fact that `bun run render.ts` (and the probes) execute at all **is** the H3 evidence. This probe exists to make that explicit and to record the runtime version in the findings doc. (See §8.3.)

---

#### TC-MRSPIKE-006 - Secrets scan (light, grep-based + documented review)

**Scenario Type**: Corner Case
**Impact Level**: Important
**Priority**: Medium
**Related IDs**: AC7, NFR-SEC-2
**Test Type(s)**: Spike-validation probe (semi-automated)
**Automation Level**: Semi-automated (grep check + human review before commit)
**Target Layer / Location**: `spikes/mermaid-render/` workspace + `findings/` (a small `scripts/secret-scan.sh` or an inline `rg` invocation is acceptable)
**Tags**: @spike, @security, @secrets

**Preconditions**:

- All spike artifacts (code, fixtures, findings) are staged in the workspace but not yet committed.

**Steps**:

1. Run a grep-based scan across the spike workspace (`spikes/mermaid-render/` and `findings/`) for common secret patterns: API tokens, `Bearer `, `xoxb-`, `AKIA` AWS prefixes, private-key headers (`-----BEGIN ... PRIVATE KEY-----`), high-entropy base64 blobs in fixture/script files, and any `MARKSYNC_*` credential env-var **values** (keys/names are fine; values must be absent).
2. Confirm `node_modules/`, log files, and ephemeral render outputs are **gitignored** (they are not committed, so they are out of scan scope for "committed artifact").
3. Record a one-line verdict in the findings doc: "Secrets scan: 0 secrets in committed artifacts (reviewed <date>)."

**Expected Outcome**:

- 0 secrets in any committed spike artifact.
- The workspace is reviewed for secrets before commit (no real secrets are expected in a spike).

**Notes / Clarifications**:

- Because no real secrets are expected in a spike, a documented review step plus a light grep is acceptable for AC7. The findings doc records the verdict. (Per `.ai/rules/testing-strategy.md` INV-SEC-1 applies to **production** output paths; the spike produces no production output.)

---

#### TC-MRSPIKE-007 - Findings-document presence (PASS/FAIL + recommendation)

**Scenario Type**: Happy Path
**Impact Level**: Critical
**Priority**: High
**Related IDs**: F-6, AC6, NFR-EVID-1
**Test Type(s)**: Spike-validation probe (semi-automated check + manual verdict authoring)
**Automation Level**: Semi-automated (presence/structure check automated; verdicts authored by the operator)
**Target Layer / Location**: `findings/mermaid-render-spike-findings.md`
**Tags**: @spike, @findings, @decision-input

**Preconditions**:

- All other probes (TC-MRSPIKE-001…006) have produced their evidence.

**Steps**:

1. Assert `findings/mermaid-render-spike-findings.md` exists and is committed.
2. Assert the document contains, for **each** of H1–H5, an explicit **PASS** or **FAIL** verdict with an evidence pointer (log path / fixture path / probe output).
3. Assert the document contains a **single, clear MS-0002 recommendation**: either proceed to MS2-E4-S1 in-process rendering, **or** fall back to the ADR-0002 `code` policy (rung 7) for MS-0002. (Partial/shim outcomes are recorded per spec §18.)
4. Assert the document records the normalization rules reference (§5.3) and any shim / per-OS-cache-key finding for E4-S1 reuse.

**Expected Outcome**:

- `findings/mermaid-render-spike-findings.md` present with: explicit PASS/FAIL per H1–H5 + evidence pointers + one clear MS-0002 recommendation + normalization/shim record.
- → **AC6 satisfied** (NFR-EVID-1).

**Notes / Clarifications**:

- This probe is a **structural** check on the findings document; the verdicts themselves are authored by the operator from the probe evidence (the spike is a human-in-the-loop decision input, not a fully automated gate).

### 5.3 SVG Normalization Rules (Determinism Probe — for MS2-E4-S1 reuse)

> The determinism probe (TC-MRSPIKE-001) **MUST** implement its normalization as a single, pure,
> reusable function and **record the exact rules below** in the findings document so MS2-E4-S1 can
> reuse them verbatim (spec G-8, DEC-2, RSK-1 mitigation; story R1). The normalized — not raw —
> bytes are what byte-stability is asserted against.

The normalization pass applies the following transforms to the raw Mermaid SVG, **in order**:

1. **XML comments stripped** — remove all `<!-- ... -->` (Mermaid/cytoscape may emit version or
   build comments that drift across runs).
2. **Attributes sorted deterministically per element** — sort each element's attributes by a stable
   key (attribute name, then value) so attribute-order variation does not affect the digest.
3. **Ephemeral / instance-specific IDs dropped or rewritten deterministically** — handle
   `mermaid-<n>`-style sequence IDs, clip-path IDs, and any other auto-generated IDs (drop, or
   rewrite to a deterministic sequence such as `mermaid-0`, `mermaid-1`, … in document order).
   This is the primary mitigation for non-deterministic IDs even with `deterministicIds:true`.
4. **Whitespace canonicalization** — collapse runs of whitespace, normalize newlines, and
   trim/standardize indentation so insignificant whitespace variation does not affect the digest.
5. **Font / system metadata normalized or stripped** — strip or canonicalize any font-family
   fallback chains, system font references, renderer version/build strings, timestamps, and
   locale-dependent metadata that can vary across runs or OSes.

**Non-goal of normalization:** the normalization is for **digest stability**, not for altering
rendered semantics. The persisted `fixtures/<name>.expected.svg` is the normalized form; the raw
Mermaid SVG is not the byte-stability target.

## 6. Environments and Test Data

**Environment:**

- **Runtime:** Bun (the version is recorded in the findings doc; pinning per release is the
  downstream golden-fixture policy per `.ai/rules/testing-strategy.md` §"Snapshot rules").
- **Headless DOM:** `happy-dom` registered globally via `@happy-dom/global-registrator` (the
  default Mermaid-DOM path per TDR-0004 and the 2026-07-06 ADR-0002 amendment). `jsdom` is the
  documented fallback/escalation if happy-dom cannot shim a required Mermaid browser API
  (spec RSK-5; TDR-0004 escalation ladder); any such escalation is **recorded** in the findings doc.
- **Workspace:** `spikes/mermaid-render/` — standalone; own `package.json`; `node_modules/` and
  ephemeral render outputs gitignored; code + fixtures + normalized golden SVGs + findings committed.
- **Network:** none. The spike makes no outbound calls (ADR-0002 C-3 local-first posture).

**Anti-over-mocking guardrail (HARD requirement):**

> Per `.ai/rules/testing-strategy.md` §"AI-agent over-mocking guardrail" and TDR-0004, **these probes
> must call the REAL `mermaid.render()` against the REAL `happy-dom` global registrant.** No mocks of
> Mermaid, no mocks of the DOM, no stubbed render output. Mocking would defeat the entire purpose of
> the spike: the point is to learn whether the real library actually behaves deterministically and
> safely headlessly. (Mocks are permitted only for the OS process-listing delta in TC-MRSPIKE-002
> where the listing itself is environment state, not the system under test.)

**Fixtures** (all under `spikes/mermaid-render/fixtures/`):

| Fixture file | Diagram type | Adversarial? | Expected label(s) for fidelity (AC4) |
|---|---|---|---|
| `flowchart.mmd` | `graph TD` (flowchart) | no | node labels e.g. `Hello`, `World` |
| `sequence.mmd` | `sequenceDiagram` | no | actor names |
| `class.mmd` | `classDiagram` | no | class names |
| `state.mmd` | state diagram | no | state labels |
| `gantt.mmd` | gantt | no | task/section labels |
| `adversarial-xss.mmd` | any diagram with `<img src=x onerror=alert(1)>` inside a node label | **yes** | n/a (output must be sanitized — AC5) |
| `adversarial-script.mmd` | any diagram with a `<script>` injection attempt | **yes** | n/a (output must be sanitized — AC5) |

**Test data generation & cleanup:**

- All fixtures are **synthetic**; no real user/Confluence data is used (spec §20).
- The 5 canonical fixtures are **deterministic sources** (hand-authored, committed).
- The normalized golden SVGs (`fixtures/<name>.expected.svg`) are generated by TC-MRSPIKE-001 and
  committed on PASS; raw per-repeat outputs are ephemeral (gitignored).
- No cleanup of external state is required (no external systems touched).

**Isolation:**

- The spike is fully isolated from the main `src/` tree (spec NG-5) and from the project test runner.
- It does **not** register happy-dom globally for the project; the registration is local to the
  spike's `bun run` process.

## 7. Automation Plan and Implementation Mapping

| TC ID | Probe file to create | Execution command | Mocking | Status |
|-------|----------------------|-------------------|---------|--------|
| TC-MRSPIKE-001 | `spikes/mermaid-render/probes/determinism.ts` (+ reusable normalizer module) | `bun run probes/determinism.ts` | None (real `mermaid.render` + real happy-dom) | To implement |
| TC-MRSPIKE-002 | `spikes/mermaid-render/probes/chromium-absence.ts` | `bun run probes/chromium-absence.ts` | None for `bun pm ls`; process-listing is environment state | To implement |
| TC-MRSPIKE-003 | `spikes/mermaid-render/probes/security.ts` | `bun run probes/security.ts` | None (real `mermaid.render` + real happy-dom) | To implement |
| TC-MRSPIKE-004 | Folded into `probes/determinism.ts` **or** `spikes/mermaid-render/probes/fidelity.ts` | `bun run probes/fidelity.ts` (or part of determinism run) | None | To implement |
| TC-MRSPIKE-005 | `spikes/mermaid-render/render.ts` (entry) + the probe pipeline | `bun run render.ts` and each probe via `bun run` | None | To implement |
| TC-MRSPIKE-006 | `spikes/mermaid-render/scripts/secret-scan.sh` (or inline `rg`) | `bun run scripts/secret-scan.sh` (or `rg ...`) | None | To implement (light) |
| TC-MRSPIKE-007 | `findings/mermaid-render-spike-findings.md` (deliverable) + optional presence-check script | `rg -c 'PASS\|FAIL' findings/mermaid-render-spike-findings.md` (structural check) | None | To implement (check + manual verdict authoring) |

**Shared infrastructure to implement (referenced by multiple probes):**

- `spikes/mermaid-render/package.json` — pins `mermaid` 11.x, `happy-dom`, `@happy-dom/global-registrator`; Bun runtime.
- `spikes/mermaid-render/render.ts` — registers happy-dom global, `mermaid.initialize(...)` with the safe ADR-0002 config, and exposes a render helper reused by all probes.
- A **single, pure, reusable SVG normalizer module** (consumed by TC-MRSPIKE-001; lifted verbatim by MS2-E4-S1) implementing the rules in §5.3.

**Not implemented by this spike (downstream):**

- The production **Mermaid-DOM tier** under `tests/` (`bun:test` + happy-dom + preload) — MS2-E4-S1.
- The production **golden-fixture tier** SVG snapshots — MS2-E4-S1 (reuses `fixtures/*.expected.svg` + the normalizer).
- Any wiring into `.github/workflows/ci.yml` — explicitly **not** done for the spike.

## 8. Risks, Assumptions, and Open Questions

### 8.1 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Over-mocking defeats the spike** (an agent mocks `mermaid.render` or happy-dom to make probes "pass") | Critical (the spike would produce false evidence) | Hard guardrail in §6: probes MUST call real `mermaid.render()` against the real happy-dom registrant. Reviewed at the DoR gate and the review phase. |
| Mermaid emits non-deterministic IDs even with `deterministicIds:true` (story R1 / spec RSK-1) | Medium | Deterministic post-normalization (§5.3) before byte comparison; rules recorded for E4-S1 reuse. |
| happy-dom cannot shim a required Mermaid browser API (spec RSK-5) | Medium | TDR-0004 escalation ladder (jsdom → Vitest for Mermaid-DOM files only → Playwright only if real browser layout/graphics are required); whichever escalation is used is **recorded** in the findings doc. |
| Cross-OS byte determinism differs even though same-OS passes (story Q1 / spec RSK-2) | Medium | Accepted contingency (spec DEC-3): proceed with a per-OS cache key in the hash input; record as known-delta. Cross-OS is a **stretch** goal, not the gate. |
| The spike accidentally touches `src/` (spec RSK-6) | Medium | Standalone workspace with its own `package.json`; explicit non-goal NG-5; review gate on the spike diff. |
| Catastrophic failure of H1 and/or H2 — no deterministic path (spec RSK-3) | High (but low probability) | Documented escalation: trigger ADR-0001 language-level reconsideration; CEO records a decision; do **not** silently proceed. MS-0002 itself is not blocked (`code` fallback). |
| Probes are mistakenly wired into the project test runner or CI | Low (process) | Explicit "No CI wiring" note in §1.2 and §4; the plan-writer/coder must run probes via `bun run` in the spike workspace only. |

### 8.2 Assumptions

- The official `mermaid` 11.x package is the library under test (ADR-0002 Part A invariant; reimplementation is a permanent owner NO-GO).
- `securityLevel:"strict"` is the Mermaid default and the correct safe posture for this spike (ADR-0002 Security Requirements).
- Same-OS determinism is a sufficient gate for MS-0002; cross-OS determinism is a stretch goal with the accepted per-OS-cache-key contingency (spec DEC-3).
- The spike's findings are sufficient evidence for the later (lifecycle phase 7) ADR-0002 Part B status update; this test plan does not itself mutate any ADR.
- The standalone spike workspace is permitted to exist alongside the main tree without affecting production builds (gitignored ephemera; no `src/` coupling).
- `bun run` executing the spike end-to-end is itself the H3 evidence (no separate "test" is possible or needed for AC3).

### 8.3 Open Questions

| ID | Question | Status | Owner |
|----|----------|--------|-------|
| OQ-1 | AC3 has no dedicated "test" — the runtime invocation (`bun run render.ts` and the probes) is the H3 evidence. Is a structural wrapper (e.g., asserting the process exited 0 under `bun` and recording `bun --version`) sufficient for AC3? | Assumed **yes** (this plan encodes it as TC-MRSPIKE-005). Confirm at the DoR gate. | Juliusz Ćwiąkalski |
| OQ-2 | Should TC-MRSPIKE-004 (fidelity) be a standalone probe or folded into TC-MRSPIKE-001's per-fixture loop? | Either is acceptable; the plan-writer/coder may choose. Both cover AC4. | Implementer |
| OQ-3 | Exact expected node labels per canonical fixture (§6) — are the suggested placeholders (`Hello`/`World`, actor names, etc.) acceptable, or should specific labels be pinned? | To be finalized at probe implementation; recorded in the findings doc. | Implementer |

## 9. Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-06 | test-plan-writer (GH-11) | Initial test plan. Defined 7 spike-validation probes (TC-MRSPIKE-001…007), 7 fixtures, AC→probe→fixture→evidence traceability matrix, SVG normalization rules (§5.3), anti-over-mocking guardrail, and explicit no-CI-wiring stance. All 7 ACs fully traced. |

## 10. Test Execution Log

> Populated during spike execution (lifecycle phase 6 — delivery). The probes do **not** run in CI;
> this log captures the local `bun run` evidence that feeds the findings document.

| TC ID | Run Date | Result | Evidence pointer | Notes |
|-------|----------|--------|------------------|-------|
| TC-MRSPIKE-001 | _(pending)_ | — | `findings/mermaid-render-spike-findings.md#H1` | |
| TC-MRSPIKE-002 | _(pending)_ | — | `findings/mermaid-render-spike-findings.md#H2` | |
| TC-MRSPIKE-003 | _(pending)_ | — | `findings/mermaid-render-spike-findings.md#H5` | |
| TC-MRSPIKE-004 | _(pending)_ | — | `findings/mermaid-render-spike-findings.md#H4` | |
| TC-MRSPIKE-005 | _(pending)_ | — | `findings/mermaid-render-spike-findings.md#H3` | |
| TC-MRSPIKE-006 | _(pending)_ | — | `findings/mermaid-render-spike-findings.md` (secret-hygiene note) | |
| TC-MRSPIKE-007 | _(pending)_ | — | `findings/mermaid-render-spike-findings.md` | |
