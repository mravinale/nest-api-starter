import { jest } from '@jest/globals';

jest.mock('jose', () => ({
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    sign: jest.fn(async () => 'mock.jwt.token'),
  })),
}));

import { buildVerificationToken, buildVerificationUrl } from './verification.utils';

describe('verification.utils', () => {
  describe('buildVerificationToken', () => {
    it('should return a signed JWT string', async () => {
      const token = await buildVerificationToken('user@example.com', 'secret', 3600);
      expect(token).toBe('mock.jwt.token');
    });

    it('should lowercase the email before signing', async () => {
      const { SignJWT } = await import('jose');
      await buildVerificationToken('USER@Example.COM', 'secret');
      expect(SignJWT).toHaveBeenCalledWith({ email: 'user@example.com' });
    });

    it('should default expiresInSeconds to 3600', async () => {
      const { SignJWT } = await import('jose');
      const instance = { setProtectedHeader: jest.fn().mockReturnThis(), setIssuedAt: jest.fn().mockReturnThis(), setExpirationTime: jest.fn().mockReturnThis(), sign: jest.fn(async () => 'tok') };
      (SignJWT as unknown as jest.Mock).mockImplementationOnce(() => instance);
      await buildVerificationToken('a@b.com', 'secret');
      expect(instance.setExpirationTime).toHaveBeenCalledWith('3600s');
    });
  });

  describe('buildVerificationUrl', () => {
    it('should build verification URL with encoded callbackURL', () => {
      const url = buildVerificationUrl('tok123', 'http://api.test', 'http://fe.test');
      expect(url).toBe(
        'http://api.test/api/auth/verify-email?token=tok123&callbackURL=http%3A%2F%2Ffe.test',
      );
    });

    it('should include the token in the URL', () => {
      const url = buildVerificationUrl('abc.def.ghi', 'http://api', 'http://fe');
      expect(url).toContain('token=abc.def.ghi');
    });

    it('should encode special characters in feUrl', () => {
      const url = buildVerificationUrl('tok', 'http://api', 'http://fe/path?q=1');
      expect(url).toContain(encodeURIComponent('http://fe/path?q=1'));
    });
  });
});
