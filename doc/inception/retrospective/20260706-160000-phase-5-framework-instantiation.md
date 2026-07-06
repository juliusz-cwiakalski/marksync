---
status: Accepted
created: 2026-07-06T16:00:00
phase_scope: 5
topic: Framework instantiation from blueprint templates + project facts
outcome: repeat
---

# Retrospective: Phase 5 framework instantiation pattern

## What happened

Phase 5 required generating six framework files (AGENTS.md, four
`.ai/agent/*-instructions.md`, documentation-profile.md) plus verifying four
existing framework areas (handbook, templates, decisions index, 00-index).

Instead of authoring each file from scratch, the work followed a clean
instantiation pattern:

1. Read the ADOS blueprint/template for each artifact type.
2. Read the project-specific facts from already-approved inception artifacts
   (north star, roadmap, decisions index, rules, NFRs).
3. Instantiate the blueprint with project facts — no new decisions, no new
   speculation.

The one customization that went beyond mechanical instantiation was
`doc/00-index.md`: the ADOS-installed version referenced tools and sections not
present in this repo (zclaude, text-to-image). It was rewritten to point to
MarkSync-specific overview/spec/baselines while preserving the ADOS framework
guide links that do exist.

## What went well

- **Blueprint-driven generation** kept each file lean and on-template. The
  pr-instructions file is nearly a direct copy of the GitHub CLI blueprint with
  one repo-specific addition (merge policy). No drift from ADOS conventions.
- **No new open questions.** Because all project facts were already captured in
  Phases 0–4, Phase 5 was pure wiring. This validates that the earlier phases
  did their job.
- **Link validation caught nothing.** All links in the generated files resolve
  on the first pass because the target artifacts already exist.

## Improvement / pattern to repeat

**Treat Phase 5 as instantiation, not authoring.** When Phases 0–4 have done
their job, Phase 5 should be mechanical: read the blueprint, fill in the
project facts, validate links. If Phase 5 generates open questions or requires
new decisions, that's a signal that an earlier phase left a gap — consider
whether the question belongs to a reopened Phase 1–4 rather than Phase 5.

**Customize the doc index early.** The ADOS-installed `doc/00-index.md` is
generic and will have broken links in any project that doesn't ship the ADOS
tools. Phase 5 is the right time to rewrite it; leaving it generic creates
ghost references that Phase 6 (readiness check) will flag.
