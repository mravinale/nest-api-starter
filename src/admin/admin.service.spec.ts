import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AdminService, CreateUserInput } from './admin.service';
import { DatabaseService } from '../database';
import { EmailService } from '../email/email.service';
import { ConfigService } from '../config/config.service';

describe('AdminService', () => {
  let service: AdminService;
  let dbService: jest.Mocked<DatabaseService>;

  const mockRoles = [
    { name: 'admin', display_name: 'Admin', description: 'Platform admin', color: '#ff0000', is_system: true },
    { name: 'manager', display_name: 'Manager', description: 'Org manager', color: '#00ff00', is_system: true },
    { name: 'member', display_name: 'Member', description: 'Regular user', color: '#0000ff', is_system: true },
  ];

  const mockOrganizations = [
    { id: 'org-1', name: 'Org 1', slug: 'org-1' },
    { id: 'org-2', name: 'Org 2', slug: 'org-2' },
  ];

  const mockUser = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'member',
    emailVerified: false,
    banned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockDbService = {
      query: jest.fn(),
      queryOne: jest.fn(),
      transaction: jest.fn(),
    };

    const mockEmailService = {
      sendEmailVerification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      sendOrganizationInvitation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    const mockConfigService = {
      getBaseUrl: jest.fn().mockReturnValue('http://localhost:3000'),
      getFeUrl: jest.fn().mockReturnValue('http://localhost:5173'),
      getAuthSecret: jest.fn().mockReturnValue('test-secret-key-for-jwt-signing'),
      isTestMode: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    dbService = module.get(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCreateUserMetadata', () => {
    it('should return all roles and organizations for admin', async () => {
      dbService.query.mockResolvedValueOnce(mockRoles);
      dbService.query.mockResolvedValueOnce(mockOrganizations);

      const result = await service.getCreateUserMetadata('admin', null);

      expect(result.allowedRoleNames).toEqual(['admin', 'manager', 'member']);
      expect(result.organizations).toHaveLength(2);
      expect(result.roles).toHaveLength(3);
    });

    it('should return only manager/member roles for manager', async () => {
      dbService.query.mockResolvedValueOnce(mockRoles);
      dbService.queryOne.mockResolvedValueOnce(mockOrganizations[0]);

      const result = await service.getCreateUserMetadata('manager', 'org-1');

      expect(result.allowedRoleNames).toEqual(['manager', 'member']);
      expect(result.organizations).toHaveLength(1);
    });

    it('should throw ForbiddenException for manager without active organization', async () => {
      dbService.query.mockResolvedValueOnce(mockRoles);

      await expect(service.getCreateUserMetadata('manager', null)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createUser - Role Hierarchy', () => {
    const baseUserInput: CreateUserInput = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'SecurePass123!',
      role: 'member',
      organizationId: 'org-1',
    };

    it('should throw ForbiddenException when manager tries to create admin', async () => {
      const input: CreateUserInput = { ...baseUserInput, role: 'admin' };
      await expect(service.createUser(input, 'manager', 'org-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when manager creates user in different org', async () => {
      const input: CreateUserInput = { ...baseUserInput, organizationId: 'org-2' };
      await expect(service.createUser(input, 'manager', 'org-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for non-admin without organization', async () => {
      const input: CreateUserInput = { ...baseUserInput, role: 'member', organizationId: undefined };
      await expect(service.createUser(input, 'admin', null)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('setUserRole', () => {
    it('should throw ForbiddenException when manager tries to assign admin role', async () => {
      await expect(service.setUserRole({ userId: 'user-1', role: 'admin' }, 'manager', 'org-1')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when manager has no active organization', async () => {
      await expect(service.setUserRole({ userId: 'user-1', role: 'manager' }, 'manager', null)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user tries to change own role', async () => {
      await expect(
        service.setUserRole(
          { userId: 'user-1', role: 'member' },
          'admin',
          null,
          'user-1',
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow self-update', async () => {
      dbService.queryOne.mockResolvedValueOnce({ ...mockUser, name: 'Self Updated' });

      const result = await service.updateUser(
        { userId: 'user-1', name: 'Self Updated' },
        'admin',
        null,
        'user-1',
      );

      expect(result.name).toBe('Self Updated');
    });

    it('should allow self password reset', async () => {
      dbService.query.mockResolvedValueOnce([]);

      const result = await service.setUserPassword(
        { userId: 'user-1', newPassword: 'NewPass123!' },
        'admin',
        null,
        'user-1',
      );

      expect(result.status).toBe(true);
    });

    it('should block self-unban', async () => {
      await expect(
        service.unbanUser(
          { userId: 'user-1' },
          'admin',
          null,
          'user-1',
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block self-delete', async () => {
      await expect(
        service.removeUser(
          { userId: 'user-1' },
          'admin',
          null,
          'user-1',
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block admin from deleting another admin', async () => {
      dbService.queryOne.mockResolvedValueOnce({ role: 'admin' });

      await expect(
        service.removeUser(
          { userId: 'target-admin' },
          'admin',
          null,
          'actor-admin',
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block manager from updating manager', async () => {
      dbService.queryOne.mockResolvedValueOnce({ role: 'manager' });

      await expect(
        service.updateUser(
          { userId: 'target-manager', name: 'Nope' },
          'manager',
          'org-1',
          'actor-manager',
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block bulk delete when target list includes self', async () => {
      await expect(
        service.removeUsers(
          { userIds: ['user-1', 'user-2'] },
          'admin',
          null,
          'user-1',
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('target action policy', () => {
    it('should block admin from banning another admin', async () => {
      dbService.queryOne.mockResolvedValueOnce({ role: 'admin' });

      await expect(
        service.banUser(
          { userId: 'target-admin', banReason: 'Violation' },
          'admin',
          null,
          'actor-admin',
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block manager from banning another manager', async () => {
      dbService.queryOne.mockResolvedValueOnce({ role: 'manager' });

      await expect(
        service.banUser(
          { userId: 'target-manager', banReason: 'Violation' },
          'manager',
          'org-1',
          'actor-manager',
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block self-ban', async () => {
      await expect(
        service.banUser(
          { userId: 'user-1', banReason: 'Violation' },
          'admin',
          null,
          'user-1',
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listUsers', () => {
    it('should return all users for admin', async () => {
      dbService.query.mockResolvedValueOnce([mockUser]);
      dbService.queryOne.mockResolvedValueOnce({ count: '1' });

      const result = await service.listUsers({
        limit: 10,
        offset: 0,
        platformRole: 'admin',
        activeOrganizationId: null,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should throw ForbiddenException for manager without active organization', async () => {
      await expect(service.listUsers({
        limit: 10,
        offset: 0,
        platformRole: 'manager',
        activeOrganizationId: null,
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateUser', () => {
    it('should allow admin to update any user', async () => {
      dbService.queryOne.mockResolvedValueOnce({ ...mockUser, name: 'Updated Name' });

      const result = await service.updateUser({ userId: 'user-1', name: 'Updated Name' }, 'admin', null);

      expect(result.name).toBe('Updated Name');
    });
  });

  describe('banUser', () => {
    it('should allow admin to ban any user', async () => {
      dbService.query.mockResolvedValueOnce([]);
      const result = await service.banUser({ userId: 'user-1', banReason: 'Violation' }, 'admin', null);
      expect(result.success).toBe(true);
    });
  });

  describe('unbanUser', () => {
    it('should allow admin to unban any user', async () => {
      dbService.query.mockResolvedValueOnce([]);
      const result = await service.unbanUser({ userId: 'user-1' }, 'admin', null);
      expect(result.success).toBe(true);
    });
  });

  describe('setUserPassword', () => {
    it('should allow admin to change any user password', async () => {
      dbService.query.mockResolvedValueOnce([]);
      const result = await service.setUserPassword({ userId: 'user-1', newPassword: 'NewPass123!' }, 'admin', null);
      expect(result.status).toBe(true);
    });
  });

  describe('removeUser', () => {
    it('should allow admin to delete any user', async () => {
      dbService.query.mockResolvedValueOnce([]);
      const result = await service.removeUser({ userId: 'user-1' }, 'admin', null);
      expect(result.success).toBe(true);
    });
  });


  describe('removeUsers (bulk delete)', () => {
    it('should allow admin to bulk delete users', async () => {
      dbService.query.mockResolvedValueOnce([]);
      const result = await service.removeUsers({ userIds: ['user-1', 'user-2', 'user-3'] }, 'admin', null);
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(3);
    });

    it('should return early for empty userIds array', async () => {
      const result = await service.removeUsers({ userIds: [] }, 'admin', null);
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });

    it('should throw ForbiddenException for manager without active organization', async () => {
      await expect(
        service.removeUsers({ userIds: ['user-1', 'user-2'] }, 'manager', null)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when manager tries to delete user outside org', async () => {
      dbService.queryOne.mockResolvedValueOnce(null);
      await expect(
        service.removeUsers({ userIds: ['user-1'] }, 'manager', 'org-1')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow manager to bulk delete users in their organization', async () => {
      dbService.queryOne.mockResolvedValueOnce({ id: 'member-1' });
      dbService.queryOne.mockResolvedValueOnce({ id: 'member-2' });
      dbService.query.mockResolvedValueOnce([]);
      const result = await service.removeUsers({ userIds: ['user-1', 'user-2'] }, 'manager', 'org-1');
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
    });
  });

  describe('revokeSession', () => {
    it('should allow admin to revoke any session', async () => {
      dbService.query.mockResolvedValueOnce([]);
      const result = await service.revokeSession({ sessionToken: 'token-123' }, 'admin', null);
      expect(result.success).toBe(true);
    });
  });

  describe('revokeAllSessions', () => {
    it('should allow admin to revoke all sessions for any user', async () => {
      dbService.query.mockResolvedValueOnce([]);
      const result = await service.revokeAllSessions({ userId: 'user-1' }, 'admin', null);
      expect(result.success).toBe(true);
    });
  });

  describe('listUserSessions', () => {
    it('should list sessions for admin', async () => {
      const mockSessions = [{ id: 'session-1', userId: 'user-1', token: 'token-1' }];
      dbService.query.mockResolvedValueOnce(mockSessions);

      const result = await service.listUserSessions({
        userId: 'user-1',
        platformRole: 'admin',
        activeOrganizationId: null,
      });

      expect(result).toHaveLength(1);
    });

    it('should throw ForbiddenException for manager without active organization', async () => {
      await expect(service.listUserSessions({
        userId: 'user-1',
        platformRole: 'manager',
        activeOrganizationId: null,
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getUserCapabilities', () => {
    it('returns self-safe capabilities for admin acting on self', async () => {
      dbService.queryOne.mockResolvedValueOnce({ role: 'admin' });

      const result = await service.getUserCapabilities({
        actorUserId: 'admin-1',
        targetUserId: 'admin-1',
        platformRole: 'admin',
        activeOrganizationId: null,
      });

      expect(result.isSelf).toBe(true);
      expect(result.actions.update).toBe(true);
      expect(result.actions.setPassword).toBe(true);
      expect(result.actions.setRole).toBe(false);
      expect(result.actions.ban).toBe(false);
      expect(result.actions.remove).toBe(false);
      expect(result.actions.impersonate).toBe(false);
    });

    it('blocks admin from sensitive actions against another admin', async () => {
      dbService.queryOne.mockResolvedValueOnce({ role: 'admin' });

      const result = await service.getUserCapabilities({
        actorUserId: 'admin-1',
        targetUserId: 'admin-2',
        platformRole: 'admin',
        activeOrganizationId: null,
      });

      expect(result.isSelf).toBe(false);
      expect(result.actions.update).toBe(false);
      expect(result.actions.setRole).toBe(false);
      expect(result.actions.ban).toBe(false);
      expect(result.actions.remove).toBe(false);
      expect(result.actions.revokeSessions).toBe(false);
      expect(result.actions.impersonate).toBe(false);
    });

    it('allows manager actions on member in active organization only', async () => {
      dbService.queryOne
        .mockResolvedValueOnce({ role: 'member' })
        .mockResolvedValueOnce({ id: 'member-row' });

      const result = await service.getUserCapabilities({
        actorUserId: 'manager-1',
        targetUserId: 'member-1',
        platformRole: 'manager',
        activeOrganizationId: 'org-1',
      });

      expect(result.actions.update).toBe(true);
      expect(result.actions.setRole).toBe(true);
      expect(result.actions.ban).toBe(true);
      expect(result.actions.remove).toBe(true);
      expect(result.actions.impersonate).toBe(true);
    });
  });
});
