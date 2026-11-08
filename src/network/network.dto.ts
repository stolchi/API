import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  OrderStatus,
  PaymentMethod,
  ProductUnit,
  Vehicle,
} from '../common/enums.js';
import { PHONE_MESSAGE, PHONE_PATTERN } from '../common/validation.js';
import { LocationDto } from '../orders/orders.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class NetworkRegisterDto {
  @ApiProperty({ maxLength: 120, example: 'Aziz Karimov' })
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty({ example: '+998901234567' })
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: Vehicle, enumName: 'Vehicle' })
  @IsEnum(Vehicle)
  vehicle!: Vehicle;
}

export class NetworkLoginDto {
  @ApiProperty({ example: '+998901234567' })
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class NetworkCourierDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty({ enum: Vehicle, enumName: 'Vehicle' })
  vehicle!: Vehicle;
}

export class NetworkAuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: NetworkCourierDto })
  courier!: NetworkCourierDto;
}

export class NetworkRefreshResponseDto {
  @ApiProperty()
  accessToken!: string;
}

export class NearbyQueryDto {
  @ApiPropertyOptional({ description: "The courier's position, if shared." })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  radiusKm?: number;
}

export class NetworkEtaDto {
  @ApiProperty({ minimum: 5, maximum: 180, example: 25 })
  @IsInt()
  @Min(5)
  @Max(180)
  etaMinutes!: number;
}

export class NetworkDeliverDto {
  @ApiProperty({
    enum: [PaymentMethod.CASH, PaymentMethod.CARD],
    description: 'How the customer paid what the courier collected.',
  })
  @IsIn([PaymentMethod.CASH, PaymentMethod.CARD])
  method!: PaymentMethod;
}

export class NetworkCafeDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone!: string | null;

  @ApiProperty({ type: LocationDto })
  location!: LocationDto;
}

/**
 * What changes hands, as the courier sees it. `settlement` above zero is what they pay
 * the cafe as they collect the order; below zero is what the cafe pays them.
 */
export class NetworkMoneyDto {
  @ApiProperty({ description: "The courier's pay for the trip." })
  deliveryFee!: number;

  @ApiProperty({
    description: 'What the customer still owes, collected at the door.',
  })
  collectFromCustomer!: number;

  @ApiProperty({
    description:
      'Paid to the cafe at pick-up when above zero; paid by it when below.',
  })
  settlement!: number;
}

export class NetworkOfferItemDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ProductUnit, enumName: 'ProductUnit' })
  unit!: ProductUnit;

  @ApiProperty()
  quantity!: number;
}

/** A delivery offered to the network: enough to decide, nothing private yet. */
export class NetworkOfferDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'D-12' })
  displayNumber!: string;

  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' })
  status!: OrderStatus;

  @ApiProperty({ type: NetworkCafeDto })
  cafe!: NetworkCafeDto;

  @ApiProperty({
    type: LocationDto,
    nullable: true,
    description: 'Roughly where it goes, to within about half a kilometre.',
  })
  approximateDropoff!: LocationDto | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'From the courier to the cafe, if their position was given.',
  })
  toCafeKm!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'From the cafe to the customer, in a straight line.',
  })
  tripKm!: number | null;

  @ApiProperty({ type: NetworkMoneyDto })
  money!: NetworkMoneyDto;

  @ApiProperty({ type: [NetworkOfferItemDto] })
  items!: NetworkOfferItemDto[];

  @ApiProperty()
  createdAt!: Date;
}

/** A delivery the courier took: now with whom and where exactly. */
export class NetworkDeliveryDto extends NetworkOfferDto {
  @ApiProperty({ type: String, nullable: true })
  customerName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  customerPhone!: string | null;

  @ApiProperty({ type: String, nullable: true })
  address!: string | null;

  @ApiProperty({ type: LocationDto, nullable: true })
  dropoff!: LocationDto | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deliveryEta!: Date | null;
}
