import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DayHoursDto {
  @ApiProperty({ example: '09:00' })
  @Matches(TIME, { message: 'open must be HH:mm' })
  open!: string;

  @ApiProperty({
    example: '22:00',
    description:
      'May be earlier than open when the cafe closes after midnight.',
  })
  @Matches(TIME, { message: 'close must be HH:mm' })
  close!: string;
}

/** A day that is left out means the cafe is closed that day. */
export class WorkingHoursDto {
  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  mon?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  tue?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  wed?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  thu?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  fri?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  sat?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  sun?: DayHoursDto;
}

export class TelegramBotStatusDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Filled in once the token has been checked with Telegram.',
  })
  username!: string | null;

  @ApiProperty()
  isActive!: boolean;
}

export class CafeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, example: '#B4532A' })
  primaryColor!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty({ type: WorkingHoursDto, nullable: true })
  workingHours!: WorkingHoursDto | null;

  @ApiProperty({
    type: TelegramBotStatusDto,
    nullable: true,
    description: 'The token itself is never returned.',
  })
  telegramBot!: TelegramBotStatusDto | null;
}

export class UpdateCafeDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '+998901234567',
  })
  @IsOptional()
  @Matches(/^\+998\d{9}$/, { message: 'phone must look like +998901234567' })
  phone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: '#B4532A' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'primaryColor must look like #B4532A',
  })
  primaryColor?: string | null;

  @ApiPropertyOptional({ type: WorkingHoursDto, nullable: true })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto | null;
}

export class SetTelegramBotDto {
  @ApiProperty({ description: 'The token from @BotFather. Stored encrypted.' })
  @IsString()
  @Matches(/^\d{5,20}:[A-Za-z0-9_-]{30,64}$/, {
    message: 'token does not look like a Telegram bot token',
  })
  token!: string;
}
