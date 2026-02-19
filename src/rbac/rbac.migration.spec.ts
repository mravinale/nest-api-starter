import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { RbacMigrationService } from './rbac.migration';
import { DatabaseService } from '../database';

/**
 * Unit tests for RbacMigrationService tracked migrations (PR#3 - migration tracking system)
 */
describe('RbacMigrationService', () => {
  let service: RbacMigrationService;
  let dbService: any;

  beforeEach(async () => {
    const mockDbService = {
      query: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
      queryOne: jest.fn<() => Promise<unknown | null>>().mockResolvedValue(null),
      hasMigrationRun: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
      recordMigration: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacMigrationService,
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile();

    service = module.get<RbacMigrationService>(RbacMigrationService);
    dbService = module.get(DatabaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runTrackedMigrations', () => {
    it('should skip migrations that have already run', async () => {
      dbService.hasMigrationRun
        .mockResolvedValueOnce(true)   // rbac_001 already run
        .mockResolvedValueOnce(true)   // rbac_002 already run
        .mockResolvedValueOnce(true)   // rbac_003 already run
        .mockResolvedValueOnce(true);  // rbac_004 already run

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await service.runTrackedMigrations();

      expect(dbService.recordMigration).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('up to date'),
      );
      consoleSpy.mockRestore();
    });

    it('should run and record pending migrations', async () => {
      dbService.hasMigrationRun
        .mockResolvedValueOnce(true)    // rbac_001 already run
        .mockResolvedValueOnce(false)   // rbac_002 NOT run
        .mockResolvedValueOnce(false)   // rbac_003 NOT run
        .mockResolvedValueOnce(false);  // rbac_004 NOT run

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await service.runTrackedMigrations();

      expect(dbService.recordMigration).toHaveBeenCalledWith('rbac_002_migrate_old_role_names');
      expect(dbService.recordMigration).toHaveBeenCalledWith('rbac_003_seed_default_data');
      expect(dbService.recordMigration).toHaveBeenCalledWith(
        'rbac_004_add_manager_org_create_permission',
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('3 new'),
      );
      consoleSpy.mockRestore();
    });

    it('should check all four RBAC migrations', async () => {
      dbService.hasMigrationRun.mockResolvedValue(true);

      jest.spyOn(console, 'log').mockImplementation(() => {});
      await service.runTrackedMigrations();

      expect(dbService.hasMigrationRun).toHaveBeenCalledWith('rbac_001_create_tables');
      expect(dbService.hasMigrationRun).toHaveBeenCalledWith('rbac_002_migrate_old_role_names');
      expect(dbService.hasMigrationRun).toHaveBeenCalledWith('rbac_003_seed_default_data');
      expect(dbService.hasMigrationRun).toHaveBeenCalledWith(
        'rbac_004_add_manager_org_create_permission',
      );
    });
  });
});
