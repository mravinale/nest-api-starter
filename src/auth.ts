import 'dotenv/config';
import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const auth = betterAuth({
    database: new Pool({
        connectionString: process.env.DATABASE_URL || "postgresql://mravinale@localhost:5432/nestjs-api-starter",
    }),
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    basePath: "/api/auth",
    trustedOrigins: process.env.TRUSTED_ORIGINS?.split(",") || [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    emailAndPassword: {
        enabled: true,
    },
});
