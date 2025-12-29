import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.getTrustedOrigins(),
    credentials: true,
  });

  await app.listen(3000);
}
bootstrap();
