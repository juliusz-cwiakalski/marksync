---
id: MS2-E1-S2
title: "version-message-limit"
status: todo
type: spike
priority: high
epic: MS2-E1
milestone: MS-0002
estimate: 0.5d
gh_issue: GH-12
feature_spec: doc/spec/features/feature-safe-publish.md
decisions: [ADR-0010]
dependencies: { blocks: [MS2-E3-S6], blocked_by: [] }
cross_cutting: []
---

# MS2-E1-S2 — Confluence version.message length limit spike

## Goal
Determine the **exact usable length limit** of the Confluence Cloud page `version.message` field via live API testing, so ADR-0010 squash provenance formatting and deterministic trimming can be implemented without guessing.

## Background & why this gates other work
ADR-0010 (squash provenance) requires each MarkSync-applied page version to carry a `marksync:squash commit=<sha> ...` prefix + a compact included-commit summary in `version.message`. ADR-0010 + NFR-REL-11 explicitly forbid guessing the limit; **E3-S6 (sync engine) and E4-S3 (provenance) are blocked until this is known.** Atlassian docs do not specify `maxLength`.

## Blueprint / credential source
- **Pre-provisioned sandbox credentials** are at `doc/inception/tmp/confluence-api-validation-spike/.env` (local, gitignored, contains a real classic API token for the `marksyncte` sandbox space). **Use this .env directly — do NOT ask for credentials.**
- The spike blueprint repo already has a working redacted HTTP client + sandbox space lifecycle (`.../AGENTS.md`, `.../src/`). **Reuse it**; rewrite, don't copy verbatim.
- Follow the blueprint's safety rules: sandbox-only writes, redact at the boundary, honor 429 backoff, tear down created pages.

## Hypotheses (H) & stop criteria
- **H1 (acceptance threshold):** discover the smallest rejected length (binary search) for `version.message` on a page update. Record: the accepted max, the rejected min, and the exact HTTP status + error body shape on rejection.
- **H2 (truncation behaviour):** does Confluence silently truncate over-limit messages, or reject the whole update? (Determine which.)
- **H3 (ADR-0010 format viability):** confirm the canonical format `marksync:squash commit=<40-char-sha> branch=<name> path=<path>` (≈90–130 chars) plus a compact 5-commit summary fits comfortably under the limit; record how many `commit=<sha8> <subject>` entries fit.
- **H4 (deterministic trim marker):** confirm that a `+M more` truncation marker is preserved verbatim (not stripped/sanitized) by Confluence.

## Methodology (exact steps)
1. Work inside the existing spike blueprint dir OR a new `spikes/version-message/` that imports the blueprint's `client.ts`. Load `.env` from the blueprint path.
2. Create one test page in `marksyncte` (v1).
3. **Binary search** the length: send page updates with `version:{number:N+1, message:"x".repeat(L)}` for L in a shrinking window (start 1, 1000, 10000, 100000) until you bracket accept/reject. Capture status + body for the first rejection.
4. Test H2: just-over-limit message — observe truncate-vs-reject.
5. Test H3: post the canonical ADR-0010 format + 5, 10, 20, 50 compact commit lines; record what survives.
6. Test H4: post a message containing `+99 more` and read it back; confirm byte-equal.
7. **Redact** every recorded request/response (strip `Authorization`, token, email). Self-audit: `rg -i 'ATATT|authorization|bearer|@' findings/` must return nothing.
8. Delete all created pages (cleanup).

## Deliverables
- `findings/version-message-spike-findings.md` (committed): H1–H4 PASS/FAIL + the **number** (e.g. "accepted at N, rejected at M; behaviour = reject").
- A **trim policy** paragraph consumed by E3-S6/E4-S3: given the limit L and the prefix P, how many commit lines fit, and the exact `+M more` marker format.
- Update ADR-0010 "Unresolved Questions" (length limit; trim format) with the verified answers. Close NFR-REL-11.

## Acceptance criteria (testable)
- [ ] H1: the exact accepted-max / rejected-min length is documented with evidence pointers (redacted JSON).
- [ ] H2: truncation-vs-reject behaviour documented.
- [ ] H3: the canonical ADR-0010 format is confirmed viable (fits) OR ADR-0010 is amended with a concrete shorter format.
- [ ] H4: trim-marker preservation confirmed.
- [ ] Findings doc written; ADR-0010 unresolved questions closed; NFR-REL-11 satisfied.
- [ ] No secret in any committed artifact; sandbox pages cleaned up.

## Out of scope
- Implementing the provenance formatter (that is E4-S3 / E3-S6).
- Testing `version.message` on Data Center (Cloud only for MS-0002).

## Risks / open questions (CEO-resolved)
- **R1:** If the limit is very small (< ~100 chars), the ADR-0010 format must shrink. → CEO decision: drop the per-commit summary from `version.message`, keep only `marksync:squash commit=<sha8>`; full summary stays in local plan output + `marksync.metadata` (commit count only). Record in ADR-0010.
- **Q1:** Whether `version.message` accepts multi-line (`\n`) content. → Test it; if rejected, use a single-line compact format. CEO-recorded.
