# Backend token management (added)

This backend now supports simple encrypted token storage and management.

Files:
- data/tokens.enc  -> encrypted JSON storing tokens and metadata (created automatically)

Endpoints:
- GET  /api/tokens
    Returns list of stored accounts (id, account_name, ig_user_id, created_at)

- POST /api/tokens
    Body: { "account_name": "My Insta", "access_token": "EAA..."}
    Saves the token encrypted. Returns {ok:true, id}

- DELETE /api/tokens/:id
    Removes stored token entry by id.

- POST /auth/exchange_token
    Body: { "access_token": "short_lived_token" }
    Exchanges a short-lived token for a long-lived token using META_APP_ID and META_APP_SECRET in env.
    Returns the Graph API response (access_token, expires_in, ...)

- GET  /api/insights/:id
    Uses the stored token (by internal id) to resolve the instagram_business_account (if missing),
    fetch recent media and per-media insights, and profile-level insights where available.

Security:
- Tokens encrypted at rest using AES-256-GCM with a secret derived from JWT_SECRET env var.
- Ensure JWT_SECRET is long and kept out of source control (set it as an env variable in Render or your host).

Notes:
- This is a starter implementation for a private-use tool (owned by you). It is not intended to be used as a multi-tenant public app without additional hardening.
- For production-grade use, replace file storage with a proper DB and secrets manager.
