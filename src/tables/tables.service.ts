import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Repository } from 'typeorm';
import { TenantRepository } from '../common/tenancy/tenant-repository.js';
import { isUniqueViolation } from '../common/validation.js';
import { CafeTable } from '../database/entities/cafe-table.entity.js';
import { Cafe } from '../database/entities/cafe.entity.js';
import { buildMenuUrl } from './menu-url.js';
import type { CreateTableDto, TableDto, UpdateTableDto } from './tables.dto.js';

const NAME_TAKEN = 'A table with this name already exists';

// A4 in points, with two columns and three rows of cards per page.
const PAGE = { width: 595.28, height: 841.89, margin: 36 };
const COLUMNS = 2;
const ROWS = 3;
const QR_SIZE = 180;

@Injectable()
export class TablesService {
  private readonly tables: TenantRepository<CafeTable>;

  constructor(
    @InjectRepository(CafeTable) tables: Repository<CafeTable>,
    @InjectRepository(Cafe) private readonly cafes: Repository<Cafe>,
    private readonly config: ConfigService,
  ) {
    this.tables = new TenantRepository(tables);
  }

  async list(cafeId: string): Promise<TableDto[]> {
    const { slug } = await this.cafeOf(cafeId);
    const rows = await this.sorted(cafeId);
    return rows.map((row) => this.toDto(row, slug));
  }

  async get(cafeId: string, id: string): Promise<TableDto> {
    const { slug } = await this.cafeOf(cafeId);
    return this.toDto(await this.load(cafeId, id), slug);
  }

  async create(cafeId: string, dto: CreateTableDto): Promise<TableDto> {
    const { slug } = await this.cafeOf(cafeId);
    try {
      const row = await this.tables.forCafe(cafeId).create({
        ...dto,
        qrToken: randomBytes(16).toString('hex'),
      });
      return this.toDto(row, slug);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(NAME_TAKEN);
      throw error;
    }
  }

  async update(
    cafeId: string,
    id: string,
    dto: UpdateTableDto,
  ): Promise<TableDto> {
    await this.load(cafeId, id);
    try {
      await this.tables.forCafe(cafeId).update({ id }, { ...dto });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(NAME_TAKEN);
      throw error;
    }
    return this.get(cafeId, id);
  }

  async remove(cafeId: string, id: string): Promise<void> {
    await this.load(cafeId, id);
    await this.tables.forCafe(cafeId).delete({ id });
  }

  async qrPng(cafeId: string, id: string): Promise<Buffer> {
    return QRCode.toBuffer(await this.urlOf(cafeId, id), {
      type: 'png',
      width: 800,
      margin: 2,
    });
  }

  async qrSvg(cafeId: string, id: string): Promise<string> {
    return QRCode.toString(await this.urlOf(cafeId, id), {
      type: 'svg',
      margin: 2,
    });
  }

  /** A printable A4 document with one card per table. */
  async qrPdf(cafeId: string): Promise<Buffer> {
    const cafe = await this.cafeOf(cafeId);
    const rows = await this.sorted(cafeId);

    const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const cardWidth = (PAGE.width - PAGE.margin * 2) / COLUMNS;
    const cardHeight = (PAGE.height - PAGE.margin * 2) / ROWS;

    for (const [index, row] of rows.entries()) {
      const slot = index % (COLUMNS * ROWS);
      if (index > 0 && slot === 0) doc.addPage();

      const x = PAGE.margin + (slot % COLUMNS) * cardWidth;
      const y = PAGE.margin + Math.floor(slot / COLUMNS) * cardHeight;
      const png = await QRCode.toBuffer(this.menuUrl(cafe.slug, row.qrToken), {
        type: 'png',
        width: 600,
        margin: 1,
      });

      doc.fontSize(12).text(cafe.name, x, y + 8, {
        width: cardWidth,
        align: 'center',
      });
      doc.image(png, x + (cardWidth - QR_SIZE) / 2, y + 30, {
        width: QR_SIZE,
        height: QR_SIZE,
      });
      doc.fontSize(16).text(row.name, x, y + 30 + QR_SIZE + 8, {
        width: cardWidth,
        align: 'center',
      });
    }

    doc.end();
    return finished;
  }

  private sorted(cafeId: string): Promise<CafeTable[]> {
    return this.tables.forCafe(cafeId).find({ order: { name: 'ASC' } });
  }

  private async urlOf(cafeId: string, id: string): Promise<string> {
    const { slug } = await this.cafeOf(cafeId);
    const row = await this.load(cafeId, id);
    return this.menuUrl(slug, row.qrToken);
  }

  private menuUrl(slug: string, qrToken: string): string {
    return buildMenuUrl(
      this.config.getOrThrow<string>('MENU_APP_URL'),
      slug,
      qrToken,
    );
  }

  private toDto(row: CafeTable, slug: string): TableDto {
    return {
      id: row.id,
      name: row.name,
      zone: row.zone,
      qrToken: row.qrToken,
      menuUrl: this.menuUrl(slug, row.qrToken),
    };
  }

  private async cafeOf(cafeId: string): Promise<Cafe> {
    const cafe = await this.cafes.findOneBy({ id: cafeId });
    if (!cafe) throw new NotFoundException();
    return cafe;
  }

  private async load(cafeId: string, id: string): Promise<CafeTable> {
    const row = await this.tables.forCafe(cafeId).findOne({ where: { id } });
    if (!row) throw new NotFoundException();
    return row;
  }
}
