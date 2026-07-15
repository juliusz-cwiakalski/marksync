# INV-SAFE-1: No silent overwrite of drifted documents.
# Invariant: INV-SAFE-1 (ADR-0006 C-1/C-2) — documents whose remote state is
# REMOTE_AHEAD or DIVERGED must be Blocked and never auto-overwritten.

Feature: No silent overwrite of drifted documents
  Invariant: INV-SAFE-1 (ADR-0006 C-1/C-2) — drifted documents (REMOTE_AHEAD
  or DIVERGED) must be Blocked and never auto-overwritten without --adopt/--rebind.

  Scenario: REMOTE_AHEAD document is blocked (not auto-overwritten)
    Given a managed document whose remote is in REMOTE_AHEAD state
    When computePlan + applyPlan run without --adopt/--rebind
    Then the drifted document is Blocked
    And FakeTarget received 0 updatePage calls
    And FakeTarget received 0 createPage calls

  Scenario: DIVERGED document is blocked (not auto-overwritten)
    Given a managed document whose remote body hash diverges from local base (DIVERGED state)
    When computePlan + applyPlan run without --adopt/--rebind
    Then the diverged document is Blocked
    And FakeTarget received 0 updatePage calls
    And FakeTarget received 0 createPage calls