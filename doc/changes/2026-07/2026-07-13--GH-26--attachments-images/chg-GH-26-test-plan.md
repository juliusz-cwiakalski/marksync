---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: chg-GH-26-test-plan
status: Proposed
created: "2026-07-13"
last_updated: "2026-07-13"
owners: [Juliusz Ćwiąkalski]
service: marksync-cli
labels: [MS-0002, MS2-E4, safe-publish, attachments, security, path-traversal, idempotency]
version_impact: minor
summary: "Test plan for GH-26 attachments & images — path-traversal confinement (release-blocking), content-hash reuse (0 re-uploads, NFR-PERF-4), asset drift detection, format coverage (png/jpg/gif/svg/webp), remote-image pass-through, large-asset handling, and no secrets in output (INV-SEC-1)."
links:
  change_spec: ./chg-GH-26-spec.md
  testing_strategy: .ai/rules/testing-strategy.md
---

# Test Plan - [MS2-E4-S2] Attachments and images (GH-26)

## 1. Scope and Objectives

GH-26 makes local images render on Confluence by resolving them path-safely, content-hashing them, and wiring upload/reuse into the sync engine. This test plan ensures:

1. **Path-traversal confinement (release-blocking)** — `../../etc/passwd` (and absolute/symlink/URL-encoded/nested/root-prefix vectors) → `Forbidden { operation: "path-traversal" }`; **0** bytes read outside the configured root.
2. **Symlink defense (story R1)** — a symlink whose target escapes root is rejected after `realpath` canonicalization.
3. **Asset reuse / idempotency (NFR-PERF-4)** — unchanged image → `attachmentExists` true → **0** `uploadAttachment` calls.
4. **Asset drift detection** — changing only an image flips `SyncState` away from `NO_CHANGE`.
5. **Update on change** — changed bytes → new hash → new filename → fresh create (no `/data` call).
6. **Format coverage** — png/jpg/gif/svg/webp upload + reference correctly.
7. **Remote image pass-through** — `http(s)` → `<ri:url>`, 0 uploads.
8. **Pipeline integration** — a doc with a local image → Storage body references `marksync-asset-<hash>.<ext>`; attachment exists after apply.
9. **Naming-agreement invariant (DEC-1)** — domain `assetFilename()` === infra `attachmentFilename()` for non-SVG.
10. **Large-asset handling (story Q1)** — >25 MB warning; HTTP 413 → `TooLarge` per-document block; run continues (per-document isolation).
11. **No secrets in output (INV-SEC-1/NFR-SEC-1)** — 0 credential/token occurrences in any output path; filenames carry only the content hash + extension.

### 1.1 In Scope

- `AssetResolver` (`src/domain/assets/resolver.ts`) — path-safe root-confined resolution, symlink-aware, sha256 identity, HAST rewrite.
- Asset naming (`src/domain/assets/naming.ts`) — `assetFilename()` reconciled with infra `attachmentFilename()` (DEC-1).
- `computePlan` asset wiring — populate `ContentHash.attachmentHashes`; stash `Artifact[]` on `PlanEntry`.
- `applyPlan` upload wiring — upload-on-missing, reuse-on-exists; persist hashes into `PageBinding.attachmentHashes`.
- MIME derivation + format matrix.
- Unit tests: path-traversal vectors, symlink escape, naming determinism + infra-agreement invariant, hash stability, MIME map.
- Integration tests: resolver + mock target upload/reuse/update cycle; format matrix; remote-url pass-through; >25 MB warning + 413 → `TooLarge` per-doc block; asset drift flips `SyncState`.

### 1.2 Out of Scope & Known Gaps

- **Mermaid rendering** (E4-S1, NG-1) — `marksync-mermaid-` prefix reserved; manager deferred to MS-0003+ (CEO-DEC-1).
- **Remote image caching/proxying** (NG-2).
- **Attachment metadata editing** (NG-3).
- **The `/data` in-place update path** (NG-4 — unreachable by design; covered by a negative assertion).
- **Cross-page asset de-duplication** (NG-7).
- **E2E live-sandbox image upload** — E5-S1 (story test matrix defers E2E).

