import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductUnit } from '../common/enums.js';
import { MAX_MONEY } from '../common/validation.js';

export const MAX_VARIANTS = 20;

export class ProductVariantDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Keep it for a size that already exists; leave out for a new one.',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: '0,7 porsiya', maxLength: 60 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ description: "Whole so'm.", minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  price!: number;
}

export class CreateProductDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: 'Osh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({
    description:
      "Whole so'm, per kilogram for a KG product. With variants it is set to the cheapest.",
    example: 45000,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  price!: number;

  @ApiPropertyOptional({ enum: ProductUnit, enumName: 'ProductUnit' })
  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @ApiPropertyOptional({
    type: [ProductVariantDto],
    description: 'Sizes to choose from. Not for a KG product.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_VARIANTS)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @ApiPropertyOptional({
    description:
      'False for what is ready to hand over, such as bottled drinks.',
  })
  @IsOptional()
  @IsBoolean()
  sendsToKitchen?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ListProductsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class SetAvailabilityDto {
  @ApiProperty()
  @IsBoolean()
  isAvailable!: boolean;
}

export class ProductDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({
    description:
      "Whole so'm, per kilogram for a KG product; the cheapest size when there are variants.",
  })
  price!: number;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit!: ProductUnit;

  @ApiProperty({ type: () => [VariantDto] })
  variants!: VariantDto[];

  @ApiProperty()
  sendsToKitchen!: boolean;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty()
  isAvailable!: boolean;

  @ApiProperty()
  sortOrder!: number;
}

export class VariantDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: "Whole so'm." })
  price!: number;
}
