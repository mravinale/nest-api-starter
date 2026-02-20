import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { DatabaseService } from '../../database';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let dbService: jest.Mocked<DatabaseService>;

  const createMockExecutionContext = (session: unknown): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ session }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  };

  beforeEach(async () => {
    const mockDbService = {
      query: jest.fn(),
      queryOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        Reflector,
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
    reflector = module.get<Reflector>(Reflector);
    dbService = module.get(DatabaseService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('when no permissions are required', () => {
    it('should allow access when no permissions metadata', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
      const context = createMockExecutionContext({ user: { role: 'member' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should allow access when empty permissions array', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
      const context = createMockExecutionContext({ user: { role: 'member' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });

  describe('when permissions are required', () => {
    beforeEach(() => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['user:read']);
    });

    it('should allow access for admin role without DB check', async () => {
      const context = createMockExecutionContext({ user: { role: 'admin' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(dbService.query).not.toHaveBeenCalled();
    });

    it('should allow access for non-admin with required permissions', async () => {
      dbService.query.mockResolvedValueOnce([{ permission: 'user:read' }]);
      const context = createMockExecutionContext({ user: { role: 'manager' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should deny access for non-admin missing required permissions', async () => {
      dbService.query.mockResolvedValueOnce([{ permission: 'role:list' }]);
      const context = createMockExecutionContext({ user: { role: 'member' } });
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should deny access when no session', async () => {
      const context = createMockExecutionContext(null);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should deny access when session has no user', async () => {
      const context = createMockExecutionContext({});
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should deny access when user has no permissions at all', async () => {
      dbService.query.mockResolvedValueOnce([]);
      const context = createMockExecutionContext({ user: { role: 'member' } });
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('when multiple permissions are required', () => {
    beforeEach(() => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['user:read', 'user:create']);
    });

    it('should allow access when user has all required permissions', async () => {
      dbService.query.mockResolvedValueOnce([
        { permission: 'user:read' },
        { permission: 'user:create' },
        { permission: 'user:update' },
      ]);
      const context = createMockExecutionContext({ user: { role: 'manager' } });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('should deny access when user has only some required permissions', async () => {
      dbService.query.mockResolvedValueOnce([{ permission: 'user:read' }]);
      const context = createMockExecutionContext({ user: { role: 'manager' } });
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });
  });
});
