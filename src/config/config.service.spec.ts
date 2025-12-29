import { ConfigService } from './config.service';

describe('ConfigService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getTrustedOrigins', () => {
    it('should read TRUSTED_ORIGINS from the environment', () => {
      process.env.TRUSTED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:65520';

      const configService = new ConfigService();

      expect(configService.getTrustedOrigins()).toEqual([
        'http://localhost:5173',
        'http://127.0.0.1:65520',
      ]);
    });

    it('should return default origins when TRUSTED_ORIGINS is not set', () => {
      delete process.env.TRUSTED_ORIGINS;

      const configService = new ConfigService();

      expect(configService.getTrustedOrigins()).toEqual([
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
      ]);
    });
  });
});
