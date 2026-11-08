import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProperty,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../common/auth/auth-user.js';
import {
  CurrentCafe,
  CurrentUser,
  RequireAny,
} from '../common/auth/decorators.js';
import { OrderSource, OrderStatus } from '../common/enums.js';
import { Permission } from '../common/permissions.js';
import {
  AddPaymentDto,
  AddPaymentsDto,
  AssignCourierDto,
  CancelOrderDto,
  ChangeStatusDto,
  CourierDeliverDto,
  CourierPickUpDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  MoveOrderDto,
  OfferDto,
  OrderDto,
  OrderPageDto,
  UpdateOrderCustomerDto,
  UpdateOrderItemsDto,
} from './orders.dto.js';
import { NetworkOrdersService } from './network-orders.service.js';
import { OrdersService, toOrderDto } from './orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@RequireAny(Permission.ORDERS_VIEW, Permission.KITCHEN_WORK)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly network: NetworkOrdersService,
  ) {}

  @Post()
  @RequireAny(Permission.ORDERS_CREATE)
  @ApiOperation({ summary: 'Create an order from the POS' })
  @ApiCreatedResponse({ type: OrderDto })
  async create(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderDto> {
    const order = await this.orders.create(cafeId, {
      ...dto,
      source: OrderSource.POS,
      createdById: user.id,
    });
    return toOrderDto(order);
  }

  @Get()
  @ApiOkResponse({ type: OrderPageDto })
  list(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Query() query: ListOrdersQueryDto,
  ): Promise<OrderPageDto> {
    return this.orders.list(cafeId, query, user.id);
  }

  @Get(':id')
  @ApiOkResponse({ type: OrderDto })
  async get(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDto> {
    return toOrderDto(await this.orders.get(cafeId, id));
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: OrderDto })
  async changeStatus(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.orders.changeStatus(cafeId, id, dto.status, user.permissions),
    );
  }

  @Put(':id/items')
  @RequireAny(Permission.ORDERS_EDIT)
  @ApiOperation({ summary: 'Change what is on an order in progress' })
  @ApiOkResponse({ type: OrderDto })
  async updateItems(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderItemsDto,
  ): Promise<OrderDto> {
    return toOrderDto(await this.orders.updateItems(cafeId, id, dto.items));
  }

  @Post(':id/seen')
  @RequireAny(Permission.ORDERS_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark that someone at the cafe has looked at it' })
  @ApiOkResponse({ type: OrderDto })
  async markSeen(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDto> {
    return toOrderDto(await this.orders.markSeen(cafeId, id));
  }

  @Patch(':id/offer')
  @RequireAny(Permission.ORDERS_EDIT)
  @ApiOperation({
    summary: 'Put a delivery out to network couriers, or take it back',
  })
  @ApiOkResponse({ type: OrderDto })
  async offer(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OfferDto,
  ): Promise<OrderDto> {
    return toOrderDto(await this.network.offer(cafeId, id, dto.offered));
  }

  @Post(':id/hand-over')
  @RequireAny(Permission.ORDERS_SERVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Handed to the network courier, settling up with them',
  })
  @ApiOkResponse({ type: OrderDto })
  async handOver(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.network.handOver(cafeId, id, user.permissions),
    );
  }

  @Patch(':id/courier')
  @RequireAny(Permission.ORDERS_EDIT)
  @ApiOperation({ summary: 'Give a delivery to a courier, or take it back' })
  @ApiOkResponse({ type: OrderDto })
  async assignCourier(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCourierDto,
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.orders.assignCourier(cafeId, id, dto.courierId ?? null),
    );
  }

  @Patch(':id/table')
  @RequireAny(Permission.ORDERS_EDIT)
  @ApiOperation({ summary: 'Move a dine-in order to another table' })
  @ApiOkResponse({ type: OrderDto })
  async moveToTable(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveOrderDto,
  ): Promise<OrderDto> {
    return toOrderDto(await this.orders.moveToTable(cafeId, id, dto.tableId));
  }

  @Post(':id/cancel')
  @RequireAny(Permission.ORDERS_CANCEL)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OrderDto })
  async cancel(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.orders.changeStatus(
        cafeId,
        id,
        OrderStatus.CANCELLED,
        user.permissions,
        dto.reason,
      ),
    );
  }

  @Patch(':id/customer')
  @RequireAny(Permission.ORDERS_EDIT)
  @ApiOperation({ summary: "Change the customer's name, phone or address" })
  @ApiOkResponse({ type: OrderDto })
  async updateCustomer(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderCustomerDto,
  ): Promise<OrderDto> {
    return toOrderDto(await this.orders.updateCustomer(cafeId, id, dto));
  }

  @Post(':id/payments')
  @RequireAny(Permission.ORDERS_PAYMENT)
  @ApiCreatedResponse({ type: OrderDto })
  async addPayment(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPaymentDto,
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.orders.addPayments(cafeId, id, [
        { method: dto.method, amount: dto.amount },
      ]),
    );
  }

  @Post(':id/payments/batch')
  @RequireAny(Permission.ORDERS_PAYMENT)
  @ApiOperation({
    summary: 'Take several payments at once, e.g. cash and card',
  })
  @ApiCreatedResponse({ type: OrderDto })
  async addPayments(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPaymentsDto,
  ): Promise<OrderDto> {
    return toOrderDto(await this.orders.addPayments(cafeId, id, dto.payments));
  }

  @Post(':id/close')
  @RequireAny(Permission.ORDERS_PAYMENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a served, fully paid order' })
  @ApiOkResponse({ type: OrderDto })
  async close(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.orders.changeStatus(
        cafeId,
        id,
        OrderStatus.PAID,
        user.permissions,
      ),
    );
  }
}

