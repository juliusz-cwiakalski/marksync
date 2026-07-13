---
id: MS2-E4-S2
title: "attachments-images"
status: done
type: story
priority: high
epic: MS2-E4
milestone: MS-0002
estimate: 2d
gh_issue: GH-26
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: []
dependencies: { blocks: [], blocked_by: [MS2-E3-S4, MS2-E3-S6] }
cross_cutting: [NFR-SEC-7]
---

# MS2-E4-S2 — Local images & attachments (content-hashed, path-safe)

## Goal
Discover local images referenced from Markdown, resolve them **path-safely** (no traversal), content-hash them, upload via the v1 attachment API (E3-S4), and **reuse unchanged attachments** (no re-upload). Emit `<ac:image><ri:attachment ri:filename="..."/></ac:image>` references.

## Background
The MS-0001 spike H4 validated the v1 attachment API and the **400-duplicate-filename = skip signal** (blueprint §0). Mermaid attachments (E4-S1) share the same content-hash + reuse mechanism; this story handles user-authored images/assets and the shared asset-resolver. Path safety is a security gate (NFR-SEC-7: no path traversal).

## Detailed scope (deliverables)
1. **`src/domain/assets/resolver.ts`** — `AssetResolver`: walk the Markdown AST (E3-S3) for image nodes; resolve each `![alt](path)` local path **relative to the doc** and **confined to the configured `root`** — reject `../` traversal outside root → `Forbidden{operation:"path-traversal"}`. Compute `sha256` of the bytes → identity.
2. **`src/domain/assets/naming.ts`** — attachment filename `marksync-asset-<first24(sha256)>.<ext>` (mirrors the mermaid scheme, blueprint §6). Content-addressed → unchanged asset = same filename = reused.
3. **Upload orchestration** — the sync engine (E3-S6) calls `attachmentExists(pageId, hash)`; if false → `uploadAttachment`; if true → reuse. Update-on-change via `/child/attachment/{attId}/data` (E3-S4). The 400-duplicate-filename response (spike H4) maps to "already exists → reuse" (handled in E3-S4; this story relies on that contract).
4. **Pipeline reference** — emit `<ac:image><ri:attachment ri:filename="marksync-asset-<hash>.<ext>"/></ac:image>` in the Storage body (the markdown pipeline emits the `ri:attachment` placeholder; this story resolves the filename).
5. **Remote images** — `![alt](https://...)` → `<ac:image><ri:url ri:value="..."/></ac:image>` (no upload; validated URL, https preferred). Out of scope: caching remote images.
6. **Format coverage** — test png, jpg, gif, svg, webp (the formats Confluence accepts).

## Technical approach
- Path confinement: resolve real path, assert it's under `root` real path (canonicalize both, prefix check).
- Hashing via `crypto.subtle` (no crypto lib).
- Reuse check via the E3-S4 `attachmentExists` (which the adapter implements by listing attachments + matching the hash-named filename).

## Interface contracts (what other stories consume)
- `AssetResolver` consumed by E3-S6 (sync engine resolves assets before write).
- Naming scheme shared with E4-S1 (mermaid).

## Acceptance criteria (testable)
- [ ] **Path safety (NFR-SEC-7):** a Markdown doc referencing `../../etc/passwd` → `Forbidden(path-traversal)`; never reads outside root.
- [ ] **Reuse (idempotency):** unchanged image → `attachmentExists` true → no upload call (mock target assertion); changed image → new hash → upload.
- [ ] **Update on change:** changed bytes → new content hash → new hash-derived filename → fresh attachment create (the `/data` in-place update is intentionally unreachable by design — hash-naming means changed bytes always produce a new filename).
- [ ] Format coverage: png/jpg/gif/svg/webp all upload + reference correctly.
- [ ] Remote image → `<ri:url>` reference, no upload.
- [ ] Pipeline: a doc with a local image → Storage body contains the `<ri:attachment>` with the hash filename; the attachment exists after apply.
- [ ] `bun run check` green.

## Test matrix
| Tier | This story |
|---|---|
| Unit | path-traversal rejection (multiple escape vectors), naming determinism, hash stability |
| Integration | resolver + mock target: upload/reuse/update cycle; format matrix; remote-url reference |
| E2E | (E5-S1) real sandbox image upload + reuse on 2nd sync |

## Definition of Done
Path-safe asset resolution; content-hash naming; upload/reuse/update via v1 API; image formats covered; pipeline references correct. AC list is the DoD.

## Out of scope
- Mermaid diagrams (E4-S1 — separate manager, shared scheme).
- Remote image caching/proxying.
- Attachment metadata editing (labels etc.) — minimal for MS-0002.

## Risks / open questions (CEO-resolved)
- **R1:** Symlinks escaping root. → Resolve symlinks (`realpath`) before confinement check; reject if the target escapes root. CEO-recorded.
- **Q1:** Large assets. → No hard cap for MS-0002 (Confluence enforces its own limit); warn on >25MB. Confirmed.
