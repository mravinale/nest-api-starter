import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../../../shared/infrastructure/database/database.module';
import { OrgMember } from '../../api/dto';
import { randomUUID } from 'crypto';

// Unified Role Model - roles that can impersonate within an organization
// - 'admin': Global platform administrator (can impersonate anyone)
// - 'manager': Organization manager (can impersonate members in their org)
const MANAGER_ROLES = ['admin', 'manager'];

/**
 * Service for org-scoped impersonation.
 * Allows org managers to impersonate members within their organization.
 */
@Injectable()
export class OrgImpersonationService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get a user's membership in an organization
   */
  async getMembership(userId: string, organizationId: string): Promise<OrgMember | null> {
    const row = await this.db.queryOne<{
      id: string;
      userId: string;
      organizationId: string;
      role: string;
      createdAt: Date;
    }>(
      `SELECT id, "userId", "organizationId", role, "createdAt"
       FROM member
       WHERE "userId" = $1 AND "organizationId" = $2`,
      [userId, organizationId],
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      role: row.role,
      createdAt: row.createdAt,
    };
  }

  /**
   * Check if a user can impersonate within an organization
   */
  canImpersonate(memberRole: string): boolean {
    return MANAGER_ROLES.includes(memberRole);
  }

  /**
   * Impersonate a user within an organization.
   * Creates a new session with impersonatedBy set.
   */
  async impersonateUser(
    impersonatorUserId: string,
    targetUserId: string,
    organizationId: string,
  ): Promise<{ sessionToken: string }> {
    const impersonatorMembership = await this.getMembership(impersonatorUserId, organizationId);
    if (!impersonatorMembership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    if (!this.canImpersonate(impersonatorMembership.role)) {
      throw new ForbiddenException('You do not have permission to impersonate users');
    }

    const targetMembership = await this.getMembership(targetUserId, organizationId);
    if (!targetMembership) {
      throw new NotFoundException('Target user is not a member of this organization');
    }

    if (targetUserId === impersonatorUserId) {
      throw new ForbiddenException('You cannot impersonate yourself');
    }

    const sessionToken = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.db.query(
      `INSERT INTO session (id, "userId", token, "expiresAt", "impersonatedBy", "activeOrganizationId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [
        randomUUID(),
        targetUserId,
        sessionToken,
        expiresAt,
        impersonatorUserId,
        organizationId,
      ],
    );

    return { sessionToken };
  }

  /**
   * Stop impersonation - invalidate the impersonated session
   */
  async stopImpersonation(sessionToken: string): Promise<void> {
    const session = await this.db.queryOne<{ id: string; impersonatedBy: string | null }>(
      `SELECT id, "impersonatedBy" FROM session WHERE token = $1`,
      [sessionToken],
    );

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (!session.impersonatedBy) {
      throw new ForbiddenException('This session is not an impersonation session');
    }

    await this.db.query(`DELETE FROM session WHERE token = $1`, [sessionToken]);
  }
}
