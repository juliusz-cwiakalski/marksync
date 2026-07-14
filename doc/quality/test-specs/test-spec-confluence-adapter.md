---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project-generated
id: TEST-SPEC-CONFLUENCE-ADAPTER
status: Current
created: 2026-07-10
last_updated: 2026-07-14
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
links:
  related_changes: [GH-21, GH-27, GH-66, GH-71]
  feature_spec: doc/spec/features/feature-confluence-adapter.md
  decisions: [ADR-0005, ADR-0006, ADR-0010]
---

# Test Specification: Confluence Cloud Adapter

## Overview

The Confluence adapter (`src/infra/confluence/`) implements the domain-owned
`TargetSystem` port (`src/domain/target/port.ts`). It is exercised at the
**Unit** and **Integration** tiers against a local `Bun.serve` mock simulating
the Confluence Cloud REST v2/v1 split. No E2E runs against a live tenant during
MS-0002 — the live-tenant smoke is wired by E5-S1.

The brand-defining safety properties are proven through the **integration** tier
over captured real HTTP traffic (not mocks alone), per the over-mocking
guardrail in `.ai/rules/testing-strategy.md`:

- **409 parse correctness** — the optimistic-concurrency gate (ADR-0006 C-5/C-6).
- **403 warn+skip** — never delete + recreate (INV-SAFE-1).
- **No token leak** — grep captured request/response artifacts for the token.
- **No outbound telemetry** — every request host === configured `baseUrl`.
- **Boundary isolation** — dep-cruiser fires on a `src/domain/` → `src/infra/`
  breach.

## Test Scope

**Components under test:**

- `src/domain/target/port.ts` — the `TargetSystem` port interface + value types.
- `src/domain/errors.ts` — the `RateLimited` + `RemoteUnreachable` error arms
  (and the three handler sites: `assertNeverMarkSyncError`,
  `mapMarkSyncErrorToCommandError`, `CODE_TO_EXIT`).
- `src/infra/confluence/client.ts` — `ConfluenceClient` transport.
- `src/infra/confluence/pages.ts` — `PageService` (v2) + the 409-conflict parse.
- `src/infra/confluence/properties.ts` — `PropertyService` (v1, key-based).
- `src/infra/confluence/attachments.ts` — `AttachmentService` (v1).
- `src/infra/confluence/search.ts` / `restrictions.ts` — minimal v1 services.
- `src/infra/confluence/provenance.ts` — the `version.message` formatter (`formatVersionMessage`/`formatVersionMessageWithMeta`), the visible panel builder (`buildProvenancePanel`), and the direct-edit classifier (`classifyVersion`) (GH-21/GH-27).
- `src/infra/confluence/target.ts` — the assembled `ConfluenceTarget` adapter.
- `src/infra/confluence/schemas/*.ts` — zod boundary schemas.

**Exclusions:**

- Plan/apply orchestration (E3-S6), drift classification (E3-S5), concurrency
  (E3-S7) — the adapter exposes port operations; it does not call them in a plan.
- Live-tenant E2E — wired by E5-S1.
- `labels.ts` add/delete — deferred to post-MS-0002 (DEC-8).
- Reverse conversion (Storage/ADF → Markdown) — MS-0005+.

## Test Levels

### Unit Tests

**Purpose:** Validate individual components — error-arm round-trips, URL
builders, retry/backoff timing, the 409-conflict parse, the 403/404 mapping,
schema-drift mapping, the property round-trip, the attachment 400-dup
idempotency signal + create-response unwrap (GH-71), search/restrictions, the provenance
formatter + panel builder + direct-edit classifier, the port interface, and the `ConfluenceTarget` wiring.

**Tools:** `bun:test`; the client/service constructors accept an **injected
`fetch`** seam (default `globalThis.fetch`) so unit tests stub `fetch`. Backoff
timing uses fake timers / an injected delay seam — no real sleeps.

**Location:** `tests/unit/` mirroring `src/`:
`tests/unit/domain/errors/`, `tests/unit/domain/target/`,
`tests/unit/infra/confluence/`.

### Integration Tests

**Purpose:** Exercise the full `ConfluenceTarget` adapter end-to-end against a
local `Bun.serve` mock simulating the v2/v1 split and every status path. This is
where the critical-safety properties are proven over captured real HTTP traffic.

**Tools:** `bun:test` + `Bun.serve()`; the mock records every incoming request
(URL, method, headers, body) so assertions run against real captured artifacts.

