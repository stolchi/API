import { Controller, Get, Injectable, Module } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { CurrentCafe, RequireAny } from '../common/auth/decorators.js';
import { tashkentDate } from '../common/dates.js';
import { OrderStatus } from '../common/enums.js';
import { Permission } from '../common/permissions.js';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { Order } from '../database/entities/order.entity.js';

class TopProductDto {
  @ApiProperty({ format: 'uuid', type: String, nullable: true })
  productId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  quantity!: number;
}

class DashboardDto {
  @ApiProperty({ example: '2026-01-31' })
  date!: string;

  @ApiProperty({
    description: "Total of today's closed orders, in whole so'm.",
  })
  revenue!: number;

  @ApiProperty({ description: "Today's orders, not counting cancelled ones." })
  orderCount!: number;

  @ApiProperty({ description: 'Tables that have an order still in progress.' })
  activeTables!: number;

  @ApiProperty({ type: [TopProductDto] })
  topProducts!: TopProductDto[];
}

const SOLD = `SUM(CASE WHEN item.unit = 'KG' THEN 1 ELSE item.quantity END)`;

@Injectable()
class DashboardService {
  private readonly orders: TenantRepository<Order>;

  constructor(@InjectRepository(Order) orders: Repository<Order>) {
    this.orders = new TenantRepository(orders);
  }

  async today(cafeId: string): Promise<DashboardDto> {
    const date = tashkentDate();
    const orders = this.orders.forCafe(cafeId);

    const [revenue, orderCount, activeTables, topProducts] = await Promise.all([
      orders
        .queryBuilder('order')
        .select('COALESCE(SUM(order.total), 0)', 'value')
        .andWhere('order.businessDate = :date', { date })
        .andWhere('order.status = :paid', { paid: OrderStatus.PAID })
        .getRawOne<{ value: string }>(),
      orders.count({
        businessDate: date,
        status: Not(OrderStatus.CANCELLED),
      }),
      orders
        .queryBuilder('order')
        .select('COUNT(DISTINCT order.tableId)', 'value')
        .andWhere('order.status NOT IN (:...closed)', {
          closed: [OrderStatus.PAID, OrderStatus.CANCELLED],
        })
        .getRawOne<{ value: string }>(),
      orders
        .queryBuilder('order')
        .innerJoin('order.items', 'item')
        .select('item.productId', 'productId')
        .addSelect('item.nameSnapshot', 'name')
        // A weighed line counts once: its quantity is grams, not portions.
        .addSelect(SOLD, 'quantity')
        .andWhere('order.businessDate = :date', { date })
        .andWhere('order.status <> :cancelled', {
          cancelled: OrderStatus.CANCELLED,
        })
        .groupBy('item.productId')
        .addGroupBy('item.nameSnapshot')
        .orderBy(SOLD, 'DESC')
        .addOrderBy('item.nameSnapshot', 'ASC')
        .limit(5)
        .getRawMany<{
          productId: string | null;
          name: string;
          quantity: string;
        }>(),
    ]);

    return {
      date,
      // Postgres returns SUM and COUNT as strings.
      revenue: Number(revenue?.value ?? 0),
      orderCount,
      activeTables: Number(activeTables?.value ?? 0),
      topProducts: topProducts.map((row) => ({
        productId: row.productId,
        name: row.name,
        quantity: Number(row.quantity),
      })),
    };
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@RequireAny(Permission.DASHBOARD_VIEW)
@Controller('dashboard')
class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOkResponse({ type: DashboardDto })
  today(@CurrentCafe() cafeId: string): Promise<DashboardDto> {
    return this.dashboard.today(cafeId);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
