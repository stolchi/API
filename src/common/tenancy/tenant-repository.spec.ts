import type { Repository } from 'typeorm';
import { Category } from '../../database/entities/category.entity.js';
import { TenantRepository } from './tenant-repository.js';

function setup() {
  const repository = {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn((data: unknown) => data),
    save: vi.fn((data: unknown) => Promise.resolve(data)),
    update: vi.fn().mockResolvedValue({ affected: 0 }),
    delete: vi.fn().mockResolvedValue({ affected: 0 }),
  };
  const tenant = new TenantRepository<Category>(
    repository as unknown as Repository<Category>,
  );
  return { repository, tenant };
}

describe('TenantRepository', () => {
  it.each(['', undefined as unknown as string, null as unknown as string])(
    'refuses a missing cafeId (%s), which would otherwise match every cafe',
    (cafeId) => {
      expect(() => setup().tenant.forCafe(cafeId)).toThrow();
    },
  );

  it('adds cafeId when there is no filter at all', async () => {
    const { repository, tenant } = setup();
    await tenant.forCafe('A').find();
    expect(repository.find).toHaveBeenCalledWith({ where: { cafeId: 'A' } });
  });

  it('adds cafeId to every branch of an OR filter', async () => {
    const { repository, tenant } = setup();
    await tenant.forCafe('A').find({ where: [{ name: 'x' }, { name: 'y' }] });
    expect(repository.find).toHaveBeenCalledWith({
      where: [
        { name: 'x', cafeId: 'A' },
        { name: 'y', cafeId: 'A' },
      ],
    });
  });

  it('ignores a cafeId supplied by the caller in a filter', async () => {
    const { repository, tenant } = setup();
    await tenant.forCafe('A').findOne({ where: { cafeId: 'B' } });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { cafeId: 'A' },
    });
  });

  it('ignores a cafeId supplied by the caller on create', async () => {
    const { repository, tenant } = setup();
    await tenant.forCafe('A').create({ name: 'x', cafeId: 'B' });
    expect(repository.save).toHaveBeenCalledWith({ name: 'x', cafeId: 'A' });
  });

  it('cannot move a row to another cafe on update', async () => {
    const { repository, tenant } = setup();
    await tenant.forCafe('A').update({ id: '1' }, { name: 'x', cafeId: 'B' });
    expect(repository.update).toHaveBeenCalledWith(
      { id: '1', cafeId: 'A' },
      { name: 'x' },
    );
  });

  it('scopes delete to the cafe', async () => {
    const { repository, tenant } = setup();
    await tenant.forCafe('A').delete({ id: '1' });
    expect(repository.delete).toHaveBeenCalledWith({ id: '1', cafeId: 'A' });
  });
});
