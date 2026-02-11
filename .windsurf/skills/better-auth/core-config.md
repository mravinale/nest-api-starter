# Core Configuration & Integration Guide

**Always consult [better-auth.com/docs](https://better-auth.com/docs) for code examples and latest API.**

Better Auth is a TypeScript-first, framework-agnostic auth framework supporting email/password, OAuth, magic links, passkeys, and more via plugins.

## Core Config Options

| Option | Notes |
|--------|-------|
| `appName` | Optional display name |
| `baseURL` | Only if `BETTER_AUTH_URL` not set |
| `basePath` | Default `/api/auth`. Set `/` for root. |
| `secret` | Only if `BETTER_AUTH_SECRET` not set |
| `database` | Required for most features. See adapters docs. |
| `secondaryStorage` | Redis/KV for sessions & rate limits |
| `emailAndPassword` | `{ enabled: true }` to activate |
| `socialProviders` | `{ google: { clientId, clientSecret }, ... }` |
| `plugins` | Array of plugins |
| `trustedOrigins` | CSRF whitelist |

## Session Management

**Storage priority:**
1. If `secondaryStorage` defined → sessions go there (not DB)
2. Set `session.storeSessionInDatabase: true` to also persist to DB
3. No database + `cookieCache` → fully stateless mode

**Cookie cache strategies:**
- `compact` (default) – Base64url + HMAC. Smallest.
- `jwt` – Standard JWT. Readable but signed.
- `jwe` – Encrypted. Maximum security.

**Key options:** `session.expiresIn` (default 7 days), `session.updateAge` (refresh interval), `session.cookieCache.maxAge`, `session.cookieCache.version` (change to invalidate all sessions).

## User & Account Config

**User:** `user.modelName`, `user.fields` (column mapping), `user.additionalFields`, `user.changeEmail.enabled` (disabled by default), `user.deleteUser.enabled` (disabled by default).

**Account:** `account.modelName`, `account.accountLinking.enabled`, `account.storeAccountCookie` (for stateless OAuth).

**Required for registration:** `email` and `name` fields.

## Email Flows

- `emailVerification.sendVerificationEmail` – Must be defined for verification to work
- `emailVerification.sendOnSignUp` / `sendOnSignIn` – Auto-send triggers
- `emailAndPassword.sendResetPassword` – Password reset email handler

## Security Quick Reference

**In `advanced`:**
- `useSecureCookies` – Force HTTPS cookies
- `disableCSRFCheck` – ⚠️ Security risk
- `disableOriginCheck` – ⚠️ Security risk
- `crossSubDomainCookies.enabled` – Share cookies across subdomains
- `ipAddress.ipAddressHeaders` – Custom IP headers for proxies
- `database.generateId` – Custom ID generation or `"serial"`/`"uuid"`/`false`

**Rate limiting:** `rateLimit.enabled`, `rateLimit.window`, `rateLimit.max`, `rateLimit.storage` ("memory" | "database" | "secondary-storage").

## Hooks

**Endpoint hooks:** `hooks.before` / `hooks.after` – Array of `{ matcher, handler }`. Use `createAuthMiddleware`. Access `ctx.path`, `ctx.context.returned` (after), `ctx.context.session`.

**Database hooks:** `databaseHooks.user.create.before/after`, same for `session`, `account`. Useful for adding default values or post-creation actions.

**Hook context (`ctx.context`):** `session`, `secret`, `authCookies`, `password.hash()`/`verify()`, `adapter`, `internalAdapter`, `generateId()`, `tables`, `baseURL`.

## Plugins

**Import from dedicated paths for tree-shaking:**
```ts
import { twoFactor } from "better-auth/plugins/two-factor"
```
NOT `from "better-auth/plugins"`.

**Common plugins:**

| Plugin | Server Import | Client Import | Purpose |
|--------|---------------|---------------|---------|
| `twoFactor` | `better-auth/plugins` | `twoFactorClient` | 2FA with TOTP/OTP |
| `organization` | `better-auth/plugins` | `organizationClient` | Teams/orgs |
| `admin` | `better-auth/plugins` | `adminClient` | User management |
| `bearer` | `better-auth/plugins` | - | API token auth |
| `openAPI` | `better-auth/plugins` | - | API docs |
| `passkey` | `@better-auth/passkey` | `passkeyClient` | WebAuthn |
| `sso` | `@better-auth/sso` | - | Enterprise SSO |

**Other popular plugins:** `magicLink`, `emailOtp`, `username`, `phoneNumber`, `apiKey`, `jwt`, `multiSession`, `oauthProvider`, `oidcProvider`, `genericOAuth`.

**Plugin pattern:** Server plugin + client plugin + run migrations.

## Type Safety

Infer types: `typeof auth.$Infer.Session`, `typeof auth.$Infer.Session.user`.

For separate client/server projects: `createAuthClient<typeof auth>()`.

## Common Gotchas

1. **Model vs table name** – Config uses ORM model name, not DB table name
2. **Plugin schema** – Re-run CLI after adding plugins
3. **Secondary storage** – Sessions go there by default, not DB
4. **Cookie cache** – Custom session fields NOT cached, always re-fetched
5. **Stateless mode** – No DB = session in cookie only, logout on cache expiry
6. **Change email flow** – Sends to current email first, then new email
