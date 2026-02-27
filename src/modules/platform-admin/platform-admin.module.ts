import { Module } from '@nestjs/common';
import { AdminOrganizationsController } from './api/controllers';
import { AdminOrganizationsService } from './application/services';
import { AdminOrgDatabaseRepository } from './infrastructure/persistence/repositories/admin-org.database-repository';
import { ADMIN_ORG_REPOSITORY } from './domain/repositories/admin-org.repository.interface';
import { DatabaseModule } from '../../database';

/**
 * Platform Admin Module for platform-level administrative operations.
 * All endpoints require platform admin role (user.role === 'admin').
 */
@Module({
  imports: [DatabaseModule],
  controllers: [AdminOrganizationsController],
  providers: [
    AdminOrganizationsService,
    { provide: ADMIN_ORG_REPOSITORY, useClass: AdminOrgDatabaseRepository },
  ],
  exports: [AdminOrganizationsService],
})
export class PlatformAdminModule {}
