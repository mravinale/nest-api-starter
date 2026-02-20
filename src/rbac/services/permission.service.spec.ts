import { Test, TestingModule } from '@nestjs/testing';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PermissionService } from './permission.service';
import { DatabaseService } from '../../database';

const makePermRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'perm-1',
  resource: 'user',
  action: 'read',
  description: 'Read users',
  ...overrides,
});

describe('PermissionService', () => {
  let service: PermissionService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      query: jest.fn(),
      queryOne: jest.fn(),
      transaction: jest.fn(),
      onModuleDestroy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('returns mapped permissions', async () => {
      mockDb.query.mockResolvedValue([
        makePermRow({ id: '1', resource: 'user', action: 'read' }),
        makePermRow({ id: '2', resource: 'user', action: 'create' }),
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].resource).toBe('user');
      expect(result[0].action).toBe('read');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM permissions'),
      );
    });

    it('returns empty array when no permissions exist', async () => {
      mockDb.query.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('returns permission when found', async () => {
      mockDb.queryOne.mockResolvedValue(makePermRow({ id: 'perm-1' }));

      const result = await service.findById('perm-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('perm-1');
      expect(mockDb.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['perm-1'],
      );
    });

    it('returns null when not found — covers null branch', async () => {
      mockDb.queryOne.mockResolvedValue(null);

      const result = await service.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('findByResourceAction', () => {
    it('returns permission when found', async () => {
      mockDb.queryOne.mockResolvedValue(makePermRow({ resource: 'org', action: 'delete' }));

      const result = await service.findByResourceAction('org', 'delete');

      expect(result).not.toBeNull();
      expect(result?.resource).toBe('org');
      expect(result?.action).toBe('delete');
      expect(mockDb.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE resource = $1 AND action = $2'),
        ['org', 'delete'],
      );
    });

    it('returns null when not found — covers null branch', async () => {
      mockDb.queryOne.mockResolvedValue(null);

      const result = await service.findByResourceAction('org', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findGroupedByResource', () => {
    it('groups permissions by resource', async () => {
      mockDb.query.mockResolvedValue([
        makePermRow({ id: '1', resource: 'user', action: 'read' }),
        makePermRow({ id: '2', resource: 'user', action: 'create' }),
        makePermRow({ id: '3', resource: 'org', action: 'list' }),
      ]);

      const result = await service.findGroupedByResource();

      expect(Object.keys(result)).toEqual(expect.arrayContaining(['user', 'org']));
      expect(result['user']).toHaveLength(2);
      expect(result['org']).toHaveLength(1);
    });

    it('returns empty object when no permissions — covers empty reduce branch', async () => {
      mockDb.query.mockResolvedValue([]);

      const result = await service.findGroupedByResource();

      expect(result).toEqual({});
    });

    it('accumulates multiple resources correctly — covers acc[resource] already exists branch', async () => {
      mockDb.query.mockResolvedValue([
        makePermRow({ id: '1', resource: 'user', action: 'read' }),
        makePermRow({ id: '2', resource: 'user', action: 'create' }),
        makePermRow({ id: '3', resource: 'user', action: 'delete' }),
      ]);

      const result = await service.findGroupedByResource();

      expect(result['user']).toHaveLength(3);
    });
  });

  describe('create', () => {
    it('creates permission with description', async () => {
      mockDb.queryOne.mockResolvedValue(
        makePermRow({ id: 'new-1', resource: 'report', action: 'export', description: 'Export reports' }),
      );

      const result = await service.create('report', 'export', 'Export reports');

      expect(result.resource).toBe('report');
      expect(result.action).toBe('export');
      expect(mockDb.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO permissions'),
        ['report', 'export', 'Export reports'],
      );
    });

    it('creates permission without description — covers description ?? null branch', async () => {
      mockDb.queryOne.mockResolvedValue(
        makePermRow({ id: 'new-2', resource: 'report', action: 'view', description: null }),
      );

      const result = await service.create('report', 'view');

      expect(result.resource).toBe('report');
      expect(mockDb.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO permissions'),
        ['report', 'view', null],
      );
    });

    it('throws when db returns null — covers !row branch', async () => {
      mockDb.queryOne.mockResolvedValue(null);

      await expect(service.create('report', 'export')).rejects.toThrow(
        'Failed to create permission',
      );
    });
  });
});
