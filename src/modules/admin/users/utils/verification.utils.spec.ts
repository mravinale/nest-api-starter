import { decodeJwt } from 'jose';
import { buildVerificationToken, buildVerificationUrl } from './verification.utils';

describe('verification.utils', () => {
  describe('buildVerificationToken', () => {
    it('should return a valid HS256 JWT string (three dot-separated segments)', async () => {
      const token = await buildVerificationToken('user@example.com', 'secret', 3600);
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    });

    it('should lowercase the email in the token payload', async () => {
      const token = await buildVerificationToken('USER@Example.COM', 'secret');
      const payload = decodeJwt(token);
      expect(payload.email).toBe('user@example.com');
    });

    it('should use provided expiresInSeconds in the expiry claim', async () => {
      const token = await buildVerificationToken('a@b.com', 'secret', 7200);
      const payload = decodeJwt(token);
      const delta = (payload.exp as number) - (payload.iat as number);
      expect(delta).toBe(7200);
    });

    it('should default expiresInSeconds to 3600', async () => {
      const token = await buildVerificationToken('a@b.com', 'secret');
      const payload = decodeJwt(token);
      const delta = (payload.exp as number) - (payload.iat as number);
      expect(delta).toBe(3600);
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
