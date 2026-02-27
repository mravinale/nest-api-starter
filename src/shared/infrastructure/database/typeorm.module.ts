import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '../../../config';
import { buildTypeOrmConfig } from './typeorm.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildTypeOrmConfig(config.getDatabaseUrl()),
    }),
  ],
  exports: [TypeOrmModule],
})
export class AppTypeOrmModule {}
