import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DeliveryMode, OrderType, ServiceMode } from '../common/enums.js';
import { LocationDto } from '../orders/orders.dto.js';
import { MAX_MONEY } from '../common/validation.js';

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

  @ApiProperty({ description: 'Telegram has the webhook: the bot answers.' })
  isActive!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "Why the bot is not working: Telegram's words, or NEEDS_HTTPS when the API has no public https address.",
  })
  error!: string | null;

  @ApiProperty({ description: 'A chat gets new orders and the daily summary.' })
  notificationsLinked!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Opening this in Telegram ties that chat (or group) to the cafe.',
  })
  linkUrl!: string | null;
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

  @ApiProperty({ enum: ServiceMode, enumName: 'ServiceMode' })
  serviceMode!: ServiceMode;

  @ApiProperty({ enum: OrderType, enumName: 'OrderType', isArray: true })
  orderTypes!: OrderType[];

  @ApiProperty({ minimum: 0, maximum: 50 })
  serviceChargePercent!: number;

  @ApiProperty({ description: "Whole so'm per takeaway or delivery order." })
  packagingFee!: number;

  @ApiProperty({ description: "Whole so'm per delivery order." })
  deliveryFee!: number;

  @ApiProperty({ enum: DeliveryMode, enumName: 'DeliveryMode' })
  deliveryMode!: DeliveryMode;

  @ApiProperty({
    type: LocationDto,
    nullable: true,
    description: 'Where couriers pick orders up.',
  })
  location!: LocationDto | null;

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

  @ApiPropertyOptional({ enum: ServiceMode, enumName: 'ServiceMode' })
  @IsOptional()
  @IsEnum(ServiceMode)
  serviceMode?: ServiceMode;

  @ApiPropertyOptional({
    enum: OrderType,
    enumName: 'OrderType',
    isArray: true,
    description: 'At least one.',
  })
  @IsOptional()
  @IsEnum(OrderType, { each: true })
  @ArrayMinSize(1)
  @ArrayUnique()
  orderTypes?: OrderType[];

  @ApiPropertyOptional({ minimum: 0, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  serviceChargePercent?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  packagingFee?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  deliveryFee?: number;
  @ApiPropertyOptional({
    enum: DeliveryMode,
    enumName: 'DeliveryMode',
    description: 'Network couriers need the cafe on the map.',
  })
  @IsOptional()
  @IsEnum(DeliveryMode)
  deliveryMode?: DeliveryMode;

  @ApiPropertyOptional({ type: LocationDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto | null;
}
