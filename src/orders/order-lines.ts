import { ProductUnit } from '../common/enums.js';

/** The most a KG line can weigh, in grams. */
export const MAX_GRAMS = 100_000;

interface PricedLine {
  priceSnapshot: number;
  quantity: number;
  unit: ProductUnit;
}

/** Whole so'm: a weighed line is priced per kilogram and rounded to the so'm. */
export const lineTotalOf = ({ priceSnapshot, quantity, unit }: PricedLine) =>
  unit === ProductUnit.KG
    ? Math.round((priceSnapshot * quantity) / 1000)
    : priceSnapshot * quantity;

export const itemsTotalOf = (lines: readonly PricedLine[]): number =>
  lines.reduce((sum, line) => sum + lineTotalOf(line), 0);

/** Pieces count from 1 to 999; a weight is in grams. */
export const maxQuantityOf = (unit: ProductUnit) =>
  unit === ProductUnit.KG ? MAX_GRAMS : 999;
