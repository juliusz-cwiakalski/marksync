# Findings — [MS2-E1-S1] Mermaid headless-render spike (GH-11)

> **Spike deliverable.** This document records an explicit PASS/FAIL for each of
> hypotheses H1–H5, with evidence pointers, and gives a single clear MS-0002
> recommendation. It is the *input* to a later (lifecycle phase 7) ADR-0002 /
> ADR-0001 / TDR-0004 / story-status reconciliation performed by `@doc-syncer`.
> **This coder did NOT edit any ADR, spec, or story file** (spec NG-6).

**Work item:** GH-11 — `[MS2-E1-S1] Mermaid headless-render spike`
**Date:** 2026-07-06
**Runtime:** Bun `1.1.34` on `linux/x64`
**Libraries under test:** `mermaid` `11.16.0`, `happy-dom` `15.11.7`,
`@happy-dom/global-registrator` `15.11.7`
**Reproducibility:** `cd spikes/mermaid-render && bun install && bun run probe:all`

---

## 1. Executive summary

**Overall verdict: PARTIAL → the in-process no-Chromium premise does NOT produce
faithful Mermaid output. H4 (fidelity) FAILS; H1, H2, H3, H5 PASS (H1 and H2 are
effectively vacuous given the H4 failure).**

The official `mermaid` library (11.16.0) DOES initialize, run, and render
in-process under Bun + happy-dom WITHOUT Chromium (H2 PASS, H3 PASS), and the
output that *is* produced is byte-stable across repeated renders after
normalization (H1 PASS), and Mermaid's `securityLevel:"strict"` default does
neutralize the XSS / `<script>` adversarial payloads (H5 PASS).

**However**, happy-dom has **no SVG layout engine**: `SVGElement.prototype.getBBox`
is `undefined` and returns a `0×0` rect. Mermaid's layout path calls `getBBox()`
to measure text; when it returns `0×0` the sequence/class/state renderers throw
(`"svg element not in render tree"`, dagre `"Could not find a suitable point for
the given distance"`), and the flowchart/gantt renderers silently produce
**degenerate** output — no `<svg>` root element (happy-dom serializes an SVG
*fragment*, not a standalone document), default `60×30` node boxes (text measured
as zero), and even a **negative** width attribute in the gantt output. None of
the 5 canonical diagram types yields a well-formed `<svg>`-rooted document →
**H4 FAIL (0/5)**.

This is precisely the gap the spike was designed to surface (spec RSK-5; TDR-0004
escalation ladder). It is **confirmed both by direct probe and by independent
ecosystem evidence** (mermaid issues #559 and #6634; the Saltcorn wiki; community
guidance): *Mermaid needs a browser layout engine (getBBox); neither happy-dom
nor jsdom provides one; the only officially-supported server-side path is
Chromium via `mmdc`/Puppeteer.*

**MS-0002 recommendation (single sentence):** **MS-0002 descends ADR-0002's
fallback ladder to rung 7 — the `code` policy (preserve the raw Mermaid code
block) — which does NOT block MS-0002; MS2-E4-S1 must NOT proceed with the
happy-dom in-process renderer as-is, and the full in-process render needs either
a Chromium-based path (violates ADR-0001's single-binary/no-Chromium promise —
requires an owner decision) or a validated SVG-layout shim (svgdom / canvas-based
getBBox — needs a follow-up spike).** (See §11 for detail.)

