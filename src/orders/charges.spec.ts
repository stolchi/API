import { describe, expect, it } from 'vitest';
import { OrderType } from '../common/enums.js';
import { chargesFor, totalsOf } from './charges.js';

const cafe = {
  serviceChargePercent: 10,
  packagingFee: 2000,
  deliveryFee: 15000,
};

describe('order charges', () => {
  it('adds service only to dine-in orders', () => {
    expect(chargesFor(OrderType.DINE_IN, cafe)).toEqual({
      serviceChargePercent: 10,
      packagingFee: 0,
      deliveryFee: 0,
    });
  });

  it('adds packaging to takeaway, and delivery on top for delivery', () => {
    expect(chargesFor(OrderType.TAKEAWAY, cafe)).toEqual({
      serviceChargePercent: 0,
      packagingFee: 2000,
      deliveryFee: 0,
    });
    expect(chargesFor(OrderType.DELIVERY, cafe)).toEqual({
      serviceChargePercent: 0,
      packagingFee: 2000,
      deliveryFee: 15000,
    });
  });

  it("rounds the service charge to whole so'm", () => {
    expect(totalsOf(12_345, chargesFor(OrderType.DINE_IN, cafe))).toEqual({
      serviceCharge: 1235,
      total: 13_580,
    });
    expect(totalsOf(50_000, chargesFor(OrderType.DELIVERY, cafe))).toEqual({
      serviceCharge: 0,
      total: 67_000,
    });
  });
});
