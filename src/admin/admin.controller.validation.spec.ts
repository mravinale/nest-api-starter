import { jest } from '@jest/globals';
import { HttpStatus } from '@nestjs/common';
import { AdminUsersController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminUsersController validation', () => {
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

  it('rejects list when limit is not a number', async () => {
    await expect(controller.list(baseSession, 'abc', '0')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects list when offset is negative', async () => {
    await expect(controller.list(baseSession, '10', '-1')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects create when required fields are missing', async () => {
    await expect(
      controller.create(baseSession, {
        name: '',
        email: '',
        password: '',
        role: 'member',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects create when role is invalid', async () => {
    await expect(
      controller.create(baseSession, {
        name: 'User',
        email: 'user@example.com',
        password: 'Password123!',
        role: 'owner' as 'admin' | 'manager' | 'member',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects create for non-admin role without organizationId', async () => {
    await expect(
      controller.create(baseSession, {
        name: 'User',
        email: 'user@example.com',
        password: 'Password123!',
        role: 'member',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects setRole when role is invalid', async () => {
    await expect(
      controller.setRole(baseSession, 'target-user', {
        role: 'owner' as 'admin' | 'manager' | 'member',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects setPassword when password is shorter than 8 chars', async () => {
    await expect(
      controller.setPassword(baseSession, 'target-user', { newPassword: 'short' }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects bulkRemove when userIds is not an array', async () => {
    await expect(
      controller.bulkRemove(baseSession, { userIds: undefined as unknown as string[] }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('rejects revokeSession when sessionToken is missing', async () => {
    await expect(
      controller.revokeSession(baseSession, { sessionToken: '' }),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });
});
