import { DataSourceOptions } from 'typeorm';
import { RoleTypeOrmEntity } from '../../../modules/admin/rbac/infrastructure/persistence/entities/role.typeorm-entity';
import { PermissionTypeOrmEntity } from '../../../modules/admin/rbac/infrastructure/persistence/entities/permission.typeorm-entity';

export function buildTypeOrmConfig(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    logging: false,
    entities: [RoleTypeOrmEntity, PermissionTypeOrmEntity],
    migrations: [],
  };
}
