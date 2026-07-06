# mermaid-render spike (GH-11 / MS2-E1-S1)

> **Status: spike complete.** The load-bearing deliverable is the findings document:
> [`/findings/mermaid-render-spike-findings.md`](../../findings/mermaid-render-spike-findings.md).

## Purpose

This standalone spike validated whether the official `mermaid` library renders
**deterministically in-process** under Bun + happy-dom **without Chromium**, across
five hypotheses (H1 determinism, H2 no-Chromium, H3 Bun-compat, H4 fidelity,
H5 security). It runs the **real** `mermaid.render()` against the **real**
happy-dom global registrant — no mocks of Mermaid or the DOM (anti-over-mocking
guardrail) — and produces evidence + a recommendation, not production code.

**Outcome (one line):** H1/H2/H3/H5 PASS; **H4 (fidelity) FAIL** — happy-dom has no
SVG layout engine (`getBBox` returns `0×0`), so Mermaid cannot faithfully render
headlessly without Chromium (or an unvalidated layout shim). → **MS-0002 adopts the
ADR-0002 `code`-policy fallback (rung 7); MS2-E4-S1 must not proceed with happy-dom
as-is.** Full detail + the recommendation in the findings doc.

## Prerequisites

- **Bun** runtime (developed against Bun 1.1.34; any recent 1.x should work).
- From this directory: `bun install` materializes `mermaid` 11.x, `happy-dom`, and
  `@happy-dom/global-registrator` (Bun 1.1.x emits the binary `bun.lockb`).

## How to run

> These run via **`bun run`** (the runtime), **NOT** `bun test` (the test runner).
> These are spike-validation probes, not production test tiers, and they are
> **not** wired into CI.

```bash
cd spikes/mermaid-render
bun install                  # materialize deps (creates bun.lockb)
bun run render               # smoke render under Bun (H3); prints JSON status
bun run probe:determinism    # H1 — N=5 normalized byte-stability per fixture
bun run probe:chromium       # H2 — transitive dep tree + process delta
bun run probe:security       # H5 — adversarial sanitization under strict
bun run probe:fidelity       # H4 — 5 diagram types: non-empty / well-formed / labels
bun run probe:secrets        # AC7 — grep-based secret scan
bun run probe:all            # consolidated pipeline (AC3/H3 evidence)
```

## Expected outputs (what each probe prints)

- **`probe:render`** — JSON: `runtime=bun`, `bunVersion`, `activeSecurityLevel=strict`,
  and a non-zero `smokeSvgLength`.
- **`probe:determinism`** — a per-fixture table (`rendered`, `byteStable`,
  `normalizedLen`, digest) and an H1 verdict. flowchart + gantt render and are
  byte-stable normalized; sequence/class/state **throw** under happy-dom
  (`svg element not in render tree` / dagre routing) and are recorded honestly as
  fail-to-render. Persists `fixtures/<name>.expected.svg` for the renderable fixtures.
- **`probe:chromium`** — dep-tree verdict (`bun pm ls --all`, transitive; 0 forbidden)
  + process-delta verdict (0 new chrome procs during render); overall H2 verdict.
- **`probe:security`** — active config read-back + a per-adversarial scan table
  (`<script>`, live `onerror=`/`onload=`, `javascript:`, bare substrings); all zero;
  H5 PASS (scoped — see findings §11/§13).
- **`probe:fidelity`** — a per-type table (`nonEmpty`, `wellFormed(<svg>+children)`,
  labels) and an H4 verdict (**FAIL — 0/5**: no `<svg>` root; degenerate layout).
- **`probe:secrets`** — `0 secrets in committed artifacts (reviewed <date>)`.
- **`probe:all`** — the consolidated summary: all stages' exit codes + the AC3/H3 line.

Golden normalized SVGs land at `fixtures/*.expected.svg` (only for the renderable
fixtures: `flowchart.expected.svg`, `gantt.expected.svg` — these are degenerate, so
their reuse value is limited until a faithful render path exists).

## How to interpret the findings

See **`/findings/mermaid-render-spike-findings.md`** for the executive summary, the
per-hypothesis verdict table with evidence pointers, root-cause analysis, and the
single MS-0002 recommendation.

**Outcome routing (per spec §18 / Appendix B):**
- PASS (all H1–H5) → proceed to MS2-E4-S1 in-process.
- Partial (needs a shim; single-binary intact) → record shim; proceed.
- Fail (needs Chromium) → **MS-0002 → ADR-0002 rung 7 (`code` policy)**; full render
  moves to MS-0003+. Does **not** block MS-0002.  ← **this spike's outcome.**
- Catastrophic (no deterministic path) → escalate to ADR-0001 language-level
  reconsideration; CEO decision. (This spike is **not** catastrophic — H1 passes for
  renderable output; the ADR-0001 revisit trigger is activated for owner review, not
  the catastrophic-FAIL path.)

## What is NOT here

- **No production renderer.** Wiring Mermaid into `src/infra/mermaid/` is MS2-E4-S1
  (spec NG-1). The main `src/` tree is untouched (spec NG-5; verified by
  `git diff main..HEAD`).
- **No ADR / spec / story updates in this spike.** ADR-0002 / ADR-0001 / TDR-0004 /
  the feature spec / story-status reconciliation happens in lifecycle **phase 7**
  (`@doc-syncer`), per spec NG-6. The findings doc lists the forced updates; this
  coder did not edit any system doc.
- **Not CI-wired.** No edits to `.github/workflows/`. Probes run locally; the findings
  document is the committed deliverable (C-SPIKE-6).

## MS2-E4-S1 reuse notes

Three artifacts are intended for verbatim reuse once a faithful render path is chosen:

1. **`normalize.ts`** — the pure, dependency-free SVG normalizer. Lift it verbatim;
   its header comment records the five normalization rules (the findings doc §5
   reiterates them).
2. **`fixtures/*.expected.svg`** — the golden normalized SVG pairs (currently only
   the 2 degenerate renderable fixtures; sequence/class/state have none because they
   do not render under happy-dom).
3. **The five normalization rules** (comments stripped → attributes sorted →
   ephemeral ids rewritten → whitespace canonicalized → font metadata normalized) —
   load-bearing for the golden-test tier (spec G-8, DEC-2, RSK-1).

## Files

```
spikes/mermaid-render/
├── package.json          # mermaid 11.x, happy-dom, @happy-dom/global-registrator
├── tsconfig.json
├── bun.lockb             # Bun 1.1.x binary lockfile (committed)
├── render.ts             # happy-dom-first init + real mermaid.render() helper
├── normalize.ts          # pure SVG normalizer (5 rules; lift verbatim)
├── probes/
│   ├── determinism.ts        # TC-MRSPIKE-001 → AC1/H1
│   ├── chromium-absence.ts   # TC-MRSPIKE-002 → AC2/H2
│   ├── security.ts           # TC-MRSPIKE-003 → AC5/H5
│   ├── fidelity.ts           # TC-MRSPIKE-004 → AC4/H4
│   └── run-all.ts            # TC-MRSPIKE-005/007 (probe:all orchestrator)
├── scripts/secret-scan.sh    # TC-MRSPIKE-006 → AC7
└── fixtures/
    ├── *.mmd                 # 5 canonical + 3 adversarial sources
    └── *.expected.svg        # golden normalized SVGs (renderable fixtures only)
```
