---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-11-mermaid-render-spike
status: Proposed
created: 2026-07-06T17:19:00Z
last_updated: 2026-07-06T17:19:00Z
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [spike, ms-0002, mermaid, rendering, adr-0002-validation, adr-0001-validation]
links:
  change_spec: ./chg-GH-11-spec.md
  test_plan: ./chg-GH-11-test-plan.md
  authoritative_story: ../../../planning/milestones/MS-2/MS2-E1--spikes/MS2-E1-S1--mermaid-render-spike.md
  testing_strategy: ../../../.ai/rules/testing-strategy.md
  typescript_rules: ../../../.ai/rules/typescript.md
  adr_0002: ../../../decisions/ADR-0002-mermaid-rendering-strategy.md
  tdr_0004: ../../../decisions/TDR-0004-testing-runner.md
  adr_0001: ../../../decisions/ADR-0001-implementation-language-and-runtime.md
  feature_spec: ../../../spec/features/feature-mermaid-rendering.md
summary: >
  Load-bearing spike producing findings + evidence + a recommendation (not production code).
  Runs the official `mermaid` library (11.x) in-process under Bun + happy-dom and probes five
  hypotheses (H1 determinism, H2 no-Chromium, H3 Bun single-binary compat, H4 fidelity, H5 security).
  The outcome either enables ADR-0002 Part B to advance from spike-gated to spike-validated
  (unblocking MS2-E4-S1), or triggers the ADR-0002 fallback ladder (rung 7 `code` policy for
  MS-0002). All code lives in a standalone `spikes/mermaid-render/` workspace; the main `src/`
  tree is not touched.
version_impact: none
---

# IMPLEMENTATION PLAN — GH-11: [MS2-E1-S1] Mermaid headless-render spike

## Context and Goals

This plan delivers a **load-bearing spike**, not a feature. The deliverable is a committed
**standalone spike workspace** (`spikes/mermaid-render/`) plus a **findings document**
(`findings/mermaid-render-spike-findings.md`) that records an explicit PASS/FAIL for each of
hypotheses H1–H5 with evidence pointers and a single clear MS-0002 recommendation.

