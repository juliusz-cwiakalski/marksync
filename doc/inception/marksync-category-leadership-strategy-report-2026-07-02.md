# Building the World’s Leading Open-Source Git ↔ Confluence Synchronizer

## Competitive success analysis and an execution playbook for MarksSync for Confluence

**Research date:** 2 July 2026  
**Prepared for:** MarksSync for Confluence  
**Repository:** `git@github.com:juliusz-cwiakalski/marksync-for-confluence.git`  
**Scope:** Open-source projects with at least approximately 100 GitHub stars, plus every credible project that implements or explicitly claims conflict-aware bidirectional Markdown ↔ Confluence synchronization.

<!-- TOC -->
* [Building the World’s Leading Open-Source Git ↔ Confluence Synchronizer](#building-the-worlds-leading-open-source-git--confluence-synchronizer)
  * [Competitive success analysis and an execution playbook for MarksSync for Confluence](#competitive-success-analysis-and-an-execution-playbook-for-markssync-for-confluence)
  * [Executive summary](#executive-summary)
    * [The most important strategic conclusion](#the-most-important-strategic-conclusion)
    * [What made the existing winners successful](#what-made-the-existing-winners-successful)
    * [What prevented them from owning the category](#what-prevented-them-from-owning-the-category)
    * [Recommended category position](#recommended-category-position)
    * [Twelve principles for becoming number one](#twelve-principles-for-becoming-number-one)
  * [1. Scope and interpretation of the threshold](#1-scope-and-interpretation-of-the-threshold)
    * [1.1 Qualifying projects](#11-qualifying-projects)
    * [1.2 Star History links](#12-star-history-links)
    * [1.3 Evidence model](#13-evidence-model)
  * [2. The market is not one category](#2-the-market-is-not-one-category)
    * [2.1 The five jobs-to-be-done](#21-the-five-jobs-to-be-done)
      * [Job A — Publish reviewed engineering documentation to Confluence](#job-a--publish-reviewed-engineering-documentation-to-confluence)
      * [Job B — Preserve technical fidelity](#job-b--preserve-technical-fidelity)
      * [Job C — Escape or back up Confluence](#job-c--escape-or-back-up-confluence)
      * [Job D — Fit an existing authoring ecosystem](#job-d--fit-an-existing-authoring-ecosystem)
      * [Job E — Allow both sides to be edited safely](#job-e--allow-both-sides-to-be-edited-safely)
    * [2.2 Why stars are not directly comparable](#22-why-stars-are-not-directly-comparable)
    * [2.3 High-level competitive scorecard](#23-high-level-competitive-scorecard)
    * [2.4 The open position](#24-the-open-position)
  * [3. Deep success analysis: `kovetskiy/mark`](#3-deep-success-analysis-kovetskiymark)
    * [3.1 Project profile](#31-project-profile)
    * [3.2 The product thesis that worked](#32-the-product-thesis-that-worked)
    * [3.3 Technical success factors](#33-technical-success-factors)
      * [A standalone Go binary](#a-standalone-go-binary)
      * [Metadata travels with the document](#metadata-travels-with-the-document)
      * [It supports adoption-deciding technical content](#it-supports-adoption-deciding-technical-content)
      * [It creates missing hierarchy](#it-creates-missing-hierarchy)
      * [It supports both local inspection and CI automation](#it-supports-both-local-inspection-and-ci-automation)
    * [3.4 Distribution and marketing success factors](#34-distribution-and-marketing-success-factors)
      * [A memorable, short name](#a-memorable-short-name)
      * [Long-term visible maintenance](#long-term-visible-maintenance)
      * [The community can explain the value in one sentence](#the-community-can-explain-the-value-in-one-sentence)
    * [3.5 What users praise](#35-what-users-praise)
    * [3.6 What limits Mark](#36-what-limits-mark)
      * [Git is authoritative; Confluence edits are not safely reconciled](#git-is-authoritative-confluence-edits-are-not-safely-reconciled)
      * [Metadata syntax is powerful but intrusive](#metadata-syntax-is-powerful-but-intrusive)
      * [Attachment lifecycle is inherently difficult](#attachment-lifecycle-is-inherently-difficult)
      * [Page lifecycle remains weaker than page rendering](#page-lifecycle-remains-weaker-than-page-rendering)
      * [The breadth creates an issue backlog](#the-breadth-creates-an-issue-backlog)
    * [3.7 Why Mark became the default](#37-why-mark-became-the-default)
    * [3.8 Lessons for MarksSync](#38-lessons-for-markssync)
  * [4. Deep success analysis: `hunyadi/md2conf`](#4-deep-success-analysis-hunyadimd2conf)
    * [4.1 Project profile](#41-project-profile)
    * [4.2 The product thesis that worked](#42-the-product-thesis-that-worked)
    * [4.3 Technical success factors](#43-technical-success-factors)
      * [Explicit REST API v2 alignment](#explicit-rest-api-v2-alignment)
      * [Conservative identity and overwrite safety](#conservative-identity-and-overwrite-safety)
      * [It performs a two-pass repository-level analysis](#it-performs-a-two-pass-repository-level-analysis)
      * [Page order is treated as state](#page-order-is-treated-as-state)
      * [Rich content support targets real acceptance criteria](#rich-content-support-targets-real-acceptance-criteria)
      * [Security constraints appear in ordinary behavior](#security-constraints-appear-in-ordinary-behavior)
      * [It can be embedded as a library](#it-can-be-embedded-as-a-library)
    * [4.4 Distribution and UX factors](#44-distribution-and-ux-factors)
    * [4.5 Signals of success](#45-signals-of-success)
    * [4.6 Limitations](#46-limitations)
      * [One-way authority](#one-way-authority)
      * [Runtime/dependency friction](#runtimedependency-friction)
      * [Strict parsing can surprise users](#strict-parsing-can-surprise-users)
      * [Enterprise networking variants remain a source of friction](#enterprise-networking-variants-remain-a-source-of-friction)
    * [4.7 Why it succeeded](#47-why-it-succeeded)
    * [4.8 Lessons for MarksSync](#48-lessons-for-markssync)
  * [5. Deep success analysis: `markdown-confluence`](#5-deep-success-analysis-markdown-confluence)
    * [5.1 Project profile](#51-project-profile)
    * [5.2 The product thesis that worked](#52-the-product-thesis-that-worked)
    * [5.3 Technical success factors](#53-technical-success-factors)
      * [ADF-native positioning](#adf-native-positioning)
      * [Shared core across delivery surfaces](#shared-core-across-delivery-surfaces)
      * [Directory mirroring and move support](#directory-mirroring-and-move-support)
      * [Attachment hashing](#attachment-hashing)
      * [Obsidian syntax support](#obsidian-syntax-support)
    * [5.4 Distribution success factors](#54-distribution-success-factors)
    * [5.5 What the maintainer situation teaches](#55-what-the-maintainer-situation-teaches)
    * [5.6 Limitations and complaints](#56-limitations-and-complaints)
    * [5.7 Why it succeeded](#57-why-it-succeeded)
    * [5.8 Why it did not become the category leader](#58-why-it-did-not-become-the-category-leader)
    * [5.9 Lessons for MarksSync](#59-lessons-for-markssync)
  * [6. Deep success analysis: `duo-labs/markdown-to-confluence`](#6-deep-success-analysis-duo-labsmarkdown-to-confluence)
    * [6.1 Project profile](#61-project-profile)
    * [6.2 Why this project matters despite its age](#62-why-this-project-matters-despite-its-age)
    * [6.3 The successful thesis](#63-the-successful-thesis)
    * [6.4 Success factors](#64-success-factors)
      * [Company-backed credibility](#company-backed-credibility)
      * [Strong CI story](#strong-ci-story)
      * [Compatibility with existing static-site metadata](#compatibility-with-existing-static-site-metadata)
      * [Small conceptual surface](#small-conceptual-surface)
      * [Good timing](#good-timing)
    * [6.5 Limitations and failure modes](#65-limitations-and-failure-modes)
    * [6.6 Lessons for MarksSync](#66-lessons-for-markssync)
  * [7. Deep success analysis: Sphinx Confluence Builder](#7-deep-success-analysis-sphinx-confluence-builder)
    * [7.1 Project profile](#71-project-profile)
    * [7.2 The successful thesis](#72-the-successful-thesis)
    * [7.3 Success factors](#73-success-factors)
      * [Ecosystem leverage](#ecosystem-leverage)
      * [Professional documentation](#professional-documentation)
      * [Long-lived engineering depth](#long-lived-engineering-depth)
      * [Narrow but deep compatibility promise](#narrow-but-deep-compatibility-promise)
      * [Cloud and Data Center awareness](#cloud-and-data-center-awareness)
      * [Extension architecture](#extension-architecture)
    * [7.4 Limitations](#74-limitations)
    * [7.5 Why it succeeded](#75-why-it-succeeded)
    * [7.6 Lessons for MarksSync](#76-lessons-for-markssync)
  * [8. Deep success analysis: `Spenhouet/confluence-markdown-exporter`](#8-deep-success-analysis-spenhouetconfluence-markdown-exporter)
    * [8.1 Project profile](#81-project-profile)
    * [8.2 Why the leading exporter is strategically important](#82-why-the-leading-exporter-is-strategically-important)
    * [8.3 The product thesis that worked](#83-the-product-thesis-that-worked)
    * [8.4 Technical success factors](#84-technical-success-factors)
      * [Direct API export](#direct-api-export)
      * [Incremental behavior](#incremental-behavior)
      * [Hierarchy and link rewriting](#hierarchy-and-link-rewriting)
      * [Attachments are first-class](#attachments-are-first-class)
      * [Destination presets](#destination-presets)
      * [Multiple installation modes](#multiple-installation-modes)
    * [8.5 Independent user feedback](#85-independent-user-feedback)
    * [8.6 Success factors beyond technology](#86-success-factors-beyond-technology)
      * [The repository name matches the search query](#the-repository-name-matches-the-search-query)
      * [The project maintains momentum](#the-project-maintains-momentum)
      * [The scope is disciplined](#the-scope-is-disciplined)
      * [The project benefits from anti-lock-in sentiment](#the-project-benefits-from-anti-lock-in-sentiment)
    * [8.7 Limitations](#87-limitations)
    * [8.8 Why it succeeded](#88-why-it-succeeded)
    * [8.9 Lessons for MarksSync](#89-lessons-for-markssync)
  * [9. Deep success analysis: `meridius/confluence-to-markdown`](#9-deep-success-analysis-meridiusconfluence-to-markdown)
    * [9.1 Project profile](#91-project-profile)
    * [9.2 The successful thesis](#92-the-successful-thesis)
    * [9.3 Success factors](#93-success-factors)
      * [It solved a bounded migration event](#it-solved-a-bounded-migration-event)
      * [It reused proven converters](#it-reused-proven-converters)
      * [It improved an existing abandoned lineage](#it-improved-an-existing-abandoned-lineage)
      * [Strong search positioning](#strong-search-positioning)
      * [It could run without admin/API access](#it-could-run-without-adminapi-access)
    * [9.4 Limitations](#94-limitations)
    * [9.5 Why it accumulated significant stars](#95-why-it-accumulated-significant-stars)
    * [9.6 Lessons for MarksSync](#96-lessons-for-markssync)
  * [10. Deep success analysis: `iamjackg/md2cf`](#10-deep-success-analysis-iamjackgmd2cf)
    * [10.1 Project profile](#101-project-profile)
    * [10.2 The successful thesis](#102-the-successful-thesis)
    * [10.3 Technical success factors](#103-technical-success-factors)
      * [Library plus CLI](#library-plus-cli)
      * [Two-pass relative-link processing](#two-pass-relative-link-processing)
      * [Flexible title derivation](#flexible-title-derivation)
      * [Practical enterprise switches](#practical-enterprise-switches)
    * [10.4 Adoption signal: unusually high fork ratio](#104-adoption-signal-unusually-high-fork-ratio)
    * [10.5 Limitations](#105-limitations)
    * [10.6 Why it succeeded](#106-why-it-succeeded)
    * [10.7 Lessons for MarksSync](#107-lessons-for-markssync)
  * [11. Deep success analysis: `BjoernSchotte/atlcli`](#11-deep-success-analysis-bjoernschotteatlcli)
    * [11.1 Project profile](#111-project-profile)
    * [11.2 Why it is strategically more important than its star count](#112-why-it-is-strategically-more-important-than-its-star-count)
    * [11.3 Product and UX success factors](#113-product-and-ux-success-factors)
      * [A polished CLI narrative](#a-polished-cli-narrative)
      * [Multiple installation routes](#multiple-installation-routes)
      * [Operational features are visible](#operational-features-are-visible)
      * [The three-way model is explicit](#the-three-way-model-is-explicit)
    * [11.4 Technical success factors](#114-technical-success-factors)
      * [Persistent state](#persistent-state)
      * [Scope-aware polling](#scope-aware-polling)
      * [Locking](#locking)
      * [Plugin architecture](#plugin-architecture)
      * [Broader Atlassian platform](#broader-atlassian-platform)
    * [11.5 Why adoption remains low](#115-why-adoption-remains-low)
      * [The project is young relative to incumbents](#the-project-is-young-relative-to-incumbents)
      * [Positioning is broad](#positioning-is-broad)
      * [The hardest claims lack independent validation](#the-hardest-claims-lack-independent-validation)
      * [Bun/TypeScript binary trust and packaging](#buntypescript-binary-trust-and-packaging)
      * [Continuous watch is not the primary enterprise workflow](#continuous-watch-is-not-the-primary-enterprise-workflow)
      * [Git integration appears additive rather than central](#git-integration-appears-additive-rather-than-central)
    * [11.6 Risks in the design](#116-risks-in-the-design)
    * [11.7 Why it has not yet won despite implementing the headline feature](#117-why-it-has-not-yet-won-despite-implementing-the-headline-feature)
    * [11.8 Lessons for MarksSync](#118-lessons-for-markssync)
  * [12. Deep success analysis: `PatD42/confluence-bidir-sync`](#12-deep-success-analysis-patd42confluence-bidir-sync)
    * [12.1 Project profile](#121-project-profile)
    * [12.2 The proposed model](#122-the-proposed-model)
    * [12.3 What is promising](#123-what-is-promising)
      * [The project recognizes the need for a baseline](#the-project-recognizes-the-need-for-a-baseline)
      * [It distinguishes detection from force resolution](#it-distinguishes-detection-from-force-resolution)
      * [It explicitly includes non-body state](#it-explicitly-includes-non-body-state)
      * [The README describes behavior rather than only commands](#the-readme-describes-behavior-rather-than-only-commands)
    * [12.4 Why it has not achieved adoption](#124-why-it-has-not-achieved-adoption)
    * [12.5 Lessons for MarksSync](#125-lessons-for-markssync)
  * [13. Cross-project success patterns](#13-cross-project-success-patterns)
    * [13.1 Success pattern: one sentence that eliminates a known pain](#131-success-pattern-one-sentence-that-eliminates-a-known-pain)
    * [13.2 Success pattern: fit the workflow that already exists](#132-success-pattern-fit-the-workflow-that-already-exists)
    * [13.3 Success pattern: support the difficult 20% that blocks adoption](#133-success-pattern-support-the-difficult-20-that-blocks-adoption)
    * [13.4 Success pattern: disciplined scope](#134-success-pattern-disciplined-scope)
    * [13.5 Success pattern: visible maintenance](#135-success-pattern-visible-maintenance)
    * [13.6 Success pattern: installation is part of product design](#136-success-pattern-installation-is-part-of-product-design)
    * [13.7 Success pattern: destination- or ecosystem-specific profiles](#137-success-pattern-destination--or-ecosystem-specific-profiles)
    * [13.8 Success pattern: transparent limitations build trust](#138-success-pattern-transparent-limitations-build-trust)
  * [14. Cross-project failure patterns](#14-cross-project-failure-patterns)
    * [14.1 Mistaking conversion for synchronization](#141-mistaking-conversion-for-synchronization)
    * [14.2 Title-based identity](#142-title-based-identity)
    * [14.3 Silent overwrite as conflict policy](#143-silent-overwrite-as-conflict-policy)
    * [14.4 Incomplete deletion semantics](#144-incomplete-deletion-semantics)
    * [14.5 String-level merge of rendered formats](#145-string-level-merge-of-rendered-formats)
    * [14.6 Underestimating attachments](#146-underestimating-attachments)
    * [14.7 Platform/API drift](#147-platformapi-drift)
    * [14.8 Too many surfaces for one maintainer](#148-too-many-surfaces-for-one-maintainer)
    * [14.9 Weak release and contribution operations](#149-weak-release-and-contribution-operations)
    * [14.10 Stars without retention](#1410-stars-without-retention)
  * [15. Why no bidirectional project has reached 50 stars](#15-why-no-bidirectional-project-has-reached-50-stars)
    * [15.1 Representational asymmetry](#151-representational-asymmetry)
    * [15.2 Semantic equivalence is not textual equality](#152-semantic-equivalence-is-not-textual-equality)
    * [15.3 Identity is multidimensional](#153-identity-is-multidimensional)
    * [15.4 Deletion is a high-risk command](#154-deletion-is-a-high-risk-command)
    * [15.5 Page movement can look like delete-plus-create](#155-page-movement-can-look-like-delete-plus-create)
    * [15.6 Concurrency spans two version-control models](#156-concurrency-spans-two-version-control-models)
    * [15.7 Authorship and review matter](#157-authorship-and-review-matter)
    * [15.8 Remote change discovery is expensive](#158-remote-change-discovery-is-expensive)
    * [15.9 State must survive clones and CI workers](#159-state-must-survive-clones-and-ci-workers)
    * [15.10 Trust is harder to demonstrate than functionality](#1510-trust-is-harder-to-demonstrate-than-functionality)
  * [16. The winning product strategy](#16-the-winning-product-strategy)
    * [16.1 Product vision](#161-product-vision)
    * [16.2 Do not lead with “two-way sync” alone](#162-do-not-lead-with-two-way-sync-alone)
    * [16.3 Beachhead market](#163-beachhead-market)
    * [16.4 The trust ladder](#164-the-trust-ladder)
      * [Level 0 — Convert and inspect](#level-0--convert-and-inspect)
      * [Level 1 — Safe one-way publish](#level-1--safe-one-way-publish)
      * [Level 2 — Reverse change capture](#level-2--reverse-change-capture)
      * [Level 3 — Assisted bidirectional reconciliation](#level-3--assisted-bidirectional-reconciliation)
      * [Level 4 — Policy-controlled continuous sync](#level-4--policy-controlled-continuous-sync)
    * [16.5 The wedge that can beat Mark](#165-the-wedge-that-can-beat-mark)
    * [16.6 Product modes](#166-product-modes)
    * [16.7 Build the product around a plan](#167-build-the-product-around-a-plan)
    * [16.8 The product should have a safety contract](#168-the-product-should-have-a-safety-contract)
  * [17. Recommended system architecture](#17-recommended-system-architecture)
    * [17.1 Architectural principle: functional core, imperative shell](#171-architectural-principle-functional-core-imperative-shell)
    * [17.2 Core components](#172-core-components)
    * [17.3 Canonical intermediate representation](#173-canonical-intermediate-representation)
    * [17.4 Lossiness taxonomy](#174-lossiness-taxonomy)
    * [17.5 Opaque-node preservation](#175-opaque-node-preservation)
    * [17.6 Ownership at node level](#176-ownership-at-node-level)
    * [17.7 Identity model](#177-identity-model)
    * [17.8 State model](#178-state-model)
      * [Versioned state in Git](#versioned-state-in-git)
      * [Local cache](#local-cache)
      * [Optional shared operational state](#optional-shared-operational-state)
    * [17.9 Structural diff](#179-structural-diff)
    * [17.10 Three-way structural merge](#1710-three-way-structural-merge)
    * [17.11 Apply engine and transactions](#1711-apply-engine-and-transactions)
    * [17.12 Confluence adapter strategy](#1712-confluence-adapter-strategy)
    * [17.13 Git provider adapters](#1713-git-provider-adapters)
  * [18. CLI and developer experience that can beat the incumbents](#18-cli-and-developer-experience-that-can-beat-the-incumbents)
    * [18.1 Design objective](#181-design-objective)
    * [18.2 Recommended command model](#182-recommended-command-model)
    * [18.3 `marksync init`](#183-marksync-init)
    * [18.4 `marksync login`](#184-marksync-login)
    * [18.5 `marksync doctor`](#185-marksync-doctor)
    * [18.6 `marksync status`](#186-marksync-status)
    * [18.7 `marksync plan`](#187-marksync-plan)
    * [18.8 `marksync sync`](#188-marksync-sync)
    * [18.9 CI UX](#189-ci-ux)
    * [18.10 GitHub Action experience](#1810-github-action-experience)
    * [18.11 Error-message standard](#1811-error-message-standard)
  * [19. Content fidelity strategy](#19-content-fidelity-strategy)
    * [19.1 Publish a compatibility matrix](#191-publish-a-compatibility-matrix)
    * [19.2 Acceptance corpus](#192-acceptance-corpus)
    * [19.3 Real-tenant testing](#193-real-tenant-testing)
    * [19.4 Golden files and property tests](#194-golden-files-and-property-tests)
    * [19.5 Plugin model for macros and dialects](#195-plugin-model-for-macros-and-dialects)
  * [20. Reliability, security, and enterprise readiness](#20-reliability-security-and-enterprise-readiness)
    * [20.1 Reliability is the product](#201-reliability-is-the-product)
    * [20.2 Idempotency](#202-idempotency)
    * [20.3 Rate-limit architecture](#203-rate-limit-architecture)
    * [20.4 Optimistic concurrency](#204-optimistic-concurrency)
    * [20.5 Concurrency control](#205-concurrency-control)
    * [20.6 Backup and recovery](#206-backup-and-recovery)
    * [20.7 Security baseline](#207-security-baseline)
    * [20.8 Supply-chain trust](#208-supply-chain-trust)
    * [20.9 Privacy](#209-privacy)
  * [21. Open-source project strategy](#21-open-source-project-strategy)
    * [21.1 Treat the repository as the product homepage](#211-treat-the-repository-as-the-product-homepage)
    * [21.2 README structure](#212-readme-structure)
    * [21.3 Name and search strategy](#213-name-and-search-strategy)
    * [21.4 License recommendation](#214-license-recommendation)
    * [21.5 Governance from day one](#215-governance-from-day-one)
    * [21.6 Contribution design](#216-contribution-design)
    * [21.7 Issue management](#217-issue-management)
    * [21.8 Release strategy](#218-release-strategy)
    * [21.9 Avoid the maintainer bottleneck](#219-avoid-the-maintainer-bottleneck)
    * [21.10 Sustainable business model without weakening open source](#2110-sustainable-business-model-without-weakening-open-source)
  * [22. Distribution strategy](#22-distribution-strategy)
    * [22.1 Required channels for v1](#221-required-channels-for-v1)
    * [22.2 Recommended next channels](#222-recommended-next-channels)
    * [22.3 Why a native binary is the best core distribution](#223-why-a-native-binary-is-the-best-core-distribution)
    * [22.4 One core, thin wrappers](#224-one-core-thin-wrappers)
  * [23. Community and adoption strategy](#23-community-and-adoption-strategy)
    * [23.1 The growth loop](#231-the-growth-loop)
    * [23.2 Launch sequence](#232-launch-sequence)
      * [Private design partners](#private-design-partners)
      * [Public alpha](#public-alpha)
      * [Public beta](#public-beta)
      * [v1.0](#v10)
    * [23.3 Ethical star-growth tactics](#233-ethical-star-growth-tactics)
    * [23.4 Content strategy](#234-content-strategy)
    * [23.5 Comparison without hostility](#235-comparison-without-hostility)
    * [23.6 Case studies that matter](#236-case-studies-that-matter)
  * [24. Metrics and definition of category leadership](#24-metrics-and-definition-of-category-leadership)
    * [24.1 North-star metric](#241-north-star-metric)
    * [24.2 Activation funnel](#242-activation-funnel)
    * [24.3 Reliability guardrails](#243-reliability-guardrails)
    * [24.4 Fidelity metrics](#244-fidelity-metrics)
    * [24.5 Community metrics](#245-community-metrics)
    * [24.6 Adoption metrics](#246-adoption-metrics)
    * [24.7 “Number one” should mean more than star count](#247-number-one-should-mean-more-than-star-count)
  * [25. Recommended roadmap](#25-recommended-roadmap)
    * [Phase 0 — Foundations and proof corpus (weeks 1–6)](#phase-0--foundations-and-proof-corpus-weeks-16)
    * [Phase 1 — Best-in-class safe publisher (weeks 7–14)](#phase-1--best-in-class-safe-publisher-weeks-714)
    * [Phase 2 — Lifecycle correctness (weeks 15–22)](#phase-2--lifecycle-correctness-weeks-1522)
    * [Phase 3 — Confluence changes as Git pull requests (weeks 23–32)](#phase-3--confluence-changes-as-git-pull-requests-weeks-2332)
    * [Phase 4 — Structural three-way merge (weeks 33–44)](#phase-4--structural-three-way-merge-weeks-3344)
    * [Phase 5 — Category platform (months 12–18)](#phase-5--category-platform-months-1218)
  * [26. First 90 days: executable plan](#26-first-90-days-executable-plan)
    * [Days 1–30 — establish the technical moat](#days-130--establish-the-technical-moat)
    * [Days 31–60 — deliver safe one-way value](#days-3160--deliver-safe-one-way-value)
    * [Days 61–90 — establish differentiation and public credibility](#days-6190--establish-differentiation-and-public-credibility)
    * [90-day success criteria](#90-day-success-criteria)
  * [27. Feature prioritization](#27-feature-prioritization)
    * [27.1 Priority matrix](#271-priority-matrix)
    * [27.2 Features to explicitly postpone](#272-features-to-explicitly-postpone)
  * [28. AI strategy](#28-ai-strategy)
    * [28.1 Where AI helps](#281-where-ai-helps)
    * [28.2 Where AI must not be authoritative](#282-where-ai-must-not-be-authoritative)
    * [28.3 Safe AI conflict workflow](#283-safe-ai-conflict-workflow)
  * [29. Competitive moat](#29-competitive-moat)
    * [29.1 Public compatibility corpus](#291-public-compatibility-corpus)
    * [29.2 Identity and state migration](#292-identity-and-state-migration)
    * [29.3 Plugin ecosystem](#293-plugin-ecosystem)
    * [29.4 Reputation for safety](#294-reputation-for-safety)
    * [29.5 Git-provider workflow depth](#295-git-provider-workflow-depth)
    * [29.6 Migration paths](#296-migration-paths)
  * [30. Anti-patterns to avoid](#30-anti-patterns-to-avoid)
  * [31. Recommended initial specification decisions](#31-recommended-initial-specification-decisions)
    * [Product](#product)
    * [Configuration](#configuration)
    * [Technical](#technical)
    * [Security](#security)
    * [Testing](#testing)
  * [32. Concrete repository backlog](#32-concrete-repository-backlog)
    * [Epic A — Project foundation](#epic-a--project-foundation)
    * [Epic B — Canonical document model](#epic-b--canonical-document-model)
    * [Epic C — Confluence read path](#epic-c--confluence-read-path)
    * [Epic D — Identity and mapping](#epic-d--identity-and-mapping)
    * [Epic E — Planning and safe publishing](#epic-e--planning-and-safe-publishing)
    * [Epic F — Attachments and diagrams](#epic-f--attachments-and-diagrams)
    * [Epic G — Git workflow](#epic-g--git-workflow)
    * [Epic H — Bidirectional merge](#epic-h--bidirectional-merge)
    * [Epic I — Operations](#epic-i--operations)
    * [Epic J — Distribution and community](#epic-j--distribution-and-community)
  * [33. Key hypotheses to validate early](#33-key-hypotheses-to-validate-early)
  * [34. Final strategic recommendation](#34-final-strategic-recommendation)
  * [Appendix A — Comparative “steal / avoid” summary](#appendix-a--comparative-steal--avoid-summary)
  * [Appendix B — Proof-of-concept evaluation scenarios](#appendix-b--proof-of-concept-evaluation-scenarios)
    * [Identity and lifecycle](#identity-and-lifecycle)
    * [Concurrent content](#concurrent-content)
    * [Attachments](#attachments)
    * [Failure/recovery](#failurerecovery)
    * [Security](#security-1)
  * [Appendix C — Principal evidence and sources](#appendix-c--principal-evidence-and-sources)
    * [Repositories and project documentation](#repositories-and-project-documentation)
    * [Independent/community evidence](#independentcommunity-evidence)
    * [Atlassian platform evidence](#atlassian-platform-evidence)
    * [Open-source project practice](#open-source-project-practice)
  * [Appendix D — Research caveats](#appendix-d--research-caveats)
<!-- TOC -->
---

## Executive summary

The open-source Git/Markdown ↔ Confluence market has produced several successful tools, but **no project has yet won the complete category**.

The most successful repositories specialize in one of four narrower jobs:

1. **Publish Markdown from Git to native Confluence pages** — led by [`kovetskiy/mark`](https://github.com/kovetskiy/mark), with approximately 1,500 stars.
2. **Maximize publishing fidelity and technical-document support** — exemplified by [`hunyadi/md2conf`](https://github.com/hunyadi/md2conf).
3. **Export Confluence into portable Markdown** — led by [`Spenhouet/confluence-markdown-exporter`](https://github.com/Spenhouet/confluence-markdown-exporter), with approximately 486 stars.
4. **Integrate Confluence publishing into an established documentation ecosystem** — exemplified by [`sphinx-contrib/confluencebuilder`](https://github.com/sphinx-contrib/confluencebuilder).

True bidirectional synchronization remains an unclaimed position. The strongest implementation found, [`BjoernSchotte/atlcli`](https://github.com/BjoernSchotte/atlcli), advertises push, pull, watch mode, base-state tracking, conflict detection, and three-way merge, but has only about 29 stars. [`PatD42/confluence-bidir-sync`](https://github.com/PatD42/confluence-bidir-sync) claims a similar model but is still a prototype with about one star and no published package.

This creates a rare opportunity: the category has clear demand, multiple independently validated use cases, and no dominant product that combines **safety, fidelity, lifecycle correctness, excellent developer experience, and Git-native conflict resolution**.

### The most important strategic conclusion

MarksSync should **not launch by promising magical, fully automatic two-way synchronization**. That promise is technically seductive but commercially and reputationally dangerous. The winning path is a progressive trust ladder:

1. become the easiest and safest Git → Confluence publisher;
2. detect and explain Confluence-side drift without overwriting it;
3. pull Confluence changes into a branch and open a reviewable pull request;
4. perform deterministic three-way structural merges where safe;
5. require explicit resolution for unsupported or ambiguous changes;
6. enable continuous bidirectional operation only after the repository has accumulated a strong compatibility corpus and production evidence.

The category leader will not win by supporting the longest checklist. It will win by making teams believe:

> “This tool will not lose content, create duplicate pages, silently overwrite an editor’s work, or break during the next Atlassian API migration.”

### What made the existing winners successful

Across the successful projects, the recurring factors are:

- a sharply defined and immediately understandable job-to-be-done;
- a README that reaches a working result quickly;
- native integration with the user’s existing workflow, such as Git CI, Sphinx, Obsidian, Docker, or Python tooling;
- support for the content types that actually decide adoption: attachments, diagrams, code blocks, tables, links, hierarchy, and labels;
- incremental/no-op behavior that avoids version spam;
- stable page identity rather than title-only matching;
- low-friction distribution;
- visible release activity and current Confluence API compatibility;
- a strong emotional problem: duplicated work, bad WYSIWYG editing, stale documentation, or fear of vendor lock-in.

### What prevented them from owning the category

The recurring constraints are:

- one-way-only architecture;
- title/path identity ambiguity;
- incomplete rename, move, and deletion semantics;
- lossy Markdown ↔ Confluence round trips;
- attachment lifecycle defects;
- outdated Confluence REST API assumptions;
- weak authentication onboarding;
- broad feature surfaces without enough maintainers;
- unclear governance and maintainer succession;
- too little independent production validation;
- no safe bridge from Confluence edits to Git pull requests.

### Recommended category position

**Category:** Git-native documentation synchronization for Confluence.  
**Primary promise:** Safe, reviewable, deterministic synchronization between Markdown in Git and native Confluence pages.  
**Differentiator:** Every change is explainable; every conflict is reviewable; unsupported content is preserved or blocked rather than silently discarded.  
**Initial source-of-truth stance:** Git-authoritative by default, with Confluence drift detection and pull-request-based reverse flow.  
**Long-term stance:** Policy-controlled bidirectional synchronization with structural three-way merging.

### Twelve principles for becoming number one

1. **Trust before automation.** Never trade silent data loss for convenience.
2. **Git workflow, not merely Git storage.** Branches, diffs, commits, PRs, status checks, and authorship must be first-class.
3. **Identity is immutable.** Page IDs and tool-owned UUIDs must survive title/path changes.
4. **Use a canonical intermediate representation.** Do not merge rendered XHTML strings.
5. **Preserve what cannot be represented.** Unsupported Confluence nodes need lossless sidecars or protected blocks.
6. **Make one-way publishing excellent before enabling two-way writes.**
7. **Ship a compatibility laboratory, not just a test suite.** Maintain real Cloud and Data Center test tenants and a public fixture corpus.
8. **Optimize first-run success.** `init`, `login`, `plan`, and `sync` should work without reading a long manual.
9. **Distribute everywhere users already work.** Native binaries, Docker, GitHub Action, GitLab CI example, Homebrew, Scoop/WinGet, and package managers.
10. **Treat Atlassian change as a permanent product requirement.** Track API deprecations, live docs, authentication variants, and rate limits continuously.
11. **Build governance before popularity creates a bottleneck.** Multiple maintainers, contribution paths, release automation, and a public support policy.
12. **Measure successful synchronized repositories and fidelity—not stars alone.**

---

## 1. Scope and interpretation of the threshold

The request can be interpreted as either:

- all repositories with at least 100 stars; or
- repositories with at least 50 stars that also provide bidirectional sync.

The research found **no bidirectional project with 50 or more stars**. To avoid excluding the most strategically important work, this report includes:

- every dedicated project in the problem space with approximately 100 or more stars; and
- the two projects that credibly implement or claim conflict-aware bidirectional synchronization, regardless of star count.

The historical Obsidian repository belonging to the `markdown-confluence` ecosystem is analyzed as a distribution channel of the main project rather than as a separate competitor.

### 1.1 Qualifying projects

Star counts are snapshots observed around 2 July 2026 and should be treated as approximate.

| Project | Approx. stars | Direction | Current status | Why included |
|---|---:|---|---|---|
| [`kovetskiy/mark`](https://github.com/kovetskiy/mark) | 1,500 | Markdown/Git → Confluence | Active; release June 2026 | Clear category leader by visibility |
| [`Spenhouet/confluence-markdown-exporter`](https://github.com/Spenhouet/confluence-markdown-exporter) | 486 | Confluence → Markdown | Active; release June 2026 | Leading reverse/export project |
| [`sphinx-contrib/confluencebuilder`](https://github.com/sphinx-contrib/confluencebuilder) | 352 | Sphinx/MyST docs → Confluence | Active; release April 2026 | Successful ecosystem-integrated publisher |
| [`duo-labs/markdown-to-confluence`](https://github.com/duo-labs/markdown-to-confluence) | 320 | Markdown/Git → Confluence | Legacy/low activity | High historical adoption and strong positioning lessons |
| [`markdown-confluence/markdown-confluence`](https://github.com/markdown-confluence/markdown-confluence) | 271 | Markdown/Git → Confluence | Active users; maintainer risk | Multi-surface ecosystem and ADF strategy |
| [`hunyadi/md2conf`](https://github.com/hunyadi/md2conf) | 219 | Markdown/Git → Confluence | Active | Fidelity and lifecycle benchmark |
| [`meridius/confluence-to-markdown`](https://github.com/meridius/confluence-to-markdown) | 143 | Confluence HTML export → Markdown | Archived | Migration utility success archetype |
| [`iamjackg/md2cf`](https://github.com/iamjackg/md2cf) | 122 | Markdown → Confluence | Mature, slower maintenance | Composable library/CLI archetype |
| [`markdown-confluence/obsidian-integration`](https://github.com/markdown-confluence/obsidian-integration) | 148 | Obsidian → Confluence | Source moved to monorepo | Distribution-channel case study |
| [`BjoernSchotte/atlcli`](https://github.com/BjoernSchotte/atlcli) | 29 | Bidirectional | Active; release May 2026 | Strongest actual bidirectional implementation found |
| [`PatD42/confluence-bidir-sync`](https://github.com/PatD42/confluence-bidir-sync) | 1 | Bidirectional, claimed | Prototype | Direct three-way-sync design reference |

### 1.2 Star History links

| Project | Interactive chart | Embeddable SVG |
|---|---|---|
| Mark | [Star History](https://star-history.com/#kovetskiy/mark&Date) | [SVG](https://api.star-history.com/svg?repos=kovetskiy/mark&type=Date) |
| Confluence Markdown Exporter | [Star History](https://star-history.com/#Spenhouet/confluence-markdown-exporter&Date) | [SVG](https://api.star-history.com/svg?repos=Spenhouet/confluence-markdown-exporter&type=Date) |
| Sphinx Confluence Builder | [Star History](https://star-history.com/#sphinx-contrib/confluencebuilder&Date) | [SVG](https://api.star-history.com/svg?repos=sphinx-contrib/confluencebuilder&type=Date) |
| Duo Labs publisher | [Star History](https://star-history.com/#duo-labs/markdown-to-confluence&Date) | [SVG](https://api.star-history.com/svg?repos=duo-labs/markdown-to-confluence&type=Date) |
| markdown-confluence | [Star History](https://star-history.com/#markdown-confluence/markdown-confluence&Date) | [SVG](https://api.star-history.com/svg?repos=markdown-confluence/markdown-confluence&type=Date) |
| hunyadi/md2conf | [Star History](https://star-history.com/#hunyadi/md2conf&Date) | [SVG](https://api.star-history.com/svg?repos=hunyadi/md2conf&type=Date) |
| meridius converter | [Star History](https://star-history.com/#meridius/confluence-to-markdown&Date) | [SVG](https://api.star-history.com/svg?repos=meridius/confluence-to-markdown&type=Date) |
| iamjackg/md2cf | [Star History](https://star-history.com/#iamjackg/md2cf&Date) | [SVG](https://api.star-history.com/svg?repos=iamjackg/md2cf&type=Date) |
| Obsidian integration | [Star History](https://star-history.com/#markdown-confluence/obsidian-integration&Date) | [SVG](https://api.star-history.com/svg?repos=markdown-confluence/obsidian-integration&type=Date) |
| atlcli | [Star History](https://star-history.com/#BjoernSchotte/atlcli&Date) | [SVG](https://api.star-history.com/svg?repos=BjoernSchotte/atlcli&type=Date) |
| confluence-bidir-sync | [Star History](https://star-history.com/#PatD42/confluence-bidir-sync&Date) | [SVG](https://api.star-history.com/svg?repos=PatD42/confluence-bidir-sync&type=Date) |

### 1.3 Evidence model

This report distinguishes:

- **observed facts** — repository metadata, documentation, releases, issues, and official Atlassian documentation;
- **independent feedback** — Reddit, Hacker News, Atlassian Community, and user discussions;
- **reasoned inference** — conclusions drawn from adoption, architecture, packaging, activity, and user pain;
- **recommendation** — proposed action for MarksSync.

Independent commentary is sparse for many small developer tools. A lack of public discussion should not be interpreted as either satisfaction or failure. It is itself a market signal: many tools are discovered, adopted, and abandoned privately inside companies without generating a visible community.

---

## 2. The market is not one category

A critical strategic error would be treating every repository as a direct competitor. They solve different jobs and therefore accumulate stars for different reasons.

### 2.1 The five jobs-to-be-done

#### Job A — Publish reviewed engineering documentation to Confluence

The user wants Markdown beside source code, pull-request review, and Confluence accessibility for non-engineers. Mark, md2conf, Duo Labs, and markdown-confluence address this job.

The emotional trigger is duplicated work and stale copies. The economic buyer often does not care about Markdown itself; they care about reducing documentation drift without forcing the whole company into GitHub.

#### Job B — Preserve technical fidelity

The user has tables, diagrams, code blocks, alerts, attachments, relative links, nested hierarchy, labels, and macros. The winner is the tool that makes a representative corpus look correct with the least manual cleanup. `hunyadi/md2conf` and Sphinx Confluence Builder are strong here.

#### Job C — Escape or back up Confluence

The user fears vendor lock-in, needs migration, wants local search/RAG, or wants content in Obsidian. The leading exporter benefits from a stronger emotional narrative than “publish another copy”: data portability and organizational control.

#### Job D — Fit an existing authoring ecosystem

The user does not want a generic sync product; they want “the Sphinx publisher,” “the Obsidian plugin,” “the GitHub Action,” or “the MkDocs plugin.” Distribution through an existing ecosystem lowers adoption friction and creates a clear discovery path.

#### Job E — Allow both sides to be edited safely

This is the broadest and most valuable job, but also the least solved. It combines conversion, identity, event processing, merge semantics, Git workflow automation, permissions, and human conflict resolution. No current project has obtained category-level adoption here.

### 2.2 Why stars are not directly comparable

A star can mean:

- “I use this in production”;
- “I may need this migration once”;
- “this is an elegant idea”;
- “my company created it”;
- “I want to watch the project”;
- “the project ranked well for a search phrase.”

A migration script can earn many stars from one-time demand. An enterprise-grade synchronizer can have fewer stars while serving larger installations. Fork count can indicate operational adaptation, but it can also indicate abandoned pull requests or dependency fixes. Release count can indicate maturity, but it can also indicate automated micro-releases.

For MarksSync, stars should be treated as a **top-of-funnel discovery metric**, not the north-star metric.

### 2.3 High-level competitive scorecard

Scores are analytical judgments from 1 (weak) to 5 (strong), based on public evidence as of the research date.

| Project | Adoption | Current maintenance | First-run UX | Fidelity breadth | Lifecycle correctness | Git-native workflow | Bidirectional safety | Governance resilience |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Mark | 5 | 5 | 4 | 4 | 3 | 4 | 1 | 3 |
| Confluence Markdown Exporter | 4 | 5 | 4 | 4 reverse | 4 reverse | 2 | 1 | 3 |
| Sphinx Confluence Builder | 4 | 5 | 3 | 5 in Sphinx scope | 4 | 4 | 1 | 5 |
| Duo Labs publisher | 4 historical | 1 | 3 | 2 | 2 | 4 | 1 | 1 |
| markdown-confluence | 4 ecosystem | 3 | 4 | 4 | 3 | 4 | 1 | 2 |
| hunyadi/md2conf | 3 | 5 | 3 | 5 | 4 | 3 | 1 | 3 |
| meridius converter | 3 historical | 1 archived | 2 | 2 | 1 | 1 | 1 | 1 |
| iamjackg/md2cf | 3 | 2 | 4 | 3 | 2 | 3 | 1 | 2 |
| atlcli | 1 | 5 | 4 | 3 | 4 claimed | 4 | 4 claimed | 2 |
| confluence-bidir-sync | 1 | 2 | 1 | 3 claimed | 3 claimed | 2 | 3 claimed | 1 |

### 2.4 The open position

No project scores strongly across all of these dimensions:

- easy installation and authentication;
- excellent Markdown fidelity;
- native Confluence pages;
- page-tree reconciliation;
- immutable identity;
- correct move/rename/delete behavior;
- attachment lifecycle;
- current Cloud and Data Center compatibility;
- drift detection;
- structural diffs;
- safe reverse flow into Git;
- pull-request automation;
- three-way conflict handling;
- strong governance.

That is the position MarksSync can own.

---

## 3. Deep success analysis: `kovetskiy/mark`

### 3.1 Project profile

- Repository: <https://github.com/kovetskiy/mark>
- Approximate adoption: 1,500 stars, 219 forks
- Engineering depth: roughly 805 commits
- Activity: active; around 110 releases, with v16.5.0 published 29 June 2026
- Implementation: Go
- License: Apache-2.0
- Direction: Markdown/Git → Confluence

Mark is the most visible dedicated Markdown-to-Confluence publisher. It is the incumbent that a new generic CLI will be compared against first.

### 3.2 The product thesis that worked

Mark states the problem in language users immediately recognize: documentation lives in Git, manual Confluence editing is unpleasant, and nobody wants to update both copies. It then describes a concrete mechanism: read Markdown, locate or create a page, upload attachments, convert content, and update Confluence through the REST API.

This is successful positioning because it combines:

- a familiar pain;
- a specific target user;
- a clear source of truth;
- an obvious automation boundary;
- a result that can be demonstrated in seconds.

It does not lead with architecture or abstract synchronization theory. It leads with the eliminated chore.

### 3.3 Technical success factors

#### A standalone Go binary

Go is highly effective for infrastructure CLIs. Users can download one executable, run it in CI, use it in Docker, or install it through common package paths. There is no Python virtual environment, npm runtime, JVM, or dependency conflict to solve before the first page is published.

This matters disproportionately for adoption. The person evaluating the tool may tolerate complexity, but the team maintaining twenty CI pipelines will prefer a static artifact.

#### Metadata travels with the document

Mark’s extended Markdown uses HTML comments for space, parent, folder, title, attachments, labels, layout, and related controls. This design has drawbacks, but it solves an important problem: publishing intent is versioned and reviewed beside content.

The deeper success factor is not the exact syntax. It is **co-location of content and publication metadata**.

#### It supports adoption-deciding technical content

Mark supports attachments, includes, layouts, macros, code-block options, GitHub-style alerts, task lists, Mermaid, PlantUML, D2, labels, page icons, and page appearance. Teams rarely reject a tool because a paragraph is rendered imperfectly; they reject it because diagrams, attachments, tables, or links do not work.

#### It creates missing hierarchy

Automatic parent/folder creation turns the tool from a page updater into a repository-to-space publisher. This reduces preconfiguration and makes a greenfield demo impressive.

#### It supports both local inspection and CI automation

Dry-run/compile paths, changed-content publishing, glob selection, Docker, and release binaries make it usable from experimentation through CI.

### 3.4 Distribution and marketing success factors

#### A memorable, short name

“Mark” is brief and relevant to Markdown. It is not perfect for search-engine uniqueness, but it is easy to remember and type.

#### Long-term visible maintenance

Approximately 110 releases and a June 2026 release signal survival. Enterprise users do not merely evaluate feature lists; they evaluate whether the tool is likely to keep working when Atlassian changes an endpoint.

#### The community can explain the value in one sentence

A Hacker News user summarized the value without maintainer language: documentation remains in Git for review and beside code, while people without repository permissions can access it in Confluence. Another commenter reacted that the idea was so simple it felt like it should be native to Confluence.

This is a strong marker of product-market clarity: users can retell the story.

### 3.5 What users praise

Independent feedback emphasizes:

- pull-request review for documentation;
- documentation residing with the code;
- Confluence visibility without exposing proprietary repositories;
- avoiding Confluence’s editing experience;
- automation of page creation and updates.

The praise is not mainly about the Markdown parser. It is about **organizational workflow reconciliation**.

### 3.6 What limits Mark

#### Git is authoritative; Confluence edits are not safely reconciled

Mark solves one-way publication. It does not offer a credible reverse path or conflict protocol.

#### Metadata syntax is powerful but intrusive

HTML comments keep files valid Markdown, but they create visual noise and make repository-wide mapping harder to centralize. Users may want front matter, a mapping file, conventions, or all three.

#### Attachment lifecycle is inherently difficult

Issue history includes replacement, same-name, and media edge cases. Uploading a file is easy; safely deciding when to update, retain, rename, detach, or delete it is a lifecycle problem.

#### Page lifecycle remains weaker than page rendering

Move, rename, and delete semantics need careful validation. Matching by title is not an immutable identity model. Deleting remote pages based on an absent local file can be catastrophic when the local checkout is partial or an include pattern changed.

#### The breadth creates an issue backlog

A large open issue count is partly an adoption signal, but it also means users encounter real compatibility edges. Mature popularity raises the support obligation.

### 3.7 Why Mark became the default

Mark’s success is best explained by the combination of:

1. **early and obvious problem selection**;
2. **a simple mental model**;
3. **low-friction binary distribution**;
4. **enough technical-document fidelity to pass real evaluations**;
5. **CI readiness**;
6. **continued releases over years**;
7. **a value proposition users can repeat**.

Its dominance does not prove that its conversion model is uniquely superior. It proves that a reliable, discoverable, portable tool with adequate breadth can become the default.

### 3.8 Lessons for MarksSync

**Copy:**

- one-command native binary installation;
- immediate Git-to-Confluence result;
- content metadata versioned with source;
- rich technical content from the beginning;
- dry-run and compile/preview modes;
- release discipline;
- concise user-centered positioning.

**Improve:**

- allow both repository-level mappings and per-document overrides;
- use immutable IDs, not titles, as identity;
- make lifecycle changes explicit in a plan;
- add Confluence drift detection before writes;
- add a safe reverse PR flow;
- provide structural, readable diffs;
- preserve unsupported nodes rather than flattening them.

**Do not copy:**

- making HTML-comment metadata the only configuration model;
- treating attachment upload as sufficient lifecycle management;
- silently assuming one-way authority when remote edits exist.

---

## 4. Deep success analysis: `hunyadi/md2conf`

### 4.1 Project profile

- Repository: <https://github.com/hunyadi/md2conf>
- Approximate adoption: 219 stars, 79 forks
- Engineering depth: roughly 367 commits
- Activity: active in 2026
- Implementation: Python CLI and library
- License: MIT
- Direction: Markdown/Git → Confluence

### 4.2 The product thesis that worked

`md2conf` wins by treating publishing as a document-fidelity and hierarchy problem rather than as a simple HTML upload. Its documentation is explicit about why teams need the tool: engineers write and review Markdown in version control, while other employees consume documentation in Confluence; manual replication creates stale copies.

The project’s differentiation is cumulative completeness. No single feature explains its success. The combination does:

- recursive hierarchy;
- stable page identity;
- safe ancestor checks;
- relative-link resolution;
- title updates and conflict warnings;
- child-page ordering;
- attachments;
- broad Markdown extensions;
- diagrams and mathematics;
- modern authentication and API support.

### 4.3 Technical success factors

#### Explicit REST API v2 alignment

The project documents its preference for Confluence Cloud REST API v2. This is strategically important because Atlassian deprecated many v1 endpoints and moved the ecosystem toward v2. Tools that ignore API evolution can retain stars while becoming operationally unusable.

#### Conservative identity and overwrite safety

`md2conf` supports explicit page IDs in comments or front matter. When matching by title, it requires the page to trace to a trusted ancestor before updating it. This is a crucial design principle: **failing closed is preferable to updating the wrong page**.

It can inject the resolved page ID into source, converting a probabilistic first match into deterministic future runs.

#### It performs a two-pass repository-level analysis

A directory is indexed before links are rewritten. This enables relative links between documents to become correct Confluence page links. The lesson is that tree publication cannot be modeled as N independent file uploads.

#### Page order is treated as state

Synchronizing child order shows attention to the complete navigation experience. Many tools create the right pages but leave a poor information architecture.

#### Rich content support targets real acceptance criteria

Its feature set includes task lists, alerts/admonitions, collapsible sections, status/date widgets, Draw.io, Mermaid, PlantUML, and LaTeX. It supports both rendered assets and integration paths with Marketplace apps.

#### Security constraints appear in ordinary behavior

Local attachment paths are constrained to the synchronization root, preventing path traversal outside the intended tree. This is the kind of detail that separates an upload script from a production-minded tool.

#### It can be embedded as a library

A Python API allows reuse and custom extensions. This increases forkability and lets organizations adapt conversion logic without shelling out to a monolithic executable.

### 4.4 Distribution and UX factors

Python/PyPI is less frictionless than a static binary, but it has advantages:

- familiar installation for documentation and automation teams;
- easy extension;
- broad parser ecosystem;
- Docker availability;
- rapid support for custom processing.

The project’s documentation is unusually detailed. It explains token scopes, scoped API URLs, identity, hierarchy, strict Markdown behavior, image constraints, and diagram options. Documentation depth reduces support load and builds trust.

### 4.5 Signals of success

- a meaningful fork count relative to stars, suggesting adaptation and operational use;
- active maintenance;
- explicit API-v2 work;
- an integration-test directory and substantial test corpus;
- very low open issue count at the research snapshot;
- a feature set that directly maps to technical-documentation evaluations.

The low open issue count should not be read as proof of zero defects, but combined with active commits and extensive documentation it suggests disciplined maintenance.

### 4.6 Limitations

#### One-way authority

The project intentionally avoids the hardest problem: reconciling human edits made in Confluence.

#### Runtime/dependency friction

Diagram rendering can require Node, Java, Graphviz, Draw.io, or Matplotlib in addition to Python. This is defensible for rich rendering, but makes a universal “single binary” promise harder.

#### Strict parsing can surprise users

Standards-compliant Markdown behavior around blank lines and indentation can differ from permissive previewers. Correctness needs actionable diagnostics rather than generic parse failures.

#### Enterprise networking variants remain a source of friction

Proxies, custom headers, gateways, scoped tokens, and nonstandard base paths create integration complexity.

### 4.7 Why it succeeded

`md2conf` demonstrates that a smaller project can compete with a much more starred incumbent through:

- depth in high-value edge cases;
- modern API compatibility;
- conservative safety behavior;
- excellent technical documentation;
- comprehensive content support;
- a reusable library architecture.

It is a **quality specialist**, not primarily a marketing winner.

### 4.8 Lessons for MarksSync

**Copy:**

- trusted-root safety checks;
- page-ID injection or an equivalent stable mapping;
- precomputed repository graph;
- minimal, deliberate reordering operations;
- rich fixtures and integration tests;
- explicit authentication scopes;
- safe local path handling;
- extension points for custom syntax and macros.

**Improve:**

- package the common path as a single native binary;
- make optional renderers discoverable through `doctor` and capability checks;
- add reverse conversion using the same canonical model;
- move from text diff to structural diff;
- record provenance for each generated node;
- provide explainable planning for every remote mutation.

---

## 5. Deep success analysis: `markdown-confluence`

### 5.1 Project profile

- Repository: <https://github.com/markdown-confluence/markdown-confluence>
- Approximate adoption: 271 stars in the main repository
- Related historical Obsidian repository: approximately 148 stars
- Engineering depth: roughly 641 commits in the main repository
- Implementation: TypeScript monorepo
- License: Apache-2.0
- Distribution: CLI, npm library, Docker, GitHub Action, Obsidian plugin
- Direction: Markdown/Git → Confluence
- Material risk: public request for help resolving an unmaintained/orphaned project situation in May 2026

### 5.2 The product thesis that worked

The project’s strongest idea is that one conversion engine should power multiple entry points. A developer can use the CLI or GitHub Action; an application can use the npm library; a knowledge worker can publish from Obsidian.

This expands discovery and reduces audience fragmentation. It also shifts the product from “a command” to “an ecosystem.”

### 5.3 Technical success factors

#### ADF-native positioning

The project converts Markdown to Atlassian Document Format rather than relying solely on legacy storage XHTML. This aligns conceptually with modern Atlassian editor structures and creates a foundation for richer structural operations.

ADF alone does not solve reverse synchronization, but an AST-oriented model is directionally better than string replacement.

#### Shared core across delivery surfaces

A monorepo can keep conversion semantics consistent across CLI, Action, Docker, library, and Obsidian. This is the correct architectural shape when multiple user interfaces need the same engine.

#### Directory mirroring and move support

The project attempts to move pages when files move, which addresses a lifecycle gap ignored by many publishers.

#### Attachment hashing

Hash-based change detection avoids unnecessary uploads and version churn.

#### Obsidian syntax support

Obsidian is a powerful distribution wedge. Users already author Markdown, care about local ownership, and often need to publish selected material to enterprise systems.

### 5.4 Distribution success factors

This project demonstrates the compounding effect of multiple adoption surfaces:

- npm discoverability;
- GitHub Marketplace/Action workflows;
- Docker-based CI;
- CLI usage;
- Obsidian plugin discovery;
- library embedding.

The historical Obsidian repository’s star count is evidence that a vertical integration can build a community separate from the core CLI.

### 5.5 What the maintainer situation teaches

In May 2026, a community member publicly sought guidance on the project’s maintainer situation and described active users and contributors willing to help. This is both positive and negative evidence:

- positive: the tool has enough value that users want to rescue it;
- negative: ownership, copyright, release authority, and maintainer succession were not resilient enough.

An open-source project can have current code and willing contributors yet still become operationally blocked if governance is unclear.

### 5.6 Limitations and complaints

Public issues include:

- older REST endpoint failures and migration pressure;
- Node/GitHub Action runtime updates;
- Mermaid rendering on specific platforms;
- unnecessary publication of unchanged files;
- macro coverage gaps;
- image sizing;
- nested parent behavior;
- Obsidian integration breakage;
- requests for bidirectional behavior.

The pattern is important: every additional delivery surface multiplies compatibility work. A change in Confluence, Node, GitHub Actions, Obsidian, Chromium/Mermaid, or a package dependency can break part of the experience.

### 5.7 Why it succeeded

- differentiated ADF message;
- broad distribution;
- editor-level integration;
- shared TypeScript core;
- support for repository hierarchy and attachments;
- strong overlap with the local-first/Obsidian audience.

### 5.8 Why it did not become the category leader

- maintenance/governance risk reduced trust;
- the breadth of interfaces exceeded sustainable maintainer capacity;
- no reverse synchronization or conflict model;
- platform churn created a large compatibility surface;
- fragmented repositories and ownership history complicated the project.

### 5.9 Lessons for MarksSync

**Copy:**

- one core engine with multiple thin adapters;
- a native GitHub Action;
- a library/API for integrations;
- an editor/plugin path after the CLI stabilizes;
- structural internal representation;
- attachment hashing.

**Improve:**

- establish an organization, release keys, maintainer policy, and succession model from day one;
- avoid launching five interfaces before the core compatibility suite is mature;
- keep adapter contracts versioned and thin;
- publish a compatibility matrix and end-of-support policy;
- make bidirectional semantics part of the core model, not a late wrapper.

**Strategic warning:** breadth creates stars, but unsupported breadth destroys trust. Sequence interfaces rather than launching them all simultaneously.

---

## 6. Deep success analysis: `duo-labs/markdown-to-confluence`

### 6.1 Project profile

- Repository: <https://github.com/duo-labs/markdown-to-confluence>
- Approximate adoption: 320 stars, 60 forks
- Engineering depth: only roughly 28 commits
- Releases: no formal GitHub releases observed
- Implementation: Python
- License: Apache-2.0
- Direction: Markdown/Git → Confluence
- Status: historical/legacy

### 6.2 Why this project matters despite its age

The star-to-commit ratio is unusually high. This does not mean exceptional software quality. It indicates that **positioning, timing, company credibility, and a sharply bounded use case can create substantial visibility with a small codebase**.

### 6.3 The successful thesis

The tool was built to publish Duo Labs Journal posts to Confluence in CI. It supports Markdown with Hugo/Jekyll-style front matter, can publish files modified in the latest Git commit, accepts explicit file lists, offers Docker, and supports dry-run.

This is a highly legible workflow:

> “When a documentation post changes in Git, publish that changed post to Confluence during CI.”

It avoids claiming full tree reconciliation or bidirectionality.

### 6.4 Success factors

#### Company-backed credibility

A recognizable security company publishing an internal tool provides social proof. Potential users infer that the tool solved a real production need rather than being a weekend experiment.

#### Strong CI story

The `--git` mode maps directly to a pipeline trigger and changed files. No elaborate state service is required.

#### Compatibility with existing static-site metadata

Supporting Hugo/Jekyll front matter lets teams reuse documents rather than maintain Confluence-specific copies.

#### Small conceptual surface

The README can explain the entire product quickly. A user can evaluate it without learning a synchronization framework.

#### Good timing

It entered a market with obvious pain and fewer mature alternatives. Early repositories retain search ranking, links, and stars even after maintenance slows.

### 6.5 Limitations and failure modes

Issues show dependency aging, PyYAML/Mistune breakage, dry-run problems, packaging requests, and Git assumptions. There is no robust repository lifecycle, modern API strategy, or reverse flow.

The key lesson is that **historical stars can outlive operational fitness**. A new project can beat a highly starred legacy tool by being current, packaged, tested, and maintained.

### 6.6 Lessons for MarksSync

**Copy:**

- demonstrate a single CI workflow before explaining advanced architecture;
- support standard front matter;
- include a minimal pipeline example in the README;
- use a real internal adoption story;
- keep the first use case narrow.

**Improve:**

- formal releases and changelog;
- automated dependency updates and compatibility tests;
- complete tree/lifecycle model;
- current authentication and REST v2 support;
- explicit maintenance policy.

**Do not overlearn from the stars:** Duo proves that a great narrative and timing can generate interest, not that a small legacy publisher is the technical benchmark.

---

## 7. Deep success analysis: Sphinx Confluence Builder

### 7.1 Project profile

- Repository: <https://github.com/sphinx-contrib/confluencebuilder>
- Approximate adoption: 352 stars, 104 forks
- Engineering depth: roughly 3,736 commits
- Releases: approximately 24; v3.1 in April 2026
- Open issue count at snapshot: low single digits
- Implementation: Python/Sphinx extension
- License: BSD-2-Clause
- Direction: Sphinx documentation, including Markdown through MyST, → Confluence

### 7.2 The successful thesis

This project does not try to own generic Markdown synchronization. It becomes the Confluence output backend for an established documentation system.

That is a powerful strategy because Sphinx already provides:

- a document graph;
- cross-references;
- extension mechanisms;
- build configuration;
- themes and directives;
- a mature author community;
- a known CI model.

The Confluence builder can focus on translating this semantic model into Confluence and publishing it.

### 7.3 Success factors

#### Ecosystem leverage

The project inherits Sphinx’s credibility, mental model, and user base. Users search for “Sphinx Confluence,” not for a generic sync category.

#### Professional documentation

A large manual, configuration reference, examples, changelog, and demo site communicate seriousness. Enterprise tools are often selected from documentation quality before a proof of concept begins.

#### Long-lived engineering depth

Thousands of commits and current releases signal sustained adaptation. This is especially important in a platform integration where both Sphinx and Confluence evolve.

#### Narrow but deep compatibility promise

The project can say: “If your documentation builds in Sphinx, this builder will publish it.” A constrained source model enables better fidelity than arbitrary Markdown dialects.

#### Cloud and Data Center awareness

Serving both deployment models expands the enterprise market and forces explicit compatibility handling.

#### Extension architecture

Sphinx’s extension model provides a natural route for custom directives and third-party behavior.

### 7.4 Limitations

- it is not a universal raw-Markdown repository synchronizer;
- users must adopt Sphinx/MyST conventions;
- extension interactions create compatibility edges;
- reverse synchronization is out of scope;
- setup is heavier than a single-file CLI.

Issues around attachments, SVG, Mermaid nodes, URL encoding, XHTML parsing, duplicate page conditions, and third-party extensions show that even a mature semantic pipeline encounters Confluence-specific edges.

### 7.5 Why it succeeded

This is the strongest example of **winning a subcategory by integrating deeply with an existing platform rather than competing horizontally**.

Its success factors are:

- ecosystem distribution;
- constrained input semantics;
- professional documentation;
- long maintenance history;
- enterprise deployment coverage;
- explicit extension mechanisms.

### 7.6 Lessons for MarksSync

MarksSync should remain a generic engine, but it should expose adapters so that ecosystems can adopt it:

- MkDocs plugin;
- Sphinx/MyST adapter;
- Docusaurus integration;
- Obsidian plugin;
- Antora/AsciiDoc adapter later;
- MCP/AI-agent interface.

The engine should own identity, conversion, diff, planning, and synchronization. Ecosystem adapters should supply source documents and metadata.

A category leader does not need to replace Sphinx Confluence Builder. It can become the synchronization substrate beneath ecosystem-specific experiences.

---

## 8. Deep success analysis: `Spenhouet/confluence-markdown-exporter`

### 8.1 Project profile

- Repository: <https://github.com/Spenhouet/confluence-markdown-exporter>
- Approximate adoption: 486 stars, 120 forks
- Engineering depth: roughly 632 commits
- Releases: approximately 55; v5.2.1 in June 2026
- Implementation: Python CLI and Docker image
- License: MIT
- Direction: Confluence → Markdown

### 8.2 Why the leading exporter is strategically important

A product intended to become the best bidirectional synchronizer must study the leading reverse tool as carefully as the leading publisher. Export quality defines half of the round trip.

This project also reveals a market dynamic that publisher-only projects can miss: **portability and escape are stronger emotional triggers than publication convenience**.

Users may tolerate manual copy/paste for years, then urgently need to:

- migrate away from Confluence;
- create a backup they control;
- ingest pages into a local search or RAG system;
- move content into Obsidian, Gollum, Foam, Dendron, or Azure DevOps;
- audit the organization’s documentation outside the vendor platform.

### 8.3 The product thesis that worked

The tool exports pages, descendants, or spaces through the API and produces cleaned Markdown with hierarchy, rewritten links, images, attachments, and target-specific presets.

The key insight is that **there is no single universal Markdown destination**. Obsidian, Gollum, Foam, Dendron, and Azure DevOps have different link and metadata conventions. Destination presets make the output immediately useful.

### 8.4 Technical success factors

#### Direct API export

The project avoids requiring a manually downloaded HTML export and can support incremental operation.

#### Incremental behavior

Skipping unchanged pages reduces time, API load, and noisy file churn. This is essential for recurring mirrors and backups.

#### Hierarchy and link rewriting

An export that produces isolated Markdown files but broken internal links is not a usable knowledge base. Reconstructing the graph is a core feature.

#### Attachments are first-class

Images and attachments carry meaningful organizational knowledge. Exporters that ignore them are migration demos, not production tools.

#### Destination presets

This reduces the gap between “conversion succeeded” and “the result works in my target system.” It is also an effective expansion strategy: each preset creates a new search/discovery path.

#### Multiple installation modes

PyPI, `uvx`, Docker, and scripts lower friction across local and CI usage.

### 8.5 Independent user feedback

Reddit users have recommended the project for escaping Confluence and reported that it worked reasonably well in testing. The same feedback includes an important warning: users should expect to inspect important pages manually because no converter can perfectly preserve every macro and layout.

This is unusually valuable feedback because it validates both the demand and the limit:

- users consider the tool useful enough to recommend;
- users do not consider the output perfectly lossless.

### 8.6 Success factors beyond technology

#### The repository name matches the search query

“confluence-markdown-exporter” is explicit and search-friendly. A user searching for exactly that task can discover it without knowing a brand name.

#### The project maintains momentum

Recent releases, active issues, and current documentation distinguish it from archived migration scripts.

#### The scope is disciplined

The tool does not promise push, merge, or continuous bidirectionality. This lets the maintainer optimize export quality and destination usability.

#### The project benefits from anti-lock-in sentiment

Vendor-exit tools attract attention even from users who do not need them immediately. Starring an exporter is a low-cost insurance policy.

### 8.7 Limitations

- unsupported macros and third-party app nodes cannot always be represented in Markdown;
- export incrementality does not reconcile local edits;
- reverse identity and provenance must be added before output can safely become input;
- authentication and scoped-token gateway variants create edge cases;
- large or pathological page constructs can produce unexpectedly large output;
- destination-specific cleanup can reduce round-trip fidelity if the result is later pushed back.

### 8.8 Why it succeeded

The project combines:

- a high-emotion problem;
- a precise repository name;
- active maintenance;
- good packaging;
- hierarchy/link/attachment completeness;
- target presets;
- an honest, bounded promise.

### 8.9 Lessons for MarksSync

**Copy:**

- first-class pull/export from the beginning, even before auto-merge;
- incremental checkpoints;
- target profiles;
- hierarchy reconstruction;
- local link correctness;
- direct API support;
- portable output suitable for Git.

**Improve:**

- retain source page IDs, versions, node IDs, and provenance;
- separate canonical lossless state from human-edited Markdown;
- generate a round-trip report identifying lossy nodes;
- create a pull request rather than directly rewriting the default branch;
- retain unsupported Confluence structures in sidecars or protected blocks.

**Strategic opportunity:** MarksSync can attract exporter users by being a trustworthy backup/export tool before they ever enable publishing.

---

## 9. Deep success analysis: `meridius/confluence-to-markdown`

### 9.1 Project profile

- Repository: <https://github.com/meridius/confluence-to-markdown>
- Approximate adoption: 143 stars, 53 forks
- Engineering depth: roughly 71 commits
- Status: archived in December 2021
- Implementation: shell/Node/Pandoc/Turndown pipeline
- License: MIT
- Direction: Confluence HTML export → Markdown

### 9.2 The successful thesis

The repository’s description—“Confluence to Markdown converter which is actually working”—is unusually effective. It speaks directly to users who already tried generic conversion and were disappointed.

The tool takes an exported Confluence archive and applies Pandoc, Turndown, and custom processing to links and assets. It does not need Confluence API credentials.

### 9.3 Success factors

#### It solved a bounded migration event

One-time migration tools do not need continuous state, webhooks, version reconciliation, or authentication. They can provide value with a much smaller implementation.

#### It reused proven converters

Leveraging Pandoc and Turndown reduced development cost. The project focused on Confluence-specific cleanup rather than recreating a document converter.

#### It improved an existing abandoned lineage

The project forked and advanced earlier work. This is an important open-source growth pattern: users follow the fork that visibly fixes the problem.

#### Strong search positioning

The repository name and tagline precisely match user intent.

#### It could run without admin/API access

Many migration users can obtain an HTML export but cannot create API tokens or install an app. A file-based workflow expands accessibility.

### 9.4 Limitations

- no live API or incrementality;
- dependent on the structure of Confluence HTML exports;
- macros may remain raw HTML or require manual cleanup;
- image paths and links can need post-processing;
- no package-level polished installation;
- archived and vulnerable to dependency/environment drift;
- not suitable as a synchronization engine.

### 9.5 Why it accumulated significant stars

It solved an urgent, concrete, searchable problem with a small tool. Its success illustrates that users reward a tool that “actually works” on messy input even if the architecture is not comprehensive.

### 9.6 Lessons for MarksSync

- maintain a first-class migration/import command;
- provide an offline converter for Confluence export archives;
- use migration as an acquisition channel;
- produce a detailed cleanup/loss report;
- make every migration output immediately commit-ready;
- never confuse migration conversion with synchronization correctness.

A powerful launch tactic would be:

> `marksync migrate confluence-export.zip --to ./docs`

Then offer to connect the resulting repository back to Confluence with stable IDs and safe sync.

---

## 10. Deep success analysis: `iamjackg/md2cf`

### 10.1 Project profile

- Repository: <https://github.com/iamjackg/md2cf>
- Approximate adoption: 122 stars, 67 forks
- Engineering depth: roughly 246 commits
- Releases: approximately 13; latest observed in August 2023
- Implementation: Python library and CLI
- License: MIT
- Direction: Markdown → Confluence

### 10.2 The successful thesis

`md2cf` combines three things:

1. a Markdown-to-Confluence Storage Format converter;
2. a small REST client;
3. a command-line publisher.

This makes it useful both as an end-user tool and as a reusable building block.

### 10.3 Technical success factors

#### Library plus CLI

A library expands the project’s value beyond the original command. Organizations can integrate conversion into internal workflows, and forks can customize behavior.

#### Two-pass relative-link processing

Repository links require knowledge of target pages. This is more sophisticated than independent file conversion.

#### Flexible title derivation

CLI options, front matter, first H1, and filename conventions reduce required metadata.

#### Practical enterprise switches

Environment variables, personal access tokens, recursive publishing, stdin, dry-run, and optional insecure TLS for controlled environments address real deployment conditions.

### 10.4 Adoption signal: unusually high fork ratio

The fork count is high relative to stars. This can indicate:

- users needed custom fixes or integrations;
- the library was useful as a base;
- upstream maintenance did not absorb all changes;
- organizations operated private variants.

A high fork ratio is not automatically positive. It is evidence of utility and extensibility, but may also indicate fragmentation.

### 10.5 Limitations

- slower recent release cadence;
- older storage-format/API assumptions need validation;
- rename can leave an old page behind;
- title and label edge cases remain;
- dependency constraints and parser versions have required community work;
- many open pull requests suggest maintainer throughput risk;
- no reverse synchronization or merge model.

### 10.6 Why it succeeded

- composable architecture;
- pip/pipx-friendly CLI;
- small and understandable implementation;
- practical recursive and link behavior;
- reusable conversion library;
- enough flexibility for internal adaptation.

### 10.7 Lessons for MarksSync

**Copy:**

- expose a stable programmatic API;
- separate conversion, API client, planning, and CLI layers;
- support stdin/stdout for Unix composition;
- keep core packages independently testable;
- let users customize adapters without forking the engine.

**Improve:**

- design extension points before private forks proliferate;
- publish a plugin SDK and compatibility contract;
- maintainers should merge or explicitly close community PRs quickly;
- automate releases and dependency updates;
- make lifecycle semantics part of the engine, not scripts around it.

---

## 11. Deep success analysis: `BjoernSchotte/atlcli`

### 11.1 Project profile

- Repository: <https://github.com/BjoernSchotte/atlcli>
- Documentation: <https://atlcli.sh/confluence/sync/>
- Approximate adoption: 29 stars, 8 forks
- Engineering depth: roughly 323 commits
- Releases: 18; v0.17.0 in May 2026
- Implementation: TypeScript/Bun monorepo, with some Python
- License: MIT
- Direction: claimed and documented bidirectional Markdown ↔ Confluence
- Additional scope: Jira CLI, plugins, exports, dashboard work

### 11.2 Why it is strategically more important than its star count

`atlcli` is the most complete public attempt found at the functionality MarksSync ultimately wants:

- initialization of a local sync directory;
- pull and push;
- continuous watch mode;
- local filesystem events and remote polling;
- optional webhooks;
- state files;
- conflict detection;
- local, remote, and merge resolution strategies;
- documented three-way merge and conflict markers;
- dry-run and JSON output;
- attachment sync;
- hierarchy and folder handling;
- Git plugin;
- Cloud and Data Center support.

It proves that the desired command model is implementable. It does **not** yet prove reliability at broad production scale.

### 11.3 Product and UX success factors

#### A polished CLI narrative

The sequence is intuitive:

```bash
atlcli auth init
atlcli wiki docs init ./my-docs --space TEAM
atlcli wiki docs pull ./my-docs
# edit
atlcli wiki docs push ./my-docs
```

The documentation separates initialization, watch, pull, push, diff, conflict resolution, status, hierarchy, JSON output, and troubleshooting.

#### Multiple installation routes

Quick-install script, Homebrew, Windows archive, and source build create a credible cross-platform story.

#### Operational features are visible

JSONL logging, dry-run, lock files, rate-limit troubleshooting, validation, audit, and multiple auth profiles signal an operational tool rather than a converter script.

#### The three-way model is explicit

The project names conflict strategies and documents conflict markers. Even if edge-case fidelity is unproven, this is better product communication than merely claiming “two-way sync.”

### 11.4 Technical success factors

#### Persistent state

Bidirectionality requires a common base. A state file records enough information to decide whether local, remote, or both sides changed.

#### Scope-aware polling

Single page, ancestor tree, and whole-space modes acknowledge that remote detection cost differs by scope.

#### Locking

A lock file prevents multiple local sync processes from racing.

#### Plugin architecture

A Git plugin and general plugin API create extension paths without coupling every integration to the core.

#### Broader Atlassian platform

Supporting Jira can increase the total addressable audience and provide a unified CLI experience.

### 11.5 Why adoption remains low

Several plausible factors emerge.

#### The project is young relative to incumbents

Twenty-nine stars can simply reflect limited time and distribution.

#### Positioning is broad

“A CLI for Atlassian products” competes for attention with a much sharper message: “safe Git ↔ Confluence sync.” Jira features, sprint analytics, time tracking, exports, plugins, and a dashboard broaden the product but dilute the category wedge.

#### The hardest claims lack independent validation

No substantial corpus of public production reports was found. Users evaluating a bidirectional tool need evidence of no data loss across macros, tables, attachments, moves, and concurrent edits.

#### Bun/TypeScript binary trust and packaging

An unsigned Windows binary can trigger warnings. Bun is less universally familiar than Go or a standard Node package. This is manageable but adds perceived risk.

#### Continuous watch is not the primary enterprise workflow

Many teams want server-side CI or pull-request automation, not a developer laptop polling Confluence every thirty seconds.

#### Git integration appears additive rather than central

A plugin can inspect and commit, but the product story is still local-directory ↔ Confluence. The missing category-defining workflow is:

> Confluence change → deterministic branch → commit with authorship/provenance → pull request → checks → merge → publish confirmation.

### 11.6 Risks in the design

- a broad Atlassian CLI can overextend maintainer capacity;
- polling entire spaces will face new points-based API limits and scale pressure;
- automatic merge of rendered Markdown may be syntactically correct but semantically wrong;
- remote comments, macros, and app nodes require lossless handling;
- continuous local watch can create version churn and race conditions;
- local state files can diverge across clones and CI workers unless the state model is carefully divided into portable and ephemeral parts.

### 11.7 Why it has not yet won despite implementing the headline feature

This is a critical lesson: **having bidirectional commands is not enough**.

To win, a project must make the market trust the implementation. That requires:

- public compatibility tests;
- data-loss guarantees and boundaries;
- production case studies;
- Git-provider PR automation;
- a focused category story;
- substantial independent usage;
- a clear governance/support model.

### 11.8 Lessons for MarksSync

**Copy:**

- `init`, `pull`, `push`, `sync`, `diff`, `status`, and `resolve` command model;
- base-state tracking;
- explicit conflict strategies;
- JSON output;
- lock semantics;
- scope-aware remote detection;
- cross-platform installation;
- plugin API.

**Differentiate:**

- make Git—not a local directory—the coordination system;
- reverse changes should become branches/PRs by default;
- use a structural canonical representation, not only line-based Markdown merging;
- publish a public, versioned compatibility corpus;
- offer a safety contract and loss report;
- narrow the initial message to Confluence synchronization;
- treat CI/server operation as primary and laptop watch mode as optional.

---

## 12. Deep success analysis: `PatD42/confluence-bidir-sync`

### 12.1 Project profile

- Repository: <https://github.com/PatD42/confluence-bidir-sync>
- Approximate adoption: 1 star, 0 forks
- Engineering depth: roughly 8 commits
- Implementation: Python
- License: MIT
- Direction: bidirectional, claimed
- Status: prototype; package publication still described as future work

### 12.2 The proposed model

The README describes:

- push and pull;
- a default bidirectional mode;
- local state, baseline, and configuration directories;
- three-way conflict detection;
- local-only changes pushed;
- remote-only changes pulled;
- both sides changed reported as conflict;
- preservation claims for macros, labels, and comments;
- dry-run, exclusions, force push/pull, and logging;
- CQL-based discovery;
- tests including real-Confluence end-to-end scenarios.

### 12.3 What is promising

#### The project recognizes the need for a baseline

This is the minimum viable architecture for conflict detection.

#### It distinguishes detection from force resolution

The default behavior appears safer than silently choosing a winner.

#### It explicitly includes non-body state

Macros, labels, and comments are acknowledged, even though the breadth of preservation is not externally validated.

#### The README describes behavior rather than only commands

The state model and changed-side cases are understandable.

### 12.4 Why it has not achieved adoption

- no released package;
- extremely small commit history;
- no meaningful independent feedback;
- ambitious preservation claims without a visible compatibility corpus;
- no evidence of organization-level lifecycle handling;
- no clear Git-provider workflow;
- no proof of long-term API maintenance;
- no community or governance structure.

### 12.5 Lessons for MarksSync

A technically sensible README is not a product. MarksSync must make each claim falsifiable and demonstrable:

- publish the fixture that proves it;
- show before/after artifacts;
- include the expected diff;
- test against real tenants;
- document unsupported cases;
- ship installable releases;
- collect independent production evidence.

The market will not grant trust merely because a tool says “three-way merge.”

---

## 13. Cross-project success patterns

### 13.1 Success pattern: one sentence that eliminates a known pain

The strongest projects can be summarized without jargon:

- Mark: keep docs in Git and publish them to Confluence.
- Exporter: get Confluence pages into clean Markdown.
- Sphinx Builder: publish Sphinx documentation to Confluence.
- Duo: publish changed Markdown posts during CI.

By contrast, “extensible Atlassian synchronization platform” requires explanation.

**Action for MarksSync:** use a primary sentence such as:

> Sync Markdown in Git with native Confluence pages—safely, reviewably, and without losing edits.

### 13.2 Success pattern: fit the workflow that already exists

Projects grow when they attach to an existing habit:

- Git pull requests;
- CI/CD;
- Sphinx builds;
- Obsidian authoring;
- Python package installation;
- Docker;
- one-time export migration.

**Action:** do not require teams to adopt a proprietary workflow engine. Make MarksSync a natural extension of GitHub, GitLab, Bitbucket, Azure DevOps, and local Git.

### 13.3 Success pattern: support the difficult 20% that blocks adoption

The decisive features recur across projects:

- relative links;
- attachments;
- diagrams;
- tables;
- macros/admonitions;
- hierarchy;
- labels;
- stable IDs;
- skip unchanged;
- dry-run.

A parser that handles headings and lists but fails these scenarios will demo well and lose evaluations.

### 13.4 Success pattern: disciplined scope

The exporter and Sphinx builder succeed partly because they constrain the problem. Mark explicitly makes Git authoritative. Scope creates reliability.

**Action:** expose synchronization policies rather than pretending every repository wants the same authority model.

### 13.5 Success pattern: visible maintenance

Current releases are a product feature. Users know Atlassian APIs change. A project with a large star count and no recent release is often less attractive than a smaller active project.

### 13.6 Success pattern: installation is part of product design

Go binaries, PyPI, Docker, Homebrew, GitHub Actions, and editor plugins reduce evaluation cost. Every additional setup step loses users before they test fidelity.

### 13.7 Success pattern: destination- or ecosystem-specific profiles

Exporter presets and Sphinx integration demonstrate that generic conversion is often inferior to a profile that understands the target.

### 13.8 Success pattern: transparent limitations build trust

The strongest documentation explains constraints such as SVG rendering, strict Markdown, Marketplace app requirements, Cloud-only folders, scoped tokens, and unsigned binaries.

A bidirectional tool should be even more explicit. The correct promise is not “lossless for everything”; it is:

> “We detect what we can transform safely, preserve what we cannot, and never silently discard unsupported content.”

---

## 14. Cross-project failure patterns

### 14.1 Mistaking conversion for synchronization

A converter transforms a document. A synchronizer manages:

- identity;
- versions;
- common bases;
- moves;
- renames;
- deletion intent;
- remote/local discovery;
- retries;
- conflicts;
- permissions;
- state recovery;
- auditability.

Many projects use “sync” while implementing only “upload current content.” MarksSync should define these terms precisely.

### 14.2 Title-based identity

Titles are mutable, not unique across all contexts, and often edited by nontechnical users. Path-based identity has the same problem when files move.

### 14.3 Silent overwrite as conflict policy

One-way tools often overwrite remote edits by design. This is acceptable only when clearly declared and protected by drift detection.

### 14.4 Incomplete deletion semantics

Absence can mean deletion, filtered scope, sparse checkout, branch difference, temporary generation failure, or configuration change. Automatic remote deletion based only on absence is unsafe.

### 14.5 String-level merge of rendered formats

Confluence storage XHTML and ADF JSON contain identifiers, attributes, generated structures, and ordering that make ordinary text merge noisy and unsafe. Markdown conversion itself may normalize syntax, creating false conflicts.

### 14.6 Underestimating attachments

Attachments have identity, versions, filenames, content hashes, references, comments, and deletion semantics. They are not a side effect of page publication.

### 14.7 Platform/API drift

Atlassian deprecated many v1 endpoints, introduced v2 APIs, granular scopes, scoped API tokens, live docs, and new points-based rate limits. Tools that lack continuous compatibility engineering decay even when their source code is stable.

### 14.8 Too many surfaces for one maintainer

CLI, library, Docker, Action, Obsidian, multiple operating systems, Cloud, Data Center, diagrams, and authentication variants create a large test matrix. The markdown-confluence maintainer situation illustrates the governance risk.

### 14.9 Weak release and contribution operations

Repositories with many unmerged PRs, no release artifacts, or unclear ownership lose community energy. Contributors fork instead of extending upstream.

### 14.10 Stars without retention

Legacy projects can retain high star counts while dependency compatibility deteriorates. MarksSync should publish usage and reliability metrics that are more meaningful than stars.

## 15. Why no bidirectional project has reached 50 stars

The absence of a ≥50-star bidirectional project is not evidence that users do not want the capability. It is evidence that the problem combines several hard systems problems and that the current implementations have not crossed the trust threshold.

### 15.1 Representational asymmetry

Markdown is intentionally small and text-oriented. Confluence supports structures with no universal Markdown equivalent:

- layouts and columns;
- page properties and report macros;
- Jira and third-party app macros;
- smart links and embeds;
- inline comments and comment anchors;
- mentions and account IDs;
- status/date elements;
- tasks with IDs;
- nested expand panels;
- media nodes and attachment versions;
- editor extensions;
- live docs;
- app-owned data and opaque extension nodes;
- page metadata, restrictions, labels, icons, and content properties.

A naïve round trip produces:

```text
Markdown A → Confluence representation B → Markdown C
```

Even when A and C render similarly, their text may differ. A second cycle can create additional drift:

```text
C → B2 → C2
```

A production system needs **idempotent normalization**: after the first canonicalization, repeated round trips should stabilize.

### 15.2 Semantic equivalence is not textual equality

These Markdown fragments may render equivalently but produce a line diff:

```markdown
- item
* item
```

A table can be reordered or normalized without semantic change. A Confluence editor can rewrite ADF attributes or storage XHTML while preserving appearance. Comparing raw text or JSON therefore creates false drift.

MarksSync needs semantic hashes over normalized nodes, not only file hashes or remote-body strings.

### 15.3 Identity is multidimensional

A synchronized entity needs at least:

- a stable MarksSync document UUID;
- the Confluence page ID;
- the current Git path;
- the current Confluence parent ID;
- the source repository and branch scope;
- the last synchronized Git commit;
- the last synchronized Confluence version;
- the base semantic hash;
- attachment IDs and hashes;
- optional aliases/historical paths.

Title is metadata, not identity. Path is location, not identity.

### 15.4 Deletion is a high-risk command

A missing file does not prove intent to delete a page. The system must distinguish:

- explicit `git rm` in the synchronized branch;
- an exclude-pattern change;
- sparse checkout;
- shallow or partial clone;
- branch-specific content;
- failed content generation;
- temporary network/API failure;
- loss of permission to see a page;
- a page moved outside the configured root;
- a manual remote deletion.

Deletion should require provenance and policy. Default behavior should be quarantine/archive or a planned deletion requiring confirmation, not immediate destruction.

### 15.5 Page movement can look like delete-plus-create

Without stable IDs, renaming `architecture.md` to `system-architecture.md` can create a new page and leave the old one behind. Moving a file between folders can incorrectly move a page, duplicate it, or break internal links.

The engine needs Git rename hints, content similarity, explicit UUIDs, and page IDs—but should treat heuristics as suggestions, not proof.

### 15.6 Concurrency spans two version-control models

Git changes are commits on branches. Confluence changes are sequential page versions, potentially edited concurrently through a collaborative editor. A common base must connect these models.

A safe decision table is:

| Local semantic state | Remote semantic state | Safe default |
|---|---|---|
| unchanged from base | unchanged from base | no-op |
| changed | unchanged | push/PR according to policy |
| unchanged | changed | pull into branch/PR |
| changed | changed, disjoint semantic nodes | automatic structural merge, then PR/check |
| changed | changed, overlapping node | conflict |
| unsupported remote structure changed | any local change | preserve and require review |
| identity/lifecycle conflict | any | stop and report |

### 15.7 Authorship and review matter

When a Confluence user edits a page, the resulting Git change should preserve:

- remote author name/account ID where permitted;
- page version and timestamp;
- source URL/page ID;
- transformation warnings;
- the machine identity that created the commit;
- whether the content was auto-merged or normalized.

A direct commit to `main` loses the organizational control Git users sought in the first place. A pull request is the appropriate reconciliation boundary.

### 15.8 Remote change discovery is expensive

Polling a whole space scales poorly and now interacts with Atlassian’s 2026 points-based rate limits for OAuth/Forge/Connect traffic. Webhooks are preferable but can be unavailable or operationally difficult in local/self-hosted workflows.

The engine needs a layered strategy:

1. webhooks/events where available;
2. version/checkpoint queries;
3. label/content-property filtered scopes;
4. incremental cursors;
5. adaptive polling;
6. full reconciliation only as a repair operation.

### 15.9 State must survive clones and CI workers

Some state belongs in Git:

- stable document UUID;
- Confluence page ID or mapping;
- canonical source policy;
- last accepted synchronization metadata where review is desirable.

Other state should remain operational:

- webhook cursor;
- retry queue;
- locks/leases;
- API caches;
- pending event deduplication;
- credentials.

Putting all state in `.marksync/` inside a developer’s clone does not support distributed CI. Putting all state in a server creates an unnecessary hosted dependency. The design needs a hybrid state model.

### 15.10 Trust is harder to demonstrate than functionality

A demo can show two edits merging. A buyer asks:

- What happens to a nested third-party macro?
- Will inline comments survive?
- Can I recover after a partial failure?
- What if a page is moved while a branch renames the file?
- What if two CI jobs run concurrently?
- What if a token loses attachment permission?
- Can I preview every mutation?
- Is the second sync a no-op?
- Will the next Atlassian API deprecation break us?

The category is won by answering these questions with tests and evidence, not slogans.

---

## 16. The winning product strategy

### 16.1 Product vision

MarksSync should become the trusted synchronization layer between Git-based documentation workflows and Confluence-based organizational knowledge consumption.

It should support four outcomes:

1. **Publish:** Git-reviewed Markdown becomes native Confluence pages.
2. **Observe:** remote edits and structural drift are detected and explained.
3. **Reconcile:** Confluence changes become reviewable Git changes.
4. **Synchronize:** compatible concurrent edits are structurally merged; incompatible edits become explicit conflicts.

### 16.2 Do not lead with “two-way sync” alone

“Two-way sync” is ambiguous and associated with silent overwrites in many products. Lead with safety and reviewability:

> **Git-native Confluence synchronization with drift detection, pull requests, and conflict-safe merging.**

A secondary statement can explain bidirectionality.

### 16.3 Beachhead market

The ideal initial users are software and platform teams that:

- already keep technical docs in Git;
- are required to publish selected docs in Confluence;
- use pull requests for review;
- experience stale or duplicated Confluence content;
- have enough technical content to need links, diagrams, and attachments;
- care about auditability and automation;
- can run a CLI or CI job.

Avoid initially targeting general business users who want a WYSIWYG editor replacement. Their needs push the product toward a full collaborative editor before the synchronization engine is mature.

### 16.4 The trust ladder

#### Level 0 — Convert and inspect

- compile Markdown into Confluence representation;
- pull a page into Markdown;
- render local previews;
- show unsupported-node warnings;
- perform no remote mutations.

#### Level 1 — Safe one-way publish

- Git is authoritative;
- create/update native pages;
- stable IDs;
- dry-run plan;
- skip unchanged;
- attachments, hierarchy, links;
- remote drift blocks overwrite by default.

#### Level 2 — Reverse change capture

- detect Confluence changes;
- pull them into a new branch;
- produce a structural diff and loss report;
- open a pull request or emit files for review;
- no automatic merge to the protected branch.

#### Level 3 — Assisted bidirectional reconciliation

- common-base tracking;
- three-way structural merge;
- automatically merge disjoint changes;
- create PRs with conflict markers or structured conflict files;
- maintain provenance.

#### Level 4 — Policy-controlled continuous sync

- event/webhook processing;
- automatic safe merges under explicit policy;
- branch and approval rules;
- organization-wide audit;
- centralized worker optional, not mandatory.

Each level should be independently valuable. This avoids betting adoption on the hardest feature.

### 16.5 The wedge that can beat Mark

MarksSync should match the common Mark workflow, then add one decisive safety improvement:

> Before publishing, MarksSync detects whether the Confluence page changed since the last synchronized version and refuses to overwrite it silently.

This single feature creates a credible reason to switch without requiring full reverse merge on day one.

The second differentiator should be:

> Convert the remote change into a Git branch and pull request.

This completes the organizational loop and makes the tool Git-native rather than merely Git-fed.

### 16.6 Product modes

Configuration should support explicit authority modes per mapping or file:

| Mode | Meaning | Remote edits |
|---|---|---|
| `git-authoritative` | Git is canonical | detected; overwrite only by policy/force |
| `confluence-authoritative` | Confluence is canonical | pulled; local writes blocked or PR-only |
| `reviewed-bidirectional` | both may change | all reverse changes go through PR; safe merges possible |
| `continuous-bidirectional` | both may change | event-driven auto-merge within policy |
| `mirror-readonly` | export/backup | never writes to Confluence |
| `publish-readonly` | publish but prohibit editing | optionally apply banner/restrictions |

The default should be `git-authoritative` with drift blocking, not overwrite.

### 16.7 Build the product around a plan

Every modifying command should first produce a plan containing operations such as:

```yaml
operations:
  - action: update_page
    documentId: 4b8e...
    path: docs/architecture.md
    pageId: "123456"
    fromVersion: 17
    expectedVersion: 17
    semanticChanges:
      - section: "Failure handling"
        type: modified
    warnings: []
  - action: move_page
    pageId: "991122"
    fromParentId: "100"
    toParentId: "200"
  - action: upload_attachment
    pageId: "123456"
    path: docs/img/context.svg
    sha256: ...
```

Plans should be:

- human-readable;
- machine-readable;
- stable enough for CI checks;
- signable/applicable later;
- explicit about warnings and destructive actions.

### 16.8 The product should have a safety contract

A public safety contract should state:

1. no page is updated if the expected remote version differs, unless an explicit policy resolves it;
2. unsupported remote content is never silently discarded;
3. destructive operations are never inferred from an incomplete scope;
4. every mutation is idempotent and auditable;
5. partial failures are resumable;
6. secrets are redacted;
7. dry-run performs the same discovery and validation as apply;
8. the second run after success is a no-op;
9. remote content is backed up or recoverable before destructive operations;
10. force flags are explicit, narrow, and noisy.

This contract can become a major brand asset.

---

## 17. Recommended system architecture

### 17.1 Architectural principle: functional core, imperative shell

The highest-risk logic—conversion, normalization, matching, diffing, merge, planning—should be deterministic and testable without a live Confluence instance.

The outer shell handles:

- Git provider;
- Confluence API;
- filesystem;
- credentials;
- events;
- locks;
- retries;
- logging.

### 17.2 Core components

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Interfaces                                                          │
│ CLI | GitHub Action | GitLab CI | Library | MCP | Future plugins    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│ Orchestration                                                        │
│ discover → load → normalize → match → diff → plan → apply → verify  │
└───────────────┬───────────────────────────────┬─────────────────────┘
                │                               │
┌───────────────▼──────────────┐  ┌────────────▼──────────────────────┐
│ Canonical document engine    │  │ Synchronization/lifecycle engine  │
│ Markdown AST                 │  │ identity, base, versions, moves   │
│ Confluence ADF/storage       │  │ deletes, conflicts, policies      │
│ canonical IR                 │  │ three-way structural merge        │
│ loss/preservation model      │  │ plans and invariants               │
└───────────────┬──────────────┘  └────────────┬──────────────────────┘
                │                               │
┌───────────────▼───────────────────────────────▼──────────────────────┐
│ Adapters                                                              │
│ Confluence Cloud v2 | Data Center | Git | GitHub | GitLab | Bitbucket │
│ Azure DevOps | filesystem | object store | webhook/event source       │
└───────────────────────────────────────────────────────────────────────┘
```

### 17.3 Canonical intermediate representation

The canonical IR is the most important architectural investment. It should model semantic nodes such as:

- document;
- section/heading;
- paragraph;
- text marks;
- lists and tasks;
- table/row/cell;
- code block;
- link/reference;
- image/media/attachment;
- admonition/panel;
- expand/details;
- status/date;
- layout/container;
- macro/extension;
- opaque preserved node;
- comment anchor;
- metadata and properties.

Every node should support:

- stable node identity where possible;
- source provenance;
- semantic hash;
- Markdown representation capability;
- Confluence representation capability;
- lossiness level;
- preserved raw payload when needed.

### 17.4 Lossiness taxonomy

Use explicit levels:

| Level | Meaning | Default behavior |
|---|---|---|
| `exact` | fully round-trippable | transform freely |
| `equivalent` | syntax may change, semantics preserved | normalize and report if requested |
| `degraded` | some presentation/metadata lost | block reverse apply unless approved |
| `opaque-preserved` | unsupported but raw payload retained | preserve, prohibit editing inside block |
| `unsupported` | cannot safely preserve | stop and report |

A “loss budget” can be configured, but the default for bidirectional mode should allow only `exact`, `equivalent`, and `opaque-preserved`.

### 17.5 Opaque-node preservation

For unsupported Confluence structures, store a protected representation rather than dropping it. Possible approaches:

1. **Markdown protected block** with an ID and human-readable summary, raw data in a sidecar file.
2. **Sidecar document** under `.marksync/objects/<hash>.json` containing normalized ADF/storage payload.
3. **Remote preservation island** where MarksSync replaces only tool-owned regions and leaves unsupported regions untouched.

Example:

```markdown
<!-- marksync:opaque id="node-7f91" type="vendor-extension" -->
> Confluence extension preserved by MarksSync. Edit in Confluence or use a compatible plugin.
<!-- /marksync:opaque -->
```

The block should have a semantic hash. If the user edits it manually, MarksSync should stop rather than overwrite the raw remote node.

### 17.6 Ownership at node level

Whole-page authority is simple but restrictive. A future advanced mode can support ownership regions:

- Git-owned generated sections;
- Confluence-owned collaborative sections;
- synchronized sections;
- opaque preserved sections.

This enables use cases such as:

```markdown
<!-- marksync:generated-start id="api-reference" -->
... generated from OpenAPI ...
<!-- marksync:generated-end -->

<!-- marksync:collaborative-start id="operations-notes" -->
... editable in Confluence and synchronized back ...
<!-- marksync:collaborative-end -->
```

Do not implement this before whole-page safety is stable, but design the IR and provenance model so it remains possible.

### 17.7 Identity model

Recommended document identity:

```yaml
marksync:
  documentId: "01J..."          # tool-owned immutable ULID/UUID
  confluence:
    pageId: "123456"
    spaceId: "987"
  source:
    repository: "org/repo"
    path: "docs/architecture.md"
```

Storage options:

- YAML front matter for portable per-document identity;
- repository mapping file for users who do not want metadata in documents;
- optional generated lock file mapping IDs to paths;
- Confluence content property storing the MarksSync document ID and repository fingerprint.

Use **bidirectional identity anchoring**: both Git and Confluence carry the same tool-owned ID. Page ID alone is remote-specific; path alone is local-specific.

### 17.8 State model

#### Versioned state in Git

- document UUID/page mapping;
- synchronization policy;
- source format options;
- accepted lossiness exceptions;
- optional last accepted base semantic hash;
- mapping schema version.

#### Local cache

- API response cache;
- rendered diagrams;
- content hashes;
- temporary plan data.

#### Optional shared operational state

- webhook/event cursor;
- deduplication keys;
- leases;
- retry queue;
- last successful reconciliation checkpoint;
- PR linkage.

The CLI must work without a hosted service. A server/worker may improve webhooks and automation but should be optional.

### 17.9 Structural diff

Line diffs are useful for Markdown review but insufficient for sync decisions. Produce both:

1. **semantic diff** for the engine;
2. **rendered Markdown diff** for humans.

Semantic operations might include:

```text
Move section node 42 under section node 10
Change table cell [row=3, col=2]
Rename heading while preserving anchor alias
Replace attachment content, same logical asset
Add Confluence macro panel with title "Warning"
```

This reduces false conflicts caused by normalization.

### 17.10 Three-way structural merge

Given base `B`, local `L`, and remote `R`:

1. parse/convert each into canonical IR;
2. match nodes using stable IDs, provenance, anchors, and similarity;
3. compute `B→L` and `B→R` operation sets;
4. commute disjoint operations;
5. apply deterministic merge rules;
6. flag overlapping or incompatible operations;
7. render merged IR to Markdown and Confluence target;
8. verify round-trip invariants before mutation.

Examples of safe automatic merges:

- local edits section A; remote edits section B;
- local changes paragraph text; remote adds a label;
- local adds a file; remote edits another page;
- local moves a page; remote changes its body, if identity is stable.

Examples requiring conflict:

- both change the same table cell;
- remote edits inside an opaque node while local deletes the block;
- local deletes a page while remote adds comments/content;
- both move the page to different parents;
- title changes collide with another page;
- attachment replaced differently on both sides.

### 17.11 Apply engine and transactions

Confluence does not provide a multi-page transaction. MarksSync needs a saga-like apply model:

- deterministic operation IDs;
- optimistic version preconditions;
- dependency graph;
- idempotent retry;
- operation journal;
- compensating actions where safe;
- post-apply verification;
- resumable partial plans;
- clear status: planned, applied, verified, failed, compensated, manual intervention.

Do not claim atomic repository-wide sync. Claim recoverable, verified application.

### 17.12 Confluence adapter strategy

Separate interfaces for:

- Cloud REST v2 pages/spaces/attachments/labels;
- remaining required v1-compatible endpoints where unavoidable and documented;
- Data Center API versions;
- ADF body handling;
- storage-format body handling;
- live-doc subtype behavior;
- authentication variants;
- rate-limit metadata;
- page content properties;
- webhooks/events.

Compatibility should be capability-driven, not a forest of `if cloud` checks.

### 17.13 Git provider adapters

The synchronization core should depend on abstract operations:

- create branch;
- write files;
- commit with metadata;
- push;
- create/update PR/MR;
- add labels/reviewers;
- publish status/check annotations;
- comment with plan/conflicts;
- identify changed files and renames.

Implement provider adapters in order of likely adoption:

1. GitHub;
2. GitLab;
3. Bitbucket Cloud/Data Center;
4. Azure DevOps.

Local plain Git must remain fully supported.

---

## 18. CLI and developer experience that can beat the incumbents

### 18.1 Design objective

A new user should complete a safe first publication without manually reading API documentation or constructing page mappings.

### 18.2 Recommended command model

```text
marksync init
marksync login
marksync doctor
marksync add
marksync status
marksync plan
marksync sync
marksync pull
marksync push
marksync resolve
marksync validate
marksync migrate
marksync map
marksync auth
marksync completion
```

Keep aliases intuitive, but avoid multiple overlapping commands that create ambiguity.

### 18.3 `marksync init`

Interactive and noninteractive modes should:

- detect repository root;
- ask Cloud versus Data Center;
- select auth approach;
- select a space and root page through API lookup;
- propose include/exclude patterns;
- detect likely docs directories;
- choose authority mode;
- create `.marksync.yml`;
- optionally add front matter/document IDs;
- create a sample mapping;
- run validation;
- offer a dry-run.

The generated configuration should be concise and commented.

### 18.4 `marksync login`

This is a major differentiator because auth is repeatedly cited as friction.

Support:

- Cloud API token with guided link/instructions;
- scoped API token;
- OAuth 2.0/3LO where feasible;
- Data Center PAT;
- basic auth only where appropriate;
- environment-variable/secret-only CI mode;
- multiple named profiles;
- OS credential store/keychain;
- `--no-store` mode;
- token scope validation.

After login, validate permissions against the selected space and explain missing scopes in domain language.

### 18.5 `marksync doctor`

Check:

- credentials and scopes;
- endpoint/API capabilities;
- Cloud/Data Center version;
- root page access;
- create/update/attachment permissions using non-destructive probes;
- diagram renderer availability;
- Git state;
- mapping integrity;
- duplicate IDs;
- stale state schema;
- webhook configuration;
- rate-limit headers;
- clock skew;
- connectivity/proxy/TLS.

Output should include exact remediation steps.

### 18.6 `marksync status`

A Git-like status is central:

```text
On mapping: engineering-docs
Authority: reviewed-bidirectional

Changes to publish:
  modified: docs/architecture.md
  renamed:  docs/old-api.md -> docs/api.md

Remote changes:
  modified: docs/runbook.md (Confluence v18 by Alice)

Conflicts:
  both modified: docs/security.md

Unsupported:
  docs/roadmap.md contains vendor macro com.example.timeline
```

### 18.7 `marksync plan`

- no remote writes;
- resolve current remote versions;
- show semantic and lifecycle changes;
- estimate API calls/points;
- show warnings;
- emit JSON/YAML/SARIF;
- support `--fail-on drift|lossy|destructive|conflict`;
- optionally save an immutable plan artifact.

### 18.8 `marksync sync`

Default behavior should be safe:

- calculate plan;
- stop on conflicts or unsupported loss;
- apply non-destructive operations;
- require policy/flag for deletes;
- verify results;
- update state;
- produce summary and links.

Avoid making `--force` a universal bypass. Use narrow flags:

- `--accept-remote-version <n>`;
- `--overwrite-remote-drift`;
- `--delete-orphans`;
- `--accept-lossy <node-id>`.

### 18.9 CI UX

Exit codes should be stable and documented:

| Code | Meaning |
|---:|---|
| 0 | success/no conflict |
| 2 | configuration/validation failure |
| 3 | authentication/permission failure |
| 4 | remote drift detected |
| 5 | merge conflict |
| 6 | unsupported/lossy content |
| 7 | transient API/rate-limit failure |
| 8 | partial apply requiring resume |
| 9 | destructive operation requires approval |

Machine output must be a versioned contract.

### 18.10 GitHub Action experience

A first-class Action should support:

```yaml
- uses: marksync/marksync-action@v1
  with:
    command: plan
    config: .marksync.yml
  env:
    MARKSYNC_TOKEN: ${{ secrets.CONFLUENCE_TOKEN }}
```

It should:

- annotate pull-request files;
- post a concise plan comment;
- attach full plan/diff artifacts;
- update one comment rather than spam;
- support OIDC/OAuth strategy where practical;
- open reverse-sync PRs;
- respect protected branches;
- expose concurrency controls.

### 18.11 Error-message standard

Every error should answer:

1. what operation failed;
2. which page/file/entity was involved;
3. whether anything was changed;
4. whether retry is safe;
5. the likely cause;
6. the exact next command/remediation;
7. where to find the operation ID and logs.

This is a category-leading opportunity. Existing tools often expose raw HTTP errors.

---

## 19. Content fidelity strategy

### 19.1 Publish a compatibility matrix

Maintain a public table for each construct:

| Construct | MD → Cloud | Cloud → MD | Data Center | Round-trip level | Notes |
|---|---:|---:|---:|---|---|
| headings | ✅ | ✅ | ✅ | exact/equivalent | anchor aliases preserved |
| tables | ✅ | ✅ | ✅ | equivalent | merged cells limited |
| Mermaid | ✅ | ✅ source-preserved | ✅ | exact via source sidecar | rendered attachment |
| Jira macro | ✅ reference | opaque | ✅ | opaque-preserved | plugin handler optional |
| inline comments | n/a | metadata/sidecar | varies | degraded | anchors preserved where possible |

This is more credible than a generic “supports Markdown” claim.

### 19.2 Acceptance corpus

Create a public repository containing:

- CommonMark and GitHub Flavored Markdown cases;
- nested lists and task lists;
- wide/complex tables;
- relative links, fragments, duplicate headings;
- Unicode, emoji, RTL, CJK, combining characters;
- long code blocks and unusual languages;
- local/external images;
- SVG, PNG, GIF, video, PDF;
- Mermaid, PlantUML, D2, Draw.io;
- admonitions/panels;
- expand/details;
- labels and properties;
- layouts and columns;
- Confluence macros;
- vendor extension fixtures;
- comments and inline comments;
- page moves, folder changes, rename collisions;
- attachment replacement and deletion;
- large pages and large trees.

For each case store:

- source Markdown;
- canonical IR snapshot;
- expected Cloud representation;
- expected Data Center representation;
- reverse Markdown;
- expected semantic diff;
- screenshots where visual correctness matters;
- lossiness classification.

### 19.3 Real-tenant testing

Use automated nightly tests against:

- at least one Confluence Cloud tenant on the current editor;
- a tenant with live docs enabled;
- supported Data Center versions;
- scoped tokens and classic tokens;
- restricted pages;
- spaces with large hierarchies.

Contract tests against mocks are not enough because Atlassian behavior can differ from schemas.

### 19.4 Golden files and property tests

Important properties:

- parse/render does not crash for valid supported input;
- canonicalization is idempotent;
- `canonicalize(canonicalize(x)) == canonicalize(x)`;
- exact nodes round-trip semantically;
- unsupported nodes remain byte/structure preserved in sidecar;
- applying the same plan twice is a no-op;
- reordering independent nodes does not corrupt identity;
- semantic hashes remain stable across formatting normalization.

Use fuzzing for Markdown, XHTML, and ADF parsers, especially around nested structures and malformed remote content.

### 19.5 Plugin model for macros and dialects

A handler contract might include:

```text
supports(remoteNode) -> confidence
fromConfluence(remoteNode, context) -> IR node + preservation data
toConfluence(IR node, context) -> remote node
renderMarkdown(IR node, context) -> markdown + sidecars
parseMarkdown(block, context) -> IR node
validateRoundTrip(IR node) -> report
```

Plugins should be sandboxable or clearly trusted, versioned, and discoverable. The core must preserve unknown nodes without a plugin.

---

## 20. Reliability, security, and enterprise readiness

### 20.1 Reliability is the product

For a documentation synchronizer, a rare destructive defect outweighs dozens of convenience features. Reliability work should be visible in the roadmap and release notes.

Core invariants:

- never update a page without checking the expected version;
- never reuse an identity across unrelated documents;
- never infer deletion without an authoritative event or explicit policy;
- never discard a node classified as unsupported;
- never report success before verification;
- never expose tokens in logs, plans, errors, or crash reports;
- never let two workers apply the same mapping concurrently without a lease;
- never rewrite a file merely because formatting normalization changed.

### 20.2 Idempotency

Each operation should have a deterministic idempotency key derived from:

- mapping ID;
- document ID;
- source and target versions;
- operation type;
- desired semantic hash.

Retrying after a timeout must determine whether the remote write succeeded before issuing another version.

### 20.3 Rate-limit architecture

Atlassian’s current Cloud documentation describes points-based hourly quotas for OAuth 2.0, Forge, and Connect traffic, with 429 responses and structured rate-limit headers. MarksSync should:

- calculate an estimated API cost during planning;
- use conditional/incremental discovery;
- cache immutable and slowly changing metadata;
- honor `Retry-After`;
- use exponential backoff with jitter;
- stop before exhausting quota when near-limit headers indicate risk;
- schedule full reconciliation separately from interactive sync;
- expose API-call and point estimates in JSON output;
- adapt concurrency per tenant;
- support token-based CI traffic while documenting its separate limits.

### 20.4 Optimistic concurrency

Every page update should include an expected current version. If the page changed after planning, the apply must stop and re-plan. A plan is not valid indefinitely.

For long plans, consider:

- a plan TTL;
- per-operation revalidation;
- dependency-aware partial apply;
- an option to apply only still-valid operations.

### 20.5 Concurrency control

Use mapping-level leases for remote apply. Local lock files are insufficient in distributed CI. Options:

- GitHub Actions concurrency groups;
- provider-native pipeline locks;
- optional object-store/database lease adapter;
- Confluence content-property lease with expiration, used carefully;
- server control plane for webhook deployments.

The core should expose a lease interface rather than mandate infrastructure.

### 20.6 Backup and recovery

Before destructive or lossy operations:

- export the current remote body and metadata;
- store a content-addressed backup locally or as a CI artifact;
- include page ID/version in the backup name;
- provide `marksync recover` or documented restore commands;
- retain an operation journal.

For ordinary updates, Confluence page history provides partial recovery, but attachments, moves, and deletions need explicit handling.

### 20.7 Security baseline

- credentials in OS keychain or environment, never repository config;
- log redaction by structured field, not regex alone;
- minimal scopes documented per command;
- TLS verification by default;
- narrow, explicit insecure-development option;
- no arbitrary template execution by default;
- path traversal protection for includes and attachments;
- archive extraction protections against zip-slip and decompression bombs;
- content-size limits;
- webhook signature verification;
- secret scanning and dependency scanning;
- fuzzing parsers and importers;
- security policy and private disclosure channel;
- threat model published for credentials, content exfiltration, and malicious Markdown.

### 20.8 Supply-chain trust

The category leader should ship:

- signed release binaries;
- SHA-256 checksums;
- Sigstore/cosign signatures or attestations;
- SBOMs;
- reproducible or verifiable builds where feasible;
- pinned GitHub Action major versions and immutable release SHAs;
- provenance/SLSA-oriented build metadata;
- release notes with compatibility impact;
- dependency update automation;
- vulnerability response SLA.

This directly improves enterprise adoption and avoids the unsigned-binary concern visible in smaller projects.

### 20.9 Privacy

Documentation can contain sensitive source code, architecture, incidents, customer data, and credentials. The default CLI should be local and should not send content to any MarksSync service.

Any telemetry must be:

- opt-in or strictly anonymous/aggregate with clear disclosure;
- content-free;
- easy to disable;
- documented with exact fields;
- separated from crash reports containing user data.

A hosted offering can be built later, but local-first operation is an adoption advantage.

---

## 21. Open-source project strategy

### 21.1 Treat the repository as the product homepage

The README should answer, above the fold:

1. What problem does this solve?
2. Why is it safer/better than Mark and upload scripts?
3. Can I install it in one command?
4. What does a minimal config look like?
5. Can I see a dry-run before granting write access?
6. Is Cloud/Data Center supported?
7. What happens to Confluence edits?

Recommended opening:

> **MarksSync keeps Markdown in Git and native Confluence pages synchronized without silently overwriting either side.** Review documentation in pull requests, publish it for the whole organization, detect Confluence edits, and bring them back through a branch or PR.

Then show a 60–90 second terminal demo.

### 21.2 README structure

1. one-sentence promise;
2. animated terminal or short video;
3. safety guarantees;
4. five-command quick start;
5. key use cases;
6. comparison with alternatives;
7. supported content summary;
8. architecture/authority modes;
9. links to full docs;
10. project status and support expectations;
11. contribution and roadmap.

Do not put a 60-row option table before the first successful workflow.

### 21.3 Name and search strategy

“MarksSync for Confluence” communicates Markdown + sync + target. For CLI/repository consistency, prefer one canonical spelling such as `marksync` and use “MarksSync for Confluence” as the full product name.

Repository topics and description should include:

- confluence;
- markdown;
- docs-as-code;
- documentation;
- sync;
- git;
- github-actions;
- confluence-cloud;
- confluence-data-center;
- bidirectional-sync;
- technical-writing.

Create SEO landing pages/docs for exact queries:

- Markdown to Confluence;
- Confluence to Markdown;
- GitHub to Confluence sync;
- GitLab to Confluence;
- docs-as-code Confluence;
- bidirectional Confluence Markdown sync;
- Confluence backup to Git;
- Mark alternative;
- md2conf alternative;
- Confluence API v2 Markdown publisher.

### 21.4 License recommendation

The existing MIT choice is suitable for maximum adoption and embedding. Apache-2.0 offers an explicit patent grant and is common among competitors. Changing licenses later can be difficult once external contributors arrive.

Practical recommendation:

- keep MIT if simplicity and broad embedding are priorities;
- consider Apache-2.0 before substantial outside contribution if explicit patent language matters;
- avoid source-available restrictions if the goal is to become the open-source category standard.

### 21.5 Governance from day one

Create:

- `GOVERNANCE.md`;
- `CONTRIBUTING.md`;
- `SECURITY.md`;
- `CODE_OF_CONDUCT.md`;
- `SUPPORT.md`;
- `MAINTAINERS.md`;
- `ROADMAP.md`;
- architecture decision records;
- RFC process for state/format compatibility;
- CODEOWNERS;
- release manager rotation when the team grows.

Define:

- who can merge;
- how maintainers are added/removed;
- who owns release credentials;
- what happens if the founder is unavailable;
- how compatibility-breaking changes are approved;
- support boundaries for Cloud/Data Center versions.

The markdown-confluence maintainer situation demonstrates that governance is not bureaucracy; it is product continuity.

### 21.6 Contribution design

Make contributions possible without Confluence access:

- deterministic core tests;
- recorded/sanitized API fixtures;
- containerized development environment;
- fake Confluence server for most integration tests;
- golden corpus;
- clear module boundaries;
- good-first issues in docs, adapters, fixtures, and plugins;
- a command to run one fixture end-to-end;
- contribution guide under ten minutes for the first test.

Reserve live-tenant tests for maintainers/CI secrets.

### 21.7 Issue management

Use labels that reflect product risk:

- `data-loss-risk`;
- `silent-overwrite-risk`;
- `identity-lifecycle`;
- `round-trip-fidelity`;
- `atlassian-api-change`;
- `auth`;
- `rate-limit`;
- `cloud`;
- `data-center`;
- `plugin`;
- `good-first-issue`;
- `needs-reproducer`.

Prioritize by severity, affected users, and safety—not by comment volume alone.

Publish issue response targets, even if modest:

- security/data-loss acknowledgment: 24–48 hours;
- regression triage: 3 business days;
- ordinary issue triage: weekly.

### 21.8 Release strategy

- semantic versioning;
- automated cross-platform builds;
- signed artifacts;
- release every 2–4 weeks during early adoption;
- patch releases rapidly for API regressions;
- release notes grouped by user impact;
- compatibility matrix update in every relevant release;
- deprecation warnings for at least one minor cycle;
- migration command for state/config schema changes.

### 21.9 Avoid the maintainer bottleneck

- keep PRs small and modular;
- automate formatting, lint, tests, release, and changelog;
- document architecture and invariants;
- establish a reviewer path before reaching hundreds of stars;
- grant scoped maintainer ownership for adapters/plugins;
- use an organization rather than a personal namespace when project momentum appears;
- store package/release credentials in organization-controlled systems;
- fund maintenance through sponsorship, support, or hosted services before burnout.

### 21.10 Sustainable business model without weakening open source

Potential paid layers:

- hosted webhook/control plane;
- managed reverse-sync PR creation;
- enterprise SSO and policy administration;
- organization-wide audit dashboard;
- supported Data Center compatibility;
- premium support/SLA;
- migration services;
- custom macro handlers;
- compliance reporting;
- Atlassian Marketplace companion app.

Keep the synchronization engine, formats, CLI, Git-provider basics, and conflict logic open. The strongest adoption flywheel comes from becoming infrastructure teams trust and can inspect.

---

## 22. Distribution strategy

### 22.1 Required channels for v1

- GitHub Releases native binaries for Linux, macOS, and Windows;
- Docker image;
- Homebrew tap;
- GitHub Action;
- `go install` or equivalent source install if implemented in Go;
- shell and PowerShell install scripts with checksum verification.

### 22.2 Recommended next channels

- Scoop and/or WinGet;
- Nix flake/package;
- Arch/AUR community package;
- GitLab CI component/template;
- Bitbucket Pipeline example;
- Azure DevOps task or template;
- pre-commit hook for validation;
- Dev Container;
- MCP server/agent skill after core stabilization.

### 22.3 Why a native binary is the best core distribution

The incumbents demonstrate the trade-off:

- Go offers excellent binary distribution, as Mark shows;
- Python offers parser extensibility, as md2conf/exporter show;
- TypeScript offers ecosystem integration, as markdown-confluence shows;
- JVM offers enterprise libraries but increases CLI startup/distribution friction.

For MarksSync’s stated cross-platform CLI goal, **Go is the strongest default**. It supports static binaries, fast startup, concurrency, and easy CI use. Complex document conversion can still use modular packages or optional external renderers.

If TypeScript remains preferred for implementation speed, compile/distribute tested standalone binaries and avoid requiring Bun/Node for ordinary users.

### 22.4 One core, thin wrappers

Do not fork logic across:

- CLI;
- GitHub Action;
- Docker entrypoint;
- MCP server;
- future GUI.

All wrappers should invoke the same versioned core API and produce the same plans.

---

## 23. Community and adoption strategy

### 23.1 The growth loop

```text
Useful migration/publish result
        ↓
User adds MarksSync to CI
        ↓
Tool appears in repository workflows and PRs
        ↓
More developers discover it
        ↓
Edge cases become fixtures/plugins
        ↓
Fidelity and trust improve
        ↓
More organizations enable reverse flow
        ↓
Case studies and recommendations grow
```

### 23.2 Launch sequence

#### Private design partners

Recruit 5–10 teams with different profiles:

- Confluence Cloud and Data Center;
- GitHub and GitLab;
- small and large page trees;
- diagrams and attachments;
- strict security environment;
- existing Mark/md2conf user;
- active Confluence editing;
- documentation migration/backup use case.

Do not optimize only for your own repository.

#### Public alpha

Promise safe one-way publishing and drift detection. Label reverse sync experimental. Publish known limitations.

#### Public beta

Add reverse PR flow, acceptance corpus, signed binaries, compatibility dashboard, and first case studies.

#### v1.0

Require:

- stable config/state schema;
- no known data-loss defects;
- recovery procedure;
- Cloud compatibility matrix;
- supported Data Center matrix;
- GitHub PR workflow;
- attachment and lifecycle coverage;
- documented conflict semantics;
- migration from at least Mark-style metadata or common tools where feasible.

### 23.3 Ethical star-growth tactics

Stars should follow value, but discovery matters. Effective tactics:

- launch a genuinely useful `migrate` or `plan` command before asking for stars;
- publish benchmark and compatibility reports that others reference;
- create high-quality comparison pages against Mark, md2conf, and exporters;
- answer existing GitHub/Reddit/Atlassian questions with transparent disclosure;
- submit to Hacker News when there is a real technical story, not only a repository link;
- write engineering posts on structural merge, ADF round trips, and Confluence identity;
- publish demo videos under two minutes;
- integrate with GitHub Marketplace and package registries;
- invite users to star only after a successful sync;
- present at technical-writing, docs-as-code, DevOps, and Atlassian communities;
- upstream fixes or reusable test fixtures where possible rather than attacking incumbents.

Avoid artificial campaigns, star exchanges, or inflated claims. Developer-tool reputation is fragile.

### 23.4 Content strategy

High-value articles:

- “Why Markdown ↔ Confluence is not a text conversion problem”;
- “Safe page identity across Git renames and Confluence moves”;
- “A public compatibility benchmark for Markdown-to-Confluence tools”;
- “How we preserve unsupported Confluence macros without data loss”;
- “Confluence edits as Git pull requests”;
- “Migrating from Mark/md2conf without republishing every page”;
- “REST API v2 and 2026 rate limits for documentation sync”;
- “Testing bidirectional sync with a three-way structural merge corpus.”

This content establishes technical authority and creates durable search traffic.

### 23.5 Comparison without hostility

Publish an honest matrix:

| Need | Mark | md2conf | Exporter | atlcli | MarksSync |
|---|---|---|---|---|---|
| simple Git → Confluence | strong | strong | no | yes | target strong |
| reverse export | no | no | strong | yes | target strong |
| remote drift block | limited | limited | n/a | claimed | core guarantee |
| reverse PR | no | no | no | limited | core differentiator |
| structural merge | no | no | no | claimed | target verified |
| public compatibility corpus | partial | strong fixtures | partial | limited | core moat |

Credit competitor strengths. Users trust fair evaluations.

### 23.6 Case studies that matter

Collect quantified outcomes:

- pages synchronized;
- repository size;
- weekly sync frequency;
- manual copy/paste hours eliminated;
- remote edits detected before overwrite;
- migration cleanup rate;
- no-op percentage;
- attachment volume;
- conflict rate and resolution time;
- time from installation to first successful sync.

A single credible case study with 5,000 pages and zero silent overwrites is more valuable than hundreds of passive stars.

---

## 24. Metrics and definition of category leadership

### 24.1 North-star metric

**Weekly Active Verified Repositories (WAVR):** repositories that complete at least one verified synchronization in a week and whose subsequent reconciliation reaches a stable no-op or reviewed state.

This measures recurring value and correctness better than downloads.

### 24.2 Activation funnel

Track locally/optionally and through voluntary reports:

1. installation;
2. `init` completed;
3. authentication validated;
4. first `plan` completed;
5. first page published or pulled;
6. second run reaches no-op;
7. CI configured;
8. four-week retained repository;
9. reverse PR created;
10. bidirectional policy enabled.

Optimize the largest drop-off, not the most requested advanced feature.

### 24.3 Reliability guardrails

- confirmed silent data-loss incidents: **0**;
- confirmed unintended overwrites: **0**;
- false no-op rate: **0** in supported corpus;
- successful idempotent second run: >99.9%;
- partial apply recovery success: >99%;
- conflict detected before overwrite: 100% in tested scenarios;
- API regression detection: within 24 hours of nightly failure;
- critical fix release target: 72 hours or less.

### 24.4 Fidelity metrics

- percentage of corpus nodes classified exact/equivalent;
- opaque-preservation success rate;
- visual screenshot diff rate;
- semantic round-trip stability;
- manual cleanup minutes per 100 pages;
- unsupported-node frequency by tenant;
- attachment round-trip success;
- internal-link correctness.

### 24.5 Community metrics

- active maintainers;
- median first-response time;
- median PR merge time;
- number of non-maintainer contributors per quarter;
- percentage of issues with reproducible fixtures;
- plugin/adapters maintained outside the core team;
- release cadence;
- documentation search success/failed searches.

### 24.6 Adoption metrics

- weekly active repositories;
- pages under management;
- organizations using CI;
- Cloud vs Data Center split;
- Git-provider split;
- retained installations after 30/90 days;
- migrations from Mark/md2conf/custom scripts;
- public production references.

### 24.7 “Number one” should mean more than star count

MarksSync can reasonably claim category leadership when it has:

- the highest recurring active-repository usage among open-source tools;
- the best public compatibility corpus;
- the only broadly validated reverse-PR workflow;
- zero known silent-loss defects in supported cases;
- current Cloud and Data Center support;
- multiple active maintainers;
- meaningful independent production references;
- eventually, the highest stars in the dedicated synchronization category.

Aiming to exceed Mark’s star count is a useful long-term external goal, but it should follow product leadership.

---

## 25. Recommended roadmap

### Phase 0 — Foundations and proof corpus (weeks 1–6)

**Goal:** make correctness measurable before feature expansion.

Deliver:

- repository/config schema v0;
- canonical document IR;
- Markdown parser/renderer;
- Confluence Cloud read adapter;
- stable document/page identity design;
- public acceptance corpus;
- `marksync login`, `doctor`, `pull`, and local compile;
- lossiness report;
- architecture decisions and safety contract;
- CI, signed preview builds, security baseline.

Exit criteria:

- representative pages can be pulled without silent loss;
- unsupported nodes are identified and preserved;
- canonicalization is idempotent;
- contributors can run core tests without Confluence.

### Phase 1 — Best-in-class safe publisher (weeks 7–14)

**Goal:** match the practical Mark/md2conf baseline and add drift safety.

Deliver:

- create/update pages;
- repository tree and relative links;
- attachments with hashes;
- labels and common macros;
- Mermaid/PlantUML strategy;
- `status`, `plan`, `push`, `sync`;
- optimistic version checks;
- drift detection that blocks overwrite;
- no-op publishing;
- GitHub Action;
- native binaries, Docker, Homebrew;
- JSON output and stable exit codes.

Exit criteria:

- first-run publish under ten minutes;
- second run is a no-op;
- remote edit is never silently overwritten;
- fixture coverage meets published support matrix;
- at least five design partners use CI.

### Phase 2 — Lifecycle correctness (weeks 15–22)

**Goal:** become safer than incumbents on page-tree management.

Deliver:

- rename/move detection via stable IDs;
- page parent/order reconciliation;
- explicit delete/quarantine plan;
- attachment rename/replacement/deletion lifecycle;
- partial failure resume;
- operation journal and recovery;
- Data Center adapter for selected versions;
- migration import from Mark-style metadata and common mappings.

Exit criteria:

- lifecycle scenario suite passes;
- no duplicate pages after rename/move tests;
- destructive operations require explicit policy;
- failed multi-page plan can resume safely.

### Phase 3 — Confluence changes as Git pull requests (weeks 23–32)

**Goal:** deliver the strongest market differentiator without unsafe automatic merge.

Deliver:

- remote event/poll discovery;
- pull to branch;
- commit provenance;
- GitHub PR creation/update;
- semantic and Markdown diffs;
- conflict/loss report in PR;
- reviewer/label configuration;
- webhook receiver reference deployment;
- GitLab merge-request adapter next.

Exit criteria:

- Confluence-only edits produce deterministic PRs;
- no direct default-branch writes;
- PR round trip does not republish normalization noise;
- authorship/source metadata visible;
- ten production repositories use reverse PRs.

### Phase 4 — Structural three-way merge (weeks 33–44)

**Goal:** safely merge disjoint concurrent edits.

Deliver:

- common-base persistence;
- node matching and structural operation diff;
- deterministic merge rules;
- conflict artifacts;
- `resolve` workflow;
- opaque-node protections;
- extensive concurrency and fuzz tests;
- merge explainability.

Exit criteria:

- published merge corpus passes;
- overlapping changes always conflict;
- disjoint changes merge deterministically;
- merged output is stable over repeated round trips;
- external design partners validate conflict UX.

### Phase 5 — Category platform (months 12–18)

Deliver selectively:

- continuous policy-controlled synchronization;
- GitLab, Bitbucket, Azure DevOps adapters;
- plugin SDK for macros/dialects;
- MkDocs/Sphinx/Docusaurus adapters;
- optional hosted webhook/control plane;
- organization audit dashboard;
- MCP/AI-agent interface;
- AI-assisted conflict explanation/resolution proposals;
- Marketplace companion app if it materially improves events/auth.

Do not enter this phase until core safety is proven.

---

## 26. First 90 days: executable plan

### Days 1–30 — establish the technical moat

- finalize canonical IR and lossiness taxonomy;
- create 50–100 fixture documents from real-world constructs;
- implement Confluence Cloud page read and Markdown export;
- implement stable identity on both sides;
- publish the safety contract and architecture overview;
- create release automation and signed binaries early;
- recruit five design partners;
- benchmark Mark and md2conf on the same corpus;
- publish results without claiming superiority before evidence.

### Days 31–60 — deliver safe one-way value

- implement plan/apply with optimistic concurrency;
- publish pages, hierarchy, links, and attachments;
- implement `login`, `doctor`, `init`, `status`, `plan`, `sync`;
- block remote drift;
- ship Docker, Homebrew, and GitHub Action;
- instrument local performance and optional anonymous activation metrics;
- write migration guides for Mark and md2conf users;
- onboard design partners into CI.

### Days 61–90 — establish differentiation and public credibility

- add reverse pull into a branch;
- prototype GitHub PR creation;
- publish compatibility dashboard;
- release two design-partner case studies;
- launch public beta;
- write the structural-sync technical article;
- submit to relevant docs-as-code and Atlassian communities;
- establish a second maintainer/reviewer;
- triage every public issue weekly;
- publish the next six-month roadmap.

### 90-day success criteria

- 10 active repositories;
- 1,000+ pages synchronized across design partners;
- no silent overwrite/data-loss incident;
- median setup time below 15 minutes, target below 10;
- 90%+ second-run no-op rate, with remaining churn explained;
- at least three external contributors;
- at least two independent production testimonials;
- a public corpus demonstrating where competitors and MarksSync differ.

---

## 27. Feature prioritization

### 27.1 Priority matrix

| Feature | User value | Differentiation | Risk reduction | Complexity | Priority |
|---|---:|---:|---:|---:|---|
| dry-run semantic plan | 5 | 4 | 5 | 3 | P0 |
| stable document/page identity | 5 | 4 | 5 | 4 | P0 |
| remote drift blocking | 5 | 5 | 5 | 3 | P0 |
| no-op/incremental sync | 5 | 3 | 4 | 3 | P0 |
| hierarchy and relative links | 5 | 2 | 4 | 4 | P0 |
| attachments lifecycle | 5 | 3 | 5 | 5 | P0 |
| easy login/doctor | 5 | 4 | 4 | 3 | P0 |
| GitHub Action | 5 | 3 | 3 | 2 | P0 |
| reverse pull to branch | 5 | 5 | 4 | 4 | P1 |
| automatic PR creation | 5 | 5 | 4 | 3 | P1 |
| rename/move reconciliation | 4 | 4 | 5 | 5 | P1 |
| safe delete/quarantine | 4 | 4 | 5 | 4 | P1 |
| structural three-way merge | 5 | 5 | 5 | 5 | P2 after evidence |
| continuous watch mode | 3 | 2 | 2 | 4 | P3 |
| GUI | 3 | 2 | 1 | 5 | P3 |
| AI auto-resolution | 3 | 4 | 1/negative if unsafe | 5 | P3 |
| many ecosystem plugins | 4 | 4 | 2 | 5 | sequence after core |

### 27.2 Features to explicitly postpone

- full browser-based editor;
- automatic semantic conflict resolution by LLM;
- arbitrary third-party macro editing;
- organization dashboard before active usage exists;
- real-time local watch as the primary story;
- every Git provider at launch;
- every Data Center version;
- automatic deletion by default;
- two-way inline comments before body synchronization is reliable.

---

## 28. AI strategy

### 28.1 Where AI helps

- explain a structural conflict in plain language;
- suggest a merged Markdown patch;
- classify an unknown macro and propose a plugin mapping;
- summarize a plan or PR;
- generate fixture cases from anonymized structures;
- detect likely semantic equivalence after deterministic checks;
- help users configure mappings from natural language;
- provide an MCP interface for agents to plan and inspect sync.

### 28.2 Where AI must not be authoritative

- page identity;
- delete decisions;
- permission decisions;
- detecting whether unsupported content can be discarded;
- silently applying overlapping changes;
- deciding that a lossy round trip is acceptable;
- rewriting confidential content through an external model without explicit consent.

### 28.3 Safe AI conflict workflow

1. deterministic engine identifies the conflicting nodes;
2. tool provides base/local/remote semantic context;
3. AI proposes a resolution patch with rationale;
4. deterministic parser validates the patch;
5. round-trip/loss checks run;
6. user reviews through Git PR;
7. normal apply engine executes with version preconditions.

AI is a reviewer assistant, not the synchronization authority.

---

## 29. Competitive moat

### 29.1 Public compatibility corpus

The largest durable moat is not proprietary conversion code. It is a continuously growing corpus of real Confluence/Markdown edge cases with expected behavior.

Competitors can copy a feature. Reproducing years of fixtures, visual baselines, API-version cases, and lifecycle scenarios is harder.

### 29.2 Identity and state migration

Once organizations map thousands of pages through stable MarksSync IDs, the tool becomes embedded—but the format should remain documented and open. Trust comes from portability, not lock-in.

### 29.3 Plugin ecosystem

Macro handlers, Git providers, documentation frameworks, and auth adapters can create network effects if the core contracts remain stable.

### 29.4 Reputation for safety

A public record of:

- no silent loss;
- rapid API-regression fixes;
- transparent postmortems;
- signed releases;
- honest compatibility reporting;

is difficult to displace.

### 29.5 Git-provider workflow depth

Reverse PRs, checks, annotations, provenance, and review policies are a stronger moat than raw conversion breadth because they integrate organizational process.

### 29.6 Migration paths

Importing mappings from Mark, md2conf, HTML exports, and custom scripts lowers switching cost and turns incumbent adoption into a growth channel.

---

## 30. Anti-patterns to avoid

1. **“Supports bidirectional sync” without a published state/conflict model.**
2. **Using title as the primary key.**
3. **Directly committing reverse changes to the default branch.**
4. **Treating a successful HTTP response as verified synchronization.**
5. **Deleting remote pages because files are absent from a partial checkout.**
6. **Flattening unsupported macros to text without warning.**
7. **Launching CLI, plugin, GUI, hosted service, and four Git providers simultaneously.**
8. **Requiring a hosted MarksSync account for basic open-source sync.**
9. **Hiding known incompatibilities to make the feature matrix look complete.**
10. **Letting generated formatting create endless no-op commits.**
11. **Returning raw API errors without remediation.**
12. **Relying only on mocked Confluence tests.**
13. **Making `--force` a general escape hatch.**
14. **Ignoring page restrictions, authorship, labels, and attachments as “metadata later.”**
15. **Allowing project ownership and release credentials to remain single-person dependencies.**
16. **Optimizing for stars before retention and trust.**

---

## 31. Recommended initial specification decisions

### Product

- Git authoritative by default.
- Remote drift blocks writes by default.
- Reverse flow creates branches/PRs.
- Full continuous bidirectionality is experimental until v1+ evidence.
- Native Confluence pages, not embed macros.
- Only committed Git content is authoritative in CI.
- Local uncommitted mode allowed for preview, not production apply by default.

### Configuration

- one versioned YAML config;
- include/exclude globs;
- directory-to-parent mapping;
- front-matter overrides;
- immutable document ID;
- page ID mapping;
- authority mode per mapping/document;
- explicit deletion policy;
- content profile/dialect;
- macro plugin configuration.

### Technical

- native cross-platform binary, preferably Go;
- canonical IR with preservation nodes;
- Confluence Cloud REST v2 first;
- explicit Data Center adapters;
- optimistic concurrency;
- operation plans and journals;
- JSON output contract;
- plugin SDK after core API stabilizes;
- deterministic conversion before AI assistance.

### Security

- keychain/env secrets;
- no tokens in config;
- redacted structured logs;
- signed releases and SBOM;
- narrow scopes;
- secure archive/path handling;
- optional local-only mode with no telemetry.

### Testing

- public fixture corpus;
- real Cloud nightly tests;
- selected Data Center integration matrix;
- golden files;
- property/fuzz tests;
- visual screenshots for fidelity;
- lifecycle and concurrency scenarios;
- competitor benchmark corpus.

---

## 32. Concrete repository backlog

### Epic A — Project foundation

- [ ] Establish canonical product spelling and GitHub organization strategy.
- [ ] Confirm license before external contributions increase.
- [ ] Add governance, security, support, contribution, and maintainer documents.
- [ ] Add release signing, checksums, SBOM, and automated changelog.
- [ ] Add ADR template and initial architecture decisions.

### Epic B — Canonical document model

- [ ] Define IR schema and versioning.
- [ ] Define semantic hashing.
- [ ] Define exact/equivalent/degraded/opaque/unsupported levels.
- [ ] Implement Markdown parser and stable renderer.
- [ ] Implement opaque sidecar store.
- [ ] Add corpus and golden tests.

### Epic C — Confluence read path

- [ ] Cloud authentication profiles.
- [ ] Space/page discovery.
- [ ] Page body ADF/storage retrieval.
- [ ] Labels, properties, attachments, hierarchy, restrictions metadata.
- [ ] Version and author provenance.
- [ ] Pull to Markdown and loss report.

### Epic D — Identity and mapping

- [ ] Tool-owned document UUID.
- [ ] Confluence content property anchor.
- [ ] Front matter and central mapping options.
- [ ] Duplicate/stale identity validation.
- [ ] Rename/move history.
- [ ] Mapping import from Mark/md2conf conventions.

### Epic E — Planning and safe publishing

- [ ] Repository graph discovery.
- [ ] Relative link resolution.
- [ ] Semantic diff.
- [ ] Human/JSON plan.
- [ ] Optimistic page update.
- [ ] Create/move/update operations.
- [ ] No-op verification.
- [ ] Drift blocking.

### Epic F — Attachments and diagrams

- [ ] Content-addressed attachment model.
- [ ] Upload/update/reference verification.
- [ ] Rename and delete policy.
- [ ] SVG fallback strategy.
- [ ] Mermaid/PlantUML/D2 source preservation.
- [ ] External renderer capability detection.

### Epic G — Git workflow

- [ ] Git status and committed-content modes.
- [ ] Rename detection.
- [ ] Branch/commit abstraction.
- [ ] GitHub adapter.
- [ ] Reverse-sync PR.
- [ ] PR annotations and plan artifact.
- [ ] GitLab adapter after GitHub stability.

### Epic H — Bidirectional merge

- [ ] Base-state model.
- [ ] Node matching.
- [ ] Structural operation diff.
- [ ] Commutativity rules.
- [ ] Conflict artifact schema.
- [ ] `resolve` command.
- [ ] Merge corpus and fuzzing.

### Epic I — Operations

- [ ] Rate-limit handling and cost estimate.
- [ ] Retry/idempotency keys.
- [ ] leases/concurrency interface.
- [ ] operation journal and resume.
- [ ] recovery/export before destructive apply.
- [ ] structured redacted logging.
- [ ] audit report.

### Epic J — Distribution and community

- [ ] Linux/macOS/Windows binaries.
- [ ] Docker image.
- [ ] Homebrew.
- [ ] GitHub Action.
- [ ] website/docs.
- [ ] two-minute demo.
- [ ] public compatibility dashboard.
- [ ] design-partner program.
- [ ] case-study template.

---

## 33. Key hypotheses to validate early

1. **Remote drift detection is enough to cause incumbent users to switch before full bidirectionality exists.**
2. **Teams prefer reverse changes as PRs over direct local-directory watch synchronization.**
3. **A protected opaque-node model is acceptable for unsupported macros.**
4. **Per-document IDs in front matter are acceptable when a central mapping alternative exists.**
5. **A Go binary materially improves activation compared with Python/Node requirements.**
6. **GitHub is the dominant initial provider, but GitLab support is required for enterprise credibility.**
7. **Attachments and relative links create more failed evaluations than exotic Markdown syntax.**
8. **Users will accept explicit conflicts in exchange for no silent overwrite.**
9. **Migration/export commands generate more initial discovery than bidirectional messaging.**
10. **A public compatibility corpus creates contributor and content-marketing leverage.**

For each hypothesis define a design-partner interview question and a measurable behavior, not only stated preference.

---

## 34. Final strategic recommendation

MarksSync should not attempt to beat every competitor by implementing every feature immediately. It should combine the strongest success factors from each archetype:

- **Mark:** binary simplicity, clear pain, CI readiness, technical-content breadth;
- **md2conf:** safety, stable IDs, hierarchy/link rigor, API-v2 alignment, detailed documentation;
- **markdown-confluence:** shared core and multiple distribution surfaces;
- **Duo Labs:** narrow, compelling CI story;
- **Sphinx Builder:** ecosystem adapters, professional documentation, long-term compatibility discipline;
- **Confluence Markdown Exporter:** reverse fidelity, destination awareness, portability narrative;
- **meridius:** migration acquisition and search-aligned positioning;
- **md2cf:** composable library architecture;
- **atlcli:** stateful bidirectional command model and explicit conflict handling;
- **confluence-bidir-sync:** baseline-based detection as the minimum credible two-way design.

Then it must add what none of them has made dominant:

1. remote drift protection as a default invariant;
2. Confluence changes converted into Git branches and pull requests;
3. structural three-way merge with an explicit loss model;
4. immutable identity and complete lifecycle handling;
5. a public compatibility laboratory;
6. enterprise-grade operational and supply-chain trust;
7. governance that survives the founder.

The highest-leverage initial positioning is:

> **MarksSync is the safe Git-native bridge to Confluence: publish reviewed Markdown, detect remote edits, and bring them back through pull requests—without silent overwrites or lost content.**

The highest-leverage first technical differentiator is:

> **A publish command that refuses to overwrite Confluence drift and explains exactly what changed.**

The highest-leverage second differentiator is:

> **A pull command that turns Confluence edits into a reviewable Git branch or pull request.**

The highest-leverage long-term moat is:

> **A canonical document model and public corpus that prove deterministic, loss-aware, conflict-safe round trips.**

If execution follows this sequence, MarksSync does not need to wait for perfect bidirectionality to become useful. It can win one-way users through superior safety, exporter users through superior portability, and eventually own bidirectional synchronization through accumulated trust and evidence.

---

## Appendix A — Comparative “steal / avoid” summary

| Project | Steal | Avoid |
|---|---|---|
| Mark | single binary, simple story, rich tech docs, releases | silent one-way overwrite assumptions, metadata-only identity |
| hunyadi/md2conf | safe ancestor checks, page IDs, graph pass, ordering, fixtures | dependency-heavy common path, no reverse model |
| markdown-confluence | shared core, Action/CLI/library/plugin surfaces, ADF orientation | overbroad surface without governance capacity |
| Duo Labs | narrow CI demo, front-matter reuse, company proof | historical-star complacency, no release discipline |
| Sphinx Builder | ecosystem integration, manuals, compatibility discipline | forcing all users into one authoring framework |
| Spenhouet exporter | direct API export, presets, incremental, portability message | treating clean export as round-trip-safe source |
| meridius | migration wedge, search-perfect naming, reuse mature converters | archive-based pipeline as sync architecture |
| iamjackg/md2cf | library/CLI separation, composability | fragmented forks and stalled PR throughput |
| atlcli | command model, state, conflicts, JSON, lock, plugins | diluted product message, laptop polling as primary workflow |
| confluence-bidir-sync | explicit baseline cases | shipping claims before package, corpus, and external validation |

---

## Appendix B — Proof-of-concept evaluation scenarios

A MarksSync release should not be called bidirectional until it passes at least the following scenarios.

### Identity and lifecycle

- create local file → remote page;
- rename file without title change;
- change title without path change;
- move file to a new directory/parent;
- move remote page and preserve local identity;
- same title under two parents;
- duplicate tool ID detection;
- remote page deleted;
- local file explicitly deleted;
- file excluded by config but not deleted;
- partial checkout does not delete remote pages;
- branch removes file while main retains it.

### Concurrent content

- local-only paragraph edit;
- remote-only paragraph edit;
- disjoint section edits;
- same paragraph edited differently;
- local section move and remote text edit;
- table edits in different cells;
- table edits in same cell;
- list item reordering and item edit;
- heading rename and remote anchor link addition;
- normalization-only difference;
- unsupported macro changed remotely while adjacent Markdown changes locally.

### Attachments

- new image;
- replace same filename;
- rename image;
- delete image reference but retain shared attachment;
- delete unreferenced managed attachment;
- remote attachment update;
- conflicting local/remote replacement;
- SVG fallback;
- large PDF/video;
- duplicate filename on different pages.

### Failure/recovery

- timeout after remote write but before response;
- 429 during tree apply;
- token loses permission mid-run;
- page version changes after plan;
- process killed after half the operations;
- two CI jobs race;
- webhook delivered twice/out of order;
- Confluence returns transient 5xx;
- malformed remote ADF/storage;
- Git push succeeds but PR creation fails;
- PR exists when retry occurs.

### Security

- malicious `../` attachment path;
- zip-slip archive;
- secret in error response;
- template attempts arbitrary command execution;
- webhook with invalid signature;
- oversized/decompression-bomb input;
- HTML/script injection in generated report;
- symlink escapes repository root.

---

## Appendix C — Principal evidence and sources

### Repositories and project documentation

- Mark: <https://github.com/kovetskiy/mark>
- Mark Star History: <https://star-history.com/#kovetskiy/mark&Date>
- hunyadi/md2conf: <https://github.com/hunyadi/md2conf>
- markdown-confluence: <https://github.com/markdown-confluence/markdown-confluence>
- historical Obsidian integration: <https://github.com/markdown-confluence/obsidian-integration>
- Duo Labs publisher: <https://github.com/duo-labs/markdown-to-confluence>
- Sphinx Confluence Builder: <https://github.com/sphinx-contrib/confluencebuilder>
- Confluence Markdown Exporter: <https://github.com/Spenhouet/confluence-markdown-exporter>
- meridius converter: <https://github.com/meridius/confluence-to-markdown>
- iamjackg/md2cf: <https://github.com/iamjackg/md2cf>
- atlcli: <https://github.com/BjoernSchotte/atlcli>
- atlcli sync documentation: <https://atlcli.sh/confluence/sync/>
- atlcli Git plugin: <https://atlcli.sh/plugins/plugin-git/>
- confluence-bidir-sync: <https://github.com/PatD42/confluence-bidir-sync>

### Independent/community evidence

- Hacker News user describing Mark for Git review plus Confluence accessibility: <https://news.ycombinator.com/item?id=33710603>
- Hacker News discussion of Markdown/Confluence editing pain and Mark: <https://news.ycombinator.com/item?id=21590355>
- Reddit recommendation and discussion of Confluence Markdown Exporter: <https://www.reddit.com/r/selfhosted/comments/1qalnum/tool_for_escaping_confluence_convert_exports_to/>
- Reddit migration experience warning that important pages still require inspection: <https://www.reddit.com/r/devops/comments/1o0a2l5/migrating_from_confluence_to_other_alternatives/>
- Atlassian Developer Community thread on the markdown-confluence maintainer situation: <https://community.developer.atlassian.com/t/guidance-on-unmaintained-markdown-confluence-project/100699>

### Atlassian platform evidence

- Confluence Cloud REST API: <https://developer.atlassian.com/cloud/confluence/rest/>
- Confluence Cloud REST API v2 pages: <https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/>
- Confluence Cloud rate limiting: <https://developer.atlassian.com/cloud/confluence/rate-limiting/>
- REST API v1 deprecation RFC: <https://community.developer.atlassian.com/t/rfc-19-deprecation-of-confluence-cloud-rest-api-v1-endpoints/71752>
- Updated v1 removal timeline: <https://community.developer.atlassian.com/t/update-to-confluence-v1-api-deprecation-timeline/79687>
- Live docs API guidance: <https://community.developer.atlassian.com/t/please-test-update-your-confluence-cloud-apps-to-function-in-live-docs-by-may-30-2025/89849>
- Community report on REST v2 performance: <https://community.developer.atlassian.com/t/rest-v2-performance/83537>

### Open-source project practice

- Open Source Guides — Building Welcoming Communities: <https://opensource.guide/building-community/>
- Open Source Guides — Metrics: <https://opensource.guide/metrics/>
- Open Source Guides — Starting a Project: <https://opensource.guide/starting-a-project/>

---

## Appendix D — Research caveats

- GitHub statistics change continuously and can differ between cached GitHub surfaces.
- Stars indicate interest, not necessarily active production installations.
- Public issue trackers overrepresent failures; satisfied users often remain silent.
- Independent feedback is sparse for several projects, so some success-factor conclusions are reasoned inferences from product design, activity, packaging, and adoption signals.
- Claims made by bidirectional projects were not treated as proven production guarantees without independent evidence and a public compatibility corpus.
- Confluence Cloud evolves continuously; all architecture recommendations should be verified against current API documentation during implementation.
