---
status: Accepted
created: 2026-07-06T17:15:00
phase_scope: 5
topic: ADOS lacks a systematic threat-modeling procedure
outcome: propose-ados-framework-improvement
---

# Retrospective: ADOS needs a systematic threat-modeling capability

## What happened

While completing Phase 5 (ADOS framework integration) and reviewing the full
framework for gaps, the owner identified that ADOS has **no systematic,
repeatable threat-modeling procedure**. Security exists in fragments:

| What exists | What it does | Gap |
|---|---|---|
| `doc/guides/security-baseline.md` (Phase 4, project-specific) | Operational security: secret management, redaction, dependency audit, converter injection safety | **Reactive controls**, not threat enumeration |
| `doc/spec/nonfunctional.md` (NFR-SEC-*) | Security requirements (no secrets logged, redaction layer, dependency audit) | **Requirements**, not threat analysis |
| `doc/quality/security/` (handbook §4.2) | Directory for "threat model (STRIDE/LINDDUN), controls" | **Empty placeholder** — no procedure to fill it |
| `red-team-security-officer` agent | Reviews existing architecture/decisions for security flaws | **Reactive** — critiques after the fact, doesn't model proactively |
| Decision-making guide D9 | Lists "threat model" as an analysis method option | **One word in a table** — no methodology, no template, no agent |
| Change spec template `security_impact` field | Flags high/medium/low/none | **A label**, not a threat-model delta |

No STRIDE exercise is performed during inception. No threat-model delta is
required during change delivery. No agent specializes in threat modeling. The
`doc/quality/security/` directory is a documented location with no procedure
to populate it.

## Anti-pattern

**Security-by-accident:** ADOS relies on red-team reviews to catch security
issues after architecture decisions are made and code is written. This is
late, expensive, and non-systematic. A red-team reviewer flagging "you didn't
consider spoofing on the Confluence adapter boundary" is not a substitute for
a structured STRIDE pass that enumerates all six threat classes per component
*before* implementation.

## Improvement / pattern to propose

A three-layer threat-modeling capability for ADOS:

### 1. New guide: `doc/guides/threat-modeling.md`

A battle-tested, methodology-agnostic procedure covering:

- **When to threat-model:** inception (Phase 3/4), and on any change with
  `security_impact >= medium`.
- **Method selection:** STRIDE (default, per-component/per-data-flow);
  LINDDUN (privacy-sensitive systems); PASTA (risk-centric, optional).
- **Input:** architecture diagrams (C4 L2/L3), data-flow map, ports/adapters
  boundaries, trust boundaries.
- **Process:** enumerate threats per trust-boundary crossing → classify
  (STRIDE) → map to existing controls (NFRs, security baseline) → record
  residual risk + mitigation owner.
- **Output format:** structured table (threat, STRIDE category, affected
  component, existing mitigation, residual risk, action/owner).
- **Output location:** `doc/quality/security/threat-model.md` (inception);
  change-scoped delta in the change spec (delivery).

### 2. Inception integration (Phase 3 or 4)

Add a conditional threat-model artifact:

- **Trigger:** `code_project=true` AND the system has external boundaries
  (API calls, credential handling, untrusted input parsing, network I/O).
- **Phase:** Phase 3 (architecture) or Phase 4 (security baseline) — the
  threat model needs the architecture to exist first, so Phase 3 outputs it
  alongside the C4 diagrams, or Phase 4 picks it up as part of the security
  baseline.
- **Artifact:** `doc/quality/security/threat-model.md` (or
  `doc/inception/analysis/threat-model.md` during inception, graduating to
  `doc/quality/security/` post-inception).
- **Anti-sycophancy tie-in:** the pre-mortem (Phase 2) already imagines
  failure; the threat model (Phase 3/4) systematically enumerates *how* an
  adversary could cause those failures.

For MarkSync specifically, a STRIDE pass would cover:
- **Spoofing:** Confluence API token spoofing, Git identity spoofing in
  provenance.
- **Tampering:** Markdown corpus tampering, lock-file tampering, cache
  poisoning, Storage Format injection.
- **Repudiation:** sync actions without audit trail, provenance gaps.
- **Information disclosure:** credential leakage in logs/cache/version.message,
  Git history exposure via provenance.
- **Denial of service:** Confluence rate-limit exhaustion, lock contention.
- **Elevation of privilege:** converter injection (Markdown → Storage Format
  → Mermaid SVG), branch restriction bypass.

### 3. Change delivery integration

When a change spec declares `security_impact >= medium`:

- Require a **threat-model delta** section in the change spec: new threats
  introduced, existing threats affected, new mitigations, residual risks.
- The `dor_check` (phase 5) should verify the delta exists and is consistent
  with the baseline threat model.
- The `@reviewer` (phase 8) should verify mitigations are implemented.

### 4. New agent: `threat-modeler` (or `security-analyst`)

A dedicated agent that:

- **Input:** reads architecture (C4, data flow, ports), existing threat model,
  NFRs, security baseline.
- **Process:** applies STRIDE per component/data-flow/trust-boundary; for
  privacy-sensitive projects, LINDDUN.
- **Cross-references:** maps each threat to existing controls (NFR-SEC-*,
  security-baseline measures, ADRs).
- **Records:** identified threats, existing mitigations, residual risks, and
  follow-up actions (tickets / ACs).
- **Output:** structured threat-model document (inception) or delta (change).
- **Not a replacement for `red-team-security-officer`:** the red-team reviewer
  *challenges* the threat model; the threat-modeler *creates* it. They are
  complementary (like `decision-advisor` creates vs `decision-critic`
  challenges).

### Relationship to existing security assets

```
Inception Phase 2:  Risk register (broad risks, including security)
Inception Phase 3:  Architecture (C4, data flow, trust boundaries)
Inception Phase 4:  Security baseline (operational controls) + THREAT MODEL (NEW)
Change delivery:    security_impact field → threat-model delta (NEW)
Red-team review:    red-team-security-officer challenges threat model + implementation
```

## Why it matters

MarkSync handles credentials (Confluence tokens), untrusted input (Markdown →
Storage Format → Mermaid SVG), and external API calls (Confluence Cloud). A
single missed threat class (e.g., Mermaid SVG XSS via `foreignObject`, cache
poisoning via crafted content hashes) can undermine the entire "safe one-way
publisher" trust wedge that `MS-0002` is built on.

ADOS's current security posture is **defense-in-depth after the fact** (red-team
catches, security baseline, NFRs). Adding proactive threat modeling makes it
**defense-in-depth before and during** — systematically enumerating threats
before implementation, and tracking threat-model deltas per change.

## Caution

- **Don't over-engineer for simple projects.** A CLI tool with no network calls
  and no credentials may not need a full STRIDE pass. The trigger should be
  conditional (external boundaries + credentials + untrusted input).
- **Don't duplicate the risk register.** The risk register (Phase 2) captures
  broad risks; the threat model (Phase 3/4) systematically enumerates
  adversary-driven threats mapped to controls. They feed each other but are not
  the same artifact.
- **Keep it methodology-light by default.** STRIDE-per-component is sufficient
  for most projects. LINDDUN/PASTA are opt-in for privacy/risk-centric systems.

**Filed as:** ADOS framework improvement proposal — this is the largest of the
three Phase 5 retro proposals and warrants a dedicated design discussion (ADR
in the ADOS repo). The owner should decide: new agent vs extending
`decision-advisor`, new guide vs extending `security-baseline.md`, and which
phase owns the inception threat model.
