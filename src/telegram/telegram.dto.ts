import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { OrderType } from '../common/enums.js';
import { OrderContentDto } from '../orders/orders.dto.js';

export class SetTelegramBotDto {
  @ApiProperty({ description: 'The token from @BotFather. Stored encrypted.' })
  @IsString()
  @Matches(/^\d{5,20}:[A-Za-z0-9_-]{30,64}$/, {
    message: 'token does not look like a Telegram bot token',
  })
  token!: string;
}

/** An order from the Mini App: what Telegram signed tells who the customer is. */
export class CreateTelegramOrderDto extends OrderContentDto {
  @ApiProperty({ enum: [OrderType.TAKEAWAY, OrderType.DELIVERY] })
  @IsIn([OrderType.TAKEAWAY, OrderType.DELIVERY])
  type!: OrderType;

  @ApiProperty({
    description: 'Telegram.WebApp.initData, exactly as the Mini App got it.',
  })
  @IsString()
  @MaxLength(4096)
  initData!: string;
}
