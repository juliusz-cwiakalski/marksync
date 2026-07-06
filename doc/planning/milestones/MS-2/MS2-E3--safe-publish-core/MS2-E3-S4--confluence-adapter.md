---
id: MS2-E3-S4
title: "confluence-adapter (TargetSystem port impl)"
status: todo
type: story
priority: critical
epic: MS2-E3
milestone: MS-0002
estimate: 4d
gh_issue: GH-21
feature_spec: doc/spec/features/feature-confluence-adapter.md
decisions: [ADR-0005, ADR-0006]
dependencies: { blocks: [MS2-E3-S5, MS2-E3-S6], blocked_by: [MS2-E2-S4, MS2-E3-S3] }
cross_cutting: [R-FEA-6, R-FEA-10, NFR-MAINT-1]
---

# MS2-E3-S4 — Confluence Cloud adapter (TargetSystem port implementation)

## Goal
Implement the `TargetSystem` port for Confluence Cloud: all REST v2/v1 distinctions isolated here, behind a clean boundary the domain never sees. Page CRUD + content properties (v2); attachments/labels/search/restrictions (v1-only); 409 optimistic-concurrency parsing; 403 warn+skip; 429 backoff.

## Background
NFR-MAINT-1 / A-FEA-6: ALL Confluence REST v2/v1 distinctions live behind this adapter (dependency-cruiser-enforced). The MS-0001 spike VALIDATED every operation (H1–H6, blueprint §0). This story turns those validated facts into the port implementation. The domain calls the `TargetSystem` port; only this module knows Confluence exists.

## Detailed scope (deliverables)
1. **`src/domain/target/port.ts`** — the `TargetSystem` port interface (the contract every adapter implements; matches `architecture-overview.md` §"Internal interface contracts"): `renderBody(mdast, opts)` → `{body, hash}` (the body-renderer is target-specific, so it lives behind the port), `getPage(id)`, `createPage(req)`, `updatePage(req)` (returns `Conflict` on 409), `movePage(req)`, `getProperty(pageId,key)`, `putProperty(pageId,key,value)`, `uploadAttachment(pageId,artifact)`, `attachmentExists(pageId,hash)`, `listAttachments(pageId)`, `searchPages(cql)`, `getRestrictions(pageId)`. All return `Result<T, MarkSyncError>`. NO Confluence types in this interface.
   - `renderBody` is implemented by delegating to `src/infra/confluence/render/storage.ts` (built in E3-S3) — that's why this story is `blocked_by` E3-S3. The app layer (E3-S6) calls `target.renderBody(mdast)` and never imports the Confluence renderer directly.
