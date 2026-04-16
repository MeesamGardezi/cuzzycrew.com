# CuzzyCrew Admin Runbook

## Environment

Required in production:

- `SESSION_SECRET`: high-entropy secret used for signed admin session cookies and anonymized hashes.
- `ADMIN_USERNAME`: single admin username.
- `ADMIN_PASSWORD`: single admin password.

Optional:

- `PORT`: server port. Default `3000`.
- `SITE_URL`: canonical public site URL.
- `SHOP_URL`: merch/shop URL.
- `TRUST_PROXY`: set to `1` when the app is behind a trusted reverse proxy and you want proxy IP / geo headers honored.
- `VISITOR_SALT`: overrides the anonymization salt used for unique visitor hashes.
- `ADMIN_SESSION_IDLE_MINUTES`: idle timeout. Default `30`.
- `ADMIN_SESSION_ABSOLUTE_MINUTES`: absolute timeout. Default `480`.
- `ADMIN_LOGIN_WINDOW_MINUTES`: failed-login tracking window. Default `15`.
- `ADMIN_LOGIN_MAX_ATTEMPTS`: failures before lockout. Default `5`.
- `ADMIN_LOGIN_LOCK_MINUTES`: lockout duration. Default `15`.
- `ADMIN_API_WINDOW_MINUTES`: admin API rate-limit window. Default `5`.
- `ADMIN_API_MAX_REQUESTS`: admin API requests allowed per window. Default `120`.
- `ADMIN_PAGE_WINDOW_MINUTES`: admin page rate-limit window. Default `5`.
- `ADMIN_PAGE_MAX_REQUESTS`: admin page requests allowed per window. Default `240`.

Local development fallback:

- If `NODE_ENV` is not `production`, the app falls back to:
- Username: `admin`
- Password: `cuzzycrew-local-only`
- Session secret: `cuzzycrew-dev-session-secret`

## Run

1. Install dependencies.
2. Start the app with `npm run dev` or `npm start`.
3. Open `/admin/login`.
4. Log in with the configured admin credentials.

## What The Admin Covers

- Overview dashboard for key traffic and conversion KPIs.
- Contact workspace with search, filters, status workflow, notes, bulk updates, and CSV export.
- Analytics workspace for daily trends, countries, locations, section performance, and device/agent breakdowns.
- Security workspace for timeout policy visibility and recent audit activity.

## Security Controls

- Signed server-side session cookie, `HttpOnly`, `SameSite=Lax`, `Path=/admin`, `Secure` in production.
- Session rotation on login by issuing a fresh signed session identifier.
- Server-side idle timeout and absolute timeout.
- No-store cache headers on admin/auth responses.
- CSRF enforcement on mutating admin routes.
- Login throttling, lockout tracking, and admin route/API rate limiting.
- Generic invalid-credential response.
- Suspicious auth / CSRF / unauthorized-access audit events.

## JSON Stores

Files created under `data/`:

- `views.json`
- `subscribers.json`
- `contacts.json`
- `auth.json`
- `analytics.json`
- `geo-cache.json`
- `audit.json`

Boot behavior:

- Missing stores are created automatically.
- Empty files are replaced with safe defaults.
- Corrupt JSON files are backed up to `*.broken` before being reset to a safe structure.
- Writes are queued per store and written atomically using temp-file + rename.

## Manual QA Checklist

- Desktop:
- Log in, browse every admin section, log out, and confirm the browser back button does not reveal protected content.
- Verify contact filtering, pagination, detail view, note entry, status changes, bulk actions, and CSV export.
- Verify analytics with zero-data and non-zero-data states.

- Mobile:
- Check navigation, filters, tables, and contact detail screens at narrow widths.
- Confirm overflow handling and touch targets feel usable.

- Accessibility:
- Complete a keyboard-only pass across login, nav, filters, tables, detail forms, and logout.
- Confirm visible focus states, heading order, skip link behavior, and live/alert messaging.

- Security:
- Attempt invalid logins until lockout.
- Submit admin mutations without a CSRF token and verify rejection.
- Open a stale admin tab after logout or timeout and verify redirect / 401 behavior.

## Hardcoded Credential Caveat

This admin model is intentionally single-user and environment-backed. It is acceptable for lightweight internal operations, but it is not a substitute for multi-user identity, password rotation workflows, device/session management, or delegated roles.

## Future Multi-User Upgrade Path

Replace the single env-backed credential check with:

1. A dedicated admin users store with hashed passwords.
2. Password reset and rotation flows.
3. Role/permission middleware.
4. Per-user audit attribution and session revocation.
