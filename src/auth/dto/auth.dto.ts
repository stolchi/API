import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../common/enums.js';
import { Permission } from '../../common/permissions.js';
import { PHONE_MESSAGE, PHONE_PATTERN } from '../../common/validation.js';

export class RegisterDto {
  @ApiProperty({ example: 'Demo Kafe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  cafeName!: string;

  @ApiPropertyOptional({
    example: 'demo-kafe',
    description: 'Generated from cafeName when omitted.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug may only contain lowercase letters, digits and dashes',
  })
  @MaxLength(60)
  slug?: string;

  @ApiProperty({ example: 'Aziz Karimov' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  ownerName!: string;

  @ApiProperty({ example: '+998901234567' })
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: '+998901234567' })
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class UserRoleDto {
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
}

export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  cafeId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  isSuperAdmin!: boolean;

  @ApiProperty({ type: UserRoleDto, nullable: true })
  role!: UserRoleDto | null;

  @ApiProperty({ enum: Permission, enumName: 'Permission', isArray: true })
  permissions!: Permission[];
}

export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived JWT for the Authorization header.' })
  accessToken!: string;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}

export class RefreshResponseDto {
  @ApiProperty()
  accessToken!: string;
}
