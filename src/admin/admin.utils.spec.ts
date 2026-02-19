import { ForbiddenException } from '@nestjs/common';
import {
  getAllowedRoleNamesForCreator,
  getActiveOrganizationId,
  getPlatformRole,
  requireAdminOrManager,
  requireActiveOrganizationIdForManager,
} from './admin.utils';

describe('admin.utils', () => {
  describe('getAllowedRoleNamesForCreator', () => {
    it('should allow admin to create admin/manager/member', () => {
      expect(getAllowedRoleNamesForCreator('admin')).toEqual([
        'admin',
        'manager',
        'member',
      ]);
    });

    it('should allow manager to create manager/member', () => {
      expect(getAllowedRoleNamesForCreator('manager')).toEqual(['manager', 'member']);
    });
  });

  describe('getPlatformRole', () => {
    it('should return admin for admin role', () => {
      expect(getPlatformRole({ user: { role: 'admin' } } as any)).toBe('admin');
    });

    it('should return manager for manager role', () => {
      expect(getPlatformRole({ user: { role: 'manager' } } as any)).toBe('manager');
    });

    it('should default to member for unknown role', () => {
      expect(getPlatformRole({ user: { role: 'something-else' } } as any)).toBe('member');
    });

    it('should handle role arrays', () => {
      expect(getPlatformRole({ user: { role: ['manager', 'member'] } } as any)).toBe(
        'manager',
      );
    });
  });

  describe('getActiveOrganizationId', () => {
    it('should read activeOrganizationId from session.session', () => {
      expect(
        getActiveOrganizationId({ session: { activeOrganizationId: 'org-1' } } as any),
      ).toBe('org-1');
    });

    it('should return null when missing', () => {
      expect(getActiveOrganizationId({} as any)).toBeNull();
    });
  });

  describe('requireAdminOrManager', () => {
    it('should return admin for admin role', () => {
      expect(requireAdminOrManager({ user: { role: 'admin' } } as any)).toBe('admin');
    });

    it('should return manager for manager role', () => {
      expect(requireAdminOrManager({ user: { role: 'manager' } } as any)).toBe('manager');
    });

    it('should throw ForbiddenException for member role', () => {
      expect(() => requireAdminOrManager({ user: { role: 'member' } } as any)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for unknown role', () => {
      expect(() => requireAdminOrManager({ user: { role: 'guest' } } as any)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is missing', () => {
      expect(() => requireAdminOrManager({} as any)).toThrow(ForbiddenException);
    });
  });

  describe('requireActiveOrganizationIdForManager', () => {
    it('should return null for admin regardless of session', () => {
      expect(
        requireActiveOrganizationIdForManager('admin', {} as any),
      ).toBeNull();
    });

    it('should return orgId for manager with active organization', () => {
      expect(
        requireActiveOrganizationIdForManager('manager', {
          session: { activeOrganizationId: 'org-1' },
        } as any),
      ).toBe('org-1');
    });

    it('should throw ForbiddenException for manager without active organization', () => {
      expect(() =>
        requireActiveOrganizationIdForManager('manager', {} as any),
      ).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException for manager with null activeOrganizationId', () => {
      expect(() =>
        requireActiveOrganizationIdForManager('manager', {
          session: { activeOrganizationId: undefined },
        } as any),
      ).toThrow(ForbiddenException);
    });
  });
});
