---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
change:
  ref: GH-11
  type: spike
  status: Proposed
  slug: mermaid-render-spike
  title: "[MS2-E1-S1] Mermaid headless-render spike"
  owners: [Juliusz Ćwiąkalski]
  service: marksync-cli
  labels: [spike, ms-0002, mermaid, rendering, adr-0002-validation, adr-0001-validation]
  version_impact: none
  audience: internal
  security_impact: medium
  risk_level: high
  dependencies:
    internal: [MS2-E4-S1, src/infra/mermaid (future consumer, untouched by this spike)]
    external: ["mermaid (npm 11.x)", "happy-dom", "@happy-dom/global-registrator", "Bun runtime"]
---

# CHANGE SPECIFICATION

> **PURPOSE**: Validate, with empirical evidence, whether the official Mermaid library renders **deterministically in-process** under Bun + happy-dom **without Chromium**, so the spike-gated ADR-0002 Part B in-process renderer and the ADR-0001 TypeScript/Bun language choice can be confirmed — or a documented fallback/escalation triggered.

## 1. SUMMARY

This is a **load-bearing spike** that produces **findings + evidence + a recommendation**, not production code. It runs the official `mermaid` library (11.x) in-process under a Bun runtime with a headless DOM (happy-dom), and probes five hypotheses (H1–H5): SVG output determinism, absence of any Chromium dependency, Bun single-binary compatibility, rendering fidelity for the canonical Mermaid subset, and security hardening against adversarial input. The outcome either enables ADR-0002 Part B to advance from spike-gated to spike-validated (and unblocks MS2-E4-S1), or triggers the ADR-0002 fallback ladder (rung 7 `code` policy for MS-0002) with escalation to ADR-0001 language-level reconsideration on catastrophic failure.

The spike lives in a **standalone** workspace and **must not modify the main `src/` tree**.

## 2. CONTEXT

### 2.1 Current State Snapshot

- **ADR-0001** chose TypeScript + Bun (`build --compile`) specifically to run the **official** Mermaid library **in-process** and still ship a single self-contained binary per OS/arch. ADR-0001's confidence rating is explicitly **Medium**, with the dominant residual uncertainty being *"the Mermaid headless-rendering spike (ADR-0002)"*. ADR-0001 lists as a revisit trigger: *"The Mermaid headless-rendering spike (ADR-0002) proves the in-process official library cannot run headless without Chromium."*
- **ADR-0002** is split into two layers: **Part A** (accepted invariant — reuse official Mermaid, never reimplement, content-hash attachment naming) and **Part B** (the in-process headless renderer — **NOT accepted** until a spike proves byte-stable SVG, no hidden Chromium, Bun single-binary compatibility, acceptable fidelity, and safe Mermaid defaults). Part B's preferred headless DOM is **happy-dom** (per TDR-0004 and the 2026-07-06 ADR-0002 amendment), with jsdom as the documented fallback/escalation.
- **TDR-0004** selected `bun:test` + `happy-dom` (via `@happy-dom/global-registrator` + preload) as the default Mermaid-DOM test path, with Vitest/Playwright only as narrow last-resort escalations. TDR-0004's acceptance is itself `status: Proposed` **pending the ADR-0002 spike** confirming the default `happy-dom` path.
- **Feature spec** (`SPEC-MERMAID-RENDERING`) describes the target in-process, deterministic, `securityLevel:"strict"`, content-hash-based renderer — but marks it **spike-gated**: if headless render fails late, MS-0002 falls back to `code` policy.
- The repo is **post-inception, pre-implementation**: `MS-0001` (API validation spike) is complete; `MS-0002` (MVP safe one-way publisher) is the active milestone. No production renderer code exists under `src/infra/mermaid/` yet.

### 2.2 Pain Points / Gaps

- The core architectural commitment to run Mermaid in-process (the entire rationale for choosing TypeScript/Bun over Go) is **asserted but unproven**. No evidence yet shows `mermaid.render()` produces deterministic SVG headlessly without bundling Chromium.
- Headless SVG rendering can be non-deterministic (random/ephemeral element IDs, font/layout variation, timestamp/version drift) — directly threatening the idempotency/attachment-reuse guarantee (ADR-0002 C-1).
- Mermaid rendering executes attacker-influenced diagram source and emits SVG/HTML attached to Confluence — a real attack surface. Mermaid has had 2025–2026 CSS/HTML-injection / XSS advisories; the safe-defaults posture (`securityLevel:"strict"`, `htmlLabels:false`, sanitization) is **asserted but not yet verified** against adversarial fixtures.
- A hidden Chromium/Puppeteer dependency would silently break ADR-0001's single-binary, no-runtime promise.

