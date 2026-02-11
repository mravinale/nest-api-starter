---
name: better-auth
description: Comprehensive Better Auth skill for JavaScript/TypeScript projects. Covers project setup and installation, core configuration, security best practices, email/password authentication, two-factor authentication (TOTP, OTP, backup codes), organizations and teams with RBAC, authentication providers reference, and error handling guidance. Always consult https://better-auth.com/docs for the latest API.
---

# Better Auth – Complete Development Guide

This skill provides comprehensive guidance for implementing authentication with [Better Auth](https://better-auth.com/docs) in JavaScript/TypeScript projects.

## Skill Files

This skill is organized into the following topic files. **Reference the relevant file(s) based on the user's request:**

| File | When to use |
|------|-------------|
| `getting-started.md` | New project setup, installation, CLI, route handlers, DB adapters, framework integration, troubleshooting |
| `core-config.md` | Core config options, session management, user/account config, hooks, plugins, type safety, common gotchas |
| `email-password.md` | Email verification, password reset flows, password hashing, client-side validation, callback URLs |
| `security.md` | Secret management, rate limiting, CSRF, trusted origins, session/cookie security, OAuth security, IP tracking, audit logging, timing attacks, enumeration prevention |
| `two-factor.md` | TOTP, OTP (email/SMS), backup codes, trusted devices, 2FA sign-in flow, 2FA security considerations |
| `organizations.md` | Organizations, members, invitations, roles & permissions (RBAC), teams, dynamic access control, lifecycle hooks, schema customization |
| `providers.md` | Authentication providers reference (OAuth, email/password, magic link, passwordless, social) |
| `error-handling.md` | Better Auth error codes, common causes, solutions, error handling patterns |

## Quick Decision Guide

- **"Set up auth from scratch"** → `getting-started.md` + `core-config.md`
- **"Add email/password login"** → `email-password.md`
- **"Make it secure / production-ready"** → `security.md`
- **"Add 2FA"** → `two-factor.md`
- **"Add organizations / teams / roles"** → `organizations.md`
- **"Configure a social provider"** → `providers.md`
- **"I'm getting an error"** → `error-handling.md`

## Resources

- [Docs](https://better-auth.com/docs)
- [Options Reference](https://better-auth.com/docs/reference/options)
- [Examples](https://github.com/better-auth/examples)
- [Plugins](https://better-auth.com/docs/concepts/plugins)
- [CLI](https://better-auth.com/docs/concepts/cli)
- [Migration Guides](https://better-auth.com/docs/guides)
- [LLMs.txt](https://better-auth.com/llms.txt)
- [GitHub](https://github.com/better-auth/better-auth)
