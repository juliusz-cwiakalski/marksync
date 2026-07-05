---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://www.x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: PHASE-3-RED-TEAM-REVIEW-ROUND-2
status: Draft
created: 2026-07-05
last_updated: 2026-07-05
owners: [Juliusz Ćwiąkalski]
area: inception
document_classification: review-output
links:
  related_pr: "https://github.com/juliusz-cwiakalski/marksync/pull/4"
  related_decisions: [ADR-0002, ADR-0006, ADR-0010, ADR-0011, PDR-0001, TDR-0002, TDR-0004]
  supersedes: [PHASE-3-RED-TEAM-REVIEW]
  summary: "Round-2 coordinated red-team assessment of Phase 3 / PR #4 after the 659f4d6 revision (ADR-0010 reversal, ADR-0002 amendments, decision reclassification, ADR-0011, architecture restructure)."
ai_assistance: "AI-assisted synthesis of specialist red-team reviews; final approval remains with Juliusz Ćwiąkalski."
---

# Phase 3 Red-Team Review — Round 2 (post-revision)

This document synthesizes the second red-team pass over Phase 3 / PR #4 after
commit `659f4d6` ("doc: inception phase 3 — address owner PR review, red-team
findings, decision reclassification"). Round 1 produced a BLOCK verdict; the
owner addressed all P0 items and most P1 items, then requested a second pass "to
be on a safe side." The coordinator did not re-review from scratch — this pass
focuses on (a) the latest-commit changes, (b) holistic cross-document coherence,
and (c) whether round-1 resolution claims are accurate.

## Red Team Review Plan (Round 2)

**Material:** Phase 3 inception artifacts in PR #4 as of commit `659f4d6`.

**Type:** mixed — architecture docs, technical/product/technology decisions,
documentation consistency, security/privacy implications, and traceability.

**Scope note:** Round 2 is intentionally narrower than round 1. The panel is
smaller (8 specialists vs. 11) because the load-bearing strategic debates
(language choice, Storage vs ADF, spike gating, state model shape) are settled.
The remaining risk surface is propagation: did the amendments and the ADR-0010
reversal reach every canonical artifact? The answer, summarized below, is "no,
not yet."

### Selected Reviewers

| Reviewer | Reason | Focus Scope |
|---|---|---|
| `red-team-cto` | Architecture restructure (TargetSystem port, C4 L3, ADR-0011) needs architectural review. | New port boundary, output-pipeline architecture, ADR-0011 reasoning, diagram integrity. |
| `red-team-typescript-dev` | TDR-0002 (Cliffy rc.7→1.x correction), TDR-0004 (happy-dom/benchmarks), ADR-0002 (security requirements, two-layer split). | Stack-record accuracy, smoke-gate operationalization, ADR-0002 amendments, tech-stack cross-references. |
| `red-team-business-analyst` | Decision reclassification (ADR→PDR/TDR) and traceability must be checked end-to-end. | Reclassification completeness, `inception-state.yaml`, open-questions incorporation notes, frontmatter `related_decisions`. |
| `red-team-technical-writer` | Round-1 stale-reference resolution must be verified, plus new amendments may have introduced fresh staleness. | Cross-reference accuracy, last_updated hygiene, README/roadmap/ADR internal consistency. |
| `red-team-security-officer` | ADR-0010 reversal changes the privacy posture; ADR-0011 redaction; ADR-0002 security section. | Privacy net-impact of squash reversal, redaction enforceability, ADR-0011 error-representation gap. |
| `red-team-sre` | ADR-0010 reversal changes rate-limit posture; ADR-0006 concurrency wording fix must be verified. | Write-volume reduction, concurrency terminology propagation, stale-plan window assumption. |
| `red-team-domain-expert` | REMOTE_MISSING/MISSING was a round-1 High finding; ubiquitous language must be unified. | State-name unification, `version.message` provenance terminology, INV-SAFE-2 naming. |
| `red-team-qa-engineer` | ADR-0010/ADR-0011 verification criteria and TDR-0004 test-design guardrail. | Testability of new criteria, missing negative tests, contract-test enforceability. |

### Not Selected (with rationale)

| Reviewer | Why Not |
|---|---|
| `red-team-ceo` | No new strategy/market decision; round 1 covered strategy and nothing in 659f4d6 changes the wedge. |
| `red-team-cfo` | No pricing/budget change; round-1 deferred release-cost items to Phase 4. |
| `red-team-product-manager` | ADR-0010 reversal is scope-discipline-positive (smaller `MS-0002`); product risk drops. CTO + BA cover the scope signal. |
| `red-team-customer-success` | No user-facing workflow copy changed; PDR-0001 web-presence note is forward-looking, not an onboarding change. |
| `red-team-marketing` | PDR-0001 web-presence amendment is minor and pre-launch; no GTM material changed. |
| `red-team-sales` | No commercial/demo change. |
| `red-team-ux-designer` | No interaction design; ADR-0011 covers CLI output at the architecture level (CTO + QA review). |
| `red-team-devops-engineer` | Round-1 DevOps P1 items (CI baseline, signing gate) were explicitly deferred to Phase 4; no new DevOps claim in 659f4d6. |
| `red-team-legal-counsel` | PDR-0001 web-presence / package-name amendment is a minor expansion of the existing trademark posture; legal risk is unchanged from round 1. Worth re-engaging before `MS-0008`. |
| `red-team-java-dev` / `red-team-python-dev` / `red-team-go-dev` / `red-team-bash-dev` / `red-team-data-engineer` | No code or data-model artifact in scope. |

### Coverage Gaps

- No Bun-runtime / release-engineering specialist (same gap as round 1).
- No Atlassian-platform specialist — the `version.message` length spike
  (UNCERT-3) still needs live validation before `MS-0002` implementation.
- No dedicated Mermaid/security-rendering specialist; the ADR-0002 Security
  Requirements section is well-cited but the malicious-input fixture suite is
  not yet enumerated (cross-reference gap with TDR-0004).

---

## Red Team Collective Assessment

### Overall Verdict: REWORK (narrow) — close, but not merge-ready as current truth

The 659f4d6 revision materially improves Phase 3: the ADR-0010 reversal is a
correct scope-discipline move, the ADR-0002 two-layer split + security section
is the right shape, the reclassification aligns the registry with the ADOS
guide, and ADR-0011 is a well-reasoned output strategy. The architecture
restructure around the `TargetSystem` port is sound.

**However**, the revision propagated its changes to roughly 70–80% of the
canonical artifact surface, leaving several high-traffic documents internally
contradictory or stale. The most damaging are:

- **ADR-0006 contradicts itself** on the sync-granularity default (body says
  commit-by-commit, unresolved-questions says squash) — ADR-0006 is the safety
  foundation and an implementer reading the body would build the wrong thing.
- **`inception-state.yaml` is wholesale stale** — still references ADR-0007/8/9
  and ADR-0003 (pre-reclassification IDs) and still records "commit-by-commit by
  default" as a Phase 3 decision.
- **`phase-3-open-questions.md` OPEN-Q6** still records commit-by-commit as the
  "Adopted decision" with no amendment note — the canonical Q&A artifact is
  wrong about the most-reversed decision of the phase.
- **The REMOTE_MISSING/REMOTE_MISSING split is NOT resolved** — 6+ files still
  use REMOTE_MISSING despite round-1's resolution claim. Round-1's resolution
  table is itself inaccurate.

None of these are strategic problems. They are propagation failures. They are
fixable in a single follow-up commit without re-opening any debate. Until that
commit lands, the Phase 3 artifacts should not be merged as current truth,
because an implementer or AI agent tracing from any of these entry points would
follow a stale contract.

This is a narrower REWORK than round 1's BLOCK. The strategic debates are
settled. What remains is mechanical consistency.

### Consensus Findings (flagged by 2+ reviewers)

#### 1. ADR-0010 reversal propagation is incomplete

**Flagged by:** `red-team-business-analyst`, `red-team-technical-writer`,
`red-team-sre`, `red-team-security-officer`, `red-team-qa-engineer`

- **Impact:** The reversal was correctly applied to ADR-0010 itself,
  `00-index.md`, the architecture overview, the NFR register (NFR-REL-9,
  NFR-REL-11), and the round-1 red-team report's resolution table. It was NOT
  applied to:
  - `doc/decisions/ADR-0006…md` line 244 — body still says "Default sync
    granularity = commit-by-commit … for N commits since the last sync,
    MarkSync creates N page versions, each carrying its commit SHA and Git
    commit message in `version.message`". This **directly contradicts** ADR-0006
    line 290 (Unresolved Questions: "squash by default for `MS-0002`"). It is
    the most dangerous stale claim in the PR because ADR-0006 is the
    safety-model anchor.
  - `doc/inception/inception-state.yaml` line 76 ("commit-by-commit provenance
    via version.message") and line 80 ("Confluence page history provenance =
    commit-by-commit by default, squash opt-in"). Line 94's Phase 3 retro note
    also still describes "commit-by-commit provenance".
  - `doc/inception/open-questions/phase-3-open-questions.md` line 102
    ("**Adopted decision:** commit-by-commit **by default**") and line 107's
    incorporation note ("records commit-by-commit by default, squash opt-in").
    The status still reads `ANSWERED` with no amendment note.
- **Action:** Single follow-up commit that updates the four sites above to
  reflect the squash default. The OPEN-Q6 entry should keep the original answer
  for provenance but add an "Amended 2026-07-05" note pointing to ADR-0010
  revision history (do not rewrite the historical answer — annotate it).

#### 2. REMOTE_MISSING vs REMOTE_MISSING ubiquitous-language split is NOT resolved

**Flagged by:** `red-team-domain-expert`, `red-team-business-analyst`,
`red-team-technical-writer`, `red-team-qa-engineer`

- **Impact:** Round-1's resolution table claims "REMOTE_MISSING→REMOTE_MISSING"
  was resolved. It was not. The current state:
  - `REMOTE_MISSING` (newer term): `architecture-overview.md` line 93, ADR-0006
    lines 300 & 312.
  - `REMOTE_MISSING` (older term, still present): `02-roadmap.md` lines 68 & 259,
    `id-prefix-catalog.md` line 58 (the INV-SAFE-2 definition itself),
    `TDR-0004-testing-runner.md` line 75, `nonfunctional.md` line 58 (NFR-REL-6),
    `fse-audit.md` line 47 (`RemoteMissing` error name), and the round-1
    red-team report line 237 (flagged-but-not-fixed).
  - The split is a domain-integrity failure on a release-blocking invariant
    (`INV-SAFE-2`). It also bleeds into the typed-error taxonomy
    (`RemoteMissing`) and the NFR register, so it cannot be brushed off as a
    doc-only nit.
- **Action:** Pick one canonical term and update all sites. `REMOTE_MISSING` is
  preferable because it is neutral about cause (deleted vs never-existed vs
  permission-asymmetry-hidden per UNCERT-4 / R-FEA-10), whereas
  `REMOTE_MISSING` over-claims the cause and will mislead the permission
  asymmetry handling. Update the id-prefix-catalog first (it is the term
  authority), then cascade to the roadmap, NFR, fse-audit, and TDR-0004.

#### 3. Reclassification propagation is incomplete in traceability artifacts

**Flagged by:** `red-team-business-analyst`, `red-team-technical-writer`

- **Impact:** The reclassification (ADR-0003→PDR-0001, ADR-0004→TDR-0001,
  ADR-0007→TDR-0002, ADR-0008→TDR-0003, ADR-0009→TDR-0004) was correctly
  applied to the renamed files, `00-index.md`, `architecture-overview.md`,
  `01-north-star.md`, and most of `02-roadmap.md`. It was NOT applied to:
  - `doc/inception/inception-state.yaml` lines 77–79 (ADR-0007/0008/0009),
    line 92 (ADR-0003), and line 94's Phase 3 retro note (ADR-0007/0008/0009).
    `inception-state.yaml` is the bootstrapper's input and is read by every
    downstream agent.
  - The migration notes inside ADR-0002 (line 66), ADR-0005 (line 66), PDR-0001
    (line 66), and TDR-0001 (line 65) all still say: "Records are numbered in
    one sequence (ADR-0001…) regardless of `decision_type`." After
    reclassification this statement is **false** — each type now has its own
    sequence per `00-index.md` and the decision-making guide. The migration
    notes need an update.
  - `doc/decisions/README.md` (the small per-folder readme) was not inspected in
    this round; worth a quick check.
- **Action:** Bump the four migration notes with a 2026-07-05 sentence noting
  the reclassification, and update `inception-state.yaml` to current IDs.

#### 4. Round-1 resolution table over-claims resolution status

**Flagged by:** `red-team-business-analyst`, `red-team-technical-writer`,
`red-team-domain-expert`

- **Impact:** `phase-3-red-team-review.md` line 87 says "Consensus #3
  (stale/contradictory docs) RESOLVED — README Go CLI fixed …;
  ADR-0006 lease wording fixed; content-property key standardized;
  REMOTE_MISSING→REMOTE_MISSING." Of those four sub-claims:
  - **ADR-0006 lease wording** — TRUE; verified by diff (all instances updated).
  - **Content-property key standardized** — TRUE; `marksync.metadata` is
    canonical per `integration-scenarios/10-content-properties.md` line 59.
  - **README Go CLI fixed** — PARTIALLY TRUE; README line 156 was fixed
    (TypeScript + Bun single-binary) but **line 361 still says "Ports-and-adapters
    architecture in Go"** — stale.
  - **REMOTE_MISSING→REMOTE_MISSING** — FALSE; see Consensus #2 above.
  The resolution table being wrong about its own resolutions erodes the audit
  trail. Future readers will trust the "RESOLVED" label and stop looking.
- **Action:** Update the round-1 resolution table to reflect partial-resolution
  status honestly, and add a "round-2 follow-up" column pointing to this file.

#### 5. Cliffy version is inconsistent between the stack record and the TDR

**Flagged by:** `red-team-typescript-dev`, `red-team-technical-writer`

- **Impact:** `doc/overview/tech-stack.md` line 54 still pins Cliffy at
  `v1.0.0-rc.7`. The amended TDR-0002 (and its Revision History at line 383)
  explicitly corrected this to stable 1.x (latest verified `v1.2.1`, June 2026),
  downgraded C-1 to "expected, pending smoke test", and reframed the risk from
  "pre-1.0 instability" to "smaller ecosystem + continuously smoke-tested Bun
  compile". An implementer reading `tech-stack.md` first would pin the wrong
  version and write the wrong smoke test.
- **Action:** Update `tech-stack.md` line 54 to "stable 1.x (pin post
  smoke-test per TDR-0002)". While there, update the alternatives table
  (`tech-stack.md` line ~128) to reflect the wider alternative set Cliffy is
  now compared against (TDR-0002 lists 10 alternatives; the tech-stack
  alternatives table lists only `commander` / `citty` / `clipanion`).

### Critical Findings by Domain

#### Architecture / CTO

- **High — ADR-0011 Alt-2 vs Alt-3 matrix does not differentiate.** In the
  per-alternative constraint-compliance table (ADR-0011 lines 148–153), Alt 2
  (structured result + generic renderers only) and Alt 3 (hybrid with optional
  per-command human formatter) both score ✅ across all five constraints. The
  differentiator (Alt 2's generic human output is uglier) is described only in
  prose, not in the matrix. This weakens the decision audit trail: a future
  reviewer challenging "why not Alt 2?" cannot read the answer off the matrix.
  Suggest adding a C-6 "human-output quality where it matters" row, or
  upgrading the Alt-2 prose cons into an explicit matrix marker.
- **Medium — ADR-0011 NDJSON streaming implies hidden command architecture.**
  ADR-0011 line 240 notes that "NDJSON streaming requires commands to produce
  results incrementally (not all commands benefit)". This is a real coupling
  between the output strategy and command-orchestration architecture (the
  command must be a stream/iterator, not a synchronous function). The
  architecture overview does not mention this requirement; the Output service
  row says only "Structured + human output, exit codes, redaction".
  Recommend adding a note to the architecture-overview Output service row.
- **Medium — C4 L3 diagram uses `&` fan-out syntax that some Mermaid renderers
  parse inconsistently.** Lines 155 (`App --> Hierarchy & Link & State & MD &
  Asset & MermaidMgr`) and 161 (`Hierarchy --> Link`) — the `&` shorthand works
  in current Mermaid but is worth a smoke-test before publishing. ADR-0002
  flags Mermaid version drift as a real risk.
- **Low — ADR-0011 AI-agent operability claim is under-specified.** The ADR
  lists "AI-agent operability" as a driver but does not address schema
  discovery, versioning negotiation, or the error-shape contract that agents
  need to consume JSON reliably. The "Unresolved Questions" list touches error
  representation but not agent-facing schema discovery. A forward pointer to a
  future "agent contract" decision would close the loop.
- **Positive — TargetSystem port is the right restructure.** Promoting the
  adapter boundary to an explicit domain port aligns the architecture with
  PDR-0001's multi-adapter framing and keeps Confluence specifics confined to
  `src/infra/confluence/`. The C4 L3 diagram makes the seam visible. This is a
  net improvement over round 1.

#### TypeScript / Runtime

- **High — `tech-stack.md` Cliffy pin is stale (see Consensus #5).** Must be
  fixed before merge.
- **Medium — `keytar` spike-gating is correctly applied** in `tech-stack.md`
  line 63 ("Spike-gated … Env-token path is the guaranteed `MS-0002` fallback").
  This resolves round-1 P1 #4 cleanly.
- **Medium — ADR-0002 maturity table has future-dated figures.** Line 145
  claims "latest release **11.16.0**" for Mermaid and line 332 cites a June
  2026 `mmdc` discussion. The ADR does caveat these ("re-verify against live
  registries"), so this is acceptable but should be re-verified before
  implementation.
- **Low — TDR-0002 line 67 references `@cliffy/commander`** but the actual
  package is `@cliffy/command`. Minor typo in the Context section.
- **Positive — TDR-0002 amendments are strong.** The correction from rc.7 to
  stable 1.x, the explicit C-1 downgrade to "expected, must be verified" with
  the compile-smoke gate as a prerequisite, and the wider alternative set
  (Cliffy / citty / commander / clipanion / yargs / cac / Crust / oclif /
  Clerc / Bunli) are exactly the rigor the decision deserved.
- **Positive — TDR-0004 amendments are strong.** Downgrading benchmark claims
  to "directional external" + adding the repo-local benchmark gate is the right
  epistemic move. The AI-agent over-mocking guardrail (with arXiv citations)
  is excellent and operationalized in the implementation plan. The happy-dom
  default path is well-justified against the Vitest #4145 escape hatch.

#### Security / Privacy

- **High — ADR-0010 reversal is a net privacy win, but the truncation
  fallback reduces the win.** ADR-0010 line 205 specifies that when the squash
  summary must be trimmed for `version.message` length, "the full list is
  available in plan/apply output and `marksync.metadata`". The `marksync.metadata`
  content property is per-page and readable by anyone with page access — so the
  full included-commit list (with potentially sensitive commit subjects:
  internal ticket URLs, customer names, incident IDs) still gets published to
  Confluence, just via a different channel. The privacy win is real but
  smaller than the ADR implies. Recommend either (a) applying the same
  truncation policy to `marksync.metadata` (store only head SHA + count, not
  the full list), or (b) making the full list opt-in via a config flag.
- **Medium — ADR-0011 error-representation unresolved question is
  security-relevant.** ADR-0011 line 246 leaves open "How should errors be
  represented in JSON output — a top-level `error` field vs. an error exit
  code + stderr JSON?" Error messages are a classic secret-leakage vector
  (file paths, account info, partial request bodies). This question should be
  answered with an explicit tie to NFR-SEC-1/NFR-SEC-2 (no secrets in any
  output; redaction by construction) before `MS-0002` implementation.
- **Positive — ADR-0002 Security Requirements section is strong.**
  `securityLevel: "strict"` default, `htmlLabels: false`, SVG sanitization,
  no external resource loading, and a malicious-input fixture suite — all
  correctly cited against Mermaid's 2025–2026 advisories. This is a
  material improvement over round 1.
- **Gap — the ADR-0002 malicious-input fixture suite is not cross-referenced
  from TDR-0004.** TDR-0004's golden-fixture tier covers the Storage renderer;
  it does not explicitly reference the Mermaid malicious-input fixtures that
  ADR-0002 requires. Add a cross-reference so the test-design guardrail in
  TDR-0004 visibly inherits the ADR-0002 security fixtures.

#### SRE / Reliability

- **High — 02-roadmap.md still says "repository/target lease" (line 69).**
  The lease→optimistic-concurrency fix was applied inside ADR-0006 but NOT
  propagated to the roadmap. This revives a round-1 consensus finding under a
  new file path. Line 69: "Concurrency control for CI-first operation:
  per-target serialization + **repository/target lease** + operation-ID
  deduplication + stale-plan expiry …". Should read "decentralized optimistic
  concurrency (Confluence 409 + operation-ID dedup + stale-plan expiry + CI
  concurrency-group templates)" per ADR-0006.
- **Medium — Stale-plan window (15 min) is an unvalidated assumption.**
  ADR-0006 line 237 sets a default 15-min stale-plan window but flags it as
  "assumed; confirm". This interacts with CI runner queueing and Confluence
  burst limits: too short → flaky failures; too long → stale-overwrite window.
  It is correctly listed as an unresolved question but should be a named spike
  in `MS-0002` (alongside the `version.message` length spike).
- **Positive — ADR-0010 reversal is a net reliability win.** 1 write per
  changed page per sync eliminates the write-amplification / burst-limit /
  page-history-UI-bloat interaction that round 1 flagged. C-3 (rate/burst
  safe) is now satisfied cleanly.

#### Domain / Ubiquitous Language

- **Critical — INV-SAFE-2 naming is split** (see Consensus #2). The
  id-prefix-catalog — the term authority — defines INV-SAFE-2 as "no silent
  re-create of REMOTE_MISSING". The architecture overview and ADR-0006 use
  REMOTE_MISSING. An invariant's name is its contract; splitting it across two
  terms is a domain-integrity failure.
- **Medium — `version.message` provenance terminology is consistent.** The
  round-1 split between `marksync.metadata` and `marksync.metadata.v2` is
  resolved (`integration-scenarios/10-content-properties.md` line 59 documents
  the canonical key with a rationale). The squash-summary shape (head SHA +
  compact included-commit list + truncation marker) is consistent across
  ADR-0010, the architecture overview, and NFR-REL-9.
- **Low — ` Kovetskiy/mark` collision is consistently cited.** PDR-0001
  correctly handles both the prominent collision (`kovetskiy/mark`) and the
  minor collision (`yh1224/marksync`) with appropriate mitigation.

#### QA / Testability

- **High — ADR-0010 lacks a negative scope-creep test.** Verification
  criteria cover what squash mode must do, but do not include a test asserting
  that `MS-0002` does NOT create N versions per sync even when invoked with
  flags that might be confused with commit-by-commit (e.g., a `--full-history`
  flag added later). Given that commit-by-commit is a future opt-in, a
  negative test now would prevent silent scope creep.
- **Medium — ADR-0011 "no central coupling" verification is not testable as
  written.** "A new command is added with zero changes to any output adapter
  file" is a code-review/lint check, not a runtime test. Recommend converting
  to a CI lint pattern (e.g., `rg 'CommandResult' src/cli/output/` returns
  zero command-specific references) similar to TDR-0002's
  `rg '@cliffy' src/app src/domain src/infra` lint.
- **Medium — fse-audit.md line 55 still says "Testing runner choice (Bun
  built-in vs vitest) unresolved (OPEN-Q4)".** TDR-0004 is now a Proposed
  decision; this audit row should reflect that the sub-decision is settled
  (subject to the ADR-0002 spike for the Mermaid-DOM path).
- **Positive — TDR-0004 AI-agent over-mocking guardrail is excellent.** The
  arXiv-cited empirical evidence + the explicit "lifecycle invariants must be
  validated through integration or E2E paths, never through mocks alone" rule
  is the right defense against the round-1 concern about AI-generated false
  confidence.

### Conflicts and Tensions

- **Auditability vs privacy (reopened, narrower):** ADR-0010 reversal resolved
  the headline tension (no full commit messages in page history by default),
  but the truncation-fallback path still publishes the full included-commit
  list to `marksync.metadata`. Security wants the fallback tightened; CTO
  accepts it as a documented trade-off. **Suggested resolution:** apply the
  same truncation policy to `marksync.metadata` (head SHA + count + truncation
  marker), or make the full-list publication opt-in. Cheap to do now; harder
  to retrofit.
- **NDJSON streaming vs command architecture:** ADR-0011's NDJSON option
  presumes commands can produce incremental results. This is a forward
  reference to a command-architecture decision that has not been made. CTO
  treats it as a future option; QA flags it as an implicit contract.
  **Suggested resolution:** add a note to the architecture overview that
  streaming commands (if/when added) must be iterator-based, and gate NDJSON
  behind that future decision.
- **Round-1 resolution accuracy vs momentum:** the owner wants to finalize
  Phase 3; the BA/TW panel insists on correcting the round-1 resolution table
  before merge. **Suggested resolution:** the corrections are small
  annotations, not re-opens; do them in the same propagation commit as
  Consensus #1–#3.

### Prioritized Action Items

**P0 — must fix before merge (propagation commit, no strategic re-open):**

1. **Fix ADR-0006 internal contradiction.** Update line 244 (Provenance in
   Confluence page history, body Decision section) to describe squash as the
   `MS-0002` default, matching ADR-0006 line 290 and ADR-0010. (Owner: technical
   writer + CTO.)
2. **Update `inception-state.yaml`.** Replace ADR-0007/0008/0009 with
   TDR-0002/0003/0004 (lines 77–79, 94); replace ADR-0003 with PDR-0001
   (lines 92, 94); update the sync-granularity text (lines 76, 80, 94); bump
   `last_updated` to 2026-07-05. (Owner: business analyst.)
3. **Amend `phase-3-open-questions.md` OPEN-Q6.** Keep the original answer for
   provenance; add an "Amended 2026-07-05" note recording the reversal and
   pointing to ADR-0010 revision history; update the incorporation note.
   (Owner: business analyst.)
4. **Unify REMOTE_MISSING → REMOTE_MISSING** across `id-prefix-catalog.md`
   (the term authority), `02-roadmap.md`, `nonfunctional.md` (NFR-REL-6),
   `fse-audit.md` (`RemoteMissing` → `RemoteMissing`), and `TDR-0004` line 75.
   (Owner: domain expert.)
5. **Fix `tech-stack.md` line 54 Cliffy pin** to "stable 1.x (pin post
   smoke-test per TDR-0002)"; refresh the alternatives table to match
   TDR-0002's wider alternative set. (Owner: typescript-dev.)
6. **Fix `README.md` line 361** ("Ports-and-adapters architecture in Go" →
   "TypeScript"). (Owner: technical writer.)
7. **Fix `02-roadmap.md` line 69** ("repository/target lease" → decentralized
   optimistic concurrency per ADR-0006). (Owner: SRE.)
8. **Update the four migration notes** (ADR-0002 line 66, ADR-0005 line 66,
   PDR-0001 line 66, TDR-0001 line 65) — the "numbered in one sequence
   regardless of `decision_type`" claim is now false after reclassification.
   (Owner: technical writer.)

**P1 — should fix before merge (audit-trail integrity):**

9. **Correct the round-1 resolution table** (`phase-3-red-team-review.md` line
   87) — mark REMOTE_MISSING and README Go as partial; add a round-2 follow-up
   column. (Owner: business analyst.)
10. **Tighten ADR-0010 truncation fallback** — apply the same truncation policy
    to `marksync.metadata` or make full-list publication opt-in, to preserve
    the privacy win. (Owner: security + CTO.)
11. **Answer ADR-0011 error-representation unresolved question** with an
    explicit tie to NFR-SEC-1/NFR-SEC-2 (no secrets in any output, including
    JSON error objects). (Owner: security.)

**P2 — should fix soon (before `MS-0002` implementation):**

12. **Cross-reference ADR-0002 malicious-input fixtures from TDR-0004** so the
    test-design guardrail visibly inherits them. (Owner: QA.)
13. **Add a negative scope-creep test to ADR-0010 verification criteria**
    (assert `MS-0002` does NOT create N versions even under confusing flags).
    (Owner: QA.)
14. **Add a named stale-plan-window spike** to `MS-0002` planning alongside
    the `version.message` length spike. (Owner: SRE.)
15. **Convert ADR-0011 "no central coupling" verification** to a CI lint
    pattern. (Owner: QA + DevOps.)
16. **Refresh `fse-audit.md`** — bump `last_updated`; update line 55 (testing
    runner is no longer unresolved); update line 47 once REMOTE_MISSING is
    unified. (Owner: technical writer.)
17. **Bump `last_updated` frontmatter** in ADR-0006 (currently 2026-07-04, but
    the file was amended 2026-07-05), risks.md, assumptions.md. (Owner:
    technical writer.)

**P3 — nice to have:**

18. Add a C-6 row to ADR-0011 differentiating Alt 2 from Alt 3 on human-output
    quality.
19. Note in the architecture overview that streaming commands must be
    iterator-based (ADR-0011 NDJSON forward reference).
20. Smoke-test the C4 L3 diagram's `&` fan-out Mermaid syntax across target
    renderers.
21. Fix `TDR-0002` line 67 typo (`@cliffy/commander` → `@cliffy/command`).

### Coverage Gaps

- **Bun-specific compiled-binary behavior** still has no hands-on spike (same
  gap as round 1). TDR-0002's compile-smoke gate is the right control, but it
  is not yet run.
- **Confluence `version.message` length limit** (UNCERT-3) is unverified; the
  ADR-0010 fallback shape depends on it.
- **Atlassian permission-asymmetry live behavior** (UNCERT-4 / R-FEA-10) is
  unverified; the REMOTE_MISSING-vs-deleted distinction in the state
  classifier depends on it.
- **No legal-counsel pass on PDR-0001 web-presence amendment.** The
  `cwiakalski.com/marksync` → `marksync.cwiakalski.com` plan is reasonable but
  has not had a formal trademark review (correctly deferred to `MS-0008`).
- **No dedicated Mermaid-security-rendering pass.** ADR-0002's Security
  Requirements section is well-cited but the malicious-input fixture suite is
  not enumerated.

### Bottom Line

The 659f4d6 revision is a substantial improvement: the ADR-0010 reversal,
ADR-0002 two-layer split, decision reclassification, and ADR-0011 are all the
right moves. The architecture is now coherent at the strategic level. **What
remains is a propagation problem, not a design problem.** A single follow-up
commit addressing P0 items #1–#8 (all mechanical consistency, no re-opens)
would clear the merge gate. The headline risk is **not** that Phase 3 is
directionally wrong — it isn't — but that an implementer or AI agent tracing
from `ADR-0006` line 244, `inception-state.yaml`, or `phase-3-open-questions.md`
OPEN-Q6 would follow a stale contract and build commit-by-commit history
publication into `MS-0002`, silently undoing the privacy/scope win the
reversal was meant to secure. Fix the propagation, then merge.