2. **`src/infra/confluence/client.ts`** — `ConfluenceClient`: native `fetch`; `v1(path)`/`v2(path)` URL builders (blueprint §0 endpoints); inject `authHeader` from E2-S4; `Content-Type: application/json`, `User-Agent: marksync/<ver>`; **redacted** request/response logging (via the E2-S3 Redactor — never log the token); 429 exponential-backoff (1s/2s/4s + jitter, `Retry-After` honored, max 3 retries); 5xx retry (max 3). No HTTP library (typescript.md).
3. **`src/infra/confluence/pages.ts`** — `PageService` (v2): create `POST /wiki/api/v2/pages` (body `representation:"storage"`); read `GET /wiki/api/v2/pages/{id}?body-format=storage`; update `PUT /wiki/api/v2/pages/{id}` with `version:{number:N+1, message}`; move (parent change). Parse the H5 409: `errors[0].code==="CONFLICT"` → `Conflict{baseVersion; remoteVersion}`.
4. **`src/infra/confluence/properties.ts`** — `PropertyService` (v2): `GET/POST /wiki/api/v2/pages/{id}/properties`, `GET /wiki/api/v2/pages/{id}/property/{key}`. Stores `marksync.metadata` as a **string** value (spike H2). 409 on key-conflict handled.
5. **`src/infra/confluence/attachments.ts`** — `AttachmentService` (v1-only): `POST /wiki/rest/api/content/{id}/child/attachment` multipart (`X-Atlassian-Token: no-check`, `minorEdit:true`); the create endpoint's **400 "Cannot add a new attachment with the same file name"** is the **skip-if-exists / idempotency signal** (spike H4) → map to a "duplicate" result, not an error; update via `/child/attachment/{attId}/data` (version bump). Hash-named files (`marksync-mermaid-<hash>.svg`, `marksync-asset-<hash>.<ext>`).
6. **`src/infra/confluence/search.ts` / `restrictions.ts`** — v1-only services kept minimal for MS-0002: CQL `searchPages` (used by `doctor`/discovery) and `getRestrictions` read (supports the 403/permission-awareness story, R-FEA-10). **Labels add/delete (`labels.ts`) are deferred to post-MS-0002** — not used by any MS-0002 flow (keeps the adapter surface narrow per NFR-MAINT-2).
7. **403 handling** — a page that returns 403 (locked/inaccessible) → `Forbidden{pageId; operation}` mapped to **warn+skip** (NOT delete+recreate; ADR-0006, R-FEA-10, INV-SAFE-1). Distinguishing deleted vs inaccessible requires assuming the operator has read access (blueprint §0, architecture UNCERT-4).
8. **`src/infra/confluence/provenance.ts`** — the `version.message` formatter (blueprint §5; ADR-0010) — consumed by E3-S6/E4-S3 but the formatter lives in the adapter (it's Confluence-specific). Uses the length limit from spike E1-S2.

## Technical approach
- All HTTP via native `fetch`; `URL` construction; `FormData`/`Blob` for multipart (built-in).
- zod schemas validate every Confluence response at the boundary (typescript.md zod-first for code-owned schemas).
- The 409 parse is the critical path: extract `errors[0].code` + parse the version numbers from the title (`Current Version: [N]. Provided version: [M]`).
- Retry policy centralized in `client.ts`; never retry 401/403 (spike rule).

## Interface contracts (what other stories consume)
- `TargetSystem` port — consumed by E3-S5 (drift fetches remote via port), E3-S6 (apply via port), E3-S7 (concurrency via 409), E4-S1/E4-S2 (attachments via port).
- `Conflict` error — consumed by E3-S6/E3-S7 (drift reclassification + retry).
- `Forbidden` (warn+skip) — consumed by E3-S6.
- `provenance.formatVersionMessage()` — consumed by E3-S6/E4-S3.

## Acceptance criteria (testable)
- [ ] **NFR-MAINT-1 / boundary:** dependency-cruiser asserts NO file under `src/domain/` or `src/cli/` imports anything from `src/infra/confluence/` (the port is the only seam). Verify with a scratch-file negative test.
- [ ] **409 parse (H5):** a mocked 409 with `errors[0].code:"CONFLICT"` → `updatePage` returns `err(Conflict{remoteVersion; baseVersion})` with correctly parsed version numbers.
- [ ] **403 warn+skip:** a mocked 403 on `getPage` → `Forbidden`; the caller (E3-S6) skips, never deletes.
- [ ] **Attachment 400 = skip signal (H4):** uploading a duplicate filename → the adapter returns "already exists" (not an error); update-via-`/data` bumps version on changed bytes.
- [ ] **Properties v2 (H2):** `putProperty` stores a string value; `getProperty` reads it back byte-equal; ~8KB works.
- [ ] **429 backoff:** a mocked 429 with `Retry-After: 1` → the client waits then retries (max 3); exhausted → `RateLimited` error.
- [ ] **INV-SEC-1:** no redacted log/request/response artifact contains the token (grep the captured mock logs).
- [ ] **NFR-SEC-3 (no outbound telemetry):** the adapter issues `fetch` ONLY to the configured `baseUrl`; a test asserts no request targets any other host (local-first, privacy).
- [ ] `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | 409 parse (version extraction), 400-dup mapping, URL builders, redaction of request/response logs, backoff timing (fake timers) |
| Integration | full `TargetSystem` against a `Bun.serve` mock simulating v2/v1, 200/409/403/400/429 paths; property round-trip; attachment upload+update+dup |
| E2E | (wired by E5-S1) real sandbox page CRUD + 409 + attachments |

## Definition of Done
`TargetSystem` port implemented for Confluence Cloud; all v2/v1 distinctions isolated; 409/403/400-dup/429 handled per spike facts; boundary enforced; no token leaks. AC list is the DoD.

## Out of scope
- The plan/apply orchestration (E3-S6).
- Drift classification logic (E3-S5) — the adapter fetches remote state; the classifier compares.
- Reverse conversion Storage→Markdown (MS-0005+).
- Data Center (MS-0009).
- OAuth (post-MS-0002).

## Risks / open questions (CEO-resolved)
- **R1:** Confluence API drift/deprecation. → Nightly live-smoke (E5-S1) + weekly deprecation-feed check; revisit trigger in ADR-0005. Not blocking MS-0002. CEO-recorded.
- **R2:** Permission asymmetry (R-FEA-10). → 403→warn+skip; `doctor` (E5-S2) surfaces visibility gaps. Assume operator has space-owner read access. CEO-recorded.
