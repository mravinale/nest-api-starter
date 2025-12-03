import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { AllowAnonymous, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get('api/hello')
  @AllowAnonymous()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('me')
  getProfile(@Session() session: UserSession) {
    return session;
  }
}
