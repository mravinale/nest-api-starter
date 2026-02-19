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
  organization: ["create", "list", "get", "update", "invite"],
  role: ["list", "get"],
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

// Manager role - can manage users/sessions within their organization
export const managerRole = ac.newRole({
  user: ["create", "list", "get", "update", "ban", "set-role", "set-password"],
  session: ["list", "revoke"],
  organization: ["create", "list", "get", "update", "invite"],
  role: ["list", "get"],
});

// Member role - basic org member
export const memberRole = ac.newRole({
  role: ["list", "get"],
});

/**
 * All available roles
 */
export const roles = {
  admin: adminRole,
  manager: managerRole,
  member: memberRole,
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
  manager: {
    name: "Manager",
    description: "Can manage everything within their organization",
    color: "blue",
  },
  member: {
    name: "Member",
    description: "Basic access within an organization",
    color: "gray",
  },
} as const;

export type RoleName = keyof typeof roles;
export type Statement = typeof statement;
