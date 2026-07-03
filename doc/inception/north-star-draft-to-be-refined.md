---
source: https://github.com/juliusz-cwiakalski/marksync-for-confluence
id: NORTH-STAR
status: Draft
created: 2026-06-16
last_updated: 2026-06-16
owners: ["juliusz-cwiakalski"]
summary: "North Star for MarkSync for Confluence — a safe, Git-native bridge for publishing Markdown documentation to Confluence."
----------------------------------------------------------------------------------------------------------------------------------

# MarkSync for Confluence: North Star

## Vision

Engineering teams no longer have to choose between Git-native documentation workflows and organization-wide access through Confluence.

Documentation remains versioned, reviewable, automatable, and AI-operable in Git while appearing in Confluence as a faithful, current, and traceable representation of its source.

## Mission

We enable software teams to author and govern documentation in Markdown and Git, then publish it safely to Confluence through deterministic local and CI workflows, so engineers and AI agents can work efficiently while the wider organization retains accessible and trusted documentation.

## Target Users

* **Primary:** Software architects, technical leads, developers, and documentation owners working in organizations where technical documentation should evolve alongside code but must also be available in Confluence.
* **Secondary:** Platform engineering, developer-experience, and documentation-as-code teams that need a repeatable way to standardize Git-to-Confluence publishing across repositories and delivery pipelines.

Confluence readers—such as product managers, analysts, support teams, auditors, customers, and other non-developers—are important beneficiaries, even though they may never operate MarkSync directly.

## Problem We Solve

* Technical documentation is most valuable when it evolves with the system it describes, but Confluence separates documentation from source code, branches, pull requests, and delivery workflows — causing documentation drift and outdated pages.
* Markdown in Git is significantly easier for developers and AI agents to create, search, review, refactor, validate, and reuse — but many organizations still require Confluence as the shared knowledge and governance platform.
* Copying content manually from Git to Confluence wastes time, breaks formatting and diagrams, loses provenance, and creates two competing versions of the truth.
* Existing publishing tools are often limited, opaque, difficult to automate, or focused only on basic one-way conversion — leaving teams without dependable hierarchy mapping, change previews, traceability, and conflict safeguards.
* Allowing edits in both Git and Confluence without explicit drift detection and reconciliation risks silent overwrites or lost work — reducing trust in automation.

## North Star Metric

**Automation coverage of documentation publishing** — the percentage of configured Git documentation changes intended for Confluence that are successfully and faithfully published by MarkSync without manual copy-and-paste.

A change counts as successfully published only when the target page is updated, the published content is traceable to its source file and Git revision, and no unresolved conflict or conversion failure remains.

Guardrails:

* No silent content loss or overwrite.
* Conflicts and external Confluence changes are surfaced explicitly.
* Repeated synchronization is deterministic and idempotent.
* Published pages remain readable and useful to Confluence users.
* Synchronization failures are diagnosable from human-readable and machine-readable output.

## Guiding Principles

* **Git is the authoritative engineering workspace** — documentation is authored, reviewed, versioned, and approved in Git alongside the software and decisions it describes.
* **Confluence is a first-class publication surface** — generated pages must remain readable, navigable, discoverable, and useful to people who do not work in Git.
* **Safe synchronization beats magical synchronization** — MarkSync must prefer explicit diffs, dry runs, conflict detection, and manual reconciliation over silent overwrites or speculative merging.
* **Fidelity and provenance are non-negotiable** — document structure, code blocks, tables, links, images, attachments, and diagrams should be preserved, and every managed page should identify its source and revision.
* **Configuration is versioned with the documentation** — repository-owned configuration and optional document metadata define what is synchronized and how it maps to Confluence.
* **Humans and AI agents are equal operators** — commands, help, diagnostics, exit codes, and structured outputs must support both interactive use and reliable automation.
* **Local-first and CI-ready** — the same core behavior should work from a developer workstation, an AI-agent session, a container, or a CI pipeline without requiring a hosted control plane.

## Decision Filter

When choosing between options, prefer the one that:

