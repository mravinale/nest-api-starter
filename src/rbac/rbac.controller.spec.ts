import { jest } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RbacController } from './rbac.controller';
import { RoleService, PermissionService } from './services';
import { ROLES_KEY, PERMISSIONS_KEY } from '../common';
import { RolesGuard, PermissionsGuard } from '../common';

describe('RbacController metadata', () => {
  let controller: RbacController;

  beforeEach(() => {
    const roleService = {
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
    } as unknown as RoleService;

    const permissionService = {
      findAll: jest.fn(),
      findGroupedByResource: jest.fn(),
    } as unknown as PermissionService;

    controller = new RbacController(roleService, permissionService);
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
