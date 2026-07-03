# 01 — Authentication

## Purpose
Every MarkSync request authenticates to Confluence Cloud. MVP uses an **Atlassian API token + Basic auth** against the **direct site URL**. Scoped tokens and OAuth 2.0 (3LO) use the **gateway URL** and are documented for later phases.

## Status: CURRENT

## 1A. API token + Basic auth (MVP path) — proven live

- **Base URL:** `https://{site}.atlassian.net`  (paths prefixed with `/wiki/...`)
- **Header:** `Authorization: Basic base64("{email}:{api-token}")`
- **Token source:** Atlassian → Manage account → Security → **API token** (classic, unscoped) — or the newer "Create API token with scopes" (see 1B).

### Verbatim — current user check (auth sanity)
Evidence: `A1-01-me.json`

```http
GET /wiki/rest/api/user/current HTTP/1.1
Host: cwiakalski.atlassian.net
Authorization: Basic <redacted>
Accept: application/json
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
```
```json
{
  "type": "known",
  "accountId": "557058:593d9e9f-9a80-46c5-839e-ec2cf675b021",
  "accountType": "atlassian",
  "displayName": "Juliusz Ćwiąkalski (CEO/CTO)",
  "publicName": "juliusz cwiakalski",
  "_links": { "self": "https://cwiakalski.atlassian.net/wiki/rest/api/user" }
}
```

> Note: the documented v2 `GET /wiki/api/v2/user/by-me` is **undocumented/unstable** and returned `400` in the spike. Use the v1 `/user/current` above (V1-ONLY, still the supported current endpoint).

## 1B. Scoped API token + gateway

- **Base URL:** `https://api.atlassian.com/ex/confluence/{cloudId}`  (paths prefixed with `/wiki/...`)
- **Auth header:** identical Basic auth with the scoped token.
- **cloudId discovery:** `GET https://{site}.atlassian.net/_edge/tenant_info` → `{ "cloudId": "af818fbb-..." }` (works but **undocumented**). For OAuth 3LO use the documented `GET https://api.atlassian.com/oauth/token/accessible-resources` (Bearer).
- **Requirement:** the token **must be created with the required scopes selected** (Atlassian → API tokens → *Create API token with scopes* → select scopes). A scoped token without scopes returns:
  ```http
  HTTP/1.1 401 Unauthorized
  {"code":401,"message":"Unauthorized; scope does not match"}
  ```
  (Observed in the spike — the token authenticated but had no usable scopes.)

## 1C. Required scopes

| Operation | Classic scope | Granular scope |
|---|---|---|
| Page read/create/update/delete | `read:confluence-content.all` / `write:confluence-content` | `read:page:confluence` / `write:page:confluence` / `delete:page:confluence` |
| Space | `read:confluence-space.summary` | `read:space:confluence` |
| Content properties | `read:confluence-props` / `write:confluence-props` | `read:content.property:confluence` / `write:content.property:confluence` |
| Attachment read / upload / download | `write:confluence-file` / `readonly:content.attachment:confluence` | `read:attachment:confluence` / `write:attachment:confluence` / `delete:attachment:confluence` |
| Labels | `read:confluence-content.summary` | `read:label:confluence` / `write:label:confluence` |
| Search | `search:confluence` | (none granular) |
| Restrictions | `read:confluence-content.permission` | `read:content.restriction:confluence` |

**Recommended minimal scoped-token set (7 classic scopes):** `read:confluence-space.summary`, `read:confluence-content.all`, `read:confluence.user`, `read:confluence-props`, `write:confluence-content`, `write:confluence-props`, `write:confluence-file`. (See `CREDENTIALS.md` §3.1.)

## Error handling
- `401 Unauthorized` → bad token/email, **or** scoped token missing the required scope ("scope does not match").
- `403 Forbidden` → authenticated but lacks the Confluence space/page permission.
- MarkSync must distinguish these (`doctor` guidance) and **never log the `Authorization` value**.

## Implementation / mock contract
- Adapter takes `(baseUrl, email, token)` (Basic) or `(gatewayBaseUrl, accessToken)` (Bearer).
- All requests inject `Authorization`, `Accept: application/json`, `User-Agent: marksync/<version>`.
- Mocks: a `401 {"message":"Unauthorized; scope does not match"}` fixture models the scoped-token-without-scopes case; a `200` `user/current` fixture models a healthy credential.

## Reference
- Basic auth: https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/
- Scoped API tokens: https://support.atlassian.com/confluence/kb/scoped-api-tokens-in-confluence-cloud/
- Scopes: https://developer.atlassian.com/cloud/confluence/scopes-for-oauth-2-3LO-and-forge-apps/
- OAuth 3LO: see [18-oauth-3lo.md](./18-oauth-3lo.md)
