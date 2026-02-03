import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { DatabaseService } from '../../database';

/**
 * Guard that checks if the authenticated user has the required permissions.
 * Permissions are checked against the role_permissions table based on the user's role.
 * 
 * @example
 * @UseGuards(PermissionsGuard)
 * @RequirePermissions('user:read')
 * @Get('users')
 * getUsers() { ... }
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions are required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const session = request.session;

    if (!session?.user) {
      throw new ForbiddenException('Authentication required');
    }

    const userRole = session.user.role;

    // Admin role has all permissions
    if (userRole === 'admin') {
      return true;
    }

    // Get the user's permissions based on their role
    const userPermissions = await this.getUserPermissions(userRole);

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasAllPermissions) {
      const missing = requiredPermissions.filter(
        (p) => !userPermissions.includes(p),
      );
      throw new ForbiddenException(
        `Missing required permissions: ${missing.join(', ')}`,
      );
    }

    return true;
  }

  private async getUserPermissions(roleName: string): Promise<string[]> {
    const result = await this.db.query<{ permission: string }>(
      `SELECT CONCAT(p.resource, ':', p.action) as permission
       FROM role_permissions rp
       JOIN roles r ON rp.role_id = r.id
       JOIN permissions p ON rp.permission_id = p.id
       WHERE r.name = $1`,
      [roleName],
    );

    return result.map((row) => row.permission);
  }
}
