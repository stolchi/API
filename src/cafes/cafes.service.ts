import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import { DeliveryMode } from '../common/enums.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { TelegramBot } from '../database/entities/telegram-bot.entity.js';
import { detectImageType } from '../storage/image-type.js';
import { StorageService } from '../storage/storage.service.js';
import type { CafeDto, UpdateCafeDto, WorkingHoursDto } from './cafes.dto.js';

@Injectable()
export class CafesService {
  constructor(
    @InjectRepository(Cafe) private readonly cafes: Repository<Cafe>,
    @InjectRepository(TelegramBot)
    private readonly bots: Repository<TelegramBot>,
    private readonly storage: StorageService,
  ) {}

  async current(cafeId: string): Promise<CafeDto> {
    const cafe = await this.load(cafeId);
    const bot = await this.bots.findOneBy({ cafeId });
    return {
      id: cafe.id,
      name: cafe.name,
      slug: cafe.slug,
      currency: cafe.currency,
      logoUrl: cafe.logoUrl,
      primaryColor: cafe.primaryColor,
      phone: cafe.phone,
      address: cafe.address,
      workingHours: cafe.workingHours as WorkingHoursDto | null,
      serviceMode: cafe.serviceMode,
      orderTypes: cafe.orderTypes,
      serviceChargePercent: cafe.serviceChargePercent,
      packagingFee: cafe.packagingFee,
      deliveryFee: cafe.deliveryFee,
      deliveryMode: cafe.deliveryMode,
      location:
        cafe.latitude === null || cafe.longitude === null
          ? null
          : { latitude: cafe.latitude, longitude: cafe.longitude },
      telegramBot: bot && {
        username: bot.username,
        isActive: bot.isActive,
        error: bot.lastError,
        notificationsLinked: bot.notifyChatId !== null,
        linkUrl: bot.username
          ? `https://t.me/${bot.username}?start=staff_${bot.linkCode}`
          : null,
      },
    };
  }

  async update(
    cafeId: string,
    { location, ...dto }: UpdateCafeDto,
  ): Promise<CafeDto> {
    const before = await this.load(cafeId);
    const mode = dto.deliveryMode ?? before.deliveryMode;
    const onMap =
      location === undefined ? before.latitude !== null : location !== null;
    if (mode !== DeliveryMode.OWN && !onMap) {
      throw new BadRequestException(
        'Network couriers need the cafe on the map',
      );
    }
    await this.cafes.update({ id: cafeId }, {
      ...dto,
      ...(location !== undefined && {
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
      }),
      // Validation produces class instances; the jsonb column wants plain values.
      ...(dto.workingHours && {
        workingHours: { ...dto.workingHours } as object,
      }),
    } as QueryDeepPartialEntity<Cafe>);
    return this.current(cafeId);
  }

  async setLogo(
    cafeId: string,
    file: { buffer: Buffer } | undefined,
  ): Promise<CafeDto> {
    if (!file) throw new BadRequestException('file is required');
    const extension = detectImageType(file.buffer);
    if (!extension) {
      throw new BadRequestException(
        'Only JPEG, PNG and WebP images are allowed',
      );
    }
    const before = await this.load(cafeId);
    const logoUrl = await this.storage.save({
      buffer: file.buffer,
      extension,
    });
    await this.cafes.update({ id: cafeId }, { logoUrl });
    if (before.logoUrl) await this.storage.remove(before.logoUrl);
    return this.current(cafeId);
  }

  private async load(cafeId: string): Promise<Cafe> {
    const cafe = await this.cafes.findOneBy({ id: cafeId });
    if (!cafe) throw new NotFoundException();
    return cafe;
  }
}
