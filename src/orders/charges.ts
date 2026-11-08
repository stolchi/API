import { OrderType } from '../common/enums.js';

/** What a cafe charges on top of the food, as set in its settings. */
export interface CafeCharges {
  serviceChargePercent: number;
  packagingFee: number;
  deliveryFee: number;
}

/** The part of the cafe's charges that applies to one kind of order. */
export function chargesFor(type: OrderType, cafe: CafeCharges): CafeCharges {
  return {
    // Service is for those served at a table.
    serviceChargePercent:
      type === OrderType.DINE_IN ? cafe.serviceChargePercent : 0,
    packagingFee: type === OrderType.DINE_IN ? 0 : cafe.packagingFee,
    deliveryFee: type === OrderType.DELIVERY ? cafe.deliveryFee : 0,
  };
}

/** Whole so'm, rounded to the nearest so'm. */
export function serviceChargeOf(itemsTotal: number, percent: number): number {
  return Math.round((itemsTotal * percent) / 100);
}

export function totalsOf(itemsTotal: number, charges: CafeCharges) {
  const serviceCharge = serviceChargeOf(
    itemsTotal,
    charges.serviceChargePercent,
  );
  return {
    serviceCharge,
    total:
      itemsTotal + serviceCharge + charges.packagingFee + charges.deliveryFee,
  };
}
