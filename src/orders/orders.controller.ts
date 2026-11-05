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
import { CurrentCafe, CurrentUser, Roles } from '../common/auth/decorators.js';
import { OrderSource, OrderStatus, Role } from '../common/enums.js';
import {
  AddPaymentDto,
  ChangeStatusDto,
  CreateOrderDto,
  ListOrdersQueryDto,
  OrderDto,
  OrderPageDto,
} from './orders.dto.js';
import { OrdersService, toOrderDto } from './orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@Roles(Role.OWNER, Role.CASHIER, Role.WAITER, Role.COOK)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(Role.OWNER, Role.CASHIER, Role.WAITER)
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
    @Query() query: ListOrdersQueryDto,
  ): Promise<OrderPageDto> {
    return this.orders.list(cafeId, query);
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
      await this.orders.changeStatus(cafeId, id, dto.status, user.role),
    );
  }

  @Post(':id/cancel')
  @Roles(Role.OWNER, Role.CASHIER)
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
        user.role,
      ),
    );
  }

  @Post(':id/payments')
  @Roles(Role.OWNER, Role.CASHIER)
  @ApiCreatedResponse({ type: OrderDto })
  async addPayment(
    @CurrentCafe() cafeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPaymentDto,
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.orders.addPayment(cafeId, id, dto.method, dto.amount),
    );
  }

  @Post(':id/close')
  @Roles(Role.OWNER, Role.CASHIER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a served, fully paid order' })
  @ApiOkResponse({ type: OrderDto })
  async close(
    @CurrentCafe() cafeId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDto> {
    return toOrderDto(
      await this.orders.changeStatus(cafeId, id, OrderStatus.PAID, user.role),
    );
  }
}
