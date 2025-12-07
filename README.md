# 🚀 NestJS API Starter with Better Auth

A production-ready **NestJS** API starter with complete authentication using **Better Auth**, **PostgreSQL**, and **Resend** for email services.

---

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Technology Stack](#-technology-stack)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Authentication](#-authentication)
- [API Endpoints](#-api-endpoints)
- [Environment Variables](#-environment-variables)
- [Testing](#-testing)
- [Development](#-development)

---

## ✨ Features

- **Complete Authentication** — Email/password with verification, password reset
- **Better Auth Integration** — Modern auth library with plugins
- **PostgreSQL Database** — Production-ready relational database
- **Email Service** — Resend integration for transactional emails
- **JWT Support** — Token-based authentication for APIs
- **Organization Support** — Multi-tenant organization management
- **Admin Panel** — Built-in admin endpoints
- **OpenAPI Documentation** — Auto-generated API docs
- **Type Safety** — Full TypeScript support

---

## 🏃 Quick Start

### Prerequisites

- **Node.js** >= 18.x
- **PostgreSQL** >= 14.x
- **npm** >= 9.x

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd nestjs-api-starter
npm install
```

### 2. Setup PostgreSQL Database

```bash
# Create database
createdb nestjs-api-starter

# Or using psql
psql -c "CREATE DATABASE \"nestjs-api-starter\";"
```

### 3. Configure Environment

Create a `.env` file in the project root:

```env
# Database Configuration
DATABASE_URL=postgresql://your-user@localhost:5432/nestjs-api-starter

# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000

# Better Auth Configuration
AUTH_SECRET=your-super-secret-key-change-in-production-min-32-chars

# Trusted Origins (comma-separated)
TRUSTED_ORIGINS=http://localhost:5173,http://localhost:5174

# Frontend URL (for email links)
FE_URL=http://localhost:5173

# Email Configuration (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxx
FROM_EMAIL=noreply@yourdomain.com
```

### 4. Run Database Migrations

```bash
npx @better-auth/cli migrate --config src/auth.ts -y
```

### 5. Start Development Server

```bash
npm run start:dev
```

The API will be available at **http://localhost:3000**

### 6. Verify Installation

```bash
# Check auth endpoint
curl http://localhost:3000/api/auth/ok

# View API documentation
open http://localhost:3000/api/auth/reference
```

---

## 🛠️ Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| **NestJS** | 11.x | Backend framework |
| **TypeScript** | 5.x | Type safety |
| **Better Auth** | 1.x | Authentication |
| **PostgreSQL** | 14+ | Database |
| **pg** | 8.x | PostgreSQL client |
| **Resend** | 4.x | Email service |
| **Jest** | 29.x | Testing |

### Better Auth Plugins

| Plugin | Purpose |
|--------|---------|
| **bearer** | Bearer token authentication |
| **jwt** | JWT token generation |
| **openAPI** | API documentation |
| **organization** | Multi-tenant support |
| **admin** | Admin panel endpoints |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    NestJS Application                    │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ AppModule   │  │ AuthModule  │  │ ConfigModule    │  │
│  │             │  │ (BetterAuth)│  │ (Environment)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│                          │                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │                   EmailModule                        ││
│  │  ┌─────────────┐  ┌─────────────────────────────┐   ││
│  │  │EmailService │──│ Resend (Password Reset,     │   ││
│  │  │             │  │ Verification, Invitations)  │   ││
│  │  └─────────────┘  └─────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│                    PostgreSQL Database                   │
│  ┌────────┐ ┌─────────┐ ┌────────────┐ ┌────────────┐   │
│  │ user   │ │ session │ │ account    │ │verification│   │
│  └────────┘ └─────────┘ └────────────┘ └────────────┘   │
│  ┌────────┐ ┌─────────┐ ┌────────────┐ ┌────────────┐   │
│  │ jwks   │ │ org     │ │ member     │ │ invitation │   │
│  └────────┘ └─────────┘ └────────────┘ └────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| **AppModule** | Main application module, wires everything together |
| **AuthModule** | Better Auth integration via `@thallesp/nestjs-better-auth` |
| **ConfigModule** | Environment variable management and validation |
| **EmailModule** | Email sending via Resend |

---

## 📁 Project Structure

```
nestjs-api-starter/
├── src/
│   ├── auth.ts              # Better Auth configuration
│   ├── main.ts              # Application entry point
│   ├── app.module.ts        # Main module
│   ├── app.controller.ts    # App controller
│   ├── app.service.ts       # App service
│   │
│   ├── config/              # Configuration module
│   │   ├── config.module.ts
│   │   ├── config.service.ts
│   │   └── index.ts
│   │
│   └── email/               # Email module
│       ├── email.module.ts
│       ├── email.service.ts
│       ├── email.interfaces.ts
│       └── index.ts
│
├── .env                     # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔐 Authentication

### Authentication Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Signup  │────▶│  Email   │────▶│  Verify  │────▶│  Login   │
│          │     │  Sent    │     │  Email   │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                         │
                                                         ▼
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Forgot  │────▶│  Reset   │────▶│  Set New │────▶│  Login   │
│ Password │     │  Email   │     │ Password │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### Session Management

Better Auth uses **httpOnly cookies** for secure session management:

- Sessions are stored in the database
- Cookies are automatically set on login
- CSRF protection is built-in
- Sessions can be revoked server-side

### Email Verification

When `requireEmailVerification` is enabled:
1. User signs up
2. Verification email is sent
3. User clicks verification link
4. Email is marked as verified
5. User can now login

---

## 📡 API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/sign-up/email` | Register new user |
| POST | `/api/auth/sign-in/email` | Login with email/password |
| POST | `/api/auth/sign-out` | Logout |
| GET | `/api/auth/get-session` | Get current session |
| POST | `/api/auth/request-password-reset` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/verify-email` | Verify email with token |
| GET | `/api/auth/token` | Get JWT token |
| GET | `/api/auth/jwks` | Get JSON Web Key Set |

### Organization Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/organization/create` | Create organization |
| POST | `/api/auth/organization/invite-member` | Invite member |
| POST | `/api/auth/organization/accept-invitation` | Accept invitation |
| GET | `/api/auth/organization/list` | List user's organizations |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/admin/list-users` | List all users |
| POST | `/api/auth/admin/ban-user` | Ban a user |
| POST | `/api/auth/admin/unban-user` | Unban a user |
| POST | `/api/auth/admin/set-user-password` | Set user password |

### Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/reference` | OpenAPI documentation UI |
| GET | `/api/auth/ok` | Health check |

---

## ⚙️ Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string | `postgresql://user@localhost:5432/db` |
| `AUTH_SECRET` | ✅ | Secret for signing tokens (min 32 chars) | `your-super-secret-key...` |
| `PORT` | ❌ | Server port | `3000` |
| `BASE_URL` | ❌ | API base URL | `http://localhost:3000` |
| `TRUSTED_ORIGINS` | ❌ | Allowed CORS origins (comma-separated) | `http://localhost:5173` |
| `FE_URL` | ❌ | Frontend URL for email links | `http://localhost:5173` |
| `RESEND_API_KEY` | ❌ | Resend API key for emails | `re_xxxxx` |
| `FROM_EMAIL` | ❌ | Sender email address | `noreply@example.com` |

---

## 🧪 Testing

### Run Tests

```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:cov
```

### Test Configuration

Tests use Jest with ESM support for Better Auth compatibility:

```json
{
  "test": "node --experimental-vm-modules node_modules/.bin/jest"
}
```

---

## 💻 Development

### Available Scripts

```bash
# Development
npm run start:dev     # Start with hot reload
npm run start         # Start without hot reload
npm run start:prod    # Start production build

# Build
npm run build         # Build for production

# Testing
npm run test          # Run tests
npm run test:watch    # Watch mode
npm run test:cov      # Coverage report

# Linting
npm run lint          # Run ESLint
npm run format        # Format with Prettier

# Database
npx @better-auth/cli migrate --config src/auth.ts -y  # Run migrations
npx @better-auth/cli generate --config src/auth.ts    # Generate schema
```

### Adding New Features

1. Create a new module: `nest g module feature-name`
2. Create a controller: `nest g controller feature-name`
3. Create a service: `nest g service feature-name`
4. Import module in `AppModule`

### Database Schema

To view or modify the database schema:

```bash
# Connect to database
psql -h localhost -U your-user -d nestjs-api-starter

# List tables
\dt

# Describe a table
\d user
```

---

## 🔗 Related Projects

- **[spa-api-starter](../spa-api-starter)** — React SPA frontend for this API
- **[Better Auth](https://better-auth.com)** — Authentication library
- **[NestJS](https://nestjs.com)** — Backend framework

---

## 📝 License

MIT
