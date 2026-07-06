---
# Copyright (c) 2025-2026 Juliusz Ćwiąkalski (https://www.cwiakalski.com | https://www.linkedin.com/in/juliusz-cwiakalski/ | https://x.com/cwiakalski)
# MIT License - see LICENSE file for full terms
source: https://github.com/juliusz-cwiakalski/agentic-delivery-os/blob/main/doc/templates/documentation-profile-template.md
ados_distribution: project-generated
id: DOC-PROFILE-marksync
status: Accepted
profile: engineering-repo
business_docs_enabled: false
business_docs_root: null
canonical_strategy_repo: null
allowed_write_roots:
  - doc/changes
  - doc/spec
  - doc/decisions
  - doc/meetings
forbidden_write_roots:
  - doc/business
owners:
  - Juliusz Ćwiąkalski
last_updated: 2026-07-06
---

# Documentation Profile

MarkSync for Confluence is an **engineering repository**: it ships a CLI tool
and its documentation. Business/product strategy materials are inception inputs
(`doc/inception/inputs/`), not a standing business-documentation tree.

## Notes

- If this file is missing, default behavior is `engineering-repo` and business
  docs remain disabled.
- Keep `allowed_write_roots` and `forbidden_write_roots` deterministic and
  explicit.
- Set `business_docs_root` only when `business_docs_enabled: true`.
- When enabling business docs, update all related fields together: set
  `business_docs_enabled: true`, set `business_docs_root`, add that root to
  `allowed_write_roots`, and remove it from `forbidden_write_roots`.
