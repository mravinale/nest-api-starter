import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export const auth = betterAuth({
    database: new Database("sqlite.db"),
    baseURL: "http://localhost:3000",
    basePath: "/api/auth",
    trustedOrigins: ["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    emailAndPassword: {
        enabled: true,
    },
});
