---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: ADR-0001
decision_type: adr
status: Proposed
created: 2026-07-03
decision_date: null
last_updated: 2026-07-03
summary: "Implement MarkSync in TypeScript compiled to per-platform single binaries (Bun `build --compile`) instead of Go, to reuse the official Mermaid library."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: architecture
decision_scope: repo
reversibility: hard
review_date: null
business_impact: "Sets the implementation stack for the entire project and its release/distribution pipeline."
customer_impact: "Determines binary size, startup time, and install experience for end users."
classification:
  domains: [architecture, tooling]
  archetype: selection
  environment: complicated
  rigor: R2
  reversibility: hard
  stakes: high
  urgency: medium
  uncertainty: medium
  blast_radius: team
  recurrence: one-off
governance:
  driver: Juliusz Ćwiąkalski
  decider: Juliusz Ćwiąkalski
  contributors: []
  reviewers: []
  performers: [Juliusz Ćwiąkalski]
  informed: []
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: false
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "Bun or Deno single-binary distribution proves unviable at scale (binary size, startup, cross-compile, signing/notarization)."
  - "A production-grade pure-Go Mermaid renderer emerges and reaches the fidelity of the official library."
  - "The Mermaid headless-rendering spike (ADR-0002) proves the in-process official library cannot run headless without Chromium."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: ["../inception/system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: [ADR-0002]
  experiments: []
  metrics: []
  roadmap_items: []
---

# ADR-0001: Implementation language and runtime — TypeScript (single-binary) over Go

## Context

> **Migration note:** This record was authored pre-inception in `doc/inception/decisions/` and migrated to the canonical ADOS home `doc/decisions/` during Phase 3 inception (2026-07-04). It remains `status: Proposed` pending human confirmation. Records were originally numbered in one sequence regardless of `decision_type`; on 2026-07-05 they were reclassified so each type (ADR, PDR, TDR) has its own sequence per the ADOS decision-making guide.

The system specification currently records "The implementation language is Go" as a **Decided** item, with Cobra, Goldmark, go-git, and GoReleaser as the implied follow-on stack (`../inception/system-specification-draft-from-ai-brainstorm.md` §2.2, §2.6, §6.1, §9.4, §9.5). The brain dump and North Star both describe a "portable native CLI" distributed as a "single binary" that must run flawlessly on Linux, macOS, and Windows with no mandatory language runtime for end users (`../inception/motivation-and-goal-notes-brain-dump.md`; `../inception/north-star-draft-to-be-refined.md`).

That decision is now being **reopened** by the Mermaid constraint. The motivation explicitly requires that Mermaid (and other text diagrams) be rendered to images and attached to Confluence pages, working even when the target organization has no Confluence Mermaid plugin (`../inception/motivation-and-goal-notes-brain-dump.md`). The spec already concedes, as an assumption: *"Mermaid is adapter-based. No assumption of a production-grade pure-Go renderer"* (§2.4), and lists "Which Mermaid renderer is mandatory in v1?" as an open question (§2.5).

FACT: Mermaid is a JavaScript/TypeScript library; there is no production-grade pure-Go renderer. FACT: The owner has stated that reimplementing or reverse-engineering Mermaid is a NO-GO. FACT: The strategy report (§22.3) identifies Go as "the strongest default" for a cross-platform CLI but explicitly accommodates TypeScript *if* compiled/distributed as tested standalone binaries with no Bun/Node requirement for ordinary users; the same report (§11.x, atlcli analysis) and the failure premortem (§7) both flag Bun/TypeScript standalone packaging as a source of "trust and environment questions." FACT: the closest bidirectional competitor (`BjoernSchotte/atlcli`) is TS/Bun, and `markdown-confluence` is TS, so there is real ecosystem precedent in this category (`../inception/open-source-git-markdown-confluence-sync-report-2026-07-02.md` §2.2, §3).

## Problem Framing (Clarified)

The surface question ("Go vs TypeScript") is the wrong frame. The real question is **coupled to how Mermaid can be rendered**:

- Reimplementing or reverse-engineering Mermaid is rejected outright (owner NO-GO).
- The only way to faithfully render Mermaid is to **reuse the official `mermaid` library**, which is a JS/TS artifact.
- Therefore the language choice is determined by: *is reusing the official Mermaid library worth switching from Go to TypeScript plus a single-binary compilation mechanism?*

Reframed as a single decision: pick the implementation stack that lets us (a) run the official Mermaid library in-process, **and** (b) still ship a single self-contained native executable per OS+arch. Go forces Mermaid out-of-process (shell to `mmdc`/container), which compromises the "single binary, zero runtime" promise. TypeScript + a JS-to-native compiler can satisfy both — at the cost of larger binaries and slower startup.

## Constraints (Hard Requirements)

> **Table-stakes constraint (acknowledged once):** every alternative already satisfies **C-4 — must be automatable in CI (non-interactive, JSON output, stable exit codes)** (`../inception/system-specification-draft-from-ai-brainstorm.md` §7.9, §9.1). All four candidate stacks can produce a CLI with JSON output, so C-4 is not a differentiator and is not repeated per alternative.

### C-1: Reuse the official Mermaid library

- **Statement:** The product must render Mermaid by executing the official `mermaid` library (npm package). Reimplementing Mermaid, generating it from a hand-written renderer, or reverse-engineering its output is prohibited.
- **Source:** Owner directive (NO-GO on self-delivery/reverse-engineering of Mermaid).
- **Verification:** Code/architecture review confirms the official `mermaid` package is the rendering path; no bespoke diagram-layout engine exists in the codebase.
- **Negotiable:** no.

### C-2: Single self-contained binary per OS+arch (no mandatory language runtime)

- **Statement:** MarkSync must be distributable as one self-contained executable per OS+arch. End users must not be required to install Node, Bun, Deno, a JVM, or a Python runtime to use the core CLI.
- **Source:** Spec ("portable native CLI", §1, §2.1, §6.1) and motivation brain dump ("single binary… portable for any operating system").
- **Verification:** Release smoke tests: a clean OS image with no language runtime installed runs the downloaded binary and completes a `config validate` + dry-run.
- **Negotiable:** no.

### C-3: Cross-platform support (Linux, macOS, Windows; amd64 + arm64 where supported)

- **Statement:** The build pipeline must produce native artifacts for Linux, macOS, and Windows on amd64, and arm64 where the platform supports it.
- **Source:** Spec (§3.5 cross-platform delivery; NFR-012 portability; motivation: "Windows, Linux, and Mac OS must be flawlessly supported").
- **Verification:** CI release matrix produces and smoke-tests artifacts for all target OS/arch pairs.
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**
- Diagram fidelity is a stated differentiator and a headline MVP feature (`../inception/motivation-and-goal-notes-brain-dump.md`; `../inception/open-source-git-markdown-confluence-sync-report-2026-07-02.md` §8 "Attachments and diagrams are decision-driving features"). Trading some binary ergonomics for guaranteed-correct Mermaid is acceptable to the owner.
- Long-term maintainability: reusing the official, actively-maintained Mermaid library is cheaper than maintaining a Go renderer or a fragile reverse-engineered pipeline.

**Technical drivers:**
- Faithful, up-to-date Mermaid rendering (the official library tracks Mermaid syntax evolution).
- Minimizing external runtime dependencies for end users (the "single binary" promise).
- Cross-platform distribution simplicity.
- Ecosystem fit: TypeScript gives direct access to the npm ecosystem (Mermaid, Markdown/MDAST tooling).

**Operational drivers:**
- Acceptable (not maximal) startup time and binary size — the owner explicitly accepts larger/slower binaries in exchange for reusing official Mermaid.
- Release-pipeline operability (per-platform compile matrix).

## Mental Models & Techniques Used

- **First Principles:** What is the irreducible requirement? Running the official Mermaid library. Everything else (language, packaging) is a means to that end.
- **Inversion:** "How do we guarantee we never have to maintain Mermaid ourselves?" → by picking a stack that runs the official library natively.
- **Opportunity Cost:** What do we give up by leaving Go? (smaller/faster binaries, GoReleaser polish, Goldmark/go-git) vs. what do we give up by staying in Go? (in-process Mermaid, zero-dep single binary).
- **Second-Order Thinking:** The language choice cascades into the entire toolchain (CLI framework, Markdown parser, Git client, release pipeline) — captured in the Implementation Plan.
- **Evidence weighting:** AI-generated confidence is not evidence; the Mermaid headless-rendering spike (ADR-0002) is the load-bearing unknown.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception (constraint must be `Negotiable: yes`).

|          | C-1 (official Mermaid) | C-2 (single binary, no runtime) | C-3 (Linux/macOS/Windows + amd64/arm64) |
|----------|------------------------|---------------------------------|------------------------------------------|
| Alt 0    | ✅ (via `mmdc` subprocess) | ❌ (requires Node + Chromium or the official container) | ✅ |
| Alt 1    | ✅ (npm `mermaid` in-process) | ✅ (Bun `build --compile`) | ✅ (per-platform cross-compile) |
| Alt 2    | ⚠️ (runs official `mermaid.js`, but goja may lack required modern JS; v8go drags a heavy C dependency) | ⚠️/❌ (goja keeps Go purity but likely can't run Mermaid; v8go breaks single-binary purity) | ⚠️ (v8go cross-compile/signing pain) |
| Alt 3    | ✅ (via `mmdc`/container) | ❌ (not zero-dependency) | ✅ |

(C-4 is satisfied by all and omitted per the table-stakes note.)

### Alternative 0 — Do Nothing / Keep Go as Decided

- **Summary:** Stay with the spec's current "Decided" Go stack (Cobra, Goldmark, go-git, GoReleaser). For Mermaid, shell out to the official `mmdc` command or the official container bundle (spec §9.11 capability matrix).
- **Pros:** Smallest, fastest binaries; best-in-class cross-compile/release tooling (GoReleaser); the strategy report (§22.3) names Go "the strongest default"; matches the largest-star competitor `kovetskiy/mark`.
- **Cons:** The "single self-contained binary" promise is broken in spirit: rendering a single diagram requires Node + Chromium (or pulling the official Mermaid container). This reintroduces exactly the runtime dependency the brain dump wanted to eliminate.
- **Constraint compliance:** C-1 ✅ (reuses official `mmdc`); **C-2 ❌** (mandatory external Node/Chromium runtime); C-3 ✅.
- **Why rejected:** Fails C-2 (non-negotiable). It also leaves the project one environment failure away from the failure-premortem scenario where "the first useful document fails because a renderer is missing or incompatible" (`../inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md`).

### Alternative 1 — TypeScript + Bun `build --compile` (RECOMMENDED)

- **Summary:** Implement MarkSync in TypeScript. Distribute via Bun's `build --compile`, which cross-compiles to per-platform single binaries that embed the runtime. Reuse the official `mermaid` npm package in-process. (Deno `compile` is a near-equivalent sub-option — see Unresolved Questions.)
- **Pros:** Natively runs TypeScript and the official Mermaid library (C-1 ✅ in-process); satisfies the single-binary, no-runtime promise (C-2 ✅); strong npm ecosystem for Markdown/MDAST tooling; ecosystem precedent in this category (`atlcli`, `markdown-confluence` are TS). The owner has stated this preference and the value tradeoff explicitly.
- **Cons:** Larger binaries (~50–90 MB), slower startup than Go, rougher cross-compile/release story than GoReleaser; unsigned Windows binaries and lower general familiarity with Bun can trigger "trust and environment questions" (strategy report §11.x; failure premortem §7). AI-assisted TS delivery in this repo must compensate for losing the Go-centric quality gates described in the spec.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅.
- **Why chosen:** The only alternative that satisfies C-1 *in-process* while still satisfying C-2 and C-3. Aligns with the owner's stated value tradeoff.

### Alternative 2 — Go core + embedded JS runtime (goja or v8go)

- **Summary:** Keep Go distribution; embed a JS runtime to execute the official `mermaid.js` in-process. `goja` is a pure-Go ES2017+ interpreter; `v8go` embeds V8 (C/C++).
- **Pros:** Preserves Go's excellent binary distribution and the existing Go-centric release pipeline.
- **Cons:** `goja` lags modern JS/ECMAScript feature support that Mermaid (a modern TS library) may require, and its performance is poor; `v8go` introduces a heavy native V8 dependency that breaks single-binary purity and complicates cross-compilation and code signing. Either path is a research bet, not a proven path.
- **Constraint compliance:** C-1 ⚠️ (runs official lib but feasibility is unproven); C-2 ⚠️/❌ (`v8go` breaks the no-runtime/single-binary promise); C-3 ⚠️ (`v8go` cross-compile/signing pain).
- **Why rejected:** Strains or fails C-2 and C-3; introduces unproven, high-maintenance coupling. Rejected in favor of the proven TS path.

### Alternative 3 — Go + shell-to-`mmdc`/container as a documented fallback (optional)

- **Summary:** The same shell-out approach as Alt 0, but deliberately positioned as a *documented fallback* (mirrors `kovetskiy/mark`) rather than the primary path.
- **Pros:** Keeps Go distribution for users who already run Node/Chromium; lowest-friction for Go-native teams.
- **Cons:** Still not zero-dependency; only viable as a secondary mode, not the primary implementation language.
- **Constraint compliance:** C-1 ✅; **C-2 ❌** (not zero-dep); C-3 ✅.
- **Why rejected as primary:** Fails C-2 as a primary strategy. Retained conceptually as a fallback rendering mode inside ADR-0002's renderer fallback ladder, independent of the language decision.

## Decision

**Recommendation: Alternative 1 — implement MarkSync in TypeScript and distribute via single-binary compilation (Bun `build --compile`).**

This reverses the system spec's "implementation language is Go — Decided" item (`../inception/system-specification-draft-from-ai-brainstorm.md` §2.2). The rationale is the owner's explicit value tradeoff, stated verbatim:

> The owner accepts larger and slower-starting binaries in exchange for **reusing the official Mermaid library** and **avoiding any self-delivery or reverse-engineering of Mermaid**.

Go cannot satisfy that tradeoff without either (a) breaking the single-binary/no-runtime promise (Alt 0/3) or (b) taking an unproven research bet on an embedded JS runtime (Alt 2). TypeScript + single-binary compilation is the only path that satisfies all non-negotiable constraints.

> **AI-assistance disclosure:** This analysis is AI-assisted. The human decider (Juliusz Ćwiąkalski) has **not yet** decided. This record is `status: Proposed` and becomes authoritative only on human confirmation during inception.

### Constraint Compliance Attestation

The recommended alternative (Alt 1) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** Mermaid is rendered via the official `mermaid` npm package, executed in-process. No reimplementation.
- **C-2 — ✅ Full compliance:** Bun `build --compile` produces a single self-contained executable per OS+arch with no mandatory Node/Bun/Deno runtime for end users.
- **C-3 — ✅ Full compliance:** Bun cross-compiles to Linux/macOS/Windows on amd64/arm64 targets.
- **C-4 — ✅ Full compliance (table-stakes):** A TS CLI can expose `--non-interactive`, `--format json`, and stable exit codes identical to the spec contract.

No accepted-risk exceptions are required.

## Trade-offs & Consequences

### Positive Outcomes

- Guaranteed faithful, up-to-date Mermaid rendering via the official library.
- Direct access to the npm ecosystem (Markdown/MDAST parsers, schema tooling).
- Aligns with the category's TS ecosystem precedent (`atlcli`, `markdown-confluence`).
- Eliminates a class of "renderer missing on platform X" failures (failure premortem §7).

### Negative Outcomes

- Larger binaries (~50–90 MB) and slower startup than an equivalent Go binary.
- Rougher release pipeline than GoReleaser: a per-platform compile matrix must be built and maintained (including code signing / macOS notarization / Windows SmartScreen reputation — see strategy report §11.x "Bun/TypeScript binary trust").
- The spec's Go-centric quality gates and repo structure (`.golangci.yml`, `go.mod`, `cmd/marksync/main.go`, §6.1, §13.1) no longer apply and must be re-specified for the TS toolchain.
- Slightly less mainstream familiarity than Go for infrastructure CLIs.

### Unresolved Questions

- [ ] Exact headless rendering mechanism for Mermaid (in-process `mermaid.render()` via jsdom vs `mmdc` subprocess vs container) — **deferred to ADR-0002 / spike** (owner: Juliusz Ćwiąkalski).
- [ ] Bun vs Deno final pick for single-binary compilation — small follow-on decision; both have `compile`. Recommend Bun as default pending the spike (owner: Juliusz Ćwiąkalski).
- [ ] Whether binary signing/notarization tooling for Bun-compiled artifacts meets enterprise trust bar (owner: Juliusz Ćwiąkalski).

## Implementation Plan

This decision **reverses** spec §2.2 ("Go = Decided") and cascades across the toolchain. The spec's Go-specific sections must be re-pointed to TS equivalents:

| Spec area (Go) | Replacement under this decision (TS) |
|----------------|---------------------------------------|
| Cobra (CLI framework) | `cliffy` / `commander` / `clipanion` (pick during bootstrap) |
| Goldmark (Markdown parser, §9.5) | `remark` / `marked` / MDAST-based pipeline |
| go-git or shell-git (§9.4) | `isomorphic-git` or shell-git behind the existing `Repository` interface |
| GoReleaser (§13) | CI per-platform compile matrix (Bun/Deno `build --compile`), checksums, SBOM, signing |

**Rollout / guardrails:**
1. Confirm the Mermaid headless-rendering spike (ADR-0002) before locking the toolchain — do not over-build the release pipeline until the in-process render path is proven.
2. Keep the spec's adapter/interface boundaries intact (`Repository`, `ConfluenceClient`, `Renderer`) — they are language-agnostic and survive the switch.
3. Re-specify the quality gates (format, lint, type-check, test, vuln scan, license scan) for the TS toolchain, preserving the spec's testing strategy (unit/integration/E2E/Gherkin/golden).

**Risk mitigation during implementation:** treat the Bun-vs-Deno choice and the signing/notarization story as explicit sub-decisions with their own small spikes; do not let them block the vertical slice.

## Verification Criteria

- **Metric: Clean-OS install smoke** — Target: downloaded binary runs `config validate` + `plan --dry-run` on an OS image with no Node/Bun/Deno installed — Window: first vertical slice.
- **Metric: Cross-platform artifact completeness** — Target: release matrix produces Linux/macOS/Windows × amd64/arm64 artifacts — Window: first release.
- **Metric: Mermaid in-process render** — Target: at least one Mermaid diagram renders via the official library without shelling to `mmdc` or a container — Window: ADR-0002 spike.
- **Metric: Binary size / startup budget** — Target: documented and accepted ceiling (e.g., ≤ ~90 MB, cold-start within user-acceptable bound) — Window: first release.

## Confidence Rating

**Medium.** The rationale is sound and the constraints cleanly select Alternative 1. The dominant residual uncertainty is the **Mermaid headless-rendering spike** (ADR-0002): whether the official library renders deterministically in-process without bundling Chromium. If that spike fails, the primary justification for choosing TS weakens and Alt 2/3 must be reconsidered. Secondary uncertainty is the Bun-vs-Deno pick and the binary-signing/trust story.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- `../inception/system-specification-draft-from-ai-brainstorm.md` — §2.2 (Go marked Decided — **reversed by this ADR**), §2.4 (Mermaid adapter assumption), §2.5 (open question: Mermaid renderer), §6.1 (repo structure), §9.4 (Git adapter), §9.5 (Markdown/Goldmark), §9.11 (Mermaid capability matrix), §13 (CI/release), §16 (Risks).
- `../inception/motivation-and-goal-notes-brain-dump.md` — single-binary, cross-OS, Mermaid-to-image requirements.
- `../inception/marksync-category-leadership-strategy-report-2026-07-02.md` — §11.x (atlcli TS/Bun analysis, packaging trust), §22.3 (Go as strongest default; TS acceptable if compiled to standalone binaries), §31 (technical recommendations).
- `../inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md` — §7 (platform/renderer failure modes; "renderer missing" scenario).
- `../inception/open-source-git-markdown-confluence-sync-report-2026-07-02.md` — §2.2 (competitor language choices), §8 (diagrams as decision-driving features).
- Related decision: ADR-0002 (Mermaid rendering strategy) — depends on this ADR.
