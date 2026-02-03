import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database';
import {
  PaginationQuery,
  UpdateOrganizationDto,
  OrganizationRow,
  Organization,
  OrganizationWithMemberCount,
  rowToOrganization,
} from '../dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Service for platform-level organization management.
 * Allows platform admins to manage all organizations regardless of membership.
 */
@Injectable()
export class AdminOrganizationsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get all roles from the database for organization membership
   */
  async getRoles(): Promise<{
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

    return {
      roles: roles.map((r) => ({
        name: r.name,
        displayName: r.display_name,
        description: r.description,
        color: r.color,
        isSystem: r.is_system,
      })),
      assignableRoles: roles.map((r) => r.name),
    };
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
      `DELETE FROM invitation WHERE id = $1 AND "organizationId" = $2`,
      [invitationId, organizationId],
    );

    if (result.length === 0) {
      // Check if it existed
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
    // Check if user exists
    const user = await this.db.queryOne<{ id: string }>(
      `SELECT id FROM "user" WHERE id = $1`,
      [userId],
    );
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user is already a member
    const existingMember = await this.db.queryOne<{ id: string }>(
      `SELECT id FROM member WHERE "userId" = $1 AND "organizationId" = $2`,
      [userId, organizationId],
    );
    if (existingMember) {
      throw new Error('User is already a member of this organization');
    }

    // Generate a unique ID for the member
    const memberId = this.generateId();

    // Insert the member
    await this.db.query(
      `INSERT INTO member (id, "organizationId", "userId", role, "createdAt")
       VALUES ($1, $2, $3, $4, NOW())`,
      [memberId, organizationId, userId, role],
    );

    // Fetch and return the created member
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

  private generateId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
