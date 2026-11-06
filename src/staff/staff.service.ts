import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { DataSource, EntityManager, IsNull, QueryFailedError } from 'typeorm';
import type { AuthUser } from '../common/auth/auth-user.js';
import { Role } from '../common/enums.js';
import {
  type Permission,
  permissionsOf,
  withImpliedPermissions,
} from '../common/permissions.js';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { RefreshToken } from '../database/entities/refresh-token.entity.js';
import { StaffRole } from '../database/entities/staff-role.entity.js';
import { User } from '../database/entities/user.entity.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import type {
  CreateStaffMemberDto,
  CreateStaffRoleDto,
  StaffMemberDto,
  StaffRoleDto,
  UpdateStaffMemberDto,
  UpdateStaffRoleDto,
} from './staff.dto.js';

const PG_UNIQUE_VIOLATION = '23505';

function toMemberDto(user: User): StaffMemberDto {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    // Staff always have one: the database refuses a cafe user without a role.
    roleId: user.roleId as string,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Users are not a `TenantEntity`, as a super admin has no cafe, so every query for one
 * goes through `memberOf()` or filters by `cafeId` here.
 *
 * Nobody can hand out more than they hold themselves, or manage someone who holds more.
 * Without that, permission to manage staff would be permission to do anything.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeGateway,
  ) {}

  async listRoles(cafeId: string): Promise<StaffRoleDto[]> {
    const manager = this.dataSource.manager;
    const roles = await this.roles(manager, cafeId).find({
      order: { createdAt: 'ASC', name: 'ASC' },
    });
    const counts = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .select('user.roleId', 'roleId')
      .addSelect('COUNT(*)', 'count')
      .where('user.cafeId = :cafeId', { cafeId })
      .andWhere('user.isActive')
      .groupBy('user.roleId')
      .getRawMany<{ roleId: string; count: string }>();
    const countOf = new Map(counts.map((row) => [row.roleId, +row.count]));
    return roles.map((role) => this.toRoleDto(role, countOf.get(role.id) ?? 0));
  }

  async createRole(
    actor: AuthUser,
    cafeId: string,
    dto: CreateStaffRoleDto,
  ): Promise<StaffRoleDto> {
    const permissions = withImpliedPermissions(dto.permissions);
    this.assertWithin(actor, permissions);
    try {
      const role = await this.roles(this.dataSource.manager, cafeId).create({
        name: dto.name.trim(),
        permissions,
      });
      return this.toRoleDto(role, 0);
    } catch (error) {
      throw this.nameConflict(error);
    }
  }

  async updateRole(
    actor: AuthUser,
    cafeId: string,
    id: string,
    dto: UpdateStaffRoleDto,
  ): Promise<StaffRoleDto> {
    const { role, affected } = await this.dataSource
      .transaction(async (manager) => {
        const role = await this.roleOf(manager, cafeId, id);
        if (role.systemKey === Role.OWNER) {
          throw new ConflictException('The owner role cannot be changed');
        }
        if (dto.name !== undefined && role.systemKey) {
          throw new ConflictException('A default role cannot be renamed');
        }
        this.assertWithin(actor, permissionsOf(role));
        const permissions =
          dto.permissions && withImpliedPermissions(dto.permissions);
        if (permissions) this.assertWithin(actor, permissions);

        await this.roles(manager, cafeId).update(
          { id },
          { name: dto.name?.trim(), permissions },
        );
        const holders = await manager.find(User, {
          select: { id: true },
          where: { cafeId, roleId: id },
        });
        return {
          role: await this.roleOf(manager, cafeId, id),
          affected: holders.map((user) => user.id),
        };
      })
      .catch((error: unknown) => {
        throw this.nameConflict(error);
      });

    this.realtime.reconnectUsers(affected);
    return this.toRoleDto(role, affected.length);
  }

  async removeRole(actor: AuthUser, cafeId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const role = await this.roleOf(manager, cafeId, id);
      if (role.systemKey) {
        throw new ConflictException('A default role cannot be deleted');
      }
      this.assertWithin(actor, permissionsOf(role));
      // Inactive staff count too: they still point at the role.
      if (await manager.existsBy(User, { cafeId, roleId: id })) {
        throw new ConflictException('This role still has staff');
      }
      await this.roles(manager, cafeId).delete({ id });
    });
  }

  async listMembers(cafeId: string): Promise<StaffMemberDto[]> {
    const users = await this.dataSource.manager.find(User, {
      where: { cafeId },
      order: { isActive: 'DESC', name: 'ASC' },
    });
    return users.map(toMemberDto);
  }

  async createMember(
    actor: AuthUser,
    cafeId: string,
    dto: CreateStaffMemberDto,
  ): Promise<StaffMemberDto> {
    const passwordHash = await argon2.hash(dto.password);
    try {
      const user = await this.dataSource.transaction(async (manager) => {
        const role = await this.assignableRole(
          manager,
          actor,
          cafeId,
          dto.roleId,
        );
        return manager.save(
          manager.create(User, {
            cafeId,
            name: dto.name.trim(),
            phone: dto.phone,
            passwordHash,
            roleId: role.id,
          }),
        );
      });
      return toMemberDto(user);
    } catch (error) {
      throw this.phoneConflict(error);
    }
  }

  async updateMember(
    actor: AuthUser,
    cafeId: string,
    id: string,
    dto: UpdateStaffMemberDto,
  ): Promise<StaffMemberDto> {
    if (id === actor.id && (dto.isActive === false || dto.roleId)) {
      throw new ConflictException(
        'You cannot deactivate yourself or change your own role',
      );
    }
    const passwordHash = dto.password && (await argon2.hash(dto.password));

    try {
      const user = await this.dataSource.transaction(async (manager) => {
        // Serializes changes to a cafe's staff, so that two owners demoting each
        // other at the same moment cannot leave the cafe without one.
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`staff:${cafeId}`],
        );
        const member = await this.memberOf(manager, cafeId, id);
        this.assertWithin(actor, permissionsOf(member.role));
        const newRole =
          dto.roleId && dto.roleId !== member.roleId
            ? await this.assignableRole(manager, actor, cafeId, dto.roleId)
            : null;

        const losesOwner =
          member.role?.systemKey === Role.OWNER &&
          (newRole !== null || dto.isActive === false);
        if (losesOwner) await this.assertAnotherOwner(manager, cafeId, id);

        await manager.update(
          User,
          { id, cafeId },
          {
            ...(dto.name !== undefined && { name: dto.name.trim() }),
            ...(dto.phone !== undefined && { phone: dto.phone }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            ...(newRole && { roleId: newRole.id }),
            ...(passwordHash && { passwordHash }),
          },
        );
        if (dto.isActive === false || passwordHash) {
          await manager.update(
            RefreshToken,
            { userId: id, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
        }
        return this.memberOf(manager, cafeId, id);
      });

      if (dto.isActive !== undefined || dto.roleId || dto.password) {
        this.realtime.reconnectUsers([id]);
      }
      return toMemberDto(user);
    } catch (error) {
      throw this.phoneConflict(error);
    }
  }

  private async assertAnotherOwner(
    manager: EntityManager,
    cafeId: string,
    exceptId: string,
  ): Promise<void> {
    const owners = await manager.find(User, {
      select: { id: true },
      where: { cafeId, isActive: true, role: { systemKey: Role.OWNER } },
    });
    if (!owners.some((owner) => owner.id !== exceptId)) {
      throw new ConflictException('A cafe must keep at least one owner');
    }
  }

  private async assignableRole(
    manager: EntityManager,
    actor: AuthUser,
    cafeId: string,
    roleId: string,
  ): Promise<StaffRole> {
    const role = await this.roles(manager, cafeId).findOne({
      where: { id: roleId },
    });
    // A role of another cafe looks the same as one that does not exist.
    if (!role) throw new BadRequestException('Unknown role');
    this.assertWithin(actor, permissionsOf(role));
    return role;
  }

  private assertWithin(
    actor: AuthUser,
    permissions: readonly Permission[],
  ): void {
    if (!permissions.every((item) => actor.permissions.includes(item))) {
      throw new ForbiddenException(
        'You cannot manage permissions you do not hold yourself',
      );
    }
  }

  private async memberOf(
    manager: EntityManager,
    cafeId: string,
    id: string,
  ): Promise<User> {
    const user = await manager.findOne(User, {
      where: { id, cafeId },
      relations: { role: true },
    });
    if (!user) throw new NotFoundException();
    return user;
  }

  private async roleOf(
    manager: EntityManager,
    cafeId: string,
    id: string,
  ): Promise<StaffRole> {
    const role = await this.roles(manager, cafeId).findOne({ where: { id } });
    if (!role) throw new NotFoundException();
    return role;
  }

  private roles(manager: EntityManager, cafeId: string) {
    return new TenantRepository(manager.getRepository(StaffRole)).forCafe(
      cafeId,
    );
  }

  private toRoleDto(role: StaffRole, staffCount: number): StaffRoleDto {
    return {
      id: role.id,
      name: role.name,
      systemKey: role.systemKey,
      permissions: permissionsOf(role),
      staffCount,
    };
  }

  private nameConflict(error: unknown): unknown {
    return isUniqueViolation(error)
      ? new ConflictException('A role with this name already exists')
      : error;
  }

  private phoneConflict(error: unknown): unknown {
    return isUniqueViolation(error)
      ? new ConflictException('This phone number is already registered')
      : error;
  }
}
