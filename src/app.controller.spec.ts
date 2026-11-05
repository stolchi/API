import { Test } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  it('reports ok through constructor-injected AppService', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: { health: () => Promise.resolve({ status: 'ok' }) },
        },
      ],
    }).compile();

    await expect(moduleRef.get(AppController).health()).resolves.toEqual({
      status: 'ok',
    });
  });
});
