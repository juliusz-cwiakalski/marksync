---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
id: PDR-0001
decision_type: pdr
status: Proposed
created: 2026-07-03
decision_date: null
last_updated: 2026-07-05
summary: "Product/brand is 'MarkSync'; Confluence is the first adapter (not the brand), keeping 'Confluence' only in descriptors under nominative use."
owners:
  - Juliusz Ćwiąkalski
service: marksync-cli
decision_area: mixed
decision_scope: product-line
reversibility: moderate
review_date: null
business_impact: "Removes core-brand trademark exposure and aligns the brand with the multi-target adapter architecture."
customer_impact: "Slightly less keyword-discoverable; clearer long-term identity; future adapters (Notion, GitBook) remain open."
classification:
  domains: [product, strategy, legal]
  archetype: selection
  environment: complicated
  rigor: R2
  reversibility: moderate
  stakes: high
  urgency: medium
  uncertainty: low
  blast_radius: market
  recurrence: one-off
governance:
  driver: Juliusz Ćwiąkalski
  decider: Juliusz Ćwiąkalski
  contributors: []
  reviewers: []
  performers: [Juliusz Ćwiąkalski]
  informed: []
ai_assistance:
  used: true
  roles: [analyst, record-writer]
  external_data_shared: false
  citations_verified: false
  human_decider: Juliusz Ćwiąkalski
  reviewers: []
revisit_triggers:
  - "Atlassian trademark policy changes in a way that affects nominative use of 'Confluence'."
  - "A second knowledge-platform adapter (e.g., Notion, GitBook) is actually built — validates the reframe."
  - "Search/SEO telemetry shows the rename meaningfully hurts Confluence-tooling discoverability beyond an accepted threshold."
links:
  related_changes: []
  supersedes: []
  superseded_by: []
  spec: ["../inception/system-specification-draft-from-ai-brainstorm.md"]
  contracts: []
  diagrams: []
  decisions: []
  experiments: []
  metrics: []
  roadmap_items: []
---

# PDR-0001: Product naming and architecture — "MarkSync" core with Confluence as the first adapter

## Context

> **Migration note:** This record was authored pre-inception in `doc/inception/decisions/` and migrated to the canonical ADOS home `doc/decisions/` during Phase 3 inception (2026-07-04). It remains `status: Proposed` pending human confirmation. Records are numbered in one sequence (ADR-0001…) regardless of `decision_type`.

The current product identity is **"MarkSync for Confluence"** (repo: `marksync-for-confluence`). Two facts drive this decision:

1. **The architecture is already adapter-based.** The spec defines a `ConfluenceClient` adapter interface (§9.7), references a "Data Center adapter", and lists "additional knowledge-platform adapters later" as a deferred phase (§5.2). The name embeds a *single target* ("Confluence") in the brand while the architecture is multi-target.
2. **"Confluence" is an Atlassian trademark embedded in the core brand.** The spec lists trademark as an Open Question (§2.5: "Does project naming need adjustment under Atlassian trademark policy?"), records it as a risk (§16: "Trademark issue — Medium"), and requires an NFR-023 ("State independence from Atlassian and review trademark use"). The failure premortem independently flags "The project name and language become inconsistent" (§4.7) and lists "Canonical name: choose MarkSync consistently" as a decision to make now (§21.1).

FACT: The product is already colloquially referred to as "MarkSync" throughout the inception docs and the failure premortem (§21.1). FACT: A prominent competitor is `kovetskiy/mark` (~1,500 stars) — bare "Mark" collides with it. FACT: Atlassian trademark policy permits nominative use (describing compatibility) but not brand-implied endorsement.

## Problem Framing (Clarified)

Two intertwined issues:

1. **Trademark / legal exposure:** putting "Confluence" in the core brand risks implying Atlassian endorsement/affiliation. This is a brand-architecture risk, not a code risk.
2. **Brand-architecture mismatch:** the name implies a single-target tool, but the architecture (and roadmap) are multi-target adapters. The name should reflect the durable identity ("MarkSync"), with the first target ("Confluence") as a descriptor.

The decision is *not* "should we rename the codebase" (the codebase is already `marksync`). It is: *what is the durable product/brand, and where may the word "Confluence" appear?*

## Constraints (Hard Requirements)

### C-1: No implied Atlassian endorsement/affiliation

- **Statement:** The product/brand identity must not imply Atlassian endorsement, sponsorship, or affiliation. "Confluence" may appear only under nominative use (describing what the tool interoperates with), accompanied by a clear non-affiliation notice.
- **Source:** Spec §2.5, §16, NFR-023; Atlassian trademark norms.
- **Verification:** README/legal review confirms a non-affiliation notice; brand assets do not use "Confluence" as part of the product name.
- **Negotiable:** no.