## 3. PROBLEM STATEMENT

Because ADR-0001 selected TypeScript+Bun and ADR-0002 Part B designated the in-process official-Mermaid renderer as the preferred path **without empirical proof** that it renders deterministically and safely without Chromium, the project cannot commit to the MS2-E4-S1 production renderer (nor fully close ADR-0001/TDR-0004) without risking a late, costly reversal — so this spike must resolve hypotheses H1–H5 with evidence and a clear MS-0002 recommendation before any production rendering code is written.

## 4. GOALS

- **G-1**: Empirically validate that the official `mermaid` library renders **deterministically** in-process (Bun + happy-dom) on the same OS (byte-stable normalized SVG across repeated renders).
- **G-2**: Empirically prove **no Chromium/Puppeteer/Playwright** dependency or process is required to render.
- **G-3**: Confirm **Bun single-binary compatibility** — the render path runs under the Bun runtime, not a Node-only fallback.
- **G-4**: Demonstrate **fidelity** for the canonical Mermaid subset (flowchart, sequence, class, state, gantt).
- **G-5**: Verify **security defaults** hold under adversarial input (no `<script>`, no event handlers, no `javascript:` URIs; `securityLevel:"strict"` active).
- **G-6**: Produce a **findings document** with explicit PASS/FAIL per hypothesis and a clear MS-0002 recommendation.
- **G-7**: On PASS, leave behind a **reusable golden SVG fixture pair** (source + normalized SVG) for MS2-E4-S1 and the golden-test tier.
- **G-8**: Record the **normalization rules** and any shim/per-OS-cache-key findings so E4-S1 can reuse them verbatim.

### 4.1 Success Metrics / KPIs

| Metric | Target |
|--------|--------|
| Determinism (same OS) | 5/5 repeats produce byte-identical normalized SVG per fixture |
| Determinism (cross-OS) | Recorded as PASS or a documented known-delta (stretch) |
| Chromium absence | 0 occurrences of `puppeteer`/`playwright`/`chromium` in the resolved dependency tree; 0 Chromium processes spawned during render |
| Bun execution | Full probe pipeline runs end-to-end via the Bun runtime with no Node-only fallback |
| Fidelity | 5/5 canonical diagram types render non-empty well-formed SVG containing expected node labels |
| Security | 0 `<script>` tags, 0 `onerror`/`onload`/`javascript:` substrings in adversarial output |
| Findings completeness | Explicit PASS/FAIL recorded for each of H1–H5 with evidence pointers + a single clear MS-0002 recommendation |
| Secret hygiene | 0 secrets in any committed artifact |

### 4.2 Non-Goals

