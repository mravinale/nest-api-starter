import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hashPassword } from 'better-auth/crypto';
import { EmailService } from '../../../../../shared/email/email.service';
import { ConfigService } from '../../../../../shared/config/config.service';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import {
  getAllowedRoleNamesForCreator,
  requireActiveOrganizationIdForManager,
} from '../../utils/admin.utils';
import {
  buildVerificationToken,
  buildVerificationUrl,
} from '../../utils/verification.utils';
import {
  type IAdminUserRepository,
  ADMIN_USER_REPOSITORY,
} from '../../domain/repositories/admin-user.repository.interface';

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
    @Inject(ADMIN_USER_REPOSITORY) private readonly userRepo: IAdminUserRepository,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  private async getTargetRole(userId: string): Promise<'admin' | 'manager' | 'member' | null> {
    const role = await this.userRepo.findUserRole(userId);
    if (!role) return null;
    if (role === 'admin' || role === 'manager' || role === 'member') return role;
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
    const member = await this.userRepo.findMemberInOrg(userId, activeOrganizationId);
    if (!member) throw new ForbiddenException('User is not in your organization');
  }

  private async resolveRoleAssignmentOrganizationId(params: {
    targetUserId: string;
    platformRole: 'admin' | 'manager';
    activeOrganizationId: string | null;
  }): Promise<string | null> {
    const { targetUserId, platformRole, activeOrganizationId } = params;
    if (activeOrganizationId) return activeOrganizationId;
    if (platformRole !== 'admin') return null;
    const member = await this.userRepo.findUserOrganization(targetUserId);
    return member?.organizationId ?? null;
  }

  async getCreateUserMetadata(platformRole: 'admin' | 'manager', activeOrganizationId: string | null) {
    const roles = await this.userRepo.listRoles();
    const allowedRoleNames = getAllowedRoleNamesForCreator(platformRole);

    let organizations: Array<{ id: string; name: string; slug: string }> = [];
    if (platformRole === 'admin') {
      organizations = await this.userRepo.listOrganizations();
    } else {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      const org = await this.userRepo.findOrganizationById(activeOrganizationId);
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

    if (input.name === undefined) throw new ForbiddenException('No data to update');
    return this.userRepo.updateUser(input.userId, { name: input.name });
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
        ? undefined
        : (await this.resolveRoleAssignmentOrganizationId({
            targetUserId: input.userId,
            platformRole,
            activeOrganizationId,
          })) ?? undefined;

    return this.userRepo.setUserRole({
      userId: input.userId,
      role: input.role,
      organizationId: organizationIdForRole,
      newMemberId: randomUUID(),
    });
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

    await this.userRepo.banUser(input.userId, input.banReason);
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

    await this.userRepo.unbanUser(input.userId);
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
    await this.userRepo.setUserPassword(input.userId, hashed);
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
    await this.userRepo.removeUser(input.userId);
    return { success: true };
  }

  async removeUsers(
    input: { userIds: string[] },
    platformRole: 'admin' | 'manager',
    activeOrganizationId: string | null,
    actorUserId?: string,
  ) {
    if (input.userIds.length === 0) return { success: true, deletedCount: 0 };

    if (platformRole === 'manager') {
      if (!activeOrganizationId) throw new ForbiddenException('Active organization required');
      for (const userId of input.userIds) {
        await this.assertTargetActionAllowed({ actorUserId, targetUserId: userId, platformRole, allowSelf: false });
        await this.assertUserInManagerOrg(userId, activeOrganizationId);
      }
    } else {
      for (const userId of input.userIds) {
        await this.assertTargetActionAllowed({ actorUserId, targetUserId: userId, platformRole, allowSelf: false });
      }
    }

    await this.userRepo.removeUsers(input.userIds);
    return { success: true, deletedCount: input.userIds.length };
  }

  async listUsers(params: {
    limit: number;
    offset: number;
    searchValue?: string;
    activeOrganizationId: string | null;
    platformRole: 'admin' | 'manager';
  }) {
    const { limit, offset, searchValue, platformRole, activeOrganizationId } = params;
    if (platformRole === 'manager' && !activeOrganizationId) throw new ForbiddenException('Active organization required');
    const result = await this.userRepo.listUsers({ limit, offset, searchValue, activeOrganizationId, platformRole });
    return { ...result, limit, offset };
  }

  async getUserCapabilities(params: {
    actorUserId: string;
    targetUserId: string;
    platformRole: 'admin' | 'manager';
    activeOrganizationId: string | null;
  }) {
    const { actorUserId, targetUserId, platformRole, activeOrganizationId } = params;

    const targetRole = await this.getTargetRole(targetUserId);
    if (!targetRole) throw new ForbiddenException('Target user not found');

    const isSelf = actorUserId === targetUserId;
    const isTargetMember = targetRole === 'member';

    let isTargetInActiveOrganization = true;
    if (platformRole === 'manager') {
      if (!activeOrganizationId) {
        isTargetInActiveOrganization = false;
      } else {
        const member = await this.userRepo.findMemberInOrg(targetUserId, activeOrganizationId);
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

  async getBatchCapabilities(params: {
    actorUserId: string;
    userIds: string[];
    platformRole: 'admin' | 'manager';
    activeOrganizationId: string | null;
  }): Promise<Record<string, Awaited<ReturnType<AdminService['getUserCapabilities']>>>> {
    const { actorUserId, userIds, platformRole, activeOrganizationId } = params;

    if (userIds.length === 0) return {};

    const settled = await Promise.allSettled(
      userIds.map((targetUserId) =>
        this.getUserCapabilities({ actorUserId, targetUserId, platformRole, activeOrganizationId }),
      ),
    );

    const result: Record<string, Awaited<ReturnType<AdminService['getUserCapabilities']>>> = {};
    for (let i = 0; i < userIds.length; i++) {
      const outcome = settled[i];
      if (outcome.status === 'fulfilled') {
        result[userIds[i]] = outcome.value;
      }
    }
    return result;
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

    const created = await this.userRepo.createUser({
      userId,
      accountId,
      name: input.name,
      email: input.email,
      hashedPassword: hashed,
      role: input.role,
      organizationId: organizationIdToUse ?? undefined,
    });

    try {
      const verificationToken = await buildVerificationToken(
        input.email,
        this.configService.getAuthSecret(),
      );
      const verificationUrl = buildVerificationUrl(
        verificationToken,
        this.configService.getBaseUrl(),
        this.configService.getFeUrl(),
      );

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

}
