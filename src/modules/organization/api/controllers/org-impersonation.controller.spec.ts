import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  Session: () => () => {},
  AllowAnonymous: () => () => {},
  BetterAuthGuard: class {},
}));

import { OrgImpersonationController } from './org-impersonation.controller';
import { OrgImpersonationService } from '../../application/services';

describe('OrgImpersonationController', () => {
  let controller: OrgImpersonationController;
  let impersonationService: jest.Mocked<OrgImpersonationService>;

  const baseSession = {
    user: { id: 'manager-1', role: 'manager' },
    session: { activeOrganizationId: 'org-1' },
  } as any;

  beforeEach(() => {
    impersonationService = {
      impersonateUser: jest.fn(),
      stopImpersonation: jest.fn(),
      getMembership: jest.fn(),
      canImpersonate: jest.fn(),
    } as unknown as jest.Mocked<OrgImpersonationService>;

    controller = new OrgImpersonationController(impersonationService);
  });

  describe('impersonate', () => {
    it('should return sessionToken on successful impersonation', async () => {
      impersonationService.impersonateUser.mockResolvedValue({
        sessionToken: 'new-session-token',
      });

      const result = await controller.impersonate(
        'org-1',
        { userId: 'user-1' },
        baseSession,
      );

      expect(result).toEqual({ success: true, sessionToken: 'new-session-token' });
      expect(impersonationService.impersonateUser).toHaveBeenCalledWith(
        'manager-1',
        'user-1',
        'org-1',
      );
    });

    it('should throw ForbiddenException when session has no user', async () => {
      const sessionWithoutUser = {} as any;

      await expect(
        controller.impersonate('org-1', { userId: 'user-1' }, sessionWithoutUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when session is null', async () => {
      await expect(
        controller.impersonate('org-1', { userId: 'user-1' }, null as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should propagate service errors', async () => {
      impersonationService.impersonateUser.mockRejectedValue(
        new ForbiddenException('Not a member'),
      );

      await expect(
        controller.impersonate('org-1', { userId: 'user-1' }, baseSession),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('stopImpersonating', () => {
    it('should stop impersonation with valid Bearer token', async () => {
      impersonationService.stopImpersonation.mockResolvedValue(undefined);

      const mockRequest = {
        headers: { authorization: 'Bearer impersonation-token-123' },
      } as any;

      const result = await controller.stopImpersonating(mockRequest);

      expect(result).toEqual({ success: true });
      expect(impersonationService.stopImpersonation).toHaveBeenCalledWith(
        'impersonation-token-123',
      );
    });

    it('should throw ForbiddenException when no Authorization header', async () => {
      const mockRequest = { headers: {} } as any;

      await expect(controller.stopImpersonating(mockRequest)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when Authorization header is not Bearer', async () => {
      const mockRequest = {
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      } as any;

      await expect(controller.stopImpersonating(mockRequest)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should propagate service errors on stop', async () => {
      impersonationService.stopImpersonation.mockRejectedValue(
        new ForbiddenException('Not an impersonation session'),
      );

      const mockRequest = {
        headers: { authorization: 'Bearer some-token' },
      } as any;

      await expect(controller.stopImpersonating(mockRequest)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
