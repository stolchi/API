import 'reflect-metadata';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Role } from '../common/enums.js';
import { DEFAULT_ROLES } from '../common/permissions.js';
import { buildDataSourceOptions, loadEnvFile } from './database.config.js';
import {
  Cafe,
  CafeTable,
  Category,
  Product,
  StaffRole,
  User,
} from './entities/index.js';

const MENU: { category: string; products: [name: string, price: number][] }[] =
  [
    {
      category: 'Taomlar',
      products: [
        ['Osh', 45000],
        ["Lag'mon", 38000],
        ["Sho'rva", 35000],
        ['Manti', 32000],
      ],
    },
    {
      category: 'Salatlar',
      products: [
        ['Achchiq-chuchuk', 15000],
        ['Olivye', 22000],
        ['Sezar', 35000],
      ],
    },
    {
      category: 'Ichimliklar',
      products: [
        ['Choy', 5000],
        ['Kofe', 18000],
        ['Limonad', 20000],
      ],
    },
  ];

async function main(): Promise<void> {
  loadEnvFile();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to create demo users in production.');
  }
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is not set. See .env.example.');

  const dataSource = await new DataSource(
    buildDataSourceOptions(process.env),
  ).initialize();

  try {
    if (await dataSource.manager.existsBy(Cafe, { slug: 'demo-kafe' })) {
      console.log('Demo data already exists, nothing to do.');
      return;
    }
    const passwordHash = await argon2.hash(password);

    await dataSource.transaction(async (manager) => {
      await manager.save(
        manager.create(User, {
          cafeId: null,
          name: 'Super Admin',
          phone: '+998900000000',
          passwordHash,
          isSuperAdmin: true,
        }),
      );

      const cafe = await manager.save(
        manager.create(Cafe, {
          name: 'Demo Kafe',
          slug: 'demo-kafe',
          primaryColor: '#E4572E',
        }),
      );
      const cafeId = cafe.id;

      const roles = await manager.save(
        DEFAULT_ROLES.map((role) =>
          manager.create(StaffRole, { ...role, cafeId }),
        ),
      );

      await manager.save(
        (
          [
            ['Demo Owner', '+998900000001', Role.OWNER],
            ['Demo Cashier', '+998900000002', Role.CASHIER],
            ['Demo Cook', '+998900000003', Role.COOK],
            ['Demo Waiter', '+998900000004', Role.WAITER],
          ] as const
        ).map(([name, phone, systemKey]) =>
          manager.create(User, {
            cafeId,
            name,
            phone,
            passwordHash,
            role: roles.find((role) => role.systemKey === systemKey),
          }),
        ),
      );

      for (const [sortOrder, { category, products }] of MENU.entries()) {
        const { id: categoryId } = await manager.save(
          manager.create(Category, { cafeId, name: category, sortOrder }),
        );
        await manager.save(
          products.map(([name, price], index) =>
            manager.create(Product, {
              cafeId,
              categoryId,
              name,
              price,
              sortOrder: index,
            }),
          ),
        );
      }

      await manager.save(
        [1, 2, 3, 4, 5].map((number) =>
          manager.create(CafeTable, {
            cafeId,
            name: `Stol ${number}`,
            qrToken: randomBytes(16).toString('hex'),
          }),
        ),
      );
    });

    console.log('Seeded: 1 super admin, Demo Kafe with 4 users, 3 categories,');
    console.log('10 products and 5 tables. Logins use SEED_PASSWORD.');
  } finally {
    await dataSource.destroy();
  }
}

await main();
