import { jest } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminUsersController } from './admin.controller';
import { AdminService } from './admin.service';
import { ROLES_KEY } from '../common';
import { RolesGuard, PermissionsGuard } from '../common';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let adminService: jest.Mocked<AdminService>;

  const baseSession = {
    user: { id: 'actor-admin', role: 'admin' },
    session: {},
  } as any;

  beforeEach(() => {
    adminService = {
      getCreateUserMetadata: jest.fn(),
      getUserCapabilities: jest.fn(),
      listUsers: jest.fn(),
      createUser: jest.fn(),
      listUserSessions: jest.fn(),
      updateUser: jest.fn(),
      setUserRole: jest.fn(),
      banUser: jest.fn(),
      unbanUser: jest.fn(),
      setUserPassword: jest.fn(),
      removeUser: jest.fn(),
      removeUsers: jest.fn(),
      revokeSession: jest.fn(),
      revokeAllSessions: jest.fn(),
    } as unknown as jest.Mocked<AdminService>;

    controller = new AdminUsersController(adminService);
  });

  it('applies class-level admin/manager role restrictions', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AdminUsersController);
    expect(roles).toEqual(['admin', 'manager']);
  });

  it('applies class-level RolesGuard and PermissionsGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminUsersController) as unknown[];

    expect(guards).toBeDefined();
    expect(guards).toContain(RolesGuard);
    expect(guards).toContain(PermissionsGuard);
  });

  it('passes actor user id to updateUser', async () => {
    adminService.updateUser.mockResolvedValue({ id: 'target-1' } as never);

    await controller.update(baseSession, 'target-1', { name: 'Updated' });

    expect(adminService.updateUser).toHaveBeenCalledWith(
      { userId: 'target-1', name: 'Updated' },
      'admin',
      null,
      'actor-admin',
    );
  });

  it('passes actor user id to setUserRole', async () => {
    adminService.setUserRole.mockResolvedValue({ id: 'target-1' } as never);

    await controller.setRole(baseSession, 'target-1', { role: 'member' });

    expect(adminService.setUserRole).toHaveBeenCalledWith(
      { userId: 'target-1', role: 'member' },
      'admin',
      null,
      'actor-admin',
    );
  });

  it('passes actor user id to banUser', async () => {
    adminService.banUser.mockResolvedValue({ success: true } as never);

    await controller.ban(baseSession, 'target-1', { banReason: 'violation' });

    expect(adminService.banUser).toHaveBeenCalledWith(
      { userId: 'target-1', banReason: 'violation' },
      'admin',
      null,
      'actor-admin',
    );
  });

  it('passes actor user id to unbanUser', async () => {
    adminService.unbanUser.mockResolvedValue({ success: true } as never);

    await controller.unban(baseSession, 'target-1');

    expect(adminService.unbanUser).toHaveBeenCalledWith(
      { userId: 'target-1' },
      'admin',
      null,
      'actor-admin',
    );
  });

  it('passes actor user id to setUserPassword', async () => {
    adminService.setUserPassword.mockResolvedValue({ status: true } as never);

    await controller.setPassword(baseSession, 'target-1', { newPassword: 'NewPass123!' });

    expect(adminService.setUserPassword).toHaveBeenCalledWith(
      { userId: 'target-1', newPassword: 'NewPass123!' },
      'admin',
      null,
      'actor-admin',
    );
  });

  it('passes actor user id to removeUser', async () => {
    adminService.removeUser.mockResolvedValue({ success: true } as never);

    await controller.remove(baseSession, 'target-1');

    expect(adminService.removeUser).toHaveBeenCalledWith(
      { userId: 'target-1' },
      'admin',
      null,
      'actor-admin',
    );
  });

  it('passes actor user id to removeUsers', async () => {
    adminService.removeUsers.mockResolvedValue({ success: true, deletedCount: 2 } as never);

    await controller.bulkRemove(baseSession, { userIds: ['target-1', 'target-2'] });

    expect(adminService.removeUsers).toHaveBeenCalledWith(
      { userIds: ['target-1', 'target-2'] },
      'admin',
      null,
      'actor-admin',
    );
  });

  it('passes actor context to getUserCapabilities', async () => {
    adminService.getUserCapabilities.mockResolvedValue({
      targetUserId: 'target-1',
      targetRole: 'member',
      isSelf: false,
      actions: {
        update: true,
        setRole: true,
        ban: true,
        unban: true,
        setPassword: true,
        remove: true,
        revokeSessions: true,
        impersonate: true,
      },
    } as never);

    await controller.getCapabilities(baseSession, 'target-1');

    expect(adminService.getUserCapabilities).toHaveBeenCalledWith({
      actorUserId: 'actor-admin',
      targetUserId: 'target-1',
      platformRole: 'admin',
      activeOrganizationId: null,
    });
  });
});