> **Catastrophic-failure assessment (per the story's failure-mode rubric):** H1
> did **NOT** fail catastrophically — deterministic output *is* produced for the
> fixtures that render, so the ADR-0001 "no deterministic path at all → language-
> level reconsideration" escalation is **NOT triggered**. The failure is H4
> (fidelity), driven by the DOM's missing layout engine. That said, the finding
> that *faithful* no-Chromium rendering is not achievable with happy-dom OR jsdom
> materially challenges ADR-0001's load-bearing in-process rationale and warrants
> an explicit owner-level review (flagged for lifecycle phase 7 + a CEO decision),
> distinct from the catastrophic-FAIL path.

---

## 2. Per-hypothesis verdict table

| Hypothesis | Verdict | Evidence |
|---|---|---|
| **H1** determinism (same-OS) | **PASS (caveat)** | `spikes/mermaid-render/probes/determinism.ts`; golden normalized SVGs `fixtures/flowchart.expected.svg`, `fixtures/gantt.expected.svg`. Normalized sha256 (5/5 byte-identical per fixture): flowchart `88a55f72…52f887` (len 10038); gantt `34c47710…399e19` (len 7946). **Caveat:** only 2/5 fixtures render (sequence/class/state throw), so the determinism claim holds for renderable output but that output is degenerate (see H4). |
| **H2** no Chromium | **PASS** | `probes/chromium-absence.ts`; `bun pm ls --all` (transitive, DoR F3) → 117 lines, **0** occurrences of `puppeteer`/`playwright`/`chromium`; runtime process delta around a real render → **0** new chrome/chromium processes (2 pre-existing chrome procs on the host, unchanged). NFR-DEP-1 + NFR-DEP-2 both clean. |
| **H3** Bun single-binary compat | **PASS** | `probes/run-all.ts` (`bun run probe:all`) executed the full pipeline end-to-end under Bun 1.1.34 on linux/x64 with **no** Node-only fallback; all 5 stages exited 0. Runtime invocation is the evidence (test-plan OQ-1). |
| **H4** fidelity | **FAIL (0/5)** | `probes/fidelity.ts`. flowchart + gantt: non-empty and contain expected labels, BUT **no `<svg>` root** (happy-dom serializes a fragment) and degenerate layout (default `60×30` rects; gantt negative widths `-37.5`/`-150`). sequence/class/state: THROW (`"svg element not in render tree"` / dagre `"Could not find a suitable point for the given distance"`). |
| **H5** security defaults | **PASS** | `probes/security.ts`. `securityLevel:"strict"` confirmed ACTIVE (read back via `mermaidAPI.getConfig()`; `htmlLabels:false`, `deterministicIds:true`, `fontFamily:"sans-serif"`). All 3 adversarial outputs: **0** `<script>` tags, **0** live `onerror=`/`onload=`, **0** `javascript:` URIs (and 0 bare substrings). Scoped per DoR F2 — see §13. |

**AC coverage:** AC1 → H1 (partial); AC2 → H2 (PASS); AC3 → H3 (PASS); AC4 → H4
(FAIL); AC5 → H5 (PASS); AC6 → this document; AC7 → 0 secrets (§7).

---

## 3. Per-hypothesis detail

### H1 — Determinism (same-OS): PASS (caveat)

The determinism probe renders each canonical fixture N=5 times via the real
`mermaid.render()` + real happy-dom, normalizes via the real `normalizeSvg`, and
sha256-compares. Raw output (same render id) is already byte-identical; the
normalizer additionally neutralizes id prefixes, attribute order, whitespace, and
font metadata (§5). Per-fixture, all 5 normalized digests were identical:

- `flowchart`: sha256 `88a55f72622a25b1130f0f49ebdfac575c2f4601c769c54d6827d7d24652f887`
- `gantt`: sha256 `34c477104481099cc64dd4912198a9b7fc4c1515e7a781350344efbee7399e19`

3 of 5 fixtures (sequence/class/state) cannot be determinism-tested because they
do not render under happy-dom (H4). The determinism claim is therefore *true for
renderable output but practically moot* — the stable output is degenerate.

### H2 — No Chromium: PASS

- **Dependency tree (NFR-DEP-1):** `bun pm ls --all` (the **transitive** listing,
  per DoR F3 — a hidden Chromium dep would arrive via mermaid's sub-dependencies)
  scanned 117 lines; zero occurrences of `puppeteer`, `playwright`, or `chromium`.
- **Runtime process (NFR-DEP-2):** `ps aux` snapshot before vs after a real render
  showed 2 pre-existing chrome processes on the host, unchanged (delta = 0). The
  happy-dom render path spawns no browser. (`ps` is POSIX; the probe degrades
  gracefully and never silently passes where `ps` is unavailable.)

H2 is technically PASS — and this is the crux of the nuance: the no-Chromium path
*works*, it just produces unfaithful output. The Chromium requirement arises only
if you want *faithful* rendering, which is the H4 concern.

### H3 — Bun single-binary compat: PASS

`bun run probe:all` ran the entire pipeline (determinism → chromium-absence →
security → fidelity → secrets) end-to-end under Bun 1.1.34 on linux/x64; every
stage exited 0; no Node-only fallback path was taken. The render failures (H4) are
DOM/layout failures, not runtime failures — Bun executes the in-process path
correctly.

### H4 — Fidelity: FAIL (0/5)  ← the load-bearing finding

| fixture | type | non-empty | `<svg>` root (DOM-parsed) | expected labels | verdict |
|---|---|---|---|---|---|
| flowchart | `graph TD` | yes (10567 chars) | **NO** (fragment; `hasSvgTag=false`, `domRootTag=none`) | yes (Hello/World) | FAIL |
| sequence | `sequenceDiagram` | no — **throws** | n/a | n/a | FAIL |
| class | `classDiagram` | no — **throws** | n/a | n/a | FAIL |
| state | `stateDiagram-v2` | no — **throws** | n/a | n/a | FAIL |
| gantt | `gantt` | yes (8020 chars) | **NO** (fragment; negative widths `-37.5`/`-150`) | yes (Build/Spike) | FAIL |

**Root cause:** happy-dom 15.11.7 has no SVG layout engine. Direct probe:
`SVGElement.prototype.getBBox` is `undefined`; calling it returns a `DOMRect`
`{0,0,0,0}`. Mermaid's layout path (`getMaxMessageWidthPerActor`, class/state
label measurement, dagre node sizing) calls `getBBox()`; when it returns `0×0`:

- sequence/class renderers hit mermaid's own guard
  `if (bBox.width === 0 && bBox.height === 0) throw new Error("svg element not in render tree")`;
- state renderer fails in dagre edge routing
  (`"Could not find a suitable point for the given distance"`);
- flowchart/gantt renderers do **not** throw but silently emit degenerate output
  (default `60×30` node boxes; missing `<svg>` root wrapper; gantt negative
  widths).

**Independent corroboration (ecosystem):**
- mermaid-js/mermaid#559 ("server side mermaid with jsdom"): *"…impossible to
  layout the diagrams properly…"*; Saltcorn wiki: *"`.getBBox()` required by
  Mermaid…"*.
- mermaid-js/mermaid#6634 ("Server-side rendering of flowchart using SVGDOM"):
  notes *"happy-dom and jsdom are real difficult to integrate with svgdom"* and
  that DOMPurify prefers JSDOM — SSR is an open, approved problem.
- Community consensus: *"Mermaid needs a browser's layout engine to run
  properly"*; the only officially-supported SSR path is `mmdc` (Puppeteer/
  Chromium).