## 2. References

- **Change specification**: `chg-GH-26-spec.md` — authoritative AC, decisions, NFRs.
- **Story file**: `doc/planning/milestones/MS-2/MS2-E4--features/MS2-E4-S2--attachments-images.md` — test matrix + AC.
- **Testing strategy**: `.ai/rules/testing-strategy.md` — 6-tier strategy, over-mocking guardrail (domain logic must use real inputs/outputs, not mocks; mocks allowed for the `TargetSystem` boundary + fault injection).
- **Code style**: `.ai/rules/typescript.md`.
- **ADRs**: ADR-0005 (Storage Format), ADR-0006 (state model / attachmentHashes facet), ADR-0011 (redaction).
- **Existing infra under test (reused, not re-tested)**: `src/infra/confluence/attachments.ts` (`AttachmentService`), `src/infra/confluence/render/storage.ts` (`imageMacro`).
- **Existing test helpers**: `tests/_helpers/` (mock target factories, if present).

## 3. Coverage Overview

### 3.1 Functional Coverage (AC-#)

| AC ID | Description | TC ID(s) | Tier | Status |
|-------|-------------|----------|------|--------|
| AC-1 | Path-traversal confinement — multiple escape vectors → `Forbidden(path-traversal)`; 0 bytes read outside root | TC-UNIT-001..006 | Unit | To Implement |
| AC-2 | Asset reuse — unchanged → 0 `uploadAttachment` calls; changed → upload | TC-INTEGRATION-001 | Integration | To Implement |
| AC-3 | Update on change — new hash → fresh create; no `/data` call | TC-INTEGRATION-002 | Integration | To Implement |
| AC-4 | Format coverage — png/jpg/gif/svg/webp upload + reference | TC-UNIT-007, TC-INTEGRATION-003 | Unit + Integration | To Implement |
| AC-5 | Remote image → `<ri:url>`; 0 uploads | TC-UNIT-008, TC-INTEGRATION-004 | Unit + Integration | To Implement |
| AC-6 | Pipeline integration — doc with local image → `<ri:attachment>` with hash filename; exists after apply | TC-INTEGRATION-005 | Integration | To Implement |
| AC-7 | Asset drift — changing only an image flips `SyncState` from `NO_CHANGE` | TC-UNIT-009 | Unit | To Implement |
| AC-8 | Naming-agreement invariant — domain === infra for non-SVG | TC-UNIT-010 | Unit | To Implement |
| AC-9 | Large asset — >25 MB warning; 413 → `TooLarge` per-doc block; run continues | TC-INTEGRATION-006 | Integration | To Implement |
| AC-10 | No secrets in output — 0 tokens in body/filenames/plan/report/version.message | TC-UNIT-011 | Unit | To Implement |
| AC-11 | `bun run check` exits 0 | (quality gate) | All | To Implement |

### 3.2 NFR Coverage

| NFR | TC ID(s) |
|-----|----------|
| NFR-1 path-traversal confinement | TC-UNIT-001..006 |
| NFR-2 asset reuse (NFR-PERF-4) | TC-INTEGRATION-001 |
| NFR-3 asset drift detection | TC-UNIT-009 |
| NFR-4 symlink defense | TC-UNIT-006 |
| NFR-5 large-asset handling | TC-INTEGRATION-006 |
| NFR-6 no secrets in output (INV-SEC-1) | TC-UNIT-011 |
| NFR-7 format coverage | TC-UNIT-007, TC-INTEGRATION-003 |
| NFR-8 determinism | TC-UNIT-012 |
| NFR-9 per-document isolation | TC-INTEGRATION-006 |
| NFR-10 naming-agreement invariant | TC-UNIT-010 |

## 4. Test Strategy per Tier

Per `.ai/rules/testing-strategy.md`: **domain logic uses real inputs/outputs** (no mocked dependencies for the resolver itself); **mocks are allowed for the `TargetSystem` boundary and fault injection** (the 413, the attachment-exists/upload call counters). The over-mocking guardrail prohibits mocking the resolver to test the engine — the real resolver runs against a real temp filesystem.