**Key scenarios:**
- `updatePage` 200 → `ok(Page)`.
- Stale `version.number` → 409 `CONFLICT` → `err(Conflict)` with correct numbers.
- 403 on `getPage` → `Forbidden`; assert 0 delete/recreate requests issued.
- `putProperty` string → `getProperty` byte-equal; ~8 KB round-trips.
- Duplicate-filename upload → 400 "same file name" → "already exists" (not an
  error); changed bytes → new hash-named file → fresh create (no `/data` update).
- 429 + `Retry-After` → bounded backoff (max 3) → ok; sustained → `RateLimited`.
- Transient 5xx → retried (max 3); sustained → `RemoteUnreachable`.
- Grep captured artifacts for the token → 0 occurrences.
- Every captured request host === `baseUrl` host → 0 to other hosts.

**Location:** `tests/integration/confluence/confluence-target.test.ts`.

### End-to-End Tests

Not run during MS-0002. The live-tenant smoke (real Confluence page CRUD + 409 +
attachments) is wired by E5-S1 against a sandbox tenant.

## Test Data

- Mock responses are inline fixtures in the test files (HTTP status + JSON body).
- The 409-conflict parse uses the exact spike-H5 title shape: `"…Current Version:
  [N]. Provided version: [M]"` with multiple version-pair fixtures.
- The credentials fixture carries a known token string used as the no-leak grep
  needle.
- The boundary negative test creates an **ephemeral** probe under `src/domain/`
  at runtime and deletes it in `afterEach`/`finally` (cleanup is load-bearing — a
  leaked probe permanently breaks `depcruise src`).

## Test Scenarios

### Scenario 1: 409-conflict parse produces a typed Conflict

- **Given:** a mocked 409 response with `errors[0].code === "CONFLICT"` and a
  title containing `"Current Version: [7]. Provided version: [5]"`.
- **When:** `updatePage` is called with a stale `baseVersion`.
- **Then:** returns `err({ kind: "Conflict"; pageId; baseVersion: 5;
  remoteVersion: 7 })` — version numbers correctly parsed (not swapped).
- **And:** 100% of multi-digit / varied-pair 409 fixtures extract correctly.

### Scenario 2: 403 maps to Forbidden warn+skip (never delete+recreate)

- **Given:** a mocked 403 on `getPage`.
- **When:** the adapter processes the locked page.
- **Then:** returns `err({ kind: "Forbidden"; pageId; operation })`.
- **And:** the integration assertion confirms 0 delete/recreate requests were
  issued to the mock (INV-SAFE-1).

### Scenario 3: 429 backoff → RateLimited on exhaustion

- **Given:** a mocked 429 with `Retry-After: 1`.
- **When:** the client retries with exponential backoff (1s/2s/4s + jitter).
- **Then:** a transient 429 recovers (eventual 200 → ok); a sustained 429
  exhausts after max 3 retries → `err({ kind: "RateLimited"; retryAfterMs? })`.

### Scenario 4: No token leak in captured traffic

- **Given:** the `Bun.serve` mock records every request header + body.
- **When:** the adapter is driven through several ops (update, property
  round-trip, attachment upload).
- **Then:** grep of captured request + response artifacts (and any redacted log
  lines) for the token yields 0 occurrences (INV-SEC-1).

### Scenario 5: No outbound telemetry

- **Given:** the mock records every request URL.
- **When:** the adapter issues `fetch` calls.
- **Then:** every captured request URL host === the configured `baseUrl` host —
  0 requests target any other host (NFR-SEC-3).

### Scenario 6: Boundary isolation (dep-cruiser negative test)

- **Given:** an ephemeral probe under `src/domain/` importing a
  `#infra/confluence/*` symbol.
- **When:** dependency-cruiser runs with the production `.dependency-cruiser.cjs`
  ruleset over `src/`.
- **Then:** the `domain-may-not-import-infra` violation fires with the correct
  `from` (the probe) and `to` (`src/infra/`). The probe is deleted in
  `afterEach`.

### Scenario 7: Attachment 400-duplicate is an idempotency signal

- **Given:** a duplicate-filename upload → the create endpoint returns 400
  `"Cannot add a new attachment with the same file name"`.
- **When:** the adapter processes the duplicate.
- **Then:** returns an "already exists" result (NOT an error); idempotent rerun
  performs 0 writes. Changed bytes → new hash → new filename → fresh create (no
  in-place `/data` update by design).

### Scenario 8: Schema-drift maps to RemoteUnreachable