**Implication:** jsdom (the TDR-0004 escalation rung after happy-dom) would **not**
resolve this — jsdom likewise has no layout engine and returns zeros for `getBBox`.
Only a real layout engine (Chromium, or an SVG-DOM-with-layout such as `svgdom`)
or a text-measurement shim (canvas `measureText`-backed `getBBox`) can produce
faithful output.

### H5 — Security defaults: PASS

`securityLevel:"strict"` was confirmed ACTIVE by reading back the initialized
config (`mermaidAPI.getConfig()` → `securityLevel:"strict"`, `htmlLabels:false`,
`deterministicIds:true`, `fontFamily:"sans-serif"` — no silent override). Each
adversarial fixture (`adversarial-xss.mmd`, `adversarial-script.mmd`, and the
optional `adversarial-external-ref.mmd`) rendered via the real render + real
normalizeSvg, and the normalized output was scanned. All counts were **zero**:

| fixture | `<script>` | live `onerror=` | live `onload=` | `javascript:` | bare `on*` |
|---|---|---|---|---|---|
| adversarial-xss | 0 | 0 | 0 | 0 | 0 |
| adversarial-script | 0 | 0 | 0 | 0 | 0 |
| adversarial-external-ref | 0 | 0 | 0 | 0 | 0 |

The XSS (`<img … onerror=…>`) and `<script>` payloads are neutralized by Mermaid's
default config. (Scan reports both the *live* forms — tags/attributes/URIs that can
execute — and, for transparency, bare substrings; an HTML-escaped payload that
survives as inert display text is not a security issue and is not gated. In this
run even the bare substrings were absent.)

---

## 4. Forced ADR / doc updates required (handled by `@doc-syncer` in lifecycle phase 7 — NOT by this coder)

