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

  it('skips sending in test mode', async () => {
    const configService = createConfigServiceMock({
      isTestMode: jest.fn(() => true),
    });
    const service = new EmailService(configService);

    await expect(
      service.sendEmail({ to: 'user@example.com', subject: 'Test', html: '<p>Hi</p>' }),
    ).resolves.toBeUndefined();
  });

  it('skips sending when no API key is configured', async () => {
    const configService = createConfigServiceMock({
      getResendApiKey: jest.fn(() => ''),
      isTestMode: jest.fn(() => false),
    });
    const service = new EmailService(configService);

    await expect(
      service.sendEmail({ to: 'user@example.com', subject: 'No key', html: '<p>Hi</p>' }),
    ).resolves.toBeUndefined();
  });

  describe('sendEmailVerification', () => {
    it('calls sendEmail with verification subject and URL', async () => {
      const configService = createConfigServiceMock({ isTestMode: jest.fn(() => true) });
      const service = new EmailService(configService);
      const sendEmailSpy = jest.spyOn(service, 'sendEmail');

      await service.sendEmailVerification({
        user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
        url: 'https://api.example.com/verify?token=abc',
        token: 'abc',
      });

      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Verify your email',
          html: expect.stringContaining('https://api.example.com/verify?token=abc'),
        }),
      );
    });

    it('uses email as fallback when name is not provided', async () => {
      const configService = createConfigServiceMock({ isTestMode: jest.fn(() => true) });
      const service = new EmailService(configService);
      const sendEmailSpy = jest.spyOn(service, 'sendEmail');

      await service.sendEmailVerification({
        user: { id: 'user-1', email: 'user@example.com', name: '' },
        url: 'https://api.example.com/verify',
        token: 'abc',
      });

      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('user@example.com'),
        }),
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('calls sendEmail with reset subject and correct URL', async () => {
      const configService = createConfigServiceMock({
        isTestMode: jest.fn(() => true),
        getFeUrl: jest.fn(() => 'https://app.example.com'),
      });
      const service = new EmailService(configService);
      const sendEmailSpy = jest.spyOn(service, 'sendEmail');

      await service.sendPasswordResetEmail({
        user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
        token: 'reset-token-xyz',
        url: 'https://app.example.com/set-new-password?token=reset-token-xyz',
      });

      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Reset your password',
          html: expect.stringContaining('reset-token-xyz'),
        }),
      );
    });
  });

  describe('sendOrganizationInvitation', () => {
    it('calls sendEmail with invitation subject and org name', async () => {
      const configService = createConfigServiceMock({
        isTestMode: jest.fn(() => true),
        getFeUrl: jest.fn(() => 'https://app.example.com'),
      });
      const service = new EmailService(configService);
      const sendEmailSpy = jest.spyOn(service, 'sendEmail');

      await service.sendOrganizationInvitation({
        id: 'inv-1',
        email: 'invitee@example.com',
        role: 'member',
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Acme Corp', slug: 'acme-corp' },
        inviter: { user: { id: 'admin-1', name: 'Admin User', email: 'admin@example.com' } },
        expiresAt: new Date(Date.now() + 86400000),
      });

      expect(sendEmailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'invitee@example.com',
          subject: 'Invitation to join Acme Corp',
          html: expect.stringContaining('inv-1'),
        }),
      );
    });
  });
});
