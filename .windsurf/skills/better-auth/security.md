# Security Best Practices

## Secret Management

The auth secret is the foundation of Better Auth's security. It's used for signing session tokens, encrypting sensitive data, and generating secure cookies.

### Configuring the Secret

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
});
```

Better Auth looks for secrets in this order:
1. `options.secret` in your config
2. `BETTER_AUTH_SECRET` environment variable
3. `AUTH_SECRET` environment variable

### Secret Requirements

Better Auth validates your secret and will:
- **Reject** default/placeholder secrets in production
- **Warn** if the secret is shorter than 32 characters
- **Warn** if entropy is below 120 bits

Generate a secure secret:

```bash
openssl rand -base64 32
```

**Important**: Never commit secrets to version control. Use environment variables or a secrets manager.

## Rate Limiting

Rate limiting protects your authentication endpoints from brute-force attacks and abuse. By default, rate limiting is not enabled. To enable it, set `rateLimit.enabled` to `true`. Better Auth applies rate limiting to all endpoints by default. Each plugin can optionally have its own configuration to adjust rate-limit rules for a given endpoint.

### Default Configuration

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  rateLimit: {
    enabled: true,
    window: 10, // Time window in seconds (default: 10)
    max: 100, // Max requests per window (default: 100)
  },
});
```

### Storage Options

```ts
rateLimit: {
  storage: "database", // Options: "memory", "database", "secondary-storage"
}
```

- **`memory`**: Fast, but resets on server restart (default when no secondary storage)
- **`database`**: Persistent, but adds database load
- **`secondary-storage`**: Uses configured secondary storage like Redis (default when available)

**Note**: It is not recommended to use `memory` especially on serverless platforms.

### Custom Storage

```ts
rateLimit: {
  customStorage: {
    get: async (key) => {
      // Return { count: number, expiresAt: number } or null
    },
    set: async (key, data) => {
      // Store the rate limit data
    },
  },
}
```

### Per-Endpoint Rules

Better Auth applies stricter limits to sensitive endpoints by default:
- `/sign-in`, `/sign-up`, `/change-password`, `/change-email`: 3 requests per 10 seconds

Override or customize rules for specific paths:

```ts
rateLimit: {
  customRules: {
    "/api/auth/sign-in/email": { window: 60, max: 5 },
    "/api/auth/some-safe-endpoint": false, // Disable rate limiting
  },
}
```

## CSRF Protection

Better Auth implements multiple layers of CSRF protection.

### How CSRF Protection Works

1. **Origin Header Validation**: When cookies are present, the `Origin` or `Referer` header must match a trusted origin
2. **Fetch Metadata**: Uses `Sec-Fetch-Site`, `Sec-Fetch-Mode`, and `Sec-Fetch-Dest` headers to detect cross-site requests
3. **First-Login Protection**: Even without cookies, validates origin when Fetch Metadata indicates a cross-site navigation

### Configuration

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  advanced: {
    disableCSRFCheck: false, // Default: false (keep enabled)
  },
});
```

**Warning**: Only disable CSRF protection for testing or if you have an alternative CSRF mechanism in place.

### Fetch Metadata Blocking

Better Auth automatically blocks requests where:
- `Sec-Fetch-Site: cross-site` AND `Sec-Fetch-Mode: navigate` AND `Sec-Fetch-Dest: document`

This prevents form-based CSRF attacks even on first login when no session cookie exists.

## Trusted Origins

Trusted origins control which domains can make authenticated requests. This protects against open redirect attacks and cross-origin abuse.

### Configuring Trusted Origins

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  baseURL: "https://api.example.com",
  trustedOrigins: [
    "https://app.example.com",
    "https://admin.example.com",
  ],
});
```

**Note**: The `baseURL` origin is automatically trusted.

### Environment Variable

```bash
BETTER_AUTH_TRUSTED_ORIGINS=https://app.example.com,https://admin.example.com
```

### Wildcard Patterns

```ts
trustedOrigins: [
  "*.example.com",
  "https://*.example.com",
  "exp://192.168.*.*:*/*", // Custom schemes (e.g., Expo)
]
```

### Dynamic Trusted Origins

