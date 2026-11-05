import type {
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
  SelectQueryBuilder,
  UpdateResult,
} from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js';
import type { TenantEntity } from '../../database/entities/tenant.entity.js';

/**
 * The one way business code reaches tenant tables. Every operation is bound to a
 * cafe, so forgetting the `cafeId` filter is not possible:
 *
 *   this.categories.forCafe(cafeId).findOne({ where: { id } });
 */
export class TenantRepository<T extends TenantEntity> {
  constructor(private readonly repository: Repository<T>) {}

  forCafe(cafeId: string): CafeScope<T> {
    // TypeORM ignores undefined filters, which would otherwise match every cafe's rows.
    if (!cafeId) throw new Error('TenantRepository requires a cafeId');
    return new CafeScope(this.repository, cafeId);
  }
}

type Where<T> = FindOptionsWhere<T> | FindOptionsWhere<T>[];

export class CafeScope<T extends TenantEntity> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly cafeId: string,
  ) {}

  find(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repository.find({
      ...options,
      where: this.scope(options.where),
    });
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne({
      ...options,
      where: this.scope(options.where),
    });
  }

  findAndCount(options: FindManyOptions<T> = {}): Promise<[T[], number]> {
    return this.repository.findAndCount({
      ...options,
      where: this.scope(options.where),
    });
  }

  /** For aggregates. Add conditions with `andWhere`: `where` would drop the cafe filter. */
  queryBuilder(alias: string): SelectQueryBuilder<T> {
    return this.repository
      .createQueryBuilder(alias)
      .where(`${alias}.cafeId = :tenantCafeId`, { tenantCafeId: this.cafeId });
  }

  count(where?: Where<T>): Promise<number> {
    return this.repository.count({ where: this.scope(where) });
  }

  create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create({
      ...data,
      cafeId: this.cafeId,
    } as DeepPartial<T>);
    return this.repository.save(entity);
  }

  update(
    where: FindOptionsWhere<T>,
    patch: QueryDeepPartialEntity<T>,
  ): Promise<UpdateResult> {
    // A row cannot be moved to another cafe, whatever the caller passes in.
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(
        ([key, value]) => key !== 'cafeId' && value !== undefined,
      ),
    );
    if (Object.keys(safePatch).length === 0) {
      return Promise.resolve({ raw: [], affected: 0, generatedMaps: [] });
    }
    return this.repository.update(
      this.scopeOne(where),
      safePatch as QueryDeepPartialEntity<T>,
    );
  }

  delete(where: FindOptionsWhere<T>): Promise<DeleteResult> {
    return this.repository.delete(this.scopeOne(where));
  }

  private scope(where?: Where<T>): Where<T> {
    if (Array.isArray(where)) {
      return where.map((clause) => this.scopeOne(clause));
    }
    return this.scopeOne(where ?? {});
  }

  /** `cafeId` is spread last so that a caller-supplied value can never override it. */
  private scopeOne(where: FindOptionsWhere<T>): FindOptionsWhere<T> {
    return { ...where, cafeId: this.cafeId } as FindOptionsWhere<T>;
  }
}
