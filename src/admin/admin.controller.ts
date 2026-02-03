import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { AdminService } from './admin.service';
import {
  requireAdminOrManager,
  requireActiveOrganizationIdForManager,
} from './admin.utils';
import { PermissionsGuard, RequirePermissions } from '../common';

@Controller('api/admin/users')
@UseGuards(PermissionsGuard)
export class AdminUsersController {
  constructor(private readonly adminService: AdminService) {}

  @Get('create-metadata')
  @RequirePermissions('user:read')
  async getCreateMetadata(@Session() session: UserSession) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.getCreateUserMetadata(platformRole, activeOrgId);
  }

  @Get()
  @RequirePermissions('user:read')
  async list(
    @Session() session: UserSession,
    @Query('limit') limit = '10',
    @Query('offset') offset = '0',
    @Query('searchValue') searchValue?: string,
  ) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);

    return this.adminService.listUsers({
      limit: parseInt(String(limit), 10),
      offset: parseInt(String(offset), 10),
      searchValue,
      platformRole,
      activeOrganizationId: activeOrgId,
    });
  }

  @Post()
  @RequirePermissions('user:create')
  async create(
    @Session() session: UserSession,
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      role: 'admin' | 'manager' | 'member';
      organizationId?: string;
    },
  ) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);

    return this.adminService.createUser(
      {
        name: body.name,
        email: body.email,
        password: body.password,
        role: body.role,
        organizationId: body.organizationId,
      },
      platformRole,
      activeOrgId,
    );
  }

  @Get(':userId/sessions')
  @RequirePermissions('session:read')
  async listSessions(@Session() session: UserSession, @Param('userId') userId: string) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.listUserSessions({
      userId,
      platformRole,
      activeOrganizationId: activeOrgId,
    });
  }

  @Put(':userId')
  @RequirePermissions('user:update')
  async update(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body() body: { name?: string },
  ) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.updateUser({ userId, name: body.name }, platformRole, activeOrgId);
  }

  @Put(':userId/role')
  @RequirePermissions('user:set-role')
  async setRole(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body() body: { role: 'admin' | 'manager' | 'member' },
  ) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.setUserRole({ userId, role: body.role }, platformRole, activeOrgId);
  }

  @Post(':userId/ban')
  @RequirePermissions('user:ban')
  async ban(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body() body: { banReason?: string },
  ) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.banUser({ userId, banReason: body.banReason }, platformRole, activeOrgId);
  }

  @Post(':userId/unban')
  @RequirePermissions('user:ban')
  async unban(@Session() session: UserSession, @Param('userId') userId: string) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.unbanUser({ userId }, platformRole, activeOrgId);
  }

  @Post(':userId/password')
  @RequirePermissions('user:set-password')
  async setPassword(
    @Session() session: UserSession,
    @Param('userId') userId: string,
    @Body() body: { newPassword: string },
  ) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.setUserPassword({ userId, newPassword: body.newPassword }, platformRole, activeOrgId);
  }

  @Delete(':userId')
  @RequirePermissions('user:delete')
  async remove(@Session() session: UserSession, @Param('userId') userId: string) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.removeUser({ userId }, platformRole, activeOrgId);
  }

  @Post('bulk-delete')
  @RequirePermissions('user:delete')
  async bulkRemove(@Session() session: UserSession, @Body() body: { userIds: string[] }) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.removeUsers({ userIds: body.userIds }, platformRole, activeOrgId);
  }

  @Post('sessions/revoke')
  @RequirePermissions('session:revoke')
  async revokeSession(@Session() session: UserSession, @Body() body: { sessionToken: string }) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.revokeSession({ sessionToken: body.sessionToken }, platformRole, activeOrgId);
  }

  @Post(':userId/sessions/revoke-all')
  @RequirePermissions('session:revoke')
  async revokeAll(@Session() session: UserSession, @Param('userId') userId: string) {
    const platformRole = requireAdminOrManager(session);
    const activeOrgId = requireActiveOrganizationIdForManager(platformRole, session);
    return this.adminService.revokeAllSessions({ userId }, platformRole, activeOrgId);
  }
}
