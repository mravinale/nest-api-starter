import { jest } from '@jest/globals';
import { ConfigService } from '../config/config.service';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DOTENV_CONFIG_PATH;
    delete process.env.ENFORCE_RESEND_TEST_RECIPIENTS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function createConfigServiceMock(overrides?: Partial<ConfigService>): ConfigService {
    const mock = {
      getResendApiKey: jest.fn(() => ''),
      getFromEmail: jest.fn(() => 'noreply@tierone.cc'),
      getFeUrl: jest.fn(() => 'http://localhost:5173'),
      isTestMode: jest.fn(() => false),
      shouldEnforceResendTestRecipients: jest.fn(() => false),
      ...overrides,
    };

    return mock as unknown as ConfigService;
  }

  it('throws when recipient is not resend.dev and test-recipient guardrail is enabled', async () => {
    const configService = createConfigServiceMock({
      shouldEnforceResendTestRecipients: jest.fn(() => true),
    });
    const service = new EmailService(configService);

    await expect(
      service.sendEmail({
        to: 'user@example.com',
        subject: 'Guardrail test',
        html: '<p>Hello</p>',
      }),
    ).rejects.toThrow('Resend test address');
  });

  it('allows resend test recipient when guardrail is enabled', async () => {
    const configService = createConfigServiceMock({
      shouldEnforceResendTestRecipients: jest.fn(() => true),
    });
    const service = new EmailService(configService);

    await expect(
      service.sendEmail({
        to: 'delivered+guardrail@resend.dev',
        subject: 'Guardrail test',
        html: '<p>Hello</p>',
      }),
    ).resolves.toBeUndefined();
  });

  it('allows non-resend recipient when guardrail is disabled', async () => {
    const configService = createConfigServiceMock({
      shouldEnforceResendTestRecipients: jest.fn(() => false),
    });
    const service = new EmailService(configService);

    await expect(
      service.sendEmail({
        to: 'user@example.com',
        subject: 'No guardrail',
        html: '<p>Hello</p>',
      }),
    ).resolves.toBeUndefined();
  });
});
