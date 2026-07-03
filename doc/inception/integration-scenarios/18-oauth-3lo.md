# 18 — OAuth 2.0 (3LO) browser login (later phase)

## Purpose
A browser-based, no-shared-secret login for interactive users (FR-AUTH-007, later phase). Replaces pasting an API token. **Not in MVP**; documented now so the adapter's auth boundary is designed to accept it.

## Status: CURRENT (documented; **not** live-proven in the spike — MVP uses API-token Basic auth, [01](./01-authentication.md)).

## Flow (confidential client — server-side `client_secret`; no documented PKCE)

**1. Authorize (browser):**
```
GET https://auth.atlassian.com/authorize
    ?audience=api.atlassian.com
    &client_id=YOUR_CLIENT_ID
    &scope=read%3Apage%3Aconfluence%20write%3Apage%3Aconfluence%20…        (URL-encoded, space-delimited)
    &redirect_uri=https://YOUR_APP/callback
    &state=RANDOM
    &response_type=code
    &prompt=consent
```

**2. Exchange code → access token:**
```http
POST https://auth.atlassian.com/oauth/token
Content-Type: application/json
```
```json
{ "grant_type": "authorization_code",
  "client_id": "…", "client_secret": "…",
  "code": "AUTH_CODE",
  "redirect_uri": "https://YOUR_APP/callback" }
```
```json
{ "access_token": "…", "expires_in": 3600, "scope": "…",
  "refresh_token": "…" }      // present only if "offline_access" was requested
```

**3. Discover accessible sites (cloudId):**
```http
GET https://api.atlassian.com/oauth/token/accessible-resources
Authorization: Bearer {access_token}
```
```json
[ { "id": "af818fbb-efc6-45da-95ad-cd3ccea971f5", "name": "cwiakalski",
    "url": "https://cwiakalski.atlassian.net", "scopes": ["read:page:confluence", …] } ]
```
Pick the target site → its `id` is the **cloudId** for the gateway base URL.

**4. Call the API via the gateway:**
```
GET https://api.atlassian.com/ex/confluence/{cloudId}/wiki/api/v2/pages/{id}
Authorization: Bearer {access_token}
```

**5. Refresh (rotating refresh tokens):**
```http
POST https://auth.atlassian.com/oauth/token
{ "grant_type": "refresh_token", "client_id": "…", "client_secret": "…", "refresh_token": "…" }
```
- Add `offline_access` to the authorization scope to receive a refresh token.
- Refresh tokens **rotate**: each use returns a **new** `refresh_token`; the old one is invalidated. Store the new one immediately.
- Inactivity expiry 90 days; 10-min reuse leeway.
- Atlassian does **not** document PKCE for 3LO; the flow requires a `client_secret` (confidential client). Implicit grant is unsupported.

## Scopes (request the minimum)
Use the granular scopes from [01](./01-authentication.md) §1C (e.g. `read:page:confluence write:page:confluence delete:page:confluence read:space:confluence read:content.property:confluence write:content.property:confluence write:attachment:confluence read:attachment:confluence search:confluence`).

## Design notes for the adapter
- Auth boundary must accept either Basic(email:token) or Bearer(accessToken) and target either the direct URL or the gateway URL — selected by profile (`method: api-token` vs `oauth`).
- Store tokens in the OS keyring (never in project files); rotate refresh tokens atomically.
- Loopback callback for the local CLI; PKCE if/when Atlassian adds it.

## Implementation / mock contract (future)
- `OAuthProfile` flow: authorize → code → token → accessible-resources → pick cloudId → store tokens.
- A token-refresh interceptor on the HTTP client.
- Mocks: the token/refresh/accessible-resources responses above (documented examples; replace with live captures when the flow is implemented).

## Reference
- OAuth 2.0 3LO: https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/
- Scopes: https://developer.atlassian.com/cloud/confluence/scopes-for-oauth-2-3LO-and-forge-apps/
