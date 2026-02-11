# Organizations, Teams & RBAC

## Setting Up Organizations

```ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 5,
      membershipLimit: 100,
    }),
  ],
});
```

**Note**: After adding the plugin, run `npx @better-auth/cli migrate` to add the required database tables.

### Client-Side Setup

```ts
import { createAuthClient } from "better-auth/client";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
```

## Creating Organizations

Organizations are the top-level entity for grouping users. When created, the creator is automatically assigned the `owner` role.

```ts
const createOrg = async () => {
  const { data, error } = await authClient.organization.create({
    name: "My Company",
    slug: "my-company",
    logo: "https://example.com/logo.png",
    metadata: { plan: "pro" },
  });
};
```

### Controlling Organization Creation

```ts
organization({
  allowUserToCreateOrganization: async (user) => {
    return user.emailVerified === true;
  },
  organizationLimit: async (user) => {
    return user.plan === "premium" ? 20 : 3;
  },
});
```

### Creating Organizations on Behalf of Users

```ts
await auth.api.createOrganization({
  body: {
    name: "Client Organization",
    slug: "client-org",
    userId: "user-id-who-will-be-owner",
  },
});
```

**Note**: The `userId` parameter cannot be used alongside session headers.

## Active Organizations

The active organization is stored in the session and scopes subsequent API calls.

```ts
const setActive = async (organizationId: string) => {
  const { data, error } = await authClient.organization.setActive({
    organizationId,
  });
};
```

Many endpoints use the active organization when `organizationId` is not provided:

```ts
await authClient.organization.listMembers();
await authClient.organization.listInvitations();
await authClient.organization.inviteMember({ email: "user@example.com", role: "member" });
```

### Getting Full Organization Data

```ts
const { data } = await authClient.organization.getFullOrganization();
// data.organization, data.members, data.invitations, data.teams
```

## Members

### Adding Members (Server-Side)

```ts
await auth.api.addMember({
  body: {
    userId: "user-id",
    role: "member",
    organizationId: "org-id",
  },
});
```

### Assigning Multiple Roles

```ts
await auth.api.addMember({
  body: {
    userId: "user-id",
    role: ["admin", "moderator"],
    organizationId: "org-id",
  },
});
```

### Removing Members

```ts
await authClient.organization.removeMember({
  memberIdOrEmail: "user@example.com",
});
```

**Important**: The last owner cannot be removed. Assign the owner role to another member first.

### Updating Member Roles

```ts
await authClient.organization.updateMemberRole({
  memberId: "member-id",
  role: "admin",
});
```

### Membership Limits

```ts
organization({
  membershipLimit: async (user, organization) => {
    if (organization.metadata?.plan === "enterprise") {
      return 1000;
    }
    return 50;
  },
});
```

## Invitations

### Setting Up Invitation Emails

```ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { sendEmail } from "./email";

export const auth = betterAuth({
  plugins: [
    organization({
      sendInvitationEmail: async (data) => {
        const { email, organization, inviter, invitation } = data;
        await sendEmail({
          to: email,
          subject: `Join ${organization.name}`,
          html: `
            <p>${inviter.user.name} invited you to join ${organization.name}</p>
            <a href="https://yourapp.com/accept-invite?id=${invitation.id}">
              Accept Invitation
            </a>
          `,
        });
      },
    }),
  ],
});
```

### Sending Invitations

```ts
await authClient.organization.inviteMember({
  email: "newuser@example.com",
  role: "member",
});
```

### Creating Shareable Invitation URLs

```ts
const { data } = await authClient.organization.getInvitationURL({
  email: "newuser@example.com",
  role: "member",
  callbackURL: "https://yourapp.com/dashboard",
});
// Share data.url via any channel
```

**Note**: This endpoint does not call `sendInvitationEmail`. Handle delivery yourself.

### Accepting Invitations

```ts
await authClient.organization.acceptInvitation({
  invitationId: "invitation-id",
});
```

### Invitation Configuration

```ts
organization({
  invitationExpiresIn: 60 * 60 * 24 * 7, // 7 days (default: 48 hours)
  invitationLimit: 100,
  cancelPendingInvitationsOnReInvite: true,
});
```

## Roles & Permissions

The plugin provides role-based access control (RBAC) with three default roles:

| Role | Description |
|------|-------------|
| `owner` | Full access, can delete organization |
| `admin` | Can manage members, invitations, settings |
| `member` | Basic access to organization resources |

### Checking Permissions

```ts
const { data } = await authClient.organization.hasPermission({
  permission: "member:write",
});

if (data?.hasPermission) {
  // User can manage members
}
```

### Client-Side Permission Checks