1. Prevents content loss and preserves user trust over maximizing automatic behavior.
2. Keeps Git authoritative over introducing Confluence-first editing semantics.
3. Improves publishing fidelity and traceability over supporting more syntax or platforms superficially.
4. Produces deterministic, scriptable behavior over hidden heuristics or interactive-only workflows.
5. Reduces setup and operating friction over introducing a central service or complex infrastructure.
6. Serves both human and AI-agent workflows over optimizing exclusively for one interface.

## Scope

**In scope:**

* Selecting Markdown files and folders through repository-owned YAML configuration.
* Mirroring repository folder structure into a Confluence page hierarchy by default.
* Overriding target spaces, pages, parents, and synchronization behavior through configuration or document metadata.
* Creating and updating Confluence pages from Markdown.
* Previewing intended changes through status, diff, and dry-run workflows.
* Preserving and publishing relevant Markdown structures, links, code blocks, tables, images, attachments, and Mermaid diagrams.
* Recording source paths, Git revisions, and synchronization metadata for traceability and change detection.
* Supporting personal credentials for local execution and dedicated service-account credentials for CI.
* Providing stable commands, meaningful exit codes, and structured output suitable for AI agents and automation.
* Detecting drift and laying the foundation for controlled Confluence-to-Git reconciliation with explicit human conflict resolution.

**Out of scope (for now):**

* Replacing Confluence with a new documentation portal or content-management system.
* Providing a rich-text or WYSIWYG documentation editor.
* Real-time collaborative editing between Git and Confluence.
* Automatically merging or committing Confluence-originated changes into Git.
* Silently overwriting diverged content or resolving conflicts without human review.
* Supporting every Markdown extension, every Atlassian product, or every knowledge platform in the initial product.
* Requiring a hosted SaaS control plane for core synchronization.

## Current Focus

The current phase is to deliver the smallest trustworthy Git-to-Confluence publishing loop.

The first release should prove that a team can configure documentation in a repository, inspect the intended changes, and publish selected Markdown files to the correct Confluence hierarchy with high fidelity, repeatable behavior, and clear provenance. The design must leave room for later drift detection and controlled reverse synchronization without making bidirectional sync a prerequisite for initial value.

Key deliverables:

* A portable Go CLI distributed as native binaries and a container image.
* Repository-owned YAML configuration with file selection, hierarchy mapping, and document-level overrides.
* Deterministic Markdown-to-Confluence conversion and page create/update synchronization.
* Authentication flows for local users and non-interactive CI service accounts.
* Dry-run, diff, diagnostics, structured output, and source-revision metadata.
* Initial support for local assets and Mermaid diagrams.

Success criteria for this phase:

* A user can initialize MarkSync, configure a documentation tree, and publish it to Confluence without manually copying content.
* Re-running synchronization without source changes produces no unnecessary Confluence updates.
* Every managed Confluence page can be traced to its repository, source file, and Git revision.
* Dry-run output accurately reports all pages and assets that would be created or updated.
* The same project configuration works locally and in CI with only authentication supplied differently.
* Conversion or synchronization failures do not silently corrupt or overwrite existing content.

See [02-roadmap.md](./02-roadmap.md) for the full multi-phase plan.

## Stakeholders

* **Software architects and technical leads** — define documentation structure, governance, and source-of-truth rules.
* **Developers and documentation authors** — create and review Markdown documentation alongside implementation changes.
* **Platform and developer-experience teams** — standardize configuration, credentials, CI integration, and rollout across repositories.
* **Confluence readers and organizational stakeholders** — consume current documentation without needing Git knowledge or repository access.
* **AI coding and documentation agents** — create, update, validate, compare, and publish documentation through predictable CLI operations.
* **Project maintainers and open-source contributors** — evolve MarkSync while protecting interoperability, safety, and long-term maintainability.

---

## Document History

| Date       | Author             | Change                                                                                                                                |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-16 | Juliusz Ćwiąkalski | Recreated the North Star from the full project discussion, with stronger focus on the Git-authoring and Confluence-publishing problem |
