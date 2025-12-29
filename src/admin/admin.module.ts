import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminUsersController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
