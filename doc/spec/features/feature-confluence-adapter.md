---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: SPEC-CONFLUENCE-ADAPTER
status: Current
created: 2026-07-06
last_updated: 2026-07-06
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: []
  decisions: [ADR-0005, ADR-0006]
  contracts: []
---

# Feature Specification: Confluence Cloud Adapter

> The `TargetSystem` port implementation for Atlassian Confluence Cloud.

## 1. Overview

The Confluence adapter is the sole implementation of the `TargetSystem` port. It
isolates all Confluence Cloud API specifics behind a clean boundary so domain
logic has zero Confluence imports. Future wiki adapters implement the same port.

## 2. Business Context

### 2.1 Problem Statement

- **Problem:** Confluence Cloud has a split API surface (v2 primary, v1 for
  legacy operations) with undocumented behaviors, rate limits, and permission
  asymmetries. Leaking these into domain logic makes the system untestable and
  non-portable.
- **Affected Users:** All MarkSync users (the adapter is the only Confluence
  integration path).
- **Business Impact:** Adapter isolation enables mock-based testing (the dominant
  test layer) and makes future adapters possible.

## 3. Functionality

### 3.1 Capabilities

- **Page CRUD:** create, read, update, move via v2 REST API.
- **Content properties:** read/write `marksync.metadata` content property (v2)
  for machine-readable state.
- **Attachments:** upload, update, download (v1-only).
- **Labels:** add, delete, list (v1-only).
- **Search:** CQL search for page discovery (v1-only).
- **Restrictions:** read page restrictions (v1-only).
- **Optimistic concurrency:** 409 on stale `version.number`.

### 3.2 API surface split

| Operation | API | Notes |
|---|---|---|
| Page create/read/update/move | v2 | Primary surface |
| Content properties | v2 | `marksync.metadata` key |
| Attachments upload/update/download | v1-only | Not in v2 |
| Labels add/delete | v1-only | Not in v2 |
| Search (CQL) | v1-only | Not in v2 |
| Restrictions read | v1-only | Not in v2 |

> **Spike-validated (MS-0001):** all operations above were confirmed working
> against a live Confluence Cloud tenant.

### 3.3 Edge cases & error handling

- **409 version conflict:** parse error, return to sync engine for drift
  reclassification.
- **403 permission asymmetry:** warn + skip; do not treat as deleted.
- **Rate limiting (429):** exponential backoff with jitter; documented retry
  policy.
- **API drift (deprecation):** nightly live-tenant smoke + weekly deprecation
  feed check.

## 4. Technical Architecture

### 4.1 Design

Implements the `TargetSystem` port interface. All Confluence-specific types
(Storage Format, v2 response shapes) stay within adapter modules.

### 4.2 Core components

| Component | Responsibility |
|---|---|
| ConfluenceClient | HTTP client (v2 + v1); auth; retry; rate-limit handling |
| PageService | Page CRUD via v2 |
| PropertyService | Content properties via v2 |
| AttachmentService | Attachments via v1 |
| LabelService | Labels via v1 |
| SearchService | CQL search via v1 |

### 4.3 Key decisions

- **ADR-0005:** Write Storage Format (not ADF).
- **ADR-0006:** Confluence page ID = remote identity; content properties carry
  MarkSync state.
- **TDR-0003:** Shell-Git behind Repository interface (for any Git operations
  the adapter triggers).

## 5. Acceptance criteria

- [ ] No Confluence-specific types leak into domain or CLI layers (enforced by
      dependency-cruiser, TDR-0006).
- [ ] v2 used for content/properties; v1 only for attachments/labels/search/
      restrictions.
- [ ] 409 optimistic concurrency correctly parsed and surfaced.
- [ ] 403 on locked page: warn + skip (not delete + recreate).
- [ ] Rate-limit retry: exponential backoff with documented policy.

## 6. References

- [ADR-0005](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md)
- [ADR-0006](../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md)
- [Architecture overview](../../overview/architecture-overview.md)
- [Integration scenarios (MS-0001 spike)](../../inception/integration-scenarios/)
- [NFRs](../nonfunctional.md)
