---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: SPEC-SAFE-PUBLISH
status: Current
created: 2026-07-06
last_updated: 2026-07-06
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: []
  decisions: [ADR-0005, ADR-0006, ADR-0010, ADR-0011]
  contracts: []
---

# Feature Specification: Safe Publish Pipeline

> The trust wedge: publish Markdown from Git to Confluence without ever silently
> overwriting remote work.

## 1. Overview

The safe publish pipeline is the core of MarkSync's MS-0002 MVP. It reads
Markdown files from a Git repository, converts them to Confluence Storage Format,
and publishes to Confluence Cloud with document identity, drift detection, and
conflict classification that **refuses to silently overwrite remote work**.

## 2. Business Context

### 2.1 Problem Statement

- **Problem:** Teams manage documentation in Markdown (engineers, AI agents, CI)
  but need it visible on Confluence. Existing tools either require manual
  copy-paste, lose formatting, or lack safety guarantees.
- **Affected Users:** Developers, technical writers, CI pipelines, AI agents.
- **Business Impact:** Without safe automation, teams either don't sync (docs go
  stale) or use unsafe tools (silent data loss).

### 2.2 Goals & Success Metrics

- **Primary Goal:** A Git→Confluence publish that never silently overwrites
  remote work and explains every mutation before applying it.
- **KPIs:**
  - Drift detection effectiveness: 100% (no silent overwrite)
  - Semantic idempotency: second unchanged push writes 0 pages
  - Conflict false-positive rate: <5%

## 3. Functionality

### 3.1 Capabilities

- **Document identity:** immutable UUID v7 in source front-matter; Confluence
  page ID = remote identity; title/path are mutable.
- **Lock file:** committed, versioned — records the shared base (last known
  remote state per document). Survives clones/branches/CI.
- **Drift detection:** classifies each document as `NO_CHANGE` /
  `LOCAL_AHEAD` / `REMOTE_AHEAD` / `DIVERGED` / `REMOTE_MISSING` /
  `LOCAL_MISSING` using canonical semantic hashing (raw + canonical +
  normalized + attachment).
- **Safe publish:** create / update / no-op / move based on drift
  classification. Unsafe overwrites blocked by default.
- **Concurrency control:** decentralized optimistic concurrency — Confluence 409
  on stale `version.number` + operation-ID dedup + stale-plan expiry + CI
  concurrency-group templates.
- **Minimal repair:** `repair-state` for stale locks and interrupted-apply
  journal replay.
- **Provenance:** visible panel/footer (source path + Git revision + last-sync)
  + machine content-property metadata.

### 3.2 Key user flows

```
plan → (dry-run diff) → apply → (create/update/no-op/move per document)
```

Each document is processed independently; a failure on one does not block others
(per-document isolation).

### 3.3 Edge cases & error handling

- **Duplicate UUID:** fatal before any write (premortem §5.2).
- **Remotely deleted managed page:** never silently re-created; emit warning +
  require explicit `--adopt` or `--rebind`.
- **403 on locked page ID:** warn + skip (page exists but inaccessible); do not
  treat as deleted.
- **Partial apply:** journal-based replay; `repair-state` recovers.
- **Concurrent CI runs:** older plan must not overwrite newer (409 + dedup).

## 4. Technical Architecture

### 4.1 Design

Ports-and-adapters. The sync engine operates on abstract `Document` entities and
a `TargetSystem` port. The Confluence adapter is the sole implementation.

### 4.2 Core components

| Component | Responsibility |
|---|---|
| Markdown pipeline | remark/HAST → Storage Format conversion (canonical GFM subset) |
| Identity service | UUID v7 assignment, front-matter management |
| State manager | Lock file read/write, cache management, drift comparison |
| Drift classifier | Canonical hash comparison → `NO_CHANGE` / `LOCAL_AHEAD` / etc. |
| Sync engine | Orchestrates plan → apply per document; journal/replay |
| Confluence adapter | `TargetSystem` port implementation (v2/v1 API) |

### 4.3 Key decisions

- **ADR-0005:** Storage Format write target (not ADF).
- **ADR-0006:** UUID v7 + committed lock + disposable cache + decentralized 409
  concurrency.
- **ADR-0010:** Squash provenance via `version.message` (compact Git summary).
- **ADR-0011:** `CommandResult<T>` structured output + centralized redaction.

## 5. Acceptance criteria (cross-cutting)

- [ ] **INV-SAFE-1:** No silent overwrite — a `REMOTE_AHEAD`/`DIVERGED`
      document is blocked, never auto-overwritten.
- [ ] **INV-SAFE-2:** A remotely-deleted managed page is never silently
      re-created (`REMOTE_MISSING` blocked without `--adopt`/`--rebind`).
- [ ] **INV-SAFE-3:** Duplicate UUID is fatal before any write.
- [ ] **NFR-REL-5:** Two overlapping CI plans: older must not overwrite newer.
- [ ] **INV-SEC-1:** No credential appears in any output path (logs, plans,
      state, diagnostics, `version.message`, cache).
- [ ] Semantic idempotency: second unchanged push writes 0 pages.
- [ ] Drift classification: `NO_CHANGE` / `LOCAL_AHEAD` / `REMOTE_AHEAD` /
      `DIVERGED` / `REMOTE_MISSING` / `LOCAL_MISSING` all correctly detected.

## 6. References

- [ADR-0005](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md)
- [ADR-0006](../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md)
- [ADR-0010](../../decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md)
- [ADR-0011](../../decisions/ADR-0011-cli-output-strategy.md)
- [NFRs](../nonfunctional.md)
- [Roadmap MS-0002](../../overview/02-roadmap.md)
