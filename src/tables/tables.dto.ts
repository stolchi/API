import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
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
