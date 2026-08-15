# GH-90 — Blocking Questions

Status: **BLOCKED — awaiting human input** (delivery phase 6, plan abort A-1, second occurrence: CI secrets absent)

## OPEN-Q2: Configure the E2E_* Actions secrets (they were never set — nightly e2e has been green-by-skip)

**Question:** The CEO-authorized CI path cannot execute: the
`E2E_*` secrets are **not configured** in this repository. Evidence:

- The probe run ([31866891540](https://github.com/juliusz-cwiakalski/marksync/actions/runs/31866891540),
  commit `b46895d`) failed fast: all five `MARKSYNC_E2E_*` env vars mapped
  to empty values → script hard-failed on missing env.
- The nightly `run-e2e.yml` run cited as proof of valid secrets
  ([31861445358](https://github.com/juliusz-cwiakalski/marksync/actions/runs/31861445358),
  2026-08-15T03:18Z, conclusion=success) actually logged
  `[E2E Skip] MARKSYNC_E2E_* secrets not configured, skipping live-sandbox
  test` — only the 2 sandbox-guard unit checks ran. Green conclusion,
  skipped substance.

**Ask (owner, ~5 minutes):** in repo Settings → Secrets and variables →
Actions → New repository secret, add:

| Secret name | Value |
|---|---|
| `E2E_CONFLUENCE_BASE_URL` | `https://cwiakalski.atlassian.net` |
| `E2E_USER_EMAIL` | the Atlassian account email |
| `E2E_API_TOKEN` | a **fresh** API token (id.atlassian.com → Security → API tokens) — the old local one is revoked |
| `E2E_SPACE_KEY` | the sandbox space key (e.g. `marksyncte`) |
| `E2E_PARENT_PAGE_ID` | parent page id under that space (e.g. `39223464`) or leave unset if none |

Then reply "secrets set" on #90. Resume is immediate: `gh run rerun
31866891540` (or any push touching the script) re-executes the ready probe;
evidence lands as the `gh-90-evidence` artifact.

**Why it blocks:** GH-90's deliverable is live request/response evidence +
TDR-0011 verdict. Local token revoked (OPEN-Q1) + CI secrets absent (this
question) = no live-API path. Mocks remain unacceptable (TDR-0001 C-1).

**State on resume:** Workflow + script are committed and green-ready
(`b46895d`); plan tasks 1.12–1.17 partially executed (author→push→watch→
diagnose); remaining: artifact download → evidence/ → TDR-0011 → finalize.

## OPEN-Q1: Restore Confluence sandbox access (or provide working credentials) — RESOLVED (superseded by OPEN-Q2 context)

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

**RESOLVED 2026-08-15 (CEO-authorized credential resolution):** the local
demo `.env` token is revoked — do NOT wait for a human token refresh. The
repo's GitHub Actions E2E secrets ARE valid (`run-e2e.yml` succeeded
2026-08-15T03:18Z, run 31861445358). Evidence capture therefore moves to
CI: a small, additive probe workflow on the spike branch only (CEO waiver,
GH-32 precedent; no security controls removed) executes the spec's 10-case
matrix against the live sandbox using the existing secrets
(`E2E_CONFLUENCE_BASE_URL`, `E2E_USER_EMAIL`, `E2E_API_TOKEN`,
`E2E_SPACE_KEY`, `E2E_PARENT_PAGE_ID`), producing ≥3 page versions and
capturing sanitized status codes + response shapes as workflow artifacts.
TDR-0011 cites the captured evidence and keeps a non-blocking note that
local `.env` runs require a human-issued token.
