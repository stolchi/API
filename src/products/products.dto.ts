import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_MONEY } from '../common/validation.js';

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

  @ApiProperty({ description: "Whole so'm.", example: 45000, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  price!: number;

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

  @ApiProperty({ description: "Whole so'm." })
  price!: number;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty()
  isAvailable!: boolean;

  @ApiProperty()
  sortOrder!: number;
}
