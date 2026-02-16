import { INestApplication } from '@nestjs/common';
import { DatabaseService } from '../src/database';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'member';
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface TestSession {
  userId: string;
  cookie: string;
  activeOrganizationId?: string;
}

export interface TestContext {
  adminUser: TestUser;
  managerUser: TestUser;
  memberUser: TestUser;
  testOrg: TestOrganization;
  adminCookie: string;
  managerCookie: string;
  memberCookie: string;
}

export class TestHelpers {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly app: INestApplication<App>,
  ) {}

  private async ensureDefaultRolePermissions(): Promise<void> {
    await this.dbService.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id
       FROM roles r
       CROSS JOIN permissions p
       WHERE r.name = 'admin'
       ON CONFLICT DO NOTHING`,
    );

    const managerPermissions = [
      ['user', 'read'],
      ['user', 'update'],
      ['user', 'ban'],
      ['session', 'read'],
      ['session', 'revoke'],
      ['organization', 'read'],
      ['organization', 'update'],
      ['organization', 'invite'],
      ['role', 'read'],
    ] as const;

    for (const [resource, action] of managerPermissions) {
      await this.dbService.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id
         FROM roles r
         JOIN permissions p ON p.resource = $2 AND p.action = $3
         WHERE r.name = $1
         ON CONFLICT DO NOTHING`,
        ['manager', resource, action],
      );
    }

    const memberPermissions = [
      ['user', 'read'],
      ['organization', 'read'],
      ['role', 'read'],
    ] as const;

    for (const [resource, action] of memberPermissions) {
      await this.dbService.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id
         FROM roles r
         JOIN permissions p ON p.resource = $2 AND p.action = $3
         WHERE r.name = $1
         ON CONFLICT DO NOTHING`,
        ['member', resource, action],
      );
    }
  }

  async signUpAndGetCookie(data: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ userId: string; cookie: string }> {
    // Sign up through Better Auth API
    const signUpRes = await request(this.app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({
        name: data.name,
        email: data.email,
        password: data.password,
      });

    if (signUpRes.status !== 200) {
      throw new Error(`Sign up failed: ${signUpRes.status} ${JSON.stringify(signUpRes.body)}`);
    }

    // Extract session cookie from response
    const cookies = signUpRes.headers['set-cookie'];
    const sessionCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.includes('better-auth.session_token'))
      : cookies?.includes('better-auth.session_token') ? cookies : null;

    if (!sessionCookie) {
      throw new Error('No session cookie returned from sign up');
    }

    return {
      userId: signUpRes.body.user?.id || signUpRes.body.id,
      cookie: sessionCookie,
    };
  }

  async setUserRole(userId: string, role: 'admin' | 'manager' | 'member'): Promise<void> {
    await this.dbService.query(
      `UPDATE "user" SET role = $1 WHERE id = $2`,
      [role, userId]
    );
  }

  async createTestOrganization(data: {
    name: string;
    slug: string;
  }): Promise<TestOrganization> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await this.dbService.query(
      `INSERT INTO organization (id, name, slug, "createdAt")
       VALUES ($1, $2, $3, $4)`,
      [id, data.name, data.slug, now]
    );

    return { id, name: data.name, slug: data.slug };
  }

  async addUserToOrganization(
    userId: string,
    organizationId: string,
    role: string = 'member'
  ): Promise<void> {
    const id = randomUUID();
    const now = new Date().toISOString();

    await this.dbService.query(
      `INSERT INTO member (id, "userId", "organizationId", role, "createdAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, organizationId, role, now]
    );
  }

  async setActiveOrganization(userId: string, organizationId: string): Promise<void> {
    await this.dbService.query(
      `UPDATE session SET "activeOrganizationId" = $1 WHERE "userId" = $2`,
      [organizationId, userId]
    );
  }

  async setupTestContext(): Promise<TestContext> {
    await this.ensureDefaultRolePermissions();

    // Create test organization
    const testOrg = await this.createTestOrganization({
      name: 'Test Organization',
      slug: `test-org-${Date.now()}`,
    });

    // Sign up test users through Better Auth
    const adminSignUp = await this.signUpAndGetCookie({
      name: 'Test Admin',
      email: `admin-${Date.now()}@test.com`,
      password: 'SecurePass123!',
    });

    const managerSignUp = await this.signUpAndGetCookie({
      name: 'Test Manager',
      email: `manager-${Date.now()}@test.com`,
      password: 'SecurePass123!',
    });

    const memberSignUp = await this.signUpAndGetCookie({
      name: 'Test Member',
      email: `member-${Date.now()}@test.com`,
      password: 'SecurePass123!',
    });

    // Set roles
    await this.setUserRole(adminSignUp.userId, 'admin');
    await this.setUserRole(managerSignUp.userId, 'manager');
    await this.setUserRole(memberSignUp.userId, 'member');

    // Add manager and member to the organization
    await this.addUserToOrganization(managerSignUp.userId, testOrg.id, 'manager');
    await this.addUserToOrganization(memberSignUp.userId, testOrg.id, 'member');

    // Set active organization for manager and member
    await this.setActiveOrganization(managerSignUp.userId, testOrg.id);
    await this.setActiveOrganization(memberSignUp.userId, testOrg.id);

    // Get user details
    const [adminUser] = await this.dbService.query<TestUser>(
      `SELECT id, name, email, role FROM "user" WHERE id = $1`,
      [adminSignUp.userId]
    );
    const [managerUser] = await this.dbService.query<TestUser>(
      `SELECT id, name, email, role FROM "user" WHERE id = $1`,
      [managerSignUp.userId]
    );
    const [memberUser] = await this.dbService.query<TestUser>(
      `SELECT id, name, email, role FROM "user" WHERE id = $1`,
      [memberSignUp.userId]
    );

    return {
      adminUser,
      managerUser,
      memberUser,
      testOrg,
      adminCookie: adminSignUp.cookie,
      managerCookie: managerSignUp.cookie,
      memberCookie: memberSignUp.cookie,
    };
  }

  async cleanupTestData(): Promise<void> {
    // Clean up in reverse dependency order
    await this.dbService.query('DELETE FROM session');
    await this.dbService.query('DELETE FROM member');
    await this.dbService.query('DELETE FROM invitation');
    await this.dbService.query('DELETE FROM organization');
    await this.dbService.query('DELETE FROM account');
    await this.dbService.query('DELETE FROM verification');
    await this.dbService.query('DELETE FROM "user"');
  }
}

export function getTestHelpers(app: INestApplication<App>): TestHelpers {
  const dbService = app.get<DatabaseService>(DatabaseService);
  return new TestHelpers(dbService, app);
}
