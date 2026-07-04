---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/decisions/00-index.md
---
# Decision Records Index

All decision records for this repository, ordered by number.

> **Migration note (Phase 3, 2026-07-04).** ADR-0001…ADR-0005 were authored
> pre-inception in `doc/inception/decisions/` and have been migrated to this
> canonical home (`doc/decisions/`). ADR-0006…ADR-0009 were created during
> Phase 3 inception. All remain `status: Proposed` pending human confirmation.
> Records are numbered in one sequence regardless of `decision_type`.

| ID | Type | Title | Status | Date | Owners |
|----|------|-------|--------|------|--------|
| [ADR-0001](./ADR-0001-implementation-language-and-runtime.md) | ADR | Implementation language and runtime — TypeScript (single-binary) over Go | Proposed | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0002](./ADR-0002-mermaid-rendering-strategy.md) | ADR | Mermaid rendering strategy | Proposed | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0003](./ADR-0003-product-naming-confluence-adapter.md) | PDR | Product naming and architecture — "MarkSync" core with Confluence as the first adapter | Proposed | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0004](./ADR-0004-confluence-api-validation-spike.md) | TDR | Run a scoped Atlassian Confluence Cloud API validation spike before implementation | Proposed | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0005](./ADR-0005-page-body-representation-storage-not-adf.md) | ADR | Page body representation — write Storage Format, not ADF | Proposed | 2026-07-03 | Juliusz Ćwiąkalski |
| [ADR-0006](./ADR-0006-document-identity-and-shared-base-state-model.md) | ADR | Document identity and shared-base state model — source-side UUID v7 + committed lock + disposable cache | Proposed | 2026-07-04 | Juliusz Ćwiąkalski |
| [ADR-0007](./ADR-0007-cli-framework.md) | ADR | CLI framework — Cliffy | Proposed | 2026-07-04 | Juliusz Ćwiąkalski |
| [ADR-0008](./ADR-0008-git-adapter.md) | ADR | Git adapter — shell-Git behind the Repository interface | Proposed | 2026-07-04 | Juliusz Ćwiąkalski |
| [ADR-0009](./ADR-0009-testing-runner.md) | TDR | Testing runner — bun:test + thin E2E runner | Proposed | 2026-07-04 | Juliusz Ćwiąkalski |
