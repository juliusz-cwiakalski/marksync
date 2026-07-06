---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/00-index.md
ados_distribution: project-generated
---
# Documentation Index

> Landing page for **MarkSync for Confluence** documentation. For humans and AI agents.

## Start Here

| Document | Description |
|----------|-------------|
| [North Star](overview/01-north-star.md) | Product vision, proxy metrics, guardrails |
| [Roadmap](overview/02-roadmap.md) | Milestone roadmap (MS-0001 done; MS-0002 MVP active) |
| [Tech Stack](overview/tech-stack.md) | Technology choices (TypeScript + Bun, remark, Mermaid) |
| [Architecture](overview/architecture-overview.md) | Ports-and-adapters, C4 diagrams, dependency matrix |
| [Glossary](overview/glossary.md) | Terms and acronyms |
| [Ubiquitous Language](overview/ubiquitous-language.md) | Bounded context — aggregates, entities, VOs, events |
| [System Spec](spec/) | Current truth — feature specs, NFRs |
| [Documentation Handbook](documentation-handbook.md) | How docs work — structure, conventions, workflow |

## Changing Behavior?

| Document | Description |
|----------|-------------|
| [Changes](changes/) | Proposed and accepted changes (evolution log) |
| [Change Lifecycle Guide](guides/change-lifecycle.md) | 11-phase delivery workflow |
| [Definition of Ready](guides/definition-of-ready.md) | DoR gate (`dor_check`, phase 5) — pre-delivery review of artifacts vs ticket |
| [Definition of Done](guides/definition-of-done.md) | DoD gate (`dod_check`, phase 10) |
| [Change Convention](guides/unified-change-convention-tracker-agnostic-specification.md) | Naming, folders, branches |

## Project Guides & Baselines

| Document | Description |
|----------|-------------|
| [Dev Environment](guides/dev-environment.md) | Local setup, prerequisites, scripts, troubleshooting |
| [Security Baseline](guides/security-baseline.md) | Secret management, redaction, dependency audit, converter injection safety |
| [Accessibility Baseline](guides/accessibility-baseline.md) | CLI output accessibility, provenance panel contract |

## ADOS Framework Guides

| Document | Description |
|----------|-------------|
| [ADOS Processes Map](guides/ados-processes.md) | Canonical map of ADOS's six processes |
| [Agents & Commands Guide](guides/opencode-agents-and-commands-guide.md) | How to use AI agents and commands |
| [Onboarding Existing Project](guides/onboarding-existing-project.md) | Adopt ADOS in an existing project |
| [Project Inception](guides/project-inception.md) | Manual 8-phase process for running project inception |
| [Autonomous Batch Delivery](guides/autonomous-batch-delivery.md) | Batch delivery of multiple tickets |
| [Decision Records Management](guides/decision-records-management.md) | Decision record types, lifecycle, governance |
| [Decision-Making Guide](guides/decision-making.md) | The decision process |
| [Meeting Preparation and Summarization](guides/meeting-preparation-and-summarization.md) | How to prepare, run, document, and follow up on meetings |
| [PR Platform Integration](guides/pr-platform-integration.md) | PR/MR platform setup (GitHub CLI) |
| [Claude Code Setup](guides/claude-code-setup.md) | Claude Code CLI provider setup |
| [OpenCode Model Configuration](guides/opencode-model-configuration.md) | Model assignment and configuration |
| [External Researcher Setup](guides/external-researcher-setup.md) | MCP-based external research setup |
| [System Dependencies](guides/system-dependencies.md) | External system dependency inventory |
| [Copywriting Guide](guides/copywriting.md) | Copywriting conventions |
| [Tools Convention](guides/tools-convention.md) | Standard for building CLI tools |

## Coding Rules

| Rule | Description |
|------|-------------|
| [TypeScript Conventions](../.ai/rules/typescript.md) | Module tiers, naming, Result&lt;T,E&gt;, Biome, dependency-cruiser |
| [Testing Strategy](../.ai/rules/testing-strategy.md) | 6 test tiers, coverage rules, over-mocking guardrail |
| [Rules Index](../.ai/rules/README.md) | Rule routing table |

## Templates

| Template | Purpose |
|----------|---------|
| [Change Spec](templates/change-spec-template.md) | Change specification |
| [Decision Record](templates/decision-record-template.md) | Decision records (ADR/PDR/TDR/BDR/ODR) |
| [Feature Spec](templates/feature-spec-template.md) | Feature specifications |
| [North Star](templates/north-star-template.md) | Product north star document |
| [Test Spec](templates/test-spec-template.md) | Test specifications |
| [Test Plan](templates/test-plan-template.md) | Per-change test plans |
| [Implementation Plan](templates/implementation-plan-template.md) | Per-change implementation plans |

Additional profile-aware templates are listed in [templates/README.md](templates/README.md).

## Decision Records

| Document | Description |
|----------|-------------|
| [Decision Records](decisions/) | All decision records (ADR/PDR/TDR/BDR/ODR) |
| [Decision Records Index](decisions/00-index.md) | Index of all decisions |

## For AI Agents

- System bootstrap: [AGENTS.md](../AGENTS.md)
- PM configuration: [.ai/agent/pm-instructions.md](../.ai/agent/pm-instructions.md)
- Decision configuration: [.ai/agent/decision-instructions.md](../.ai/agent/decision-instructions.md)
- PR/MR platform: [.ai/agent/pr-instructions.md](../.ai/agent/pr-instructions.md)
- Code review checklist: [.ai/agent/code-review-instructions.md](../.ai/agent/code-review-instructions.md)
- Agent definitions: `~/.ados/repo/.opencode/agent/*.md` (global install)
- Command definitions: `~/.ados/repo/.opencode/command/*.md` (global install)
