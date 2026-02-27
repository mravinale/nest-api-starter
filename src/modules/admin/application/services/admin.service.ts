import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hashPassword } from 'better-auth/crypto';
import * as jose from 'jose';
import { DatabaseService } from '../../../../database';
import { EmailService } from '../../../../email/email.service';
import { ConfigService } from '../../../../config/config.service';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import {
  getAllowedRoleNamesForCreator,
  requireActiveOrganizationIdForManager,
} from '../../utils/admin.utils';

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'manager' | 'member';
  organizationId?: string;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  private async getTargetRole(userId: string): Promise<'admin' | 'manager' | 'member' | null> {
    const row = await this.db.queryOne<{ role: string }>(
      'SELECT role FROM "user" WHERE id = $1',
      [userId],
    );

    if (!row) {
      return null;
    }

    if (row.role === 'admin' || row.role === 'manager' || row.role === 'member') {
      return row.role;
    }

    return 'member';
  }

  private async assertTargetActionAllowed(
    params: {
      actorUserId?: string;
      targetUserId: string;
      platformRole: 'admin' | 'manager';
      allowSelf: boolean;
    },
  ): Promise<void> {
    const { actorUserId, targetUserId, platformRole, allowSelf } = params;

    if (!actorUserId) {
      return;
    }

    if (actorUserId === targetUserId) {
      if (!allowSelf) {
        throw new ForbiddenException('You cannot perform this action on yourself');
      }
      return;
    }

    const targetRole = await this.getTargetRole(targetUserId);
    if (!targetRole) {
      throw new ForbiddenException('Target user not found');
    }

    if (platformRole === 'admin' && targetRole === 'admin') {
      throw new ForbiddenException('Admins cannot perform this action on other admins');
    }

    if (platformRole === 'manager' && targetRole !== 'member') {
      throw new ForbiddenException('Managers can only perform this action on members');
    }
  }

  private async assertUserInManagerOrg(userId: string, activeOrganizationId: string): Promise<void> {
    const member = await this.db.queryOne<{ id: string }>(
      'SELECT id FROM member WHERE "organizationId" = $1 AND "userId" = $2',
      [activeOrganizationId, userId],
    );
    if (!member) {
      throw new ForbiddenException('User is not in your organization');
    }
  }

  private async resolveRoleAssignmentOrganizationId(params: {
    targetUserId: string;
    platformRole: 'admin' | 'manager';
    activeOrganizationId: string | null;
  }): Promise<string | null> {
    const { targetUserId, platformRole, activeOrganizationId } = params;

    if (activeOrganizationId) {
      return activeOrganizationId;
    }

    if (platformRole !== 'admin') {
      return null;
    }

    const member = await this.db.queryOne<{ organizationId: string }>(
      'SELECT "organizationId" as "organizationId" FROM member WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
      [targetUserId],
    );

    return member?.organizationId ?? null;
  }

  async getCreateUserMetadata(platformRole: 'admin' | 'manager', activeOrganizationId: string | null) {
    const roles = await this.db.query<{
      name: string;
      display_name: string;
      description: string | null;
      color: string | null;
      is_system: boolean;
    }>(
      'SELECT name, display_name, description, color, is_system FROM roles ORDER BY is_system DESC, name ASC',
    );

    const allowedRoleNames = getAllowedRoleNamesForCreator(platformRole);

    let organizations: Array<{ id: string; name: string; slug: string }> = [];
    if (platformRole === 'admin') {
      organizations = await this.db.query<{ id: string; name: string; slug: string }>(
        'SELECT id, name, slug FROM organization ORDER BY name ASC',
      );
    } else {
      if (!activeOrganizationId) {
        throw new ForbiddenException('Active organization required');
      }
      const org = await this.db.queryOne<{ id: string; name: string; slug: string }>(
        'SELECT id, name, slug FROM organization WHERE id = $1',
        [activeOrganizationId],
      );
      organizations = org ? [org] : [];
    }

    return {
      roles: roles.map((r) => ({
        name: r.name,
        displayName: r.display_name,
        description: r.description ?? undefined,
        color: r.color ?? undefined,
        isSystem: r.is_system,
      })),
      allowedRoleNames,
      organizations,
    };
  }

  async updateUser(
    input: { userId: string; name?: string },
    platformRole: 'admin' | 'manager',
    activeOrganizationId: string | null,
    actorUserId?: string,
  ) {
    await this.assertTargetActionAllowed({
      actorUserId,
      targetUserId: input.userId,
      platformRole,
      allowSelf: true,
    });

    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      await this.assertUserInManagerOrg(input.userId, activeOrganizationId);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(input.name);
    }

    if (updates.length === 0) {
      throw new ForbiddenException('No data to update');
    }

    updates.push(`"updatedAt" = NOW()`);
    values.push(input.userId);

    const row = await this.db.queryOne<any>(
      `UPDATE "user" SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, email, "emailVerified" as "emailVerified", role, image, banned, "banReason" as "banReason", "banExpires" as "banExpires", "createdAt" as "createdAt", "updatedAt" as "updatedAt"`,
      values,
    );

    return row;
  }

  async setUserRole(
    input: { userId: string; role: 'admin' | 'manager' | 'member' },
    platformRole: 'admin' | 'manager',
    activeOrganizationId: string | null,
    actorUserId?: string,
  ) {
    await this.assertTargetActionAllowed({
      actorUserId,
      targetUserId: input.userId,
      platformRole,
      allowSelf: false,
    });

    const allowed = getAllowedRoleNamesForCreator(platformRole);
    if (!allowed.includes(input.role)) {
      throw new ForbiddenException('Role not allowed');
    }

    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      await this.assertUserInManagerOrg(input.userId, activeOrganizationId);
    }

    const organizationIdForRole =
      input.role === 'admin'
        ? null
        : await this.resolveRoleAssignmentOrganizationId({
            targetUserId: input.userId,
            platformRole,
            activeOrganizationId,
          });

    await this.db.transaction(async (query) => {
      await query('UPDATE "user" SET role = $1, "updatedAt" = NOW() WHERE id = $2', [
        input.role,
        input.userId,
      ]);

      if (input.role === 'admin') {
        await query('DELETE FROM member WHERE "userId" = $1', [input.userId]);
      } else {
        const orgId = organizationIdForRole;
        if (!orgId) {
          throw new ForbiddenException('Active organization required');
        }
        const existingMember = await query(
          'SELECT id FROM member WHERE "organizationId" = $1 AND "userId" = $2',
          [orgId, input.userId],
        );
        if (existingMember.length > 0) {
          await query(
            'UPDATE member SET role = $1 WHERE "organizationId" = $2 AND "userId" = $3',
            [input.role, orgId, input.userId],
          );
        } else {
          await query(
            'INSERT INTO member (id, "organizationId", "userId", role, "createdAt") VALUES ($1, $2, $3, $4, NOW())',
            [randomUUID(), orgId, input.userId, input.role],
          );
        }
      }
    });

    const updated = await this.db.queryOne<any>(
      'SELECT id, name, email, "emailVerified" as "emailVerified", role, image, banned, "banReason" as "banReason", "banExpires" as "banExpires", "createdAt" as "createdAt", "updatedAt" as "updatedAt" FROM "user" WHERE id = $1',
      [input.userId],
    );
    return updated;
  }

  async banUser(
    input: { userId: string; banReason?: string },
    platformRole: 'admin' | 'manager',
    activeOrganizationId: string | null,
    actorUserId?: string,
  ) {
    await this.assertTargetActionAllowed({
      actorUserId,
      targetUserId: input.userId,
      platformRole,
      allowSelf: false,
    });

    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      await this.assertUserInManagerOrg(input.userId, activeOrganizationId);
    }

    await this.db.query(
      'UPDATE "user" SET banned = true, "banReason" = $1, "updatedAt" = NOW() WHERE id = $2',
      [input.banReason ?? null, input.userId],
    );
    return { success: true };
  }

  async unbanUser(
    input: { userId: string },
    platformRole: 'admin' | 'manager',
    activeOrganizationId: string | null,
    actorUserId?: string,
  ) {
    await this.assertTargetActionAllowed({
      actorUserId,
      targetUserId: input.userId,
      platformRole,
      allowSelf: false,
    });

    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      await this.assertUserInManagerOrg(input.userId, activeOrganizationId);
    }

    await this.db.query(
      'UPDATE "user" SET banned = false, "banReason" = NULL, "banExpires" = NULL, "updatedAt" = NOW() WHERE id = $1',
      [input.userId],
    );
    return { success: true };
  }

  async setUserPassword(
    input: { userId: string; newPassword: string },
    platformRole: 'admin' | 'manager',
    activeOrganizationId: string | null,
    actorUserId?: string,
  ) {
    await this.assertTargetActionAllowed({
      actorUserId,
      targetUserId: input.userId,
      platformRole,
      allowSelf: true,
    });

    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      await this.assertUserInManagerOrg(input.userId, activeOrganizationId);
    }

    const hashed = await hashPassword(input.newPassword);
    await this.db.query(
      'UPDATE account SET password = $1, "updatedAt" = NOW() WHERE "userId" = $2 AND "providerId" = $3',
      [hashed, input.userId, 'credential'],
    );
    return { status: true };
  }

  async removeUser(
    input: { userId: string },
    platformRole: 'admin' | 'manager',
    activeOrganizationId: string | null,
    actorUserId?: string,
  ) {
    await this.assertTargetActionAllowed({
      actorUserId,
      targetUserId: input.userId,
      platformRole,
      allowSelf: false,
    });

    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      await this.assertUserInManagerOrg(input.userId, activeOrganizationId);
    }
    await this.db.query('DELETE FROM "user" WHERE id = $1', [input.userId]);
    return { success: true };
  }

  async removeUsers(
    input: { userIds: string[] },
    platformRole: 'admin' | 'manager',
    activeOrganizationId: string | null,
    actorUserId?: string,
  ) {
    if (input.userIds.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      for (const userId of input.userIds) {
        await this.assertTargetActionAllowed({
          actorUserId,
          targetUserId: userId,
          platformRole,
          allowSelf: false,
        });
        await this.assertUserInManagerOrg(userId, activeOrganizationId);
      }
    } else {
      for (const userId of input.userIds) {
        await this.assertTargetActionAllowed({
          actorUserId,
          targetUserId: userId,
          platformRole,
          allowSelf: false,
        });
      }
    }

    const placeholders = input.userIds.map((_, i) => `$${i + 1}`).join(', ');
    await this.db.query(`DELETE FROM "user" WHERE id IN (${placeholders})`, input.userIds);
    return { success: true, deletedCount: input.userIds.length };
  }

  async revokeSession(
    input: { sessionToken: string },
    platformRole: 'admin' | 'manager',
    activeOrganizationId: string | null,
  ) {
    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      const session = await this.db.queryOne<{ userId: string }>(
        'SELECT "userId" as "userId" FROM session WHERE token = $1',
        [input.sessionToken],
      );
      if (!session) return { success: true };
      await this.assertUserInManagerOrg(session.userId, activeOrganizationId);
    }
    await this.db.query('DELETE FROM session WHERE token = $1', [input.sessionToken]);
    return { success: true };
  }

  async revokeAllSessions(
    input: { userId: string },
    platformRole: 'admin' | 'manager',
    activeOrganizationId: string | null,
  ) {
    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      await this.assertUserInManagerOrg(input.userId, activeOrganizationId);
    }
    await this.db.query('DELETE FROM session WHERE "userId" = $1', [input.userId]);
    return { success: true };
  }

  async listUsers(params: {
    limit: number;
    offset: number;
    searchValue?: string;
    activeOrganizationId: string | null;
    platformRole: 'admin' | 'manager';
  }) {
    const { limit, offset, searchValue, platformRole, activeOrganizationId } = params;

    const where: string[] = [];
    const values: unknown[] = [];

    if (searchValue) {
      values.push(`%${searchValue}%`);
      where.push(`(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
    }

    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      values.push(activeOrganizationId);
      where.push(`EXISTS (SELECT 1 FROM member m WHERE m."userId" = u.id AND m."organizationId" = $${values.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const users = await this.db.query<any>(
      `SELECT u.id, u.name, u.email, u."emailVerified" as "emailVerified", u.role, u.image, u.banned, u."banReason" as "banReason", u."banExpires" as "banExpires", u."createdAt" as "createdAt", u."updatedAt" as "updatedAt"
       FROM "user" u
       ${whereSql}
       ORDER BY u."createdAt" DESC
       LIMIT ${limit} OFFSET ${offset}`,
      values,
    );

    const totalRow = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM "user" u ${whereSql}`,
      values,
    );

    return {
      data: users,
      total: totalRow ? parseInt(totalRow.count, 10) : 0,
      limit,
      offset,
    };
  }

  async getUserCapabilities(params: {
    actorUserId: string;
    targetUserId: string;
    platformRole: 'admin' | 'manager';
    activeOrganizationId: string | null;
  }) {
    const { actorUserId, targetUserId, platformRole, activeOrganizationId } = params;

    const targetRole = await this.getTargetRole(targetUserId);
    if (!targetRole) {
      throw new ForbiddenException('Target user not found');
    }

    const isSelf = actorUserId === targetUserId;
    const isTargetMember = targetRole === 'member';

    let isTargetInActiveOrganization = true;
    if (platformRole === 'manager') {
      if (!activeOrganizationId) {
        isTargetInActiveOrganization = false;
      } else {
        const member = await this.db.queryOne<{ id: string }>(
          'SELECT id FROM member WHERE "organizationId" = $1 AND "userId" = $2',
          [activeOrganizationId, targetUserId],
        );
        isTargetInActiveOrganization = !!member;
      }
    }

    const canSelfSafeAction = isSelf && (platformRole === 'admin' || isTargetInActiveOrganization);

    const canMutateNonSelf =
      !isSelf &&
      (platformRole === 'admin'
        ? targetRole !== 'admin'
        : isTargetMember && isTargetInActiveOrganization);

    return {
      targetUserId,
      targetRole,
      isSelf,
      actions: {
        update: canSelfSafeAction || canMutateNonSelf,
        setRole: canMutateNonSelf,
        ban: canMutateNonSelf,
        unban: canMutateNonSelf,
        setPassword: canSelfSafeAction || canMutateNonSelf,
        remove: canMutateNonSelf,
        revokeSessions: canMutateNonSelf,
        impersonate: canMutateNonSelf,
      },
    };
  }

  async createUser(input: CreateUserInput, platformRole: 'admin' | 'manager', activeOrganizationId: string | null) {
    const allowed = getAllowedRoleNamesForCreator(platformRole);
    if (!allowed.includes(input.role)) {
      throw new ForbiddenException('Role not allowed');
    }

    const enforcedActiveOrgId = requireActiveOrganizationIdForManager(platformRole, {
      session: { activeOrganizationId: activeOrganizationId ?? undefined },
    } as unknown as UserSession);

    const organizationIdToUse = input.role === 'admin' ? undefined : input.organizationId;

    if (input.role !== 'admin') {
      if (!organizationIdToUse) {
        throw new ForbiddenException('Organization is required for non-admin users');
      }
      if (platformRole === 'manager' && enforcedActiveOrgId && organizationIdToUse !== enforcedActiveOrgId) {
        throw new ForbiddenException('Managers can only assign users to their active organization');
      }
    }

    const userId = randomUUID();
    const accountId = randomUUID();
    const hashed = await hashPassword(input.password);

    await this.db.transaction(async (query) => {
      const existing = await query('SELECT id FROM "user" WHERE email = $1', [input.email.toLowerCase()]);
      if (existing.length > 0) {
        throw new ForbiddenException('User already exists');
      }

      await query(
        `INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt", role, banned)
         VALUES ($1, $2, $3, false, NULL, NOW(), NOW(), $4, false)`,
        [userId, input.name, input.email.toLowerCase(), input.role],
      );

      await query(
        `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [accountId, userId, 'credential', userId, hashed],
      );

      if (organizationIdToUse) {
        await query(
          `INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
           VALUES ($1, $2, $3, $4, NOW())`,
          [randomUUID(), organizationIdToUse, userId, input.role],
        );
      }
    });

    const created = await this.db.queryOne<any>(
      'SELECT id, name, email, "emailVerified" as "emailVerified", role, image, banned, "banReason" as "banReason", "banExpires" as "banExpires", "createdAt" as "createdAt", "updatedAt" as "updatedAt" FROM "user" WHERE id = $1',
      [userId],
    );

    try {
      const secret = new TextEncoder().encode(this.configService.getAuthSecret());
      const expiresIn = 3600;
      
      const verificationToken = await new jose.SignJWT({ email: input.email.toLowerCase() })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(`${expiresIn}s`)
        .setIssuedAt()
        .sign(secret);
      
      const baseUrl = this.configService.getBaseUrl();
      const feUrl = this.configService.getFeUrl();
      const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${verificationToken}&callbackURL=${encodeURIComponent(feUrl)}`;
      
      console.log('📧 [AdminService] Sending verification email to:', input.email);
      await this.emailService.sendEmailVerification({
        user: { id: userId, email: input.email, name: input.name },
        url: verificationUrl,
        token: verificationToken,
      });
      console.log('✅ [AdminService] Verification email sent successfully');
    } catch (error) {
      console.error('❌ [AdminService] Failed to send verification email:', error);
    }

    return created;
  }

  async listUserSessions(params: {
    userId: string;
    platformRole: 'admin' | 'manager';
    activeOrganizationId: string | null;
  }) {
    const { userId, platformRole, activeOrganizationId } = params;

    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      const member = await this.db.queryOne<{ id: string }>(
        'SELECT id FROM member WHERE "organizationId" = $1 AND "userId" = $2',
        [activeOrganizationId, userId],
      );
      if (!member) {
        throw new ForbiddenException('User is not in your organization');
      }
    }

    const sessions = await this.db.query<any>(
      'SELECT id, "userId" as "userId", token, "expiresAt" as "expiresAt", "createdAt" as "createdAt", "updatedAt" as "updatedAt", "ipAddress" as "ipAddress", "userAgent" as "userAgent" FROM session WHERE "userId" = $1 ORDER BY "createdAt" DESC',
      [userId],
    );
    return sessions;
  }
}
