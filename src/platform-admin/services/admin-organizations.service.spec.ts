import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminOrganizationsService,
  ROLE_HIERARCHY,
  getRoleLevel,
  filterAssignableRoles,
} from './admin-organizations.service';
import { DatabaseService } from '../../database';
import { EmailService } from '../../email/email.service';

describe('AdminOrganizationsService', () => {
  let service: AdminOrganizationsService;
  let dbService: jest.Mocked<DatabaseService>;
  let emailService: jest.Mocked<EmailService>;

  const mockOrganization = {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
    logo: null,
    metadata: null,
    created_at: new Date(),
    member_count: '5',
  };

  beforeEach(async () => {
    const mockDbService = {
      query: jest.fn(),
      queryOne: jest.fn(),
      transaction: jest.fn(),
    };

    const mockEmailService = {
      sendOrganizationInvitation: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      sendEmailVerification: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      sendEmail: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOrganizationsService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AdminOrganizationsService>(AdminOrganizationsService);
    dbService = module.get(DatabaseService);
    emailService = module.get(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated organizations', async () => {
      dbService.queryOne.mockResolvedValue({ count: '10' });
      dbService.query.mockResolvedValue([mockOrganization]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Test Org');
      expect(result.data[0].memberCount).toBe(5);
    });

    it('should apply search filter', async () => {
      dbService.queryOne.mockResolvedValue({ count: '1' });
      dbService.query.mockResolvedValue([mockOrganization]);

      await service.findAll({ page: 1, limit: 20, search: 'test' });

      expect(dbService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        ['%test%'],
      );
    });

    it('should handle empty results', async () => {
      dbService.queryOne.mockResolvedValue({ count: '0' });
      dbService.query.mockResolvedValue([]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('create', () => {
    it('should create organization and admin membership for manager actor', async () => {
      dbService.queryOne
        .mockResolvedValueOnce({ id: 'org-2', name: 'New Org', slug: 'new-org', logo: null, metadata: null, created_at: new Date() });

      const mockQuery = jest.fn(async (sql: string, _params?: unknown[]) =>
        sql.includes('SELECT id FROM organization WHERE LOWER(slug) = LOWER($1)')
          ? []
          : []);

      dbService.transaction.mockImplementation(async (callback) => {
        await callback(mockQuery);
        return undefined;
      });

      const created = await service.create(
        {
          name: 'New Org',
          slug: 'new-org',
        },
        {
          id: 'manager-1',
          platformRole: 'manager',
        },
      );

      expect(created.name).toBe('New Org');
      expect(created.slug).toBe('new-org');
      expect(dbService.transaction).toHaveBeenCalledTimes(1);

      const memberInsertCall = mockQuery.mock.calls.find(([sql]) =>
        typeof sql === 'string' && sql.includes('INSERT INTO member'),
      );
      expect(memberInsertCall).toBeDefined();
      expect(memberInsertCall?.[1]).toEqual(expect.arrayContaining(['manager-1', 'admin']));
    });

    it('should create organization and admin membership for admin actor', async () => {
      dbService.queryOne
        .mockResolvedValueOnce({ id: 'org-3', name: 'Admin Org', slug: 'admin-org', logo: null, metadata: null, created_at: new Date() });

      const mockQuery = jest.fn(async (sql: string, _params?: unknown[]) =>
        sql.includes('SELECT id FROM organization WHERE LOWER(slug) = LOWER($1)')
          ? []
          : []);

      dbService.transaction.mockImplementation(async (callback) => {
        await callback(mockQuery);
        return undefined;
      });

      const created = await service.create(
        {
          name: 'Admin Org',
          slug: 'admin-org',
        },
        {
          id: 'admin-1',
          platformRole: 'admin',
        },
      );

      expect(created.name).toBe('Admin Org');

      const memberInsertCall = mockQuery.mock.calls.find(([sql]) =>
        typeof sql === 'string' && sql.includes('INSERT INTO member'),
      );
      expect(memberInsertCall).toBeDefined();
      expect(memberInsertCall?.[1]).toEqual(expect.arrayContaining(['admin-1', 'admin']));
    });

    it('should reject duplicate organization slug', async () => {
      dbService.transaction.mockImplementation(async (callback) => {
        const mockQuery = (async (sql: string) =>
          sql.includes('SELECT id FROM organization WHERE LOWER(slug) = LOWER($1)')
            ? [{ id: 'existing-org' }]
            : []) as (sql: string, params?: unknown[]) => Promise<unknown[]>;
        return callback(mockQuery);
      });

      await expect(
        service.create(
          {
            name: 'New Org',
            slug: 'new-org',
          },
          {
            id: 'admin-1',
            platformRole: 'admin',
          },
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createInvitation', () => {
    it('should create invitation and send email for admin actor', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      dbService.queryOne
        .mockResolvedValueOnce({ id: 'org-1', name: 'Test Org', slug: 'test-org' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'inv-1',
          organizationId: 'org-1',
          email: 'invitee@example.com',
          role: 'member',
          status: 'pending',
          expiresAt,
          inviterId: 'actor-1',
          createdAt: new Date(),
        });
      dbService.query.mockResolvedValueOnce([]);

      const result = await service.createInvitation(
        'org-1',
        'invitee@example.com',
        'member',
        'admin',
        { id: 'actor-1', email: 'admin@example.com', name: 'Admin User' },
      );

      expect(result.email).toBe('invitee@example.com');
      expect(dbService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO invitation'),
        expect.arrayContaining(['org-1', 'invitee@example.com', 'member', 'pending', 'actor-1']),
      );
      expect(emailService.sendOrganizationInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'invitee@example.com',
          role: 'member',
          organizationId: 'org-1',
        }),
      );
    });

    it('should block manager from inviting admin role', async () => {
      await expect(
        service.createInvitation(
          'org-1',
          'invitee@example.com',
          'admin',
          'manager',
          { id: 'actor-2', email: 'manager@example.com', name: 'Manager User' },
        ),
      ).rejects.toThrow('Role not allowed');
    });

    it('should throw NotFoundException when organization does not exist', async () => {
      dbService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.createInvitation(
          'org-missing',
          'invitee@example.com',
          'member',
          'admin',
          { id: 'actor-1', email: 'admin@example.com', name: 'Admin User' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should throw BadRequestException when invitee is already a member', async () => {
      dbService.queryOne
        .mockResolvedValueOnce({ id: 'org-1', name: 'Test Org', slug: 'test-org' })
        .mockResolvedValueOnce({ id: 'member-1' });

      await expect(
        service.createInvitation(
          'org-1',
          'invitee@example.com',
          'member',
          'admin',
          { id: 'actor-1', email: 'admin@example.com', name: 'Admin User' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should throw ConflictException when pending invitation already exists', async () => {
      dbService.queryOne
        .mockResolvedValueOnce({ id: 'org-1', name: 'Test Org', slug: 'test-org' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'inv-existing' });

      await expect(
        service.createInvitation(
          'org-1',
          'invitee@example.com',
          'member',
          'admin',
          { id: 'actor-1', email: 'admin@example.com', name: 'Admin User' },
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findById', () => {
    it('should return organization with member count', async () => {
      dbService.queryOne.mockResolvedValue(mockOrganization);

      const result = await service.findById('org-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('org-1');
      expect(result?.memberCount).toBe(5);
    });

    it('should return null for non-existent organization', async () => {
      dbService.queryOne.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update organization name', async () => {
      dbService.queryOne
        .mockResolvedValueOnce(mockOrganization) // findById
        .mockResolvedValueOnce({ ...mockOrganization, name: 'Updated Org' }); // update

      const result = await service.update('org-1', { name: 'Updated Org' });

      expect(result?.name).toBe('Updated Org');
      expect(dbService.queryOne).toHaveBeenCalledTimes(2);
    });

    it('should return null for non-existent organization', async () => {
      dbService.queryOne.mockResolvedValue(null);

      const result = await service.update('non-existent', { name: 'Test' });

      expect(result).toBeNull();
    });

    it('should return existing org if no updates provided', async () => {
      dbService.queryOne.mockResolvedValue(mockOrganization);

      const result = await service.update('org-1', {});

      expect(result?.id).toBe('org-1');
      expect(dbService.queryOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('delete', () => {
    it('should delete organization and related data', async () => {
      dbService.queryOne.mockResolvedValue(mockOrganization);
      dbService.transaction.mockImplementation(async (callback) => {
        const mockQuery = (async () => []) as (sql: string, params?: unknown[]) => Promise<unknown[]>;
        await callback(mockQuery);
        return undefined;
      });

      await service.delete('org-1');

      expect(dbService.transaction).toHaveBeenCalled();
    });

    it('should throw error for non-existent organization', async () => {
      dbService.queryOne.mockResolvedValue(null);

      await expect(service.delete('non-existent')).rejects.toThrow('Organization not found');
    });
  });

  describe('getMembers', () => {
    it('should return members with user info', async () => {
      const mockMember = {
        id: 'member-1',
        userId: 'user-1',
        role: 'admin',
        createdAt: new Date(),
        user_name: 'John Doe',
        user_email: 'john@example.com',
        user_image: null,
      };
      dbService.query.mockResolvedValue([mockMember]);

      const result = await service.getMembers('org-1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
      expect(result[0].user.name).toBe('John Doe');
      expect(result[0].user.email).toBe('john@example.com');
    });
  });

  describe('updateMemberRole', () => {
    it('should update member role for admin actor', async () => {
      dbService.queryOne
        .mockResolvedValueOnce({ id: 'member-1', role: 'member', userId: 'user-1' })
        .mockResolvedValueOnce({ id: 'member-1', role: 'manager', userId: 'user-1', organizationId: 'org-1' });

      const result = await service.updateMemberRole('org-1', 'member-1', 'manager', 'admin');

      expect(result.role).toBe('manager');
      expect(dbService.query).toHaveBeenCalledWith(
        'UPDATE member SET role = $1 WHERE id = $2 AND "organizationId" = $3',
        ['manager', 'member-1', 'org-1'],
      );
    });

    it('should block manager from changing another manager role', async () => {
      dbService.queryOne.mockResolvedValueOnce({ id: 'member-1', role: 'manager', userId: 'user-1' });

      await expect(service.updateMemberRole('org-1', 'member-1', 'member', 'manager')).rejects.toThrow(
        'Managers can only change member roles',
      );
    });

    it('should throw NotFoundException when member does not exist', async () => {
      dbService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.updateMemberRole('org-1', 'missing-member', 'member', 'admin'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should block downgrading last admin in organization', async () => {
      dbService.queryOne
        .mockResolvedValueOnce({ id: 'member-1', role: 'admin', userId: 'user-1' })
        .mockResolvedValueOnce({ count: '1' });

      await expect(service.updateMemberRole('org-1', 'member-1', 'manager', 'admin')).rejects.toThrow(
        'Cannot change role of the last organization admin',
      );
    });
  });

  describe('removeMember', () => {
    it('should remove member for admin actor', async () => {
      dbService.queryOne
        .mockResolvedValueOnce({ id: 'member-1', role: 'member', userId: 'user-1' })
        .mockResolvedValueOnce({ id: 'member-1' });
      dbService.query.mockResolvedValueOnce([{ id: 'member-1' }]);

      const result = await service.removeMember('org-1', 'member-1', 'admin');

      expect(result.success).toBe(true);
      expect(dbService.query).toHaveBeenCalledWith(
        'DELETE FROM member WHERE id = $1 AND "organizationId" = $2 RETURNING id',
        ['member-1', 'org-1'],
      );
    });

    it('should block manager from removing non-member roles', async () => {
      dbService.queryOne.mockResolvedValueOnce({ id: 'member-1', role: 'manager', userId: 'user-1' });

      await expect(service.removeMember('org-1', 'member-1', 'manager')).rejects.toThrow(
        'Managers can only remove members',
      );
    });

    it('should block removing last admin in organization', async () => {
      dbService.queryOne
        .mockResolvedValueOnce({ id: 'member-1', role: 'admin', userId: 'user-1' })
        .mockResolvedValueOnce({ count: '1' });

      await expect(service.removeMember('org-1', 'member-1', 'admin')).rejects.toThrow(
        'Cannot remove the last organization admin',
      );
    });
  });

  describe('getRoles', () => {
    const mockRoles = [
      { name: 'admin', display_name: 'Admin', description: 'Platform admin', color: '#ff0000', is_system: true },
      { name: 'manager', display_name: 'Manager', description: 'Org manager', color: '#00ff00', is_system: true },
      { name: 'member', display_name: 'Member', description: 'Regular user', color: '#0000ff', is_system: true },
    ];

    it('should return all roles from database', async () => {
      dbService.query.mockResolvedValue(mockRoles);

      const result = await service.getRoles();

      expect(result.roles).toHaveLength(3);
      expect(result.roles[0].name).toBe('admin');
      expect(result.roles[0].displayName).toBe('Admin');
      expect(result.roles[0].description).toBe('Platform admin');
      expect(result.roles[0].color).toBe('#ff0000');
      expect(result.roles[0].isSystem).toBe(true);
    });

    it('should return all assignableRoles when no requesterRole provided', async () => {
      dbService.query.mockResolvedValue(mockRoles);

      const result = await service.getRoles();

      expect(result.assignableRoles).toEqual(['admin', 'manager', 'member']);
    });

    it('should filter assignableRoles for manager (only manager + member)', async () => {
      dbService.query.mockResolvedValue(mockRoles);

      const result = await service.getRoles('manager');

      expect(result.assignableRoles).toEqual(['manager', 'member']);
      expect(result.assignableRoles).not.toContain('admin');
    });

    it('should return all assignableRoles for admin', async () => {
      dbService.query.mockResolvedValue(mockRoles);

      const result = await service.getRoles('admin');

      expect(result.assignableRoles).toEqual(['admin', 'manager', 'member']);
    });

    it('should filter assignableRoles for member (only member)', async () => {
      dbService.query.mockResolvedValue(mockRoles);

      const result = await service.getRoles('member');

      expect(result.assignableRoles).toEqual(['member']);
    });

    it('should still return all roles metadata regardless of requesterRole', async () => {
      dbService.query.mockResolvedValue(mockRoles);

      const result = await service.getRoles('manager');

      // All roles visible for display, but assignableRoles is filtered
      expect(result.roles).toHaveLength(3);
      expect(result.assignableRoles).toHaveLength(2);
    });

    it('should handle empty roles table', async () => {
      dbService.query.mockResolvedValue([]);

      const result = await service.getRoles();

      expect(result.roles).toHaveLength(0);
      expect(result.assignableRoles).toEqual([]);
    });

    it('should query roles table with correct SQL', async () => {
      dbService.query.mockResolvedValue([]);

      await service.getRoles();

      expect(dbService.query).toHaveBeenCalledWith(
        'SELECT name, display_name, description, color, is_system FROM roles ORDER BY is_system DESC, name ASC'
      );
    });

    it('should filter assignableRoles for manager', async () => {
      dbService.query.mockResolvedValue(mockRoles);

      const result = await service.getRoles('manager');

      expect(result.assignableRoles).toEqual(['manager', 'member']);
    });

    it('should not allow assigning owner role for admin', async () => {
      dbService.query.mockResolvedValue([
        ...mockRoles,
        { name: 'owner', display_name: 'Owner', description: 'Organization owner', color: '#ffaa00', is_system: true },
      ]);

      const result = await service.getRoles('admin');

      expect(result.assignableRoles).toEqual(expect.arrayContaining(['admin', 'manager', 'member']));
      expect(result.assignableRoles).not.toContain('owner');
    });
  });
});

// Pure function unit tests (no DI needed)
describe('Role Hierarchy Utilities', () => {
  describe('ROLE_HIERARCHY', () => {
    it('should have member < manager < admin', () => {
      expect(ROLE_HIERARCHY.member).toBeLessThan(ROLE_HIERARCHY.manager);
      expect(ROLE_HIERARCHY.manager).toBeLessThan(ROLE_HIERARCHY.admin);
    });
  });

  describe('getRoleLevel', () => {
    it('should return correct level for known roles', () => {
      expect(getRoleLevel('member')).toBe(0);
      expect(getRoleLevel('manager')).toBe(1);
      expect(getRoleLevel('admin')).toBe(2);
    });

    it('should return 0 for unknown roles', () => {
      expect(getRoleLevel('unknown')).toBe(0);
      expect(getRoleLevel('')).toBe(0);
    });
  });

  describe('filterAssignableRoles', () => {
    const allRoles = ['admin', 'manager', 'member'];

    it('manager should only assign manager and member', () => {
      expect(filterAssignableRoles(allRoles, 'manager')).toEqual(['manager', 'member']);
    });

    it('admin should assign all roles', () => {
      expect(filterAssignableRoles(allRoles, 'admin')).toEqual(['admin', 'manager', 'member']);
    });

    it('member should only assign member', () => {
      expect(filterAssignableRoles(allRoles, 'member')).toEqual(['member']);
    });

    it('should ignore unknown role names from input', () => {
      expect(filterAssignableRoles(['super-admin', 'admin', 'manager', 'member'], 'admin')).toEqual([
        'admin',
        'manager',
        'member',
      ]);
    });

    it('unknown role should only assign member-level roles', () => {
      expect(filterAssignableRoles(allRoles, 'unknown')).toEqual(['member']);
    });

    it('should handle empty input', () => {
      expect(filterAssignableRoles([], 'admin')).toEqual([]);
    });
  });
});
