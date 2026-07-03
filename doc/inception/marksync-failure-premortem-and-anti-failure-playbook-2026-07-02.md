# How MarkSync Fails

## A unified pre-mortem, competitive failure analysis, and anti-failure playbook

**Project:** MarkSync for Confluence  
**Date:** 2 July 2026  
**Purpose:** Identify the strategic, product, technical, delivery, open-source, and adoption conditions that could cause MarkSync to fail—and convert them into concrete guardrails, phase gates, and decisions.

---

<!-- TOC -->
* [How MarkSync Fails](#how-marksync-fails)
  * [A unified pre-mortem, competitive failure analysis, and anti-failure playbook](#a-unified-pre-mortem-competitive-failure-analysis-and-anti-failure-playbook)
  * [Executive summary](#executive-summary)
    * [The central pre-mortem conclusion](#the-central-pre-mortem-conclusion)
    * [The ten highest-risk failure modes](#the-ten-highest-risk-failure-modes)
    * [What “failure” means in this report](#what-failure-means-in-this-report)
  * [1. Evidence and project intent](#1-evidence-and-project-intent)
  * [2. The imagined failure: a plausible retrospective from the future](#2-the-imagined-failure-a-plausible-retrospective-from-the-future)
    * [2.1 Months 0–3: the project looks exceptionally mature](#21-months-03-the-project-looks-exceptionally-mature)
    * [2.2 Months 4–8: the safe publisher is delayed by platform foundations](#22-months-48-the-safe-publisher-is-delayed-by-platform-foundations)
    * [2.3 Months 9–12: bidirectional behavior is demonstrated but not proven](#23-months-912-bidirectional-behavior-is-demonstrated-but-not-proven)
    * [2.4 Public launch: curiosity exceeds activation](#24-public-launch-curiosity-exceeds-activation)
    * [2.5 The first trust incidents](#25-the-first-trust-incidents)
    * [2.6 Maintenance load overtakes product progress](#26-maintenance-load-overtakes-product-progress)
    * [2.7 The project’s final state](#27-the-projects-final-state)
  * [3. Strategic failure modes in the current vision](#3-strategic-failure-modes-in-the-current-vision)
  * [3.1 The project attempts to solve the market’s end state immediately](#31-the-project-attempts-to-solve-the-markets-end-state-immediately)
    * [How this causes failure](#how-this-causes-failure)
    * [Guardrail](#guardrail)
  * [3.2 The source-of-truth model is semantically inconsistent](#32-the-source-of-truth-model-is-semantically-inconsistent)
    * [How this causes failure](#how-this-causes-failure-1)
    * [Guardrail](#guardrail-1)
  * [3.3 The product may be technically differentiated but behaviorally hard to adopt](#33-the-product-may-be-technically-differentiated-but-behaviorally-hard-to-adopt)
    * [Guardrail](#guardrail-2)
  * [3.4 The project may solve a painful edge case before proving its frequency](#34-the-project-may-solve-a-painful-edge-case-before-proving-its-frequency)
    * [Guardrail](#guardrail-3)
  * [3.5 The educational mission can dilute the product mission](#35-the-educational-mission-can-dilute-the-product-mission)
    * [Failure mechanism](#failure-mechanism)
    * [Guardrail](#guardrail-4)
  * [4. Product and UX failure modes](#4-product-and-ux-failure-modes)
  * [4.1 “Two-way sync” becomes a misleading headline](#41-two-way-sync-becomes-a-misleading-headline)
    * [Avoid](#avoid)
    * [Do instead](#do-instead)
  * [4.2 The first-run experience requires enterprise knowledge](#42-the-first-run-experience-requires-enterprise-knowledge)
    * [Failure indicators](#failure-indicators)
    * [Prevention](#prevention)
  * [4.3 Safety mechanisms become permanent blockers](#43-safety-mechanisms-become-permanent-blockers)
    * [Prevention](#prevention-1)
  * [4.4 The plan is accurate but the apply is not](#44-the-plan-is-accurate-but-the-apply-is-not)
    * [Failure mechanism](#failure-mechanism-1)
    * [Prevention](#prevention-2)
  * [4.5 Configuration flexibility becomes configuration programming](#45-configuration-flexibility-becomes-configuration-programming)
    * [Prevention](#prevention-3)
  * [4.6 Machine output and human output diverge](#46-machine-output-and-human-output-diverge)
    * [Prevention](#prevention-4)
  * [4.7 The project name and language become inconsistent](#47-the-project-name-and-language-become-inconsistent)
    * [Prevention](#prevention-5)
  * [5. Synchronization-engine failure modes](#5-synchronization-engine-failure-modes)
  * [5.1 Local cache is mistaken for authoritative state](#51-local-cache-is-mistaken-for-authoritative-state)
    * [Required state separation](#required-state-separation)
  * [5.2 Titles or paths leak back into identity](#52-titles-or-paths-leak-back-into-identity)
    * [Consequences](#consequences)
    * [Prevention](#prevention-6)
  * [5.3 Confluence history is treated as a reliable event log](#53-confluence-history-is-treated-as-a-reliable-event-log)
    * [Prevention](#prevention-7)
  * [5.4 Semantic no-op detection is wrong](#54-semantic-no-op-detection-is-wrong)
    * [Prevention](#prevention-8)
  * [5.5 Line-based Markdown merge is presented as semantic merge](#55-line-based-markdown-merge-is-presented-as-semantic-merge)
    * [Prevention](#prevention-9)
  * [5.6 Unsupported content cannot be both invisible and safe](#56-unsupported-content-cannot-be-both-invisible-and-safe)
    * [Prevention](#prevention-10)
  * [5.7 Deletion semantics create a catastrophic edge](#57-deletion-semantics-create-a-catastrophic-edge)
    * [Prevention](#prevention-11)
  * [5.8 Concurrent runs cause stale-base writes](#58-concurrent-runs-cause-stale-base-writes)
    * [Prevention](#prevention-12)
  * [5.9 Large-repository optimization compromises correctness](#59-large-repository-optimization-compromises-correctness)
    * [Prevention](#prevention-13)
  * [6. Content, attachment, and diagram failure modes](#6-content-attachment-and-diagram-failure-modes)
  * [6.1 Markdown support becomes an undefined promise](#61-markdown-support-becomes-an-undefined-promise)
    * [Failure mechanism](#failure-mechanism-2)
    * [Prevention](#prevention-14)
  * [6.2 Conversion fidelity is evaluated textually, not visually or semantically](#62-conversion-fidelity-is-evaluated-textually-not-visually-or-semantically)
    * [Prevention](#prevention-15)
  * [6.3 Attachments are treated as a helper feature](#63-attachments-are-treated-as-a-helper-feature)
    * [Failure outcomes](#failure-outcomes)
    * [Prevention](#prevention-16)
  * [6.4 Diagram rendering breaks the single-binary promise](#64-diagram-rendering-breaks-the-single-binary-promise)
    * [Failure mechanism](#failure-mechanism-3)
    * [Prevention](#prevention-17)
  * [6.5 Diagram images are deterministic only in theory](#65-diagram-images-are-deterministic-only-in-theory)
    * [Prevention](#prevention-18)
  * [7. Authentication, platform, and enterprise failure modes](#7-authentication-platform-and-enterprise-failure-modes)
  * [7.1 “All possible authentication scenarios” is an unbounded requirement](#71-all-possible-authentication-scenarios-is-an-unbounded-requirement)
    * [Failure mechanism](#failure-mechanism-4)
    * [Prevention](#prevention-19)
  * [7.2 Cloud and Data Center are treated as minor variants](#72-cloud-and-data-center-are-treated-as-minor-variants)
    * [Prevention](#prevention-20)
  * [7.3 Atlassian API drift is handled reactively](#73-atlassian-api-drift-is-handled-reactively)
    * [Prevention](#prevention-21)
  * [7.4 Rate limits and permission asymmetry surface late](#74-rate-limits-and-permission-asymmetry-surface-late)
    * [Prevention](#prevention-22)
  * [8. Delivery-model failure modes](#8-delivery-model-failure-modes)
  * [8.1 The project remains in inception indefinitely](#81-the-project-remains-in-inception-indefinitely)
    * [Early signals](#early-signals)
    * [Prevention](#prevention-23)
  * [8.2 TDD and BDD become ceremony rather than evidence](#82-tdd-and-bdd-become-ceremony-rather-than-evidence)
    * [Failure mechanism](#failure-mechanism-5)
    * [Prevention](#prevention-24)
  * [8.3 AI-assisted delivery amplifies specification errors](#83-ai-assisted-delivery-amplifies-specification-errors)
    * [Failure mechanism](#failure-mechanism-6)
    * [Prevention](#prevention-25)
  * [8.4 Mocked Confluence integration becomes the dominant test layer](#84-mocked-confluence-integration-becomes-the-dominant-test-layer)
    * [Prevention](#prevention-26)
  * [8.5 Live E2E space creation is brittle and over-privileged](#85-live-e2e-space-creation-is-brittle-and-over-privileged)
    * [Prevention](#prevention-27)
  * [8.6 The architecture is optimized for hypothetical adapters](#86-the-architecture-is-optimized-for-hypothetical-adapters)
    * [Prevention](#prevention-28)
  * [9. Open-source and organizational failure modes](#9-open-source-and-organizational-failure-modes)
  * [9.1 One maintainer owns a combinatorial support matrix](#91-one-maintainer-owns-a-combinatorial-support-matrix)
    * [The matrix multiplies across](#the-matrix-multiplies-across)
    * [Prevention](#prevention-29)
  * [9.2 The repository is optimized for AI agents, not human contributors](#92-the-repository-is-optimized-for-ai-agents-not-human-contributors)
    * [Prevention](#prevention-30)
  * [9.3 No maintainer succession or release continuity exists](#93-no-maintainer-succession-or-release-continuity-exists)
    * [Prevention](#prevention-31)
  * [9.4 The project collects stars rather than retained repositories](#94-the-project-collects-stars-rather-than-retained-repositories)
    * [Prevention](#prevention-32)
  * [9.5 Local-first privacy prevents learning](#95-local-first-privacy-prevents-learning)
    * [Prevention](#prevention-33)
  * [9.6 No sustainable maintenance model exists](#96-no-sustainable-maintenance-model-exists)
    * [Prevention](#prevention-34)
  * [10. Why researched projects failed, plateaued, or stopped short](#10-why-researched-projects-failed-plateaued-or-stopped-short)
  * [10.1 `kovetskiy/mark`: successful publisher, deliberate category ceiling](#101-kovetskiymark-successful-publisher-deliberate-category-ceiling)
    * [What worked](#what-worked)
    * [Why it did not solve the full category](#why-it-did-not-solve-the-full-category)
    * [Failure lesson](#failure-lesson)
  * [10.2 `hunyadi/md2conf`: technically strong, narrower adoption and one-way ceiling](#102-hunyadimd2conf-technically-strong-narrower-adoption-and-one-way-ceiling)
    * [What worked](#what-worked-1)
    * [Why it did not dominate by visibility](#why-it-did-not-dominate-by-visibility)
    * [Failure lesson](#failure-lesson-1)
  * [10.3 `markdown-confluence/markdown-confluence`: broad ecosystem, maintainer and matrix risk](#103-markdown-confluencemarkdown-confluence-broad-ecosystem-maintainer-and-matrix-risk)
    * [What worked](#what-worked-2)
    * [Why it is strategically vulnerable](#why-it-is-strategically-vulnerable)
    * [Failure lesson](#failure-lesson-2)
  * [10.4 Telefónica `markdown-confluence-sync`: credible features, low external proof](#104-telefónica-markdown-confluence-sync-credible-features-low-external-proof)
    * [What worked](#what-worked-3)
    * [Why adoption remained small](#why-adoption-remained-small)
    * [Failure lesson](#failure-lesson-3)
  * [10.5 `zeldigas/text2confl`: broad capability, positioning and packaging friction](#105-zeldigastext2confl-broad-capability-positioning-and-packaging-friction)
    * [What worked](#what-worked-4)
    * [Why it remained under the radar](#why-it-remained-under-the-radar)
    * [Failure lesson](#failure-lesson-4)
  * [10.6 `BjoernSchotte/atlcli`: closest bidirectional competitor, trust and focus gap](#106-bjoernschotteatlcli-closest-bidirectional-competitor-trust-and-focus-gap)
    * [What worked](#what-worked-5)
    * [Why it had not crossed the adoption threshold](#why-it-had-not-crossed-the-adoption-threshold)
    * [Failure lesson](#failure-lesson-5)
  * [10.7 `PatD42/confluence-bidir-sync`: ambition without distribution or evidence](#107-patd42confluence-bidir-sync-ambition-without-distribution-or-evidence)
    * [What was promising](#what-was-promising)
    * [Why it remained a prototype](#why-it-remained-a-prototype)
    * [Failure lesson](#failure-lesson-6)
  * [10.8 `iamjackg/md2cf`: useful component, lifecycle incompleteness and aging](#108-iamjackgmd2cf-useful-component-lifecycle-incompleteness-and-aging)
    * [What worked](#what-worked-6)
    * [Why it plateaued](#why-it-plateaued)
    * [Failure lesson](#failure-lesson-7)
  * [10.9 `duo-labs/markdown-to-confluence`: the legacy-star trap](#109-duo-labsmarkdown-to-confluence-the-legacy-star-trap)
    * [What worked historically](#what-worked-historically)
    * [Why it became a legacy choice](#why-it-became-a-legacy-choice)
    * [Failure lesson](#failure-lesson-8)
  * [10.10 `Workable/confluence-docs-as-code`: ecosystem fit creates a ceiling](#1010-workableconfluence-docs-as-code-ecosystem-fit-creates-a-ceiling)
    * [What worked](#what-worked-7)
    * [Why it did not become general infrastructure](#why-it-did-not-become-general-infrastructure)
    * [Failure lesson](#failure-lesson-9)
  * [10.11 `Bhacaz/docs-as-code-confluence`: easy activation, incomplete synchronization lifecycle](#1011-bhacazdocs-as-code-confluence-easy-activation-incomplete-synchronization-lifecycle)
    * [What worked](#what-worked-8)
    * [Why it stopped short](#why-it-stopped-short)
    * [Failure lesson](#failure-lesson-10)
  * [10.12 `tuanpmt/docflu`: multi-destination and AI-speed overreach](#1012-tuanpmtdocflu-multi-destination-and-ai-speed-overreach)
    * [What was attractive](#what-was-attractive)
    * [Why it carried high failure risk](#why-it-carried-high-failure-risk)
    * [Failure lesson](#failure-lesson-11)
  * [10.13 `mihaeu/cosmere`: good internals, insufficient workflow surface](#1013-mihaeucosmere-good-internals-insufficient-workflow-surface)
    * [What worked](#what-worked-9)
    * [Why it remained limited](#why-it-remained-limited)
    * [Failure lesson](#failure-lesson-12)
  * [10.14 Sphinx Confluence Builder: strong ecosystem success, bounded category](#1014-sphinx-confluence-builder-strong-ecosystem-success-bounded-category)
    * [What worked](#what-worked-10)
    * [Why it does not own generic Markdown sync](#why-it-does-not-own-generic-markdown-sync)
    * [Failure lesson](#failure-lesson-13)
  * [10.15 Confluence exporters: successful bounded tools, not synchronization failures](#1015-confluence-exporters-successful-bounded-tools-not-synchronization-failures)
    * [What worked](#what-worked-11)
    * [Why they do not solve synchronization](#why-they-do-not-solve-synchronization)
    * [Failure lesson](#failure-lesson-14)
  * [10.16 Small Actions, wrappers, and proof-of-concept projects](#1016-small-actions-wrappers-and-proof-of-concept-projects)
    * [Repeating failure pattern](#repeating-failure-pattern)
    * [Failure lesson](#failure-lesson-15)
  * [11. Unified cross-project failure archetypes](#11-unified-cross-project-failure-archetypes)
  * [11.1 Converter labeled as synchronizer](#111-converter-labeled-as-synchronizer)
  * [11.2 The legacy-star trap](#112-the-legacy-star-trap)
  * [11.3 The thin-wrapper trap](#113-the-thin-wrapper-trap)
  * [11.4 The broad-platform trap](#114-the-broad-platform-trap)
  * [11.5 The ecosystem-ceiling trap](#115-the-ecosystem-ceiling-trap)
  * [11.6 The maintainer-matrix trap](#116-the-maintainer-matrix-trap)
  * [11.7 The ambitious-README trap](#117-the-ambitious-readme-trap)
  * [11.8 The trust-without-recovery trap](#118-the-trust-without-recovery-trap)
  * [11.9 The feature-parity trap](#119-the-feature-parity-trap)
  * [11.10 The evidence-free safety trap](#1110-the-evidence-free-safety-trap)
  * [12. Failure Mode and Effects Analysis (FMEA)](#12-failure-mode-and-effects-analysis-fmea)
    * [Highest-priority interpretation](#highest-priority-interpretation)
  * [13. The anti-roadmap: what not to build first](#13-the-anti-roadmap-what-not-to-build-first)
  * [13.1 Do not build full automatic bidirectional synchronization](#131-do-not-build-full-automatic-bidirectional-synchronization)
  * [13.2 Do not support every authentication mechanism](#132-do-not-support-every-authentication-mechanism)
  * [13.3 Do not support Cloud and Data Center as equal v1 targets](#133-do-not-support-cloud-and-data-center-as-equal-v1-targets)
  * [13.4 Do not build watch mode or a hosted webhook service](#134-do-not-build-watch-mode-or-a-hosted-webhook-service)
  * [13.5 Do not sync comments, inline comments, restrictions, reactions, whiteboards, databases, or arbitrary app content](#135-do-not-sync-comments-inline-comments-restrictions-reactions-whiteboards-databases-or-arbitrary-app-content)
  * [13.6 Do not implement automatic deletion](#136-do-not-implement-automatic-deletion)
  * [13.7 Do not support every diagram language](#137-do-not-support-every-diagram-language)
  * [13.8 Do not build MCP, GUI, editor plugins, or a separate SaaS control plane](#138-do-not-build-mcp-gui-editor-plugins-or-a-separate-saas-control-plane)
  * [13.9 Do not create a generic documentation methodology product](#139-do-not-create-a-generic-documentation-methodology-product)
  * [13.10 Do not promise cross-page atomicity](#1310-do-not-promise-cross-page-atomicity)
  * [13.11 Do not optimize for huge repositories before correctness](#1311-do-not-optimize-for-huge-repositories-before-correctness)
  * [13.12 Do not build a universal plugin API before two real extensions exist](#1312-do-not-build-a-universal-plugin-api-before-two-real-extensions-exist)
  * [14. Recommended narrow product contract](#14-recommended-narrow-product-contract)
    * [v0.x beachhead](#v0x-beachhead)
  * [15. Phase gates that prevent premature complexity](#15-phase-gates-that-prevent-premature-complexity)
  * [Gate 0 — Problem validation](#gate-0--problem-validation)
    * [Required evidence](#required-evidence)
    * [Stop or pivot when](#stop-or-pivot-when)
  * [Gate 1 — Best-in-class safe one-way publisher](#gate-1--best-in-class-safe-one-way-publisher)
    * [Required evidence](#required-evidence-1)
    * [Do not advance when](#do-not-advance-when)
  * [Gate 2 — Drift detection and lifecycle correctness](#gate-2--drift-detection-and-lifecycle-correctness)
    * [Required evidence](#required-evidence-2)
  * [Gate 3 — Reverse change capture](#gate-3--reverse-change-capture)
    * [Required evidence](#required-evidence-3)
  * [Gate 4 — Pull request workflow](#gate-4--pull-request-workflow)
    * [Required evidence](#required-evidence-4)
  * [Gate 5 — Structural automatic merge](#gate-5--structural-automatic-merge)
    * [Required evidence per node class](#required-evidence-per-node-class)
  * [Gate 6 — Continuous bidirectional policy](#gate-6--continuous-bidirectional-policy)
  * [16. Changes recommended to the current project summary](#16-changes-recommended-to-the-current-project-summary)
  * [16.1 Clarify authority](#161-clarify-authority)
  * [16.2 Narrow the v1 support matrix](#162-narrow-the-v1-support-matrix)
  * [16.3 Correct the atomicity language](#163-correct-the-atomicity-language)
  * [16.4 Separate cache from state](#164-separate-cache-from-state)
  * [16.5 Add ownership modes](#165-add-ownership-modes)
  * [16.6 Remove universal claims](#166-remove-universal-claims)
  * [16.7 Add explicit evidence links](#167-add-explicit-evidence-links)
  * [16.8 Separate core and later differentiators](#168-separate-core-and-later-differentiators)
  * [17. Testing strategy designed to prevent—not document—failure](#17-testing-strategy-designed-to-preventnot-documentfailure)
  * [17.1 Test invariants, not implementation steps](#171-test-invariants-not-implementation-steps)
  * [17.2 Build an adversarial public corpus](#172-build-an-adversarial-public-corpus)
  * [17.3 Publish a compatibility laboratory](#173-publish-a-compatibility-laboratory)
  * [17.4 Use production shadow mode](#174-use-production-shadow-mode)
  * [18. Adoption and community controls](#18-adoption-and-community-controls)
  * [18.1 Recruit heterogeneous design partners](#181-recruit-heterogeneous-design-partners)
  * [18.2 Make migration a product feature](#182-make-migration-a-product-feature)
  * [18.3 Lead with proof, not ambition](#183-lead-with-proof-not-ambition)
  * [18.4 Avoid hostile competitor positioning](#184-avoid-hostile-competitor-positioning)
  * [18.5 Create contributor-sized seams](#185-create-contributor-sized-seams)
  * [19. Metrics and early-warning dashboard](#19-metrics-and-early-warning-dashboard)
  * [19.1 Activation](#191-activation)
  * [19.2 Safety](#192-safety)
  * [19.3 Fidelity](#193-fidelity)
  * [19.4 Operational health](#194-operational-health)
  * [19.5 Open-source sustainability](#195-open-source-sustainability)
    * [Red-alert thresholds](#red-alert-thresholds)
  * [20. A 90-day anti-failure execution plan](#20-a-90-day-anti-failure-execution-plan)
  * [Days 1–30: validate the wedge and prove the state model](#days-130-validate-the-wedge-and-prove-the-state-model)
  * [Days 31–60: establish safe one-way superiority](#days-3160-establish-safe-one-way-superiority)
  * [Days 61–90: prove adoption and recovery](#days-6190-prove-adoption-and-recovery)
    * [90-day success definition](#90-day-success-definition)
  * [21. Decisions that should be made now](#21-decisions-that-should-be-made-now)
  * [22. Final “do not do” checklist](#22-final-do-not-do-checklist)
  * [Conclusion](#conclusion)
  * [Appendix A — Primary project references](#appendix-a--primary-project-references)
    * [Core competitors and references](#core-competitors-and-references)
    * [Representative issue and community evidence](#representative-issue-and-community-evidence)
  * [Appendix B — One-page anti-failure operating policy](#appendix-b--one-page-anti-failure-operating-policy)
  * [Appendix C — Complete 39-project failure/ceiling map](#appendix-c--complete-39-project-failureceiling-map)
    * [Long-tail conclusion](#long-tail-conclusion)
<!-- TOC -->

## Executive summary

MarkSync is aimed at a real and persistent problem: engineering teams increasingly want documentation in Git because Git supports review, versioning, automation, and AI-assisted work, while their organizations still require Confluence for broad consumption and governance. The project is correctly focused on the hardest and most valuable part of the problem: preventing a Git-to-Confluence publishing process from silently destroying changes made in Confluence.

The project can nevertheless fail even if the core idea is valid and even if the implementation is technically sophisticated.

The most likely failure is not that Markdown cannot be converted to Confluence. Mature projects already prove that it can. The most likely failure is this causal chain:

```text
Broad category-level vision
    ↓
Too many simultaneous promises
    ↓
Long inception and architecture phase
    ↓
Late delivery of a usable narrow workflow
    ↓
Few real design partners and little production evidence
    ↓
Mocks and simple fixtures pass while real tenants expose hard edge cases
    ↓
Users encounter false conflicts, formatting loss, duplicate pages, or partial writes
    ↓
Trust is damaged before adoption becomes self-sustaining
    ↓
A single maintainer faces a large API, OS, auth, content, and packaging matrix
    ↓
Maintenance slows, Atlassian changes accumulate, and the project becomes another promising but niche or abandoned tool
```

The project’s strongest ideas—bidirectional reconciliation, stable identity, drift detection, diagrams, cross-platform binaries, CI, multiple spaces, enterprise authentication, AI-agent UX, Gherkin specifications, extensive testing, documentation guidance, and large-repository support—also form its greatest risk. Each one expands the correctness surface. Together they can turn a focused open-source CLI into a platform before it has earned one retained user cohort.

### The central pre-mortem conclusion

MarkSync fails if it tries to deliver the **end-state category vision before proving the narrow trust wedge**.

The correct wedge is not “perfect two-way synchronization.” It is:

> **Publish Markdown from Git to native Confluence pages without ever silently overwriting remote work, and explain every intended mutation before applying it.**

That wedge is valuable by itself, differentiates MarkSync from established one-way publishers, and creates the state, identity, fidelity, and operational foundation required for controlled reverse synchronization later.

### The ten highest-risk failure modes

1. **Scope explosion:** attempting bidirectional sync, all authentication methods, all operating systems, multiple Confluence variants, diagrams, large repositories, agent integrations, and educational content before the core workflow is retained in production.
2. **No validated beachhead:** building for a plausible archetype rather than five to ten real teams willing to install, test, and keep the tool in CI.
3. **Trust promise exceeds evidence:** marketing “safe two-way sync” before a public round-trip corpus, production case studies, recovery procedures, and independently verified conflict scenarios exist.
4. **Wrong state model:** relying on local cache, timestamps, paths, or titles for decisions that require durable document identity and a shared common base across clones and CI workers.
5. **Conversion masquerades as synchronization:** spending heavily on Markdown rendering while underbuilding lifecycle, concurrency, identity, recovery, and conflict semantics.
6. **AI-generated false confidence:** extensive specifications and tests validate the implementation against the team’s own assumptions rather than against real Confluence behavior.
7. **Maintainer overload:** one maintainer owns Cloud, Data Center, multiple auth schemes, Windows/macOS/Linux, converters, diagram runtimes, CI wrappers, package managers, and support.
8. **No compelling migration path:** MarkSync becomes “another publisher” that is somewhat safer but not easy enough to adopt from Mark, md2conf, custom scripts, or manual copy/paste.
9. **Failure to manage Atlassian drift:** API deprecations, authentication changes, editor representation changes, rate limits, and permissions break the tool faster than releases repair it.
10. **Silent or ambiguous data loss:** one incident involving a remote edit, macro, attachment, page move, or deletion can permanently damage the project’s reputation because safety is its core promise.

### What “failure” means in this report

A project does not need to be abandoned to have failed strategically. This report distinguishes five forms of failure:

1. **Operational failure:** the project is abandoned, unmaintained, or incompatible with current APIs.
2. **Adoption failure:** the implementation works but too few users activate or retain it.
3. **Trust failure:** users will test it but will not allow it to manage important documentation.
4. **Category-ceiling failure:** the project succeeds in a narrow niche but cannot become the default solution.
5. **Promise failure:** the README claims synchronization, bidirectionality, or fidelity that the observable implementation and evidence do not support.

Several researched projects are not failures. Mark, md2conf, Sphinx Confluence Builder, and active exporters are useful and successful within disciplined scopes. Their “failure” in this analysis means only that they did not solve or own the complete Git ↔ Confluence synchronization category. That distinction matters: MarkSync should copy their successful focus rather than dismiss them.

---

## 1. Evidence and project intent

This pre-mortem synthesizes four inputs:

1. `motivation-and-goal-notes-brain-dump.md`—the project owner’s primary statement of the problem and goals.
2. `README.md`—the cleaned project summary and current scope decisions.
3. `open-source-git-markdown-confluence-sync-report-2026-07-02.md`—the competitive inventory and user-feedback research covering 39 open-source projects.
4. `marksync-category-leadership-strategy-report-2026-07-02.md`—the analysis of successful projects and a category-leadership strategy.

The project intent can be reduced to six jobs:

1. Let Git-native and AI-heavy teams author documentation in Markdown and review it through Git workflows.
2. Publish native, readable, navigable Confluence pages for non-Git stakeholders.
3. detect Confluence-side changes before a Git publication overwrites them;
4. eventually reconcile remote changes through a common-base, reviewable process;
5. support technical documentation assets, especially text-defined diagrams;
6. make setup, CI use, cross-platform execution, and agent operation exceptionally easy.

This is a strong problem statement. The danger lies in translating all six jobs into one initial product milestone.

---

## 2. The imagined failure: a plausible retrospective from the future

The following is a deliberately pessimistic but realistic failure narrative. It is not a prediction. It is a mechanism-discovery exercise.

### 2.1 Months 0–3: the project looks exceptionally mature

The repository accumulates a North Star, a comprehensive specification, architecture decisions, Gherkin features, a canonical document model, CLI conventions, test strategy, threat model, contribution guide, and AI-agent instructions.

The project appears more complete than competing tools before production code exists. This creates two distortions:

- implementation progress is measured by artifact completeness rather than user value;
- increasingly detailed specifications make it psychologically harder to cut scope.

The initial architecture includes ports and adapters for Cloud and Data Center, multiple authentication strategies, Git providers, diagram renderers, storage format and ADF, local and shared state, semantic diffs, machine output, package managers, and future plugins. Each abstraction appears rational. Together they create a large framework whose invariants have not yet been tested against real users.

### 2.2 Months 4–8: the safe publisher is delayed by platform foundations

The team works on configuration schemas, generated clients, state migrations, canonical AST nodes, test harnesses, local caches, credential storage, and generic adapter interfaces. A simple end-to-end use case—publish ten Markdown files into one Confluence Cloud parent page—works only intermittently because the implementation is waiting for the general solution.

Competitors remain easier for users who simply need publication:

```bash
mark file.md
```

or:

```bash
md2conf docs/
```

MarkSync’s potential safety advantage is not yet available because users cannot reach a successful first sync quickly.

### 2.3 Months 9–12: bidirectional behavior is demonstrated but not proven

A demo shows:

- local edit;
- remote edit;
- pull;
- three-way merge;
- conflict marker;
- successful republish.

The demo uses headings, paragraphs, and lists. It does not represent the production surface:

- nested tables;
- macros and third-party app nodes;
- smart links;
- inline comments;
- attachments with changed filenames;
- pages moved while files are renamed;
- simultaneous CI runs;
- permissions that allow page updates but not attachment updates;
- eventual consistency after page creation;
- API normalization that changes ADF or storage XML without visual change.

The team begins describing the product as bidirectional. The term attracts attention but also raises expectations far beyond what the compatibility corpus proves.

### 2.4 Public launch: curiosity exceeds activation

The launch receives stars because the problem is recognizable and the technical ambition is interesting. However:

- setup requires understanding document IDs, mappings, state files, ownership modes, and auth choices;
- installation channels are incomplete;
- the first-run wizard cannot diagnose corporate proxies, scopes, or parent-page permissions;
- migration from Mark or md2conf is manual;
- examples target the project’s own repository rather than common enterprise layouts;
- the README leads with architecture and future bidirectionality rather than a two-minute successful outcome.

Many users star the repository but few add it to recurring CI. Stars create a false impression of product-market fit.

### 2.5 The first trust incidents

A design partner encounters a Confluence page with an unsupported macro added between two generated sections. MarkSync either:

- serializes it into an opaque block that moves to a different location;
- blocks every future publication because the page is now “unsupported”;
- or flattens it and loses behavior.

Another partner renames a Markdown file and copies it to make a template. Both files contain the same source document UUID. The tool updates the wrong page or stops with an identity collision that users do not know how to repair.

A third partner runs two CI jobs on consecutive commits. The older job applies after the newer job, or both use the same base and one fails halfway through attachments. The plan was correct at calculation time, but Confluence changed during apply.

No single incident necessarily destroys content. However, users conclude that the tool requires expert supervision, defeating the automation value proposition.

### 2.6 Maintenance load overtakes product progress

Issues arrive across:

- macOS ARM Mermaid execution;
- Windows path and certificate handling;
- Confluence Cloud API changes;
- Data Center version differences;
- OAuth scopes;
- API tokens and scoped tokens;
- reverse proxies and custom base paths;
- attachments;
- tables;
- macros;
- GitHub Actions permissions;
- lock-file merge conflicts;
- stale caches;
- version spam;
- package-manager lag.

The maintainer spends most available time reproducing environment-specific failures. The roadmap’s differentiating reverse-sync work slows. Contributors find the architecture difficult to enter, while issue reporters cannot provide minimal Confluence fixtures because their pages contain proprietary macros and content.

### 2.7 The project’s final state

MarkSync remains technically impressive, with good documentation and a small group of dedicated users. It fails to become the default because:

- simple users choose Mark or md2conf;
- Sphinx/MkDocs users choose ecosystem-native plugins;
- risk-sensitive enterprises choose one-way publication with generated-page warnings;
- teams needing reverse export use dedicated exporters;
- teams intrigued by two-way synchronization do not trust it with important pages;
- the maintainer cannot sustain the full matrix.

The repository still has stars, but releases slow, compatibility becomes uncertain, and the project joins the exact long tail it intended to surpass.

---

## 3. Strategic failure modes in the current vision

## 3.1 The project attempts to solve the market’s end state immediately

The brain dump includes or implies:

- robust two-way synchronization;
- conflict detection and Git-like merge;
- Confluence history analysis;
- multiple diagram languages;
- image attachment lifecycle;
- local and CI operation;
- multiple spaces and flexible hierarchy mapping;
- Windows, Linux, and macOS;
- large repositories and incremental operation;
- all relevant authentication scenarios;
- CLI and configuration editing;
- AI-agent operation;
- TDD, BDD, specification-driven delivery;
- mocked integration tests and live sandbox E2E tests;
- resilience to Confluence API changes;
- educational guidance for moving documentation to Git.

The cleaned README improves this by staging reverse sync and declaring non-goals, but the total ambition remains a platform-sized program.

### How this causes failure

- Time to first useful release expands.
- Every core abstraction is designed for hypothetical future variants.
- The test matrix grows multiplicatively, not additively.
- Users cannot explain the initial product in one sentence.
- Maintainer attention is spread across features that do not improve activation.
- The project competes simultaneously with publishers, exporters, migration tools, diagram plugins, agent tooling, and documentation frameworks.

### Guardrail

Define one beachhead release:

> **Confluence Cloud + local Git repository + one configured page subtree + safe Markdown publication + stable IDs + no-op updates + remote drift blocking + Mermaid images + human/JSON plan.**

Everything else must pass an explicit phase gate.

## 3.2 The source-of-truth model is semantically inconsistent

The documents state both:

- Git is the authoritative engineering workspace; and
- Confluence-native users can edit pages and their knowledge must not be lost.

These statements are compatible only if “authoritative” is defined precisely.

Possible meanings:

1. **Git is the only writable source.** Confluence edits are policy violations.
2. **Git is the approval source.** Confluence edits are proposals that must be pulled into Git and reviewed.
3. **Both are equal sources.** The tool continuously merges both.
4. **Ownership is regional or page-specific.** Some nodes/pages are Git-owned, some Confluence-owned.

The project currently leans toward model 2, but the language sometimes implies model 3.

### How this causes failure

- Users expect automatic merges when the product offers only blocking.
- Confluence users expect edits to remain live while Git reviewers expect unapproved changes not to be authoritative.
- Support teams do not know whether to edit generated pages.
- Conflict behavior appears arbitrary because policy is implicit.

### Guardrail

Make ownership a first-class configuration and page-level contract:

- `published`: Git-owned; remote edits block and are offered as a patch.
- `collaborative`: remote edits are accepted as proposals and must pass Git review.
- `unmanaged`: MarkSync never modifies the page.
- future `owned-regions`: explicit node/section ownership, only after proven.

Use “Git is the approval authority” rather than “Git is the sole source of truth” for collaborative mode.

## 3.3 The product may be technically differentiated but behaviorally hard to adopt

A user does not adopt a state machine. A user adopts an outcome:

- “My docs appear in Confluence after merge.”
- “Nobody’s edit gets overwritten.”
- “I can see exactly what will change.”

If MarkSync requires source UUIDs, page IDs, lock files, content properties, ownership policy, render profiles, target profiles, auth profiles, and conflict strategy before the first page is published, the safety architecture becomes onboarding friction.

### Guardrail

Use progressive disclosure:

```bash
marksync init
marksync login
marksync plan
marksync push
```

The default path should infer one target, one parent, and one source directory. Advanced mappings should not appear until needed.

## 3.4 The project may solve a painful edge case before proving its frequency

Remote Confluence edits are dangerous, but their frequency varies. Many teams solve the issue socially by displaying a generated-page banner and making Git authoritative. Others actively need collaborative reverse flow.

If the project assumes all target teams need full bidirectional reconciliation, it may overinvest in a rare workflow before validating the larger safe-publisher market.

### Guardrail

Measure among design partners:

- percentage of generated pages edited remotely per month;
- types of remote edits;
- percentage that must return to Git;
- acceptable delay;
- whether a block-and-notify workflow already solves the risk;
- whether Confluence users will accept a “propose change” workflow.

Build the least powerful mechanism that solves the observed workflow.

## 3.5 The educational mission can dilute the product mission

The project wants to provide a knowledge base explaining why teams should move documentation into Git. This can support adoption, but it is a separate product surface.

### Failure mechanism

- Time is spent creating a documentation methodology before the synchronizer works reliably.
- Messaging becomes ideological (“Git is superior”) rather than pragmatic (“use both safely”).
- Confluence-native stakeholders feel devalued.
- The repository becomes difficult to navigate because product docs and documentation-handbook content compete.

### Guardrail

Treat educational material as content marketing after the product has production evidence. Lead with coexistence, not conversion of everyone to Git.

---

## 4. Product and UX failure modes

## 4.1 “Two-way sync” becomes a misleading headline

The market already contains tools that call separate push and pull operations “two-way.” MarkSync aims to do better, but using the same headline before common-base tracking, conflict semantics, and round-trip evidence are stable risks the same credibility problem.

### Avoid

- claiming bidirectionality based on push + pull;
- claiming lossless round trips for arbitrary Confluence content;
- using “automatic merge” without a documented supported-node matrix;
- presenting conflict markers as proof of semantic safety.

### Do instead

Use staged language:

1. safe one-way publication;
2. remote drift detection;
3. reverse change capture;
4. reviewable reconciliation;
5. verified structural merge for supported constructs;
6. policy-controlled continuous sync.

## 4.2 The first-run experience requires enterprise knowledge

Authentication, base URLs, space keys, page IDs, scopes, content properties, and proxies are not intuitive. Many open-source tools lose users before their core capability is evaluated.

### Failure indicators

- users open setup issues rather than product issues;
- `401`, `403`, and `404` dominate support;
- users cannot tell whether the token, URL, space, or parent is wrong;
- docs require copying long YAML before the first plan.

### Prevention

`marksync doctor` should test and explain:

- tenant type and API availability;
- credential validity;
- token scopes;
- permission to read and update the target parent;
- permission to create child pages;
- permission to upload attachments;
- content-property support;
- rate-limit headers;
- proxy and CA configuration;
- diagram renderer availability;
- Git repository state.

Every failure should include the attempted operation, likely cause, remediation, and a stable machine-readable code.

## 4.3 Safety mechanisms become permanent blockers

A tool can avoid data loss by refusing almost everything. That is safe but not useful.

Examples:

- one unsupported macro blocks a 100-page subtree;
- one remote whitespace normalization creates divergence;
- a stale lock file prevents all CI runs;
- a missing attachment permission prevents body-only updates;
- a page moved by an administrator leaves the repository permanently conflicted.

### Prevention

Safety must be paired with repair workflows:

- isolate failures per document where dependencies permit;
- provide `explain`, `adopt`, `rebind`, `accept-remote`, `accept-local`, and `repair-state` commands;
- distinguish warnings from hard blocks;
- allow policy-controlled degradation, such as preserving an opaque node while continuing unrelated updates;
- always produce a deterministic conflict bundle.

## 4.4 The plan is accurate but the apply is not

The README says structural errors should mean zero writes. Confluence does not provide a transaction spanning pages and attachments. A plan can become stale between calculation and application.

### Failure mechanism

- page 1 updates;
- page 2 updates;
- attachment upload fails;
- page 3 has changed remotely since planning;
- the operation stops in a partially applied state.

Calling this “zero unsafe writes” without qualification creates an impossible guarantee.

### Prevention

Promise:

- no writes before full preflight validation;
- optimistic concurrency on each mutation;
- deterministic operation ordering;
- durable apply journal;
- idempotent retry;
- resumable and reversible operations where the API allows;
- explicit partial-apply status;
- automatic repair plan.

Do not promise cross-page atomicity.

## 4.5 Configuration flexibility becomes configuration programming

Multiple spaces, include/exclude globs, hierarchy strategies, front-matter overrides, virtual parents, target profiles, and per-document behavior can create a configuration language that is harder than the problem.

### Prevention

- one obvious default;
- schema validation with source locations;
- `marksync config set` for common changes;
- generated minimal configuration;
- `marksync explain <file>` to show why and where a file maps;
- a compiled plan that makes precedence visible;
- no hidden magic based on current working directory.

## 4.6 Machine output and human output diverge

Supporting human, JSON, NDJSON, CI annotations, and future agents can create separate code paths and inconsistent semantics.

### Prevention

Generate all outputs from one versioned internal result model. Human rendering is a view. Machine schemas are versioned and contract-tested.

## 4.7 The project name and language become inconsistent

The materials use variants such as “MarkSync,” “MarksSync,” and transcription variants. Small inconsistencies harm package names, search ranking, command names, documentation, and word of mouth.

### Prevention

Choose one canonical form now, preferably:

- project: **MarkSync for Confluence**;
- CLI: `marksync`;
- repository: `marksync-for-confluence`;
- config: `marksync.yaml`;
- state directory: `.marksync/`.

Reserve aliases and redirects where possible.

---

## 5. Synchronization-engine failure modes

## 5.1 Local cache is mistaken for authoritative state

The brain dump proposes a Git-ignored local cache. A cache is useful for performance but cannot be the only common base because:

- CI runners are ephemeral;
- different developers have different caches;
- caches are deleted;
- branches contain different source states;
- concurrent jobs cannot coordinate through private caches.

### Required state separation

**Versioned source state:**

- stable document UUID;
- mapping policy;
- optional accepted Confluence page ID;
- supported dialect/profile;
- reviewed synchronization metadata when needed.

**Remote durable state:**

- content properties identifying MarkSync ownership;
- source repository and document UUID;
- last accepted semantic hash;
- provenance metadata.

**Operational state:**

- API response cache;
- cursors;
- locks/leases;
- retry journal;
- pending events;
- local render cache.

The operational cache may be discarded without losing correctness.

## 5.2 Titles or paths leak back into identity

Even if the architecture declares stable identity, convenience code may still search by title or infer identity from path during adoption, move, or repair.

### Consequences

- duplicate pages after rename;
- updates to the wrong same-title page;
- delete-plus-create instead of move;
- broken links;
- copied source files sharing IDs;
- accidental adoption of an unrelated page.

### Prevention

- MarkSync document UUID is immutable.
- Confluence page ID is the remote identity.
- title and path are mutable attributes.
- duplicate source UUIDs are fatal before planning writes.
- title-based discovery can propose candidates but cannot silently bind.
- adoption creates a reviewable mapping change.
- state includes historical paths and parent IDs for diagnostics, not identity.

## 5.3 Confluence history is treated as a reliable event log

The brain dump suggests using page history and markers to distinguish tool changes from human changes. History is useful but insufficient:

- service accounts and automation may make changes outside MarkSync;
- author identity does not prove operation intent;
- older versions may be unavailable or normalized;
- attachment history is separate;
- comments and metadata have independent lifecycles;
- page history does not provide a Git common base automatically.

### Prevention

Use a signed or verifiable synchronization record containing:

- document UUID;
- source commit;
- remote page version;
- semantic hash of canonical content;
- renderer/converter version;
- state schema version;
- attachment manifest;
- operation ID.

History corroborates this record; it does not replace it.

## 5.4 Semantic no-op detection is wrong

Raw hashes are unreliable because Confluence may normalize output, reorder attributes, or rewrite equivalent structures. A false change causes version spam. A false no-op is worse: it skips a real update.

### Prevention

Maintain separate hashes:

- raw source hash;
- canonical source semantic hash;
- rendered remote payload hash;
- normalized remote semantic hash;
- attachment content hashes;
- renderer configuration/version hash.

Test both directions:

- semantically equivalent changes should become no-op;
- semantically distinct changes must never become no-op.

## 5.5 Line-based Markdown merge is presented as semantic merge

Converting remote content to Markdown and invoking a standard three-way text merge is useful as a fallback, but it is not a general semantic merge.

It fails on:

- tables;
- list renumbering;
- normalized links;
- moved sections;
- opaque macros;
- images and attachment references;
- generated diagram blocks;
- metadata and restrictions;
- equivalent Markdown syntax.

### Prevention

- build a canonical intermediate representation;
- identify nodes structurally;
- calculate semantic diffs;
- merge only node classes with proved rules;
- degrade to explicit conflict bundles for unsupported changes;
- provide rendered previews of base/local/remote/result;
- never call a successful text merge “safe” unless validation passes.

## 5.6 Unsupported content cannot be both invisible and safe

Opaque preservation is necessary, but it has costs:

- raw blocks make Markdown unpleasant;
- location anchors can become invalid when surrounding content moves;
- Confluence may change the opaque node during editing;
- copied pages may duplicate internal IDs;
- nested macros may reference attachments or app data.

### Prevention

Classify every node:

- exact round-trip;
- semantically equivalent;
- publish-only;
- pull-only;
- opaque preserved;
- unsupported/blocking.

Publish the matrix. Store opaque content in sidecars or protected blocks with stable anchors. Never imply that “preserved” means “editable in Markdown.”

## 5.7 Deletion semantics create a catastrophic edge

A missing file can result from `git rm`, a changed glob, sparse checkout, branch difference, build failure, permission loss, or a moved page. Automatic deletion based on absence is unsafe.

### Prevention

- no automatic deletion in the first release;
- require explicit deletion intent from Git history or a manifest;
- show delete operations separately in plans;
- require policy or confirmation;
- archive/quarantine before trash;
- retain provenance and restore instructions;
- refuse bulk deletion when scope changes unexpectedly;
- set safety thresholds such as “more than N or X% deletions requires explicit override.”

## 5.8 Concurrent runs cause stale-base writes

Two CI jobs can plan against the same remote version. Local runs and webhooks can overlap. Retrying `409` responses blindly can overwrite newer content.

### Prevention

- optimistic concurrency with page version checks;
- repository/target lease where possible;
- operation IDs and deduplication;
- stale-plan expiry;
- re-plan before retrying a semantic conflict;
- serialized mutation per page tree;
- CI concurrency groups in provided templates;
- repair after interrupted runs.

## 5.9 Large-repository optimization compromises correctness

The brain dump proposes timestamps and local caching to avoid fetching everything. Timestamps can be coarse or misleading; permissions may hide changes; remote metadata may change independently.

### Prevention

Use layered discovery:

1. durable known-page mapping;
2. remote page version and content-property checks;
3. webhooks/cursors where available;
4. bounded pagination;
5. semantic fetch only when metadata indicates change;
6. periodic full reconciliation as repair.

Never use modification timestamp alone as proof of equality.

---

## 6. Content, attachment, and diagram failure modes

## 6.1 Markdown support becomes an undefined promise

“Markdown” can mean CommonMark, GitHub Flavored Markdown, Obsidian syntax, MkDocs extensions, Docusaurus MDX, MyST, custom front matter, and embedded HTML.

### Failure mechanism

A user sees “Markdown supported,” then tables, alerts, footnotes, tabs, includes, or HTML fail. Every unsupported extension becomes a bug report.

### Prevention

- name the supported dialect precisely;
- maintain a public compatibility matrix;
- validate source before publication;
- warn or fail on unsupported syntax rather than silently flattening;
- version rendering profiles;
- add extensions through isolated adapters after demand is demonstrated.

## 6.2 Conversion fidelity is evaluated textually, not visually or semantically

Golden payload files can pass while Confluence renders broken layouts. Conversely, payloads can change while visual output remains equivalent.

### Prevention

Use three test dimensions:

1. canonical structural comparison;
2. remote payload golden tests;
3. rendered screenshot or browser-level assertions on real tenants.

Measure manual cleanup minutes per 100 pages, not only test pass count.

## 6.3 Attachments are treated as a helper feature

Attachments have their own identity, versions, names, hashes, permissions, and deletion lifecycle. Image references may be relative, remote, generated, reused, or renamed.

### Failure outcomes

- duplicated attachments on every run;
- stale files remain forever;
- a renamed image breaks historical links;
- attachment upload failure leaves a page referencing a missing file;
- same-name different-content collisions;
- deletion of a manually attached file;
- incorrect MIME type or SVG restrictions.

### Prevention

Model attachments as first-class managed entities with:

- stable logical ID;
- remote attachment ID;
- source path and content hash;
- generated-source hash;
- renderer version;
- reference count;
- ownership marker;
- explicit cleanup policy.

Never delete attachments that are not provably MarkSync-owned.

## 6.4 Diagram rendering breaks the single-binary promise

Mermaid commonly requires Node.js, `mmdc`, and Chromium. PlantUML may require Java or a server. D2 and Graphviz add more binaries. Container and native execution differ.

### Failure mechanism

The core CLI is a single Go binary, but the first useful document fails because a renderer is missing or incompatible with macOS ARM, Windows, sandboxed CI, or corporate download policies.

### Prevention

For the initial release:

- support Mermaid only;
- provide explicit renderer modes: local executable, container, or remote service;
- make renderer detection part of `doctor`;
- pin and record renderer versions;
- hash source + renderer version + theme + config;
- cache outputs deterministically;
- provide a no-render policy that blocks or preserves the code block explicitly;
- do not claim zero dependencies when diagrams require dependencies.

## 6.5 Diagram images are deterministic only in theory

Font versions, Chromium versions, themes, locale, and rendering dimensions can change binary output without source changes.

### Prevention

Use reproducible rendering images, pinned fonts, normalized metadata, and semantic source hashes. Do not upload a new version solely because non-semantic image metadata changed.

---

## 7. Authentication, platform, and enterprise failure modes

## 7.1 “All possible authentication scenarios” is an unbounded requirement

Confluence Cloud and Data Center expose different mechanisms. Enterprises add proxies, SSO gateways, custom CAs, token brokers, and restricted egress.

### Failure mechanism

The project spends disproportionate effort on rare auth environments before the core product is stable, yet still cannot honestly claim universal support.

### Prevention

Publish a support matrix:

**Initial:**

- Confluence Cloud API token/basic email combination or currently recommended token flow;
- environment variables and OS keyring;
- non-interactive CI secrets;
- custom CA/proxy support where the Go HTTP stack allows.

**Later:**

- OAuth 2.0 browser login;
- scoped tokens;
- Data Center PAT/basic variants;
- custom auth header plugin.

Unsupported enterprise gateways should have an adapter interface, not built-in promises.

## 7.2 Cloud and Data Center are treated as minor variants

They differ in API availability, content representations, auth, versions, macro behavior, and operational environments.

### Prevention

Choose one primary platform for v1. A Data Center adapter should have its own compatibility matrix and maintainers. “Compiles” is not “supported.”

## 7.3 Atlassian API drift is handled reactively

Research across existing projects repeatedly found breakage from REST v1/v2 changes, scoped tokens, auth variations, and version-specific behavior.

### Prevention

- nightly live-tenant smoke tests;
- API deprecation watch;
- generated-client isolation behind adapters;
- recorded API fixtures with sanitization;
- compatibility dashboard;
- rapid patch-release process;
- feature flags for endpoints;
- no core logic coupled directly to transport DTOs.

## 7.4 Rate limits and permission asymmetry surface late

A token may read pages but not properties, update pages but not attachments, or see only part of a tree. Bulk operations may trigger rate limits.

### Prevention

- capability discovery during `doctor`;
- adaptive concurrency;
- retry classification;
- `Retry-After` compliance;
- operation budgets in plans;
- permission-denied distinctions from not-found;
- partial visibility warnings;
- no deletion or orphan decisions when visibility is incomplete.

---

## 8. Delivery-model failure modes

## 8.1 The project remains in inception indefinitely

The repository currently has rich inception material and no production code. This is appropriate briefly but can become analysis paralysis.

### Early signals

- more architecture documents than executable acceptance tests;
- repeated rewriting of the North Star;
- no external user has completed a sync;
- schema and plugin debates before a working page publish;
- roadmap dates move while scope grows.

### Prevention

Set a hard inception exit criterion:

- one real Confluence Cloud sandbox;
- one repository;
- ten representative documents;
- `init → plan → push → second-run no-op` working end to end;
- public known limitations;
- one external design partner running it.

## 8.2 TDD and BDD become ceremony rather than evidence

Gherkin is valuable when scenarios express business behavior. It fails when every low-level method or parser case is wrapped in Given/When/Then.

### Failure mechanism

- duplicated tests at several layers;
- brittle step definitions;
- slow suites;
- AI generates large volumes of tautological scenarios;
- maintainers update prose and implementation together without independent validation;
- passing tests increase confidence without increasing coverage of real platform behavior.

### Prevention

Use Gherkin only for high-value lifecycle invariants, such as:

- remote drift blocks a push;
- rename preserves page identity;
- duplicate document IDs block all writes;
- interrupted apply resumes safely;
- unsupported remote node is preserved or blocks explicitly;
- second identical run performs zero writes.

Use ordinary unit, property, golden, fuzz, integration, and live tests where they fit better.

## 8.3 AI-assisted delivery amplifies specification errors

AI can implement a wrong model consistently and quickly. A complete specification is not proof that the specification reflects Confluence reality.

### Failure mechanism

- AI creates adapters that perfectly match mocked responses but mishandle real pagination or normalization;
- generated tests assert generated behavior;
- abstractions multiply because agents optimize local tasks;
- security-sensitive logging leaks tokens or content;
- dependencies are added without supply-chain review;
- code becomes hard for human contributors to understand.

### Prevention

- humans own invariants, threat decisions, and acceptance evidence;
- every feature must include a real-tenant fixture or explain why not;
- generated code is reviewed against the protocol, not only tests;
- architecture fitness functions limit dependency directions and complexity;
- mutation testing checks test strength;
- fuzzing targets parsers and state transitions;
- dependency and license policies are automated;
- AI-authored PRs remain small and independently reviewable.

## 8.4 Mocked Confluence integration becomes the dominant test layer

Mocks are fast but encode assumptions. The most dangerous defects occur where assumptions differ from real tenants.

### Prevention

Maintain a test pyramid with a wide middle, not a mock monoculture:

- unit tests for canonical transformations and state decisions;
- property/fuzz tests for round-trip and parser stability;
- contract tests against recorded/sanitized API interactions;
- integration tests against a realistic fake server for failure injection;
- nightly Cloud E2E tests;
- scheduled Data Center tests only when supported;
- browser/render tests for critical content;
- design-partner canaries before broad release.

## 8.5 Live E2E space creation is brittle and over-privileged

Creating and deleting a space per suite may require permissions ordinary users do not have, run slowly, and trigger rate limits. Cleanup failure leaves pollution.

### Prevention

Use a dedicated test space with run-scoped parent pages by default. Reserve full-space lifecycle tests for a smaller privileged suite. Tag all test content and run a janitor process with safeguards.

## 8.6 The architecture is optimized for hypothetical adapters

Ports and adapters are appropriate, but every interface has a cost. Premature generalization can hide the actual semantic differences between Cloud, Data Center, ADF, storage format, and Git providers.

### Prevention

- create an interface only after two implementations or a clear test seam require it;
- keep the canonical decision engine pure;
- allow platform adapters to expose capability differences explicitly;
- avoid lowest-common-denominator interfaces;
- document invariants and state transitions before plugin APIs.

---

## 9. Open-source and organizational failure modes

## 9.1 One maintainer owns a combinatorial support matrix

The previous research repeatedly found one-maintainer projects, slowed releases, and explicit maintainer succession risk. MarkSync’s proposed matrix is larger than most competitors.

### The matrix multiplies across

- Cloud / Data Center versions;
- ADF / storage format;
- auth modes;
- Windows / macOS / Linux;
- amd64 / arm64;
- direct binary / Docker / Action / package managers;
- Markdown dialects;
- diagram renderers;
- local / CI / agent operation;
- GitHub / GitLab / Bitbucket / Azure DevOps workflows.

### Prevention

- sharply limit the supported matrix per release;
- distinguish “works,” “tested,” and “supported”;
- automate release and compatibility testing;
- recruit adapter maintainers;
- create a governance path before popularity;
- use an organization-controlled repository and release credentials;
- fund maintenance before the issue load becomes unsustainable.

## 9.2 The repository is optimized for AI agents, not human contributors

A large specification hierarchy, generated artifacts, custom delivery framework, and agent instructions may be powerful for the owner but intimidating to outside contributors.

### Prevention

A new human contributor should understand:

- the user problem;
- the safety contract;
- the core state machine;
- how to run tests;
- where to add a fixture;
- how to make one small change;

within one hour. Keep contributor paths independent of ADOS expertise.

## 9.3 No maintainer succession or release continuity exists

The `markdown-confluence` case demonstrates that recent commits do not guarantee future ownership.

### Prevention

- bus-factor target of at least three for v1;
- documented release process;
- organization-owned secrets and package accounts;
- CODEOWNERS by subsystem;
- regular maintainer rotation;
- funding and sponsorship policy;
- security-response process;
- explicit archival/succession policy.

## 9.4 The project collects stars rather than retained repositories

Historical projects retain hundreds of stars after maintenance slows. Stars measure discovery and intent, not trust or recurring value.

### Prevention

Track:

- successful first plans;
- successful first pushes;
- second-run no-op rate;
- repositories retained after 30 and 90 days;
- pages under management;
- CI installations;
- remote edits detected before overwrite;
- conflicts resolved;
- manual cleanup time;
- public production references;
- active non-maintainer contributors.

Privacy-sensitive telemetry should be opt-in, aggregated, and transparent. Supplement it with voluntary diagnostics and design-partner reporting.

## 9.5 Local-first privacy prevents learning

No default telemetry is a good trust posture, but zero usage evidence makes it difficult to improve activation and reliability.

### Prevention

Offer:

- explicit opt-in anonymous metrics;
- `marksync diagnostics --export` with redaction;
- voluntary compatibility reports;
- public fixture contributions;
- design-partner check-ins;
- a self-hostable metrics schema if enterprises want it.

## 9.6 No sustainable maintenance model exists

A high-trust integration tool requires continuous compatibility work even when new features stop. Pure volunteer maintenance may not sustain it.

### Prevention

Keep the engine open source while allowing sustainable paid layers:

- support contracts;
- managed webhook/control plane;
- enterprise policy dashboard;
- supported Data Center matrix;
- custom macro adapters;
- migration services;
- organization audit reporting;
- hosted PR automation.

Do not wait for burnout before considering funding.

---

## 10. Why researched projects failed, plateaued, or stopped short

This section distinguishes **project failure** from **failure to own the complete category**.

## 10.1 `kovetskiy/mark`: successful publisher, deliberate category ceiling

Repository: <https://github.com/kovetskiy/mark>

### What worked

- one-sentence value proposition;
- standalone Go binary;
- CI-friendly operation;
- document-local metadata;
- diagrams, attachments, macros, and includes;
- visible long-term maintenance;
- broad recognition and approximately 1,500 stars.

### Why it did not solve the full category

- one-way authority model;
- remote edits are not reconciled;
- HTML-comment metadata can be intrusive;
- attachment replacement and lifecycle have produced real issues;
- rename, move, and deletion semantics are not the central product model;
- breadth produces a significant issue backlog.

### Failure lesson

Mark did not fail by being narrow; it succeeded because it was narrow. MarkSync fails if it tries to beat Mark on every publishing feature before proving the safety wedge. The route to leadership is not immediate feature parity. It is compatibility with the common publishing path plus superior identity, drift detection, planning, and recovery.

## 10.2 `hunyadi/md2conf`: technically strong, narrower adoption and one-way ceiling

Repository: <https://github.com/hunyadi/md2conf>

### What worked

- modern REST API v2 awareness;
- rich content support;
- hierarchy and child ordering;
- relative-link rewriting;
- page-ID support and conflict warnings;
- library and CLI modes;
- strong technical credibility.

### Why it did not dominate by visibility

- Python runtime/dependency friction compared with a static binary;
- standards-oriented parsing can reject informal Markdown users expect to work;
- enterprise proxy and custom-header cases expand support effort;
- fewer independent community narratives than Mark;
- no reverse reconciliation.

### Failure lesson

Technical completeness does not automatically produce category visibility. Installation, naming, a sharp narrative, and independent case studies matter. MarkSync must not assume superior architecture will market itself.

## 10.3 `markdown-confluence/markdown-confluence`: broad ecosystem, maintainer and matrix risk

Repository: <https://github.com/markdown-confluence/markdown-confluence>

### What worked

- ADF-native strategy;
- CLI, npm library, Docker, GitHub Action, and Obsidian integration;
- directory mirroring and page movement;
- attachment hashing;
- active users and multiple distribution surfaces.

### Why it is strategically vulnerable

- public search for maintainer guidance/succession;
- large matrix across npm, Docker, Action, Obsidian, platforms, and Confluence APIs;
- API migration and auth breakage;
- environment-specific Mermaid failures;
- unresolved requests for no-op detection, macros, image sizing, and hierarchy options;
- no true bidirectional synchronization.

### Failure lesson

Every new surface creates permanent maintenance liability. MarkSync should build one core and thin wrappers, and should not launch an Obsidian plugin, MCP server, GitHub Action-specific logic, and package-manager-specific behavior as separate products.

## 10.4 Telefónica `markdown-confluence-sync`: credible features, low external proof

Repository: <https://github.com/Telefonica/confluence-tools>

### What worked

- tree, flat, and explicit page-ID modes;
- deletion/reconciliation;
- Docusaurus support;
- dry-run behavior;
- company-backed origin.

### Why adoption remained small

- project discoverability is diluted inside a broader monorepo;
- sparse independent feedback;
- compatibility has historically been framed around specific Confluence versions;
- deletion creates a high trust threshold;
- relationship between older Action and monorepo can confuse adopters;
- no reverse reconciliation.

### Failure lesson

Company origin and feature breadth do not replace a standalone product identity, release story, and external case studies. Destructive features must be paired with unusually strong safety evidence.

## 10.5 `zeldigas/text2confl`: broad capability, positioning and packaging friction

Repository: <https://github.com/zeldigas/text2confl>

### What worked

- Markdown and AsciiDoc;
- Cloud, Server, and Data Center;
- page trees, virtual pages, orphans, profiles, and extensions;
- active releases;
- both publish and export commands.

### Why it remained under the radar

- reverse export is not common-base synchronization;
- Kotlin/JVM is heavier for a small CI tool;
- broad platform and format scope complicates the message;
- sparse independent commentary;
- extension power increases setup and test surface.

### Failure lesson

Breadth can hide the primary job. MarkSync should not use “supports both directions” when the directions are independent operations without a shared synchronization protocol.

## 10.6 `BjoernSchotte/atlcli`: closest bidirectional competitor, trust and focus gap

Repository: <https://github.com/BjoernSchotte/atlcli>

### What worked

- explicit pull, push, watch, webhook, base tracking, conflict strategies, and three-way merge;
- stable IDs in front matter;
- unknown-macro preservation intent;
- Cloud and Data Center;
- polished CLI narrative;
- plugin system and broader Atlassian operations.

### Why it had not crossed the adoption threshold

- young project and small user base;
- most evidence is maintainer-reported;
- local-directory synchronization is not a complete Git branch/PR workflow;
- broad Atlassian platform positioning dilutes the Confluence sync wedge;
- Bun/TypeScript standalone packaging can create trust and environment questions;
- watch mode is technically impressive but not the most common enterprise CI workflow;
- semantic safety of text merging after conversion remains unproven;
- attachments, moves, comments, and concurrent hierarchy changes need deeper evidence.

### Failure lesson

Implementing the headline feature is not enough. The market needs proof that the feature is safe under ugly lifecycle scenarios. MarkSync should beat atlcli with evidence, Git workflow integration, and narrow positioning—not merely another three-way merge claim.

## 10.7 `PatD42/confluence-bidir-sync`: ambition without distribution or evidence

Repository: <https://github.com/PatD42/confluence-bidir-sync>

### What was promising

- recognizes the need for three-way conflict detection;
- claims preservation beyond page body;
- has a direct problem-space name.

### Why it remained a prototype

- negligible adoption;
- limited external validation;
- package/distribution maturity lagged the README claims;
- preservation claims were large relative to observable maturity;
- no established release, governance, or production references.

### Failure lesson

A credible README cannot substitute for installable releases, fixtures, case studies, and maintenance. Do not publish ambitious claims before a user can reproduce them.

## 10.8 `iamjackg/md2cf`: useful component, lifecycle incompleteness and aging

Repository: <https://github.com/iamjackg/md2cf>

### What worked

- small library plus CLI;
- two-pass relative-link handling;
- page and attachment publication;
- dry run and practical configuration.

### Why it plateaued

- rename can leave old pages behind;
- lifecycle semantics are incomplete;
- release cadence slowed;
- older storage assumptions need current validation;
- no reverse reconciliation.

### Failure lesson

Page-body correctness does not compensate for wrong lifecycle behavior. Renames, moves, and duplicates are core synchronization features, not post-MVP polish.

## 10.9 `duo-labs/markdown-to-confluence`: the legacy-star trap

Repository: <https://github.com/duo-labs/markdown-to-confluence>

### What worked historically

- simple front-matter model;
- commit-based changed-file selection;
- CI and Docker use;
- good timing in the docs-as-code adoption wave.

### Why it became a legacy choice

- low recent activity;
- high stars outlived current compatibility evidence;
- limited tree lifecycle;
- older API assumptions;
- no reverse synchronization.

### Failure lesson

A project can appear successful in search while being operationally obsolete. MarkSync must publish current compatibility and retained-use evidence, not rely on accumulated stars.

## 10.10 `Workable/confluence-docs-as-code`: ecosystem fit creates a ceiling

Repository: <https://github.com/Workable/confluence-docs-as-code>

### What worked

- strong fit for MkDocs users;
- incremental publication;
- images, diagrams, links, code macros, and restrictions.

### Why it did not become general infrastructure

- navigation and source selection are coupled to MkDocs;
- nested hierarchy behavior is limited;
- only configured navigation pages are published;
- no reverse flow.

### Failure lesson

Framework integration can create strong adoption within a niche but prevents category breadth. MarkSync should integrate with frameworks through importers or profiles, not make one framework its core model.

## 10.11 `Bhacaz/docs-as-code-confluence`: easy activation, incomplete synchronization lifecycle

Repository: <https://github.com/Bhacaz/docs-as-code-confluence>

### What worked

- low-friction GitHub Action;
- simple folder-to-page mental model;
- independent tutorial validating ease of setup;
- approximately 55 stars.

### Why it stopped short

Its own backlog exposed missing essentials:

- rename handling;
- page moves;
- deletion;
- skip unchanged pages;
- source-version provenance;
- remote image handling.

### Failure lesson

Easy setup earns trials, but lifecycle correctness earns retention. MarkSync needs both and must not postpone no-op behavior or identity until after adoption.

## 10.12 `tuanpmt/docflu`: multi-destination and AI-speed overreach

Repository: <https://github.com/tuanpmt/docflu>

### What was attractive

- multiple destinations;
- broad diagram support;
- incremental state and dry run;
- Docusaurus focus.

### Why it carried high failure risk

- built very quickly using AI coding tools;
- “bidirectional” terminology could be interpreted more broadly than implemented;
- no mature release/governance history;
- no substantial independent validation;
- multiple target systems multiply platform-specific fidelity problems.

### Failure lesson

AI speed and multi-platform breadth are not credibility. Precise claims, narrow scope, and independent evidence are more valuable than an impressive feature list.

## 10.13 `mihaeu/cosmere`: good internals, insufficient workflow surface

Repository: <https://github.com/mihaeu/cosmere>

### What worked

- no-op update behavior;
- attachment cleanup;
- compact architecture;
- direct storage conversion.

### Why it remained limited

- no rich repository hierarchy;
- partial Markdown support;
- limited recent releases;
- no pull/conflict model.

### Failure lesson

A technically sound converter can still fail as a workflow product. Users adopt complete repository outcomes, not only clean rendering internals.

## 10.14 Sphinx Confluence Builder: strong ecosystem success, bounded category

Repository: <https://github.com/sphinx-contrib/confluencebuilder>

### What worked

- leverage of the Sphinx ecosystem;
- professional documentation;
- long-lived maintenance;
- extension architecture;
- Cloud and Data Center awareness;
- clear compatibility promise.

### Why it does not own generic Markdown sync

- source model is Sphinx/MyST, not arbitrary repository Markdown;
- generated output model is publisher-oriented;
- no general Git ↔ Confluence conflict workflow.

### Failure lesson

Long-term success comes from deep compatibility with a clear ecosystem. MarkSync needs equally clear boundaries and documentation quality.

## 10.15 Confluence exporters: successful bounded tools, not synchronization failures

Key repositories:

- <https://github.com/Spenhouet/confluence-markdown-exporter>
- <https://github.com/gkoos/confluence2md>
- <https://github.com/meridius/confluence-to-markdown>

### What worked

- emotionally strong anti-lock-in and migration need;
- bounded one-time or incremental export job;
- hierarchy, links, and attachments;
- searchable repository names;
- easy proof of value: inspect the exported files.

### Why they do not solve synchronization

- export does not track a shared common base;
- generated Markdown is not necessarily suitable for publishing back;
- no conflict policy;
- no lifecycle mapping across both sides;
- archived HTML-export tools depend on brittle conversion and cleanup.

### Failure lesson

Bounded migration jobs are easier to trust because failure is visible and reversible. MarkSync should make reverse capture inspectable like an exporter before allowing it to mutate Git or Confluence.

## 10.16 Small Actions, wrappers, and proof-of-concept projects

The research found many small uploaders and wrappers, including GitHub Actions, MkDocs plugins, build-tool plugins, Obsidian integrations, and historical proofs of concept.

### Repeating failure pattern

- thin wrapper around conversion and API update;
- no durable state model;
- page matching by title;
- no lifecycle semantics;
- no current API maintenance;
- no releases or package distribution;
- little independent use;
- project tied to one employer’s or author’s exact workflow;
- no governance after the original need ends.

### Failure lesson

MarkSync should not measure itself against whether it can publish a page. That capability is commoditized. It must measure whether it can maintain a trustworthy lifecycle over years.

---

## 11. Unified cross-project failure archetypes

## 11.1 Converter labeled as synchronizer

**Symptoms:** create/update page, maybe recursive traversal, no common base, no stable lifecycle state.  
**Consequence:** users expect safety that does not exist.  
**Seen in:** much of the long tail and projects with separate push/pull commands.  
**MarkSync guardrail:** reserve “synchronization” for identity + versions + state + conflicts + lifecycle + recovery.

## 11.2 The legacy-star trap

**Symptoms:** high star count, old releases, outdated API assumptions, few current production references.  
**Consequence:** users discover but do not retain the project.  
**Seen in:** duo-labs and other older tools.  
**Guardrail:** publish compatibility dates, nightly status, retained repositories, and release cadence.

## 11.3 The thin-wrapper trap

**Symptoms:** easy GitHub Action, minimal code, happy-path upload.  
**Consequence:** activation is good; rename, deletion, no-op, and conflicts fail later.  
**Seen in:** several small Actions.  
**Guardrail:** never let packaging substitute for lifecycle correctness.

## 11.4 The broad-platform trap

**Symptoms:** Confluence plus Jira, DOCX, audits, templates, multiple destinations, plugins, watch mode.  
**Consequence:** primary value becomes unclear and maintenance fragments.  
**Seen in:** atlcli and docflu risk this pattern.  
**Guardrail:** Confluence document synchronization remains the only core until category leadership is established.

## 11.5 The ecosystem-ceiling trap

**Symptoms:** excellent Sphinx, MkDocs, Obsidian, or Docusaurus integration.  
**Consequence:** strong niche, weak generality.  
**Guardrail:** core model remains repository-neutral; ecosystem support is implemented as profiles/importers.

## 11.6 The maintainer-matrix trap

**Symptoms:** CLI, library, Docker, Action, editor plugin, several OSes, multiple APIs, several auth modes.  
**Consequence:** releases slow and contributors wait.  
**Seen in:** markdown-confluence’s succession risk.  
**Guardrail:** one core, generated wrappers, explicit support tiers, distributed ownership.

## 11.7 The ambitious-README trap

**Symptoms:** claims exceed installability, package maturity, fixtures, and users.  
**Consequence:** credibility falls when early adopters discover limitations.  
**Seen in:** prototype bidirectional tools.  
**Guardrail:** every headline claim links to a reproducible scenario and compatibility evidence.

## 11.8 The trust-without-recovery trap

**Symptoms:** dry run exists, but partial apply, state corruption, or mapping mistakes have no repair commands.  
**Consequence:** users keep backups and supervise every run.  
**Guardrail:** recovery is part of every feature definition.

## 11.9 The feature-parity trap

**Symptoms:** roadmap attempts to match every Mark/md2conf content feature before differentiation.  
**Consequence:** late release and no reason to migrate.  
**Guardrail:** support the common 80% plus a unique safety contract; add long-tail syntax from real blocked adoptions.

## 11.10 The evidence-free safety trap

**Symptoms:** many tests, no real-tenant corpus or production case study.  
**Consequence:** the market treats safety claims as marketing.  
**Guardrail:** public fixtures, live compatibility dashboard, incident policy, and quantified case studies.

---

## 12. Failure Mode and Effects Analysis (FMEA)

Scales:

- **Probability (P):** 1 rare, 5 very likely without intervention.
- **Impact (I):** 1 minor, 5 existential.
- **Detection difficulty (D):** 1 obvious early, 5 likely discovered late.
- **Risk priority number (RPN):** `P × I × D`.

| # | Failure mode | P | I | D | RPN | Earliest useful control |
|---:|---|---:|---:|---:|---:|---|
| 1 | No real design partners before architecture hardens | 5 | 5 | 4 | 100 | Recruit 5–10 teams before locking the state/config model |
| 2 | Round-trip safety assumed from simple fixtures | 4 | 5 | 5 | 100 | Public adversarial corpus and real-tenant cycles |
| 3 | Wrong shared-state/common-base design | 4 | 5 | 4 | 80 | Prove clone/CI/concurrency scenarios before reverse sync |
| 4 | Stable IDs fail on copy/rename/move/adoption | 4 | 5 | 4 | 80 | Lifecycle acceptance suite and duplicate-ID blocks |
| 5 | AI-generated tests validate wrong assumptions | 4 | 5 | 4 | 80 | Contract/live tests, human invariant review, mutation tests |
| 6 | Maintainer burnout from support matrix | 4 | 5 | 4 | 80 | Narrow v1 matrix, co-maintainers, release automation |
| 7 | Silent data loss or unintended overwrite | 3 | 5 | 5 | 75 | Zero-overwrite invariant, optimistic concurrency, recovery journal |
| 8 | False no-op skips real changes | 3 | 5 | 5 | 75 | Semantic hash adversarial tests and live verification |
| 9 | Scope explosion delays useful release | 5 | 5 | 3 | 75 | Anti-roadmap and phase gates |
| 10 | Product is “another publisher” with no migration reason | 4 | 5 | 3 | 60 | Drift-safety wedge and migration tools |
| 11 | Bidirectional claim precedes evidence | 3 | 5 | 4 | 60 | Staged terminology and experimental labels |
| 12 | Direct-edit ownership policy remains ambiguous | 5 | 4 | 3 | 60 | Explicit managed/collaborative/unmanaged modes |
| 13 | Partial writes contradict atomicity promise | 3 | 5 | 4 | 60 | Resumable apply journal and accurate safety language |
| 14 | No sustainable funding or maintainer succession | 3 | 4 | 5 | 60 | Governance and funding plan before large adoption |
| 15 | API drift breaks production unexpectedly | 4 | 4 | 4 | 64 | Nightly tenant tests and deprecation monitoring |
| 16 | Attachment lifecycle corrupts references or content | 4 | 4 | 4 | 64 | First-class attachment model and ownership markers |
| 17 | Local cache treated as correctness state | 4 | 4 | 4 | 64 | Hybrid durable state model |
| 18 | Unsupported macro preservation fails across cycles | 4 | 4 | 4 | 64 | Opaque-node round-trip corpus and explicit classifications |
| 19 | Text merge creates semantically bad result | 3 | 5 | 4 | 60 | Structural merge only for verified node types |
| 20 | Auth/proxy friction blocks activation | 4 | 4 | 3 | 48 | `doctor`, supported matrix, actionable errors |
| 21 | Gherkin/test ceremony slows delivery | 4 | 3 | 4 | 48 | Restrict BDD to lifecycle behavior |
| 22 | Live E2E suite is flaky or over-privileged | 4 | 4 | 3 | 48 | Run-scoped pages, smaller privileged suite |
| 23 | Git PR workflow is missing from reverse flow | 4 | 4 | 3 | 48 | Define patch/branch/PR integration before calling it Git-native |
| 24 | Deletion acts on incomplete scope | 2 | 5 | 5 | 50 | No deletion MVP, thresholds, archive-first |
| 25 | Machine/human output contracts diverge | 3 | 3 | 4 | 36 | Single versioned result model |
| 26 | Cross-platform packaging consumes roadmap | 4 | 3 | 3 | 36 | Automated releases; support only tested combinations |
| 27 | Data Center support doubles complexity too early | 3 | 4 | 3 | 36 | Cloud-first; separate adapter ownership |
| 28 | Large-repo optimization creates stale decisions | 3 | 4 | 4 | 48 | Correctness-first discovery and periodic reconciliation |
| 29 | Mermaid dependency breaks first run | 4 | 3 | 3 | 36 | Renderer profiles and `doctor` |
| 30 | Configuration becomes a programming language | 4 | 3 | 3 | 36 | Minimal defaults, explain command, schema |
| 31 | No telemetry means no activation insight | 3 | 3 | 4 | 36 | Opt-in metrics and design-partner reporting |
| 32 | Documentation evangelism distracts from product | 3 | 3 | 2 | 18 | Defer handbook expansion until case studies |
| 33 | Naming inconsistency harms search/distribution | 3 | 2 | 2 | 12 | Canonical naming decision now |
| 34 | Security incident through logs or dependencies | 2 | 5 | 4 | 40 | Redaction tests, SBOM, signing, dependency policy |
| 35 | Real tenant macros are proprietary and unreproducible | 4 | 3 | 4 | 48 | Sanitized fixture format and plugin mechanism later |
| 36 | Rate limits make full reconciliation impractical | 3 | 4 | 3 | 36 | Incremental checkpoints, adaptive concurrency, budgets |
| 37 | Page restrictions/permissions cause false orphan decisions | 3 | 5 | 4 | 60 | Visibility completeness checks; block destructive decisions |
| 38 | Lock/state schema changes strand existing users | 3 | 4 | 4 | 48 | Versioned schema and migration command |
| 39 | Public launch occurs before support capacity exists | 3 | 4 | 3 | 36 | Private alpha and staged launch |
| 40 | Project optimizes for owner workflow only | 4 | 4 | 3 | 48 | Diverse design partners and adoption corpus |

### Highest-priority interpretation

The two RPN 100 risks are not implementation bugs. They are **lack of external validation** and **overestimating round-trip safety**. These must be addressed before advanced engineering, because no amount of internal architecture can compensate for a wrong product model or an unrepresentative corpus.

---

## 13. The anti-roadmap: what not to build first

The following items are strategically attractive but should not enter the first production milestone.

## 13.1 Do not build full automatic bidirectional synchronization

First deliver drift detection and reverse change capture. Automatic merge should be enabled node type by node type after evidence.

## 13.2 Do not support every authentication mechanism

Support the dominant Cloud mechanism and CI secrets. Add OAuth and Data Center variants through measured demand.

## 13.3 Do not support Cloud and Data Center as equal v1 targets

Choose Cloud as the primary support contract. Data Center can be experimental or later.

## 13.4 Do not build watch mode or a hosted webhook service

CI-after-merge and explicit local commands are easier to reason about. Watch mode creates race, loop, and availability complexity before core trust exists.

## 13.5 Do not sync comments, inline comments, restrictions, reactions, whiteboards, databases, or arbitrary app content

Detect and preserve/block where necessary. Do not claim management.

## 13.6 Do not implement automatic deletion

Plan and report candidates. Archive/trash only after explicit lifecycle design and production evidence.

## 13.7 Do not support every diagram language

Mermaid is the initial wedge. PlantUML, D2, Graphviz, Draw.io, and Kroki increase dependencies and security surface.

## 13.8 Do not build MCP, GUI, editor plugins, or a separate SaaS control plane

Stabilize the CLI contract first. Agents can invoke the CLI through documented schemas.

## 13.9 Do not create a generic documentation methodology product

Write only the material needed to activate and operate MarkSync. Expand educational content after case studies.

## 13.10 Do not promise cross-page atomicity

Promise preflight, optimistic concurrency, journaling, idempotency, and repair.

## 13.11 Do not optimize for huge repositories before correctness

Benchmark after the state model works. Premature incremental shortcuts can hide changes.

## 13.12 Do not build a universal plugin API before two real extensions exist

Keep internal seams clean, but delay public compatibility commitments.

---

## 14. Recommended narrow product contract

### v0.x beachhead

**Target:** Git-native engineering teams publishing to Confluence Cloud.

**Supported workflow:**

1. Markdown is reviewed and merged in Git.
2. MarkSync plans publication to one or more configured Confluence subtrees.
3. Existing managed pages are identified by stable IDs, not titles.
4. The tool compares current local and remote semantic state with the last accepted base.
5. If only Git changed, publication proceeds.
6. If Confluence changed, publication stops and produces a remote-change bundle.
7. A second identical run performs no writes.
8. Every page records source path, document UUID, repository, and commit provenance.

**Initial content:**

- headings;
- paragraphs;
- emphasis;
- lists;
- code blocks;
- links;
- tables within a documented subset;
- blockquotes/panels where deterministic;
- local images;
- Mermaid rendered to managed attachments;
- YAML front matter.

**Initial commands:**

```text
marksync init
marksync login
marksync doctor
marksync validate
marksync status
marksync plan
marksync push
marksync diff
marksync explain
marksync repair
```

**Initial safety contract:**

- no silent overwrite of detected remote changes;
- no automatic deletion;
- no title-only binding;
- no mutation after failed full preflight;
- no unsupported-content flattening without an explicit warning/error policy;
- no secret in config or logs;
- no-op on unchanged state;
- interrupted apply is discoverable and resumable.

This is already differentiated and useful. It also creates the foundation for later reverse flow.

---

## 15. Phase gates that prevent premature complexity

## Gate 0 — Problem validation

### Required evidence

- 15–20 interviews;
- at least five design partners willing to test;
- at least three currently using Mark, md2conf, custom scripts, or manual publication;
- quantified frequency and impact of remote edits;
- representative page samples and auth environments;
- explicit willingness to run MarkSync in CI if the safety contract is met.

### Stop or pivot when

- remote edits are rare and generated-page banners solve the problem for most teams;
- teams will not accept stable metadata in source or remote properties;
- the primary need is migration/export rather than recurring synchronization;
- no team will provide a sandbox or fixtures.

## Gate 1 — Best-in-class safe one-way publisher

### Required evidence

- first successful sync in under ten minutes for the default path;
- 99.9% successful idempotent second run in the test corpus;
- zero known silent overwrite cases;
- stable identity through rename and move;
- attachment and Mermaid lifecycle tests;
- five design partners running recurring sync;
- public compatibility matrix and known limitations.

### Do not advance when

- users require maintainer assistance for routine setup;
- false changes create version spam;
- content requires frequent manual cleanup;
- lifecycle repair requires editing internal state manually.

## Gate 2 — Drift detection and lifecycle correctness

### Required evidence

- 100% detection in supported remote-edit scenarios;
- no false orphan/deletion decisions under filtered scope and permission loss;
- concurrent-run tests;
- partial-apply recovery;
- explainable base/local/remote state;
- production case study showing prevented overwrite.

## Gate 3 — Reverse change capture

### Required evidence

- remote content converts into an inspectable patch without mutating Git;
- unsupported nodes are preserved or block explicitly;
- provenance includes remote author/version where permitted;
- repeated pull stabilizes;
- cleanup time is measured;
- no direct commit to protected branches.

## Gate 4 — Pull request workflow

### Required evidence

- branch/patch generation is deterministic;
- CI and review can reject the change safely;
- merged reverse change does not create a publication loop;
- Git author/committer semantics are documented;
- failed PR leaves remote state understandable.

## Gate 5 — Structural automatic merge

### Required evidence per node class

- exact common-base semantics;
- property/fuzz tests;
- adversarial fixtures;
- real-tenant round trips;
- rendered validation;
- conflict fallback;
- no unsupported-node loss;
- explicit experimental flag until production-proven.

## Gate 6 — Continuous bidirectional policy

Only after:

- multiple production organizations;
- months of incident-free reverse flow;
- recovery drills;
- maintained webhook/polling infrastructure;
- concurrency and rate-limit evidence;
- support capacity.

---

## 16. Changes recommended to the current project summary

## 16.1 Clarify authority

Replace broad “Git is authoritative” wording with:

> Git is the default authoring and approval authority. Confluence changes are never silently discarded; in collaborative mode they are captured as reviewable proposals before becoming approved source.

## 16.2 Narrow the v1 support matrix

State explicitly:

- Confluence Cloud first;
- one primary auth path;
- CommonMark/GFM subset;
- Mermaid only;
- local Git and generic CI, with GitHub Action as a wrapper;
- Data Center and OAuth later.

## 16.3 Correct the atomicity language

Replace “any structural error means zero writes” with:

> MarkSync performs complete preflight before mutation. Apply uses optimistic concurrency and a durable journal; partial operations are detected, resumable, and repairable. Confluence does not provide cross-page transactions, so MarkSync does not claim global atomicity.

## 16.4 Separate cache from state

Explain that local cache affects performance only. Correctness survives deleting it.

## 16.5 Add ownership modes

Document managed, collaborative, and unmanaged pages. Explain what direct Confluence edits mean in each mode.

## 16.6 Remove universal claims

Avoid:

- “all possible authentication scenarios”;
- “all sorts of mapping scenarios”; 
- “flawless” cross-platform support;
- “handles large repositories” before benchmarks;
- “bidirectional” before the gate is passed.

Use a tested compatibility matrix instead.

## 16.7 Add explicit evidence links

Every major guarantee should link to:

- an executable scenario;
- fixture;
- compatibility result;
- or production case study.

## 16.8 Separate core and later differentiators

The AI skill, documentation handbook, MCP, semantic AI conflict suggestions, and advanced enterprise auth should be visibly outside the v1 critical path.

---

## 17. Testing strategy designed to prevent—not document—failure

## 17.1 Test invariants, not implementation steps

Non-negotiable invariants:

1. MarkSync never silently overwrites detected remote changes.
2. Deleting local cache cannot change the correct plan.
3. Title or path changes do not change document identity.
4. Duplicate document UUIDs produce zero writes.
5. The second unchanged run produces zero remote mutations.
6. A stale plan cannot overwrite a newer remote version.
7. Partial apply is visible and recoverable.
8. Unsupported content is never silently discarded.
9. Only MarkSync-owned attachments are eligible for cleanup.
10. Secrets never appear in logs, plans, state, or diagnostics.

## 17.2 Build an adversarial public corpus

Include:

- simple documents;
- equivalent Markdown syntax;
- malformed Markdown;
- nested lists;
- complex tables;
- relative and cross-page links;
- same-title pages under different parents;
- file rename, move, copy, split, and merge;
- source UUID duplication;
- page move and rename in Confluence;
- remote macro insertion;
- unknown nested macros;
- local and remote simultaneous edits;
- attachments renamed and replaced;
- partial permissions;
- rate limits and transient errors;
- two overlapping CI runs;
- shallow and sparse checkouts;
- renderer-version changes;
- API payload normalization;
- interrupted apply and state repair.

## 17.3 Publish a compatibility laboratory

For every release, report:

- Confluence Cloud test date;
- API versions/endpoints;
- supported content classes;
- exact/equivalent/opaque/blocked status;
- OS/architecture packages tested;
- renderer versions;
- known platform regressions;
- Data Center versions if supported.

## 17.4 Use production shadow mode

Before allowing mutation in a design partner’s important space:

- run `plan` only for several weeks;
- compare with the current publication mechanism;
- record false positives/negatives;
- validate no-op behavior;
- verify page/attachment identity;
- exercise recovery in a sandbox.

---

## 18. Adoption and community controls

## 18.1 Recruit heterogeneous design partners

At minimum include:

- a small GitHub/Cloud team;
- a large repository with thousands of pages/assets;
- a strict enterprise proxy/security environment;
- an existing Mark user;
- an existing md2conf user;
- a team with frequent Confluence-native edits;
- a team using diagrams heavily;
- a team with same-title pages and nontrivial hierarchy.

Do not optimize only for MarkSync’s own documentation.

## 18.2 Make migration a product feature

Provide read-only migration analysis from:

- Mark HTML comments;
- md2conf page IDs/front matter;
- title/path-based custom scripts;
- existing Confluence subtree adoption.

The tool should generate a mapping plan without republishing every page. Migration is the shortest route from curiosity to retained use.

## 18.3 Lead with proof, not ambition

The strongest launch artifacts are:

- “We detected and prevented 37 remote overwrites across 5,000 pages.”
- “A second run produced zero writes in 99.99% of runs.”
- “We migrated from Mark without recreating pages.”
- “Here is the public corpus showing which macros round-trip.”

A claim such as “AI-ready bidirectional sync” is less persuasive without these numbers.

## 18.4 Avoid hostile competitor positioning

Mark, md2conf, Sphinx Confluence Builder, and exporters solve legitimate jobs. Credit them. Provide migration and comparison guidance. The goal is to become the safest next step, not to declare working tools obsolete.

## 18.5 Create contributor-sized seams

Good first contributions:

- one Markdown fixture;
- one error-message improvement;
- one package manifest;
- one auth/environment recipe;
- one content-node adapter;
- one sanitization rule;
- one compatibility test.

Do not require contributors to understand the whole synchronization engine.

---

## 19. Metrics and early-warning dashboard

## 19.1 Activation

- installation → `doctor` success;
- `doctor` → first plan;
- plan → first push;
- first push → successful no-op second run;
- local use → CI installation;
- 30-day and 90-day retained repositories.

## 19.2 Safety

- silent overwrite incidents: **0**;
- unintended remote deletes: **0**;
- false no-op incidents: **0**;
- remote drift detection rate in supported scenarios: **100%**;
- partial-apply recovery rate;
- state-repair success rate;
- conflict false-positive rate;
- percentage of blocked operations with actionable resolution.

## 19.3 Fidelity

- exact/equivalent node percentage;
- unsupported-node frequency;
- opaque preservation success;
- attachment round-trip success;
- internal-link correctness;
- rendered visual-diff rate;
- manual cleanup minutes per 100 pages.

## 19.4 Operational health

- API requests per page and per no-op run;
- rate-limit events;
- median and p95 sync duration;
- concurrent-run conflicts;
- version/watcher spam avoided;
- live compatibility test success;
- time from Atlassian regression detection to patch release.

## 19.5 Open-source sustainability

- active maintainers;
- non-maintainer contributors per quarter;
- median issue first response;
- median PR review and merge time;
- release cadence;
- percentage of components with more than one reviewer;
- support hours per retained repository;
- sponsor/support revenue versus maintenance load.

### Red-alert thresholds

Pause feature expansion when any occurs:

- confirmed silent data loss;
- more than 5% false conflicts in a supported workflow;
- more than 10 minutes median first successful plan;
- less than 50% of successful first pushes reach a no-op second run;
- fewer than five retained design partners after three months;
- more than 30% of maintainer time spent on unsupported platform variants;
- compatibility break remains unresolved for more than one release cycle;
- manual cleanup exceeds the time saved by publication.

---

## 20. A 90-day anti-failure execution plan

## Days 1–30: validate the wedge and prove the state model

1. Interview 15–20 teams and recruit 5–10 design partners.
2. Collect sanitized representative documents and lifecycle scenarios.
3. Decide canonical naming and source-of-truth/ownership terminology.
4. Freeze the v0.x support matrix.
5. Implement one end-to-end Cloud path:
   - login/token validation;
   - one target parent;
   - one Markdown file;
   - plan;
   - create/update;
   - provenance;
   - second-run no-op.
6. Prove that deleting local cache does not affect correctness.
7. Implement stable document UUID + Confluence page ID binding.
8. Add duplicate-ID and ambiguous-adoption hard stops.
9. Publish the safety contract and non-goals.

## Days 31–60: establish safe one-way superiority

1. Recursive hierarchy and relative links.
2. Common Markdown subset and compatibility matrix.
3. Local images and first-class attachment manifest.
4. Mermaid through one pinned renderer profile.
5. Rename/move identity tests.
6. Remote drift detection before update.
7. `doctor`, `status`, `plan`, `diff`, `explain`, and JSON output.
8. GitHub Action as a thin wrapper around the same binary.
9. Live nightly Cloud tests.
10. Shadow mode with design partners.

## Days 61–90: prove adoption and recovery

1. Production canary with at least three design partners.
2. Apply journal and interrupted-run repair.
3. Rate-limit and concurrent-job tests.
4. Migration analyzer for Mark or md2conf metadata.
5. Public adversarial corpus.
6. First quantified case study.
7. Signed cross-platform releases.
8. Governance, security policy, and maintainer onboarding.
9. Decide whether reverse change frequency justifies Gate 3.
10. Do not start automatic merge unless Gate 2 metrics pass.

### 90-day success definition

- five retained design partners;
- at least one recurring CI deployment outside the owner’s repositories;
- no confirmed silent overwrite;
- stable second-run no-op;
- migration/adoption path from one incumbent;
- public compatibility evidence;
- repair procedure tested;
- one contributor other than the owner merges a meaningful change.

---

## 21. Decisions that should be made now

1. **Canonical name:** choose MarkSync consistently.
2. **Primary platform:** Confluence Cloud for v1.
3. **Primary authority model:** Git approval authority; remote changes become proposals.
4. **Initial ownership modes:** managed, collaborative, unmanaged.
5. **Initial auth:** one supported Cloud path plus CI environment variables/keyring.
6. **Initial Markdown dialect:** documented CommonMark/GFM subset.
7. **Initial diagram:** Mermaid only.
8. **State rule:** cache is disposable; correctness state is durable and hybrid.
9. **Identity rule:** UUID + page ID; title/path never authoritative.
10. **Apply guarantee:** preflight + optimistic concurrency + journal, not global atomicity.
11. **Deletion rule:** report only in MVP.
12. **Reverse rule:** patch/bundle first; no automatic commit or merge.
13. **Testing rule:** Gherkin only for user-visible lifecycle invariants.
14. **Evidence rule:** no headline claim without a reproducible fixture or case study.
15. **Governance rule:** recruit co-maintainers before public v1.

---

## 22. Final “do not do” checklist

Do not:

- build the full platform before one narrow workflow is retained;
- call push + pull bidirectional synchronization;
- merge rendered XHTML/ADF as strings;
- use title or path as identity;
- make correctness depend on a local cache;
- infer deletion from absence alone;
- overwrite remote edits because Git is “authoritative” without an explicit page policy;
- promise lossless arbitrary Confluence round trips;
- promise cross-page atomicity;
- support every auth/platform/diagram combination in v1;
- use mocks as the primary evidence of platform correctness;
- generate Gherkin for every implementation detail;
- let AI-generated specifications validate themselves;
- launch before setup diagnostics and recovery exist;
- add wrappers whose behavior diverges from the core;
- build watch mode before concurrency and loop prevention are proven;
- use stars as the primary success metric;
- rely on one maintainer for the complete compatibility matrix;
- hide known limitations;
- market against competitors whose focused products work well;
- expand educational content before the product has case studies;
- enable automatic deletion or merge without phase-gate evidence.

---

## Conclusion

MarkSync can become the leading open-source Git ↔ Confluence tool because the market has a real unclaimed gap: **safe lifecycle management between Git-native authoring and Confluence-native consumption**. Existing projects prove demand, but they also show why the category remains open. Most are one-way by design, narrowly tied to an ecosystem, incomplete in lifecycle management, under-maintained, or insufficiently trusted for true bidirectional use.

The project will not win by implementing the longest feature list. It will win by being the first tool whose users can say, with evidence:

> “We can automate publication without losing anyone’s work, every page has stable identity and provenance, every mutation is explainable, and when the two systems disagree the tool gives us a safe review workflow rather than making a hidden decision.”

The discipline required is primarily subtraction:

- narrow the first platform;
- narrow the first content model;
- narrow the first ownership model;
- narrow the first auth path;
- narrow the first diagram path;
- delay automatic merge;
- prove every safety claim on real tenants;
- build repair before magic;
- build governance before popularity.

The most dangerous version of MarkSync is an impressive, AI-built, extensively specified platform that demonstrates two-way synchronization but cannot earn operational trust. The successful version is a deliberately staged tool that first becomes the safest publisher, then the best drift detector, then the best reverse-review workflow, and only then the most reliable bidirectional synchronizer.

---

## Appendix A — Primary project references

### Core competitors and references

- Mark: <https://github.com/kovetskiy/mark>
- md2conf: <https://github.com/hunyadi/md2conf>
- markdown-confluence: <https://github.com/markdown-confluence/markdown-confluence>
- Telefónica confluence-tools: <https://github.com/Telefonica/confluence-tools>
- text2confl: <https://github.com/zeldigas/text2confl>
- atlcli: <https://github.com/BjoernSchotte/atlcli>
- confluence-bidir-sync: <https://github.com/PatD42/confluence-bidir-sync>
- iamjackg/md2cf: <https://github.com/iamjackg/md2cf>
- duo-labs/markdown-to-confluence: <https://github.com/duo-labs/markdown-to-confluence>
- Workable/confluence-docs-as-code: <https://github.com/Workable/confluence-docs-as-code>
- Bhacaz/docs-as-code-confluence: <https://github.com/Bhacaz/docs-as-code-confluence>
- docflu: <https://github.com/tuanpmt/docflu>
- cosmere: <https://github.com/mihaeu/cosmere>
- Sphinx Confluence Builder: <https://github.com/sphinx-contrib/confluencebuilder>
- Confluence Markdown Exporter: <https://github.com/Spenhouet/confluence-markdown-exporter>
- confluence2md: <https://github.com/gkoos/confluence2md>
- confluence-to-markdown: <https://github.com/meridius/confluence-to-markdown>

### Representative issue and community evidence

- Mark hierarchy request: <https://github.com/kovetskiy/mark/issues/59>
- Mark attachment lifecycle examples: <https://github.com/kovetskiy/mark/issues/184>, <https://github.com/kovetskiy/mark/issues/525>
- markdown-confluence maintainer discussion: <https://community.developer.atlassian.com/t/guidance-on-unmaintained-markdown-confluence-project/100699>
- markdown-confluence two-way request: <https://github.com/markdown-confluence/markdown-confluence/issues/533>
- markdown-confluence API migration example: <https://github.com/markdown-confluence/markdown-confluence/issues/796>
- md2cf rename lifecycle issue: <https://github.com/iamjackg/md2cf/issues/62>
- Hacker News discussion of Git review plus Confluence access: <https://news.ycombinator.com/item?id=33710603>
- Atlassian Community discussion of storing/syncing Confluence and Git: <https://community.atlassian.com/forums/Confluence-questions/What-options-to-store-confluence-pages-in-Github/qaq-p/2442970>
- Reddit discussion of Confluence/Git synchronization complexity: <https://www.reddit.com/r/dataengineering/comments/1qoxz30/confluence_git_repo_sync/>
- Reddit discussion of Confluence export conversion issues: <https://www.reddit.com/r/ObsidianMD/comments/sq1mi8/html_confluence_export_to_markdown/>

---

## Appendix B — One-page anti-failure operating policy

Before approving any major feature, answer:

1. Which observed design-partner problem does it solve?
2. Why cannot the current narrower mechanism solve it?
3. What new state, identity, lifecycle, security, and recovery cases does it add?
4. How will it be tested on a real tenant?
5. What is the unsupported behavior?
6. Can the operation be fully planned and explained?
7. What happens after partial failure?
8. How is the feature disabled or rolled back?
9. Who will maintain its compatibility matrix?
10. Which existing roadmap item is removed to make capacity for it?

Reject the feature when these answers are absent.

---

## Appendix C — Complete 39-project failure/ceiling map

This matrix covers every repository in the prior open-source inventory. “Ceiling” describes why a project did not become the complete category solution; it does not imply that the project is useless or unsuccessful in its intended niche.

| # | Project | Status archetype | Primary failure or category ceiling | Direct lesson for MarkSync |
|---:|---|---|---|---|
| 1 | [`kovetskiy/mark`](https://github.com/kovetskiy/mark) | Successful active publisher | One-way authority; lifecycle and attachment edge cases; broad backlog | Match the common path, differentiate on identity, drift safety, and recovery |
| 2 | [`hunyadi/md2conf`](https://github.com/hunyadi/md2conf) | Strong active specialist | Python/install friction, one-way ceiling, less independent visibility | Superior engineering needs equally strong onboarding and narrative |
| 3 | [`markdown-confluence/markdown-confluence`](https://github.com/markdown-confluence/markdown-confluence) | Broad active ecosystem with succession risk | Too many surfaces, maintainer risk, API/environment regressions, no reverse protocol | One core, thin wrappers, governance before ecosystem expansion |
| 4 | [`Telefonica/confluence-tools`](https://github.com/Telefonica/confluence-tools) | Company-backed specialist | Low discoverability, sparse independent proof, destructive deletion trust threshold | Standalone identity and production evidence matter |
| 5 | [`Telefonica/markdown-confluence-sync-action`](https://github.com/Telefonica/markdown-confluence-sync-action) | Wrapper/older distribution | Ambiguous supported path versus monorepo; duplicated maintenance | Retire or generate wrappers; keep one authoritative implementation |
| 6 | [`zeldigas/text2confl`](https://github.com/zeldigas/text2confl) | Active broad specialist | JVM weight, broad positioning, export mistaken for sync risk | Keep the first job and installation path simple |
| 7 | [`BjoernSchotte/atlcli`](https://github.com/BjoernSchotte/atlcli) | Promising active bidirectional platform | Small evidence base, broad Atlassian scope, incomplete Git PR story, semantic trust gap | Win with a narrower Git workflow and public safety evidence |
| 8 | [`PatD42/confluence-bidir-sync`](https://github.com/PatD42/confluence-bidir-sync) | Prototype | Claims exceed package, adoption, release, and validation maturity | Do not market architecture before reproducible delivery |
| 9 | [`HUU/Junction`](https://github.com/HUU/Junction) | Candid hobby project | Limited maintenance capacity and explicit hobby scope | Scope honestly, but category leadership needs durable ownership |
| 10 | [`md2conf/md2conf`](https://github.com/md2conf/md2conf) | JVM push/export specialist | Push and dump lack shared base; smaller community; slower maintenance | Two directions are not a synchronization protocol |
| 11 | [`iamjackg/md2cf`](https://github.com/iamjackg/md2cf) | Mature aging component | Rename leaves stale pages; lifecycle gaps; slower releases | Identity/lifecycle belongs in the core from day one |
| 12 | [`duo-labs/markdown-to-confluence`](https://github.com/duo-labs/markdown-to-confluence) | Historically successful legacy tool | Stars outlive API compatibility and maintenance; shallow lifecycle | Publish current compatibility and retained use, not only stars |
| 13 | [`Workable/confluence-docs-as-code`](https://github.com/Workable/confluence-docs-as-code) | MkDocs-focused publisher | Framework coupling, limited hierarchy, no reverse flow | Ecosystem profiles should not define the core model |
| 14 | [`Bhacaz/docs-as-code-confluence`](https://github.com/Bhacaz/docs-as-code-confluence) | Easy GitHub Action | Missing rename, move, delete, no-op, provenance, and remote images | Low-friction activation must be followed by lifecycle correctness |
| 15 | [`tuanpmt/docflu`](https://github.com/tuanpmt/docflu) | New AI-built multi-target tool | Overbroad destinations, ambiguous bidirectional language, little validation | AI speed and feature count do not create trust |
| 16 | [`mihaeu/cosmere`](https://github.com/mihaeu/cosmere) | Compact aging converter | Weak hierarchy, partial dialect, no reverse flow, slow releases | Clean internals need a complete user workflow |
| 17 | [`pawelsikora/mkdocs-with-confluence`](https://github.com/pawelsikora/mkdocs-with-confluence) | Established MkDocs plugin | SSL/auth/packaging/plugin interactions; ecosystem ceiling | Integration matrices create support work; isolate profiles |
| 18 | [`jmanteau/mkdocs-to-confluence`](https://github.com/jmanteau/mkdocs-to-confluence) | Active low-adoption successor/fork | Dependency catch-up, feature parity, plugin interoperability | Forks fragment users unless succession and migration are explicit |
| 19 | [`johnny/mkdocs-confluence-publisher`](https://github.com/johnny/mkdocs-confluence-publisher) | Small specialist plugin | Little independent evidence and narrow ecosystem | A niche can be useful but cannot validate category-wide safety |
| 20 | [`cupcakearmy/confluence-markdown-sync`](https://github.com/cupcakearmy/confluence-markdown-sync) | Single-page uploader | No image upload; existing-page focus; no repository lifecycle | Single-page success is not synchronization |
| 21 | [`7nohe/confluence-md`](https://github.com/7nohe/confluence-md) | Modern small Cloud Action | Sparse evidence; unclear hierarchy/lifecycle depth | Modern API usage is necessary but not sufficient |
| 22 | [`Kerwood/confluence-updater`](https://github.com/Kerwood/confluence-updater) | Explicit-mapping Rust tool | Users must pre-map pages; no tree discovery or reverse flow | Explicit IDs are safe but onboarding must be automated |
| 23 | [`Kerwood/confluence-updater-action`](https://github.com/Kerwood/confluence-updater-action) | Wrapper | Adds distribution, not engine differentiation | Wrappers must not become separate products |
| 24 | [`talkiq/confluence-wiki-sync`](https://github.com/talkiq/confluence-wiki-sync) | Legacy-conversion publisher | Pandoc/wiki-markup path may not fit current Cloud; no reverse flow | Avoid building on legacy representation as the core future |
| 25 | [`humanendpoint/confluence-syncer`](https://github.com/humanendpoint/confluence-syncer) | Thin modern publisher | Minimal adoption; upload workflow without common-base state | REST v2 alone does not establish product differentiation |
| 26 | [`axro-gmbh/markdown-to-confluence-sync`](https://github.com/axro-gmbh/markdown-to-confluence-sync) | Small Action | Almost no adoption evidence; workflow packaging only | Validate demand and retention before broad feature work |
| 27 | [`kattebak/markdown-confluence-cli`](https://github.com/kattebak/markdown-confluence-cli) | Small page-operations CLI | Title identity, reverse-engineered ADF, dump not conflict-safe | Do not infer safety from command symmetry |
| 28 | [`zonkyio/confluence-sync`](https://github.com/zonkyio/confluence-sync) | Simple CI building block | Pre-created pages and external identity/hierarchy responsibility | Manual mapping limits activation and lifecycle automation |
| 29 | [`qwazer/markdown-confluence-gradle-plugin`](https://github.com/qwazer/markdown-confluence-gradle-plugin) | Gradle/JVM niche | Build-tool coupling; not a standalone lifecycle engine | Offer integrations without binding the domain model to a build tool |
| 30 | [`NickSmet/markdown-to-confluence-publisher`](https://github.com/NickSmet/markdown-to-confluence-publisher) | Small fork | Improvements remain isolated; no independent ecosystem | Upstream extensibility is better than permanent forks |
| 31 | [`MoebiusSolutions/confluence-markdown-sync`](https://github.com/MoebiusSolutions/confluence-markdown-sync) | Incomplete proof of concept | Maintainer says output is unattractive/incomplete; watcher noise | Honest caveats are good, but visual quality and no-op behavior are adoption gates |
| 32 | [`BungaRazvan/confluence-link`](https://github.com/BungaRazvan/confluence-link) | Obsidian interactive plugin | Manual current-file push, link issues, no Git automation | Editor convenience is a separate job from repository synchronization |
| 33 | [`Spenhouet/confluence-markdown-exporter`](https://github.com/Spenhouet/confluence-markdown-exporter) | Successful active exporter | Deliberately one-way; exported Markdown is not a common-base workflow | Reverse capture should first be inspectable and bounded like export |
| 34 | [`gkoos/confluence2md`](https://github.com/gkoos/confluence2md) | Active compact exporter | Export scope only; no republish/conflict protocol | A small, installable, sharply named tool can earn trust quickly |
| 35 | [`meridius/confluence-to-markdown`](https://github.com/meridius/confluence-to-markdown) | Historically successful archived migrator | HTML-export dependence; archived; one-time migration ceiling | Bounded jobs can succeed, but maintenance and current APIs still matter |
| 36 | [`gergelykalman/confluence-markdown-exporter`](https://github.com/gergelykalman/confluence-markdown-exporter) | Popular small script | No formal releases and limited productization | Search demand may create stars without operational readiness |
| 37 | [`ttscoff/confluence2md`](https://github.com/ttscoff/confluence2md) | Migration cleanup toolbox | HTML/Pandoc cleanup, not live API synchronization | Keep migration utilities distinct from synchronization guarantees |
| 38 | [`markdown-confluence/publish-action`](https://github.com/markdown-confluence/publish-action) | Wrapper | Maintenance and behavior depend on main engine | Users need one compatibility and release source of truth |
| 39 | [`markdown-confluence/obsidian-integration`](https://github.com/markdown-confluence/obsidian-integration) | Historical integration repository | Source moved; separate stars can overstate independent engine adoption | Consolidation must preserve migration paths and avoid fragmented metrics |

### Long-tail conclusion

The 39-project map shows that most projects did not fail because Markdown conversion was impossible. They failed or plateaued because one or more product-system capabilities were missing:

- durable ownership and common-base state;
- rename/move/delete semantics;
- current API compatibility;
- low-friction distribution;
- clear boundaries;
- independent production evidence;
- maintenance succession;
- complete Git review workflow;
- recovery after partial failure;
- a trust contract precise enough for enterprises.

Those are the real competitive requirements for MarkSync.
