import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/decorators.js';
import type { NetworkCourier } from '../database/entities/network-courier.entity.js';
import { NetworkOrdersService } from '../orders/network-orders.service.js';
import {
  CurrentNetworkCourier,
  NetworkCourierGuard,
} from './network-courier.guard.js';
import {
  NearbyQueryDto,
  NetworkDeliveryDto,
  NetworkEtaDto,
  NetworkOfferDto,
} from './network.dto.js';

const DEFAULT_RADIUS_KM = 10;

/** A network courier's work: offered deliveries, and their own. */
@ApiTags('network')
@ApiBearerAuth()
@Public()
@UseGuards(NetworkCourierGuard)
@Controller('network/orders')
export class NetworkOrdersController {
  constructor(private readonly network: NetworkOrdersService) {}

  @Get('nearby')
  @ApiOkResponse({ type: [NetworkOfferDto] })
  async nearby(@Query() query: NearbyQueryDto): Promise<NetworkOfferDto[]> {
    const near =
      query.latitude !== undefined && query.longitude !== undefined
        ? { latitude: query.latitude, longitude: query.longitude }
        : null;
    const offers = await this.network.nearby(
      near,
      query.radiusKm ?? DEFAULT_RADIUS_KM,
    );
    return offers.map(({ order, toCafeKm }) =>
      this.network.toOffer(order, toCafeKm),
    );
  }

  @Get('mine')
  @ApiOkResponse({ type: [NetworkDeliveryDto] })
  async mine(
    @CurrentNetworkCourier() courier: NetworkCourier,
  ): Promise<NetworkDeliveryDto[]> {
    return (await this.network.mine(courier.id)).map((order) =>
      this.network.toDelivery(order),
    );
  }

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: NetworkDeliveryDto })
  async claim(
    @CurrentNetworkCourier() courier: NetworkCourier,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<NetworkDeliveryDto> {
    await this.network.claim(courier.id, id);
    return this.own(courier, id);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(
    @CurrentNetworkCourier() courier: NetworkCourier,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.network.release(courier.id, id);
  }

  @Post(':id/eta')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: NetworkDeliveryDto })
  async eta(
    @CurrentNetworkCourier() courier: NetworkCourier,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NetworkEtaDto,
  ): Promise<NetworkDeliveryDto> {
    await this.network.setEta(courier.id, id, dto.etaMinutes);
    return this.own(courier, id);
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deliver(
    @CurrentNetworkCourier() courier: NetworkCourier,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.network.deliver(courier.id, id);
  }

  private async own(
    courier: NetworkCourier,
    id: string,
  ): Promise<NetworkDeliveryDto> {
    const order = (await this.network.mine(courier.id)).find(
      (candidate) => candidate.id === id,
    );
    return this.network.toDelivery(order!);
  }
}
