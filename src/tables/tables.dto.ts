import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTableDto {
  @ApiProperty({ example: 'Stol 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Terrasa' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  zone?: string | null;
}

export class BulkCreateTablesDto {
  @ApiProperty({
    example: 'Stol',
    description: 'Tables are named "Stol 11", "Stol 12" and so on.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  prefix!: string;

  @ApiProperty({ example: 11, minimum: 1, maximum: 9999 })
  @IsInt()
  @Min(1)
  @Max(9999)
  from!: number;

  @ApiProperty({ example: 10, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  count!: number;

  @ApiPropertyOptional({ type: String, nullable: true, example: '2-qavat' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  zone?: string | null;
}

export class UpdateTableDto extends PartialType(CreateTableDto) {}

export class TableQrQueryDto {
  @ApiPropertyOptional({ enum: ['png', 'svg'], default: 'png' })
  @IsOptional()
  @IsIn(['png', 'svg'])
  format?: 'png' | 'svg';
}

export class TableDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  zone!: string | null;

  @ApiProperty()
  qrToken!: string;

  @ApiProperty({ description: 'The address the QR code opens.' })
  menuUrl!: string;
}
