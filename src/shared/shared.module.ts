import { Global, Module } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';
import { OrgRoleGuard } from './guards/org-role.guard';
import { PermissionsGuard } from './guards/permissions.guard';

/**
 * Shared module that provides common guards globally.
 * Guards are registered as global providers so any module using
 * @UseGuards(RolesGuard | PermissionsGuard | OrgRoleGuard) can resolve them.
 */
@Global()
@Module({
  providers: [RolesGuard, OrgRoleGuard, PermissionsGuard],
  exports: [RolesGuard, OrgRoleGuard, PermissionsGuard],
})
export class SharedModule {}