### C-2: Discoverability by Confluence-tooling searchers

- **Statement:** Users searching for Confluence tooling must still be able to find MarkSync. The word "Confluence" must appear in discoverable surfaces (title, description, topics, README subtitle, package descriptors).
- **Source:** Category-leadership strategy report (adoption/activation; README §9.13).
- **Verification:** The repo description, topics, and README subtitle include "Confluence".
- **Negotiable:** no.

### C-3: No collision with prominent existing project names

- **Statement:** The chosen core name must not collide with established projects. In particular, bare "Mark" is taken (`kovetskiy/mark`, ~1,500 stars).
- **Source:** Competitive inventory (`../inception/open-source-git-markdown-confluence-sync-report-2026-07-02.md` §3).
- **Verification:** Name search across the competitive inventory and GitHub.
- **Negotiable:** no.

## Decision Drivers

**Business / product drivers:**
- Long-term brand durability as additional adapters ship.
- Minimizing legal/trademark risk before public launch.
- Keeping the door open to Notion/GitBook/other adapters without a future rename.

**Strategic drivers:**
- Aligning brand with architecture (adapter-based) — avoids a future brand-architecture mismatch crisis.
- Matching the failure premortem's "Decisions that should be made now" (§21.1).

**Operational drivers:**
- Minimal disruption: "MarkSync" is already in use across docs; the LICENSE and repo already exist.

## Mental Models & Techniques Used

- **First Principles:** what is the durable identity? The synchronization engine ("MarkSync"). What is ephemeral? The first target ("Confluence"). The durable thing should be the brand.
- **Inversion:** "How do we avoid a forced rename later?" → don't bake a vendor name into the core brand now.
- **Reversibility:** the repo URL rename is low-stakes and reversible; the brand positioning is harder to reverse later — decide the brand now, defer the URL ops decision.
- **Opportunity Cost:** we trade a small amount of keyword discoverability for future-proofing and trademark safety.

## Alternatives Considered

### Per-Alternative Constraint-Compliance Evaluation

Legend: ✅ = passes · ❌ = fails · ⚠️ = passes only via an accepted-risk exception.

|          | C-1 (no implied endorsement) | C-2 (Confluence discoverability) | C-3 (no name collision) |
|----------|------------------------------|----------------------------------|--------------------------|
| Alt 0    | ⚠️ (trademark in core brand; mitigated only by disclaimer) | ✅ (best keyword fit) | ✅ |
| Alt 1    | ✅ | ✅ (kept in descriptors) | ✅ |
| Alt 2    | ✅ | ⚠️ (new name loses both "MarkSync" equity and "Confluence" keyword unless added) | ✅ |

### Alternative 0 — Keep "MarkSync for Confluence" as the brand

- **Summary:** Leave the brand unchanged, relying on a non-affiliation disclaimer to manage trademark risk.
- **Pros:** Best keyword discoverability ("Confluence" in the brand); matches what several competitors do; zero rename cost.
- **Cons:** Embeds an Atlassian trademark in the core brand; contradicts the adapter architecture; the disclaimer mitigates but does not eliminate the §16 trademark risk.
- **Constraint compliance:** C-1 ⚠️ (only via disclaimer — an accepted-risk posture); C-2 ✅; C-3 ✅.
- **Why rejected:** Leaves a non-trivial, avoidable trademark exposure in the core brand and misaligns brand with architecture.

### Alternative 1 — Brand = "MarkSync"; Confluence = first adapter (RECOMMENDED)

- **Summary:** Product/brand is **"MarkSync"**. Confluence is the first adapter: package/namespace names like `@marksync/confluence`, code module `adapter-confluence`. "Confluence" appears only in descriptors (title, topics, README subtitle) under nominative use, with a clear non-affiliation notice. Future Notion/GitBook/etc. adapters remain open.
- **Pros:** Removes core-brand trademark exposure (C-1); preserves discoverability through descriptors (C-2); avoids collision (C-3); aligns brand with the multi-target architecture; matches the name already in use across inception docs.
- **Cons:** Slightly less keyword-discoverable than Alt 0; requires consistency discipline across package names.
- **Constraint compliance:** C-1 ✅; C-2 ✅; C-3 ✅.
- **Why chosen:** The only alternative that satisfies all three constraints while preserving future optionality.

### Alternative 2 — An entirely new evocative name

