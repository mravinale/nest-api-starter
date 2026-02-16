# Two-Factor Authentication

## Setting Up Two-Factor Authentication

Configure the `twoFactor` plugin with your app name as the issuer. This name appears in authenticator apps when users scan the QR code.

```ts
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
  appName: "My App",
  plugins: [
    twoFactor({
      issuer: "My App",
    }),
  ],
});
```

**Note**: After adding the plugin, run `npx @better-auth/cli migrate` to add the required database fields and tables.

### Client-Side Setup

```ts
import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/2fa";
      },
    }),
  ],
});
```

## Enabling 2FA for Users

```ts
const enable2FA = async (password: string) => {
  const { data, error } = await authClient.twoFactor.enable({ password });

  if (data) {
    // data.totpURI - Use this to generate a QR code
    // data.backupCodes - Display these to the user for safekeeping
  }
};
```

**Important**: The `twoFactorEnabled` flag is not set to `true` until the user successfully verifies their first TOTP code.

### Skipping Initial Verification

```ts
twoFactor({
  skipVerificationOnEnable: true, // Not recommended for most use cases
});
```

## TOTP (Authenticator App)

TOTP generates time-based codes using an authenticator app. Codes are valid for 30 seconds by default.

### Displaying the QR Code

```tsx
import QRCode from "react-qr-code";

const TotpSetup = ({ totpURI }: { totpURI: string }) => {
  return <QRCode value={totpURI} />;
};
```

### Verifying TOTP Codes

```ts
const verifyTotp = async (code: string) => {
  const { data, error } = await authClient.twoFactor.verifyTotp({
    code,
    trustDevice: true,
  });
};
```

### TOTP Configuration Options

```ts
twoFactor({
  totpOptions: {
    digits: 6, // 6 or 8 digits (default: 6)
    period: 30, // Code validity period in seconds (default: 30)
  },
});
```

## OTP (Email/SMS)

OTP sends a one-time code to the user's email or phone. You must implement the `sendOTP` function.

### Configuring OTP Delivery

```ts
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { sendEmail } from "./email";

export const auth = betterAuth({
  plugins: [
    twoFactor({
      otpOptions: {
        sendOTP: async ({ user, otp }, ctx) => {
          await sendEmail({
            to: user.email,
            subject: "Your verification code",
            text: `Your code is: ${otp}`,
          });
        },
        period: 5, // Code validity in minutes (default: 3)
        digits: 6,
        allowedAttempts: 5,
      },
    }),
  ],
});
```

### Sending and Verifying OTP

```ts
// Request OTP
const sendOtp = async () => {
  const { data, error } = await authClient.twoFactor.sendOtp();
};

// Verify OTP
const verifyOtp = async (code: string) => {
  const { data, error } = await authClient.twoFactor.verifyOtp({
    code,
    trustDevice: true,
  });
};
```

### OTP Storage Security

```ts
twoFactor({
  otpOptions: {
    storeOTP: "encrypted", // Options: "plain", "encrypted", "hashed"
  },
});
```

For custom encryption:

```ts
twoFactor({
  otpOptions: {
    storeOTP: {
      encrypt: async (token) => myEncrypt(token),
      decrypt: async (token) => myDecrypt(token),
    },
  },
});
```

## Backup Codes

Backup codes provide account recovery when users lose access to their authenticator app or phone. They are generated automatically when 2FA is enabled.

### Displaying Backup Codes

```tsx
const BackupCodes = ({ codes }: { codes: string[] }) => {
  return (
    <div>
      <p>Save these codes in a secure location:</p>
      <ul>
        {codes.map((code, i) => (
          <li key={i}>{code}</li>
        ))}
      </ul>
    </div>
  );
};
```

### Regenerating Backup Codes

```ts
const regenerateBackupCodes = async (password: string) => {
  const { data, error } = await authClient.twoFactor.generateBackupCodes({
    password,
  });
};
```

### Using Backup Codes for Recovery

```ts
const verifyBackupCode = async (code: string) => {
  const { data, error } = await authClient.twoFactor.verifyBackupCode({
    code,
    trustDevice: true,
  });
};
```

**Note**: Each backup code can only be used once.

### Backup Code Configuration

```ts
twoFactor({
  backupCodeOptions: {
    amount: 10,
    length: 10,
    storeBackupCodes: "encrypted", // Options: "plain", "encrypted"
  },
});
```

## Handling 2FA During Sign-In

```ts
const signIn = async (email: string, password: string) => {
  const { data, error } = await authClient.signIn.email(
    { email, password },
    {
      onSuccess(context) {
        if (context.data.twoFactorRedirect) {
          window.location.href = "/2fa";
        }
      },
    }
  );
};
```

### Server-Side 2FA Detection

```ts
const response = await auth.api.signInEmail({
  body: { email: "user@example.com", password: "password" },
});

if ("twoFactorRedirect" in response) {
  // Handle 2FA verification
}
```

## Trusted Devices

Pass `trustDevice: true` when verifying 2FA:

```ts
await authClient.twoFactor.verifyTotp({
  code: "123456",
  trustDevice: true,
});
```

### Configuring Trust Duration

```ts
twoFactor({
  trustDeviceMaxAge: 30 * 24 * 60 * 60, // 30 days in seconds (default)
});
```

## 2FA Security Considerations

### Session Management During 2FA Flow

1. User signs in with credentials
2. Session cookie is removed (not yet authenticated)
3. A temporary two-factor cookie is set (default: 10-minute expiration)
4. User verifies via TOTP, OTP, or backup code
5. Session cookie is created upon successful verification

```ts
twoFactor({
  twoFactorCookieMaxAge: 600, // 10 minutes in seconds (default)
});
```

### Encryption at Rest

- TOTP secrets are encrypted using symmetric encryption with your auth secret
- Backup codes are stored encrypted by default
- OTP codes can be configured for plain, encrypted, or hashed storage
- Better Auth uses constant-time comparison for OTP verification to prevent timing attacks

### Credential Account Requirement

Two-factor authentication can only be enabled for credential (email/password) accounts.

## Disabling 2FA

```ts
const disable2FA = async (password: string) => {
  const { data, error } = await authClient.twoFactor.disable({ password });
};
```

**Note**: When 2FA is disabled, trusted device records are revoked.

## Complete 2FA Configuration Example

```ts
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { sendEmail } from "./email";

export const auth = betterAuth({
  appName: "My App",
  plugins: [
    twoFactor({
      issuer: "My App",
      totpOptions: { digits: 6, period: 30 },
      otpOptions: {
        sendOTP: async ({ user, otp }) => {
          await sendEmail({
            to: user.email,
            subject: "Your verification code",
            text: `Your code is: ${otp}`,
          });
        },
        period: 5,
        allowedAttempts: 5,
        storeOTP: "encrypted",
      },
      backupCodeOptions: {
        amount: 10,
        length: 10,
        storeBackupCodes: "encrypted",
      },
      twoFactorCookieMaxAge: 600,
      trustDeviceMaxAge: 30 * 24 * 60 * 60,
    }),
  ],
});
```