export class CourierSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Deliveries given to them and not finished.' })
  activeDeliveries!: number;
}

@ApiTags('orders')
@ApiBearerAuth()
@Controller('couriers')
export class CouriersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequireAny(Permission.ORDERS_VIEW)
  @ApiOkResponse({ type: [CourierSummaryDto] })
  list(@CurrentCafe() cafeId: string): Promise<CourierSummaryDto[]> {
    return this.orders.couriers(cafeId);
  }
}

/** A courier's own deliveries: nobody else's are there to see or touch. */
@ApiTags('courier')
@ApiBearerAuth()
@RequireAny(Permission.DELIVERY_COURIER)
@Controller('courier/orders')
export class CourierOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOkResponse({ type: [OrderDto] })
  async mine(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDto[]> {
    return (await this.orders.courierOrders(cafeId, user.id)).map(toOrderDto);
  }

  @Get('available')
  @ApiOperation({ summary: 'Deliveries no courier has taken yet' })
  @ApiOkResponse({ type: [OrderDto] })
  async available(@CurrentCafe() cafeId: string): Promise<OrderDto[]> {
    return (await this.orders.availableDeliveries(cafeId)).map(toOrderDto);
  }

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take a delivery' })
  @ApiOkResponse({ type: OrderDto })
  async claim(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDto> {
    return toOrderDto(await this.orders.claimDelivery(cafeId, user.id, id));
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Give a delivery back before leaving with it' })
  @ApiOkResponse({ type: OrderDto })
  async release(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDto> {
    return toOrderDto(await this.orders.releaseDelivery(cafeId, user.id, id));
  }

  @Post(':id/pick-up')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Taken from the cafe: on the way' })
  @ApiOkResponse({ type: OrderDto })
  async pickUp(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CourierPickUpDto,
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.orders.courierPickUp(cafeId, user.id, id, dto.etaMinutes),
    );
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handed over, and paid for: the order is closed' })
  @ApiOkResponse({ type: OrderDto })
  async deliver(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CourierDeliverDto,
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.orders.courierDeliver(cafeId, user.id, id, dto.method),
    );
  }
}
