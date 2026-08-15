# GH-90 — Blocking Questions

Status: **BLOCKED — awaiting human input** (delivery phase 6, plan abort A-1)

## OPEN-Q1: Restore Confluence sandbox access (or provide working credentials)

**Question:** The sandbox credentials at `tmp/marksync-demo/.env` (tenant
`cwiakalski.atlassian.net`) authenticate but cannot access Confluence. All
API calls return HTTP 403 `"Request rejected because caller cannot access
Confluence"`. Which fix applies — and once fixed, just say "creds fixed" (or
reply inline on the issue)?

1. **Reactivate/restore Confluence access for the account** —
   admin.atlassian.com → the user's product access for Confluence on the
   site. Free Atlassian sites are deactivated after prolonged inactivity;
   the last successful live regression was 2026-07-26 (3 weeks ago).
2. **Issue a fresh API token** — id.atlassian.com → Security → API tokens.
   (Less likely: revoked tokens normally yield 401, and we get a Confluence
   product-access 403 — but a fresh token rules it out cheaply.)
3. **Point at a different tenant** — update `tmp/marksync-demo/.env`
   (`MARKSYNC_CONFLUENCE_BASE_URL` / `MARKSYNC_USER_EMAIL` /
   `MARKSYNC_API_TOKEN`) and, if the space differs, `tmp/marksync-demo/
   marksync.yml` (`spaceKey`, `parentPageId`). GH-90 needs one space where a
   disposable page may be created/trashed.

**Why it blocks:** GH-90 is a live-API spike — its entire deliverable is
redacted request/response evidence against the real sandbox plus the
TDR-0011 verdict. No API access → no evidence → no TDR. Mocks are explicitly
not acceptable evidence (TDR-0001 C-1; failure-premortem anti-pattern).

**Diagnostics (2026-08-15, PM-verified):**

| Probe | Result |
|---|---|
| `GET /wiki/rest/api/user/current` (v1, Basic auth) | **403** `caller cannot access Confluence` |
| `GET /wiki/rest/api/space` (v1) | **403** same |
| `GET /wiki/api/v2/user/by-me` (v2) | 404 (consistent with TDR-0010's known-broken v2 probe; not the blocker) |
| Auth header | Well-formed (email 22 chars, token 192 chars); reaches Confluence authorization → not a 401 |

**Impact while blocked:** MS3-E2-S1 (`resolve` design lock) and MS3-E5-S2
(read-permission check design) remain blocked per issue #90's dependency
notes; MS-0003 epic E2/E4 design locks wait on this spike.

**State on resume:** Delivery is mid-phase-6. Plan tasks 1.1–1.2 done
(blocker documented, commit `db9a2ac`); tasks 1.3–3.7 remain. Re-run from
plan task 1.3 once access is restored — no re-planning needed.

### Answer
<!-- Human: provide your answer here (or reply inline on issue #90) -->
