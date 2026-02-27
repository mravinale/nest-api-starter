import { Module } from '@nestjs/common';
import { OrgImpersonationController } from './api/controllers';
import { OrgImpersonationService } from './application/services';

/**
 * Organization Module for org-scoped operations.
 * Provides org-scoped impersonation for org managers.
 */
@Module({
  controllers: [OrgImpersonationController],
  providers: [OrgImpersonationService],
  exports: [OrgImpersonationService],
})
export class OrganizationModule {}