The spike is the stop-criteria validation for **ADR-0002 Part B** (the in-process headless
renderer) and the load-bearing rationale for **ADR-0001** (TypeScript + Bun chosen specifically
to run the official Mermaid library in-process and still ship a single binary). It also confirms
the default **TDR-0004** `bun:test` + happy-dom Mermaid-DOM path. On PASS, ADR-0002 Part B can
advance from spike-gated to spike-validated (handled in lifecycle phase 7 by `@doc-syncer`, not by
this plan's coder) and MS2-E4-S1 is unblocked. On FAIL the project descends the ADR-0002 fallback
ladder to rung 7 (`code` policy) for MS-0002, which does not block MS-0002.

**How this connects to the change spec:** every phase traces to one or more spec acceptance
criteria (AC1–AC7) and one or more test-plan probes (TC-MRSPIKE-001…007). The coder executes
phases in order; each phase is one Conventional Commit. All code is confined to
`spikes/mermaid-render/` — the main `src/` tree is explicitly untouched (spec NG-5).

**Anti-over-mocking guardrail (HARD):** per the test plan §6 and `.ai/rules/testing-strategy.md`
§"AI-agent over-mocking guardrail", every probe MUST call the **real** `mermaid.render()` against
the **real** happy-dom global registrant. No mocks of Mermaid, no mocks of the DOM, no stubbed
render output. Mocking would defeat the entire purpose of the spike. The only permitted
"non-real" surface is the OS process-listing delta in Phase 4, where the listing is environment
state (not the system under test).

**Resolved open questions (carried from the test plan):**

- **OQ-1** (does the runtime invocation suffice for AC3?): **Yes.** `bun run` executing the spike
  end-to-end is itself the H3 evidence; no separate "test" for AC3 exists or is needed. Phase 0's
  `probe:all` orchestration and Phase 9's run-book make this explicit.
- **OQ-2** (standalone fidelity probe vs folded into determinism?): This plan implements fidelity
  as a **standalone probe** (`probes/fidelity.ts`, Phase 6) to keep each commit independently
  reviewable, while allowing the determinism probe to reuse the same render loop. Both cover AC4.
- **OQ-3** (exact expected labels): Pinned in Phase 1 (each fixture has well-known labels; the
  fidelity probe checks for them as enumerated in Phase 1's fixture table).

**Open questions:**

- None pending. All genuinely-open factual questions (H1–H5) are resolved by spike execution
  itself; the CEO-resolved R1 (non-deterministic IDs) and Q1 (cross-OS delta) are handled by the
  normalization pass (Phase 3) and the per-OS-cache-key contingency recorded in findings.

> **Decision needed?** No. The spike's decisions (DEC-1…DEC-4) are already resolved in the spec;
> this plan only executes them. The spike *produces the evidence* that a later owner decision
  (advance ADR-0002 Part B vs fallback) consumes — that decision is recorded in the findings doc
  recommendation and reconciled by `@doc-syncer` in lifecycle phase 7.

## Scope

### In Scope

- A **standalone spike workspace** under `spikes/mermaid-render/` with its own `package.json`
  (`mermaid` 11.x, `happy-dom`, `@happy-dom/global-registrator`; Bun runtime) — F-1.
- A reusable render entrypoint (`render.ts`) that registers happy-dom and initializes Mermaid with
  the safe ADR-0002 config (`startOnLoad:false`, `securityLevel:"strict"`, `htmlLabels:false`,
  `deterministicIds:true`, fixed font policy) — F-1.
- Seven **fixtures** (5 canonical diagram types + 2 adversarial) under `fixtures/` — F-4, F-5.
- A reusable, pure **SVG normalizer** module recording its rules in a header comment — F-2.
- Seven **spike-validation probes** (determinism, chromium-absence, security, fidelity, bun-compat
  via runtime invocation, secrets scan, findings-doc) covering AC1–AC7 — F-2…F-6.
- The **findings document** (`findings/mermaid-render-spike-findings.md`) with explicit PASS/FAIL
  per H1–H5 + a single clear MS-0002 recommendation — F-6, AC6.
- On PASS: a **golden SVG fixture pair** (source + normalized SVG) committed for MS2-E4-S1 / the
  golden-test tier — spec G-7.
- Recording of normalization rules and any shim/per-OS-cache-key finding for E4-S1 reuse — spec G-8.

### Out of Scope

- Wiring Mermaid into the production renderer (`src/infra/mermaid/renderer.ts`) — that is
  **MS2-E4-S1** (spec NG-1, story OUT).
- The content-hash attachment naming (ADR-0002 hash formula; E4-S1) — spec NG-2.
- PNG output and Kroki / `mmdc` / container fallback rungs — only relevant if H2 fails (spec NG-3).
- Modifying **any** file under the main `src/` tree — spec NG-5.
- Updating ADR-0002's status, the feature spec, or the blueprint — that is lifecycle phase 7
  (`@doc-syncer`); this spike only produces the enabling evidence (spec NG-6). Captured in the
  Doc-update coverage section below.
- **CI wiring** — the spike is NOT wired into `.github/workflows/ci.yml`. It runs locally via
  `bun run`; the findings document is the committed deliverable (test plan §1.2, §4).
- Cross-OS byte determinism as a **gate** — same-OS is the gate; cross-OS is a **stretch** goal
  recorded as PASS or a documented known-delta (spec NG-4, DEC-3).
- Production packaging/release of the spike — spec NG-7.
- These are **spike-validation probes**, NOT one of the six production test tiers and NOT wired
  into the project test runner (`bun test`). They run via `bun run` (the runtime) in the spike
  workspace only (test plan §4).

### Constraints

- **C-SPIKE-1 (standalone):** All code, fixtures, probes, and the normalizer live under
  `spikes/mermaid-render/` with their own `package.json`. Zero coupling to the main `src/` tree.
- **C-SPIKE-2 (no `src/` modification):** No file under `src/` may be created, edited, or deleted.
  Reviewed at the review gate (spec RSK-6).
- **C-SPIKE-3 (real library, no mocking):** Probes call the real `mermaid.render()` against the
  real happy-dom global registrant (test plan §6 anti-over-mocking guardrail). The only non-real
  surface is the OS process-listing delta in Phase 4.
- **C-SPIKE-4 (Bun runtime):** The spike targets the Bun runtime exclusively; no Node-only
  fallback path may be taken (ADR-0001 C-2/C-3; AC3).
- **C-SPIKE-5 (safe defaults):** Mermaid is always initialized with `securityLevel:"strict"` +
  `htmlLabels:false` + `deterministicIds:true` + a fixed font policy (ADR-0002 Security
  Requirements).
- **C-SPIKE-6 (no CI wiring):** No edits to `.github/workflows/ci.yml`; the spike is not added to
  the fast loop or any other workflow.
- **C-SPIKE-7 (no outbound network):** The spike makes no outbound calls (ADR-0002 C-3
  local-first posture; privacy default preserved).
- **C-SPIKE-8 (commit hygiene):** `node_modules/`, ephemeral per-repeat render outputs, and logs
  are gitignored; only code + fixtures + normalized golden SVGs + the lockfile + findings are
  committed.

### Risks

- **RSK-1** (Mermaid emits non-deterministic element IDs even with `deterministicIds:true`):
  Mitigated by the deterministic post-normalization pass (Phase 3) before byte comparison; rules
  recorded for E4-S1 reuse. (spec RSK-1, story R1, DEC-2.)
- **RSK-2** (cross-OS byte determinism differs even though same-OS passes): Accepted contingency —
  proceed with a per-OS cache key in the hash input (spec DEC-3); recorded as known-delta. Not a
  gate; cross-OS is a stretch goal.
- **RSK-3** (catastrophic failure of H1 and/or H2 — no deterministic path): Documented escalation
  to ADR-0001 language-level reconsideration; CEO records a decision; do NOT silently proceed.
  MS-0002 itself is not blocked (`code` fallback). (spec RSK-3.)
- **RSK-4** (hidden Chromium/Puppeteer dependency): Mitigated by two independent probes in Phase 4
  (dependency-tree inspection + process listing); on H2 FAIL descend to rung 7 for MS-0002.
  (spec RSK-4.)
- **RSK-5** (happy-dom cannot shim a required Mermaid browser API): TDR-0004 escalation ladder
  (jsdom → Vitest for Mermaid-DOM files only → Playwright only if real browser layout/graphics are
  required); whichever escalation is used is recorded in the findings doc. (spec RSK-5.)
- **RSK-6** (spike accidentally touches `src/`): Mitigated by the standalone workspace boundary
  (C-SPIKE-1/C-SPIKE-2) and the review gate. (spec RSK-6.)
- **RSK-7** (over-mocking defeats the spike — an agent mocks `mermaid.render` or happy-dom to make
  probes "pass"): Hard guardrail (C-SPIKE-3); reviewed at the DoR gate and the review phase.
  (test plan §8.1.)
- **RSK-8** (probes mistakenly wired into the project test runner or CI): Mitigated by C-SPIKE-6
  and explicit phase instructions to use `bun run`, never `bun test`, and never edit workflow
  files. (test plan §8.1.)

### Success Metrics

| Metric | Target | Source |
|--------|--------|--------|
| Determinism (same OS) | 5/5 repeats byte-identical normalized SVG per fixture | spec §4.1; AC1 |
| Determinism (cross-OS, stretch) | Recorded as PASS or a documented known-delta | spec §4.1; DEC-3 |
| Chromium absence | 0 occurrences of `puppeteer`/`playwright`/`chromium` in resolved tree; 0 Chromium processes during render | spec §4.1; AC2 |
| Bun execution | Full probe pipeline runs via Bun with no Node-only fallback | spec §4.1; AC3 |
| Fidelity | 5/5 canonical diagram types render non-empty well-formed SVG with expected labels | spec §4.1; AC4 |
| Security | 0 `<script>` tags, 0 `onerror`/`onload`/`javascript:` in adversarial output | spec §4.1; AC5 |
| Findings completeness | Explicit PASS/FAIL per H1–H5 with evidence pointers + one clear MS-0002 recommendation | spec §4.1; AC6 |
| Secret hygiene | 0 secrets in any committed artifact | spec §4.1; AC7 |

## Phases

> **Execution model:** phases run strictly in order. Each phase is **one Conventional Commit**
> (commit message per phase). The coder may be invoked as
> `/run-plan GH-11 execute all remaining phases no review`; every phase below is independently
> executable and committable. **Commit types:** `chore(spike):` for scaffolding/fixtures/probes/
> code; `docs(spike):` for the findings doc and README (the spike is not a feature — do NOT use
> `feat`). **Workspace:** every file path below is relative to the repo root and prefixed with
> `spikes/mermaid-render/` unless explicitly noted otherwise (the findings doc lives at
> `findings/mermaid-render-spike-findings.md` at the repo root, alongside the spike workspace).
>
> **`bun run` only — never `bun test`:** probes execute via the Bun **runtime** (`bun run
> <script>`), not the `bun:test` test runner. No file in this spike is a `bun:test` test file
> (test plan §4).

---

### Phase 0: Spike workspace scaffolding

**Goal**: Create the standalone spike workspace with its own `package.json`, lockfile, gitignore,
README stub, and tsconfig, and materialize dependencies via `bun install`. This phase makes every
subsequent phase runnable via `bun run`.

**Tasks**:

- [x] **0.1** Create `spikes/mermaid-render/package.json` with:
  - `"type": "module"`
  - `dependencies`: `mermaid` (pinned to latest 11.x, e.g. `"^11.16.0"` or the resolved latest
    11.x), `happy-dom`, `@happy-dom/global-registrator`
  - `scripts`:
    - `"render": "bun run render.ts"`
    - `"probe:determinism": "bun run probes/determinism.ts"`
    - `"probe:chromium": "bun run probes/chromium-absence.ts"`
    - `"probe:security": "bun run probes/security.ts"`
    - `"probe:fidelity": "bun run probes/fidelity.ts"`
    - `"probe:secrets": "bash scripts/secret-scan.sh"`
    - `"probe:all": "bun run probes/run-all.ts"`
  - No `"name"` that collides with the main package; keep it self-contained.
  - (mermaid resolved to 11.16.0; happy-dom 15.11.7; @happy-dom/global-registrator 15.11.7.)
- [x] **0.2** Create `spikes/mermaid-render/.gitignore` ignoring: `node_modules/`, `.spike-cache/`,
  ephemeral per-repeat render outputs (e.g. `*.raw.svg`, `fixtures/*.repeat-*.svg`), and any log
  files (e.g. `*.log`). Note: `fixtures/*.expected.svg` (the golden normalized SVGs) MUST be
  committed — do NOT gitignore them.
- [x] **0.3** Create `spikes/mermaid-render/README.md` stub with: purpose (one paragraph), the
  quick-start command (`bun install && bun run render`), and a note that the full run-book is
  finalized in Phase 9. (The stub is intentionally minimal here.)
- [x] **0.4** Create `spikes/mermaid-render/tsconfig.json` with strict, ESNext, `module`/`moduleResolution`
  suitable for Bun, `"types": ["bun"]`, `include` of the spike sources. If strict-mode flags prove
  Bun-unviable for the spike (e.g. library type gaps), relax the minimum necessary flag and
  document the reason in a comment in `tsconfig.json`. Prefer ESM/strict conventions from
  `.ai/rules/typescript.md` where reasonable (the rules target production `src/`; the spike is
  standalone but should still follow ESM/strict conventions where reasonable).
- [x] **0.5** Run `bun install` (in `spikes/mermaid-render/`) to materialize `bun.lock` and
  `node_modules/`. Confirm the resolved `mermaid` version is 11.x.
  - (Bun 1.1.34 emits the binary `bun.lockb` rather than the text `bun.lock`; that is the correct
    lockfile format for this runtime. Committed as `bun.lockb`.)
- [x] **0.6** Verify `node_modules/` is gitignored and `bun.lock` is staged for commit.
  - (`node_modules/` confirmed gitignored; `bun.lockb` confirmed tracked-eligible.)

**Acceptance Criteria**:

- Must: `spikes/mermaid-render/package.json` exists with `type: module`, mermaid 11.x, happy-dom,
  @happy-dom/global-registrator, and the seven scripts above (C-SPIKE-1).
- Must: `bun install` succeeds; `bun.lock` is committed; `node_modules/` is gitignored (C-SPIKE-8).
- Must: no file under the main `src/` tree is touched (C-SPIKE-2).
- Should: `bun run render` at least fails cleanly (no "module not found" for mermaid) — the render
  entrypoint itself is created in Phase 2.

**Affected code areas**:

- `spikes/mermaid-render/package.json` (new)
- `spikes/mermaid-render/.gitignore` (new)
- `spikes/mermaid-render/README.md` (new — stub)
- `spikes/mermaid-render/tsconfig.json` (new)
- `spikes/mermaid-render/bun.lock` (new — generated, committed)

**System docs to update**:

- none (spike scaffolding touches no system docs; ADR/spec reconciliation is lifecycle phase 7).

**Tests**:

- Manual: `cd spikes/mermaid-render && bun install` exits 0; `mermaid` resolves to 11.x.
- Manual: `git status` shows `node_modules/` ignored and `bun.lock` tracked.

**Completion signal**: `chore(spike): scaffold mermaid-render spike workspace (GH-11)`

---

### Phase 1: Fixtures

**Goal**: Create the seven fixtures (5 canonical diagram types + 2 adversarial) with well-known
expected labels so the fidelity probe (Phase 6) and security probe (Phase 5) have deterministic
inputs. F-4, F-5.

**Tasks**:

- [x] **1.1** Create `spikes/mermaid-render/fixtures/flowchart.mmd` — a `graph TD` flowchart
  containing the expected labels `Hello` and `World` (e.g. `graph TD\n  A[Hello] --> B[World]`).
- [x] **1.2** Create `spikes/mermaid-render/fixtures/sequence.mmd` — a `sequenceDiagram` with
  actor names (e.g. `Alice` and `Bob`) as the expected labels.
- [x] **1.3** Create `spikes/mermaid-render/fixtures/class.mmd` — a `classDiagram` with class
  names (e.g. `Animal` and `Dog`) as the expected labels.
- [x] **1.4** Create `spikes/mermaid-render/fixtures/state.mmd` — a `stateDiagram-v2` (or
  `stateDiagram`) with state labels (e.g. `Idle` and `Active`) as the expected labels.
- [x] **1.5** Create `spikes/mermaid-render/fixtures/gantt.mmd` — a `gantt` with task/section
  labels (e.g. a section `Build` with a task `Spike`) as the expected labels.
- [x] **1.6** Create `spikes/mermaid-render/fixtures/adversarial-xss.mmd` — an adversarial
  fixture embedding an XSS payload `<img src=x onerror=alert(1)>` inside a node label (the
  malformed input used to validate sanitization under `securityLevel:"strict"`). No expected
  fidelity labels (output must be sanitized — AC5).
- [x] **1.7** Create `spikes/mermaid-render/fixtures/adversarial-script.mmd` — an adversarial
  fixture with a `<script>` injection attempt inside a node label. No expected fidelity labels.
- [x] **1.8** Document the pinned expected labels (per fixture) in a short comment at the top of
  each canonical fixture file, so Phase 6 has a single source of truth for the labels it asserts.
  - (Bonus: added the optional 3rd adversarial fixture `fixtures/adversarial-external-ref.mmd`
    per DoR finding F2 to exercise an external-resource/`<use href="http://...">` payload;
    full external-resource blocking is deferred to MS2-E4-S1.)

**Expected labels table (single source of truth — test plan §6 / OQ-3 resolution):**

| Fixture | Diagram type | Adversarial? | Expected label(s) for fidelity (AC4) |
|---|---|---|---|
| `flowchart.mmd` | `graph TD` | no | `Hello`, `World` |
| `sequence.mmd` | `sequenceDiagram` | no | `Alice`, `Bob` |
| `class.mmd` | `classDiagram` | no | `Animal`, `Dog` |
| `state.mmd` | state diagram | no | `Idle`, `Active` |
| `gantt.mmd` | gantt | no | `Build`, `Spike` |
| `adversarial-xss.mmd` | diagram with `<img src=x onerror=alert(1)>` in a label | **yes** | n/a (sanitized — AC5) |
| `adversarial-script.mmd` | diagram with `<script>` injection attempt | **yes** | n/a (sanitized — AC5) |

**Acceptance Criteria**:

- Must: all seven fixtures exist under `spikes/mermaid-render/fixtures/` (5 canonical + 2
  adversarial).
- Must: each canonical fixture carries its pinned expected labels (table above) as a header
  comment (OQ-3 resolution).
- Must: adversarial fixtures contain the XSS `<img src=x onerror=...>` payload and the `<script>`
  injection attempt respectively.
- Must: no `src/` change (C-SPIKE-2).

**Affected code areas**:

- `spikes/mermaid-render/fixtures/flowchart.mmd` (new)
- `spikes/mermaid-render/fixtures/sequence.mmd` (new)
- `spikes/mermaid-render/fixtures/class.mmd` (new)
- `spikes/mermaid-render/fixtures/state.mmd` (new)
- `spikes/mermaid-render/fixtures/gantt.mmd` (new)
- `spikes/mermaid-render/fixtures/adversarial-xss.mmd` (new)
- `spikes/mermaid-render/fixtures/adversarial-script.mmd` (new)

**System docs to update**:

- none.

**Tests**:

- Manual: each `.mmd` file is non-empty and parses as valid Mermaid source for its diagram type
  (a quick `bun run render.ts`-adjacent smoke can wait until Phase 2).

**Completion signal**: `chore(spike): add mermaid render spike fixtures (GH-11)`

---

### Phase 2: Render entrypoint

**Goal**: Create the render entrypoint that registers the happy-dom global registrant BEFORE
importing Mermaid, initializes Mermaid with the safe ADR-0002 config, and exposes a reusable
`render(source, id)` helper returning the SVG string. F-1. This is shared infrastructure for all
subsequent probes (TC-MRSPIKE-005 partial).

**Tasks**:

- [x] **2.1** Create `spikes/mermaid-render/render.ts` that:
  - Registers happy-dom globally via `@happy-dom/global-registrator` BEFORE importing Mermaid:
    `import { GlobalRegistrator } from "@happy-dom/global-registrator"; GlobalRegistrator.register();`
    (this ordering is load-bearing — Mermaid probes `window`/`document` at import time).
    - (Implemented via a dynamic `await import("mermaid")` AFTER `GlobalRegistrator.register()`
      so ESM static-import hoisting cannot run mermaid's module top-level before registration.)
  - Then imports Mermaid (`import mermaid from "mermaid";`).
  - Calls `await mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, deterministicIds: true, fontFamily: "<fixed policy>" })` exactly once, where `<fixed policy>` is a
    single concrete font family string (pin it, e.g. a generic family, and record the choice in a
    comment — this is part of the hash input per ADR-0002).
    - (FIXED_FONT_FAMILY = "sans-serif" — OS-agnostic generic family; part of the ADR-0002
      content-hash input; choice documented in render.ts.)
  - Exposes an async helper `render(source: string, id: string): Promise<string>` that wraps
    `await mermaid.render(id, source)` and returns the SVG string. (Accept whichever overload
    shape Mermaid 11.x exposes; document the chosen call in a comment.)
    - (mermaid.render(id, text) -> { svg, bindFunctions } in 11.x; documented in render.ts.)
  - When run directly as `bun run render.ts`, performs a single smoke render of a trivial
    in-source diagram and prints the SVG length (so `bun run render` is a runnable smoke check).
- [x] **2.2** Confirm `bun run render` executes under Bun (not Node) and prints a non-zero SVG
  length — this is the first H3 evidence (TC-MRSPIKE-005).
  - (Result: runtime=bun, bunVersion=1.1.34, smokeSvgLength=10745, exit 0. First H3 evidence.)
- [x] **2.3** Confirm `mermaid.initialize` accepts `securityLevel:"strict"` (no thrown error, no
  silent override) — record this so Phase 5 can assert it programmatically.
  - (Confirmed: getActiveConfig() reads back securityLevel="strict", htmlLabels=false,
    deterministicIds=true, fontFamily="sans-serif"; no silent override.)

**Acceptance Criteria**:

- Must: happy-dom global registrant is registered BEFORE the Mermaid import (C-SPIKE-3 — real
  DOM, real library).
- Must: Mermaid is initialized with the full safe ADR-0002 config (C-SPIKE-5).
- Must: `render(source, id)` helper is exported and reusable by all probes.
- Must: `bun run render.ts` runs under Bun and produces a non-empty SVG (no Node-only fallback —
  C-SPIKE-4; first H3 evidence).
- Must: no `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: this phase contributes to **AC3 (H3)** — the render
entrypoint running under Bun is the first runtime evidence.

**Affected code areas**:

- `spikes/mermaid-render/render.ts` (new)

**System docs to update**:

- none.

**Tests**:

- Manual: `cd spikes/mermaid-render && bun run render` exits 0 under Bun and prints a non-zero SVG
  length (record `bun --version` for the findings doc).

**Completion signal**: `chore(spike): add mermaid render entrypoint with happy-dom + strict config (GH-11)`

---

### Phase 3: Determinism probe + SVG normalizer

**Goal**: Create the reusable SVG normalizer (recording its rules in a header comment) and the
determinism probe that renders each canonical fixture N=5 times, normalizes, byte-compares, and
persists the golden normalized SVG. F-2; AC1 / H1; TC-MRSPIKE-001.

**Tasks**:

- [x] **3.1** Create `spikes/mermaid-render/normalize.ts` — a single, pure, reusable SVG
  normalizer module (no side effects) that MS2-E4-S1 can lift verbatim. It implements, **in
  order**, the normalization rules from the test plan §5.3:
  1. **XML comments stripped** — remove all `<!-- ... -->`.
  2. **Attributes sorted deterministically per element** — sort each element's attributes by a
     stable key (attribute name, then value).
  3. **Ephemeral / instance-specific IDs dropped or rewritten deterministically** — handle
     `mermaid-<n>`-style sequence IDs, clip-path IDs, and other auto-generated IDs (drop, or
     rewrite to a deterministic sequence such as `mermaid-0`, `mermaid-1`, … in document order).
     This is the primary mitigation for non-deterministic IDs even with `deterministicIds:true`.
  4. **Whitespace canonicalization** — collapse runs of whitespace, normalize newlines, trim/
     standardize indentation.
  5. **Font / system metadata normalized or stripped** — strip/canonicalize font-family fallback
     chains, system font references, renderer version/build strings, timestamps, locale-dependent
     metadata.
  - The module MUST record these rules verbatim in a header comment so MS2-E4-S1 and the
    golden-test tier can reuse them without re-derivation (spec G-8, DEC-2, RSK-1 mitigation).
    - (All five rules recorded verbatim in normalize.ts header; ids rewritten to eid{N} sequence.)
  - Export a pure function `normalizeSvg(rawSvg: string): string`.
- [x] **3.2** Create `spikes/mermaid-render/probes/determinism.ts` that:
  - Imports the real `render` helper (from `render.ts`) and the real `normalizeSvg` (from
    `normalize.ts`) — no mocking (C-SPIKE-3).
  - For each of the 5 canonical fixtures: render N=5, normalize, sha256, byte-compare within run;
    persist `fixtures/<name>.expected.svg`; emit per-fixture PASS/FAIL.
  - RESULT (Bun 1.1.34): flowchart + gantt render and are byte-stable normalized (digests stable
    across N=5); sequence/class/state THROW under happy-dom (`svg element not in render tree` /
    `Could not find a suitable point for the given distance`) → recorded as FAIL-to-render
    (cannot be determinism-tested), NOT massaged.
- [x] **3.3** Run `bun run probe:determinism` and capture the result. (The findings doc is
  written in Phase 8; here only capture the raw probe output.)
  - (Captured: 2/5 renderable & byte-stable; 3/5 fail-to-render. Golden SVGs persisted for the
    2 renderable fixtures: fixtures/flowchart.expected.svg, fixtures/gantt.expected.svg.)
  - (Stretch cross-OS: same-OS only — single Linux host available; recorded in findings Phase 8.)

**Acceptance Criteria**:

- Must: `normalize.ts` is pure and records all five normalization rules in a header comment (spec
  G-8, DEC-2).
- Must: determinism probe calls the real `render` + real `normalizeSvg` (no mocks — C-SPIKE-3).
- Must: 5/5 canonical fixtures produce byte-identical normalized SVG across N=5 repeats on the
  same OS → **AC1 / H1 PASS** (or, if any fails, H1 FAIL is recorded honestly).
- Must: `fixtures/<name>.expected.svg` is persisted for each canonical fixture (on PASS these are
  the golden fixture pairs for MS2-E4-S1 — spec G-7).
- Must: cross-OS result recorded as PASS or documented known-delta (stretch — DEC-3).
- Must: no `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: **AC1 (H1)**.

**Probe mapping**: TC-MRSPIKE-001 (also exercises NFR-FID-1/AC4 via per-fixture assertions, per
test plan §3.1).

**Affected code areas**:

- `spikes/mermaid-render/normalize.ts` (new — the reusable normalizer)
- `spikes/mermaid-render/probes/determinism.ts` (new)
- `spikes/mermaid-render/fixtures/flowchart.expected.svg` (new — golden, persisted by the probe)
- `spikes/mermaid-render/fixtures/sequence.expected.svg` (new — golden)
- `spikes/mermaid-render/fixtures/class.expected.svg` (new — golden)
- `spikes/mermaid-render/fixtures/state.expected.svg` (new — golden)
- `spikes/mermaid-render/fixtures/gantt.expected.svg` (new — golden)

**System docs to update**:

- none (the normalization rules are recorded in the findings doc in Phase 8 and in the
  `normalize.ts` header comment; ADR/spec reconciliation is lifecycle phase 7).

**Tests**:

- Run: `cd spikes/mermaid-render && bun run probe:determinism` → captures per-fixture
  byte-stability verdict (5/5 expected).

**Completion signal**: `chore(spike): add determinism probe + reusable SVG normalizer (GH-11)`

---

### Phase 4: Chromium-absence probe

**Goal**: Create the Chromium-absence probe that proves the resolved dependency tree and the
render process contain no hidden browser runtime. F-3; AC2 / H2; TC-MRSPIKE-002.

**Tasks**:

- [x] **4.1** Create `spikes/mermaid-render/probes/chromium-absence.ts` that performs two
  **independent** checks (per spec F-3/AC2, either failing alone is enough to FAIL H2):
  1. **Dependency-tree check (NFR-DEP-1):** capture `bun pm ls` output for the spike workspace
     (e.g. via `Bun.spawn(["bun", "pm", "ls"], { cwd: ... })`) and assert the resolved dependency
     tree contains **zero** occurrences of the substrings `puppeteer`, `playwright`, and
     `chromium` (case-insensitive). Persist the filtered `bun pm ls` capture to evidence.
     - (Uses the TRANSITIVE listing `bun pm ls --all` per DoR finding F3; 117 lines scanned;
       zero forbidden-substring occurrences. Evidence printed by the probe.)
  2. **Runtime process check (NFR-DEP-2):** immediately before rendering a representative fixture,
     snapshot the OS process listing; render via the real `render` helper; immediately after,
     snapshot again. Assert **no** Chromium/chrome process appears in the delta during the render.
     The process check may use `Bun.spawn` to run `pgrep`/`ps` — **note in the probe if this is
     OS-specific and degraded on some platforms** (e.g. `pgrep` absent on some Windows/WSL setups;
     record the platform and degrade gracefully rather than silently passing).
     - (Uses `ps aux` (POSIX); platform=linux/x64. 2 pre-existing chrome procs on the host before
       AND after render; DELTA=0 → render spawns no chromium. Degraded gracefully if `ps` absent.)
  - Print both verdicts and an overall H2 verdict (PASS requires both checks clean).
- [x] **4.2** Run `bun run probe:chromium` and capture the result.
  - (Result: dep-tree PASS (0 forbidden), process PASS (delta 0). H2 verdict: PASS. The spike's
    no-Chromium render path works — it just produces degenerate output, which is the H4 problem.)

**Acceptance Criteria**:

- Must: 0 occurrences of `puppeteer`/`playwright`/`chromium` in the resolved dependency tree
  (NFR-DEP-1).
- Must: 0 Chromium/chrome processes spawned during a render run (NFR-DEP-2).
- Must: the probe calls the real `render` for the process check (C-SPIKE-3 — only the
  process-listing delta is environment state, not mocked Mermaid/DOM).
- Must: the probe documents OS-specific degradation of the process check where applicable.
- Must: no `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: **AC2 (H2)**.

**Probe mapping**: TC-MRSPIKE-002.

**Affected code areas**:

- `spikes/mermaid-render/probes/chromium-absence.ts` (new)

**System docs to update**:

- none.

**Tests**:

- Run: `cd spikes/mermaid-render && bun run probe:chromium` → captures tree + process verdicts
  (both clean expected).

**Completion signal**: `chore(spike): add chromium-absence probe (dep tree + process) (GH-11)`

---

### Phase 5: Security probe

**Goal**: Create the security probe that renders the adversarial fixtures under
`securityLevel:"strict"` and asserts the normalized SVG contains zero `<script>`, zero inline
event handlers, and zero `javascript:` URIs, and confirms `strict` mode is active. F-5; AC5 / H5;
TC-MRSPIKE-003.

**Tasks**:

- [x] **5.1** Create `spikes/mermaid-render/probes/security.ts` that:
  - Confirms `securityLevel:"strict"` is the **active** configuration by reading back the
    initialized Mermaid config object after `initialize` (e.g. via `mermaid.getConfig()` or the
    equivalent 11.x API; assert the initialization did not reject `strict` and was not silently
    overridden). Document the API used in a comment.
    - (Uses `mermaid.mermaidAPI.getConfig()`; reads back securityLevel=strict, htmlLabels=false,
      deterministicIds=true, fontFamily=sans-serif — no silent override.)
  - Renders each adversarial fixture (`adversarial-xss.mmd`, `adversarial-script.mmd`) via the
    real `render` helper under `securityLevel:"strict"` + `htmlLabels:false` +
    `deterministicIds:true` (no mocking — C-SPIKE-3).
    - (Also renders the optional `adversarial-external-ref.mmd` per DoR finding F2.)
  - Normalizes each rendered output via the real `normalizeSvg` (reuse from Phase 3).
  - Scans each normalized output for:
    (a) `<script` tags (count must be 0);
    (b) inline event-handler substrings `onerror` and `onload` (count must be 0);
    (c) `javascript:` URIs (count must be 0).
    - (Scans the LIVE forms: `<script\b`, `\bonerror\s*=`, `\bonload\s*=`, `javascript:`. Also
      reports bare substring counts for transparency — inert HTML-escaped display text is NOT a
      security issue and is not gated.)
  - Persists the scan counts per adversarial fixture (evidence for the findings doc).
  - Prints per-fixture scan counts and an overall H5 verdict (PASS requires all counts zero AND
    `strict` confirmed active).
    - (Result: all three adversarial fixtures PASS — 0 script tags, 0 live onerror=/onload=, 0
      javascript:, 0 bare substrings; strict active. H5 PASS, scoped per F2.)
- [x] **5.2** Run `bun run probe:security` and capture the result. (H5 verdict: PASS.)

**Acceptance Criteria**:

- Must: zero `<script>` tags, zero `onerror`/`onload` substrings, zero `javascript:` URIs in the
  normalized adversarial output (NFR-SEC-1).
- Must: `securityLevel:"strict"` confirmed active (programmatically read back).
- Must: the probe uses the real `render` + real `normalizeSvg` (C-SPIKE-3).
- Must: no `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: **AC5 (H5)**.

**Probe mapping**: TC-MRSPIKE-003.

**Affected code areas**:

- `spikes/mermaid-render/probes/security.ts` (new)

**System docs to update**:

- none.

**Tests**:

- Run: `cd spikes/mermaid-render && bun run probe:security` → captures adversarial-output scan
  counts (all zero expected).

**Completion signal**: `chore(spike): add security probe (adversarial sanitization under strict) (GH-11)`

---

### Phase 6: Fidelity checks

**Goal**: Create the fidelity probe that asserts each of the 5 canonical diagram types renders to
non-empty, well-formed SVG containing its expected node labels (the labels pinned in Phase 1).
F-4; AC4 / H4; TC-MRSPIKE-004.

**Tasks**:

- [ ] **6.1** Create `spikes/mermaid-render/probes/fidelity.ts` that:
  - For each of the 5 canonical diagram types (flowchart `graph TD`, `sequenceDiagram`,
    `classDiagram`, state, gantt), renders the fixture once via the real `render` helper.
  - Asserts each output is:
    (a) non-empty (length > 0);
    (b) well-formed SVG — parse it with the same DOM lib (happy-dom) already registered in
        `render.ts` and check the root is an `<svg ...>` element **with children** (a tiny
        well-formedness check; do not pull a heavyweight XML validator into the spike);
    (c) contains its expected node label(s) (from the Phase 1 table) as substring(s) of the SVG
        text.
  - Records the per-type PASS/FAIL and prints an overall H4 verdict (PASS requires 5/5).
- [ ] **6.2** Run `bun run probe:fidelity` and capture the result.

**Acceptance Criteria**:

- Must: 5/5 diagram types render non-empty, well-formed SVG (root is `<svg>` with children)
  containing the expected node labels (NFR-FID-1).
- Must: the probe uses the real `render` and real happy-dom (C-SPIKE-3).
- Must: no `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: **AC4 (H4)**.

**Probe mapping**: TC-MRSPIKE-004 (the test plan allows folding this into the determinism probe;
this plan implements it as a standalone probe per OQ-2 resolution for independent reviewability).

**Affected code areas**:

- `spikes/mermaid-render/probes/fidelity.ts` (new)

**System docs to update**:

- none.

**Tests**:

- Run: `cd spikes/mermaid-render && bun run probe:fidelity` → captures per-type verdict (5/5
  expected).

**Completion signal**: `chore(spike): add fidelity probe (5 diagram types + expected labels) (GH-11)`

---

### Phase 7: Secrets scan

**Goal**: Create the secrets-scan script and wire it as `probe:secrets`, then run it. AC7;
TC-MRSPIKE-006.

**Tasks**:

- [ ] **7.1** Create `spikes/mermaid-render/scripts/secret-scan.sh` — a grep-based scan (use `rg`
  if available, else `grep -r`) across `spikes/mermaid-render/` (excluding `node_modules/`, logs,
  and ephemeral outputs) plus the `findings/` directory, for common secret patterns:
  - API tokens / `Bearer ` / `xoxb-` (Slack) / `AKIA` (AWS prefixes)
  - private-key headers (`-----BEGIN ... PRIVATE KEY-----`)
  - high-entropy base64 blobs in fixture/script files
  - any `MARKSYNC_*` credential env-var **values** (keys/names are fine; values must be absent)
  - exit non-zero if any match is found; print the matches.
- [ ] **7.2** Confirm the scan excludes `node_modules/` and ephemeral outputs (they are gitignored
  and therefore not committed, so they are out of scan scope for "committed artifact").
- [ ] **7.3** Run `bun run probe:secrets` (i.e. `bash scripts/secret-scan.sh`) and confirm it
  reports 0 matches. The one-line verdict ("Secrets scan: 0 secrets in committed artifacts
  (reviewed <date>).") is recorded in the findings doc in Phase 8.

**Acceptance Criteria**:

- Must: the scan reports 0 secrets across committed spike artifacts (NFR-SEC-2).
- Must: the scan excludes gitignored directories (`node_modules/`, ephemera).
- Must: no `src/` change (C-SPIKE-2).

**Acceptance Criteria → AC mapping**: **AC7** (NFR-SEC-2).

**Probe mapping**: TC-MRSPIKE-006.

**Affected code areas**:

- `spikes/mermaid-render/scripts/secret-scan.sh` (new)

**System docs to update**:

- none.

**Tests**:

- Run: `cd spikes/mermaid-render && bun run probe:secrets` → 0 matches expected.

**Completion signal**: `chore(spike): add secrets scan script (probe:secrets) (GH-11)`

---

### Phase 8: Run all probes + write findings document

**Goal**: Run the full probe pipeline (`probe:all`) and author the findings document — the
**load-bearing deliverable** of the spike — with explicit PASS/FAIL per H1–H5, evidence pointers,
forced ADR updates, and a single clear MS-0002 recommendation. F-6; AC6; TC-MRSPIKE-007. Also
wires the `probe:all` orchestrator.

**Tasks**:

- [ ] **8.1** Create `spikes/mermaid-render/probes/run-all.ts` that runs the full pipeline
  end-to-end under Bun (determinism → chromium-absence → security → fidelity → secrets), prints a
  combined summary, and records `bun --version` and the OS/platform. This orchestrator is itself
  H3 evidence: the fact that it completes via `bun run probe:all` with no Node-only fallback is the
  AC3/H3 verdict (test plan §8.3 / OQ-1).
- [ ] **8.2** Run `bun run probe:all` (and individually, `probe:determinism`, `probe:chromium`,
  `probe:security`, `probe:fidelity`, `probe:secrets`, as needed) and capture all results.
- [ ] **8.3** Create `findings/mermaid-render-spike-findings.md` (at the **repo root** under
  `findings/`, not under `spikes/`) with:
  - **Executive summary** — overall verdict: **PASS** / **Partial** / **FAIL**, with a one-paragraph
    rationale.
  - **Per-hypothesis verdict table (H1–H5)** with evidence pointers (fixture paths, probe output
    snippets, normalized SVG paths, scan counts):
    | Hypothesis | Verdict | Evidence |
    |---|---|---|
    | H1 determinism | PASS/FAIL | `fixtures/*.expected.svg`; determinism probe digest table |
    | H2 no Chromium | PASS/FAIL | `bun pm ls` capture; process-listing delta |
    | H3 Bun compat | PASS/FAIL | `bun run probe:all` ran end-to-end; `bun --version`; OS/platform |
    | H4 fidelity | PASS/FAIL | per-type non-empty/well-formed/label assertions |
    | H5 security | PASS/FAIL | adversarial scan counts (all zero); `strict` confirmed active |
  - **Forced ADR updates required** — e.g.:
    - If PASS: ADR-0002 Part B advances Proposed → **spike-validated** (handled by `@doc-syncer`
      in lifecycle phase 7, NOT by this coder).
    - If FAIL on H2: ADR-0002 ladder descends to rung 7 (`code` policy) for MS-0002.
    - If catastrophic FAIL: escalate to ADR-0001 language-level reconsideration; flag a decision
      record is needed (deferred to lifecycle phase 7; flagged here as conditional).
  - **Recommendation for MS2-E4-S1** — a single, clear statement: either proceed to E4-S1
    in-process rendering, **or** fall back to the ADR-0002 `code` policy (rung 7) for MS-0002.
    (Partial/shim outcomes recorded per spec §18.)
  - **Golden SVG fixture pairs** — on PASS, confirm that `fixtures/<name>.expected.svg` pairs are
    committed for MS2-E4-S1 / golden-test-tier reuse (spec G-7). List the committed pairs.
  - **Normalization rules summary** — reiterate the five rules (from `normalize.ts` header /
    test plan §5.3) so the findings doc is self-contained for E4-S1 reuse (spec G-8).
  - **Secrets-hygiene note** — one-line verdict from Phase 7 ("0 secrets in committed artifacts").
  - **Shim / per-OS-cache-key note** — record any shim used (RSK-5 escalation) or the per-OS-cache-
    key finding (DEC-3) if cross-OS differs.
- [ ] **8.4** Verify the findings doc passes the TC-MRSPIKE-007 structural check: it contains an
  explicit PASS or FAIL for **each** of H1–H5, evidence pointers, exactly one MS-0002
  recommendation, the normalization-rules reference, and the golden-pair list (on PASS). A quick
  `rg -c 'PASS|FAIL' findings/mermaid-render-spike-findings.md` sanity check is acceptable.
- [ ] **8.5** Note in the findings doc (and in a code comment) that the **actual** ADR-0002 /
  feature-spec / story-status updates happen in lifecycle phase 7 (`@doc-syncer`), NOT in this
  spike — this coder only writes the findings doc and records its recommendation.

**Acceptance Criteria**:

- Must: `bun run probe:all` runs end-to-end under Bun with no Node-only fallback (AC3 / H3).
- Must: `findings/mermaid-render-spike-findings.md` exists and is committed.
- Must: the findings doc contains an explicit PASS/FAIL for each of H1–H5 with evidence pointers
  (NFR-EVID-1).
- Must: the findings doc contains exactly one clear MS-0002 recommendation (proceed to E4-S1
  in-process OR `code` fallback).
- Must: the findings doc reiterates the normalization rules (for E4-S1 reuse).
- Must: on PASS, the golden SVG fixture pairs are confirmed committed.
- Must: no `src/` change (C-SPIKE-2); no ADR/spec/story file is mutated by this coder.

**Acceptance Criteria → AC mapping**: **AC6** (and the runtime execution of `probe:all` provides
the consolidated **AC3 / H3** evidence; AC7 verdict is recorded here from Phase 7).

**Probe mapping**: TC-MRSPIKE-007 (findings-doc presence) + TC-MRSPIKE-005 (bun-compat execution,
consolidated).

**Affected code areas**:

- `spikes/mermaid-render/probes/run-all.ts` (new — orchestrator)
- `findings/mermaid-render-spike-findings.md` (new — at repo root, the **load-bearing deliverable**)

**System docs to update**:

- none by the coder. The findings doc's "Forced ADR updates required" section lists the docs that
  `@doc-syncer` will reconcile in lifecycle phase 7 (see Doc-update coverage below). This coder
  must NOT edit any ADR/spec/story file.

**Tests**:

- Run: `cd spikes/mermaid-render && bun run probe:all` → all probes complete; results captured
  into the findings doc.
- Structural: `rg -c 'PASS|FAIL' findings/mermaid-render-spike-findings.md` returns ≥ 5 (one verdict
  per hypothesis).

**Completion signal**: `docs(spike): write mermaid render spike findings (H1-H5 verdicts + MS-0002 recommendation) (GH-11)`

> **This is the load-bearing commit of the spike.** If only one commit survives, it is this one
> plus Phase 0's scaffolding (so the findings doc is reproducible). Everything else (probes,
> fixtures) is the evidence trail that makes the findings trustworthy.

---

### Phase 9: Spike README + run-book

**Goal**: Finalize the spike README with the actual run commands, expected outputs, and how to
interpret the findings. Close out the spike so the workspace is self-documenting for MS2-E4-S1 and
any future re-run. Contributes to AC6 (evidence completeness) and AC3 (runtime invocation
documentation).

**Tasks**:

- [ ] **9.1** Rewrite `spikes/mermaid-render/README.md` (replace the Phase 0 stub) with:
  - **Purpose** — one paragraph (what the spike validates; pointer to the findings doc).
  - **Prerequisites** — Bun runtime; `bun install` in this directory.
  - **How to run** — the exact commands: `bun install`, `bun run render`, `bun run probe:all`,
    and the individual `bun run probe:*` scripts. Note that these run via `bun run` (runtime), not
    `bun test` (test runner).
  - **Expected outputs** — what each probe prints (per-fixture PASS/FAIL, scan counts, H1–H5
    summary) and where the golden SVGs land (`fixtures/*.expected.svg`).
  - **How to interpret the findings** — pointer to `findings/mermaid-render-spike-findings.md`,
    the H1–H5 verdict table, and the MS-0002 recommendation. Explain the outcome routing (PASS →
    E4-S1; H2 FAIL → rung 7 `code`; catastrophic → ADR-0001 escalation) per spec §18 / Appendix B.
  - **What is NOT here** — explicit note that ADR/spec/story updates are handled by `@doc-syncer`
    in lifecycle phase 7, and that the spike is NOT wired into CI.
  - **E4-S1 reuse notes** — call out the reusable artifacts: `normalize.ts` (lift verbatim), the
    golden `fixtures/*.expected.svg` pairs, and the recorded normalization rules.
- [ ] **9.2** Verify the README's commands match the actual `package.json` script names (no drift).
- [ ] **9.3** Final workspace sanity check: `git status` shows only spike files + findings touched;
  `src/` is untouched; `node_modules/` is gitignored; golden SVGs + `bun.lock` are tracked.

**Acceptance Criteria**:

- Must: README documents the actual run commands and expected outputs.
- Must: README points to the findings doc and explains outcome routing.
- Must: README explicitly notes the spike is not CI-wired and ADR updates are lifecycle phase 7.
- Must: no `src/` change (C-SPIKE-2); no workflow/ADR/spec/story file mutated.

**Acceptance Criteria → AC mapping**: contributes to **AC6** (findings discoverability) and
**AC3** (runtime invocation documentation).

**Probe mapping**: TC-MRSPIKE-005 / TC-MRSPIKE-007 (run-book supports both).

**Affected code areas**:

- `spikes/mermaid-render/README.md` (updated — replaces Phase 0 stub)

**System docs to update**:

- none by the coder.

**Tests**:

- Manual: a fresh operator can run `bun install && bun run probe:all` from the README alone and
  reach the findings doc.

**Completion signal**: `docs(spike): finalize mermaid render spike README + run-book (GH-11)`

---

> **Spec reconciliation note:** this is a spike (`version_impact: none`); there is no version bump
> and no production release. The system-spec / ADR reconciliation that a normal change's final
> phase performs is **deferred to lifecycle phase 7** (`@doc-syncer`), per spec NG-6 and the PM's
> instruction. The coder's final deliverable is the spike workspace + findings doc; the
> Doc-update coverage section below enumerates exactly what `@doc-syncer` will reconcile.

## Test Scenarios

> The spike's "tests" are spike-validation probes (TC-MRSPIKE-001…007), NOT production test tiers.
> They run via `bun run` (runtime), not `bun test` (runner), and are NOT wired into CI.

### Phase → AC → Probe mapping

| Phase | AC | Hypothesis | Probe (TC ID) | Probe file / artifact | Evidence path |
|-------|----|------------|---------------|-----------------------|----------------|
| Phase 0 | — | — | — | `package.json`, `bun.lock` | (scaffolding) |
| Phase 1 | AC4, AC5 | H4, H5 (inputs) | (fixtures) | `fixtures/*.mmd` | fixtures carry expected labels |
| Phase 2 | AC3 | H3 (partial) | TC-MRSPIKE-005 | `render.ts` | `bun run render` under Bun |
| Phase 3 | AC1 | H1 | TC-MRSPIKE-001 | `probes/determinism.ts`, `normalize.ts`, `fixtures/*.expected.svg` | `findings/...#H1` |
| Phase 4 | AC2 | H2 | TC-MRSPIKE-002 | `probes/chromium-absence.ts` | `findings/...#H2` |
| Phase 5 | AC5 | H5 | TC-MRSPIKE-003 | `probes/security.ts` | `findings/...#H5` |
| Phase 6 | AC4 | H4 | TC-MRSPIKE-004 | `probes/fidelity.ts` | `findings/...#H4` |
| Phase 7 | AC7 | — (secret hygiene) | TC-MRSPIKE-006 | `scripts/secret-scan.sh` | `findings/...` secret-hygiene note |
| Phase 8 | AC6 | — (findings) | TC-MRSPIKE-007 + TC-MRSPIKE-005 | `findings/mermaid-render-spike-findings.md`, `probes/run-all.ts` | the findings doc itself |
| Phase 9 | AC3, AC6 | H3 (docs) | TC-MRSPIKE-005, TC-MRSPIKE-007 | `README.md` | run-book |

### Probe summary

| TC ID | Title | Type | Priority | AC | Status |
|-------|-------|------|----------|----|--------|
| TC-MRSPIKE-001 | Determinism probe (byte-identical normalized SVG, N=5) | Spike-validation probe | High | AC1 | To implement (Phase 3) |
| TC-MRSPIKE-002 | Chromium-absence probe (dep tree + process listing) | Spike-validation probe | High | AC2 | To implement (Phase 4) |
| TC-MRSPIKE-003 | Security probe (adversarial output sanitization) | Spike-validation probe | High | AC5 | To implement (Phase 5) |
| TC-MRSPIKE-004 | Fidelity checks (5 diagram types render with labels) | Spike-validation probe | High | AC4 | To implement (Phase 6) |
| TC-MRSPIKE-005 | Bun-compat execution (runtime invocation is the evidence) | Spike-validation probe | High | AC3 | To implement (Phase 2 + 8) |
| TC-MRSPIKE-006 | Secrets scan (light, grep-based + documented review) | Spike-validation probe | Medium | AC7 | To implement (Phase 7) |
| TC-MRSPIKE-007 | Findings-document presence (PASS/FAIL + recommendation) | Spike-validation probe | High | AC6 | To implement (Phase 8) |

### AC coverage summary

| AC | Hypothesis | Covered by phases | Verdict source |
|----|------------|-------------------|----------------|
| AC1 | H1 (determinism) | Phase 3 | determinism probe (5/5 byte-identical normalized SVG) |
| AC2 | H2 (no Chromium) | Phase 4 | chromium-absence probe (tree + process) |
| AC3 | H3 (Bun compat) | Phase 2, 8, 9 | `bun run probe:all` runs end-to-end, no Node fallback |
| AC4 | H4 (fidelity) | Phase 1, 6 | fidelity probe (5/5 diagram types + expected labels) |
| AC5 | H5 (security) | Phase 1, 5 | security probe (0 `<script>`/event-handler/`javascript:`; `strict` active) |
| AC6 | — (findings) | Phase 8, 9 | findings doc (PASS/FAIL per H1–H5 + one MS-0002 recommendation) |
| AC7 | — (secret hygiene) | Phase 7, 8 | secrets scan (0 secrets in committed artifacts) |

**All seven ACs are fully traced to phases and probes.**

## Doc-update coverage (DoR facet)

> These system docs are touched by `@doc-syncer` in **lifecycle phase 7** (system_spec_update),
> NOT by this plan's coder. The coder only writes the findings doc and records its recommendation
> (Phase 8). Listed here so the DoR gate can see the full reconciliation surface.

| System doc | Update | Triggered by | Owner |
|---|---|---|---|
| `doc/decisions/ADR-0002-mermaid-rendering-strategy.md` | `status` field (Proposed → spike-validated on PASS) **and** Part B wording; if FAIL on H2, record the rung-7 (`code`) decision for MS-0002. **Load-bearing specifics in "DoR Review Findings for Phase 7" §F1 below — required reading before any ADR-0002 edit.** | Findings verdict (H1–H5) | `@doc-syncer` |
| `doc/decisions/TDR-0004-testing-runner.md` | Confirm the default `bun:test` + happy-dom Mermaid-DOM path (move the unresolved Mermaid-DOM-gate question toward closure); record any escalation actually used. **Reconcile pre-existing frontmatter (`status: Accepted`) vs body ("remains `Proposed`") status mismatch before applying the spike-validated label — see §F4 below.** | Findings verdict (H3 + any happy-dom shim) | `@doc-syncer` |
| `doc/decisions/ADR-0001-implementation-language-and-runtime.md` | Only on catastrophic FAIL — record language-level reconsideration trigger; otherwise no change | Catastrophic FAIL of H1/H2 | `@doc-syncer` + CEO decision |
| `doc/spec/features/feature-mermaid-rendering.md` | May need reconciliation if the normalization rules / output-format decision surface from the findings | Findings (normalization rules, output format) | `@doc-syncer` |
| `doc/planning/milestones/MS-2/MS2-E1--spikes/MS2-E1-S1--mermaid-render-spike.md` | Story `status` field: `todo` → `done` | Spike completion | `@doc-syncer` |
| `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S1--mermaid-rendering.md` | Downstream story may need a pointer to the findings doc + the reusable artifacts (`normalize.ts`, golden SVG pairs) | Findings (PASS) | `@doc-syncer` |
| (Conditional) a new decision record | If FAIL: a decision record for the fallback choice (rung 7 `code` for MS-0002; or ADR-0001 escalation on catastrophic FAIL) | Findings (FAIL) | `@decision-advisor` / CEO (deferred to lifecycle phase 7; flagged here as conditional) |

### DoR Review Findings for Phase 7 (load-bearing — `@doc-syncer` MUST address)

The DoR gate (`readiness-review/readiness-iter-1.md`) returned **READY** with four findings. Findings F1 (major) and F4 (minor) MUST be addressed in phase 7; F2 and F3 are minor and fold into the findings-doc template / coder instructions.

- **§F1 (MAJOR, ADR-0002 stop criterion #1 + C-1 rewording):** ADR-0002 Part B stop criterion #1 (line 217) literally requires "Byte-stable SVG output … across Linux, macOS, and Windows" and C-1 (lines 85–90) says "same image bytes … cross-platform." The spike (correctly, per story + CEO-resolved Q1) gates on **same-OS byte-stability** and accepts a cross-OS delta via a **per-OS cache key in the hash input** (DEC-3). That key makes the *hash* deterministic across OS — **not** the *rendered bytes*. So a same-OS-only PASS does **not literally satisfy** stop criterion #1 / C-1 as currently worded. Phase 7 MUST:
  - (a) Reword stop criterion #1 → "same-OS byte-stable normalized SVG; cross-OS hash-stable via per-OS cache key in the hash input (per ADR-0002 hash formula `marksync-mermaid-render-v1 + … + font_policy`)."
  - (b) Clarify C-1's "cross-platform same bytes" is satisfied via the hash formula (logical-input hashing), not raw byte equality of rendered SVG.
  - (c) Record the **actual cross-OS result** from the findings doc (PASS / known-delta) in ADR-0002's "Constraint Compliance Attestation" section.
- **§F2 (minor, H5 scope):** AC5 scans `<script>`, `onerror`/`onload`, `javascript:` — a subset of ADR-0002 Security Requirements (which also include "no external resource loading" via `<use href>`, remote fonts/images). Phase 7 MUST ensure the findings doc explicitly scopes H5 as "validates Mermaid **default-config** safety vs XSS/script only; full SVG sanitization (incl. external-resource blocking) deferred to MS2-E4-S1 (`SVGSanitizer`)." The coder is also encouraged (not required) to add a 3rd adversarial fixture `fixtures/adversarial-external-ref.mmd` exercising `<use href="http://…">`.
- **§F3 (minor, Chromium-absence transitive listing):** The Chromium-absence probe (Phase 4) MUST obtain a **transitive** dependency listing (`bun pm ls --all` or current Bun equivalent), not just direct deps — a hidden Chromium dep would be transitive (via mermaid's sub-deps). The coder instruction is updated accordingly; phase 7 records the actual command used in the findings doc.
- **§F4 (minor, pre-existing status mismatch):** ADR-0002 (frontmatter `status: Accepted` line 6 vs body "remains `Proposed`" lines 202/349) and TDR-0004 (frontmatter `Accepted` line 6 vs body `Proposed` lines 254/367) have a pre-existing internal inconsistency. Phase 7 MUST reconcile frontmatter-vs-body before applying the spike-validated label, so the "Proposed → spike-validated" transition is coherent.

## Code-area coverage (DoR facet)

> **All code lives under `spikes/mermaid-render/`. The main `src/` tree is NOT touched (C-SPIKE-2,
> spec NG-5).** Per-phase file inventory:

| Phase | New/updated files (all under `spikes/mermaid-render/` unless noted) |
|-------|----------------------------------------------------------------------|
| Phase 0 | `package.json`, `.gitignore`, `README.md` (stub), `tsconfig.json`, `bun.lock` |
| Phase 1 | `fixtures/flowchart.mmd`, `fixtures/sequence.mmd`, `fixtures/class.mmd`, `fixtures/state.mmd`, `fixtures/gantt.mmd`, `fixtures/adversarial-xss.mmd`, `fixtures/adversarial-script.mmd` |
| Phase 2 | `render.ts` |
| Phase 3 | `normalize.ts`, `probes/determinism.ts`, `fixtures/flowchart.expected.svg`, `fixtures/sequence.expected.svg`, `fixtures/class.expected.svg`, `fixtures/state.expected.svg`, `fixtures/gantt.expected.svg` (golden SVGs persisted by the probe) |
| Phase 4 | `probes/chromium-absence.ts` |
| Phase 5 | `probes/security.ts` |
| Phase 6 | `probes/fidelity.ts` |
| Phase 7 | `scripts/secret-scan.sh` |
| Phase 8 | `probes/run-all.ts`, **`findings/mermaid-render-spike-findings.md`** (repo root) |
| Phase 9 | `README.md` (updated — replaces stub) |

**Files NOT created/modified:** anything under `src/`, `tests/`, `.github/workflows/`, any
`doc/decisions/**`, `doc/spec/**`, or `doc/planning/**` file. The only `doc/`-adjacent output is
`findings/mermaid-render-spike-findings.md` (a spike artifact, not a system doc).

## Definition of Done

- [ ] All 7 ACs (AC1–AC7) satisfied, each with an **evidence pointer** (per spec §17.1):
  - AC1 → determinism probe output + `fixtures/*.expected.svg` (Phase 3).
  - AC2 → chromium-absence probe output (tree + process) (Phase 4).
  - AC3 → `bun run probe:all` end-to-end under Bun, no Node fallback (Phase 8; seeded Phase 2).
  - AC4 → fidelity probe output (5/5 diagram types + labels) (Phase 6).
  - AC5 → security probe output (0 `<script>`/event-handler/`javascript:`; `strict` active)
    (Phase 5).
  - AC6 → `findings/mermaid-render-spike-findings.md` (PASS/FAIL per H1–H5 + one MS-0002
    recommendation) (Phase 8).
  - AC7 → secrets-scan verdict (0 secrets) recorded in the findings doc (Phase 7 + 8).
- [ ] `spikes/mermaid-render/` committed: code + fixtures + normalized golden SVGs + findings doc;
  `node_modules/` and ephemeral outputs gitignored (spec §17.1).
- [ ] Findings document (`findings/mermaid-render-spike-findings.md`) records explicit PASS/FAIL
  per H1–H5 with evidence **and** a single clear MS-0002 recommendation (proceed to E4-S1
  in-process **or** `code` fallback) (spec §17.1).
- [ ] On PASS: golden SVG fixture pair (source + normalized SVG) committed for each canonical
  fixture, for reuse by MS2-E4-S1 / the golden-test tier (spec G-7).
- [ ] Normalization rules (and any shim / per-OS-cache-key finding) recorded for E4-S1 reuse (spec
  G-8, DEC-2) — in `normalize.ts` header comment **and** reiterated in the findings doc.
- [ ] **No production code under `src/` is touched** (spec NG-5; C-SPIKE-2). Verified by
  `git diff` against the base branch showing only `spikes/mermaid-render/**` and
  `findings/mermaid-render-spike-findings.md`.
- [ ] No CI/workflow/ADR/spec/story file is mutated by the coder (spec NG-6; C-SPIKE-6); the
  Doc-update coverage section lists what `@doc-syncer` reconciles in lifecycle phase 7.

## Artifacts and Links

| Artifact | Location | Type |
|----------|----------|------|
| Change specification | `./chg-GH-11-spec.md` | Spec |
| Test plan | `./chg-GH-11-test-plan.md` | Test plan |
| Authoritative story | `doc/planning/milestones/MS-2/MS2-E1--spikes/MS2-E1-S1--mermaid-render-spike.md` | Story |
| This implementation plan | `./chg-GH-11-plan.md` | Plan |
| Spike workspace | `spikes/mermaid-render/` (new) | Code (standalone) |
| Findings document (deliverable) | `findings/mermaid-render-spike-findings.md` (new, repo root) | Findings |
| Testing strategy | `.ai/rules/testing-strategy.md` | Rules |
| TypeScript conventions | `.ai/rules/typescript.md` | Rules |
| ADR-0002 (rendering strategy) | `doc/decisions/ADR-0002-mermaid-rendering-strategy.md` | Decision |
| TDR-0004 (testing runner) | `doc/decisions/TDR-0004-testing-runner.md` | Decision |
| ADR-0001 (language/runtime) | `doc/decisions/ADR-0001-implementation-language-and-runtime.md` | Decision |
| Feature spec (downstream) | `doc/spec/features/feature-mermaid-rendering.md` | Spec |

## Plan Revision Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-06 | plan-writer (GH-11) | Initial implementation plan. 10 phases (0–9), each one commit. Derived from `chg-GH-11-spec.md` (AC1–AC7, F-1…F-6, NFR-DET/DEP/RUN/FID/SEC/EVID, H1–H5, DEC-1…DEC-4) and `chg-GH-11-test-plan.md` (TC-MRSPIKE-001…007, fixtures, normalization rules §5.3, anti-over-mocking guardrail). Includes Phase→AC→Probe mapping, Doc-update coverage (lifecycle phase 7), Code-area coverage, and Definition of Done per spec §17.1. All code confined to `spikes/mermaid-render/`; `src/` untouched; not CI-wired. |

## Execution Log

> Populated during spike execution (lifecycle phase 6 — delivery). Each phase is one Conventional
> Commit (`chore(spike):` / `docs(spike):`).

| Phase | Status | Started | Completed | Commit | Notes |
|-------|--------|---------|-----------|--------|-------|
| Phase 0 | _(pending)_ | — | — | — | scaffolding |
| Phase 1 | _(pending)_ | — | — | — | fixtures |
| Phase 2 | _(pending)_ | — | — | — | render entrypoint |
| Phase 3 | _(pending)_ | — | — | — | determinism probe + normalizer |
| Phase 4 | _(pending)_ | — | — | — | chromium-absence probe |
| Phase 5 | _(pending)_ | — | — | — | security probe |
| Phase 6 | _(pending)_ | — | — | — | fidelity probe |
| Phase 7 | _(pending)_ | — | — | — | secrets scan |
| Phase 8 | _(pending)_ | — | — | — | run-all + findings doc (load-bearing) |
| Phase 9 | _(pending)_ | — | — | — | README + run-book |
