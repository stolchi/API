import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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

export class UpdateOrderItemDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'A line already on the order, which keeps its price. Leave out to add a new one.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for a new line.',
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

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

export class UpdateOrderItemsDto {
  @ApiProperty({
    type: [UpdateOrderItemDto],
    description: 'The whole new list: lines left out are removed.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemDto)
  items!: UpdateOrderItemDto[];
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

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'True: only orders still in progress. False: only paid or cancelled ones.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Only orders created by the signed-in user.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  mine?: boolean;

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

export class MoveOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tableId!: string;
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

export class AddPaymentsDto {
  @ApiProperty({
    type: [AddPaymentDto],
    description: 'Taken together: either all of them are recorded, or none.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AddPaymentDto)
  payments!: AddPaymentDto[];
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

  @ApiProperty({
    description:
      'How much of the quantity was added after cooking began, until ready again.',
  })
  addedQuantity!: number;
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

/** What an order costs, line by line: `total` is the items plus the charges. */
export class OrderAmountsDto {
  @ApiProperty({ description: "Whole so'm: the items alone." })
  itemsTotal!: number;

  @ApiProperty({ description: 'Of the items, for dine-in orders.' })
  serviceChargePercent!: number;

  @ApiProperty()
  serviceCharge!: number;

  @ApiProperty()
  packagingFee!: number;

  @ApiProperty()
  deliveryFee!: number;

  @ApiProperty()
  total!: number;
}

export class OrderDto extends OrderAmountsDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Restarts from 1 every business day.' })
  number!: number;

  @ApiProperty({
    example: 'Q-12',
    description: 'The number to show people. The prefix tells the source.',
  })
  displayNumber!: string;

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
