import { ForbiddenException } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';

export type PlatformRole = 'admin' | 'manager' | 'member';

export function getPlatformRole(session: UserSession): PlatformRole {
  const role = (session?.user as { role?: string | string[] } | undefined)?.role;
  if (Array.isArray(role)) {
    if (role.includes('admin')) return 'admin';
    if (role.includes('manager')) return 'manager';
    return 'member';
  }

  if (role === 'admin' || role === 'manager' || role === 'member') {
    return role;
  }

  return 'member';
}

export function requireAdminOrManager(session: UserSession): 'admin' | 'manager' {
  const role = getPlatformRole(session);
  if (role === 'admin' || role === 'manager') return role;
  throw new ForbiddenException('Admin access required');
}

export function getActiveOrganizationId(session: UserSession): string | null {
  const activeOrgId = (session?.session as { activeOrganizationId?: string } | undefined)
    ?.activeOrganizationId;
  return activeOrgId ?? null;
}

export function requireActiveOrganizationIdForManager(
  platformRole: 'admin' | 'manager',
  session: UserSession,
): string | null {
  if (platformRole === 'admin') return null;
  const activeOrgId = getActiveOrganizationId(session);
  if (!activeOrgId) {
    throw new ForbiddenException('Active organization required');
  }
  return activeOrgId;
}

export function getAllowedRoleNamesForCreator(platformRole: 'admin' | 'manager'): PlatformRole[] {
  return platformRole === 'admin' ? ['admin', 'manager', 'member'] : ['manager', 'member'];
}
