import { Module, OnModuleInit } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth, setEmailService } from './auth';
import { ConfigModule, ConfigService } from './shared/config';
import { EmailModule, EmailService } from './shared/email';
import { DatabaseModule } from './shared/infrastructure/database/database.module';
import { AppTypeOrmModule } from './shared/infrastructure/database/typeorm.module';
import { SharedModule } from './shared/shared.module';
import { AdminModule, RbacModule } from './modules/admin';

@Module({
  imports: [
    ConfigModule,
    EmailModule,
    DatabaseModule,
    AppTypeOrmModule,
    SharedModule,
    RbacModule,
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