| System doc | Required update | Trigger |
|---|---|---|
| `doc/decisions/ADR-0002-…md` | Part B does **NOT** advance to `spike-validated` (H4 failed). Record that MS-0002 descends the fallback ladder to **rung 7 (`code` policy)**. Per DoR F1, also reword stop-criterion #1 / C-1 to the same-OS-normalized-SVG + per-OS-hash-key formulation, and record the actual cross-OS result (same-OS only — §9). | H4 FAIL |
| `doc/decisions/ADR-0001-…md` | **Revisit trigger ACTIVATED**, but the **catastrophic-FAIL** ADR-0001 escalation is **NOT** taken (a deterministic path exists; H1/H2/H3 pass). Flag for a CEO decision: the in-process-no-Chromium premise is not achievable for *faithful* Mermaid rendering with happy-dom/jsdom; faithful rendering requires Chromium (violates single-binary) or an unvalidated layout shim. This is a serious hit to ADR-0001's load-bearing rationale and warrants explicit owner review. | H4 FAIL (faithful render needs Chromium/shim) |
| `doc/decisions/TDR-0004-…md` | The default `bun:test` + **happy-dom** Mermaid-DOM path is **insufficient** for text-measuring diagram types (getBBox). jsdom (next escalation rung) is also insufficient (no layout). Record this; the viable options are a real layout engine or a getBBox shim. Reconcile the pre-existing frontmatter (`Accepted`) vs body (`Proposed`) status mismatch (DoR F4) before any status change. | H3 + happy-dom getBBox gap |
| `doc/spec/features/feature-mermaid-rendering.md` | Record the normalization rules (§5) and that MS-0002 ships the `code` policy default. | Findings |
| Story `MS2-E1-S1--mermaid-render-spike.md` | `status: todo → done`. | Spike complete |
| `MS2-E4-S1--mermaid-rendering.md` | Pointer to these findings; the happy-dom in-process renderer is NOT viable as-is. | Findings (H4 FAIL) |

> The coder recorded the recommendation here; the actual doc edits belong to
> `@doc-syncer` (spec NG-6).

---

## 5. Normalization rules summary (for MS2-E4-S1 reuse — spec G-8, DEC-2)

The spike's `spikes/mermaid-render/normalize.ts` is a **pure, dependency-free**
normalizer (lift verbatim). It applies, **in order**:

1. **XML comments stripped** — remove all `<!-- … -->`.
2. **Attributes sorted deterministically per element** — sort each element's
   attributes by name (value as secondary key).
3. **Ephemeral / instance-specific IDs rewritten deterministically** — collect
   every `id="…"` in document order, rewrite to a stable `eid0`, `eid1`, …
   sequence, and update every reference (`url(#…)`, `href="#…"`, `xlink:href="#…"`)
   to match (longest originals first). This neutralizes mermaid's `<base>-<n>`
   sequence ids, clip-path/marker/filter ids, and the embedded render-id prefix.
4. **Whitespace canonicalization** — collapse whitespace runs, drop inter-tag
   whitespace (`> <` → `><`), trim.
5. **Font / system metadata normalized or stripped** — canonicalize every
   `font-family:…` declaration (CSS and attribute) to a fixed token; strip any
   `data-mermaid-version`/ISO-timestamp markers if present.

**Non-goal:** normalization is for *digest stability*, not for altering rendered
semantics. The persisted `fixtures/<name>.expected.svg` is the normalized form.

---

## 6. Golden SVG fixture pairs

Because H4 did not fully PASS, only the **two renderable** fixtures have committed
golden normalized SVGs (and they are **degenerate** — limited reuse value until a
real layout path exists):

- `spikes/mermaid-render/fixtures/flowchart.mmd` ↔ `spikes/mermaid-render/fixtures/flowchart.expected.svg`
- `spikes/mermaid-render/fixtures/gantt.mmd` ↔ `spikes/mermaid-render/fixtures/gantt.expected.svg`

These pairs + the normalizer (§5) remain the reusable substrate for MS2-E4-S1's
golden-test tier **once a faithful render path is chosen**. sequence/class/state
have no golden (they do not render under happy-dom).

---

## 7. Secrets hygiene (AC7)

Secrets scan: **0 secrets in committed artifacts (reviewed 2026-07-06).**
`bun run probe:secrets` (`scripts/secret-scan.sh`) scanned the spike workspace +
these findings, excluding gitignored `node_modules/`/logs/`*.lockb`/ephemera.

---

## 8. Shim / per-OS-cache-key note

- **Shim:** None applied. No DOM/mermaid mocking occurred (C-SPIKE-3; the
  anti-over-mocking guardrail held). A `getBBox` augmentation was **considered and
  deliberately NOT applied** — it would have blurred the "real happy-dom" claim.
  Whether a layout shim (svgdom or canvas-measured getBBox) is acceptable for
  production is a follow-up decision (see §11).
