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
import { ROLES_KEY } from '../../../../../shared';
import { RolesGuard, PermissionsGuard } from '../../../../../shared';

describe('SessionsController', () => {
  let controller: SessionsController;
  let sessionsService: jest.Mocked<SessionsService>;

  const baseSession = {
    user: { id: 'actor-admin', role: 'admin' },
    session: {},
  } as any;

  beforeEach(() => {
    sessionsService = {
      listUserSessions: jest.fn(),
      revokeSession: jest.fn(),
      revokeAllSessions: jest.fn(),
    } as any;
    controller = new SessionsController(sessionsService);
  });

  describe('metadata', () => {
    it('should have RolesGuard and PermissionsGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, SessionsController);
      expect(guards).toContain(RolesGuard);
      expect(guards).toContain(PermissionsGuard);
    });

    it('should have admin,manager roles', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, SessionsController);
      expect(roles).toEqual(['admin', 'manager']);
    });
  });

  describe('listSessions', () => {
    it('should delegate to sessionsService.listUserSessions', async () => {
      const sessions = [{ id: 's1' }];
      sessionsService.listUserSessions.mockResolvedValue(sessions as any);

      const result = await controller.listSessions(baseSession, 'user-1');
      expect(sessionsService.listUserSessions).toHaveBeenCalledWith({
        userId: 'user-1',
        platformRole: 'admin',
        activeOrganizationId: null,
      });
      expect(result).toEqual(sessions);
    });
  });

  describe('revokeSession', () => {
    it('should delegate to sessionsService.revokeSession', async () => {
      sessionsService.revokeSession.mockResolvedValue({ success: true });

      const result = await controller.revokeSession(baseSession, { sessionToken: 'token1' });
      expect(sessionsService.revokeSession).toHaveBeenCalledWith(
        { sessionToken: 'token1' },
        'admin',
        null,
      );
      expect(result).toEqual({ success: true });
    });

    it('should reject empty sessionToken', async () => {
      await expect(
        controller.revokeSession(baseSession, { sessionToken: '' }),
      ).rejects.toThrow('sessionToken is required');
    });
  });

  describe('revokeAll', () => {
    it('should delegate to sessionsService.revokeAllSessions', async () => {
      sessionsService.revokeAllSessions.mockResolvedValue({ success: true });

      const result = await controller.revokeAll(baseSession, 'user-1');
      expect(sessionsService.revokeAllSessions).toHaveBeenCalledWith(
        { userId: 'user-1' },
        'admin',
        null,
      );
      expect(result).toEqual({ success: true });
    });
  });
});
