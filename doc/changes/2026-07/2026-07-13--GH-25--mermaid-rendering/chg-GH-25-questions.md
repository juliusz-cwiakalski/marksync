# GH-25 — Open questions (blocking delivery)

> Blocking decisions recorded during clarify_scope (2026-07-13). Delivery of
> GH-25 cannot start until OPEN-Q1 is answered by the owner. The story file
> (`doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S1--mermaid-rendering.md`)
> carries an explicit "Do not start delivery against the current scope" banner.

## OPEN-Q1: Which re-scoped renderer option does MS2-E4-S1 implement?

**Question:** The GH-11 spike (MS2-E1-S1, CLOSED 2026-07-06) returned a PARTIAL
verdict that invalidates this story's core assumption ("in-process render via
happy-dom + Bun per spike E1-S1"). happy-dom/jsdom have **no SVG layout engine**
(`getBBox` returns `{0,0,0,0}`); fidelity FAILED 0/5 (sequence/class/state throw;
flowchart/gantt degenerate). ADR-0001 and ADR-0002 both flag an **owner-level
decision** that determines the entire scope of this story. Which option do we
implement?

1. **Chromium-based render** (`mmdc` / Puppeteer / Playwright) — faithful output,
   but **violates ADR-0001's single-binary/no-Chromium promise**; likely moves
   full rendering to MS-0003+.
2. **Validated SVG-layout shim** (`svgdom` / canvas-measured `getBBox` polyfill)
   — could preserve the no-Chromium in-process path but is **unvalidated**;
   needs a follow-up spike before commitment.
3. **Accept the `code` policy as the MS-0002 default** (ADR-0002 fallback rung 7)
   — ship "preserve raw code block" now, defer full rendering to a later
   milestone once option 1 or 2 is chosen.

**Why this is blocking:** Each option is a materially different story (different
scope, different dependencies, different AC). The spec/test-plan/plan cannot be
authored until the renderer path is chosen. The spike's cleanest recommendation
is **option 3 for MS-0002** (ship `code` policy) + a follow-up spike validating
option 2. MS-0002 is **not** blocked either way — only GH-25's specific scope is.

**Decision input:**
- Spike findings: [`findings/mermaid-render-spike-findings.md`](../../../findings/mermaid-render-spike-findings.md) (§10 recommendation, §3 H4 root cause)
- ADR-0001 revisit-trigger status: `doc/decisions/ADR-0001-implementation-language-and-runtime.md` (Unresolved Questions — "Owner decision required (CEO-level)")
- ADR-0002 spike outcome: `doc/decisions/ADR-0002-mermaid-rendering-strategy.md` (Part B does NOT advance to spike-validated)

### Answer
<!-- Owner: pick option 1, 2, or 3 (or direct a follow-up spike for option 2).
     Reply inline here, on the GH-25 issue, or via the PR once delivery resumes. -->

**RESOLVED 2026-07-13 — CEO-DEC-1 (Option 3).** Ship the `code` policy (preserve
raw Mermaid code block) as the MS-0002 default per ADR-0002 fallback rung 7. Full
in-process Mermaid SVG rendering deferred to MS-0003+.

Rationale: (1) GH-11 spike proved happy-dom/jsdom lack an SVG layout engine
(getBBox returns zeros; H4 FAIL 0/5) — the story's core assumption is invalid for
MS-0002; (2) Chromium render (option 1) violates ADR-0001's single-binary/
no-Chromium promise; (3) the SVG-layout shim (option 2) is unvalidated and needs
a follow-up spike; (4) MS-0002's value proposition is the safe one-way publish
(trust wedge) — Mermaid rendering is a feature enhancement, not safety/correctness;
(5) the code-policy fallback is documented in ADR-0002 and is deterministic + safe
+ reversible; (6) TypeScript/Bun is locked in (15 successful deliveries) — NOT
revisited (ADR-0001 revisit trigger resolved: no fundamental reconsideration).

Decision authority: CEO-agent under user-delegated autonomous authority. ADR-0001
and ADR-0002 open-question amendments to be recorded by `@doc-syncer` in lifecycle
phase 7 (system_spec_update), citing CEO-DEC-1.
