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
  ChangeStatusDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  MoveOrderDto,
  OrderDto,
  OrderPageDto,
  UpdateOrderItemsDto,
} from './orders.dto.js';
import { OrdersService, toOrderDto } from './orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@RequireAny(Permission.ORDERS_VIEW, Permission.KITCHEN_WORK)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

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
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.orders.changeStatus(
        cafeId,
        id,
        OrderStatus.CANCELLED,
        user.permissions,
      ),
    );
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
