import { describe, expect, it } from 'vitest';
import { ProductUnit } from '../common/enums.js';
import { itemsTotalOf, lineTotalOf } from './order-lines.js';

describe('order lines', () => {
  it('prices pieces by the piece', () => {
    expect(
      lineTotalOf({
        priceSnapshot: 45000,
        quantity: 2,
        unit: ProductUnit.PIECE,
      }),
    ).toBe(90000);
  });

  it("prices weight per kilogram, rounded to the so'm", () => {
    expect(
      lineTotalOf({
        priceSnapshot: 120000,
        quantity: 1250,
        unit: ProductUnit.KG,
      }),
    ).toBe(150000);
    expect(
      lineTotalOf({
        priceSnapshot: 99999,
        quantity: 333,
        unit: ProductUnit.KG,
      }),
    ).toBe(33300);
  });

  it('adds up mixed lines', () => {
    expect(
      itemsTotalOf([
        { priceSnapshot: 5000, quantity: 3, unit: ProductUnit.PIECE },
        { priceSnapshot: 80000, quantity: 500, unit: ProductUnit.KG },
      ]),
    ).toBe(55000);
  });
});
