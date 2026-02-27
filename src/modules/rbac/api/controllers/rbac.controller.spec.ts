import { jest } from '@jest/globals';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => {},
  AllowAnonymous: () => () => {},
  BetterAuthGuard: class {},
  BetterAuthModule: { forRoot: jest.fn(() => ({ module: class {} })) },
}));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RbacController } from './rbac.controller';
import { RoleService, PermissionService } from '../../application/services';
import { ROLES_KEY, PERMISSIONS_KEY } from '../../../../common';
import { RolesGuard, PermissionsGuard } from '../../../../common';

describe('RbacController metadata', () => {
  let controller: RbacController;
  let roleService: {
    findAll: ReturnType<typeof jest.fn>;
    findById: ReturnType<typeof jest.fn>;
    findByName: ReturnType<typeof jest.fn>;
    create: ReturnType<typeof jest.fn>;
    update: ReturnType<typeof jest.fn>;
    delete: ReturnType<typeof jest.fn>;
    assignPermissions: ReturnType<typeof jest.fn>;
    getPermissions: ReturnType<typeof jest.fn>;
    getUserPermissions: ReturnType<typeof jest.fn>;
    hasPermission: ReturnType<typeof jest.fn>;
  };
  let permissionService: {
    findAll: ReturnType<typeof jest.fn>;
    findGroupedByResource: ReturnType<typeof jest.fn>;
  };

  beforeEach(() => {
    roleService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      assignPermissions: jest.fn(),
      getPermissions: jest.fn(),
      getUserPermissions: jest.fn(),
      hasPermission: jest.fn(),
    };

    permissionService = {
      findAll: jest.fn(),
      findGroupedByResource: jest.fn(),
    };

    controller = new RbacController(
      roleService as unknown as RoleService,
      permissionService as unknown as PermissionService,
    );
  });

  it('returns all permissions for admin in getMyPermissions', async () => {
    permissionService.findAll.mockResolvedValue([
      { id: '1', resource: 'organization', action: 'create' },
      { id: '2', resource: 'user', action: 'read' },
    ]);

    const result = await controller.getMyPermissions({
      user: { role: 'admin' },
    } as any);

    expect(result).toEqual({
      data: ['organization:create', 'user:read'],
    });
    expect(permissionService.findAll).toHaveBeenCalled();
    expect(roleService.getUserPermissions).not.toHaveBeenCalled();
  });

  it('returns role-based permissions for non-admin in getMyPermissions', async () => {
    roleService.getUserPermissions.mockResolvedValue([
      { id: '3', resource: 'organization', action: 'read' },
      { id: '4', resource: 'organization', action: 'invite' },
    ]);

    const result = await controller.getMyPermissions({
      user: { role: 'manager' },
    } as any);

    expect(result).toEqual({
      data: ['organization:read', 'organization:invite'],
    });
    expect(roleService.getUserPermissions).toHaveBeenCalledWith('manager');
    expect(permissionService.findAll).not.toHaveBeenCalled();
  });

  it('applies class-level role restrictions', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, RbacController);
    expect(roles).toEqual(['admin', 'manager']);
  });

  it('applies class-level guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RbacController) as unknown[];

    expect(guards).toBeDefined();
    expect(guards).toContain(RolesGuard);
    expect(guards).toContain(PermissionsGuard);
  });

  it('requires role:read for RBAC read operations', () => {
    const methods = ['getRoles', 'getRole', 'getPermissions', 'getPermissionsGrouped', 'getUserPermissions', 'checkPermission'] as const;

    methods.forEach((methodName) => {
      const handler = (controller as unknown as Record<string, unknown>)[methodName] as object;
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[];
      expect(permissions).toContain('role:read');
    });
  });

  it('requires admin role on RBAC write operations', () => {
    const methods = ['createRole', 'updateRole', 'deleteRole', 'assignPermissions'] as const;

    methods.forEach((methodName) => {
      const handler = (controller as unknown as Record<string, unknown>)[methodName] as object;
      const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
      expect(roles).toEqual(['admin']);
    });
  });

  it('requires specific role permissions on RBAC write operations', () => {
    const expectations: Array<[keyof RbacController, string]> = [
      ['createRole', 'role:create'],
      ['updateRole', 'role:update'],
      ['deleteRole', 'role:delete'],
      ['assignPermissions', 'role:assign'],
    ];

    expectations.forEach(([methodName, requiredPermission]) => {
      const handler = (controller as unknown as Record<string, unknown>)[methodName] as object;
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[];
      expect(permissions).toContain(requiredPermission);
    });
  });
});
