import { Module } from '@nestjs/common';
import { EmailModule } from '../../email/email.module';
import { DatabaseModule } from '../../database';
import { AdminUsersController } from './api/controllers';
import { AdminService } from './application/services';
import { ADMIN_USER_REPOSITORY } from './domain/repositories/admin-user.repository.interface';
import { AdminUserDatabaseRepository } from './infrastructure/persistence/repositories/admin-user.database-repository';

/**
 * Admin Module for platform-level user management.
 * Handles user CRUD, role assignment, banning, session management.
 * Requires admin or manager platform role.
 */
@Module({
  imports: [EmailModule, DatabaseModule],
  controllers: [AdminUsersController],
  providers: [
    AdminService,
    { provide: ADMIN_USER_REPOSITORY, useClass: AdminUserDatabaseRepository },
  ],
  exports: [AdminService],
})
export class AdminModule {}