```ts
trustedOrigins: async (request) => {
  const tenant = getTenantFromRequest(request);
  return [`https://${tenant}.myapp.com`];
}
```

### What Gets Validated

Better Auth validates these URL parameters against trusted origins: `callbackURL`, `redirectTo`, `errorCallbackURL`, `newUserCallbackURL`, `origin`, and more. Invalid URLs receive a 403 Forbidden response.

## Session Security

### Session Expiration

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days (default)
    updateAge: 60 * 60 * 24, // Refresh session every 24 hours (default)
  },
});
```

### Fresh Sessions for Sensitive Actions

```ts
session: {
  freshAge: 60 * 60 * 24, // 24 hours (default)
}
```

Use this to require re-authentication for actions like changing passwords or viewing sensitive data.

### Session Caching Strategies

```ts
session: {
  cookieCache: {
    enabled: true,
    maxAge: 60 * 5, // 5 minutes
    strategy: "compact", // Options: "compact", "jwt", "jwe"
  },
}
```

- **`compact`**: Base64url + HMAC-SHA256 (smallest, signed)
- **`jwt`**: HS256 JWT (standard, signed)
- **`jwe`**: A256CBC-HS512 encrypted (largest, encrypted)

**Note**: Use `jwe` strategy when session data contains sensitive information that shouldn't be readable client-side.

## Cookie Security

### Default Cookie Settings

- **`secure`**: `true` when baseURL uses HTTPS or in production
- **`sameSite`**: `"lax"` (prevents CSRF while allowing normal navigation)
- **`httpOnly`**: `true` (prevents JavaScript access)
- **`path`**: `"/"` (available site-wide)
- **Prefix**: `__Secure-` when secure is enabled

### Custom Cookie Configuration

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  advanced: {
    useSecureCookies: true,
    cookiePrefix: "myapp",
    defaultCookieAttributes: {
      sameSite: "strict",
      path: "/auth",
    },
  },
});
```

### Per-Cookie Configuration

```ts
advanced: {
  cookies: {
    session_token: {
      name: "auth-session",
      attributes: { sameSite: "strict" },
    },
  },
}
```

### Cross-Subdomain Cookies

```ts
advanced: {
  crossSubDomainCookies: {
    enabled: true,
    domain: ".example.com",
    additionalCookies: ["session_token", "session_data"],
  },
}
```

**Security Note**: Cross-subdomain cookies expand the attack surface. Only enable if you need authentication sharing and trust all subdomains.

## OAuth / Social Provider Security

### PKCE (Proof Key for Code Exchange)

Better Auth automatically uses PKCE for all OAuth flows:

1. Generates a 128-character random `code_verifier`
2. Creates a `code_challenge` using S256 (SHA-256)
3. Sends `code_challenge_method: "S256"` in the authorization URL
4. Validates the code exchange with the original verifier

### State Parameter Security

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  account: {
    storeStateStrategy: "cookie", // Options: "cookie" (default), "database"
  },
});
```

State tokens: are 32-character random strings, expire after 10 minutes, and contain callback URLs and PKCE verifier (encrypted).

### Encrypting OAuth Tokens

```ts
account: {
  encryptOAuthTokens: true, // Uses AES-256-GCM
}
```

**Recommendation**: Enable this if you store OAuth tokens for API access on behalf of users.

### Skipping State Cookie Check

```ts
account: {
  skipStateCookieCheck: true, // Not recommended for web apps
}
```

**Warning**: Only use this for mobile apps that cannot maintain cookies across redirects.

## IP-Based Security

