---
status: Draft
created: 2026-07-05T14:05:00Z
phase_scope: phase-3
topic: Architecture evolves through PR review
outcome: repeat
---

# Retrospective — Architecture evolves through PR review

## What happened

The initial Phase 3 architecture overview placed the Storage renderer and
reverse converter in the **domain tier** as generic components. The owner's
PR review produced a series of architecture-improving comments:

1. **"The Storage renderer should probably be encapsulated in the target
   system adapter."** — The owner recognized that HAST→Confluence Storage
   Format is a target-system-specific concern, not a generic domain concern.
   This prompted introducing the `TargetSystem` port and moving the Storage
   renderer, reverse converter, attachment manager, content property manager,
   and page-history provenance into a Confluence-adapter-specific section.

2. **"Define some sort of sync system interface (port?)"** — The owner asked
   for an explicit port that a future adapter (e.g., Notion, GitBook) would
   implement. This resulted in the `TargetSystem` port with operations like
   `getPage`, `updatePage`, `renderBody`, `attachmentExists`,
   `uploadAttachment`, `reverseConvert`.

3. **"We need some sort of resource URL resolver for cross-page links."** —
   The owner identified that local Markdown cross-document links must become
   valid Confluence internal links after sync. This prompted adding a **Link
   resolver** component to the domain tier.

4. **"Do we need a special component for Mermaid (hash, detect, upload)?"** —
   The owner decomposed the Mermaid workflow into three responsibilities
   (hash calculation, existence detection, image upload) and prompted adding
   a **Mermaid artifact manager** component.

5. **"We must support JSON output."** — The owner identified the need for
   machine-readable output, prompting ADR-0011 (CLI output strategy).

None of these were documentation fixes — they were **architecture improvements**
that changed the component graph, the port boundaries, and the feature set.

## What went well

- The owner reviewed the architecture from the perspective of someone who
  owns the product vision and will live with the decisions.
- The PR comments were specific, constructive, and included suggested
  alternatives.
- The AI (bootstrapper) treated each comment as an architecture change, not
  a text edit — restructuring the components table, the module-residence
  rules, the interface contracts, and the C4 L3 diagram.

## What went wrong

- The initial draft made an assumption (Storage renderer in domain tier)
  that the owner had to correct. The AI did not ask whether the renderer was
  adapter-specific or generic — it assumed generic.
- The initial draft did not include cross-page link resolution or Mermaid
  artifact management as first-class components. These were standard concerns
  for a docs-sync tool, but the AI did not proactively surface them.

## Lesson

**Architecture docs benefit from review by the person who owns the product
vision, even when the AI thinks the structure is correct.** The owner's PR
comments were not just documentation fixes — they improved the architecture:

- Adapter boundary clarification (TargetSystem port)
- Missing components identified (Link resolver, Mermaid artifact manager)
- Missing capability identified (JSON output → ADR-0011)
- Extensibility principle articulated (future adapters at low cost)

The AI's initial draft was a reasonable starting point, but the owner's domain
knowledge and product vision produced a better architecture.

## Pattern to repeat

1. Draft the architecture overview from the spec + ADRs.
2. Explicitly ask the owner to review the **component boundaries** (what is
   generic vs adapter-specific) and the **component completeness** (are there
   missing capabilities?).
3. Treat PR comments on architecture as architecture changes, not text edits —
   restructure the component graph, not just the prose.
4. When the owner suggests a port or interface, add it to the interface
   contracts table and the C4 diagram.

## Caution

Do not over-engineer the adapter boundary for hypothetical future adapters
that may never materialize. The owner's guidance was explicit: "we should
not complicate the architecture only for the sake of handling more adapters.
But we should use opportunity to make the architecture extensible for future
adapters if it's low cost and does not imply greater complexity." The port
exists to keep the boundary clean, not to force generality.
