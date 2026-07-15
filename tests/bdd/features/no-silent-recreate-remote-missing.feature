# INV-SAFE-2: No silent re-create of REMOTE_MISSING documents.
# Invariant: INV-SAFE-2 (ADR-0006 C-3) — a managed page whose remote was
# deleted must be Blocked and never silently re-created.

Feature: No silent re-create of remote-missing documents
  Invariant: INV-SAFE-2 (ADR-0006 C-3) — a managed page whose remote was
  deleted must be Blocked and never silently re-created.

  Scenario: REMOTE_MISSING document is blocked (not re-created)
    Given a managed page whose remote was deleted (FakeTarget returns RemoteMissing)
    When computePlan + applyPlan run without --adopt/--rebind
    Then the REMOTE_MISSING document is Blocked
    And FakeTarget received 0 createPage calls

  Scenario: Multi-document corpus with REMOTE_MISSING excludes blocked doc from creates
    Given a corpus with 3 managed documents, one of which is REMOTE_MISSING
    When computePlan + applyPlan run without --adopt/--rebind
    Then FakeTarget.createPageCalls.length is strictly less than total documents
    And the REMOTE_MISSING document is not in the created pages list