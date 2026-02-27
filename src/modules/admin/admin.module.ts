import { Module } from '@nestjs/common';
import { EmailModule } from '../../email/email.module';
import { AdminUsersController } from './api/controllers';
import { AdminService } from './application/services';

/**
 * Admin Module for platform-level user management.
 * Handles user CRUD, role assignment, banning, session management.
 * Requires admin or manager platform role.
 */
@Module({
  imports: [EmailModule],
  controllers: [AdminUsersController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