- **Given:** a malformed 200 page body or 409 envelope that fails its zod schema.
- **When:** the adapter processes the response.
- **Then:** returns `err({ kind: "RemoteUnreachable"; cause })` — never a silent
  misparse.

### Scenario 9: Attachment create unwraps the v1 `{ results: [...] }` response

- **Given:** a POST create returns 200 with
  `{ results: [{ id, title, version }] }` — the Confluence v1 API wraps even
  single creates in a `results` array (spike evidence `F-01-upload.json`,
  `doc/inception/integration-scenarios/11-attachments.md`).
- **When:** `AttachmentService.upload()` processes the 200 response.
- **Then:** `mapCreate` unwraps `results[0]` before zod validation and returns
  `ok(AttachmentRef)` with the correct id/title/hash/version — not
  `RemoteUnreachable { cause: "schema validation failed: AttachmentCreateResponse" }`.
  A flat response (no `results` wrapper) falls back to body-as-is (defensive,
  DEC-2). Mermaid SVG artifacts produce the `marksync-mermaid-<hash>.svg`
  prefix.
- **And:** an empty `{ results: [] }` or a result missing required fields (e.g.
  no `title`) → schema validation fails → `RemoteUnreachable` (never a fabricated
  ref). *(GH-71; TC-ATTACH-001 through TC-ATTACH-006.)*

## Performance & Load Tests

Not part of MS-0002. NFR-PERF-* conversion/binary-size targets are deferred to
MS-0003+.

## Security Tests

- **No token leak (INV-SEC-1):** the opaque-`authHeader` design + the GH-16
  redaction layer keep `Authorization`/`Basic`/token/email out of all output
  paths. Proven by grepping real captured traffic (Scenario 4).
- **No outbound telemetry (NFR-SEC-3):** `v1`/`v2` URL builders root at
  `baseUrl`; `fetch` issues requests only to that host (Scenario 5).
- **DEC-9 message discipline:** mapped CLI messages interpolate only structural
  identifiers — never `cause`, `retryAfterMs`, paths, or bodies. A unit test
  asserts neither mapped message contains the `cause` substring nor the numeric
  `retryAfterMs`.

## Negative Testing

- 404 on `getPage` → `RemoteMissing`.
- Thrown `fetch` (network failure) → `RemoteUnreachable` (no retry).
- 401/403 → 0 retries (surfaced immediately — spike rule).
- Missing property key → `ok(undefined)` (not an error).
- POST-create 409 (key exists) → GET current `version.number` → versioned PUT (recovered); a property-PUT 409 (rare concurrent race) → `RemoteUnreachable`, not `Conflict` (DEC-6 / GH-66).

## Automation Strategy

- **CI:** `bun run check` (lint + format:check + typecheck + test +
  check:boundaries) is the gate (AC-Q-1). It exits 0.
- **Type-level safety:** `bun run typecheck` proves the two new error arms keep
  `assertNeverMarkSyncError` exhaustive (a missed `case` fails to compile).
- **Boundary gate:** `bun run check:boundaries` (`depcruise src`) confirms no
  `src/domain/**` or `src/cli/**` imports `#infra/confluence/*`.

## Test Environment

- **Mock server:** `Bun.serve()` simulating Confluence v2 (`/wiki/api/v2/*`) and
  v1 (`/wiki/rest/api/*`) endpoints, recording all incoming requests.
- **Injected fetch:** unit tests stub `fetch` directly via the constructor seam.
- **No real network:** all tests run offline against the local mock. Live
  Confluence network is E5-S1 only.

## Test Coverage Metrics

- Every Confluence response path (200/409/403/404/400-dup/429/5xx/network-throw)
  has at least one unit and one integration assertion.
- Every port operation is wired in `ConfluenceTarget` (structural check).
- The boundary negative test proves the production dep-cruiser rule fires.

## References

- [Feature spec](../../spec/features/feature-confluence-adapter.md)
- [ADR-0005](../../decisions/ADR-0005-page-body-representation-storage-not-adf.md) (Storage target)
- [ADR-0006](../../decisions/ADR-0006-document-identity-and-shared-base-state-model.md) (state model — 409 gate, 403 warn+skip, INV-SAFE-1)
- [ADR-0010](../../decisions/ADR-0010-confluence-page-history-provenance-and-sync-granularity.md) (provenance)
- [Architecture overview](../../overview/architecture-overview.md)
- [Testing strategy](../../../.ai/rules/testing-strategy.md)
