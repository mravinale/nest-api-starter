import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin.controller';
import { AdminService } from './admin.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [AdminUsersController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
