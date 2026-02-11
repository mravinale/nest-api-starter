# Getting Started & Project Setup

## Decision Tree

```
Is this a new/empty project?
├─ YES → New project setup
│   1. Identify framework
│   2. Choose database
│   3. Install better-auth
│   4. Create auth.ts + auth-client.ts
│   5. Set up route handler
│   6. Run CLI migrate/generate
│   7. Add features via plugins
│
└─ NO → Does project have existing auth?
    ├─ YES → Migration/enhancement
    │   • Audit current auth for gaps
    │   • Plan incremental migration
    │   • See migration guides in docs
    │
    └─ NO → Add auth to existing project
        1. Analyze project structure
        2. Install better-auth
        3. Create auth config
        4. Add route handler
        5. Run schema migrations
        6. Integrate into existing pages
```

## Installation

**Core:** `npm install better-auth`

**Scoped packages (as needed):**

| Package | Use case |
|---------|----------|
| `@better-auth/passkey` | WebAuthn/Passkey auth |
| `@better-auth/sso` | SAML/OIDC enterprise SSO |
| `@better-auth/stripe` | Stripe payments |
| `@better-auth/scim` | SCIM user provisioning |
| `@better-auth/expo` | React Native/Expo |

## Environment Variables

```env
BETTER_AUTH_SECRET=<32+ chars, generate with: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL=<your database connection string>
```

Add OAuth secrets as needed: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, etc.

Only define `baseURL`/`secret` in config if env vars are NOT set.

## File Location

CLI looks for `auth.ts` in: `./`, `./lib`, `./utils`, or under `./src`. Use `--config` for custom path.

## CLI Commands

- `npx @better-auth/cli@latest migrate` – Apply schema (built-in adapter)
- `npx @better-auth/cli@latest generate` – Generate schema for Prisma/Drizzle
- `npx @better-auth/cli mcp --cursor` – Add MCP to AI tools

**Re-run after adding/changing plugins.**

## Server Config (auth.ts)

**Location:** `lib/auth.ts` or `src/lib/auth.ts`

**Minimal config needs:**
- `database` – Connection or adapter
- `emailAndPassword: { enabled: true }` – For email/password auth

**Standard config adds:**
- `socialProviders` – OAuth providers (google, github, etc.)
- `emailVerification.sendVerificationEmail` – Email verification handler
- `emailAndPassword.sendResetPassword` – Password reset handler

**Full config adds:**
- `plugins` – Array of feature plugins
- `session` – Expiry, cookie cache settings
- `account.accountLinking` – Multi-provider linking
- `rateLimit` – Rate limiting config

**Export types:** `export type Session = typeof auth.$Infer.Session`

## Client Config (auth-client.ts)

**Import by framework:**

| Framework | Import |
|-----------|--------|
| React/Next.js | `better-auth/react` |
| Vue | `better-auth/vue` |
| Svelte | `better-auth/svelte` |
| Solid | `better-auth/solid` |
| Vanilla JS | `better-auth/client` |

**Client plugins** go in `createAuthClient({ plugins: [...] })`.

**Common exports:** `signIn`, `signUp`, `signOut`, `useSession`, `getSession`

## Route Handler Setup

| Framework | File | Handler |
|-----------|------|---------|
| Next.js App Router | `app/api/auth/[...all]/route.ts` | `toNextJsHandler(auth)` → export `{ GET, POST }` |
| Next.js Pages | `pages/api/auth/[...all].ts` | `toNextJsHandler(auth)` → default export |
| Express | Any file | `app.all("/api/auth/*", toNodeHandler(auth))` |
| SvelteKit | `src/hooks.server.ts` | `svelteKitHandler(auth)` |
| SolidStart | Route file | `solidStartHandler(auth)` |
| Hono | Route file | `auth.handler(c.req.raw)` |

**Next.js Server Components:** Add `nextCookies()` plugin to auth config.

## Database Migrations

| Adapter | Command |
|---------|---------|
| Built-in Kysely | `npx @better-auth/cli@latest migrate` (applies directly) |
| Prisma | `npx @better-auth/cli@latest generate --output prisma/schema.prisma` then `npx prisma migrate dev` |
| Drizzle | `npx @better-auth/cli@latest generate --output src/db/auth-schema.ts` then `npx drizzle-kit push` |

## Database Adapters

| Database | Setup |
|----------|-------|
| SQLite | Pass `better-sqlite3` or `bun:sqlite` instance directly |
| PostgreSQL | Pass `pg.Pool` instance directly |
| MySQL | Pass `mysql2` pool directly |
| Prisma | `prismaAdapter(prisma, { provider: "postgresql" })` from `better-auth/adapters/prisma` |
| Drizzle | `drizzleAdapter(db, { provider: "pg" })` from `better-auth/adapters/drizzle` |
| MongoDB | `mongodbAdapter(db)` from `better-auth/adapters/mongodb` |

**Critical:** Better Auth uses adapter model names, NOT underlying table names. If Prisma model is `User` mapping to table `users`, use `modelName: "user"` (Prisma reference), not `"users"`.

## Auth UI Implementation

**Sign in flow:**
1. `signIn.email({ email, password })` or `signIn.social({ provider, callbackURL })`
2. Handle `error` in response
3. Redirect on success

**Session check (client):** `useSession()` hook returns `{ data: session, isPending }`

**Session check (server):** `auth.api.getSession({ headers: await headers() })`

**Protected routes:** Check session, redirect to `/sign-in` if null.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Secret not set" | Add `BETTER_AUTH_SECRET` env var |
| "Invalid Origin" | Add domain to `trustedOrigins` |
| Cookies not setting | Check `baseURL` matches domain; enable secure cookies in prod |
| OAuth callback errors | Verify redirect URIs in provider dashboard |
| Type errors after adding plugin | Re-run CLI generate/migrate |
