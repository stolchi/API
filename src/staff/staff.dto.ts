import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../common/enums.js';
import { Permission } from '../common/permissions.js';
import { PHONE_MESSAGE, PHONE_PATTERN } from '../common/validation.js';

export class StaffRoleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    enum: Role,
    enumName: 'Role',
    nullable: true,
    description: 'Set on the default roles, empty on a custom one.',
  })
  systemKey!: Role | null;

  @ApiProperty({ enum: Permission, enumName: 'Permission', isArray: true })
  permissions!: Permission[];

  @ApiProperty({ description: 'Staff members holding this role.' })
  staffCount!: number;
}

export class CreateStaffRoleDto {
  @ApiProperty({ example: 'Administrator' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ enum: Permission, enumName: 'Permission', isArray: true })
  @IsArray()
  @ArrayUnique()
  @IsEnum(Permission, { each: true })
  permissions!: Permission[];
}

export class UpdateStaffRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({
    enum: Permission,
    enumName: 'Permission',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Permission, { each: true })
  permissions?: Permission[];
}

export class StaffMemberDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty({ format: 'uuid' })
  roleId!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

export class CreateStaffMemberDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '+998901234567' })
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roleId!: string;
}

export class UpdateStaffMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({
    minLength: 8,
    maxLength: 128,
    description: 'Signs them out everywhere.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({
    description: 'False signs them out and blocks login.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
