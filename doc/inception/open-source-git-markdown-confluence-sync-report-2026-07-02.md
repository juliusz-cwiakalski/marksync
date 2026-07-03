# Open-Source Git / Markdown ↔ Confluence Synchronization Tools

**Research date:** 2 July 2026  
**Scope:** Open-source tools that publish Markdown stored in Git repositories to Confluence, export Confluence content to Markdown/Git, or attempt bidirectional synchronization.  
**Prepared for:** Evaluation of the open-source landscape and the product opportunity for MarksSync for Confluence.

---

## Executive summary

The open-source ecosystem is substantially larger than a first search suggests, but most projects fall into one of four different categories that should not be compared as equivalent products:

1. **Git/Markdown → Confluence publishers** — the largest and most mature category.
2. **Confluence → Markdown exporters** — generally designed for migration, backup, local search, Obsidian, or RAG ingestion.
3. **Push and pull tools without automatic reconciliation** — capable of both directions as separate operations, but not a safe continuously bidirectional synchronization system.
4. **Conflict-aware bidirectional tools** — a very small and relatively young category.

<!-- TOC -->
* [Open-Source Git / Markdown ↔ Confluence Synchronization Tools](#open-source-git--markdown--confluence-synchronization-tools)
  * [Executive summary](#executive-summary)
    * [Main findings](#main-findings)
    * [Recommended shortlist](#recommended-shortlist)
  * [1. Scope, terminology, and research method](#1-scope-terminology-and-research-method)
    * [1.1 Inclusion criteria](#11-inclusion-criteria)
    * [1.2 Exclusions](#12-exclusions)
    * [1.3 Definitions used in this report](#13-definitions-used-in-this-report)
    * [1.4 Completeness caveat](#14-completeness-caveat)
    * [1.5 Star-count caveat](#15-star-count-caveat)
    * [1.6 Feedback evidence labels](#16-feedback-evidence-labels)
  * [2. Landscape overview](#2-landscape-overview)
    * [2.1 Capability categories](#21-capability-categories)
    * [2.2 Directionality matrix](#22-directionality-matrix)
  * [3. Complete repository inventory](#3-complete-repository-inventory)
  * [4. Functional comparison of leading tools](#4-functional-comparison-of-leading-tools)
    * [4.1 Publishing engines](#41-publishing-engines)
    * [4.2 Exporters](#42-exporters)
  * [5. Detailed project profiles](#5-detailed-project-profiles)
  * [5.1 Mark — `kovetskiy/mark`](#51-mark--kovetskiymark)
    * [Functionalities](#functionalities)
    * [What users praise](#what-users-praise)
    * [Complaints and limitations found](#complaints-and-limitations-found)
    * [Feedback evidence quality](#feedback-evidence-quality)
    * [Assessment](#assessment)
  * [5.2 `hunyadi/md2conf`](#52-hunyadimd2conf)
    * [Functionalities](#functionalities-1)
    * [What users praise](#what-users-praise-1)
    * [Complaints and limitations found](#complaints-and-limitations-found-1)
    * [Feedback evidence quality](#feedback-evidence-quality-1)
    * [Assessment](#assessment-1)
  * [5.3 `markdown-confluence/markdown-confluence`](#53-markdown-confluencemarkdown-confluence)
    * [Functionalities](#functionalities-2)
    * [What users praise](#what-users-praise-2)
    * [Complaints and limitations found](#complaints-and-limitations-found-2)
    * [Feedback evidence quality](#feedback-evidence-quality-2)
    * [Assessment](#assessment-2)
  * [5.4 Telefónica `confluence-tools` / `markdown-confluence-sync`](#54-telefónica-confluence-tools--markdown-confluence-sync)
    * [Functionalities](#functionalities-3)
    * [What users praise](#what-users-praise-3)
    * [Complaints and limitations found](#complaints-and-limitations-found-3)
    * [Feedback evidence quality](#feedback-evidence-quality-3)
    * [Assessment](#assessment-3)
  * [5.5 `zeldigas/text2confl`](#55-zeldigastext2confl)
    * [Functionalities](#functionalities-4)
    * [What users praise](#what-users-praise-4)
    * [Complaints and limitations found](#complaints-and-limitations-found-4)
    * [Feedback evidence quality](#feedback-evidence-quality-4)
    * [Assessment](#assessment-4)
  * [5.6 `BjoernSchotte/atlcli`](#56-bjoernschotteatlcli)
    * [Functionalities](#functionalities-5)
    * [What users praise](#what-users-praise-5)
    * [Complaints, risks, and missing validation](#complaints-risks-and-missing-validation)
    * [Feedback evidence quality](#feedback-evidence-quality-5)
    * [Assessment](#assessment-5)
  * [5.7 `PatD42/confluence-bidir-sync`](#57-patd42confluence-bidir-sync)
    * [Functionalities claimed](#functionalities-claimed)
    * [What users praise](#what-users-praise-6)
    * [Complaints and risks](#complaints-and-risks)
    * [Feedback evidence quality](#feedback-evidence-quality-6)
    * [Assessment](#assessment-6)
  * [5.8 `HUU/Junction`](#58-huujunction)
    * [Functionalities](#functionalities-6)
    * [What users praise](#what-users-praise-7)
    * [Complaints and limitations](#complaints-and-limitations)
    * [Feedback evidence quality](#feedback-evidence-quality-7)
    * [Assessment](#assessment-7)
  * [5.9 Java `md2conf/md2conf`](#59-java-md2confmd2conf)
    * [Functionalities](#functionalities-7)
    * [What users praise](#what-users-praise-8)
    * [Complaints and limitations](#complaints-and-limitations-1)
    * [Feedback evidence quality](#feedback-evidence-quality-8)
    * [Assessment](#assessment-8)
  * [5.10 `iamjackg/md2cf`](#510-iamjackgmd2cf)
    * [Functionalities](#functionalities-8)
    * [Praise](#praise)
    * [Complaints and limitations](#complaints-and-limitations-2)
    * [Feedback evidence quality](#feedback-evidence-quality-9)
  * [5.11 `duo-labs/markdown-to-confluence`](#511-duo-labsmarkdown-to-confluence)
    * [Functionalities](#functionalities-9)
    * [Praise](#praise-1)
    * [Complaints and limitations](#complaints-and-limitations-3)
    * [Feedback evidence quality](#feedback-evidence-quality-10)
  * [5.12 `Workable/confluence-docs-as-code`](#512-workableconfluence-docs-as-code)
    * [Functionalities](#functionalities-10)
    * [Praise](#praise-2)
    * [Complaints and limitations](#complaints-and-limitations-4)
    * [Feedback evidence quality](#feedback-evidence-quality-11)
  * [5.13 `Bhacaz/docs-as-code-confluence`](#513-bhacazdocs-as-code-confluence)
    * [Functionalities](#functionalities-11)
    * [Praise](#praise-3)
    * [Complaints and limitations](#complaints-and-limitations-5)
    * [Feedback evidence quality](#feedback-evidence-quality-12)
  * [5.14 `tuanpmt/docflu`](#514-tuanpmtdocflu)
    * [Functionalities](#functionalities-12)
    * [Praise](#praise-4)
    * [Complaints and limitations](#complaints-and-limitations-6)
    * [Feedback evidence quality](#feedback-evidence-quality-13)
  * [5.15 `mihaeu/cosmere`](#515-mihaeucosmere)
    * [Functionalities](#functionalities-13)
    * [Praise](#praise-5)
    * [Complaints and limitations](#complaints-and-limitations-7)
    * [Feedback evidence quality](#feedback-evidence-quality-14)
  * [5.16 `Spenhouet/confluence-markdown-exporter`](#516-spenhouetconfluence-markdown-exporter)
    * [Functionalities](#functionalities-14)
    * [What users praise](#what-users-praise-9)
    * [Complaints and limitations](#complaints-and-limitations-8)
    * [Feedback evidence quality](#feedback-evidence-quality-15)
    * [Assessment](#assessment-9)
  * [5.17 `gkoos/confluence2md`](#517-gkoosconfluence2md)
    * [Functionalities](#functionalities-15)
    * [What users praise](#what-users-praise-10)
    * [Complaints and requests](#complaints-and-requests)
    * [Feedback evidence quality](#feedback-evidence-quality-16)
    * [Assessment](#assessment-10)
  * [6. Compact profiles of additional tools](#6-compact-profiles-of-additional-tools)
  * [6.1 MkDocs and documentation-framework plugins](#61-mkdocs-and-documentation-framework-plugins)
    * [`pawelsikora/mkdocs-with-confluence`](#pawelsikoramkdocs-with-confluence)
    * [`jmanteau/mkdocs-to-confluence`](#jmanteaumkdocs-to-confluence)
    * [`johnny/mkdocs-confluence-publisher`](#johnnymkdocs-confluence-publisher)
    * [Sphinx Confluence Builder](#sphinx-confluence-builder)
  * [6.2 Small GitHub Actions and page uploaders](#62-small-github-actions-and-page-uploaders)
    * [`cupcakearmy/confluence-markdown-sync`](#cupcakearmyconfluence-markdown-sync)
    * [`7nohe/confluence-md`](#7noheconfluence-md)
    * [`humanendpoint/confluence-syncer`](#humanendpointconfluence-syncer)
    * [`axro-gmbh/markdown-to-confluence-sync`](#axro-gmbhmarkdown-to-confluence-sync)
    * [`zonkyio/confluence-sync`](#zonkyioconfluence-sync)
    * [`markdown-confluence/publish-action`](#markdown-confluencepublish-action)
    * [`Telefonica/markdown-confluence-sync-action`](#telefonicamarkdown-confluence-sync-action)
    * [`Kerwood/confluence-updater-action`](#kerwoodconfluence-updater-action)
  * [6.3 Build-tool and explicit mapping tools](#63-build-tool-and-explicit-mapping-tools)
    * [`Kerwood/confluence-updater`](#kerwoodconfluence-updater)
    * [`qwazer/markdown-confluence-gradle-plugin`](#qwazermarkdown-confluence-gradle-plugin)
    * [`talkiq/confluence-wiki-sync`](#talkiqconfluence-wiki-sync)
    * [`kattebak/markdown-confluence-cli`](#kattebakmarkdown-confluence-cli)
  * [6.4 Obsidian-oriented publication](#64-obsidian-oriented-publication)
    * [`BungaRazvan/confluence-link`](#bungarazvanconfluence-link)
    * [`markdown-confluence/obsidian-integration`](#markdown-confluenceobsidian-integration)
  * [6.5 Historical or proof-of-concept publishers](#65-historical-or-proof-of-concept-publishers)
    * [`NickSmet/markdown-to-confluence-publisher`](#nicksmetmarkdown-to-confluence-publisher)
    * [`MoebiusSolutions/confluence-markdown-sync`](#moebiussolutionsconfluence-markdown-sync)
    * [Other small wrappers and PoCs](#other-small-wrappers-and-pocs)
  * [7. Additional Confluence → Markdown tools](#7-additional-confluence--markdown-tools)
  * [7.1 `meridius/confluence-to-markdown`](#71-meridiusconfluence-to-markdown)
  * [7.2 `gergelykalman/confluence-markdown-exporter`](#72-gergelykalmanconfluence-markdown-exporter)
  * [7.3 `ttscoff/confluence2md`](#73-ttscoffconfluence2md)
  * [7.4 Historical lineage](#74-historical-lineage)
  * [8. Independent community feedback: recurring themes](#8-independent-community-feedback-recurring-themes)
  * [8.1 What people value](#81-what-people-value)
    * [Git review plus Confluence accessibility](#git-review-plus-confluence-accessibility)
    * [Automation eliminates duplicate copy/paste work](#automation-eliminates-duplicate-copypaste-work)
    * [Native pages are preferable to embeds for search and navigation](#native-pages-are-preferable-to-embeds-for-search-and-navigation)
    * [Incremental/no-op publication matters](#incrementalno-op-publication-matters)
    * [Attachments and diagrams are decision-driving features](#attachments-and-diagrams-are-decision-driving-features)
    * [Export tools are valued as an exit path](#export-tools-are-valued-as-an-exit-path)
  * [8.2 What people complain about](#82-what-people-complain-about)
    * [Confluence is not “Markdown with an API”](#confluence-is-not-markdown-with-an-api)
    * [True two-way sync needs more than two converters](#true-two-way-sync-needs-more-than-two-converters)
    * [Tables and links break in generic export pipelines](#tables-and-links-break-in-generic-export-pipelines)
    * [Macro rendering is inconsistent](#macro-rendering-is-inconsistent)
    * [Rename, move, and delete handling is often incomplete](#rename-move-and-delete-handling-is-often-incomplete)
    * [Title matching creates duplicates and ambiguity](#title-matching-creates-duplicates-and-ambiguity)
    * [Manual Confluence edits are overwritten](#manual-confluence-edits-are-overwritten)
    * [REST API migrations and authentication variations cause breakage](#rest-api-migrations-and-authentication-variations-cause-breakage)
    * [Watcher notifications and version spam](#watcher-notifications-and-version-spam)
    * [Small projects create maintenance risk](#small-projects-create-maintenance-risk)
  * [9. Why bidirectional synchronization is still not reliably solved](#9-why-bidirectional-synchronization-is-still-not-reliably-solved)
  * [9.1 Representational asymmetry](#91-representational-asymmetry)
  * [9.2 Identity is not equivalent to title or path](#92-identity-is-not-equivalent-to-title-or-path)
  * [9.3 Version and base tracking](#93-version-and-base-tracking)
  * [9.4 Text merge is not semantic merge](#94-text-merge-is-not-semantic-merge)
  * [9.5 Git workflow integration](#95-git-workflow-integration)
  * [9.6 Attachments and non-body metadata](#96-attachments-and-non-body-metadata)
  * [9.7 Eventual consistency and race conditions](#97-eventual-consistency-and-race-conditions)
  * [10. Evaluation and scoring framework](#10-evaluation-and-scoring-framework)
    * [10.1 Suggested weighted criteria](#101-suggested-weighted-criteria)
    * [10.2 Acceptance corpus](#102-acceptance-corpus)
    * [10.3 Lifecycle scenarios](#103-lifecycle-scenarios)
    * [10.4 Bidirectional scenarios](#104-bidirectional-scenarios)
    * [10.5 Evidence to capture](#105-evidence-to-capture)
  * [11. Tool-selection recommendations](#11-tool-selection-recommendations)
  * [11.1 When Git must be the sole source of truth](#111-when-git-must-be-the-sole-source-of-truth)
  * [11.2 When users must edit in both Git and Confluence](#112-when-users-must-edit-in-both-git-and-confluence)
  * [11.3 When the immediate need is migration or backup](#113-when-the-immediate-need-is-migration-or-backup)
  * [11.4 When the team already uses MkDocs](#114-when-the-team-already-uses-mkdocs)
  * [11.5 When explicit mappings are acceptable](#115-when-explicit-mappings-are-acceptable)
  * [11.6 Tools to approach as legacy or prototypes](#116-tools-to-approach-as-legacy-or-prototypes)
  * [12. Product gap and implications for MarksSync for Confluence](#12-product-gap-and-implications-for-markssync-for-confluence)
    * [12.1 High-value differentiators](#121-high-value-differentiators)
    * [12.2 Recommended staged product strategy](#122-recommended-staged-product-strategy)
    * [12.3 Competitive conclusion](#123-competitive-conclusion)
  * [13. Source links and evidence register](#13-source-links-and-evidence-register)
    * [Primary repositories](#primary-repositories)
    * [Independent discussions and articles](#independent-discussions-and-articles)
    * [Representative issue evidence](#representative-issue-evidence)
  * [14. Final conclusion](#14-final-conclusion)
<!-- TOC -->

### Main findings

- **Mature one-way publishing is available.** `kovetskiy/mark`, `hunyadi/md2conf`, `markdown-confluence`, and several framework-specific tools can reliably create or update native Confluence pages from Markdown.
- **Reliable reverse export is also available.** `Spenhouet/confluence-markdown-exporter` is the strongest general exporter found; `gkoos/confluence2md` is particularly interesting for graph-aware, RAG-oriented mirrors.
- **True bidirectional synchronization remains immature.** `BjoernSchotte/atlcli` is the most credible current implementation found: it supports pull, push, watch mode, stored base versions, conflict detection, and merge strategies. Its adoption is still small and independent production evidence is limited.
- `PatD42/confluence-bidir-sync` explicitly targets three-way synchronization, but currently looks like a prototype rather than an established dependency.
- Some tools advertise “two-way” capabilities when they actually provide **separate import/export operations**, preserve embedded source metadata, or perform manual round trips. These are useful but should not be classified as automatic bidirectional synchronization.
- **Round-trip fidelity is the core unsolved problem.** Confluence Cloud uses Atlassian Document Format (ADF) and APIs also expose Confluence storage-format structures. Markdown cannot losslessly represent all Confluence macros, layouts, comments, inline comments, smart links, extensions, and app-specific content.
- **Identity and lifecycle management are nearly as difficult as conversion.** A production synchronizer must preserve identity through page/file renames and moves, safely handle deletions, avoid duplicate pages caused by title matching, and distinguish intentional removal from an incomplete checkout or filtered build.
- GitHub star count is useful as a rough adoption signal, but it is not a maturity score. Some highly starred projects are legacy or lightly maintained, while smaller projects have recent REST API v2 work and more complete lifecycle behavior.

### Recommended shortlist

| Need | Recommended first evaluation |
|---|---|
| Mature generic Git → Confluence publisher | [`kovetskiy/mark`](https://github.com/kovetskiy/mark) |
| Rich Markdown, hierarchy, links, diagrams | [`hunyadi/md2conf`](https://github.com/hunyadi/md2conf) |
| ADF-native TypeScript ecosystem / Obsidian | [`markdown-confluence/markdown-confluence`](https://github.com/markdown-confluence/markdown-confluence), with maintenance-risk review |
| Docusaurus / Node and managed deletions | [`Telefonica/confluence-tools`](https://github.com/Telefonica/confluence-tools) |
| Markdown + AsciiDoc, Cloud + Data Center | [`zeldigas/text2confl`](https://github.com/zeldigas/text2confl) |
| Actual bidirectional proof of concept | [`BjoernSchotte/atlcli`](https://github.com/BjoernSchotte/atlcli) |
| Confluence → Markdown migration/export | [`Spenhouet/confluence-markdown-exporter`](https://github.com/Spenhouet/confluence-markdown-exporter) |
| Confluence graph/RAG mirror | [`gkoos/confluence2md`](https://github.com/gkoos/confluence2md) |
| Java/Maven push and dump workflows | [`md2conf/md2conf`](https://github.com/md2conf/md2conf) |

---

## 1. Scope, terminology, and research method

### 1.1 Inclusion criteria

A repository is included when it is open source and does at least one of the following:

- reads Markdown files and creates or updates native Confluence pages;
- maps a Git repository or local documentation tree to a Confluence page hierarchy;
- exports Confluence pages or spaces into Markdown files suitable for Git;
- implements or claims synchronization in both directions;
- provides a materially useful wrapper, plugin, or GitHub Action around one of those workflows.

The inventory includes standalone CLIs, libraries, Docker images, GitHub Actions, MkDocs/Sphinx/Gradle/Maven plugins, Obsidian integrations, and proof-of-concept repositories.

### 1.2 Exclusions

The main comparison excludes:

- proprietary Atlassian Marketplace applications;
- tools that only embed a remote Git file in a Confluence macro without creating a native page;
- generic Confluence SDKs without a documentation synchronization workflow;
- AsciiDoc-only systems unless Markdown is also a first-class input;
- generic website-to-Confluence tools with no Markdown/Git workflow;
- closed-source SaaS connectors;
- projects for which no public source repository could be verified.

Some adjacent tools are listed in an appendix for completeness.

### 1.3 Definitions used in this report

**Publisher**  
Transforms local Markdown into Confluence content and creates or updates pages.

**Exporter**  
Reads Confluence content and produces local Markdown files. Export by itself is not synchronization.

**Two-direction operations**  
A tool can push and pull, but each direction is invoked explicitly and there is no common base version, three-way merge, or conflict protocol.

**True bidirectional synchronization**  
Both sides can be edited; the tool tracks a common base or equivalent version state, detects concurrent divergence, preserves identity, and either merges changes or raises an explicit conflict without silently overwriting one side.

**Native Confluence page**  
A page created through the Confluence API, rather than content shown through a Git-rendering macro.

### 1.4 Completeness caveat

This report aims to cover all dedicated, publicly discoverable open-source projects found through GitHub, search-engine, Atlassian Community, Reddit, Hacker News, package-registry, and Marketplace-action searches as of the research date. It cannot mathematically guarantee discovery of every private fork, unindexed script, renamed repository, or newly created project.

### 1.5 Star-count caveat

GitHub stars below are a **point-in-time snapshot observed during research around 2 July 2026** and will change. Counts should be interpreted as approximate adoption signals, not quality rankings. A direct Star History link is provided for each repository so trends can be inspected instead of relying only on the current total.

### 1.6 Feedback evidence labels

- **Independent:** Reddit, Hacker News, Atlassian Community, blog posts by users, or discussions not controlled by the maintainer.
- **Issue-derived:** GitHub issues and pull requests. These are useful evidence of real failure modes, but they overrepresent problems because users open issues when something breaks.
- **Maintainer-reported:** README, release notes, project site, or launch posts. Useful for capability discovery, but not independent validation.
- **Sparse:** no meaningful third-party feedback found.

---

## 2. Landscape overview

### 2.1 Capability categories

| Category | Projects with the strongest fit |
|---|---|
| General Markdown → Confluence | Mark, hunyadi/md2conf, markdown-confluence, text2confl, md2conf/md2conf, iamjackg/md2cf |
| Repository/page-tree mirroring | Mark, hunyadi/md2conf, Telefonica/confluence-tools, Junction, text2confl, Bhacaz/docs-as-code-confluence |
| Framework-specific publishing | Workable/confluence-docs-as-code, mkdocs-to-confluence, mkdocs-with-confluence, mkdocs-confluence-publisher, Sphinx Confluence Builder |
| GitHub Action-centric | Bhacaz/docs-as-code-confluence, cupcakearmy/confluence-markdown-sync, 7nohe/confluence-md, humanendpoint/confluence-syncer, axro-gmbh/markdown-to-confluence-sync |
| Confluence → Markdown | Spenhouet/confluence-markdown-exporter, gkoos/confluence2md, meridius/confluence-to-markdown, gergelykalman/confluence-markdown-exporter, ttscoff/confluence2md |
| Separate push and pull/export | md2conf/md2conf, text2confl, atlcli |
| Conflict-aware bidirectional | atlcli; experimental PatD42/confluence-bidir-sync |
| Obsidian-oriented | markdown-confluence, BungaRazvan/confluence-link, several exporters with Obsidian presets |

### 2.2 Directionality matrix

Legend: **Yes** = first-class capability; **Partial** = separate command, limited scope, or no conflict-safe reconciliation; **No** = not a project goal.

| Tool | Markdown → Confluence | Confluence → Markdown | Automatic conflict detection | Three-way merge / common base | Watch/poll mode |
|---|---:|---:|---:|---:|---:|
| Mark | Yes | No | No | No | No |
| hunyadi/md2conf | Yes | No | No | No | No |
| markdown-confluence | Yes | No | No | No | No |
| Telefonica/confluence-tools | Yes | No | No | No | No |
| text2confl | Yes | Partial | No | No | No |
| atlcli | Yes | Yes | Yes | Yes | Yes |
| confluence-bidir-sync | Claimed | Claimed | Claimed | Claimed | Not clearly established |
| HUU/Junction | Yes | No | No | No | No |
| md2conf/md2conf | Yes | Yes | No | No | No |
| iamjackg/md2cf | Yes | No | No | No | No |
| Spenhouet exporter | No | Yes | No | No | No |
| gkoos/confluence2md | No | Yes | No | No | No |
| docflu | Yes | No* | No | No | No |

\* `docflu` preserves some source metadata and mentions bidirectional ideas, but full two-way synchronization is listed as future work.

---

## 3. Complete repository inventory

The table intentionally distinguishes engines from thin wrappers and historical projects.

| # | Repository | Direction | Type | Stars† | License | Maintenance signal | Star History |
|---:|---|---|---|---:|---|---|---|
| 1 | [kovetskiy/mark](https://github.com/kovetskiy/mark) | Git/MD → Confluence | Go CLI / engine | ~1,500 | Apache-2.0 | Active; release in Jun 2026 | [Chart](https://star-history.com/#kovetskiy/mark&Date) · [SVG](https://api.star-history.com/svg?repos=kovetskiy/mark&type=Date) |
| 2 | [hunyadi/md2conf](https://github.com/hunyadi/md2conf) | Git/MD → Confluence | Python CLI/library | ~219 | MIT | Active in 2026 | [Chart](https://star-history.com/#hunyadi/md2conf&Date) · [SVG](https://api.star-history.com/svg?repos=hunyadi/md2conf&type=Date) |
| 3 | [markdown-confluence/markdown-confluence](https://github.com/markdown-confluence/markdown-confluence) | Git/MD → Confluence | TS CLI/library/Docker/Action/Obsidian | ~271 | Apache-2.0 | Active code, but seeking maintainer in 2026 | [Chart](https://star-history.com/#markdown-confluence/markdown-confluence&Date) · [SVG](https://api.star-history.com/svg?repos=markdown-confluence/markdown-confluence&type=Date) |
| 4 | [Telefonica/confluence-tools](https://github.com/Telefonica/confluence-tools) | Git/MD → Confluence | TS monorepo / CLI | ~11 | Apache-2.0 | Active in 2026 | [Chart](https://star-history.com/#Telefonica/confluence-tools&Date) · [SVG](https://api.star-history.com/svg?repos=Telefonica/confluence-tools&type=Date) |
| 5 | [Telefonica/markdown-confluence-sync-action](https://github.com/Telefonica/markdown-confluence-sync-action) | Git/MD → Confluence | GitHub Action / wrapper | ~10 | Apache-2.0 | Older standalone action; compare with monorepo | [Chart](https://star-history.com/#Telefonica/markdown-confluence-sync-action&Date) · [SVG](https://api.star-history.com/svg?repos=Telefonica/markdown-confluence-sync-action&type=Date) |
| 6 | [zeldigas/text2confl](https://github.com/zeldigas/text2confl) | MD/AsciiDoc → Confluence; export | Kotlin CLI/library/Docker | ~23 | Apache-2.0 | Active; release Jun 2026 | [Chart](https://star-history.com/#zeldigas/text2confl&Date) · [SVG](https://api.star-history.com/svg?repos=zeldigas/text2confl&type=Date) |
| 7 | [BjoernSchotte/atlcli](https://github.com/BjoernSchotte/atlcli) | Bidirectional | TS/Bun CLI/plugin platform | ~29 | MIT | Active; releases in 2026 | [Chart](https://star-history.com/#BjoernSchotte/atlcli&Date) · [SVG](https://api.star-history.com/svg?repos=BjoernSchotte/atlcli&type=Date) |
| 8 | [PatD42/confluence-bidir-sync](https://github.com/PatD42/confluence-bidir-sync) | Bidirectional, claimed | Python prototype | ~1 | MIT | Experimental | [Chart](https://star-history.com/#PatD42/confluence-bidir-sync&Date) · [SVG](https://api.star-history.com/svg?repos=PatD42/confluence-bidir-sync&type=Date) |
| 9 | [HUU/Junction](https://github.com/HUU/Junction) | Git/MD → Confluence | Python CLI/library | ~42 | MIT | Hobby project; latest release 2024 | [Chart](https://star-history.com/#HUU/Junction&Date) · [SVG](https://api.star-history.com/svg?repos=HUU/Junction&type=Date) |
| 10 | [md2conf/md2conf](https://github.com/md2conf/md2conf) | Push + dump/export | Java CLI/Maven/Docker | ~22 | Apache-2.0 | Release in late 2024 | [Chart](https://star-history.com/#md2conf/md2conf&Date) · [SVG](https://api.star-history.com/svg?repos=md2conf/md2conf&type=Date) |
| 11 | [iamjackg/md2cf](https://github.com/iamjackg/md2cf) | Git/MD → Confluence | Python CLI/library | ~122 | MIT | Mature but latest release 2023 | [Chart](https://star-history.com/#iamjackg/md2cf&Date) · [SVG](https://api.star-history.com/svg?repos=iamjackg/md2cf&type=Date) |
| 12 | [duo-labs/markdown-to-confluence](https://github.com/duo-labs/markdown-to-confluence) | Git/MD → Confluence | Python CLI/Docker | ~320 | Apache-2.0 | Legacy; low recent activity | [Chart](https://star-history.com/#duo-labs/markdown-to-confluence&Date) · [SVG](https://api.star-history.com/svg?repos=duo-labs/markdown-to-confluence&type=Date) |
| 13 | [Workable/confluence-docs-as-code](https://github.com/Workable/confluence-docs-as-code) | MkDocs/MD → Confluence | JavaScript CLI | ~28 | ISC | Last significant release 2024 | [Chart](https://star-history.com/#Workable/confluence-docs-as-code&Date) · [SVG](https://api.star-history.com/svg?repos=Workable/confluence-docs-as-code&type=Date) |
| 14 | [Bhacaz/docs-as-code-confluence](https://github.com/Bhacaz/docs-as-code-confluence) | Git/MD → Confluence | GitHub Action | ~55 | MIT | Release Dec 2024 | [Chart](https://star-history.com/#Bhacaz/docs-as-code-confluence&Date) · [SVG](https://api.star-history.com/svg?repos=Bhacaz/docs-as-code-confluence&type=Date) |
| 15 | [tuanpmt/docflu](https://github.com/tuanpmt/docflu) | Docusaurus/MD → Confluence | JavaScript CLI | ~11 | MIT | New; no formal releases found | [Chart](https://star-history.com/#tuanpmt/docflu&Date) · [SVG](https://api.star-history.com/svg?repos=tuanpmt/docflu&type=Date) |
| 16 | [mihaeu/cosmere](https://github.com/mihaeu/cosmere) | MD → Confluence | TypeScript CLI/library | ~42 | MIT | Latest release 2022 | [Chart](https://star-history.com/#mihaeu/cosmere&Date) · [SVG](https://api.star-history.com/svg?repos=mihaeu/cosmere&type=Date) |
| 17 | [pawelsikora/mkdocs-with-confluence](https://github.com/pawelsikora/mkdocs-with-confluence) | MkDocs/MD → Confluence | MkDocs plugin | ~92 | MIT | Release Feb 2025 | [Chart](https://star-history.com/#pawelsikora/mkdocs-with-confluence&Date) · [SVG](https://api.star-history.com/svg?repos=pawelsikora/mkdocs-with-confluence&type=Date) |
| 18 | [jmanteau/mkdocs-to-confluence](https://github.com/jmanteau/mkdocs-to-confluence) | MkDocs/MD → Confluence | MkDocs plugin | ~4 | MIT | Active fork; release Nov 2025 | [Chart](https://star-history.com/#jmanteau/mkdocs-to-confluence&Date) · [SVG](https://api.star-history.com/svg?repos=jmanteau/mkdocs-to-confluence&type=Date) |
| 19 | [johnny/mkdocs-confluence-publisher](https://github.com/johnny/mkdocs-confluence-publisher) | MkDocs/MD → Confluence | MkDocs plugin | ~4 | Apache-2.0 | Small project | [Chart](https://star-history.com/#johnny/mkdocs-confluence-publisher&Date) · [SVG](https://api.star-history.com/svg?repos=johnny/mkdocs-confluence-publisher&type=Date) |
| 20 | [cupcakearmy/confluence-markdown-sync](https://github.com/cupcakearmy/confluence-markdown-sync) | MD → existing Confluence page | Python/Docker/Action | ~45 | MIT | Release Apr 2026 | [Chart](https://star-history.com/#cupcakearmy/confluence-markdown-sync&Date) · [SVG](https://api.star-history.com/svg?repos=cupcakearmy/confluence-markdown-sync&type=Date) |
| 21 | [7nohe/confluence-md](https://github.com/7nohe/confluence-md) | Git/MD → Confluence Cloud | TypeScript CLI/Action | ~6 | MIT | Active in 2026 | [Chart](https://star-history.com/#7nohe/confluence-md&Date) · [SVG](https://api.star-history.com/svg?repos=7nohe/confluence-md&type=Date) |
| 22 | [Kerwood/confluence-updater](https://github.com/Kerwood/confluence-updater) | Git/MD → existing pages | Rust CLI/Docker | ~14 | See repository | Release Nov 2025 | [Chart](https://star-history.com/#Kerwood/confluence-updater&Date) · [SVG](https://api.star-history.com/svg?repos=Kerwood/confluence-updater&type=Date) |
| 23 | [Kerwood/confluence-updater-action](https://github.com/Kerwood/confluence-updater-action) | Git/MD → existing pages | GitHub Action wrapper | ~2 | See repository | Wrapper around updater | [Chart](https://star-history.com/#Kerwood/confluence-updater-action&Date) · [SVG](https://api.star-history.com/svg?repos=Kerwood/confluence-updater-action&type=Date) |
| 24 | [talkiq/confluence-wiki-sync](https://github.com/talkiq/confluence-wiki-sync) | Git MD/RST → Confluence | Python/Lua/Action | ~17 | See repository | Release Dec 2025 | [Chart](https://star-history.com/#talkiq/confluence-wiki-sync&Date) · [SVG](https://api.star-history.com/svg?repos=talkiq/confluence-wiki-sync&type=Date) |
| 25 | [humanendpoint/confluence-syncer](https://github.com/humanendpoint/confluence-syncer) | Git/MD → Confluence | Python/Action | ~1 | MIT | Release Aug 2024 | [Chart](https://star-history.com/#humanendpoint/confluence-syncer&Date) · [SVG](https://api.star-history.com/svg?repos=humanendpoint/confluence-syncer&type=Date) |
| 26 | [axro-gmbh/markdown-to-confluence-sync](https://github.com/axro-gmbh/markdown-to-confluence-sync) | Git/MD → Confluence Cloud | GitHub Action | ~0 | See repository | Small action; v1.4 observed | [Chart](https://star-history.com/#axro-gmbh/markdown-to-confluence-sync&Date) · [SVG](https://api.star-history.com/svg?repos=axro-gmbh/markdown-to-confluence-sync&type=Date) |
| 27 | [kattebak/markdown-confluence-cli](https://github.com/kattebak/markdown-confluence-cli) | MD ↔ page operations | npm CLI | ~0 | See repository | Small/new | [Chart](https://star-history.com/#kattebak/markdown-confluence-cli&Date) · [SVG](https://api.star-history.com/svg?repos=kattebak/markdown-confluence-cli&type=Date) |
| 28 | [zonkyio/confluence-sync](https://github.com/zonkyio/confluence-sync) | MD → pre-created page | Script/Docker | ~15 | See repository | Small/older | [Chart](https://star-history.com/#zonkyio/confluence-sync&Date) · [SVG](https://api.star-history.com/svg?repos=zonkyio/confluence-sync&type=Date) |
| 29 | [qwazer/markdown-confluence-gradle-plugin](https://github.com/qwazer/markdown-confluence-gradle-plugin) | Gradle/MD → Confluence | Gradle plugin | ~14 | Apache-2.0 | Release Jan 2024 | [Chart](https://star-history.com/#qwazer/markdown-confluence-gradle-plugin&Date) · [SVG](https://api.star-history.com/svg?repos=qwazer/markdown-confluence-gradle-plugin&type=Date) |
| 30 | [NickSmet/markdown-to-confluence-publisher](https://github.com/NickSmet/markdown-to-confluence-publisher) | MD → Confluence | Node CLI/fork | ~0 | MIT | Small fork | [Chart](https://star-history.com/#NickSmet/markdown-to-confluence-publisher&Date) · [SVG](https://api.star-history.com/svg?repos=NickSmet/markdown-to-confluence-publisher&type=Date) |
| 31 | [MoebiusSolutions/confluence-markdown-sync](https://github.com/MoebiusSolutions/confluence-markdown-sync) | Git/MD → Confluence | Python/Docker | ~0 | MIT | Proof of concept / incomplete | [Chart](https://star-history.com/#MoebiusSolutions/confluence-markdown-sync&Date) · [SVG](https://api.star-history.com/svg?repos=MoebiusSolutions/confluence-markdown-sync&type=Date) |
| 32 | [BungaRazvan/confluence-link](https://github.com/BungaRazvan/confluence-link) | Obsidian MD → Confluence | Obsidian plugin | ~15 | Unlicense | Release Jan 2025 | [Chart](https://star-history.com/#BungaRazvan/confluence-link&Date) · [SVG](https://api.star-history.com/svg?repos=BungaRazvan/confluence-link&type=Date) |
| 33 | [Spenhouet/confluence-markdown-exporter](https://github.com/Spenhouet/confluence-markdown-exporter) | Confluence → Markdown | Python CLI/Docker | ~486 | MIT | Active; release Jun 2026 | [Chart](https://star-history.com/#Spenhouet/confluence-markdown-exporter&Date) · [SVG](https://api.star-history.com/svg?repos=Spenhouet/confluence-markdown-exporter&type=Date) |
| 34 | [gkoos/confluence2md](https://github.com/gkoos/confluence2md) | Confluence → Markdown | Go CLI | ~24 | MIT | Active; release Jun 2026 | [Chart](https://star-history.com/#gkoos/confluence2md&Date) · [SVG](https://api.star-history.com/svg?repos=gkoos/confluence2md&type=Date) |
| 35 | [meridius/confluence-to-markdown](https://github.com/meridius/confluence-to-markdown) | HTML export → Markdown | Shell/Pandoc converter | ~143 | MIT | Archived Dec 2021 | [Chart](https://star-history.com/#meridius/confluence-to-markdown&Date) · [SVG](https://api.star-history.com/svg?repos=meridius/confluence-to-markdown&type=Date) |
| 36 | [gergelykalman/confluence-markdown-exporter](https://github.com/gergelykalman/confluence-markdown-exporter) | Confluence → Markdown | Python script | ~70 | MIT | Small; no formal releases | [Chart](https://star-history.com/#gergelykalman/confluence-markdown-exporter&Date) · [SVG](https://api.star-history.com/svg?repos=gergelykalman/confluence-markdown-exporter&type=Date) |
| 37 | [ttscoff/confluence2md](https://github.com/ttscoff/confluence2md) | HTML export → Markdown | Ruby CLI | ~11 | See repository | Release Oct 2024 | [Chart](https://star-history.com/#ttscoff/confluence2md&Date) · [SVG](https://api.star-history.com/svg?repos=ttscoff/confluence2md&type=Date) |
| 38 | [markdown-confluence/publish-action](https://github.com/markdown-confluence/publish-action) | Git/MD → Confluence | GitHub Action wrapper | ~21 | Apache-2.0 | Wrapper; engine in main repo | [Chart](https://star-history.com/#markdown-confluence/publish-action&Date) · [SVG](https://api.star-history.com/svg?repos=markdown-confluence/publish-action&type=Date) |
| 39 | [markdown-confluence/obsidian-integration](https://github.com/markdown-confluence/obsidian-integration) | Obsidian MD → Confluence | Historical plugin repo | ~148 | Apache-2.0 | Source moved into main monorepo | [Chart](https://star-history.com/#markdown-confluence/obsidian-integration&Date) · [SVG](https://api.star-history.com/svg?repos=markdown-confluence/obsidian-integration&type=Date) |

† Approximate stars observed during the research snapshot. Open the repository for the current value.

---

## 4. Functional comparison of leading tools

### 4.1 Publishing engines

| Capability | Mark | hunyadi/md2conf | markdown-confluence | Telefonica tools | text2confl | Junction | md2conf Java |
|---|---:|---:|---:|---:|---:|---:|---:|
| Native page create/update | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Recursive directory/tree | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Stable page ID metadata | Yes | Yes | Yes | Modes/config | Yes | Internal mapping | Yes |
| Parent auto-creation | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Relative link rewriting | Yes | Yes | Yes | Yes | Yes/varies | Yes | Yes |
| Attachments/images | Yes | Yes | Yes | Yes | Yes | Limited/varies | Yes |
| Mermaid | Yes | Yes | Yes | Yes | Via extensions/Kroki | Not central | Limited/macro route |
| PlantUML | Yes | Yes | Not primary | Yes | Via extensions/Kroki | Not central | Macro/pipeline support |
| D2 | Yes | Not highlighted | Not highlighted | Possible via processing | Via Kroki/extensions | No | No |
| Draw.io | No | Yes | No | No | Extension-dependent | No | No |
| LaTeX/math | Limited | Yes | Limited | Processor-dependent | Extension-dependent | No | Limited |
| Labels | Yes | Yes | Yes | Metadata/front matter | Yes | Limited | Yes |
| Restrictions | Limited | Limited | Some workflows | Notice/config-oriented | Varies | No | Limited |
| Dry run | Yes | Local conversion/options | Yes/preview paths | Yes | Yes/plan modes | Yes | Yes |
| Skip unchanged | Yes | Yes/version comparison | Hash/compare behavior | Yes | Multiple strategies | Git-delta driven | Yes, idempotent client |
| Rename/move handling | Limited/metadata-dependent | ID-based/manual safeguards | Page moves supported | Tree/ID modes | Mapping-dependent | Commit-delta-driven | Mapping/file conventions |
| Delete/orphan handling | Limited/careful | Limited | Limited | Yes | Yes | Whole-space reconciliation | Configurable orphan removal |
| Cloud REST v2 readiness | Evolving/version-dependent | Strong explicit v2 support | ADF oriented; some API migration issues | Supports modern APIs/config | Cloud + Server/DC | Verify | Supports configured APIs |
| Server/Data Center | Yes/varies by version | Legacy mode | Varies | Primarily tested on specific versions | Yes | Designed around API | Yes |
| Reverse export | No | No | No | No | Yes, limited round trip | No | Yes |
| Conflict-aware two-way | No | No | No | No | No | No | No |

### 4.2 Exporters

| Capability | Spenhouet exporter | gkoos/confluence2md | meridius converter | gergelykalman exporter | ttscoff/confluence2md |
|---|---:|---:|---:|---:|---:|
| Confluence API source | Yes | Yes | No, HTML export | Yes | No, HTML export |
| Whole-space export | Yes | Graph/seed traversal | Export archive | Script-dependent | Export archive |
| Hierarchy reconstruction | Yes | Graph-aware | From archive | Basic | Yes/cleanup tools |
| Local link rewriting | Yes | Yes | Pandoc/post-processing | Limited | Yes |
| Attachment download | Yes | Yes | Export archive assets | Basic | Image flattening/options |
| Incremental export | Yes | Yes, checkpoints | No | No | Re-run conversion |
| YAML front matter | Target/preset dependent | Yes | No | Limited | Metadata cleanup/options |
| Comments | Macro/format dependent | Yes | Export-dependent | No | Export-dependent |
| Link graph metadata | No | Yes | No | No | No |
| Obsidian preset | Yes | Output suitable | Manual | Manual | Manual |
| RAG-oriented output | Suitable | Explicit focus | Possible after cleanup | Possible | Possible after cleanup |
| Bidirectional merge | No | No | No | No | No |

---

## 5. Detailed project profiles

## 5.1 Mark — `kovetskiy/mark`

- **Repository:** <https://github.com/kovetskiy/mark>
- **Direction:** Markdown/Git → Confluence
- **Implementation:** Go CLI
- **License:** Apache-2.0
- **Adoption:** approximately 1,500 GitHub stars; by far one of the most visible dedicated publishers
- **Star history:** [interactive chart](https://star-history.com/#kovetskiy/mark&Date) · [SVG widget](https://api.star-history.com/svg?repos=kovetskiy/mark&type=Date)
- **Maintenance:** active; a v16.5.0 release was observed on 29 June 2026
- **Best fit:** a portable CI-friendly publisher where Git is explicitly authoritative

### Functionalities

1. **Create and update native Confluence pages**  
   Reads Markdown, converts it to Confluence-compatible content, and creates or updates pages via the API.

2. **Per-document Confluence metadata**  
   HTML comments embedded in Markdown can define the space, parent, folder, title, attachments, labels, and image alignment. This keeps publication metadata versioned next to the document.

3. **Parent and folder handling**  
   Can construct page ancestry and create parent pages where needed, reducing the amount of manual Confluence setup.

4. **Attachments**  
   Uploads referenced files and images. Attachment behavior is one of the areas where real-world edge cases appear, particularly replacement and same-name lifecycle handling.

5. **Labels**  
   Applies Confluence labels from source metadata.

6. **Includes**  
   Supports composing a page from reusable Markdown fragments.

7. **Diagram rendering**  
   Supports Mermaid, PlantUML, and D2 workflows, normally by rendering diagrams before upload or embedding the appropriate result.

8. **Confluence macro support**  
   Supports technical-documentation constructs that map to Confluence macros rather than plain Markdown alone.

9. **Dry-run and compile-only workflows**  
   Allows users to inspect generated content or intended operations without immediately mutating Confluence.

10. **Title control**  
    Can derive a title from the first H1, omit that H1 from the published body, or use explicit metadata.

11. **Selective publishing**  
    Supports glob patterns and publishing only content considered changed, useful for CI pipelines.

12. **Cross-platform delivery**  
    A Go implementation makes it comparatively easy to distribute as a standalone binary and use in containers.

### What users praise

- A Hacker News user described the central value proposition clearly: documents remain reviewable in Git while becoming broadly accessible to colleagues in Confluence. That combination—engineering workflow plus organizational discoverability—is the strongest recurring praise for Mark and similar tools.
- Its standalone binary, established user base, and CI suitability make it a frequent default recommendation.
- Rich technical-content support, especially diagrams and macros, is broader than in many small Actions.

### Complaints and limitations found

- **Not bidirectional.** Manual Confluence edits are not safely reconciled with Git and may be overwritten.
- Users have requested more natural folder-hierarchy/front-matter behavior: [issue #59](https://github.com/kovetskiy/mark/issues/59).
- Attachment replacement and lifecycle semantics have generated issues: [#184](https://github.com/kovetskiy/mark/issues/184), [#525](https://github.com/kovetskiy/mark/issues/525), and an MP4-related case [#500](https://github.com/kovetskiy/mark/issues/500).
- Configuration lookup/migration can create upgrade friction: [#613](https://github.com/kovetskiy/mark/issues/613).
- Metadata in HTML comments is powerful but can feel intrusive compared with a repository-level mapping file or YAML front matter.
- Rename, move, and deletion semantics need careful validation; a page title is not a sufficient immutable identity.

### Feedback evidence quality

**Good.** It has independent community mentions plus a substantial issue history. Issue volume should not be interpreted as low quality; it partly reflects adoption.

### Assessment

Mark is the safest first baseline for a one-way proof of concept. It is not the answer to conflict-aware bidirectional synchronization, but it is a strong reference for publishing UX, metadata, diagrams, distribution, and CI behavior.

---

## 5.2 `hunyadi/md2conf`

- **Repository:** <https://github.com/hunyadi/md2conf>
- **Direction:** Markdown/Git → Confluence
- **Implementation:** Python CLI and library
- **License:** MIT
- **Adoption:** approximately 219 stars
- **Star history:** [chart](https://star-history.com/#hunyadi/md2conf&Date) · [SVG](https://api.star-history.com/svg?repos=hunyadi/md2conf&type=Date)
- **Maintenance:** active in 2026
- **Best fit:** complex repository trees where links, hierarchy, tables, extensions, and diagrams matter

### Functionalities

1. **Confluence Storage Format generation**  
   Parses Markdown and produces Confluence-compatible XHTML/storage content.

2. **REST API v2 usage**  
   Explicitly uses Confluence Cloud REST API v2 where possible, which is important as older v1 content endpoints are deprecated or removed.

3. **Single-file and recursive publishing**  
   Can publish one file or walk a complete directory.

4. **Stable page identity**  
   Supports explicit page IDs in HTML comments or front matter. It can also match pages by title under a trusted ancestor, but warns about ambiguous or unsafe situations.

5. **Source metadata injection**  
   Can write resolved Confluence page IDs back to source Markdown, making subsequent runs more deterministic. This can be disabled when generated source changes are undesirable.

6. **Folder-to-page hierarchy**  
   Uses `index.md` or `README.md` conventions to represent folders and reconstruct a page tree.

7. **Child-page order synchronization**  
   Preserves or updates ordering, which many simpler publishers ignore.

8. **Relative-link rewriting**  
   Rewrites links between Markdown documents to point to the corresponding Confluence pages.

9. **Title synchronization and conflict warnings**  
   Updates page titles and warns about unsafe title conflicts.

10. **Images and attachments**  
    Uploads local assets and can provide PNG fallbacks for SVG where necessary.

11. **Broad Markdown support**  
    Includes headings, emphasis, monospace, underline, strike-through, links, lists, block quotes, code, tables, footnotes, task lists, emojis, GitHub/GitLab alerts, collapsible sections, status and date constructs.

12. **Technical diagrams and math**  
    Supports Mermaid, PlantUML, Draw.io, and LaTeX workflows.

13. **Labels and front matter**  
    Applies labels and document metadata from front matter.

14. **Inline-comment and Confluence-content handling**  
    Includes behavior for unresolved inline comments and selected Confluence-specific structures.

15. **Content properties and skip blocks**  
    Can preserve or inject properties and omit source blocks from publication.

16. **Offline/local conversion**  
    Can emit Confluence Storage Format locally without publishing, valuable for testing and diffing.

17. **Extension and Python API model**  
    Can be embedded or extended rather than used only as a subprocess.

18. **Docker usage**  
    Supports containerized CI execution.

### What users praise

- Feature breadth is unusually strong for a compact tool, especially relative links, folder hierarchy, page ordering, and diagrams.
- Explicit modern API support reduces immediate Cloud migration risk.
- The ability to use page IDs while retaining readable source organization is a sound design choice.

### Complaints and limitations found

- It remains one-way; manual Confluence edits are not merged back.
- Configuration around proxies, gateways, and custom headers can be an issue in enterprise environments: [issue #57](https://github.com/hunyadi/md2conf/issues/57).
- Markdown parsing is intentionally standards-oriented; users with loose or nonstandard source formatting may need to normalize spacing and syntax.
- A Python runtime and dependencies are less frictionless than a single static binary.
- Rich-format support should still be tested with the organization’s exact macros, Confluence apps, and tables.

### Feedback evidence quality

**Moderate.** Strong maintainer documentation and issue evidence; less broad independent discussion than Mark.

### Assessment

Probably the strongest candidate when document fidelity and repository hierarchy matter more than minimal installation footprint. It is an important technical benchmark for MarksSync.

---

## 5.3 `markdown-confluence/markdown-confluence`

- **Repository:** <https://github.com/markdown-confluence/markdown-confluence>
- **Direction:** Markdown/Git → Confluence
- **Implementation:** TypeScript; CLI, npm library, Docker image, GitHub Action, Obsidian integration
- **License:** Apache-2.0
- **Adoption:** approximately 271 stars in the main repository, plus historical stars in related integration repositories
- **Star history:** [chart](https://star-history.com/#markdown-confluence/markdown-confluence&Date) · [SVG](https://api.star-history.com/svg?repos=markdown-confluence/markdown-confluence&type=Date)
- **Maintenance:** recent activity, but the project publicly sought a new maintainer/guidance in May 2026
- **Best fit:** TypeScript/npm and Obsidian-oriented teams wanting ADF-native publication

### Functionalities

1. **Markdown to Atlassian Document Format**  
   Generates ADF rather than relying exclusively on legacy storage-format conversion.

2. **Multiple delivery modes**  
   Can be used as a CLI, npm dependency, Docker tool, GitHub Action, or Obsidian plugin.

3. **Directory mirroring**  
   Maps local directory structure to a Confluence hierarchy.

4. **Page movement**  
   Attempts to move corresponding Confluence pages when local files move, a capability many publishers omit.

5. **Attachment hashing**  
   Uses hashes to avoid unnecessary attachment uploads and versions.

6. **Mermaid**  
   Supports rendered Mermaid diagrams.

7. **Front matter**  
   Reads page metadata and publication options from source files.

8. **Obsidian syntax/extensions**  
   Supports an ecosystem where Markdown includes Obsidian-specific constructs.

9. **GitHub Action**  
   Provides a CI-friendly publishing workflow through the related `publish-action` repository.

### What users praise

- ADF-oriented design aligns with modern Confluence Cloud.
- The combination of CLI, package, Docker, Action, and Obsidian plugin is broader than most alternatives.
- Page-move and attachment-hash behavior addresses practical repository evolution.

### Complaints and limitations found

- **Maintenance ownership risk.** A May 2026 Atlassian Developer Community post stated that the project was seeking guidance or a new maintainer: <https://community.developer.atlassian.com/t/guidance-on-unmaintained-markdown-confluence-project/100699>.
- A feature request confirms that genuine two-way synchronization is not present: [issue #533](https://github.com/markdown-confluence/markdown-confluence/issues/533).
- API migration/authentication problems have appeared, including REST v1 `/content` returning HTTP 410 in some OAuth flows: [issue #796](https://github.com/markdown-confluence/markdown-confluence/issues/796).
- Mermaid in Docker on macOS ARM has produced environment-specific failures: [#786](https://github.com/markdown-confluence/markdown-confluence/issues/786).
- Users have requested stronger unchanged-content detection [#673](https://github.com/markdown-confluence/markdown-confluence/issues/673), macro coverage [#670](https://github.com/markdown-confluence/markdown-confluence/issues/670), image sizing [#658](https://github.com/markdown-confluence/markdown-confluence/issues/658), and sub-parent configuration [#657](https://github.com/markdown-confluence/markdown-confluence/issues/657).
- Obsidian updates have broken integration behavior in the past: [#627](https://github.com/markdown-confluence/markdown-confluence/issues/627).

### Feedback evidence quality

**Moderate to good.** Rich issue history and an independent/public maintenance discussion. Less independent praise than issue evidence.

### Assessment

Technically interesting and likely one of the best ADF references, but adoption should be conditional on a maintenance/governance assessment or willingness to maintain a fork.

---

## 5.4 Telefónica `confluence-tools` / `markdown-confluence-sync`

- **Repository:** <https://github.com/Telefonica/confluence-tools>
- **Related Action:** <https://github.com/Telefonica/markdown-confluence-sync-action>
- **Direction:** Markdown/Git → Confluence
- **Implementation:** TypeScript monorepo and GitHub Action
- **License:** Apache-2.0
- **Adoption:** approximately 11 stars for the monorepo and 10 for the standalone Action
- **Star history:** [monorepo](https://star-history.com/#Telefonica/confluence-tools&Date) · [Action](https://star-history.com/#Telefonica/markdown-confluence-sync-action&Date)
- **Maintenance:** monorepo active in 2026
- **Best fit:** Docusaurus/Node projects and controlled page-tree reconciliation including deletion

### Functionalities

1. **Create, update, and delete pages**  
   Reconciles the desired Markdown set against Confluence rather than only upserting pages.

2. **Tree mode**  
   Mirrors nested directories into a Confluence hierarchy.

3. **Flat mode**  
   Publishes a directory without recreating every source directory level.

4. **Page-ID mode**  
   Uses explicit identity mappings for deterministic updates.

5. **Attachment and image handling**  
   Publishes local assets referenced by documents.

6. **Mermaid rendering**  
   Supports diagram conversion.

7. **Front matter**  
   Uses source metadata for publication behavior.

8. **Docusaurus support**  
   Understands Docusaurus-oriented source structures and metadata.

9. **Dry run**  
   Can report intended synchronization operations before mutation.

10. **Confluence-side dry run / operation preview**  
    Separates generated-content preparation from actual API changes.

11. **Configurable API prefix and authentication**  
    Useful for installations behind proxies or non-default paths.

12. **Notice banners and file metadata**  
    Can mark generated pages and expose source provenance.

13. **Rehype processing**  
    Allows HTML/Markdown transformation customization.

14. **GitHub-style alerts and code blocks**  
    Supports common technical-documentation extensions.

### What users praise

- The most distinctive capability is explicit deletion/reconciliation, which is often absent elsewhere.
- Docusaurus awareness lowers integration work for existing docs sites.
- Modes make it possible to choose between convenient title/tree behavior and explicit IDs.

### Complaints and limitations found

- Independent community feedback is sparse.
- Documentation has historically emphasized testing against specific Confluence versions; Cloud behavior and REST API compatibility should be verified against the target tenant.
- Deletion is powerful but dangerous. A misconfigured root, filtered checkout, or incomplete CI artifact can make a reconciler remove valid pages.
- It is not bidirectional and does not preserve arbitrary manual Confluence edits.
- The relationship between the older standalone Action and the newer monorepo should be clarified before adoption.

### Feedback evidence quality

**Sparse, mainly maintainer-reported.** The feature set is credible, but there is little independent operational evidence.

### Assessment

A strong candidate for source-of-truth publication when deletions and Docusaurus are required. It should be evaluated with deletion disabled or sandboxed until identity and scope safeguards are proven.

---

## 5.5 `zeldigas/text2confl`

- **Repository:** <https://github.com/zeldigas/text2confl>
- **Direction:** Markdown/AsciiDoc → Confluence, plus Confluence page export to Markdown
- **Implementation:** Kotlin
- **License:** Apache-2.0
- **Adoption:** approximately 23 stars
- **Star history:** [chart](https://star-history.com/#zeldigas/text2confl&Date) · [SVG](https://api.star-history.com/svg?repos=zeldigas/text2confl&type=Date)
- **Maintenance:** active; release 0.26.0 observed on 30 June 2026
- **Best fit:** mixed Markdown/AsciiDoc environments and organizations supporting both Cloud and Data Center

### Functionalities

1. **Markdown and AsciiDoc input**  
   Supports both formats and can use them in the same documentation set.

2. **Cloud, Server, and Data Center**  
   Broader deployment coverage than Cloud-only Actions.

3. **Page-tree publication**  
   Builds nested Confluence structures from local content.

4. **Macro and extension architecture**  
   Supports Confluence-specific and custom transformation behavior.

5. **Ad hoc upload and normal project publication**  
   Useful both for one-off documents and repository-driven builds.

6. **Docker support**  
   Enables reproducible CI execution.

7. **Confluence page export to Markdown**  
   Provides a reverse operation. This is valuable for migration or inspection, but does not by itself constitute conflict-aware continuous synchronization.

8. **Virtual pages**  
   Can create structural pages that may not correspond one-to-one with source documents.

9. **Orphan management**  
   Detects or handles pages no longer represented locally.

10. **Multi-tenancy/configuration profiles**  
    Supports multiple targets or publication contexts.

11. **Change-detection strategies**  
    Avoids unnecessary versions based on configured comparison behavior.

12. **Diagram extension paths**  
    Repository structure and documentation indicate Kroki/diagram integration possibilities.

### What users praise

- Unusual breadth across Markdown, AsciiDoc, Cloud, and Data Center.
- Export plus publication in one codebase is useful for migrations and diagnostics.
- Active release cadence despite a relatively small star count.

### Complaints and limitations found

- Independent user commentary is sparse.
- Reverse export is not a three-way merge engine; lossless round trips must not be assumed.
- Kotlin/JVM distribution may be heavier than Go or Rust binaries for a small CI job.
- Extension richness increases configuration surface and requires a representative acceptance corpus.

### Feedback evidence quality

**Sparse.** Mostly maintainer documentation and repository activity.

### Assessment

A technically serious but under-the-radar option. It deserves a proof of concept when Data Center, AsciiDoc, or export capability is mandatory.

---

## 5.6 `BjoernSchotte/atlcli`

- **Repository:** <https://github.com/BjoernSchotte/atlcli>
- **Project site:** <https://atlcli.sh/>
- **Confluence documentation:** <https://atlcli.sh/confluence/>
- **Direction:** Bidirectional local Markdown ↔ Confluence
- **Implementation:** TypeScript/Bun CLI with plugins
- **License:** MIT
- **Adoption:** approximately 29 stars and 8 forks
- **Star history:** [chart](https://star-history.com/#BjoernSchotte/atlcli&Date) · [SVG](https://api.star-history.com/svg?repos=BjoernSchotte/atlcli&type=Date)
- **Maintenance:** active; v0.17.0 observed in May 2026; v0.16.0 added Windows and Data Center compatibility
- **Best fit:** the first open-source tool to test when actual two-way behavior is required

### Functionalities

1. **Initialization and workspace mapping**  
   Creates local configuration and establishes the relationship between a Confluence area and Markdown files.

2. **Pull**  
   Retrieves Confluence pages into local Markdown.

3. **Push**  
   Publishes local Markdown changes back to Confluence.

4. **Watch mode**  
   Watches local files and polls or receives remote change signals, enabling near-continuous operation.

5. **Webhook support**  
   Reduces polling latency and unnecessary API calls where Confluence webhooks can be configured.

6. **Base-version tracking**  
   Stores synchronization metadata needed to determine whether local, remote, or both sides changed.

7. **Conflict detection**  
   Detects divergent edits instead of blindly applying last-write-wins.

8. **Conflict strategies**  
   Supports local-wins, remote-wins, and merge-oriented behavior.

9. **Three-way merge**  
   Uses a stored base to merge local and remote Markdown representations where possible.

10. **Conflict markers**  
    Leaves standard conflict markers when automatic merging cannot resolve a section.

11. **YAML front matter with stable identifiers**  
    Preserves Confluence page identity and synchronization metadata in files.

12. **Confluence Cloud and Data Center/Server support**  
    Broader target coverage than Cloud-only tools.

13. **Macro round-trip support**  
    Documents support for info/note/warning/tip panels, expand, TOC, code, tables, tasks, and layouts. Unknown macros are intended to be preserved rather than destroyed.

14. **Template support**  
    Can create or manage content through templates.

15. **Page links and Jira smart links**  
    Handles Atlassian-native linking constructs.

16. **Content audit**  
    Includes checks for stale pages, broken links, orphan pages, and contributor/concentration risks.

17. **DOCX export**  
    Provides additional document-delivery functionality beyond synchronization.

18. **Attachments, labels, history, and comments**  
    Exposes a broad Confluence operation set.

19. **Plugin system**  
    Allows capabilities such as Git integration to be added without hard-wiring every workflow into the core.

20. **Git plugin and CI recipes**  
    Can inspect or create local Git state/commits. Remote push and pull-request policy remain normal Git/platform concerns rather than a complete hosted workflow.

### What users praise

- It addresses the actual hard problem rather than relabeling one-way publication as sync.
- The explicit conflict model, common-base tracking, and unknown-macro preservation are architecturally promising.
- Windows and Data Center support demonstrate attention to enterprise environments.
- The audit feature broadens value beyond transport alone.

### Complaints, risks, and missing validation

- The project is young and has a small user base. Star count and fork count do not demonstrate broad production use.
- Most positive evidence comes from maintainer documentation and launch/release posts rather than independent long-term users.
- A local-directory ↔ Confluence engine is not automatically a full GitHub/GitLab workflow. Teams still need policies for branch creation, commits, pull requests, approvals, remote pushes, and CI races.
- Three-way text merging cannot guarantee semantic safety after Markdown↔ADF/storage conversion.
- Unknown-macro preservation should be tested across edit cycles, not merely single pull/push operations.
- Attachments, page moves, comments, inline comments, and concurrent hierarchy changes are harder than body-text conflicts and need dedicated tests.

### Feedback evidence quality

**Promising but mostly maintainer-reported.** No substantial independent production case study was found.

### Assessment

The most credible current open-source bidirectional candidate, but it should be adopted only after a rigorous sandbox proof of concept. It is also the closest open-source competitive reference for MarksSync.

---

## 5.7 `PatD42/confluence-bidir-sync`

- **Repository:** <https://github.com/PatD42/confluence-bidir-sync>
- **Direction:** Bidirectional, claimed
- **Implementation:** Python
- **License:** MIT
- **Adoption:** approximately 1 star
- **Star history:** [chart](https://star-history.com/#PatD42/confluence-bidir-sync&Date) · [SVG](https://api.star-history.com/svg?repos=PatD42/confluence-bidir-sync&type=Date)
- **Maintenance/maturity:** experimental

### Functionalities claimed

- bidirectional synchronization;
- three-way conflict detection;
- preservation of macros, labels, and comments;
- exclusion rules;
- single-file synchronization;
- optional logging.

### What users praise

No meaningful independent feedback was found.

### Complaints and risks

- Very low adoption and little external validation.
- Installation documentation has contained future-looking language such as package publication still pending.
- The claimed preservation surface is ambitious relative to the observable project maturity.
- It should be treated as an implementation reference or prototype, not a production dependency without extensive review.

### Feedback evidence quality

**Sparse.** Nearly all information is maintainer-reported.

### Assessment

Useful for studying a proposed three-way design, but not evidence that the general problem is solved reliably.

---

## 5.8 `HUU/Junction`

- **Repository:** <https://github.com/HUU/Junction>
- **Direction:** Git/Markdown → Confluence
- **Implementation:** Python CLI and library
- **License:** MIT
- **Adoption:** approximately 42 stars
- **Star history:** [chart](https://star-history.com/#HUU/Junction&Date) · [SVG](https://api.star-history.com/svg?repos=HUU/Junction&type=Date)
- **Maintenance:** latest release observed in May 2024; README characterizes it as a hobby project
- **Best fit:** a dedicated Confluence space fully owned by Git

### Functionalities

1. **Commit-by-commit synchronization**  
   Inspects Git changes and applies deltas rather than rebuilding everything unconditionally.

2. **Directory-to-page hierarchy**  
   Mirrors repository folders into a Confluence tree.

3. **Whole-space management**  
   Treats the target space as controlled by the tool.

4. **CLI and Python library**  
   Supports both command-line and embedded CI use.

5. **Dry run**  
   Reports intended changes before applying them.

6. **Markdown structures**  
   Handles headings, lists, code, tables, links, and block quotes.

7. **Confluence-specific output**  
   Supports child-page and TOC macros, status blocks, and info/warning/error/success panels.

### What users praise

- It has been recommended in Atlassian Community discussions as a practical Git-driven solution.
- Git-delta processing is a conceptually clean way to handle source changes.
- The strict ownership model removes ambiguity about manual edits.

### Complaints and limitations

- The README warns that the target space should not be manually edited, created, or modified outside Junction.
- Whole-space ownership is unsuitable for mixed human/generated spaces.
- The maintainer explicitly describes it as a hobby project and may not respond quickly.
- No reverse synchronization or conflict handling.
- Latest release is older than the most active alternatives.

### Feedback evidence quality

**Moderate.** Some independent recommendation, plus unusually candid maintainer limitations.

### Assessment

Good for a dedicated generated-docs space and valuable as a reference for Git-delta lifecycle management. Inappropriate where Confluence remains an editable collaboration surface.

---

## 5.9 Java `md2conf/md2conf`

- **Repository:** <https://github.com/md2conf/md2conf>
- **Direction:** Markdown → Confluence and Confluence → Markdown as separate commands
- **Implementation:** Java CLI, Maven plugin, Docker
- **License:** Apache-2.0
- **Adoption:** approximately 22 stars
- **Star history:** [chart](https://star-history.com/#md2conf/md2conf&Date) · [SVG](https://api.star-history.com/svg?repos=md2conf/md2conf&type=Date)
- **Maintenance:** v0.6.1 observed in November 2024
- **Best fit:** JVM/Maven environments needing publication and export in one toolchain

### Functionalities

1. **Publish** — pushes Markdown into Confluence.
2. **Convert** — converts source without necessarily publishing.
3. **Dump** — retrieves Confluence source/content.
4. **Dump-and-convert** — exports Confluence to Markdown-oriented output.
5. **Index** — builds or uses a document index/page mapping.
6. **Directory conventions** — constructs page trees from repository layout.
7. **Idempotent updates** — avoids creating new page versions when content has not changed.
8. **Cross-page links** — resolves links between generated pages.
9. **Attachments** — uploads images and local files.
10. **CLI, Maven plugin, and Docker** — supports local, build-pipeline, and container usage.
11. **Title extraction and rewriting** — supports prefixes, suffixes, and title removal from content.
12. **Orphan strategy** — can identify or remove pages no longer represented locally.
13. **Watcher notification control** — can reduce noisy updates and include version messages.
14. **Skip-update patterns** — permits selected pages to remain maintained manually in Confluence.
15. **Macro comments and code-language mapping** — supports technical publication details.

### What users praise

- One project covers Maven publication and reverse export.
- Idempotence and explicit orphan behavior are operationally important.
- Skip-update patterns acknowledge mixed ownership better than strict whole-space tools.

### Complaints and limitations

- Push and dump are not a common-base, conflict-aware synchronization protocol.
- Exported Markdown may not reproduce the exact original source after a round trip.
- Smaller community and less recent activity than the leading one-way publishers.
- Diagram support is less turnkey than Mark or hunyadi/md2conf.

### Feedback evidence quality

**Sparse to moderate.** Strong project documentation; limited independent commentary.

### Assessment

A relevant reference for JVM-centric MarksSync implementation and for treating export/publish as separate commands. It should not be mistaken for automatic two-way synchronization.

---

## 5.10 `iamjackg/md2cf`

- **Repository:** <https://github.com/iamjackg/md2cf>
- **Direction:** Markdown → Confluence
- **Implementation:** Python library and CLI
- **License:** MIT
- **Adoption:** approximately 122 stars
- **Star history:** [chart](https://star-history.com/#iamjackg/md2cf&Date) · [SVG](https://api.star-history.com/svg?repos=iamjackg/md2cf&type=Date)
- **Maintenance:** latest release observed in August 2023

### Functionalities

- Markdown to Confluence Storage Format conversion;
- compact Confluence Server REST client;
- page creation and updates;
- attachment upload;
- single file, recursive directories, and standard input;
- title from CLI, front matter, first H1, or filename;
- optional removal of the first H1 and title prefixes;
- two-pass relative-link resolution;
- basic authentication and personal access tokens;
- environment-variable configuration;
- optional insecure TLS mode for controlled environments;
- dry run.

### Praise

- Small and understandable codebase.
- Useful as both a library and CLI.
- Two-pass link conversion is more sophisticated than simple single-page uploaders.

### Complaints and limitations

- Rename handling can leave the old page behind: [issue #62](https://github.com/iamjackg/md2cf/issues/62).
- Older release cadence and storage-format assumptions should be reviewed for current Cloud tenants.
- No conflict-aware reverse synchronization.
- Lifecycle management is less complete than newer tree reconcilers.

### Feedback evidence quality

**Issue-derived and maintainer-reported.** Limited independent discussion.

---

## 5.11 `duo-labs/markdown-to-confluence`

- **Repository:** <https://github.com/duo-labs/markdown-to-confluence>
- **Direction:** Markdown/Git → Confluence
- **Implementation:** Python CLI and Docker
- **License:** Apache-2.0
- **Adoption:** approximately 320 stars
- **Star history:** [chart](https://star-history.com/#duo-labs/markdown-to-confluence&Date) · [SVG](https://api.star-history.com/svg?repos=duo-labs/markdown-to-confluence&type=Date)
- **Maintenance:** legacy/low recent activity

### Functionalities

- front-matter-driven document metadata;
- conversion and deployment to Confluence;
- publish files modified in the most recent Git commit;
- CI-oriented usage;
- direct file lists;
- Docker execution;
- dry run;
- space, ancestor, and header options;
- workflows for Hugo/Jekyll-style journal posts.

### Praise

- Historically visible and simple to integrate into Git-driven publication.
- Commit-based changed-file selection fits CI.

### Complaints and limitations

- High star count reflects historical interest, not necessarily present API compatibility or maintenance.
- Limited recent activity and a small commit history compared with modern alternatives.
- No robust tree lifecycle or reverse synchronization.
- Should be treated as legacy unless its exact deployment path is tested against the current Confluence API.

### Feedback evidence quality

**Sparse current feedback.** Historical adoption is stronger than current validation.

---

## 5.12 `Workable/confluence-docs-as-code`

- **Repository:** <https://github.com/Workable/confluence-docs-as-code>
- **Direction:** MkDocs/Markdown → Confluence Cloud
- **Implementation:** JavaScript CLI
- **License:** ISC
- **Adoption:** approximately 28 stars
- **Star history:** [chart](https://star-history.com/#Workable/confluence-docs-as-code&Date) · [SVG](https://api.star-history.com/svg?repos=Workable/confluence-docs-as-code&type=Date)
- **Maintenance:** last significant release observed in 2024

### Functionalities

- publishes only new or changed pages;
- can force all pages or publish based on major/minor release events;
- converts internal links;
- uploads images as attachments;
- converts fenced code blocks to Confluence code macros;
- renders Mermaid and PlantUML;
- applies title prefixes;
- supports page restrictions;
- reads MkDocs navigation as the source set.

### Praise

- Strong fit for teams already using MkDocs.
- Incremental and release-aware publication avoids unnecessary versions.
- Restrictions are uncommon in smaller publishers.

### Complaints and limitations

- Nested MkDocs navigation is flattened to a limited hierarchy.
- Only pages present in navigation are published.
- Framework coupling makes it less useful as a general repository synchronizer.
- No reverse sync.

### Feedback evidence quality

**Sparse.** Mostly repository documentation.

---

## 5.13 `Bhacaz/docs-as-code-confluence`

- **Repository:** <https://github.com/Bhacaz/docs-as-code-confluence>
- **Direction:** Git/Markdown → Confluence Cloud
- **Implementation:** GitHub Action / JavaScript
- **License:** MIT
- **Adoption:** approximately 55 stars
- **Star history:** [chart](https://star-history.com/#Bhacaz/docs-as-code-confluence&Date) · [SVG](https://api.star-history.com/svg?repos=Bhacaz/docs-as-code-confluence&type=Date)
- **Maintenance:** v3.2.2 observed in December 2024

### Functionalities

- GitHub Action packaging;
- repository folder synchronization;
- each Markdown file becomes a page;
- folders become parent pages;
- target parent page ID configuration;
- straightforward Confluence Cloud credentials and workflow inputs.

### Praise

- A user-authored Medium tutorial praises the low setup barrier for publishing GitHub documentation to Confluence: <https://sanidhya235.medium.com/publish-github-docs-to-confluence-13cea37919f0>.
- Fits teams that want a small declarative Action rather than a separate installed CLI.

### Complaints and limitations

The project’s own backlog has historically listed several important missing lifecycle capabilities:

- rename handling;
- page moves;
- deletion when files disappear;
- skipping unchanged pages;
- linking versions to source commits;
- remote/URL image support.

It is therefore best viewed as a convenient publisher, not a full synchronizer.

### Feedback evidence quality

**Moderate.** One independent tutorial, plus explicit maintainer backlog.

---

## 5.14 `tuanpmt/docflu`

- **Repository:** <https://github.com/tuanpmt/docflu>
- **Direction:** Docusaurus/Markdown → Confluence, Google Docs, and Notion
- **Implementation:** JavaScript CLI
- **License:** MIT
- **Adoption:** approximately 11 stars
- **Star history:** [chart](https://star-history.com/#tuanpmt/docflu&Date) · [SVG](https://api.star-history.com/svg?repos=tuanpmt/docflu&type=Date)
- **Maintenance:** new project; no formal release history observed

### Functionalities

- folder hierarchy publication;
- internal links and anchors;
- image handling;
- Mermaid, PlantUML, Graphviz, and D2 to SVG;
- optional auto-installation of diagram CLIs;
- incremental sync/state tracking;
- dry run;
- retry behavior;
- one file or directory publication;
- target page from ID, URL, or front matter;
- multiple destination systems.

### Praise

- Very broad diagram support.
- Multi-destination architecture may be attractive where Confluence is only one output.
- Modern Docusaurus focus.

### Complaints and limitations

- README states that it was built very quickly using AI coding tools, which increases the need for code review and destructive-operation tests.
- Documentation uses “bidirectional” language in relation to preserving original diagram code/metadata, while complete bidirectional synchronization is also listed as planned. This terminology is potentially misleading.
- No substantial independent validation was found.
- No mature release/governance history.

### Feedback evidence quality

**Sparse and maintainer-reported.** Treat claims as hypotheses to test.

---

## 5.15 `mihaeu/cosmere`

- **Repository:** <https://github.com/mihaeu/cosmere>
- **Direction:** Markdown → Confluence
- **Implementation:** TypeScript CLI/library
- **License:** MIT
- **Adoption:** approximately 42 stars
- **Star history:** [chart](https://star-history.com/#mihaeu/cosmere&Date) · [SVG](https://api.star-history.com/svg?repos=mihaeu/cosmere&type=Date)
- **Maintenance:** latest release observed in July 2022

### Functionalities

- updates only when a new page version is needed;
- uploads local images as attachments;
- deletes obsolete local-image attachments;
- supports original Markdown plus a subset of CommonMark/GFM;
- CLI and library modes;
- page-ID configuration;
- Cloud and Data Center authentication patterns;
- custom rendering hooks;
- direct Markdown-to-storage conversion intended to avoid older wiki-markup conversion problems.

### Praise

- Compact, understandable architecture.
- Attachment cleanup and no-op update behavior are useful.
- Direct conversion rationale is technically sound.

### Complaints and limitations

- Does not itself construct a rich repository hierarchy.
- Limited recent release activity.
- Partial Markdown dialect support requires a corpus test.
- No pull or conflict handling.

### Feedback evidence quality

**Sparse.** Mostly README and repository evidence.

---

## 5.16 `Spenhouet/confluence-markdown-exporter`

- **Repository:** <https://github.com/Spenhouet/confluence-markdown-exporter>
- **Direction:** Confluence → Markdown
- **Implementation:** Python CLI and Docker
- **License:** MIT
- **Adoption:** approximately 486 stars and 120 forks
- **Star history:** [chart](https://star-history.com/#Spenhouet/confluence-markdown-exporter&Date) · [SVG](https://api.star-history.com/svg?repos=Spenhouet/confluence-markdown-exporter&type=Date)
- **Maintenance:** active; release 5.2.1 observed on 19 June 2026
- **Best fit:** migration, backup, Obsidian/Git mirrors, and reverse-side evaluation

### Functionalities

1. **Export one page, descendants, or entire spaces.**
2. **Read directly through the Confluence API.**
3. **Generate cleaned Markdown rather than merely saving raw storage XHTML.**
4. **Incremental mode to skip unchanged content.**
5. **Target presets for Obsidian, Gollum, Azure DevOps, Foam, and Dendron.**
6. **Preserve page hierarchy.**
7. **Rewrite page links to local files.**
8. **Download images and attachments.**
9. **Convert supported macros where possible.**
10. **Docker and configuration-file workflows.**

### What users praise

- In a Reddit discussion about escaping Confluence, a commenter explicitly recommended this Python exporter: <https://www.reddit.com/r/selfhosted/comments/1qalnum/tool_for_escaping_confluence_convert_exports_to/>.
- It is one of the most adopted and actively maintained reverse tools.
- Destination presets acknowledge that “Markdown” is not one uniform target ecosystem.

### Complaints and limitations

- Exporters cannot losslessly represent every Confluence macro or third-party app node.
- It is not a push engine or conflict-aware two-way synchronizer.
- Authentication and gateway variants can produce edge cases; for example, a scoped API-gateway token URL issue was reported and resolved in [issue #165](https://github.com/Spenhouet/confluence-markdown-exporter/issues/165).
- Incremental export detects source changes, but that is not the same as reconciling local edits.

### Feedback evidence quality

**Good.** Independent recommendation, active issue handling, and substantial adoption.

### Assessment

The reverse-export baseline against which a new tool should compare fidelity, hierarchy, link handling, and attachment behavior.

---

## 5.17 `gkoos/confluence2md`

- **Repository:** <https://github.com/gkoos/confluence2md>
- **Direction:** Confluence Cloud → Markdown
- **Implementation:** Go CLI
- **License:** MIT
- **Adoption:** approximately 24 stars
- **Star history:** [chart](https://star-history.com/#gkoos/confluence2md&Date) · [SVG](https://api.star-history.com/svg?repos=gkoos/confluence2md&type=Date)
- **Maintenance:** active; v1.1.2 observed on 25 June 2026
- **Best fit:** local knowledge graphs, RAG ingestion, stable mirrors, and graph analysis

### Functionalities

- starts from configured seed pages;
- traverses the page/link graph to a configured depth;
- exports clean Markdown;
- uses stable page-ID filenames;
- writes YAML front matter;
- rewrites links to local files;
- downloads attachments;
- exports comments;
- supports incremental export with dual checkpoints;
- writes `metadata.json` with a bidirectional link graph;
- focuses on RAG-friendly and machine-processable output.

### What users praise

- Stable IDs and explicit graph metadata are better suited to AI indexing than title-only filenames.
- Go distribution makes it easy to run as a binary.
- Recent release activity.

### Complaints and requests

- In a Reddit discussion, users asked for clear documentation of unsupported constructs and macro behavior: <https://www.reddit.com/r/golang/comments/1u1rqox/confluence2md_confluence_to_markdown_export_for/>.
- A community feedback thread similarly emphasizes the importance of knowing what cannot be converted: <https://community.developer.atlassian.com/t/looking-for-feedback-on-an-open-source-confluence-markdown-crawler-exporter/101243>.
- Git commit integration and Data Center support have appeared as roadmap items rather than complete functionality.
- It is export-only.

### Feedback evidence quality

**Moderate.** Public feedback exists, but the project remains young.

### Assessment

An excellent reference for identity, graph metadata, and RAG-oriented export. It does not compete directly with publishers but could complement them.

---

## 6. Compact profiles of additional tools

## 6.1 MkDocs and documentation-framework plugins

### `pawelsikora/mkdocs-with-confluence`

- **Repo:** <https://github.com/pawelsikora/mkdocs-with-confluence>
- **Stars:** ~92 · [Star History](https://star-history.com/#pawelsikora/mkdocs-with-confluence&Date)
- **Functionality:** MkDocs plugin built around `md2cf`; host, space, parent, credentials, environment activation, verbose/debug modes, and dry run.
- **Praise:** natural fit for existing MkDocs builds.
- **Complaints/issues:** SSL/certificate handling, module packaging, zero-byte output, bearer-token support, subpage behavior, interactions with other plugins, and dry-run API behavior have appeared in issues.
- **Assessment:** established plugin lineage, but test current Confluence auth/API compatibility.

### `jmanteau/mkdocs-to-confluence`

- **Repo:** <https://github.com/jmanteau/mkdocs-to-confluence>
- **Stars:** ~4 · [Star History](https://star-history.com/#jmanteau/mkdocs-to-confluence&Date)
- **Functionality:** newer fork/successor in the same family; vendored modified `md2cf`, Mistune 3.x support, Cloud configuration, environment credentials, dry run/export directory, documentation.
- **Complaints/issues:** newline preservation, cooperation with other plugins, emoticons/styles, and feature parity.
- **Assessment:** lower adoption but more recent dependency maintenance.

### `johnny/mkdocs-confluence-publisher`

- **Repo:** <https://github.com/johnny/mkdocs-confluence-publisher>
- **Stars:** ~4 · [Star History](https://star-history.com/#johnny/mkdocs-confluence-publisher&Date)
- **Functionality:** mirrors MkDocs hierarchy, creates/updates pages, uploads attachments, and supports title prefixes.
- **Feedback:** little independent discussion.
- **Assessment:** small specialist plugin.

### Sphinx Confluence Builder

- **Repo:** <https://github.com/sphinx-contrib/confluencebuilder>
- **Direction:** Sphinx documentation → Confluence; Markdown can enter through MyST/Sphinx.
- **Functionality:** broad Sphinx builder support for Confluence Cloud and Data Center, page hierarchy, assets, and Sphinx extensions.
- **Assessment:** important when the canonical build system is Sphinx, but not a direct arbitrary-repository Markdown synchronizer, so it is not included in the main star table.

## 6.2 Small GitHub Actions and page uploaders

### `cupcakearmy/confluence-markdown-sync`

- **Repo:** <https://github.com/cupcakearmy/confluence-markdown-sync>
- **Stars:** ~45 · [Star History](https://star-history.com/#cupcakearmy/confluence-markdown-sync&Date)
- **Functionality:** Python/Docker/GitHub Action that publishes one Markdown file to an existing page ID; supports Cloud or self-hosted base URLs and basic authentication.
- **Known limitation:** README states that images are not uploaded.
- **Assessment:** good for a single generated page, not repository synchronization.

### `7nohe/confluence-md`

- **Repo:** <https://github.com/7nohe/confluence-md>
- **Stars:** ~6 · [Star History](https://star-history.com/#7nohe/confluence-md&Date)
- **Functionality:** TypeScript CLI and GitHub Action; converts GitHub-flavored Markdown to Confluence Cloud storage and updates pages from a docs directory.
- **Feedback:** sparse.
- **Assessment:** modern small Cloud-oriented Action; verify hierarchy and lifecycle depth.

### `humanendpoint/confluence-syncer`

- **Repo:** <https://github.com/humanendpoint/confluence-syncer>
- **Stars:** ~1 · [Star History](https://star-history.com/#humanendpoint/confluence-syncer&Date)
- **Functionality:** GitHub Action; uploads a file or folder below a parent page; exclusions; Confluence Cloud REST v2.
- **Assessment:** a thin modern publisher, not a bidirectional engine.

### `axro-gmbh/markdown-to-confluence-sync`

- **Repo:** <https://github.com/axro-gmbh/markdown-to-confluence-sync>
- **Stars:** ~0 · [Star History](https://star-history.com/#axro-gmbh/markdown-to-confluence-sync&Date)
- **Functionality:** GitHub Action for single files, directories, multiple directories, exclusion rules, title from first H1 or filename, full-width display, and Confluence Cloud REST v2.
- **Assessment:** convenient workflow packaging with little adoption evidence.

### `zonkyio/confluence-sync`

- **Repo:** <https://github.com/zonkyio/confluence-sync>
- **Stars:** ~15 · [Star History](https://star-history.com/#zonkyio/confluence-sync&Date)
- **Functionality:** script/Docker pipeline that converts and uploads selected Markdown to pre-created pages.
- **Assessment:** simple CI building block; page identity and hierarchy are largely external responsibilities.

### `markdown-confluence/publish-action`

- **Repo:** <https://github.com/markdown-confluence/publish-action>
- **Stars:** ~21 · [Star History](https://star-history.com/#markdown-confluence/publish-action&Date)
- **Functionality:** GitHub Action wrapper around the main `markdown-confluence` engine.
- **Assessment:** evaluate the main engine, not the wrapper, for feature and maintenance decisions.

### `Telefonica/markdown-confluence-sync-action`

- **Repo:** <https://github.com/Telefonica/markdown-confluence-sync-action>
- **Stars:** ~10 · [Star History](https://star-history.com/#Telefonica/markdown-confluence-sync-action&Date)
- **Functionality:** Action-oriented distribution of Telefónica’s Markdown sync logic.
- **Assessment:** determine whether the current supported path is the standalone repository or the `confluence-tools` monorepo.

### `Kerwood/confluence-updater-action`

- **Repo:** <https://github.com/Kerwood/confluence-updater-action>
- **Stars:** ~2 · [Star History](https://star-history.com/#Kerwood/confluence-updater-action&Date)
- **Functionality:** Action wrapper around `Kerwood/confluence-updater`.

## 6.3 Build-tool and explicit mapping tools

### `Kerwood/confluence-updater`

- **Repo:** <https://github.com/Kerwood/confluence-updater>
- **Stars:** ~14 · [Star History](https://star-history.com/#Kerwood/confluence-updater&Date)
- **Implementation:** Rust CLI/Docker.
- **Functionality:** YAML mappings to existing page IDs; SHA labels to skip unchanged content; source header; title override; read-only restrictions; labels; CI use.
- **Praise:** explicit page IDs reduce accidental duplicates; Rust binary is deployment-friendly.
- **Limitations:** users must establish mappings; not a tree-discovery or reverse-sync engine.

### `qwazer/markdown-confluence-gradle-plugin`

- **Repo:** <https://github.com/qwazer/markdown-confluence-gradle-plugin>
- **Stars:** ~14 · [Star History](https://star-history.com/#qwazer/markdown-confluence-gradle-plugin&Date)
- **Functionality:** Gradle tasks; multiple pages and recursive file trees; parent titles; labels; inline image attachments; BASIC/PAT authentication; optional self-signed certificates; variables; CommonMark or Pegdown; mixed Confluence wiki markup.
- **Assessment:** useful in Gradle/JVM builds, but not a standalone synchronization platform.

### `talkiq/confluence-wiki-sync`

- **Repo:** <https://github.com/talkiq/confluence-wiki-sync>
- **Stars:** ~17 · [Star History](https://star-history.com/#talkiq/confluence-wiki-sync&Date)
- **Functionality:** GitHub Action handling Markdown and reStructuredText; Pandoc conversion to Confluence wiki markup; changed-file input; page-tree mirroring; folder pages listing children; path-based unique titles; ignored folders; manual dispatch.
- **Limitations:** wiki-markup conversion is a legacy path and may not cover current Cloud structures well; no reverse sync.

### `kattebak/markdown-confluence-cli`

- **Repo:** <https://github.com/kattebak/markdown-confluence-cli>
- **Stars:** ~0 · [Star History](https://star-history.com/#kattebak/markdown-confluence-cli&Date)
- **Functionality:** npm CLI using REST v2 for pages and v1 for attachments; commands for sync, list, dump, upload, list attachments, and get; creates/updates by title; uploads images; ADF conversion is reverse-engineered.
- **Limitations:** title-based identity and reverse-engineered ADF deserve caution; “dump” operations do not establish conflict-safe bidirectionality.

## 6.4 Obsidian-oriented publication

### `BungaRazvan/confluence-link`

- **Repo:** <https://github.com/BungaRazvan/confluence-link>
- **Stars:** ~15 · [Star History](https://star-history.com/#BungaRazvan/confluence-link&Date)
- **Functionality:** manually pushes the current Obsidian file to Confluence; space selection, favorites, and fuzzy search.
- **Complaint:** Markdown links did not upload correctly in [issue #40](https://github.com/BungaRazvan/confluence-link/issues/40).
- **Assessment:** useful interactive publishing, not automated Git-repository synchronization.

### `markdown-confluence/obsidian-integration`

- **Repo:** <https://github.com/markdown-confluence/obsidian-integration>
- **Stars:** ~148 · [Star History](https://star-history.com/#markdown-confluence/obsidian-integration&Date)
- **Status:** historical repository; source was moved into the main `markdown-confluence` monorepo.
- **Assessment:** do not count it as a separate conversion engine when comparing functionality.

## 6.5 Historical or proof-of-concept publishers

### `NickSmet/markdown-to-confluence-publisher`

- **Repo:** <https://github.com/NickSmet/markdown-to-confluence-publisher>
- **Stars:** ~0 · [Star History](https://star-history.com/#NickSmet/markdown-to-confluence-publisher&Date)
- **Functionality:** fork/variant of `markdown-confluence`; removes heavy image compression, adds custom Mermaid styling, converts local Markdown links, and provides CLI/configuration.
- **Assessment:** inspect only if those specific fork changes are needed.

### `MoebiusSolutions/confluence-markdown-sync`

- **Repo:** <https://github.com/MoebiusSolutions/confluence-markdown-sync>
- **Stars:** ~0 · [Star History](https://star-history.com/#MoebiusSolutions/confluence-markdown-sync&Date)
- **Functionality:** Python/Docker; README becomes a root page; other pages are published flat below it; Jinja templates; links back to source.
- **Maintainer caveats:** documentation says the output is too unattractive to serve as the primary UI and that the solution is not fully functional; it may also generate watcher noise.
- **Assessment:** reference/prototype only.

### Other small wrappers and PoCs

The following repositories appeared in searches but add little independent engine functionality:

- `hadenlabs/action-confluence-sync` — Action wrapper around Mark;
- `draios/infra-action-mark2confluence` — organizational wrapper around Mark;
- `snowplow-archive/action-publish-to-confluence` — archived Action publishing `.md` files and folder hierarchy;
- `UlisesGascon/poc-sync-markdown-with-confluence` — proof of concept using Cosmere and GitHub Actions;
- `geomagical/sync-markdown-with-confluence` — archived proof-of-concept/fork;
- `andygolubev/github-to-confluence-publisher` — small script-oriented publisher discussed in a DEV article: <https://dev.to/andygolubev/automate-publishing-markdown-files-from-github-to-confluence-with-github-to-confluence-publisher-tool-eh4>.

These should not be evaluated as peers of full engines unless their exact workflow is the desired solution.

---

## 7. Additional Confluence → Markdown tools

## 7.1 `meridius/confluence-to-markdown`

- **Repo:** <https://github.com/meridius/confluence-to-markdown>
- **Stars:** ~143 · [Star History](https://star-history.com/#meridius/confluence-to-markdown&Date)
- **License:** MIT
- **Status:** archived in December 2021
- **Functionality:** converts a Confluence HTML export archive to Markdown using Pandoc and supporting scripts.
- **Praise:** simple migration route that does not require API access.
- **Complaints:** HTML exports and Pandoc do not reliably preserve all tables, macros, links, or structure; no incrementality or synchronization.

## 7.2 `gergelykalman/confluence-markdown-exporter`

- **Repo:** <https://github.com/gergelykalman/confluence-markdown-exporter>
- **Stars:** ~70 · [Star History](https://star-history.com/#gergelykalman/confluence-markdown-exporter&Date)
- **License:** MIT
- **Functionality:** simple API-based Python exporter.
- **Important warning:** README states it was not written with hostile content/security in mind and should not be run against malicious page titles.
- **Assessment:** useful small script, not the first choice for a production export service.

## 7.3 `ttscoff/confluence2md`

- **Repo:** <https://github.com/ttscoff/confluence2md>
- **Stars:** ~11 · [Star History](https://star-history.com/#ttscoff/confluence2md&Date)
- **Implementation:** Ruby CLI
- **Functionality:** batch conversion of Confluence HTML exports using Pandoc/Nokogiri; emoji stripping; header repair; hierarchy fixing; metadata stripping; table cleanup; image flattening; file renaming; source comments; local-link updates; standalone table and paragraph cleanup commands.
- **Assessment:** a useful migration cleanup toolbox, not an API mirror or two-way system.

## 7.4 Historical lineage

- `EWhite613/Confluence-to-Github-Markdown` is discontinued and points users toward the `meridius` fork.
- `KkEi34/confluence-to-markdown` is another fork/variant in the same HTML-export lineage.
- `highsource/confluence-to-markdown-converter` is an older/unfinished converter concept.

These are relevant for project history but are not recommended over active exporters.

---

## 8. Independent community feedback: recurring themes

Direct opinions about individual small repositories are limited. The strongest evidence comes from broader discussions of the workflow and from issue trackers.

## 8.1 What people value

### Git review plus Confluence accessibility

A Hacker News discussion of Mark captures the core benefit: engineers can review and version documentation in Git, while non-engineering colleagues can still find and read it in Confluence. This is the most consistent positive theme across the ecosystem.

Source: <https://news.ycombinator.com/item?id=33710603>

### Automation eliminates duplicate copy/paste work

Users repeatedly seek a workflow where a merged documentation change automatically appears in Confluence. Tutorials around `docs-as-code-confluence` and similar Actions praise the ability to keep a single source of truth and remove manual publication steps.

Source example: <https://sanidhya235.medium.com/publish-github-docs-to-confluence-13cea37919f0>

### Native pages are preferable to embeds for search and navigation

Although macro-based Git embeds are simpler, users often want real pages so content is discoverable through Confluence search, page trees, permissions, links, and normal navigation.

### Incremental/no-op publication matters

Confluence creates versions and may notify watchers on updates. Tools that compare content or hashes are praised because they avoid version spam and unnecessary API calls.

### Attachments and diagrams are decision-driving features

A plain Markdown converter is insufficient for engineering documentation. Mermaid, PlantUML, D2, Draw.io, local images, code blocks, and cross-page links frequently determine whether a tool is usable.

### Export tools are valued as an exit path

In self-hosting and Obsidian communities, active exporters are recommended as a way to escape lock-in, create backups, support local search, or prepare RAG corpora.

Source: <https://www.reddit.com/r/selfhosted/comments/1qalnum/tool_for_escaping_confluence_convert_exports_to/>

## 8.2 What people complain about

### Confluence is not “Markdown with an API”

In a Reddit thread asking why there is no clean Confluence/Git sync, commenters point out that API retrieval is straightforward but content contains XHTML/ADF and bespoke macro structures. A developer who had implemented images, lists, formatting, and Mermaid described the code as messy and still wanted a proper bidirectional solution.

Source: <https://www.reddit.com/r/dataengineering/comments/1qoxz30/confluence_git_repo_sync/>

### True two-way sync needs more than two converters

An Atlassian Community discussion explains that two-way synchronization requires:

- translation in both directions;
- durable mapping of Git revisions to Confluence versions;
- identity across renames and moves;
- handling content that exists only in Confluence’s richer SGML/XML/ADF-like structures;
- conflict semantics when both sides change.

Source: <https://community.atlassian.com/forums/Confluence-questions/What-options-to-store-confluence-pages-in-Github/qaq-p/2442970>

### Tables and links break in generic export pipelines

In an Obsidian migration discussion, a user reported that even simple Confluence tables could break after Pandoc conversion, making large migrations painful.

Source: <https://www.reddit.com/r/ObsidianMD/comments/sq1mi8/html_confluence_export_to_markdown/>

### Macro rendering is inconsistent

A Reddit discussion of Markdown-to-Confluence conversion reported macros that did not render correctly. Another org-mode-to-Confluence discussion said basic content worked while tables and links failed.

Sources:

- <https://www.reddit.com/r/confluence/comments/m24soh/markdown2confluence/>
- <https://www.reddit.com/r/orgmode/comments/hugs7h/exporting_to_confluence/>

### Rename, move, and delete handling is often incomplete

A common failure is creating a new page for a renamed file while leaving the old page in place. Deletion is even more dangerous because the tool must know whether a missing file was intentionally deleted or merely absent from the current build input.

### Title matching creates duplicates and ambiguity

Tools that locate pages by title can update the wrong page or create duplicates when the same title appears under different parents. Explicit immutable IDs are safer but add source metadata and onboarding complexity.

### Manual Confluence edits are overwritten

Most publishers treat Git as authoritative. Users who edit generated pages in Confluence can lose changes. Generated-page banners and read-only restrictions mitigate the social problem but do not create bidirectionality.

### REST API migrations and authentication variations cause breakage

Confluence Cloud API v1/v2 changes, scoped tokens, OAuth versus API tokens, Data Center PATs, proxy prefixes, and custom gateways repeatedly appear in issue trackers.

### Watcher notifications and version spam

Tools that update unchanged pages can generate unnecessary versions and emails. Hashing and semantic no-op detection are operational requirements, not minor optimizations.

### Small projects create maintenance risk

Many repositories have one maintainer, few releases, and limited independent usage. An attractive README does not establish safe handling of destructive operations.

---

## 9. Why bidirectional synchronization is still not reliably solved

## 9.1 Representational asymmetry

Markdown is intentionally simple. Confluence can contain:

- ADF extension nodes;
- storage-format XML/XHTML;
- nested and third-party macros;
- layouts, columns, panels, status nodes, tasks, dates, mentions, emojis, and smart links;
- inline comments anchored to text ranges;
- page comments and reactions;
- labels, restrictions, properties, and app metadata;
- attachments with independent version history;
- embedded Jira or other Atlassian objects.

A converter can choose one of four strategies for unsupported content:

1. discard it;
2. flatten it into text or HTML;
3. preserve an opaque raw block;
4. store sidecar metadata outside standard Markdown.

Each strategy has trade-offs. Opaque preservation is safest for round trips but makes local editing less natural. Flattening is readable but lossy.

## 9.2 Identity is not equivalent to title or path

A file path can change. A page title can change. A page can move to another parent without changing content. A reliable synchronizer needs a durable identity, normally a Confluence page ID plus source-side metadata or a state database.

It must distinguish:

- rename from delete-plus-create;
- move from unrelated page creation;
- copied file from renamed file;
- page manually moved in Confluence from a mapping error;
- intentional deletion from an incomplete checkout.

## 9.3 Version and base tracking

A real three-way merge requires:

- the last common synchronized representation;
- current local content;
- current remote content;
- local Git commit/version metadata;
- remote Confluence page version metadata.

Without the base, a tool can detect that content differs but cannot reliably determine who changed what.

## 9.4 Text merge is not semantic merge

Even when both sides are converted to Markdown, formatting conversion may reorder or normalize content. A line-based merge can report large conflicts for semantically small changes or, worse, accept a syntactically valid but semantically broken merge.

Examples:

- table column edits;
- nested macros;
- image attachment renames;
- links whose targets moved;
- ordered-list renumbering;
- ADF nodes represented as multi-line opaque blocks.

## 9.5 Git workflow integration

Pulling a Confluence edit into a local file is only the beginning. A production Git workflow needs to decide:

- commit directly or create a branch;
- who authors the commit;
- how to map a Confluence user to Git identity;
- whether to open a pull request;
- which reviewers are required;
- what happens when CI rejects the generated change;
- whether Confluence should show “pending publication” while the PR is open;
- how to avoid loops when the merged PR republishes the same content.

## 9.6 Attachments and non-body metadata

Attachments have their own IDs, versions, names, and links. Comments and restrictions also evolve independently from the page body. A body-only merge can claim success while silently losing critical context.

## 9.7 Eventual consistency and race conditions

CI jobs, webhooks, remote polling, and manual edits can overlap. Idempotency, locking, optimistic concurrency, retry classification, and loop prevention are essential.

---

## 10. Evaluation and scoring framework

A fair proof of concept should not use only simple headings and paragraphs. It should use a committed, repeatable acceptance corpus and score every tool against the same operations.

### 10.1 Suggested weighted criteria

| Area | Weight | What to measure |
|---|---:|---|
| Content fidelity | 20% | Markdown features, tables, code, Unicode, footnotes, alerts, layouts |
| Page identity/lifecycle | 15% | create, no-op update, rename, move, delete, restore, duplicate prevention |
| Links and hierarchy | 10% | relative links, anchors, child order, cross-space links |
| Assets and diagrams | 10% | images, duplicate names, attachments, Mermaid, PlantUML, Draw.io, D2 |
| Conflict safety | 15% | concurrent body edits, hierarchy conflicts, attachment conflicts, clear reports |
| API/auth compatibility | 10% | Cloud v2, OAuth/token/PAT, Data Center, proxy/custom base path |
| CI/developer experience | 10% | install, static binary/container, config, dry run, exit codes, logs |
| Operations/security | 5% | retries, rate limits, secret redaction, idempotency, audit trail |
| Maintenance/community | 5% | releases, issue responsiveness, ownership, license, adoption trend |

### 10.2 Acceptance corpus

Create source documents containing:

- H1–H6 headings and repeated headings;
- nested ordered/unordered lists;
- checkboxes and task states;
- simple and complex tables;
- long code blocks and uncommon languages;
- inline code, bold, italic, strike-through, underline where supported;
- Unicode, Polish characters, emoji, and right-to-left samples;
- footnotes;
- GitHub alerts/admonitions;
- collapsible details;
- relative links, anchors, and links to moved pages;
- images with spaces, Unicode, and identical filenames in different directories;
- binary attachments;
- Mermaid, PlantUML, D2, Draw.io, and math;
- raw HTML and unsupported constructs;
- front matter and source metadata.

### 10.3 Lifecycle scenarios

1. Initial create of 100 pages.
2. No-op second run; assert zero new versions.
3. Edit one paragraph.
4. Rename a file without changing content.
5. Move a file to another directory.
6. Rename and edit simultaneously.
7. Delete a leaf page.
8. Delete a subtree.
9. Recreate a previously deleted path with different content.
10. Change only page order.
11. Duplicate a title under two parents.
12. Run from a sparse or filtered checkout.
13. Interrupt a run halfway and retry.
14. Execute two jobs concurrently.
15. Trigger rate limits and transient 5xx responses.

### 10.4 Bidirectional scenarios

1. Local-only edit, then sync.
2. Remote-only edit, then sync.
3. Non-overlapping local and remote paragraph edits.
4. Same-line conflict.
5. Local body edit plus remote title change.
6. Local move plus remote body edit.
7. Remote page move plus local rename.
8. Attachment changed independently on both sides.
9. Unknown macro edited around local Markdown changes.
10. Confluence inline comment anchored to modified text.
11. Remote deletion plus local edit.
12. Git branch divergence while a remote edit arrives.
13. Failed PR or rejected merge after Confluence pull.
14. Republish after merge; assert no synchronization loop.

### 10.5 Evidence to capture

- API request/response logs with secrets redacted;
- generated intermediate ADF/storage/Markdown;
- page version counts;
- attachment versions;
- before/after screenshots;
- Git diffs;
- machine-readable operation plan;
- execution time and API-call count;
- recovery result after induced failure;
- semantic diff after Markdown → Confluence → Markdown round trip.

---

## 11. Tool-selection recommendations

## 11.1 When Git must be the sole source of truth

Start with:

1. **Mark** for mature general publication and easy binary distribution.
2. **hunyadi/md2conf** when hierarchy, relative links, and rich technical syntax are the priority.
3. **Telefonica/confluence-tools** when page deletion and Docusaurus support are required.
4. **text2confl** when Data Center or AsciiDoc is part of the requirement.

Use a generated-page banner and, where possible, restrictions that discourage editing in Confluence.

## 11.2 When users must edit in both Git and Confluence

Evaluate **atlcli** first, but treat the exercise as a technical proof of concept rather than product selection by star count. Require successful completion of the full bidirectional scenario set before enabling it on production content.

Keep the following fallback policy available:

- Git remains authoritative for mapped/generated sections;
- Confluence-only comments and collaboration metadata remain in Confluence;
- remote body changes create a branch or pull request rather than directly committing to the main branch;
- unresolved or unsupported remote structures block publication instead of being flattened silently.

## 11.3 When the immediate need is migration or backup

Use **Spenhouet/confluence-markdown-exporter** as the first baseline. Compare `gkoos/confluence2md` when stable IDs, link graphs, comments, and RAG ingestion are important.

## 11.4 When the team already uses MkDocs

Compare:

- `Workable/confluence-docs-as-code` for release-aware publishing and diagrams;
- `pawelsikora/mkdocs-with-confluence` for the established plugin lineage;
- `jmanteau/mkdocs-to-confluence` for a newer dependency stack.

## 11.5 When explicit mappings are acceptable

`Kerwood/confluence-updater` and Java `md2conf` reduce ambiguity through page IDs/configuration. This is less magical but often safer than title discovery.

## 11.6 Tools to approach as legacy or prototypes

Do not choose solely by star count. Require additional justification for:

- `duo-labs/markdown-to-confluence` — historical popularity, limited recent activity;
- `meridius/confluence-to-markdown` — archived and HTML-export based;
- `MoebiusSolutions/confluence-markdown-sync` — explicitly incomplete;
- `PatD42/confluence-bidir-sync` — experimental;
- very small Actions with zero or one star — potentially useful, but little operational evidence.

---

## 12. Product gap and implications for MarksSync for Confluence

The open-source market does not lack Markdown publishers. A new product should not compete merely on “convert `.md` and call the Confluence API.” The defensible gap is a safe workflow and identity system spanning Git and Confluence.

### 12.1 High-value differentiators

1. **Git-first one-way mode that is excellent before two-way is enabled**  
   Native page trees, stable IDs, robust links, attachments, diagrams, dry-run diffs, and idempotence must be strong independently.

2. **Pull remote edits into a branch or pull request**  
   Instead of silently updating the main checkout, create an auditable review unit containing author, page/version provenance, and semantic diff.

3. **Three-way synchronization state**  
   Store the last common base, local Git commit, remote page version, content hash, and converter version.

4. **Round-trip-safe extension blocks**  
   Preserve unknown ADF/storage nodes in opaque, checksummed source blocks or sidecars rather than silently discarding them.

5. **Semantic diff and conflict reports**  
   Report changes by heading, table, macro, attachment, title, parent, labels, and restrictions—not only by lines.

6. **Rename/move/delete identity model**  
   Use stable page IDs and source document IDs, not title/path alone. Detect moves and copies explicitly.

7. **Machine-readable dry run**  
   Produce JSON as well as human-readable output so CI agents and AI tooling can inspect planned operations.

8. **Deletion safety**  
   Require ownership markers, expected-root checks, complete-source assertions, and optional quarantine/archive before permanent deletion.

9. **Conflict policies per content type**  
   Body text, page title, hierarchy, labels, restrictions, comments, and attachments require different merge policies.

10. **Source provenance in both systems**  
    Confluence versions should reference Git commits; Git commits/PRs should reference page IDs and Confluence versions.

11. **Enterprise authentication UX**  
    Interactive login for local use, PAT/token mode, OAuth where feasible, environment/secrets for CI, custom base paths, proxy support, and secret-redacted diagnostics.

12. **Observability and resumability**  
    Structured logs, correlation IDs, checkpoints, retry classifications, rate-limit handling, and safe resume after partial failure.

13. **Converter compatibility versioning**  
    A converter upgrade can change formatting without source edits. Store converter version and provide migration previews.

14. **Agent-friendly operation**  
    Deterministic CLI commands, documented exit codes, JSON reports, and no hidden prompts are important for AI coding and documentation agents.

### 12.2 Recommended staged product strategy

**Stage 1 — best-in-class one-way Git → Confluence**

- repository YAML configuration;
- include/exclude globs;
- folder and front-matter mappings;
- stable IDs;
- create/update/move/rename detection;
- attachments and common diagrams;
- dry-run and semantic diff;
- ownership/provenance markers;
- safe CI mode;
- no remote body edits allowed or preserved outside generated sections.

**Stage 2 — read-side remote change detection**

- detect Confluence divergence;
- show status and diff;
- block overwrite by default;
- export remote version to a conflict workspace;
- generate machine-readable reports.

**Stage 3 — Confluence → Git pull-request workflow**

- convert supported remote edits;
- create branch/commit/PR;
- preserve unsupported nodes;
- avoid publication loops;
- keep Git approval as the authoritative release gate.

**Stage 4 — selective automatic merging**

- merge only constructs with proven round-trip semantics;
- require manual resolution for macros, complex tables, hierarchy conflicts, and attachments until specialized mergers exist.

**Stage 5 — assisted conflict resolution**

- optional AI suggestions, always accompanied by deterministic source/base/remote evidence and a reviewable patch.

### 12.3 Competitive conclusion

MarksSync would enter a crowded one-way publishing market but a still-open workflow market. The product opportunity is strongest if it combines:

- the maturity and installability of Mark;
- the content breadth of hunyadi/md2conf;
- the ADF awareness of markdown-confluence;
- the lifecycle reconciliation of Telefónica’s tooling;
- the export fidelity of Spenhouet/confluence-markdown-exporter;
- the graph/identity ideas of gkoos/confluence2md;
- and the conflict model attempted by atlcli.

---

## 13. Source links and evidence register

### Primary repositories

- Mark: <https://github.com/kovetskiy/mark>
- hunyadi/md2conf: <https://github.com/hunyadi/md2conf>
- markdown-confluence: <https://github.com/markdown-confluence/markdown-confluence>
- Telefónica confluence-tools: <https://github.com/Telefonica/confluence-tools>
- text2confl: <https://github.com/zeldigas/text2confl>
- atlcli: <https://github.com/BjoernSchotte/atlcli>
- confluence-bidir-sync: <https://github.com/PatD42/confluence-bidir-sync>
- Junction: <https://github.com/HUU/Junction>
- Java md2conf: <https://github.com/md2conf/md2conf>
- iamjackg/md2cf: <https://github.com/iamjackg/md2cf>
- duo-labs publisher: <https://github.com/duo-labs/markdown-to-confluence>
- Workable docs-as-code: <https://github.com/Workable/confluence-docs-as-code>
- Bhacaz Action: <https://github.com/Bhacaz/docs-as-code-confluence>
- docflu: <https://github.com/tuanpmt/docflu>
- cosmere: <https://github.com/mihaeu/cosmere>
- Spenhouet exporter: <https://github.com/Spenhouet/confluence-markdown-exporter>
- gkoos exporter: <https://github.com/gkoos/confluence2md>

### Independent discussions and articles

- Hacker News discussion mentioning Mark and Git-reviewed docs in Confluence: <https://news.ycombinator.com/item?id=33710603>
- Reddit discussion on why Git/Confluence synchronization is difficult: <https://www.reddit.com/r/dataengineering/comments/1qoxz30/confluence_git_repo_sync/>
- Atlassian Community discussion on storing Confluence pages in GitHub: <https://community.atlassian.com/forums/Confluence-questions/What-options-to-store-confluence-pages-in-Github/qaq-p/2442970>
- Reddit recommendation for Confluence Markdown exporter: <https://www.reddit.com/r/selfhosted/comments/1qalnum/tool_for_escaping_confluence_convert_exports_to/>
- Reddit Confluence HTML export to Markdown/table problems: <https://www.reddit.com/r/ObsidianMD/comments/sq1mi8/html_confluence_export_to_markdown/>
- Reddit Markdown-to-Confluence macro issue: <https://www.reddit.com/r/confluence/comments/m24soh/markdown2confluence/>
- Reddit org-mode/Confluence table and link limitations: <https://www.reddit.com/r/orgmode/comments/hugs7h/exporting_to_confluence/>
- Reddit feedback for gkoos/confluence2md: <https://www.reddit.com/r/golang/comments/1u1rqox/confluence2md_confluence_to_markdown_export_for/>
- Atlassian Developer Community feedback request for confluence2md: <https://community.developer.atlassian.com/t/looking-for-feedback-on-an-open-source-confluence-markdown-crawler-exporter/101243>
- Maintenance discussion for markdown-confluence: <https://community.developer.atlassian.com/t/guidance-on-unmaintained-markdown-confluence-project/100699>
- Tutorial for docs-as-code-confluence: <https://sanidhya235.medium.com/publish-github-docs-to-confluence-13cea37919f0>
- DEV article for a small GitHub-to-Confluence publisher: <https://dev.to/andygolubev/automate-publishing-markdown-files-from-github-to-confluence-with-github-to-confluence-publisher-tool-eh4>

### Representative issue evidence

- Mark folder hierarchy/front matter: <https://github.com/kovetskiy/mark/issues/59>
- Mark attachment replacement: <https://github.com/kovetskiy/mark/issues/184>
- Mark attachment handling: <https://github.com/kovetskiy/mark/issues/525>
- Mark media attachment issue: <https://github.com/kovetskiy/mark/issues/500>
- Mark configuration migration: <https://github.com/kovetskiy/mark/issues/613>
- hunyadi/md2conf custom headers/gateway: <https://github.com/hunyadi/md2conf/issues/57>
- markdown-confluence bidirectional request: <https://github.com/markdown-confluence/markdown-confluence/issues/533>
- markdown-confluence REST endpoint/auth problem: <https://github.com/markdown-confluence/markdown-confluence/issues/796>
- markdown-confluence Docker/Mermaid ARM problem: <https://github.com/markdown-confluence/markdown-confluence/issues/786>
- markdown-confluence unchanged uploads: <https://github.com/markdown-confluence/markdown-confluence/issues/673>
- markdown-confluence macro support: <https://github.com/markdown-confluence/markdown-confluence/issues/670>
- markdown-confluence image sizing: <https://github.com/markdown-confluence/markdown-confluence/issues/658>
- markdown-confluence parent configuration: <https://github.com/markdown-confluence/markdown-confluence/issues/657>
- markdown-confluence Obsidian breakage: <https://github.com/markdown-confluence/markdown-confluence/issues/627>
- md2cf rename behavior: <https://github.com/iamjackg/md2cf/issues/62>
- BungaRazvan Markdown-link issue: <https://github.com/BungaRazvan/confluence-link/issues/40>
- Exporter scoped-token/gateway issue: <https://github.com/Spenhouet/confluence-markdown-exporter/issues/165>

---

## 14. Final conclusion

There **are** reliable open-source solutions for one-way Markdown/Git publication to Confluence and for reverse Markdown export. There is **not yet a clearly dominant, broadly validated, production-grade open-source solution for unrestricted bidirectional Git repository ↔ Confluence synchronization**.

`atlcli` materially changes the answer from “none exist” to “a credible implementation exists,” because it explicitly implements pull, push, common-base tracking, conflict detection, merge strategies, and watch behavior. Nevertheless, its small adoption footprint and limited independent production evidence mean that it should be treated as a candidate for rigorous evaluation rather than a solved industry standard.

For a near-term implementation, the safest architecture remains:

- Git is authoritative for mapped page bodies;
- one-way publication is idempotent and identity-aware;
- Confluence divergence is detected and blocks overwrite;
- remote edits are imported through a branch/pull-request workflow;
- only constructs with proven round-trip semantics are auto-merged;
- unsupported structures are preserved opaquely or escalated as conflicts.

That gap—safe identity, semantic diffs, pull requests, conflict handling, and round-trip preservation—is where a new open-source MarksSync project can provide differentiated value.