For UI rendering without API calls:

```ts
const canManageMembers = authClient.organization.checkRolePermission({
  role: "admin",
  permissions: ["member:write"],
});
```

**Note**: For dynamic access control, the client-side role permission check will not work. Use the `hasPermission` endpoint.

## Teams

### Enabling Teams

```ts
organization({
  teams: { enabled: true },
});
```

### Creating Teams

```ts
const { data } = await authClient.organization.createTeam({
  name: "Engineering",
});
```

### Managing Team Members

```ts
// Add a member to a team (must be org member first)
await authClient.organization.addTeamMember({
  teamId: "team-id",
  userId: "user-id",
});

// Remove from team (stays in org)
await authClient.organization.removeTeamMember({
  teamId: "team-id",
  userId: "user-id",
});
```

### Active Teams

```ts
await authClient.organization.setActiveTeam({
  teamId: "team-id",
});
```

### Team Limits

```ts
organization({
  teams: {
    maximumTeams: 20,
    maximumMembersPerTeam: 50,
    allowRemovingAllTeams: false,
  },
});
```

## Dynamic Access Control

For applications needing custom roles per organization at runtime.

### Enabling Dynamic Access Control

```ts
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    organization({
      dynamicAccessControl: { enabled: true },
    }),
  ],
});
```

### Creating Custom Roles

```ts
await authClient.organization.createRole({
  role: "moderator",
  permission: {
    member: ["read"],
    invitation: ["read"],
  },
});
```

### Updating and Deleting Roles

```ts
await authClient.organization.updateRole({
  roleId: "role-id",
  permission: { member: ["read", "write"] },
});

await authClient.organization.deleteRole({ roleId: "role-id" });
```

**Note**: Pre-defined roles (owner, admin, member) cannot be deleted. Roles assigned to members cannot be deleted until members are reassigned.

## Lifecycle Hooks

```ts
organization({
  hooks: {
    organization: {
      beforeCreate: async ({ data, user }) => {
        return {
          data: {
            ...data,
            metadata: { ...data.metadata, createdBy: user.id },
          },
        };
      },
      afterCreate: async ({ organization, member }) => {
        await createDefaultResources(organization.id);
      },
      beforeDelete: async ({ organization }) => {
        await archiveOrganizationData(organization.id);
      },
    },
    member: {
      afterCreate: async ({ member, organization }) => {
        await notifyAdmins(organization.id, `New member joined`);
      },
    },
    invitation: {
      afterCreate: async ({ invitation, organization, inviter }) => {
        await logInvitation(invitation);
      },
    },
  },
});
```

## Schema Customization

```ts
organization({
  schema: {
    organization: {
      modelName: "workspace",
      fields: { name: "workspaceName" },
      additionalFields: {
        billingId: { type: "string", required: false },
      },
    },
    member: {
      additionalFields: {
        department: { type: "string", required: false },
        title: { type: "string", required: false },
      },
    },
  },
});
```

## Organization Security Considerations

### Owner Protection

- The last owner cannot be removed from an organization
- The last owner cannot leave the organization
- The owner role cannot be removed from the last owner

Always ensure ownership transfer before removing the current owner:

```ts
await authClient.organization.updateMemberRole({
  memberId: "new-owner-member-id",
  role: "owner",
});
```

### Organization Deletion

Deleting an organization removes all associated data (members, invitations, teams). Prevent accidental deletion:

```ts
organization({
  disableOrganizationDeletion: true,
});
```

Or implement soft delete via hooks:

```ts
organization({
  hooks: {
    organization: {
      beforeDelete: async ({ organization }) => {
        await archiveOrganization(organization.id);
        throw new Error("Organization archived, not deleted");
      },
    },
  },
});
```

### Invitation Security

- Invitations expire after 48 hours by default
- Only the invited email address can accept an invitation
- Pending invitations can be cancelled by organization admins

## Complete Organization Configuration Example

```ts
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { sendEmail } from "./email";

export const auth = betterAuth({
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 10,
      membershipLimit: 100,
      creatorRole: "owner",
      defaultOrganizationIdField: "slug",
      invitationExpiresIn: 60 * 60 * 24 * 7,
      invitationLimit: 50,
      sendInvitationEmail: async (data) => {
        await sendEmail({
          to: data.email,
          subject: `Join ${data.organization.name}`,
          html: `<a href="https://app.com/invite/${data.invitation.id}">Accept</a>`,
        });
      },
      hooks: {
        organization: {
          afterCreate: async ({ organization }) => {
            console.log(`Organization ${organization.name} created`);
          },
        },
      },
    }),
  ],
});
```
