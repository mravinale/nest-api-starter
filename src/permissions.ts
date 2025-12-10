import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

/**
 * RBAC Permission Statements
 * 
 * Defines all resources and their available actions.
 * Uses Better Auth's access control system.
 */
export const statement = {
  ...defaultStatements,
  // Custom resources can be added here
  // e.g., project: ["create", "read", "update", "delete"],
} as const;

/**
 * Access Controller instance
 */
export const ac = createAccessControl(statement);

/**
 * Role Definitions
 * 
 * Each role defines what permissions it has for each resource.
 */

// Admin role - full access to all resources
export const adminRole = ac.newRole({
  ...adminAc.statements,
});

// User role - basic user with no admin permissions
export const userRole = ac.newRole({
  // Users have no admin permissions by default
});

// Moderator role - can manage users but not delete or impersonate
export const moderatorRole = ac.newRole({
  user: ["list", "ban"],
  session: ["list", "revoke"],
});

/**
 * All available roles
 */
export const roles = {
  admin: adminRole,
  user: userRole,
  moderator: moderatorRole,
} as const;

/**
 * Role metadata for UI display
 */
export const roleMetadata = {
  admin: {
    name: "Admin",
    description: "Full access to all resources and actions",
    color: "red",
  },
  user: {
    name: "User",
    description: "Basic user with no administrative permissions",
    color: "gray",
  },
  moderator: {
    name: "Moderator",
    description: "Can manage users and sessions, but cannot delete or impersonate",
    color: "blue",
  },
} as const;

export type RoleName = keyof typeof roles;
export type Statement = typeof statement;
