import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database';
import { EmailService } from '../../email/email.service';
import {
  PaginationQuery,
  UpdateOrganizationDto,
  OrganizationRow,
  Organization,
  OrganizationWithMemberCount,
  rowToOrganization,
} from '../dto';
import { getAllowedRoleNamesForCreator } from '../../admin/admin.utils';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Role hierarchy: higher index = higher privilege.
 * Used to determine which roles a user can assign.
 */
export const ROLE_HIERARCHY: Record<string, number> = {
  member: 0,
  manager: 1,
  admin: 2,
};

/**
 * Returns the hierarchy level for a role name.
 * Unknown roles default to 0 (lowest).
 */
export function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

/**
 * Filter roles to only those assignable by the given requester role.
 * A user can only assign roles at or below their own level.
 */
export function filterAssignableRoles(allRoleNames: string[], requesterRole: string): string[] {
  const requesterLevel = getRoleLevel(requesterRole);
  return allRoleNames.filter((r) => {
    const roleLevel = ROLE_HIERARCHY[r];
    return roleLevel !== undefined && roleLevel <= requesterLevel;
  });
}

/**
 * Service for platform-level organization management.
 * Allows platform admins to manage all organizations regardless of membership.
 */
@Injectable()
export class AdminOrganizationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly emailService: EmailService,
  ) {}

  private readonly slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  /**
   * Get all roles from the database for organization membership.
   * When requesterRole is provided, assignableRoles is filtered to roles
   * at or below the requester's hierarchy level.
   */
  async getRoles(requesterRole?: string): Promise<{
    roles: Array<{ name: string; displayName: string; description: string | null; color: string | null; isSystem: boolean }>;
    assignableRoles: string[];
  }> {
    const roles = await this.db.query<{
      name: string;
      display_name: string;
      description: string | null;
      color: string | null;
      is_system: boolean;
    }>('SELECT name, display_name, description, color, is_system FROM roles ORDER BY is_system DESC, name ASC');

    const allRoleNames = roles.map((r) => r.name);
    const assignableRoles = requesterRole
      ? filterAssignableRoles(allRoleNames, requesterRole)
      : allRoleNames;

    return {
      roles: roles.map((r) => ({
        name: r.name,
        displayName: r.display_name,
        description: r.description,
        color: r.color,
        isSystem: r.is_system,
      })),
      assignableRoles,
    };
  }

  /**
   * Create a new organization and add the creator as a member.
   */
  async create(
    input: {
      name: string;
      slug: string;
      logo?: string;
      metadata?: Record<string, unknown>;
    },
    actor: {
      id: string;
      platformRole: 'admin' | 'manager';
    },
  ): Promise<Organization> {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();

    if (!name) {
      throw new BadRequestException('name is required');
    }

    if (!slug) {
      throw new BadRequestException('slug is required');
    }

    if (!this.slugRegex.test(slug)) {
      throw new BadRequestException('invalid slug');
    }

    const organizationId = this.generateId();
    const memberId = this.generateId();
    const creatorMemberRole = actor.platformRole === 'admin' ? 'admin' : 'manager';
    const metadataJson = input.metadata === undefined ? null : JSON.stringify(input.metadata);

    await this.db.transaction(async (query) => {
      const existing = (await query(
        'SELECT id FROM organization WHERE LOWER(slug) = LOWER($1)',
        [slug],
      )) as Array<{ id: string }>;
      if (existing.length > 0) {
        throw new ConflictException('Organization slug already exists');
      }

      await query(
        `INSERT INTO organization (id, name, slug, logo, "createdAt", metadata)
         VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [organizationId, name, slug, input.logo ?? null, metadataJson],
      );

      await query(
        `INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
         VALUES ($1, $2, $3, $4, NOW())`,
        [memberId, organizationId, actor.id, creatorMemberRole],
      );
    });

    const row = await this.db.queryOne<OrganizationRow>(
      'SELECT * FROM organization WHERE id = $1',
      [organizationId],
    );

    if (!row) {
      throw new InternalServerErrorException('Failed to create organization');
    }

    return rowToOrganization(row);
  }

  /**
   * List all organizations with pagination and search
   */
  async findAll(query: PaginationQuery): Promise<PaginatedResult<OrganizationWithMemberCount>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;
    const search = query.search?.trim();

    let whereClause = '';
    const params: unknown[] = [];

    if (search) {
      whereClause = 'WHERE o.name ILIKE $1 OR o.slug ILIKE $1';
      params.push(`%${search}%`);
    }

    const countResult = await this.db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM organization o ${whereClause}`,
      params,
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const dataParams = [...params, limit, offset];
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const rows = await this.db.query<OrganizationRow & { member_count: string }>(
      `SELECT o.*, COUNT(m.id) as member_count
       FROM organization o
       LEFT JOIN member m ON m."organizationId" = o.id
       ${whereClause}
       GROUP BY o.id
       ORDER BY o."createdAt" DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      dataParams,
    );

    const data: OrganizationWithMemberCount[] = rows.map((row) => ({
      ...rowToOrganization(row),
      memberCount: parseInt(row.member_count, 10),
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single organization by ID
   */
  async findById(id: string): Promise<OrganizationWithMemberCount | null> {
    const row = await this.db.queryOne<OrganizationRow & { member_count: string }>(
      `SELECT o.*, COUNT(m.id) as member_count
       FROM organization o
       LEFT JOIN member m ON m."organizationId" = o.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [id],
    );

    if (!row) {
      return null;
    }

    return {
      ...rowToOrganization(row),
      memberCount: parseInt(row.member_count, 10),
    };
  }

  /**
   * Update an organization
   */
  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.slug !== undefined) {
      updates.push(`slug = $${paramIndex++}`);
      values.push(dto.slug);
    }
    if (dto.logo !== undefined) {
      updates.push(`logo = $${paramIndex++}`);
      values.push(dto.logo);
    }
    if (dto.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(dto.metadata));
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);

    const row = await this.db.queryOne<OrganizationRow>(
      `UPDATE organization SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    return row ? rowToOrganization(row) : null;
  }

  /**
   * Delete an organization
   */
  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Organization not found');
    }

    await this.db.transaction(async (query) => {
      await query('DELETE FROM invitation WHERE "organizationId" = $1', [id]);
      await query('DELETE FROM member WHERE "organizationId" = $1', [id]);
      await query('DELETE FROM organization WHERE id = $1', [id]);
    });
  }

  /**
   * Get members of an organization
   */
  async getMembers(organizationId: string): Promise<Array<{
    id: string;
    userId: string;
    role: string;
    createdAt: Date;
    user: {
      id: string;
      name: string;
      email: string;
      image: string | null;
    };
  }>> {
    const rows = await this.db.query<{
      id: string;
      userId: string;
      role: string;
      createdAt: Date;
      user_name: string;
      user_email: string;
      user_image: string | null;
    }>(
      `SELECT m.id, m."userId", m.role, m."createdAt",
              u.name as user_name, u.email as user_email, u.image as user_image
       FROM member m
       JOIN "user" u ON u.id = m."userId"
       WHERE m."organizationId" = $1
       ORDER BY m."createdAt" ASC`,
      [organizationId],
    );

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      role: row.role,
      createdAt: row.createdAt,
      user: {
        id: row.userId,
        name: row.user_name,
        email: row.user_email,
        image: row.user_image,
      },
    }));
  }

  /**
   * Create an invitation for an organization member.
   */
  async createInvitation(
    organizationId: string,
    email: string,
    role: 'admin' | 'manager' | 'member',
    platformRole: 'admin' | 'manager',
    inviter: { id: string; email: string; name?: string },
  ): Promise<{
    id: string;
    organizationId: string;
    email: string;
    role: string;
    status: string;
    expiresAt: Date;
    inviterId: string;
    createdAt: Date;
  }> {
    const normalizedEmail = email.trim().toLowerCase();

    const allowedRoleNames = getAllowedRoleNamesForCreator(platformRole);
    if (!allowedRoleNames.includes(role)) {
      throw new ForbiddenException('Role not allowed');
    }

    const organization = await this.db.queryOne<{ id: string; name: string; slug: string }>(
      'SELECT id, name, slug FROM organization WHERE id = $1',
      [organizationId],
    );
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const existingMember = await this.db.queryOne<{ id: string }>(
      `SELECT m.id
       FROM member m
       JOIN "user" u ON u.id = m."userId"
       WHERE m."organizationId" = $1 AND LOWER(u.email) = LOWER($2)`,
      [organizationId, normalizedEmail],
    );
    if (existingMember) {
      throw new BadRequestException('User is already a member of this organization');
    }

    const existingInvitation = await this.db.queryOne<{ id: string }>(
      'SELECT id FROM invitation WHERE "organizationId" = $1 AND LOWER(email) = LOWER($2) AND status = $3',
      [organizationId, normalizedEmail, 'pending'],
    );
    if (existingInvitation) {
      throw new ConflictException('Invitation already exists for this user');
    }

    const invitationId = this.generateId();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.db.query(
      `INSERT INTO invitation (id, "organizationId", email, role, status, "expiresAt", "inviterId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [invitationId, organizationId, normalizedEmail, role, 'pending', expiresAt, inviter.id],
    );

    const invitation = await this.db.queryOne<{
      id: string;
      organizationId: string;
      email: string;
      role: string;
      status: string;
      expiresAt: Date;
      inviterId: string;
      createdAt: Date;
    }>(
      'SELECT id, "organizationId" as "organizationId", email, role, status, "expiresAt" as "expiresAt", "inviterId" as "inviterId", "createdAt" as "createdAt" FROM invitation WHERE id = $1',
      [invitationId],
    );

    if (!invitation) {
      throw new InternalServerErrorException('Failed to create invitation');
    }

    try {
      await this.emailService.sendOrganizationInvitation({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        organizationId: invitation.organizationId,
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
        },
        inviter: {
          user: {
            id: inviter.id,
            email: inviter.email,
            name: inviter.name,
          },
        },
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      console.error('Failed to send organization invitation email:', error);
    }

    return invitation;
  }

  /**
   * Get invitations for an organization
   */
  async getInvitations(organizationId: string): Promise<Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  }>> {
    const rows = await this.db.query<{
      id: string;
      email: string;
      role: string;
      status: string;
      expiresAt: Date;
      createdAt: Date;
    }>(
      `SELECT id, email, role, status, "expiresAt", "createdAt"
       FROM invitation
       WHERE "organizationId" = $1
       ORDER BY "createdAt" DESC`,
      [organizationId],
    );

    return rows;
  }

  /**
   * Delete an invitation
   */
  async deleteInvitation(organizationId: string, invitationId: string): Promise<void> {
    const result = await this.db.query(
      `DELETE FROM invitation WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
      [invitationId, organizationId],
    );

    if (result.length === 0) {
      const existing = await this.db.queryOne<{ id: string }>(
        `SELECT id FROM invitation WHERE id = $1`,
        [invitationId],
      );
      if (!existing) {
        throw new Error('Invitation not found');
      }
    }
  }

  /**
   * Add an existing user to an organization as a member
   */
  async addMember(
    organizationId: string,
    userId: string,
    role: string,
  ): Promise<{
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    createdAt: Date;
  }> {
    const user = await this.db.queryOne<{ id: string }>(
      `SELECT id FROM "user" WHERE id = $1`,
      [userId],
    );
    if (!user) {
      throw new Error('User not found');
    }

    const existingMember = await this.db.queryOne<{ id: string }>(
      `SELECT id FROM member WHERE "userId" = $1 AND "organizationId" = $2`,
      [userId, organizationId],
    );
    if (existingMember) {
      throw new Error('User is already a member of this organization');
    }

    const memberId = this.generateId();

    await this.db.query(
      `INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
       VALUES ($1, $2, $3, $4, NOW())`,
      [memberId, organizationId, userId, role],
    );

    const member = await this.db.queryOne<{
      id: string;
      organizationId: string;
      userId: string;
      role: string;
      createdAt: Date;
    }>(
      `SELECT id, "organizationId", "userId", role, "createdAt"
       FROM member WHERE id = $1`,
      [memberId],
    );

    return member!;
  }

  async updateMemberRole(
    organizationId: string,
    memberId: string,
    newRole: 'admin' | 'manager' | 'member',
    platformRole: 'admin' | 'manager',
  ): Promise<{
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    createdAt: Date;
  }> {
    const allowedRoleNames = getAllowedRoleNamesForCreator(platformRole);
    if (!allowedRoleNames.includes(newRole)) {
      throw new ForbiddenException('Role not allowed');
    }

    const member = await this.db.queryOne<{ id: string; role: string; userId: string }>(
      'SELECT id, role, "userId" as "userId" FROM member WHERE id = $1 AND "organizationId" = $2',
      [memberId, organizationId],
    );

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (platformRole === 'manager' && member.role !== 'member') {
      throw new ForbiddenException('Managers can only change member roles');
    }

    if (member.role === 'admin' && newRole !== 'admin') {
      const adminCount = await this.db.queryOne<{ count: string }>(
        'SELECT COUNT(*)::text as count FROM member WHERE "organizationId" = $1 AND role = $2',
        [organizationId, 'admin'],
      );

      if ((adminCount ? parseInt(adminCount.count, 10) : 0) <= 1) {
        throw new ForbiddenException('Cannot change role of the last organization admin');
      }
    }

    await this.db.query(
      'UPDATE member SET role = $1 WHERE id = $2 AND "organizationId" = $3',
      [newRole, memberId, organizationId],
    );

    const updated = await this.db.queryOne<{
      id: string;
      organizationId: string;
      userId: string;
      role: string;
      createdAt: Date;
    }>(
      'SELECT id, "organizationId" as "organizationId", "userId" as "userId", role, "createdAt" as "createdAt" FROM member WHERE id = $1 AND "organizationId" = $2',
      [memberId, organizationId],
    );

    return updated!;
  }

  async removeMember(
    organizationId: string,
    memberId: string,
    platformRole: 'admin' | 'manager',
  ): Promise<{ success: true }> {
    const member = await this.db.queryOne<{ id: string; role: string; userId: string }>(
      'SELECT id, role, "userId" as "userId" FROM member WHERE id = $1 AND "organizationId" = $2',
      [memberId, organizationId],
    );

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    if (platformRole === 'manager' && member.role !== 'member') {
      throw new ForbiddenException('Managers can only remove members');
    }

    if (member.role === 'admin') {
      const adminCount = await this.db.queryOne<{ count: string }>(
        'SELECT COUNT(*)::text as count FROM member WHERE "organizationId" = $1 AND role = $2',
        [organizationId, 'admin'],
      );

      if ((adminCount ? parseInt(adminCount.count, 10) : 0) <= 1) {
        throw new ForbiddenException('Cannot remove the last organization admin');
      }
    }

    const result = await this.db.query<{ id: string }>(
      'DELETE FROM member WHERE id = $1 AND "organizationId" = $2 RETURNING id',
      [memberId, organizationId],
    );

    if (result.length === 0) {
      throw new NotFoundException('Member not found');
    }

    return { success: true };
  }

  private generateId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
