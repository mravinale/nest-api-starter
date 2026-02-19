import { jest } from '@jest/globals';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { AdminOrganizationsController } from './admin-organizations.controller';
import { AdminOrganizationsService } from '../services';

describe('AdminOrganizationsController', () => {
  let controller: AdminOrganizationsController;
  let orgService: jest.Mocked<AdminOrganizationsService>;

  beforeEach(() => {
    orgService = {
      create: jest.fn(),
      getRoles: jest.fn().mockImplementation(async () => ({ roles: [], assignableRoles: [] })),
      findAll: jest.fn(),
      findById: jest.fn(),
      getMembers: jest.fn(),
      getInvitations: jest.fn(),
      createInvitation: jest.fn(),
      deleteInvitation: jest.fn(),
      addMember: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<AdminOrganizationsService>;

    controller = new AdminOrganizationsController(orgService);
  });

  describe('getRolesMetadata', () => {
    it('passes manager platform role to service', async () => {
      const managerSession = {
        user: { role: 'manager' },
        session: { activeOrganizationId: 'org-1' },
      } as unknown as UserSession;

      await controller.getRolesMetadata(managerSession);

      expect(orgService.getRoles).toHaveBeenCalledWith('manager');
    });

    it('passes admin platform role to service', async () => {
      const adminSession = {
        user: { role: 'admin' },
        session: { activeOrganizationId: null },
      } as unknown as UserSession;

      await controller.getRolesMetadata(adminSession);

      expect(orgService.getRoles).toHaveBeenCalledWith('admin');
    });
  });

  describe('member management', () => {
    it('forwards update member role payload and actor role', async () => {
      orgService.updateMemberRole.mockResolvedValue({
        id: 'member-1',
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'manager',
        createdAt: new Date(),
      } as never);

      const adminSession = {
        user: { role: 'admin' },
        session: { activeOrganizationId: null },
      } as unknown as UserSession;

      await controller.updateMemberRole(adminSession, 'org-1', 'member-1', { role: 'manager' });

      expect(orgService.updateMemberRole).toHaveBeenCalledWith('org-1', 'member-1', 'manager', 'admin');
    });

    it('forwards remove member request and actor role', async () => {
      orgService.removeMember.mockResolvedValue({ success: true } as never);

      const managerSession = {
        user: { role: 'manager' },
        session: { activeOrganizationId: 'org-1' },
      } as unknown as UserSession;

      await controller.removeMember(managerSession, 'org-1', 'member-1');

      expect(orgService.removeMember).toHaveBeenCalledWith('org-1', 'member-1', 'manager');
    });

    it('forwards create invitation payload and actor context', async () => {
      orgService.createInvitation.mockResolvedValue({
        id: 'inv-1',
        organizationId: 'org-1',
        email: 'invitee@example.com',
        role: 'member',
        status: 'pending',
        expiresAt: new Date(),
        inviterId: 'admin-1',
        createdAt: new Date(),
      } as never);

      const adminSession = {
        user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'admin' },
        session: { activeOrganizationId: null },
      } as unknown as UserSession;

      await controller.createInvitation(adminSession, 'org-1', {
        email: 'invitee@example.com',
        role: 'member',
      });

      expect(orgService.createInvitation).toHaveBeenCalledWith(
        'org-1',
        'invitee@example.com',
        'member',
        'admin',
        {
          id: 'admin-1',
          email: 'admin@example.com',
          name: 'Admin',
        },
      );
    });
  });

  describe('create', () => {
    it('forwards create request for manager and does not require active organization', async () => {
      orgService.create.mockResolvedValue({
        id: 'org-2',
        name: 'New Org',
        slug: 'new-org',
        logo: null,
        metadata: null,
        createdAt: new Date(),
      } as never);

      const managerSession = {
        user: { id: 'manager-1', role: 'manager' },
        session: { activeOrganizationId: null },
      } as unknown as UserSession;

      await controller.create(managerSession, { name: 'New Org', slug: 'new-org' });

      expect(orgService.create).toHaveBeenCalledWith(
        {
          name: 'New Org',
          slug: 'new-org',
          logo: undefined,
          metadata: undefined,
        },
        {
          id: 'manager-1',
          platformRole: 'manager',
        },
      );
    });
  });
});
