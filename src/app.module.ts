import { Module, OnModuleInit } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth, setEmailService } from './auth';
import { ConfigModule, ConfigService } from './config';
import { EmailModule, EmailService } from './email';
import { DatabaseModule } from './database';
import { AppTypeOrmModule } from './shared/infrastructure/database/typeorm.module';
import { RbacModule } from './modules/rbac';
import { PlatformAdminModule } from './modules/platform-admin';
import { OrganizationModule } from './modules/organization';
import { AdminModule } from './modules/admin';

@Module({
  imports: [
    ConfigModule,
    EmailModule,
    DatabaseModule,
    AppTypeOrmModule,
    RbacModule,
    PlatformAdminModule,
    OrganizationModule,
    AdminModule,
    AuthModule.forRoot({ auth }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    // Validate environment variables
    this.configService.validateEnvironment();
    
    // Wire up email service to auth
    setEmailService(this.emailService);
    console.log('✅ Email service connected to Better Auth');
  }
}
