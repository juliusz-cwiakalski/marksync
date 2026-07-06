---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: review-GH-11-iter-1
change_ref: GH-11
iteration: 1
lifecycle_phase: review_fix (phase 8)
verdict: PASS
date: 2026-07-06
reviewer: reviewer
mode: local (base=main, head=spike/GH-11/mermaid-render-spike)
---

# Review Iteration 1 — GH-11 Mermaid headless-render spike

**Verdict: PASS.**

The spike was executed rigorously and documented honestly. The H4 FAIL (0/5) is
the designed, informative output of a load-bearing spike — not a defect. All
findings are minor/nit and do not affect the spike's conclusion.

## Summary

- **Findings**: 6 issues (0 blocker / 0 major / 1 minor / 5 nit)
- **AC coverage**: AC1–AC7 all satisfied with evidence (AC4 = FAIL-with-evidence, per scope)
- **Phase completion**: phases 0–9 all DONE; lifecycle phase-7 doc-sync DONE
- **Plan status**: ALL_TASKS_DONE (no OPEN_TASKS, no DONE_BUT_UNCHECKED, no CHECKED_BUT_MISSING)
- **Reproducibility**: independently verified by re-running `probe:all` — byte-identical goldens,
  exact digest match with the findings doc
- **DoR F1–F4**: all addressed in phase-7 reconciliation
- **Next step**: PROCEED (optional cleanup of minor/nits before PR; not required to pass)

## Key themes

1. **Honest reporting is the strong suit.** Degenerate output (gantt negative widths, no `<svg>`
   root), thrown renders (sequence/class/state), and a cross-run drift catch (gantt `today` line)
   are all recorded rather than massaged. The H4 root cause (happy-dom has no SVG layout engine,
   `getBBox` returns zeros) is corroborated by independent ecosystem evidence (mermaid issues
   #559/#6634, Saltcorn). The within-run N=5 probe alone would have missed the cross-run drift;
   the coder's proactive multi-process-run re-check caught it and produced Rule 5.

2. **Reproducibility verified.** Re-ran `probe:all` (Bun 1.1.34 linux/x64): all stages exit 0;
   H1 digests match the findings doc exactly (`88a55f72…` / `cd94ccce…`); the determinism probe
   rewrites `fixtures/*.expected.svg`, and after the re-run `git diff --stat fixtures/` is empty —
   the goldens are byte-identical, confirming Rule 5's gantt fix is reproducible across a different
   wall-clock date.

3. **Scope discipline is clean.** `git diff --name-only main…HEAD` touches only `spikes/`,
   `findings/`, the GH-11 change folder, and the expected `doc/decisions/`, `doc/spec/features/`,
   `doc/planning/milestones/MS-2/`. No `src/`, `tests/`, or `.github/` changes.

4. **Anti-over-mocking guardrail held.** `render.ts` uses real `GlobalRegistrator.register()`
   before a dynamic `await import("mermaid")`; every probe imports the real `render` + real
   `normalizeSvg`. The only non-real surface is the OS process listing (environment state), which
   is explicitly permitted.

5. **DoR findings fully addressed.** §F1 (ADR-0002 stop-criterion #1 + C-1 rewording), §F2 (H5
   scope note + optional 3rd adversarial fixture), §F3 (transitive `bun pm ls --all`), §F4
   (frontmatter/body status reconciliation) — all reflected in the phase-7 doc edits.

6. **CEO decisions correctly deferred.** ADR-0001 reconsideration, MS2-E4-S1 re-scoping, and a
   possible follow-up svgdom/getBBox-shim spike are surfaced in pm-notes `open_questions` and
   findings §4/§10 — and explicitly NOT auto-decided by the doc-sync.

## The one minor finding (does not block)

`probes/chromium-absence.ts` chromeRe under-matches canonical chrome/chromium process names
(`/opt/google/chrome/chrome`, `/usr/bin/chromium`, bare `chrome --headless` all MISS — verified
empirically). This weakens the NFR-DEP-2 process-delta arm. The H2 PASS verdict is unaffected
because the dependency-tree check (NFR-DEP-1, transitive, substring-based, 0 forbidden) is the
load-bearing evidence, and Mermaid under happy-dom spawns no process by construction. Fix: broaden
to a substring match and note the limitation in findings §3 (H2) for E4-S1.

## Nits (advisory)

- `normalize.ts` Rule 5 defensive regex over-matches any class containing "today" (digest form only;
  works for current Mermaid; document for E4-S1).
- `run-all.ts` computes `WORKSPACE_ROOT` via fragile `replace("/probes","")`; use `join(import.meta.dir,"..")` for consistency with chromium-absence.ts.
- `tsconfig.json` relaxes `verbatimModuleSyntax:false` without an inline justification (the plan asked for a commented reason).
- `chg-GH-11-pm-notes.yaml` has a duplicate `open_questions:` key (empty then populated).
- (informational) standalone `tsc --noEmit` can't resolve `bun` types; runs fine under Bun (no typecheck script required by the plan).

## Files written

- `code-review/findings-iter-1.json` — structured findings + AC/phase/DoR/reproducibility detail
- `code-review/review-iter-1.md` — this summary