### IP Address Configuration

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      disableIpTracking: false,
    },
  },
});
```

### IPv6 Subnet Configuration

```ts
advanced: {
  ipAddress: {
    ipv6Subnet: 64, // Options: 128, 64, 48, 32 (default: 64)
  },
}
```

### Trusted Proxy Headers

```ts
advanced: {
  trustedProxyHeaders: true, // Trust x-forwarded-host, x-forwarded-proto
}
```

**Security Note**: Only enable this if you trust your proxy.

## Database Hooks for Security Auditing

### Setting Up Audit Logging

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  databaseHooks: {
    session: {
      create: {
        after: async ({ data, ctx }) => {
          await auditLog("session.created", {
            userId: data.userId,
            ip: ctx?.request?.headers.get("x-forwarded-for"),
            userAgent: ctx?.request?.headers.get("user-agent"),
          });
        },
      },
      delete: {
        before: async ({ data }) => {
          await auditLog("session.revoked", { sessionId: data.id });
        },
      },
    },
    user: {
      update: {
        after: async ({ data, oldData }) => {
          if (oldData?.email !== data.email) {
            await auditLog("user.email_changed", {
              userId: data.id,
              oldEmail: oldData?.email,
              newEmail: data.email,
            });
          }
        },
      },
    },
    account: {
      create: {
        after: async ({ data }) => {
          await auditLog("account.linked", {
            userId: data.userId,
            provider: data.providerId,
          });
        },
      },
    },
  },
});
```

### Blocking Operations

Return `false` from a `before` hook to prevent an operation:

```ts
databaseHooks: {
  user: {
    delete: {
      before: async ({ data }) => {
        if (protectedUserIds.includes(data.id)) {
          return false;
        }
      },
    },
  },
}
```

## Background Tasks for Timing Attack Prevention

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  advanced: {
    backgroundTasks: {
      handler: (promise) => {
        // Vercel: waitUntil(promise)
        // Cloudflare: ctx.waitUntil(promise)
        waitUntil(promise);
      },
    },
  },
});
```

This ensures operations like sending emails don't affect response timing, which could leak information about whether a user exists.

## Account Enumeration Prevention

### Built-in Protections

1. **Consistent Response Messages**: Password reset always returns "If this email exists in our system, check your email for the reset link"
2. **Dummy Operations**: When a user isn't found, Better Auth still performs token generation and database lookups with dummy values
3. **Background Email Sending**: Emails are sent asynchronously to prevent timing differences

Return generic error messages like "Invalid credentials" rather than "User not found" or "Incorrect password".

## Complete Security Configuration Example

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: "https://api.example.com",
  trustedOrigins: [
    "https://app.example.com",
    "https://*.preview.example.com",
  ],

  rateLimit: {
    enabled: true,
    storage: "secondary-storage",
    customRules: {
      "/api/auth/sign-in/email": { window: 60, max: 5 },
      "/api/auth/sign-up/email": { window: 60, max: 3 },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60,
    cookieCache: {
      enabled: true,
      maxAge: 300,
      strategy: "jwe",
    },
  },

  account: {
    encryptOAuthTokens: true,
    storeStateStrategy: "cookie",
  },

  advanced: {
    useSecureCookies: true,
    cookiePrefix: "myapp",
    defaultCookieAttributes: { sameSite: "lax" },
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
      ipv6Subnet: 64,
    },
    backgroundTasks: {
      handler: (promise) => waitUntil(promise),
    },
  },

  databaseHooks: {
    session: {
      create: {
        after: async ({ data, ctx }) => {
          console.log(`New session for user ${data.userId}`);
        },
      },
    },
    user: {
      update: {
        after: async ({ data, oldData }) => {
          if (oldData?.email !== data.email) {
            console.log(`Email changed for user ${data.id}`);
          }
        },
      },
    },
  },
});
```

## Security Checklist

- [ ] **Secret**: Use a strong, unique secret (32+ characters, high entropy)
- [ ] **HTTPS**: Ensure `baseURL` uses HTTPS
- [ ] **Trusted Origins**: Configure all valid origins (frontend, mobile apps)
- [ ] **Rate Limiting**: Keep enabled with appropriate limits
- [ ] **CSRF Protection**: Keep enabled (`disableCSRFCheck: false`)
- [ ] **Secure Cookies**: Enabled automatically with HTTPS
- [ ] **OAuth Tokens**: Consider `encryptOAuthTokens: true` if storing tokens
- [ ] **Background Tasks**: Configure for serverless platforms
- [ ] **Audit Logging**: Implement via `databaseHooks` or `hooks`
- [ ] **IP Tracking**: Configure headers if behind a proxy
- [ ] **Email Verification**: Enabled
- [ ] **Password Reset**: Implemented
- [ ] **2FA**: For sensitive apps
- [ ] **Account Linking**: Reviewed
