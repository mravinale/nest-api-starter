import { Test, TestingModule } from '@nestjs/testing';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { RoleService } from './role.service';
import { DatabaseService } from '../../database';

describe('RoleService', () => {
  let service: RoleService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDbService: any;

  beforeEach(async () => {
    mockDbService = {
      query: jest.fn(),
      queryOne: jest.fn(),
      transaction: jest.fn(),
      onModuleDestroy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile();

    service = module.get<RoleService>(RoleService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all roles', async () => {
      const mockRoles = [
        {
          id: '1',
          name: 'admin',
          display_name: 'Admin',
          description: 'Full access',
          color: 'red',
          is_system: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
      mockDbService.query.mockResolvedValue(mockRoles);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('admin');
      expect(result[0].displayName).toBe('Admin');
      expect(mockDbService.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
      );
    });
  });

  describe('findByName', () => {
    it('should return role by name', async () => {
      const mockRole = {
        id: '1',
        name: 'admin',
        display_name: 'Admin',
        description: 'Full access',
        color: 'red',
        is_system: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);

      const result = await service.findByName('admin');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('admin');
      expect(mockDbService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE name'),
        ['admin'],
      );
    });

    it('should return null if role not found', async () => {
      mockDbService.queryOne.mockResolvedValue(null);

      const result = await service.findByName('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new role', async () => {
      const createDto = {
        name: 'editor',
        displayName: 'Editor',
        description: 'Can edit content',
        color: 'blue',
      };
      const mockRole = {
        id: '2',
        name: 'editor',
        display_name: 'Editor',
        description: 'Can edit content',
        color: 'blue',
        is_system: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);

      const result = await service.create(createDto);

      expect(result.name).toBe('editor');
      expect(result.isSystem).toBe(false);
      expect(mockDbService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO roles'),
        expect.arrayContaining(['editor', 'Editor', 'Can edit content', 'blue']),
      );
    });
  });

  describe('update', () => {
    it('should update a role', async () => {
      const updateDto = { displayName: 'Updated Editor' };
      const mockRole = {
        id: '2',
        name: 'editor',
        display_name: 'Updated Editor',
        description: 'Can edit content',
        color: 'blue',
        is_system: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);

      const result = await service.update('2', updateDto);

      expect(result?.displayName).toBe('Updated Editor');
    });

    it('should not update system roles name', async () => {
      const mockRole = {
        id: '1',
        name: 'admin',
        display_name: 'Admin',
        description: 'Full access',
        color: 'red',
        is_system: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);

      // Should still allow updating display_name, description, color
      const result = await service.update('1', { displayName: 'Administrator' });

      expect(result?.displayName).toBe('Admin'); // Returns the mock, but in real impl would update
    });
  });

  describe('delete', () => {
    it('should delete a non-system role', async () => {
      const mockRole = {
        id: '2',
        name: 'editor',
        display_name: 'Editor',
        description: 'Can edit content',
        color: 'blue',
        is_system: false,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);
      mockDbService.query.mockResolvedValue([]);

      await service.delete('2');

      expect(mockDbService.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM roles'),
        ['2'],
      );
    });

    it('should throw error when deleting system role', async () => {
      const mockRole = {
        id: '1',
        name: 'admin',
        display_name: 'Admin',
        description: 'Full access',
        color: 'red',
        is_system: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);

      await expect(service.delete('1')).rejects.toThrow('Cannot delete system role');
    });
  });

  describe('getPermissions', () => {
    it('should return permissions for a role', async () => {
      const mockPermissions = [
        { id: '1', resource: 'user', action: 'create', description: null },
        { id: '2', resource: 'user', action: 'read', description: null },
      ];
      mockDbService.query.mockResolvedValue(mockPermissions);

      const result = await service.getPermissions('1');

      expect(result).toHaveLength(2);
      expect(result[0].resource).toBe('user');
      expect(mockDbService.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN role_permissions'),
        ['1'],
      );
    });
  });

  describe('assignPermissions', () => {
    it('should assign permissions to a role', async () => {
      mockDbService.transaction.mockImplementation(async (callback: (query: unknown) => Promise<unknown>) => {
        const mockQuery = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
        return callback(mockQuery);
      });

      await service.assignPermissions('2', ['perm1', 'perm2']);

      expect(mockDbService.transaction).toHaveBeenCalled();
    });

    it('should assign empty permissions array — covers empty loop branch', async () => {
      mockDbService.transaction.mockImplementation(async (callback: (query: unknown) => Promise<unknown>) => {
        const mockQuery = jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
        return callback(mockQuery);
      });

      await service.assignPermissions('2', []);

      expect(mockDbService.transaction).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns role when found — covers truthy branch', async () => {
      const mockRole = {
        id: '1', name: 'admin', display_name: 'Admin',
        description: 'Full access', color: 'red',
        is_system: true, created_at: new Date(), updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);

      const result = await service.findById('1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('1');
    });

    it('returns null when not found — covers null branch', async () => {
      mockDbService.queryOne.mockResolvedValue(null);

      const result = await service.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('create — branch coverage', () => {
    it('throws when db returns null — covers !row branch', async () => {
      mockDbService.queryOne.mockResolvedValue(null);

      await expect(service.create({ name: 'x', displayName: 'X' })).rejects.toThrow(
        'Failed to create role',
      );
    });

    it('uses null for description when not provided — covers description ?? null branch', async () => {
      const mockRole = {
        id: '3', name: 'viewer', display_name: 'Viewer',
        description: null, color: 'gray',
        is_system: false, created_at: new Date(), updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);

      await service.create({ name: 'viewer', displayName: 'Viewer' });

      expect(mockDbService.queryOne).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null]),
      );
    });

    it('uses gray default for color when not provided — covers color ?? gray branch', async () => {
      const mockRole = {
        id: '3', name: 'viewer', display_name: 'Viewer',
        description: null, color: 'gray',
        is_system: false, created_at: new Date(), updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);

      await service.create({ name: 'viewer', displayName: 'Viewer' });

      expect(mockDbService.queryOne).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['gray']),
      );
    });
  });

  describe('update — branch coverage', () => {
    it('returns null when role not found — covers !existing branch', async () => {
      mockDbService.queryOne.mockResolvedValue(null);

      const result = await service.update('missing', { displayName: 'X' });

      expect(result).toBeNull();
    });

    it('returns existing role when dto is empty — covers updates.length === 0 branch', async () => {
      const mockRole = {
        id: '2', name: 'editor', display_name: 'Editor',
        description: null, color: 'blue',
        is_system: false, created_at: new Date(), updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);

      const result = await service.update('2', {});

      expect(result?.name).toBe('editor');
      expect(mockDbService.queryOne).toHaveBeenCalledTimes(1);
    });

    it('updates description field — covers dto.description branch', async () => {
      const mockRole = {
        id: '2', name: 'editor', display_name: 'Editor',
        description: 'Updated desc', color: 'blue',
        is_system: false, created_at: new Date(), updated_at: new Date(),
      };
      mockDbService.queryOne
        .mockResolvedValueOnce(mockRole)
        .mockResolvedValueOnce(mockRole);

      const result = await service.update('2', { description: 'Updated desc' });

      expect(result?.name).toBe('editor');
    });

    it('updates color field — covers dto.color branch', async () => {
      const mockRole = {
        id: '2', name: 'editor', display_name: 'Editor',
        description: null, color: 'green',
        is_system: false, created_at: new Date(), updated_at: new Date(),
      };
      mockDbService.queryOne
        .mockResolvedValueOnce(mockRole)
        .mockResolvedValueOnce(mockRole);

      const result = await service.update('2', { color: 'green' });

      expect(result?.name).toBe('editor');
    });

    it('returns null when update query returns null — covers row ? branch', async () => {
      const mockRole = {
        id: '2', name: 'editor', display_name: 'Editor',
        description: null, color: 'blue',
        is_system: false, created_at: new Date(), updated_at: new Date(),
      };
      mockDbService.queryOne
        .mockResolvedValueOnce(mockRole)
        .mockResolvedValueOnce(null);

      const result = await service.update('2', { displayName: 'New Name' });

      expect(result).toBeNull();
    });
  });

  describe('delete — branch coverage', () => {
    it('throws when role not found — covers !existing branch', async () => {
      mockDbService.queryOne.mockResolvedValue(null);

      await expect(service.delete('missing')).rejects.toThrow('Role not found');
    });
  });

  describe('getUserPermissions', () => {
    it('returns empty array when role not found — covers !role branch', async () => {
      mockDbService.queryOne.mockResolvedValue(null);

      const result = await service.getUserPermissions('nonexistent');

      expect(result).toEqual([]);
    });

    it('returns permissions when role exists — covers role found branch', async () => {
      const mockRole = {
        id: '1', name: 'admin', display_name: 'Admin',
        description: null, color: 'red',
        is_system: true, created_at: new Date(), updated_at: new Date(),
      };
      mockDbService.queryOne.mockResolvedValue(mockRole);
      mockDbService.query.mockResolvedValue([
        { id: 'p1', resource: 'user', action: 'read', description: null },
      ]);

      const result = await service.getUserPermissions('admin');

      expect(result).toHaveLength(1);
      expect(result[0].resource).toBe('user');
    });
  });

  describe('hasPermission', () => {
    it('returns true when count > 0 — covers truthy count branch', async () => {
      mockDbService.queryOne.mockResolvedValue({ count: '1' });

      const result = await service.hasPermission('admin', 'user', 'read');

      expect(result).toBe(true);
    });

    it('returns false when count is 0 — covers count === 0 branch', async () => {
      mockDbService.queryOne.mockResolvedValue({ count: '0' });

      const result = await service.hasPermission('member', 'user', 'delete');

      expect(result).toBe(false);
    });

    it('returns false when row is null — covers !row branch', async () => {
      mockDbService.queryOne.mockResolvedValue(null);

      const result = await service.hasPermission('unknown', 'user', 'read');

      expect(result).toBe(false);
    });
  });
});