### 4.1 Unit (bun:test) — `tests/unit/domain/assets/`

The `AssetResolver` is tested with a **real temp directory** (image fixtures written to disk) and an injectable `readBytes` hook only where confinement-read tracking is asserted. No `TargetSystem` mock here.

| TC ID | Scenario | Given / When / Then |
|-------|----------|---------------------|
| TC-UNIT-001 | Relative traversal `../../etc/passwd` | Given a doc at `<root>/docs/a.md` referencing `../../etc/passwd`; When `resolve(hast, docPath)`; Then `err(Forbidden, operation:"path-traversal")`; And the read hook was **never** invoked for the escaping path (0 bytes read). |
| TC-UNIT-002 | Absolute path `/etc/passwd` | Given a doc referencing an absolute path outside root; When resolve; Then `Forbidden(path-traversal)`; 0 reads. |
| TC-UNIT-003 | URL-encoded traversal `%2e%2e%2f` | Given a doc referencing an encoded `..`; When resolve; Then `Forbidden(path-traversal)` (decode is implicit in path resolution); 0 reads. |
| TC-UNIT-004 | Nested `..` reaching outside root | Given `<root>/docs/a.md` referencing `./../../outside.png`; When resolve; Then `Forbidden(path-traversal)`; 0 reads. |
| TC-UNIT-005 | Root-prefix trick (`/etc` as a prefix of `<root>`) | Given root `/tmp/x` and a target `/tmp/x-evil/secret` that shares a string prefix but not a path prefix; When resolve; Then `Forbidden(path-traversal)` (the prefix check uses `root + path.sep`, not a raw string `startsWith`); 0 reads. |
| TC-UNIT-006 | Symlink escape (story R1) | Given a symlink `<root>/img/evil.png → /etc/passwd`; When resolve (production default `realpath`); Then `Forbidden(path-traversal)`; 0 reads of `/etc/passwd`. |
| TC-UNIT-007 | MIME map | Given fixtures `.png/.jpg/.jpeg/.gif/.svg/.webp`; When resolve; Then each `Artifact.mime` is the correct `image/*`; And the filename extension matches. |
| TC-UNIT-008 | Remote image skipped | Given an `img` with `https://cdn/x.png`; When resolve; Then `AssetSet.artifacts` is empty; And the HAST node `src` is **unchanged** (rendered later as `<ri:url>`). |
| TC-UNIT-009 | Asset hash feeds drift | Given two `ContentHash` snapshots differing only in `attachmentHashes`; When classified; Then `SyncState !== NO_CHANGE`. (Pure classifier assertion; proves the wiring is meaningful.) |
| TC-UNIT-010 | Naming-agreement invariant (DEC-1) | For each non-SVG MIME, `assetFilename({hash, mime})` === infra `attachmentFilename({bytes, mime, hash})`. |
| TC-UNIT-011 | No secrets in filenames/output | Given an image whose bytes happen to contain a fake token; When resolve + render; Then the filename is `marksync-asset-<sha256>.<ext>` (sha256 of bytes, not the token string); And the rendered body + `AssetSet` JSON contain 0 token occurrences. |
| TC-UNIT-012 | Determinism | Same HAST + same bytes → identical `AssetSet` (same hashes, same filenames, same node rewrites) across repeated calls. |
| TC-UNIT-013 | In-doc dedup | A doc referencing the same image twice → one `Artifact`, both HAST nodes rewritten to the same filename. |

### 4.2 Integration (bun:test + mock `TargetSystem`) — `tests/integration/assets/`

A mock `TargetSystem` records `attachmentExists` / `uploadAttachment` calls (count + args) and can be programmed to return `exists=true/false` or `TooLarge`. The real `AssetResolver` runs against a real temp filesystem.

