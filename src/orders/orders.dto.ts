import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
} from '../common/enums.js';
import {
  MAX_MONEY,
  PHONE_MESSAGE,
  PHONE_PATTERN,
} from '../common/validation.js';

export class CreateOrderItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 999 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** What both the POS and the public QR menu send. Prices always come from the database. */
export class OrderContentDto {
  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  customerPhone?: string;
}

export class CreateOrderDto extends OrderContentDto {
  @ApiProperty({ enum: OrderType, enumName: 'OrderType' })
  @IsEnum(OrderType)
  type!: OrderType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for DINE_IN, not allowed otherwise.',
  })
  @IsOptional()
  @IsUUID()
  tableId?: string;
}

export class ListOrdersQueryDto {
  @ApiPropertyOptional({
    example: '2026-01-31',
    description: 'Business day in Asia/Tashkent.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ enum: OrderStatus, enumName: 'OrderStatus' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderSource, enumName: 'OrderSource' })
  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}

export class AddPaymentDto {
  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({
    description: "Whole so'm applied to the order. At most the unpaid amount.",
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_MONEY)
  amount!: number;
}

export class OrderItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    type: String,
    nullable: true,
    description: 'Empty once the product has been deleted.',
  })
  productId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: "Whole so'm, as it was when ordered." })
  price!: number;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
}

export class PaymentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  method!: PaymentMethod;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  createdAt!: Date;
}

export class OrderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Restarts from 1 every business day.' })
  number!: number;

  @ApiProperty({ example: '2026-01-31' })
  businessDate!: string;

  @ApiProperty({ enum: OrderSource, enumName: 'OrderSource' })
  source!: OrderSource;

  @ApiProperty({ enum: OrderType, enumName: 'OrderType' })
  type!: OrderType;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;

  @ApiProperty({ format: 'uuid', type: String, nullable: true })
  tableId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerPhone!: string | null;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ format: 'uuid', type: String, nullable: true })
  createdById!: string | null;

  @ApiProperty({ format: 'uuid' })
  publicToken!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: [OrderItemDto] })
  items!: OrderItemDto[];

  @ApiProperty({ type: [PaymentDto] })
  payments!: PaymentDto[];
}

export class OrderPageDto {
  @ApiProperty({ type: [OrderDto] })
  items!: OrderDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
