import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { RolesGuard, Roles, PermissionsGuard, RequirePermissions } from '../../common';
import { AdminOrganizationsService } from '../services';
import { filterAssignableRoles, getRoleLevel } from '../services/admin-organizations.service';
import { PaginationQuery, UpdateOrganizationDto } from '../dto';

/**
 * Controller for platform-level organization management.
 * Admins can manage all organizations.
 * Managers can only view and manage their active organization.
 */
@Controller('api/platform-admin/organizations')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles('admin', 'manager')
export class AdminOrganizationsController {
  constructor(private readonly orgService: AdminOrganizationsService) {}

  private getSessionInfo(session: UserSession): { role: 'admin' | 'manager'; activeOrgId: string | null } {
    const role = session?.user?.role as string;
    const activeOrgId = (session?.session as { activeOrganizationId?: string })?.activeOrganizationId ?? null;
    return {
      role: role === 'admin' ? 'admin' : 'manager',
      activeOrgId,
    };
  }

  private requireActiveOrgForManager(role: 'admin' | 'manager', activeOrgId: string | null): void {
    if (role === 'manager' && !activeOrgId) {
      throw new ForbiddenException('Active organization required');
    }
  }

  private assertManagerCanAccessOrg(role: 'admin' | 'manager', activeOrgId: string | null, targetOrgId: string): void {
    if (role === 'manager' && activeOrgId !== targetOrgId) {
      throw new ForbiddenException('You can only access your own organization');
    }
  }

  /**
   * Get organization membership roles metadata
   * Returns the available roles from the database
   */
  @Get('roles-metadata')
  @RequirePermissions('organization:read')
  async getRolesMetadata(@Session() session: UserSession) {
    const { role } = this.getSessionInfo(session);
    return this.orgService.getRoles(role);
  }

  /**
   * List organizations with pagination and search
   * Admins see all organizations, managers only see their active organization
   */
  @Get()
  @RequirePermissions('organization:read')
  async list(@Session() session: UserSession, @Query() query: PaginationQuery) {
    const { role, activeOrgId } = this.getSessionInfo(session);
    this.requireActiveOrgForManager(role, activeOrgId);

    const page = query.page ? parseInt(String(query.page), 10) : 1;
    const limit = query.limit ? parseInt(String(query.limit), 10) : 20;
    const search = query.search;

    // Managers only see their own organization
    if (role === 'manager' && activeOrgId) {
      const org = await this.orgService.findById(activeOrgId);
      return {
        data: org ? [org] : [],
        pagination: { page: 1, limit: 1, total: org ? 1 : 0, totalPages: 1 },
      };
    }

    const result = await this.orgService.findAll({ page, limit, search });
    return result;
  }

  /**
   * Get a single organization by ID
   */
  @Get(':id')
  @RequirePermissions('organization:read')
  async findOne(@Session() session: UserSession, @Param('id') id: string) {
    const { role, activeOrgId } = this.getSessionInfo(session);
    this.requireActiveOrgForManager(role, activeOrgId);
    this.assertManagerCanAccessOrg(role, activeOrgId, id);

    const org = await this.orgService.findById(id);
    if (!org) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }
    return { data: org };
  }

  /**
   * Get members of an organization
   */
  @Get(':id/members')
  @RequirePermissions('organization:read')
  async getMembers(@Session() session: UserSession, @Param('id') id: string) {
    const { role, activeOrgId } = this.getSessionInfo(session);
    this.requireActiveOrgForManager(role, activeOrgId);
    this.assertManagerCanAccessOrg(role, activeOrgId, id);

    const org = await this.orgService.findById(id);
    if (!org) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }
    const members = await this.orgService.getMembers(id);
    return { data: members };
  }

  /**
   * Get invitations for an organization
   */
  @Get(':id/invitations')
  @RequirePermissions('organization:read')
  async getInvitations(@Session() session: UserSession, @Param('id') id: string) {
    const { role, activeOrgId } = this.getSessionInfo(session);
    this.requireActiveOrgForManager(role, activeOrgId);
    this.assertManagerCanAccessOrg(role, activeOrgId, id);

    const org = await this.orgService.findById(id);
    if (!org) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }
    const invitations = await this.orgService.getInvitations(id);
    return { data: invitations };
  }

  /**
   * Delete an invitation
   */
  @Delete(':orgId/invitations/:invitationId')
  @RequirePermissions('organization:invite')
  async deleteInvitation(
    @Session() session: UserSession,
    @Param('orgId') orgId: string,
    @Param('invitationId') invitationId: string,
  ) {
    const { role, activeOrgId } = this.getSessionInfo(session);
    this.requireActiveOrgForManager(role, activeOrgId);
    this.assertManagerCanAccessOrg(role, activeOrgId, orgId);

    await this.orgService.deleteInvitation(orgId, invitationId);
    return { success: true };
  }

  /**
   * Add an existing user to an organization as a member
   */
  @Post(':id/members')
  @RequirePermissions('organization:invite')
  async addMember(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() body: { userId: string; role: string },
  ) {
    const { role, activeOrgId } = this.getSessionInfo(session);
    this.requireActiveOrgForManager(role, activeOrgId);
    this.assertManagerCanAccessOrg(role, activeOrgId, id);

    // Validate that the requester can assign the requested role
    const requestedRoleLevel = getRoleLevel(body.role);
    const requesterRoleLevel = getRoleLevel(role);
    if (requestedRoleLevel > requesterRoleLevel) {
      throw new ForbiddenException(
        `Cannot assign role '${body.role}' — exceeds your permission level`,
      );
    }

    const org = await this.orgService.findById(id);
    if (!org) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }
    const member = await this.orgService.addMember(id, body.userId, body.role);
    return { data: member };
  }

  /**
   * Update an organization (admin only)
   */
  @Put(':id')
  @Roles('admin')
  @RequirePermissions('organization:update')
  async update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    const org = await this.orgService.update(id, dto);
    if (!org) {
      throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
    }
    return { data: org };
  }

  /**
   * Delete an organization (admin only)
   */
  @Delete(':id')
  @Roles('admin')
  @RequirePermissions('organization:delete')
  async delete(@Param('id') id: string) {
    try {
      await this.orgService.delete(id);
      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message === 'Organization not found') {
        throw new HttpException(error.message, HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }
}