- **NG-1**: Wiring Mermaid into the production renderer (`src/infra/mermaid/renderer.ts`) — that is **MS2-E4-S1**.
- **NG-2**: Implementing the content-hash attachment naming (defined in ADR-0002's hash formula; implemented in E4-S1).
- **NG-3**: PNG output, or Kroki/`mmdc`/container fallback paths (ADR-0002 fallback ladder; only relevant if H2 fails).
- **NG-4**: Cross-OS byte determinism is a **stretch goal** — same-OS determinism is the gate.
- **NG-5**: Modifying the main `src/` tree — the spike is standalone; the story explicitly forbids touching `src/`.
- **NG-6**: Updating ADR-0002's status or the blueprint. (The actual ADR update happens in lifecycle **phase 7**, not in this spec — this spike only produces the evidence that *enables* it.)
- **NG-7**: Production-quality packaging of the spike (it has its own standalone `package.json`; only code + fixtures + findings are committed, with `node_modules`/ephemeral outputs gitignored).

## 5. FUNCTIONAL CAPABILITIES

| ID | Capability | Rationale |
|----|------------|-----------|
| F-1 | In-process official-Mermaid rendering via a headless DOM (happy-dom) under the Bun runtime | The mechanism under test; the existence of an in-process no-browser render path is the precondition for ADR-0002 Part B and the entire ADR-0001 rationale. Validates H3, contributes to H4. |
| F-2 | Deterministic normalized-SVG generation | The same Mermaid source + config must yield byte-identical **normalized** output across repeated renders so idempotent attachment reuse holds. Directly validates H1. |
| F-3 | Chromium-absence verification | Prove the dependency tree and the render process contain no hidden browser runtime, preserving the single-binary, no-mandatory-runtime promise (ADR-0001 C-2). Validates H2. |
| F-4 | Canonical-subset fidelity demonstration | Show representative diagrams render to non-empty, well-formed SVG with expected labels, confirming the official library actually functions headlessly. Validates H4. |
| F-5 | Security-hardening validation | Show adversarial inputs are neutralized under safe defaults, establishing the security baseline ADR-0002 requires of **every** renderer rung. Validates H5. |
| F-6 | Findings & recommendation artifact | Capture explicit PASS/FAIL per hypothesis with evidence and a clear MS-0002 recommendation; this is the spike's actual deliverable. |

### 5.1 Capability Details

- **F-1 (in-process render)**: The spike initializes the official `mermaid` library with the safe ADR-0002 configuration (`startOnLoad:false`, `securityLevel:"strict"`, `htmlLabels:false`, `deterministicIds:true`, and a fixed font policy) inside a happy-dom headless environment registered via `@happy-dom/global-registrator`, then renders each fixture source to SVG. No shelling out to `mmdc`, no container, no remote service.
- **F-2 (deterministic output)**: Each fixture is rendered N=5 times; the raw SVG is put through a deterministic **post-normalization** pass (e.g., strip comments, sort attributes deterministically, drop/rewrite ephemeral IDs) before comparison, because Mermaid may emit non-deterministic element IDs even with `deterministicIds:true` (CEO-resolved risk R1). The normalization rules are recorded for E4-S1 reuse. The **normalized** (not raw) bytes are what byte-stability is asserted against.
- **F-3 (Chromium absence)**: Two independent checks — (a) the resolved dependency tree contains none of `puppeteer`/`playwright`/`chromium`; (b) no Chromium/chrome process is spawned during a render run.
- **F-4 (fidelity)**: Five canonical diagram types — flowchart (`graph TD`), `sequenceDiagram`, `classDiagram`, state, gantt — each render to non-empty, well-formed SVG containing the expected node labels.
- **F-5 (security)**: Adversarial fixtures (an `<img src=x onerror=...>` XSS payload and a `<script>` injection attempt inside a node label) render under `securityLevel:"strict"`, and the output is scanned for `<script>` tags, inline event handlers (`onerror`/`onload`), and `javascript:` URIs.
- **F-6 (findings)**: A committed findings document records, for each of H1–H5, an explicit PASS/FAIL with evidence pointers (log paths, fixture paths) and a single clear MS-0002 recommendation: either proceed to E4-S1 in-process rendering, or fall back to the ADR-0002 `code` policy (rung 7) for MS-0002.

## 6. USER & SYSTEM FLOWS

```
Flow 1 — Spike probe pipeline (single operator, local + CI):

  Operator runs spike under Bun
    → happy-dom global registered
    → mermaid initialized (strict / htmlLabels:false / deterministicIds:true / fixed font)
    → for each fixture (flowchart, sequence, class, state, gantt, adversarial×N):
        render source → raw SVG
        normalize SVG (comments stripped, attrs sorted, ephemeral IDs handled)
        repeat N=5 → assert byte-identical within the run  [H1]
        persist normalized SVG as the golden fixture
    → fidelity check: assert each canonical SVG is non-empty, well-formed, contains expected labels  [H4]
    → Chromium-absence check: dependency tree + process listing contain no browser runtime  [H2]
    → security check: adversarial output has zero <script>/event-handler/javascript: substrings  [H5]
    → Bun-compat check: pipeline ran via Bun with no Node-only fallback  [H3]
    → author findings doc: explicit PASS/FAIL per H1–H5 + MS-0002 recommendation  [F-6]
```

```
Flow 2 — Outcome routing (downstream, not executed by this spike):

  PASS (all of H1–H5) → enable ADR-0002 Part B advance to spike-validated (phase 7); unblock MS2-E4-S1.
  Partial fail (deterministic but needs a shim; single-binary promise intact) → record shim; proceed.
  Fail on H2 (needs Chromium) → MS-0002 falls back to ADR-0002 ladder rung 7 (`code` policy); does not block MS-0002.
  Catastrophic fail (no deterministic path at all) → escalate to ADR-0001 language-level reconsideration; CEO records a decision; do NOT silently proceed.
```

## 7. SCOPE & BOUNDARIES

### 7.1 In Scope

- A **standalone spike workspace** under `spikes/mermaid-render/` with its own `package.json` (gitignored: `node_modules` and ephemeral outputs; committed: code + fixtures + normalized golden SVGs + findings doc).
- The official `mermaid` library (latest 11.x) via npm, plus `happy-dom` and `@happy-dom/global-registrator`, running on the **Bun** runtime.
- **Fixtures**: the 5 canonical diagram types (flowchart `graph TD`, `sequenceDiagram`, `classDiagram`, state, gantt) **plus adversarial fixtures** (XSS `<img src=x onerror=...>` payload and `<script>` injection attempt).
- **Determinism probe**: N=5 repeats per fixture; byte-stability asserted against the **normalized** SVG.
- **Chromium-absence probe**: resolved dependency tree inspection + process listing during render.
- **Security probe**: scan adversarial output for `<script>`, inline event handlers, and `javascript:` URIs; confirm `securityLevel:"strict"` is active.
- **Findings document** at `findings/mermaid-render-spike-findings.md` with explicit PASS/FAIL per H1–H5 and a clear MS-0002 recommendation.
- On PASS: a **golden SVG fixture pair** (source + normalized SVG) committed for reuse by MS2-E4-S1 and the golden-test tier.
- Recording of normalization rules and any shim/per-OS-cache-key findings for E4-S1 reuse.

### 7.2 Out of Scope

- [OUT] Wiring Mermaid into the production `src/infra/mermaid/renderer.ts` (MS2-E4-S1).
- [OUT] The content-hash attachment naming (ADR-0002 hash formula; implemented in E4-S1).
- [OUT] PNG output and Kroki/`mmdc`/container fallback rungs (only relevant if H2 fails).
- [OUT] Modifying any file under the main `src/` tree.
- [OUT] Updating ADR-0002's status or the blueprint (lifecycle phase 7; this spike only supplies the enabling evidence).
- [OUT] Cross-OS byte determinism as a gate (it is a **stretch goal**; same-OS is the gate).
- [OUT] Production packaging/release of the spike.

### 7.3 Deferred / Maybe-Later

- Cross-OS (Linux/macOS/Windows) byte determinism is recorded but not gated (stretch); the per-OS cache-key fallback (DEC-3) is the accepted contingency if same-OS passes and cross-OS differs.
- SVG-vs-PNG default output format decision (ADR-0002 open item) is deferred — this spike targets SVG only.
- Vitest/Playwright escalation (TDR-0004) is invoked only if the default happy-dom path cannot run the Mermaid DOM path reliably; that determination is itself a spike output.

## 8. INTERFACES & INTEGRATION CONTRACTS

### 8.1 REST / HTTP Endpoints

N/A. The spike makes no outbound network calls and exposes no HTTP surface. (Privacy default preserved: no diagram content leaves the local environment — ADR-0002 C-3.)

### 8.2 Events / Messages

N/A.

### 8.3 Data Model Impact

N/A. The spike introduces no production data model; normalized SVG fixtures and the findings document are spike artifacts only. (The eventual attachment-identity hash formula belongs to ADR-0002 / E4-S1 and is untouched here.)

### 8.4 External Integrations

| Integration | Role in spike | Notes |
|---|---|---|
| `mermaid` (npm, 11.x) | Library under test | Official package, pinned to 11.x per ADR-0002 ecosystem evidence. |
| `happy-dom` + `@happy-dom/global-registrator` | Headless DOM | Preferred per TDR-0004 and the 2026-07-06 ADR-0002 amendment; jsdom is the documented fallback if happy-dom cannot shim a required Mermaid browser API. |
| Bun runtime | Execution runtime | Confirms ADR-0001 C-2/C-3 single-binary compatibility of the render path. |

### 8.5 Backward Compatibility

N/A. No production code or contracts are modified. The spike's only downstream coupling is **enabling** (on PASS) or **redirecting** (on FAIL) future MS2-E4-S1 work.

## 9. NON-FUNCTIONAL REQUIREMENTS (NFRs)

| ID | Requirement | Threshold |
|----|-------------|-----------|
| NFR-DET-1 | Determinism (same OS): repeated renders of an unchanged fixture produce byte-identical **normalized** SVG | 5/5 repeats byte-identical per fixture |
| NFR-DET-2 | Determinism (cross-OS, stretch) | Result recorded as PASS **or** a documented known-delta across ≥1 other OS |
| NFR-DEP-1 | Chromium absence in the resolved dependency tree | 0 occurrences of `puppeteer`/`playwright`/`chromium` |
| NFR-DEP-2 | Chromium absence at runtime | 0 Chromium/chrome processes spawned during a render run |
| NFR-RUN-1 | Bun single-binary compatibility | Full probe pipeline executes via the Bun runtime with **no** Node-only fallback |
| NFR-FID-1 | Fidelity across the canonical subset | 5/5 diagram types render non-empty, well-formed SVG containing expected node labels |
| NFR-SEC-1 | Security hardening under adversarial input | 0 `<script>` tags, 0 `onerror`/`onload` substrings, 0 `javascript:` URIs in output |
| NFR-SEC-2 | Secret hygiene | 0 secrets in any committed artifact |
| NFR-EVID-1 | Evidence completeness | Explicit PASS/FAIL recorded for each of H1–H5 with evidence pointers + one clear MS-0002 recommendation |

## 10. TELEMETRY & OBSERVABILITY REQUIREMENTS

The spike has no production telemetry. Its "observability" is the **evidence trail** committed as part of the findings:

- **Determinism logs**: per-fixture, per-repeat normalized-SVG digests and the byte-stability verdict.
- **Dependency evidence**: the resolved dependency-tree listing showing absence of `puppeteer`/`playwright`/`chromium`.
- **Process evidence**: confirmation that no Chromium process was spawned during render.
- **Security evidence**: the adversarial output scan results (counts of `<script>`, event-handler substrings, `javascript:` URIs).
- **Normalization record**: the exact normalization rules applied (for E4-S1 reuse).

All evidence is referenced by path/section from the findings document (NFR-EVID-1).

## 11. RISKS & MITIGATIONS

| ID | Risk | Impact | Probability | Mitigation | Residual Risk |
|----|------|--------|-------------|------------|---------------|
| RSK-1 | Mermaid emits non-deterministic element IDs even with `deterministicIds:true`, breaking raw byte-stability (story R1) | M | M | Deterministic **post-normalization** of the SVG before comparison (strip comments, sort attributes, handle ephemeral IDs); record normalization rules for E4-S1 reuse | L |
| RSK-2 | Cross-OS byte determinism differs even though same-OS passes (story Q1) | M | M | Accepted contingency: proceed with in-process render using a **per-OS cache key** in the hash input (ADR-0002 formula already includes `rendererVersion`/`fontPolicy`); record as known-delta | L |
| RSK-3 | Catastrophic failure of H1 and/or H2 — no deterministic path at all | H | L | Documented escalation: trigger ADR-0001 language-level reconsideration; CEO records a decision; **do NOT silently proceed**. MS-0002 itself is not blocked (falls back to `code` policy) | M |
| RSK-4 | A hidden Chromium/Puppeteer dependency surfaces, breaking the single-binary promise | H | L–M | Two independent probes (dependency-tree inspection + process listing); on H2 FAIL, descend ADR-0002 ladder to rung 7 for MS-0002 | L |
| RSK-5 | happy-dom cannot shim a required Mermaid browser API | M | M | TDR-0004 escalation ladder: jsdom fallback, then Vitest (Mermaid-DOM files only), then Playwright only if real browser layout/graphics are required; record which (if any) escalation was used | L |
| RSK-6 | Spike accidentally touches the main `src/` tree, coupling a throwaway experiment to production | M | L | Standalone workspace with its own `package.json`; explicit non-goal (NG-5); review gate on the spike diff | L |

## 12. ASSUMPTIONS

- The official `mermaid` 11.x package is the library under test (Part A invariant; reimplementation is a permanent owner NO-GO).
- `securityLevel:"strict"` is the Mermaid default and is the correct safe posture for this spike (ADR-0002 Security Requirements).
- Same-OS determinism is a sufficient gate for MS-0002; cross-OS determinism is a stretch goal with an accepted per-OS-cache-key contingency (DEC-3).
- The spike's findings are sufficient evidence for the (later, phase 7) ADR-0002 Part B status update; this spec does not itself mutate any ADR.
- The standalone spike workspace (`spikes/mermaid-render/`) is permitted to exist alongside the main tree without affecting production builds (gitignored ephemera; no `src/` coupling).

## 13. DEPENDENCIES

| Direction | Item | Notes |
|-----------|------|-------|
| Depends on | ADR-0001 | Language/runtime choice whose load-bearing rationale this spike validates. |
| Depends on | ADR-0002 (Part B) | Spike-gated primary renderer; this spike is its stop-criteria validation. |
| Depends on | TDR-0004 | Default `bun:test` + `happy-dom` Mermaid-DOM path; TDR-0004 acceptance is itself pending this spike. |
| Depends on | `mermaid` 11.x, `happy-dom`, `@happy-dom/global-registrator`, Bun | External libraries/runtime under test. |
| Blocks | MS2-E4-S1 (Mermaid rendering feature) | Cannot proceed to the production in-process renderer until this spike resolves H1–H5. |
| Blocks | Full closure of ADR-0001 / TDR-0004 | ADR-0001 revisit trigger and TDR-0004 acceptance both hinge on this spike. |
| Blocked by | (none) | The spike has no upstream change dependency. |

## 14. OPEN QUESTIONS

| ID | Question | Context | Status |
|----|----------|---------|--------|
| — | (none pending) | R1 (non-deterministic IDs) and Q1 (cross-OS partial fail) are **CEO-resolved** (see DEC-2, DEC-3); the spike itself is the validation mechanism for the genuinely-open factual questions (H1–H5). | Resolved by spike execution — no separate decision needed. |

## 15. DECISION LOG

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| DEC-1 | **happy-dom** is the headless DOM for this spike (jsdom is the fallback) | TDR-0004 chose happy-dom for Bun compatibility; the 2026-07-06 ADR-0002 amendment aligned the ADR's earlier "jsdom" wording with TDR-0004. | 2026-07-06 |
| DEC-2 | Handle Mermaid's potentially non-deterministic element IDs via **deterministic post-normalization** of the SVG before byte comparison (story R1) | Raw bytes may not be stable even with `deterministicIds:true`; normalization makes the determinism claim meaningful and reusable by E4-S1. | 2026-07-06 |
| DEC-3 | If H1 passes same-OS but fails cross-OS, **proceed** with in-process rendering using a per-OS cache key in the hash input (story Q1) | ADR-0002's hash formula already includes `rendererVersion`/`fontPolicy`; a per-OS key preserves idempotency without abandoning the in-process path. | 2026-07-06 |
| DEC-4 | This is a **spike** delivered in a **standalone** workspace; the main `src/` tree is **not** modified | The story explicitly scopes the spike as standalone and forbids touching production code; the deliverable is findings + evidence + a recommendation. | 2026-07-06 |

## 16. AFFECTED COMPONENTS (HIGH-LEVEL)

| Component | Impact |
|-----------|--------|
| `spikes/mermaid-render/` (new, standalone) | **New** — spike workspace (code + fixtures + normalized golden SVGs + findings doc); own `package.json`; ephemera gitignored. |
| `findings/mermaid-render-spike-findings.md` (new) | **New** — the spike's primary deliverable (PASS/FAIL per H1–H5 + MS-0002 recommendation). |
| Main `src/` tree (incl. `src/infra/mermaid/`) | **Unchanged** — explicitly out of scope (NG-5). |
| ADR-0001 / ADR-0002 / TDR-0004 | **Unchanged by this spec** — the spike *enables* a later (phase 7) status update; no ADR is mutated here. |

## 17. ACCEPTANCE CRITERIA

> Spike acceptance is evidence-based: each AC must be satisfied with an **evidence pointer** (log path, fixture path, or findings-doc section). IDs AC1–AC7 are preserved verbatim from the story and map onto hypotheses H1–H5 (AC1–AC5), the findings deliverable (AC6), and secret hygiene (AC7).

| ID | Criterion (Given / When / Then) | Linked |
|----|----------------------------------|--------|
| AC1 | **Given** each of the 5 canonical fixtures rendered under `securityLevel:"strict"` + `htmlLabels:false` + `deterministicIds:true`, **when** rendered 5 times sequentially on the same OS and put through the deterministic normalization pass, **then** all 5 normalized SVGs are byte-identical per fixture; the cross-OS result is recorded as PASS or a documented known-delta. | F-2, NFR-DET-1, NFR-DET-2, H1 |
| AC2 | **Given** the spike's resolved dependency tree and a render run, **when** inspected via the package manager and the OS process listing, **then** `puppeteer`/`playwright`/`chromium` are absent from the tree and no Chromium/chrome process is spawned during render. | F-3, NFR-DEP-1, NFR-DEP-2, H2 |
| AC3 | **Given** the spike workspace targets the Bun runtime, **when** executed via the Bun runtime entry command, **then** the full probe pipeline runs end-to-end with no Node-only fallback. | F-1, NFR-RUN-1, H3 |
| AC4 | **Given** the 5 canonical diagram types (flowchart `graph TD`, `sequenceDiagram`, `classDiagram`, state, gantt), **when** rendered under the in-process path, **then** each produces a non-empty, well-formed SVG containing its expected node labels. | F-4, NFR-FID-1, H4 |
| AC5 | **Given** adversarial fixtures (an `<img src=x onerror=...>` XSS payload and a `<script>` injection attempt) under `securityLevel:"strict"`, **when** rendered and the output is scanned, **then** it contains zero `<script>` tags, zero `onerror`/`onload` substrings, zero `javascript:` URIs, and `strict` mode is confirmed active. | F-5, NFR-SEC-1, H5 |
| AC6 | **Given** the probe results, **when** the findings document is authored, **then** it records an explicit PASS/FAIL for each of H1–H5 with evidence pointers and a single clear MS-0002 recommendation (proceed to E4-S1 in-process **or** `code` fallback). | F-6, NFR-EVID-1 |
| AC7 | **Given** all committed spike artifacts, **when** scanned, **then** zero secrets are present in any committed file. | NFR-SEC-2 |

### 17.1 Spike Definition of Done

- All 7 ACs (AC1–AC7) satisfied, each with an **evidence pointer** (log path, fixture path, or findings-doc section).
- `spikes/mermaid-render/` committed: code + fixtures + normalized golden SVGs + findings doc; `node_modules` and ephemeral outputs gitignored.
- Findings document (`findings/mermaid-render-spike-findings.md`) records explicit PASS/FAIL per H1–H5 with evidence **and** a clear MS-0002 recommendation.
- On PASS: a golden SVG fixture pair (source + normalized SVG) is committed for reuse by MS2-E4-S1 and the golden-test tier.
- Normalization rules (and any shim / per-OS-cache-key finding) recorded for E4-S1 reuse.
- **No production code under `src/` is touched.**

## 18. ROLLOUT & CHANGE MANAGEMENT (HIGH-LEVEL)

- **Delivery shape**: a standalone spike (no production rollout). The "rollout" is the **decision routing** of the findings.
- **On PASS**: the findings enable (in a later lifecycle phase, not this spec) advancing ADR-0002 Part B from spike-gated to spike-validated and unblocking MS2-E4-S1.
- **On partial PASS (needs a shim, single-binary promise intact)**: record the shim in the findings; proceed.
- **On H2 FAIL (needs Chromium)**: MS-0002 adopts ADR-0002 ladder rung 7 (`code` policy — preserve the code block); full render moves to MS-0003. This does **not** block MS-0002.
- **On catastrophic FAIL (no deterministic path)**: escalate to ADR-0001 language-level reconsideration; CEO records a decision; the team does **not** silently proceed.
- **Communication**: findings + recommendation surfaced to the owner; no user-facing or release-pipeline change.

## 19. DATA MIGRATION / SEEDING (IF APPLICABLE)

N/A. The spike introduces no production data, schema, or migration.

## 20. PRIVACY / COMPLIANCE REVIEW

- The spike runs entirely locally and makes **no outbound network calls** — no diagram source or rendered content leaves the operator's environment (ADR-0002 C-3, local-first posture).
- No real user/Confluence data is required; all fixtures are synthetic.
- The adversarial/security fixtures are intentionally malicious **inputs** used only to validate sanitization; they are not exfiltrated.

## 21. SECURITY REVIEW HIGHLIGHTS

- **Mermaid is a real attack surface**: it executes attacker-influenced diagram source and emits SVG/HTML attached to Confluence; Mermaid had 2025–2026 CSS/HTML-injection / XSS advisories (ADR-0002).
- **Safe defaults under test**: `securityLevel:"strict"` (encodes HTML, disables click), `htmlLabels:false`, `deterministicIds:true`, fixed font policy — per ADR-0002 Security Requirements.
- **Adversarial validation (AC5)**: explicit XSS (`<img src=x onerror=...>`) and `<script>`-injection fixtures; output must contain zero `<script>` tags, zero inline event handlers, zero `javascript:` URIs.
- **Secret hygiene (AC7)**: zero secrets in any committed artifact (the spike must not embed tokens/credentials in fixtures, scripts, or logs).
- **Dependency safety**: the Chromium-absence probe (AC2) doubles as a check that no unexpected heavy/browser runtime is pulled into the single-binary build.

## 22. MAINTENANCE & OPERATIONS IMPACT

- The spike is a **disposable, time-boxed** artifact. Its only durable maintenance footprint is the committed **normalized golden SVG fixtures** and the **normalization rules** carried forward into MS2-E4-S1 and the golden-test tier.
- The findings document is a one-time decision input; it is not an ongoing operational surface.
- No production runbooks, alerts, or SLOs are introduced.

## 23. GLOSSARY

| Term | Definition |
|------|------------|
| Spike | A time-boxed investigation that produces findings/evidence/a recommendation, not production code. |
| happy-dom | A headless DOM implementation chosen (TDR-0004) for Bun compatibility as the default Mermaid-DOM environment. |
| `securityLevel:"strict"` | Mermaid's safe default: encodes HTML tags and disables click functionality. |
| `deterministicIds:true` | Mermaid option intended to produce stable element IDs (spike verifies whether it suffices, with normalization as backup). |
| Normalized SVG | Raw Mermaid SVG put through a deterministic post-processing pass (strip comments, sort attributes, handle ephemeral IDs) so byte comparison is meaningful. |
| Golden fixture pair | A committed source fixture plus its expected normalized output, reused by downstream golden tests. |
| Fallback ladder | ADR-0002's ordered chain (rung 1 in-process … rung 7 `code` policy) for graceful renderer degradation. |
| `code` policy | The last-resort fallback that preserves the raw Mermaid code block instead of rendering it. |

## 24. APPENDICES

- **Appendix A — Hypotheses (verbatim from the story)**
  - **H1 (determinism):** same Mermaid source + config → byte-identical **normalized** SVG across repeated runs on the same OS. (Cross-OS is a stronger bar; same-OS is the gate.)
  - **H2 (no Chromium):** `mermaid.render()` runs under happy-dom with **no** Puppeteer/Chromium process spawned; verify via process listing + absence of `puppeteer`/`playwright` in the dependency tree.
  - **H3 (Bun single-binary compat):** the render path runs under the Bun runtime (not just Node).
  - **H4 (fidelity):** representative diagrams (flowchart `graph TD`, sequence, class, state, gantt) render to non-empty, well-formed SVG containing expected node labels.
  - **H5 (security defaults):** `securityLevel:"strict"` + `htmlLabels:false` + `deterministicIds:true` are accepted by the library and the output contains no `<script>`, no `javascript:` URIs, no inline event handlers.

- **Appendix B — Outcome matrix (from the story)**
  - **PASS** → proceed to MS2-E4-S1 (full in-process rendering).
  - **Partial fail (deterministic but needs a shim)** → record the shim; proceed if the single-binary promise holds.
  - **Fail (needs Chromium)** → MS-0002 falls back to ADR-0002 ladder rung 7 (`code` policy); full render moves to MS-0003. Does **not** block MS-0002.
  - **Catastrophic fail (no deterministic path at all)** → escalate to ADR-0001 language-level reconsideration; CEO records a decision; do **not** silently proceed.

## 25. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-06 | spec-writer (GH-11) | Initial specification seeded from the authoritative story MS2-E1-S1, the feature spec `SPEC-MERMAID-RENDERING`, ADR-0001, ADR-0002 (Part B), and TDR-0004. |

---

## AUTHORING GUIDELINES

- **Source of truth for scope**: the authoritative story `doc/planning/milestones/MS-2/MS2-E1--spikes/MS2-E1-S1--mermaid-render-spike.md` — its Goal, Hypotheses (H1–H5), Methodology, AC checklist, Out-of-scope, and CEO-resolved R1/Q1 were used as the seed. No ACs beyond the story's seven were introduced.
- **Feature spec reference**: `doc/spec/features/feature-mermaid-rendering.md` (capabilities, edge cases, ADR-0001/0002/TDR-0004 links).
- **Decisions referenced by ID**: ADR-0001 (language/runtime), ADR-0002 Part B (spike-gated in-process renderer, stop criteria, fallback ladder, Security Requirements, hash formula), TDR-0004 (bun:test + happy-dom default Mermaid-DOM path).
- **Coding-rules consistency check**: `.ai/rules/typescript.md` (module tiers, allowed deps incl. `mermaid`/`happy-dom`, ESM, strict TS) and `.ai/rules/testing-strategy.md` (Mermaid-DOM tier via happy-dom + preload, golden-fixture snapshot rules, over-mocking guardrail) were consulted for terminology and conventions only; no implementation detail is encoded in this spec.
- **Spike framing**: the deliverable is **findings + evidence + a recommendation**, not production code. The standalone workspace path (`spikes/mermaid-render/`) and the explicit non-touching of `src/` are scope boundaries, not implementation steps.
- **`change.type: spike`** reflects the PM's explicit designation and the existing branch `spike/GH-11/mermaid-render-spike`; it is outside the conventional-commits type set and may be reconciled at the DoR gate if required.
- **No ADR mutation**: per the PM, the actual ADR-0002 Part B status update occurs in lifecycle phase 7 (doc-sync); this spec only produces the enabling evidence.

## VALIDATION CHECKLIST

- [x] `change.ref` matches provided `workItemRef` (GH-11)
- [x] `owners` has at least one entry
- [x] `status` is "Proposed"
- [x] All sections present in order (1–25 + guidelines + checklist)
- [x] ID prefixes consistent and unique (F-, NFR-, RSK-, DEC-, AC, plus the H hypotheses)
- [x] Acceptance criteria reference at least one F-/NFR- ID and use Given/When/Then (AC1–AC7)
- [x] NFRs include measurable values
- [x] Risks include Impact & Probability
- [x] No implementation details (no production file-level code paths, no step-by-step tasks)
- [x] No content duplicated from linked docs (referenced by ID/path only)
- [x] Front matter validates per front_matter_rules
