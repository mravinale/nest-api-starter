import { Role, Permission } from '../models/role.entity';
import { CreateRoleDto } from '../../api/dto/create-role.dto';
import { UpdateRoleDto } from '../../api/dto/update-role.dto';

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');

export interface IRoleRepository {
  findAll(): Promise<Role[]>;
  findById(id: string): Promise<Role | null>;
  findByName(name: string): Promise<Role | null>;
  create(dto: CreateRoleDto): Promise<Role>;
  update(id: string, dto: UpdateRoleDto): Promise<Role | null>;
  remove(id: string): Promise<void>;
  getPermissions(roleId: string): Promise<Permission[]>;
  setPermissions(roleId: string, permissionIds: string[]): Promise<void>;
  hasPermission(roleName: string, resource: string, action: string): Promise<boolean>;
}
