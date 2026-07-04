---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
ados_distribution: project
id: PHASE-3-OPEN-QUESTIONS
status: Draft
created: 2026-07-04
last_updated: 2026-07-04
owners: [Juliusz Ćwiąkalski]
area: process
document_classification: current-truth
summary: "Phase 3 open questions — persisted in-git so answers are durable and reviewable. Answer inline; the bootstrapper incorporates answers into artifacts."
ai_assistance: "AI-assisted drafting; human-authored and approved by Juliusz Ćwiąkalski."
---

# Phase 3 Open Questions

_Open questions for inception Phase 3 (Tech stack & architecture). Each item has
a stable `OPEN-Q<N>` ID and a status. **To answer:** edit this file inline under
the `### Answer` heading for the relevant question, then the bootstrapper will
incorporate the answer into the affected artifacts (ADRs, tech-stack, etc.) and
flip the status to `ANSWERED`. New questions discovered during the phase are
appended with status `OPEN`._

_Status values: `OPEN` (awaiting answer) · `ANSWERED` (incorporated) · `DEFERRED` (parked for a later phase)._

---

## Answered this phase

### [OPEN-Q1] ADR migration home — ANSWERED

**Question:** ADR-0001…ADR-0005 were authored pre-inception in `doc/inception/decisions/` (`status: Proposed`). Should they be migrated into the canonical `doc/decisions/` now, or left in inception until `Accepted`?

### Answer
Yes — migrate to meet the ADOS structure → into `doc/decisions/`.

_→ Incorporated: ADR-0001…0005 moved to `doc/decisions/`; index updated._

---

### [OPEN-Q2] CLI framework — ANSWERED (→ ADR-0007)

**Question:** `tech-stack.md` recommended Cliffy. Confirm Cliffy, or pick another?

### Answer
Create a dedicated decision record for choosing the CLI stack, document options considered so far and recommendation. I'll evaluate and review the ADR (delegate to `@decision-advisor`).

_→ Incorporated: `doc/decisions/ADR-0007-cli-framework.md` (Proposed) recommends Cliffy; awaiting your review._

---

### [OPEN-Q3] Git adapter — ANSWERED (→ ADR-0008)

**Question:** Keep shell-Git (spec default) or switch to `isomorphic-git` for zero external runtime deps?

### Answer
Probably any user of this tool would already have git, but maybe it would be easier to integrate with some native library for better git handling (+ less dependencies, keep single binary). Create a decision record, list all the alternatives and recommend the best one (delegate to `@decision-advisor`) — I'll review the decision record in the pull request.

_→ Incorporated: `doc/decisions/ADR-0008-git-adapter.md` (Proposed) recommends shell-Git behind the `Repository` interface; awaiting your review._

---

### [OPEN-Q4] Testing runner — ANSWERED (→ ADR-0009)

**Question:** Bun built-in test runner vs vitest?

### Answer
No real preference here (no experience in this kind of setup). Create a decision record and properly evaluate options in context of MarkSync and suggest best choice for our case.

_→ Incorporated: `doc/decisions/ADR-0009-testing-runner.md` (Proposed) recommends `bun:test` + thin E2E runner; awaiting your review._

---

### [OPEN-Q5] ADR-0006 state-model sub-decisions — ANSWERED (refines ADR-0006)

**Question:** UUID v4/v7, lock granularity, lease backend, stale-plan window.

### Answer
ADR-0006 LGTM. Could also consider KSUID instead of UUID (no strong preference — evaluate pros/cons and take the best option). Need a solution that works decentralized (multiple people could sync, no shared service required — all exchange/locking lives purely in git/confluence). Also keep the commit id in the Confluence pages history. Could even consider applying changes in Confluence commit-by-commit so that Confluence page history would reflect the git history + it would allow identifying changes done directly in Confluence in the future (Confluence history entry would contain the commit id). Probably restrict (or allow restriction configuration) so that sync can happen only from main branch (treat Markdown synchronization as sort of "deployment" of documentation). Also there must be a single cache dir in the project repo that can be configured as cacheable in CI to speed up CI/CD pipelines.

_→ Incorporated: ADR-0006 refined — UUID **v7** (research: best sortability/collision tradeoff, KSUID TS libs weak); decentralized locking confirmed via Confluence 409 + operation-ID dedup + stale-plan expiry (no shared service needed); commit-ID embedded in `version.message` per page version; `allowBranches` config; single configurable cache dir `.marksync/cache/` (CI-cacheable) split from run-specific `journal/`+`conflicts/`. See [OPEN-Q6] for the one sub-item needing your confirmation._

---

## Open (awaiting answer)

### [OPEN-Q6] Default sync granularity — commit-by-commit vs squashed — OPEN

**Context (from OPEN-Q5 / external-researcher findings):** You want Confluence page history to reflect Git history and to identify direct Confluence edits (a version entry without a `marksync:commit=` marker = direct edit). The `version.message` field carries the commit ID per page version. Two granularity modes are feasible:

- **Commit-by-commit** (matches your stated intent): for N commits since the last sync, create N page versions, each `version.message` = `marksync:commit=<sha>`. Confluence history mirrors Git history 1:1. Cost: N× writes per page (rate-limit/burst-limit consideration; API-token auth is exempt from 2026 points quotas but burst limits still apply). Research found **no Confluence version-retention limit**.
- **Squashed (fast-forward)**: one page version per sync, `version.message` = `marksync:commit=<HEAD-sha>`. Cheaper; history shows one "deploy" per sync rather than per commit.
- **Hybrid**: default one way, opt-in flag the other.

**Adopted working assumption (pending your confirmation):** commit-by-commit **by default** (reflects your intent), with a `--squash` opt-in for perf-sensitive/large-sync cases. Always embed `marksync:commit=<sha>` in `version.message` either way.

### Answer
<!-- Answer inline here. If blank, the working assumption above stands. -->

---

## Deferred (parked for a later phase)

### [OPEN-D1] Feature-branch preview target space — DEFERRED to `MS-0003`

When `allowBranches` is overridden for a feature-branch preview, should MarkSync publish to a dedicated preview Confluence space (e.g. `~preview`) to avoid 409 collisions with main-branch syncs? Out of scope for `MS-0002`; revisit during `MS-0003` DX work.

### Answer
_Deferred — not blocking Phase 3._