- **Summary:** Pick a brand-new name unrelated to "Mark" or "Confluence".
- **Pros:** Zero collision risk; no trademark entanglement.
- **Cons:** Renaming cost; discards the "MarkSync" equity already established in the repo/LICENSE/docs; must rebuild keyword discoverability from scratch.
- **Constraint compliance:** C-1 ✅; C-2 ⚠️ (must re-add "Confluence" as a descriptor to recover discoverability); C-3 ✅.
- **Why rejected:** Higher cost for no incremental benefit over Alt 1.

## Decision

**Recommendation: Alternative 1 — product/brand = "MarkSync"; Confluence = first adapter.**

Keep "Confluence" only in descriptors (title, topics, README subtitle, package descriptors) under nominative use plus a clear non-affiliation notice. The repo URL `marksync-for-confluence` can remain short-term for discoverability or migrate to `marksync`; **that is a separate, low-stakes ops decision** and is out of scope here.

This aligns with the failure premortem §21.1 ("Canonical name: choose MarkSync consistently") and resolves spec §2.5 / §16 / NFR-023 trademark concerns at the brand level.

> **AI-assistance disclosure:** This analysis is AI-assisted. The human decider (Juliusz Ćwiąkalski) has **not yet** decided. `status: Proposed` until human confirmation during inception. This is **not** legal advice; formal trademark review should occur before public launch.

### Constraint Compliance Attestation

The recommended alternative (Alt 1) satisfies all documented constraints:

- **C-1 — ✅ Full compliance:** The brand is "MarkSync"; "Confluence" is used only as a descriptor under nominative use with a non-affiliation notice.
- **C-2 — ✅ Full compliance:** "Confluence" remains present in discoverable surfaces (title, topics, README subtitle, package descriptors).
- **C-3 — ✅ Full compliance (prominent collisions); ⚠️ accepted-risk exception (minor collision):** "MarkSync" does not collide with the prominent/established project `kovetskiy/mark` (~1,500 stars) or any other *prominent* inventoried project. However, the external naming search surfaced a **minor** existing collision: a small project `yh1224/marksync` (1 GitHub star; described as a tool to "Synchronize Markdown documents to services," targeting Qiita, esa.io, and Zenn) already uses the npm global package name `marksync`. This does not violate C-3 as written — C-3 targets *prominent* collisions — but it invalidates any blanket claim that "MarkSync" has no relevant collision at all. The collision is acceptable because MarkSync's positioning, target adapter (Confluence), safety model, and audience are substantially different. See the "Minor name collision risk" + mitigation in Trade-offs & Consequences and the package-name open question in Unresolved Questions.

### Web Presence

Initial public web presence will be a lightweight landing page under the author's personal domain at **`cwiakalski.com/marksync`**. This keeps operational overhead low, associates the project with the author's professional/personal brand, and follows Atlassian's domain guidance (Atlassian discourages using its product marks in domains, so a Confluence-containing product domain is avoided).

As the project matures and requires dedicated documentation, guides, examples, and product navigation, web presence will move to a dedicated subdomain at **`marksync.cwiakalski.com`**. This preserves the personal-brand association (via the parent domain) while creating a product-specific surface when justified by adoption and documentation complexity.

Recommended migration triggers for the subdomain move: public releases exist; README becomes too large for onboarding; install/configuration/examples/architecture docs need their own navigation; the project receives external users or contributors; search discoverability justifies a structured docs site.

## Trade-offs & Consequences

### Positive Outcomes

- Removes core-brand trademark exposure before public launch.
- Brand matches the adapter-based architecture; future adapters need no rename.
- Consistent with the "MarkSync" already used throughout inception docs.

### Negative Outcomes

- Marginally less keyword-discoverable than embedding "Confluence" in the brand (mitigated by descriptor usage).
- Requires discipline: package/namespace naming (`@marksync/confluence`, `adapter-confluence`) must be consistent.
- **Minor name collision risk:** A small existing project named `yh1224/marksync` already exists and uses the npm global package name `marksync`. This creates potential package-name and search-result ambiguity, although the project is small (1 GitHub star) and targets different services (Qiita, esa.io, Zenn — not Confluence). The collision is acceptable because MarkSync's positioning, target adapter, safety model, and audience are substantially different.
- **Mitigation (name collision):** Use strong descriptors: "Git-native Markdown publishing for Confluence," "safe Markdown-to-Confluence publishing," "docs-as-code publishing for Confluence." Prefer scoped or explicit package names if unscoped `marksync` is unavailable (e.g., `@cwiakalski/marksync`, `@marksync/cli`, or `marksync-cli`). Keep author attribution visible on GitHub, README, landing page, and docs.

### Unresolved Questions

