import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus, OrderType, ProductUnit } from '../common/enums.js';
import { OrderAmountsDto, OrderContentDto } from '../orders/orders.dto.js';
import { VariantDto } from '../products/products.dto.js';

export class CreatePublicOrderDto extends OrderContentDto {
  @ApiProperty({ enum: [OrderType.DINE_IN, OrderType.TAKEAWAY] })
  @IsIn([OrderType.DINE_IN, OrderType.TAKEAWAY])
  type!: OrderType;

  @ApiPropertyOptional({
    description: "The scanned table's token. Required for DINE_IN.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  qrToken?: string;
}

export class PublicCafeDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  primaryColor!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
  })
  workingHours!: Record<string, unknown> | null;

  @ApiProperty()
  currency!: string;

  @ApiProperty({
    enum: OrderType,
    enumName: 'OrderType',
    isArray: true,
    description: 'The kinds of order the cafe takes.',
  })
  orderTypes!: OrderType[];

  @ApiProperty({ description: 'Added to dine-in orders.' })
  serviceChargePercent!: number;

  @ApiProperty({ description: "Whole so'm per takeaway or delivery order." })
  packagingFee!: number;

  @ApiProperty({ description: "Whole so'm per delivery order." })
  deliveryFee!: number;
}

export class PublicProductDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({
    description:
      "Whole so'm, per kilogram for KG; the cheapest size when there are variants.",
  })
  price!: number;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit!: ProductUnit;

  @ApiProperty({
    type: [VariantDto],
    description: 'Empty, or one must be chosen.',
  })
  variants!: VariantDto[];

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ description: 'Unavailable products are shown greyed out.' })
  isAvailable!: boolean;
}

export class PublicCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [PublicProductDto] })
  products!: PublicProductDto[];
}

export class PublicMenuDto {
  @ApiProperty({ type: PublicCafeDto })
  cafe!: PublicCafeDto;

  @ApiProperty({ type: [PublicCategoryDto] })
  categories!: PublicCategoryDto[];
}

export class PublicTableDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  cafeSlug!: string;

  @ApiProperty()
  cafeName!: string;
}

export class PublicOrderItemDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Per kilogram for KG.' })
  price!: number;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit!: ProductUnit;

  @ApiProperty({ description: 'Pieces, or grams for KG.' })
  quantity!: number;

  @ApiProperty({
    description: 'False until staff weigh it: the price may change.',
  })
  weighed!: boolean;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
}

/** All a holder of the public token may see: no customer details, staff or payments. */
export class PublicOrderDto extends OrderAmountsDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Use for the status page and the socket connection.',
  })
  publicToken!: string;

  @ApiProperty()
  number!: number;

  @ApiProperty({ example: 'Q-12' })
  displayNumber!: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;

  @ApiProperty({ enum: OrderType, enumName: 'OrderType' })
  type!: OrderType;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: [PublicOrderItemDto] })
  items!: PublicOrderItemDto[];
}

/** What a monitor in the cafe shows customers: order numbers, and nothing about anyone. */
export class PublicScreenDto {
  @ApiProperty()
  cafeName!: string;

  @ApiProperty({ type: String, nullable: true })
  logoUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  primaryColor!: string | null;

  @ApiProperty({ type: [String], description: 'Oldest first.' })
  preparing!: string[];

  @ApiProperty({ type: [String], description: 'Oldest first.' })
  ready!: string[];
}