| TC ID | Scenario | Given / When / Then |
|-------|----------|---------------------|
| TC-INTEGRATION-001 | Reuse (NFR-PERF-4) | Given a Create plan with one asset whose hash the mock reports as existing; When `applyPlan`; Then `attachmentExists` called once; `uploadAttachment` called **0** times; binding.attachmentHashes populated; write-count for assets = 0. |
| TC-INTEGRATION-002 | Update on change (no `/data`) | Given a changed image (new hash, mock reports not-existing); When `applyPlan`; Then `uploadAttachment` called once (a fresh create); And **no** `/child/attachment/{attId}/data` request was issued (assert the mock saw no `/data` URL). |
| TC-INTEGRATION-003 | Format matrix | For each of png/jpg/gif/svg/webp: Given a doc with that image; When plan+apply; Then the rendered body references `marksync-asset-<hash>.<ext>` with the correct extension and the upload happened. |
| TC-INTEGRATION-004 | Remote pass-through | Given a doc with `https://cdn/x.png`; When plan+apply; Then body contains `<ri:url>`; `uploadAttachment` called 0 times. |
| TC-INTEGRATION-005 | Pipeline end-to-end | Given a doc with a local image on disk; When `computePlan` then `applyPlan`; Then the rendered body contains `<ri:attachment ri:filename="marksync-asset-<hash>.<ext>"/>`; And after apply the mock target's attachment list contains that filename; And `PageBinding.attachmentHashes` carries the hash. |
| TC-INTEGRATION-006 | Large-asset + per-document isolation | Given two docs in one plan: doc A has a >25 MB image (warn) and doc B has a normal image whose upload returns `TooLarge` (413); When `applyPlan`; Then a >25 MB warning is emitted; doc B blocks with `TooLarge`; doc A still applies (per-document isolation); run does not abort. |

### 4.3 Golden / Snapshot

No new golden fixtures required — the existing markdown-pipeline golden suite already covers `<ac:image>` rendering; this story changes the **filename** that flows into `imageMacro`, which is asserted via the integration tests above (not a new snapshot file). If the coder finds a clean golden fixture for "doc-with-image", they may add one, but it is not required.

### 4.4 BDD / E2E

- **BDD**: out of scope for GH-26. The lifecycle invariants (INV-SAFE-1/2/3, INV-SEC-1) are not altered by this story; their BDD coverage stays in E5-S1.
- **E2E**: the live-sandbox image upload + reuse scenario is deferred to E5-S1 per the story test matrix.

## 5. Test Data & Fixtures

- **Path-traversal fixture suite**: a set of HAST/docs each exercising one escape vector (TC-UNIT-001..006). Use a real temp root + a real `/etc/passwd`-equivalent sentinel file written under a sibling temp dir; assert the read hook never touches it.
- **Image byte fixtures**: small valid png/jpg/gif/svg/webp byte buffers (can be tiny 1×1 or minimal valid headers). For svg, a minimal `<svg>...</svg>`.
- **Large-asset fixture**: a >25 MB `Uint8Array` (synthetic; does not need to be a real image for the warning path) + a mock returning 413 for the per-doc-block path.
- **Token-in-bytes fixture**: an image whose bytes contain a fake token string (e.g. `AKIA...`) to prove the filename is the sha256 of bytes, not the token.

## 6. Exit Criteria

- All TC-UNIT-* and TC-INTEGRATION-* pass.
- AC-1 path-traversal suite passes with 0 bytes read outside root (asserted via the read hook).
- AC-2 reuse: `uploadAttachment` call count === 0 for an unchanged asset.
- AC-8 naming invariant passes.
- `bun run check` exits 0 (AC-11).
- No new flakiness (deterministic sha256; no timestamps/randomness in output).

## 7. Risks to the Test Suite Itself

- **Over-mocking the resolver**: per the guardrail, the resolver is tested with a real temp filesystem, not a mocked fs. The only mock surface is `TargetSystem` + the optional `readBytes` hook for the "0 bytes read" assertion.
- **Realpath in tests**: `realpath` on a symlink to a non-existent target can throw — the resolver must treat a `realpath` failure on the target as a confinement failure (reject), not a crash. TC-UNIT-006 covers the symlink-escape case; add a sibling case for a broken symlink if needed.
- **Cross-platform path separators**: the prefix check uses `path.sep`; tests run on Linux CI (POSIX). Do not hard-code `/` in the production check.