- [ ] Should the GitHub repo URL migrate from `marksync-for-confluence` to `marksync` now, later, or never? (separate low-stakes ops decision — owner: Juliusz Ćwiąkalski)
- [ ] Final package/namespace scheme (`@marksync/confluence` vs `marksync-confluence` vs monorepo package names) — decide during bootstrap (owner: Juliusz Ćwiąkalski).
- [ ] Verify package naming before first public package release. Do not assume ownership of the unscoped `marksync` package in npm or other registries (it is already used by `yh1224/marksync`). Prefer scoped or explicit package names if the unscoped name is unavailable or confusing — e.g., `@cwiakalski/marksync`, `@marksync/cli`, or `marksync-cli` (owner: Juliusz Ćwiąkalski, pre-first-public-release).
- [ ] Formal trademark review wording for the non-affiliation notice (owner: Juliusz Ćwiąkalski, pre-launch).

## Implementation Plan

1. **Brand:** standardize "MarkSync" as the product/brand across README, docs, and the CLI's self-description.
2. **Adapters:** name the Confluence integration as an adapter (`adapter-confluence` / `@marksync/confluence`); preserve the spec §9.7 `ConfluenceClient` interface boundary.
3. **Descriptors:** keep "Confluence" in the repo description, topics, README subtitle, and package descriptors.
4. **Notice:** add a clear non-affiliation/trademark notice (README §9.13 already anticipates this).
5. **Defer:** the GitHub repo URL rename as a separate, explicitly low-stakes ops decision.

## Verification Criteria

- **Metric: Brand consistency** — Target: all user-facing surfaces use "MarkSync" as the brand; "Confluence" appears only as a descriptor/adapter name — Window: pre-launch.
- **Metric: Discoverability preserved** — Target: repo description + topics + README subtitle contain "Confluence" — Window: pre-launch.
- **Metric: Notice present** — Target: a non-affiliation/trademark notice is present in README and LICENSE area — Window: pre-launch.

## Confidence Rating

**Medium-High.** The recommendation cleanly satisfies all constraints, matches the name already in use, and aligns with the failure premortem's explicit "decide now" item (§21.1). Confidence is reduced from High to **Medium-High** because the external naming search found a minor existing collision (`yh1224/marksync`, 1 GitHub star, targeting different services — Qiita/esa.io/Zenn) that uses the npm global package name `marksync`; this is mitigated via strong Confluence-focused descriptors and scoped/explicit package naming (see Trade-offs & Consequences). Residual uncertainty is otherwise limited to the (deferred, low-stakes) repo-URL ops decision, package-name verification before first public release (see Unresolved Questions), and formal trademark-review wording.

## Lessons Learned (Retrospective)

TODO: Populate after implementation.

## References

- `../inception/system-specification-draft-from-ai-brainstorm.md` — §2.5 (trademark open question), §5.2 (additional adapters later), §9.7 (Confluence adapter interface), §9.13 (README non-affiliation notice), §16 (trademark risk), NFR-023.
- `../inception/marksync-failure-premortem-and-anti-failure-playbook-2026-07-02.md` — §4.7 (name/language inconsistency), §21.1 (canonical name decision).
- `../inception/marksync-category-leadership-strategy-report-2026-07-02.md` — §23 (community/adoption), §32 Epic A (canonical spelling + GitHub org strategy).
- `../inception/open-source-git-markdown-confluence-sync-report-2026-07-02.md` — §3 (competitive inventory; `kovetskiy/mark` collision).
- `tmp/decision-reviews/PDR-0001-review.md` — external naming review that surfaced the `yh1224/marksync` minor collision and the web-presence / package-name guidance applied in the 2026-07-05 amendment.

## Revision History

- **2026-07-03** — Initial proposed record (pre-inception migration from `doc/inception/decisions/` to the canonical ADOS home `doc/decisions/` during Phase 3 inception).
- **2026-07-05** — Amended per decision review (`tmp/decision-reviews/PDR-0001-review.md`):
  1. Acknowledged minor name collision with `yh1224/marksync` (1 GitHub star; targets Qiita/esa.io/Zenn); updated the C-3 attestation from a blanket "no collision" claim to an accepted-risk exception.
  2. Lowered confidence from **High** to **Medium-High** (Confidence Rating) due to the external naming collision.
  3. Added a "Minor name collision risk" entry plus its mitigation to Trade-offs & Consequences (Negative Outcomes).
  4. Added a new "Web Presence" subsection: initial presence at `cwiakalski.com/marksync`, migrating to `marksync.cwiakalski.com` when justified.
  5. Added a package-name verification open question (do not assume ownership of unscoped `marksync`; prefer scoped/explicit package names).
