import { DatabaseService } from './database.module';
import { jest } from '@jest/globals';

/**
 * Unit tests for DatabaseService migration tracking (PR#3 - migration tracking system)
 */
describe('DatabaseService - Migration Tracking', () => {
  let service: DatabaseService;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] }),
      end: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      connect: jest.fn(),
    };

    service = new DatabaseService(mockPool as any);
  });

  describe('hasMigrationRun', () => {
    it('should return true when migration exists in _migrations table', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ name: '001_better_auth_core_tables' }],
      });

      const result = await service.hasMigrationRun('001_better_auth_core_tables');

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT name FROM _migrations'),
        ['001_better_auth_core_tables'],
      );
    });

    it('should return false when migration does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.hasMigrationRun('999_nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('recordMigration', () => {
    it('should insert migration name into _migrations table', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.recordMigration('001_better_auth_core_tables');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO _migrations'),
        ['001_better_auth_core_tables'],
      );
    });

    it('should use ON CONFLICT DO NOTHING for idempotency', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.recordMigration('001_better_auth_core_tables');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.any(Array),
      );
    });
  });

  describe('runMigrations', () => {
    it('should create _migrations table first', async () => {
      // Mock all hasMigrationRun calls to return true (already run)
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE _migrations
        .mockResolvedValueOnce({ rows: [{ name: '001' }] }) // hasMigrationRun check 1
        .mockResolvedValueOnce({ rows: [{ name: '002' }] }) // hasMigrationRun check 2
        .mockResolvedValueOnce({ rows: [{ name: '003' }] }) // hasMigrationRun check 3
        .mockResolvedValueOnce({ rows: [{ name: '004' }] }) // hasMigrationRun check 4
        .mockResolvedValueOnce({ rows: [{ name: '005' }] }); // hasMigrationRun check 5

      await service.runMigrations();

      const firstCall = mockPool.query.mock.calls[0][0] as string;
      expect(firstCall).toContain('CREATE TABLE IF NOT EXISTS _migrations');
    });

    it('should skip already-run migrations', async () => {
      // All migrations already run
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
        .mockResolvedValueOnce({ rows: [{ name: '001' }] })
        .mockResolvedValueOnce({ rows: [{ name: '002' }] })
        .mockResolvedValueOnce({ rows: [{ name: '003' }] })
        .mockResolvedValueOnce({ rows: [{ name: '004' }] })
        .mockResolvedValueOnce({ rows: [{ name: '005' }] });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await service.runMigrations();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('up to date'),
      );
      consoleSpy.mockRestore();
    });

    it('should run pending migrations and record them', async () => {
      // First migration already run, second is new
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // CREATE TABLE
        .mockResolvedValueOnce({ rows: [{ name: '001' }] }) // 001 already run
        .mockResolvedValueOnce({ rows: [] }) // 002 NOT run
        .mockResolvedValue({ rows: [] }); // all subsequent queries (migration SQL + record)

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await service.runMigrations();

      // Should have logged the applied migration
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Migration 002_better_auth_organization_tables applied'),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('transaction', () => {
    it('should commit on successful callback', async () => {
      const mockClient = {
        query: jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);

      const result = await service.transaction(async (query) => {
        await query('INSERT INTO "user" (id) VALUES ($1)', ['user-1']);
        return 'done';
      });

      expect(result).toBe('done');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on error and rethrow', async () => {
      const mockClient = {
        query: jest.fn<() => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);

      await expect(
        service.transaction(async () => {
          throw new Error('Something went wrong');
        }),
      ).rejects.toThrow('Something went wrong');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('query and queryOne', () => {
    it('query should return rows', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: '1' }, { id: '2' }],
      });

      const result = await service.query('SELECT * FROM "user"');

      expect(result).toEqual([{ id: '1' }, { id: '2' }]);
    });

    it('queryOne should return first row or null', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: '1', name: 'test' }],
      });

      const result = await service.queryOne('SELECT * FROM "user" WHERE id = $1', ['1']);

      expect(result).toEqual({ id: '1', name: 'test' });
    });

    it('queryOne should return null when no rows', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.queryOne('SELECT * FROM "user" WHERE id = $1', ['999']);

      expect(result).toBeNull();
    });
  });
});
