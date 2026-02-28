import { jest } from '@jest/globals';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => {},
  AllowAnonymous: () => () => {},
  BetterAuthGuard: class {},
  BetterAuthModule: { forRoot: jest.fn(() => ({ module: class {} })) },
}));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SessionsController } from './sessions.controller';
import { SessionsService } from '../../application/services/sessions.service';
import { ROLES_KEY, PERMISSIONS_KEY } from '../../../../../shared';
import { RolesGuard, PermissionsGuard } from '../../../../../shared';

describe('SessionsController', () => {
  let controller: SessionsController;
  let sessionsService: jest.Mocked<SessionsService>;

  const adminSession = {
    user: { id: 'actor-admin', role: 'admin' },
    session: {},
  } as any;

  const managerSession = {
    user: { id: 'actor-mgr', role: 'manager' },
    session: { activeOrganizationId: 'org-1' },
  } as any;

  beforeEach(() => {
    sessionsService = {
      listUserSessions: jest.fn(),
      revokeSession: jest.fn(),
      revokeAllSessions: jest.fn(),
    } as any;
    controller = new SessionsController(sessionsService);
  });

  // ─── class-level metadata ────────────────────────────────────────────────

  describe('metadata', () => {
    it('applies RolesGuard and PermissionsGuard at class level', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, SessionsController);
      expect(guards).toContain(RolesGuard);
      expect(guards).toContain(PermissionsGuard);
    });

    it('restricts class to admin and manager roles', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, SessionsController);
      expect(roles).toEqual(['admin', 'manager']);
    });

    it('requires session:read permission on listSessions', () => {
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, controller.listSessions);
      expect(permissions).toContain('session:read');
    });

    it('requires session:revoke permission on revokeSession', () => {
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, controller.revokeSession);
      expect(permissions).toContain('session:revoke');
    });

    it('requires session:revoke permission on revokeAll', () => {
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, controller.revokeAll);
      expect(permissions).toContain('session:revoke');
    });
  });

  // ─── listSessions ────────────────────────────────────────────────────────

  describe('listSessions', () => {
    it('delegates to service with admin role and null activeOrganizationId', async () => {
      sessionsService.listUserSessions.mockResolvedValue([{ id: 's1' }] as any);

      const result = await controller.listSessions(adminSession, 'user-1');

      expect(sessionsService.listUserSessions).toHaveBeenCalledWith({
        userId: 'user-1',
        platformRole: 'admin',
        activeOrganizationId: null,
      });
      expect(result).toEqual([{ id: 's1' }]);
    });

    it('propagates activeOrganizationId for manager session', async () => {
      sessionsService.listUserSessions.mockResolvedValue([] as any);

      await controller.listSessions(managerSession, 'user-2');

      expect(sessionsService.listUserSessions).toHaveBeenCalledWith({
        userId: 'user-2',
        platformRole: 'manager',
        activeOrganizationId: 'org-1',
      });
    });
  });

  // ─── revokeSession ───────────────────────────────────────────────────────

  describe('revokeSession', () => {
    it('delegates to service with admin role and null activeOrganizationId', async () => {
      sessionsService.revokeSession.mockResolvedValue({ success: true });

      const result = await controller.revokeSession(adminSession, { sessionToken: 'token1' });

      expect(sessionsService.revokeSession).toHaveBeenCalledWith(
        { sessionToken: 'token1' },
        'admin',
        null,
      );
      expect(result).toEqual({ success: true });
    });

    it('propagates activeOrganizationId for manager session', async () => {
      sessionsService.revokeSession.mockResolvedValue({ success: true });

      await controller.revokeSession(managerSession, { sessionToken: 'tok' });

      expect(sessionsService.revokeSession).toHaveBeenCalledWith(
        { sessionToken: 'tok' },
        'manager',
        'org-1',
      );
    });

    it('rejects empty sessionToken', async () => {
      await expect(
        controller.revokeSession(adminSession, { sessionToken: '' }),
      ).rejects.toThrow('sessionToken is required');
    });

    it('rejects whitespace-only sessionToken', async () => {
      await expect(
        controller.revokeSession(adminSession, { sessionToken: '   ' }),
      ).rejects.toThrow('sessionToken is required');
    });

    it('rejects null sessionToken', async () => {
      await expect(
        controller.revokeSession(adminSession, { sessionToken: null as any }),
      ).rejects.toThrow('sessionToken is required');
    });

    it('rejects undefined sessionToken', async () => {
      await expect(
        controller.revokeSession(adminSession, { sessionToken: undefined as any }),
      ).rejects.toThrow('sessionToken is required');
    });
  });

  // ─── revokeAll ───────────────────────────────────────────────────────────

  describe('revokeAll', () => {
    it('delegates to service with admin role and null activeOrganizationId', async () => {
      sessionsService.revokeAllSessions.mockResolvedValue({ success: true });

      const result = await controller.revokeAll(adminSession, 'user-1');

      expect(sessionsService.revokeAllSessions).toHaveBeenCalledWith(
        { userId: 'user-1' },
        'admin',
        null,
      );
      expect(result).toEqual({ success: true });
    });

    it('propagates activeOrganizationId for manager session', async () => {
      sessionsService.revokeAllSessions.mockResolvedValue({ success: true });

      await controller.revokeAll(managerSession, 'user-2');

      expect(sessionsService.revokeAllSessions).toHaveBeenCalledWith(
        { userId: 'user-2' },
        'manager',
        'org-1',
      );
    });
  });
});