- **Per-OS-cache-key (spec DEC-3):** not exercised — cross-OS was not run (§9).

---

## 9. Cross-OS determinism result (stretch — NFR-DET-2)

**Same-OS only.** A single Linux/x64 host was available, so cross-OS byte
determinism was **not** measured. Per spec DEC-3, if a future cross-OS run differs,
the per-OS cache key in the ADR-0002 hash input (`marksync-mermaid-render-v1 + … +
font_policy`) preserves idempotency without abandoning the in-process path. (This
is moot until a faithful render path exists.)

---

## 10. MS2-E4-S1 / MS-0002 recommendation (single, clear)

**MS-0002: adopt ADR-0002 fallback rung 7 — the `code` policy** (preserve the raw
Mermaid source block instead of rendering). This **does not block MS-0002**.

**MS2-E4-S1: do NOT proceed with the happy-dom in-process renderer as-is.** The
faithful in-process render requires one of:

1. **Chromium-based render** (Puppeteer/Playwright, the official `mmdc` path) —
   produces faithful output but **violates H2 / ADR-0001's single-binary,
   no-Chromium promise**; requires an owner decision and likely moves full
   rendering to MS-0003+.
2. **A validated SVG-layout shim** (e.g. `svgdom`, or a canvas `measureText`-
   backed `getBBox` polyfill) — could preserve the no-Chromium in-process path but
   is **unvalidated**; needs a **follow-up spike** before commitment.
3. **Accept `code` policy as the MS-0002 default** and defer full rendering to a
   later milestone once option 1 or 2 is chosen.

The cleanest immediate path is **option 3 for MS-0002** (ship `code` policy) while
a follow-up spike validates option 2 (the only option that preserves ADR-0001's
load-bearing no-Chromium premise). If option 2 proves unviable, option 1 forces a
fundamental ADR-0001/ADR-0002 reconsideration.

---

## 11. DoR-review findings addressed here (load-bearing for phase 7)

- **§F1 (ADR-0002 stop-criterion #1 / C-1 wording):** recorded for phase 7. The
  spike gates on same-OS normalized-SVG byte-stability (H1, which passed for the
  2 renderable fixtures); cross-OS is per-OS-hash-key (DEC-3), not raw byte
  equality. Stop-criterion #1 / C-1 must be reworded accordingly, AND Part B
  status must reflect the H4 failure (not `spike-validated`).
- **§F2 (H5 scope):** H5 here validates Mermaid **default-config** safety vs
  XSS/script only. **Full SVG sanitization** (incl. external-resource blocking via
  `<use href="http://…">`, remote fonts/images) is **deferred to MS2-E4-S1
  (`SVGSanitizer`)**. The optional 3rd adversarial fixture
  `fixtures/adversarial-external-ref.mmd` was added and rendered; its
  external-ref outcome is recorded (0 live handlers) but is **not** a gate (the
  spike does not validate complete external-resource blocking).
- **§F3 (transitive Chromium listing):** addressed — `bun pm ls --all` (transitive)
  was used; 117 lines, 0 forbidden.
- **§F4 (pre-existing status mismatch):** recorded for phase 7 — ADR-0002 and
  TDR-0004 frontmatter/body status must be reconciled before any
  `spike-validated`/`Proposed` transition.

---

## 12. How to reproduce

```bash
cd spikes/mermaid-render
bun install                 # materializes deps + bun.lockb
bun run render              # smoke render under Bun (H3)
bun run probe:determinism   # H1
bun run probe:chromium      # H2
bun run probe:security      # H5
bun run probe:fidelity      # H4
bun run probe:secrets       # AC7
bun run probe:all           # consolidated (AC3/H3)
```

Probes are spike-validation probes run via `bun run` (the runtime), **not** the
`bun:test` runner, and are **not** wired into CI (C-SPIKE-6). Expected per-probe
output is documented in `spikes/mermaid-render/README.md` (the run-book).

---

## 13. Glossary pointer

See `doc/changes/2026-07/2026-07-06--GH-11--mermaid-render-spike/chg-GH-11-spec.md`
§23 for terms (spike, happy-dom, `securityLevel:"strict"`, normalized SVG, golden
fixture pair, fallback ladder, `code` policy).
