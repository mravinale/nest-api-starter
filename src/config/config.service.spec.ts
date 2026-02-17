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

  describe('shouldEnforceResendTestRecipients', () => {
    it('returns true when running in NODE_ENV=test', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.DOTENV_CONFIG_PATH;

      const configService = new ConfigService();

      expect(configService.shouldEnforceResendTestRecipients()).toBe(true);
    });

    it('returns true when DOTENV_CONFIG_PATH points to .env.test', () => {
      process.env.NODE_ENV = 'development';
      process.env.DOTENV_CONFIG_PATH = '/tmp/project/.env.test';

      const configService = new ConfigService();

      expect(configService.shouldEnforceResendTestRecipients()).toBe(true);
    });

    it('respects explicit override when ENFORCE_RESEND_TEST_RECIPIENTS=false', () => {
      process.env.NODE_ENV = 'test';
      process.env.ENFORCE_RESEND_TEST_RECIPIENTS = 'false';

      const configService = new ConfigService();

      expect(configService.shouldEnforceResendTestRecipients()).toBe(false);
    });
  });
});
