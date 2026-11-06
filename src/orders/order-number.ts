import { OrderSource } from '../common/enums.js';

const PREFIXES: Record<OrderSource, string> = {
  [OrderSource.POS]: '',
  [OrderSource.QR]: 'Q-',
  [OrderSource.TELEGRAM]: 'D-',
};

/**
 * The number people see and call out. All sources share one daily count, so that
 * `12` and `Q-12` can never both be waiting at the counter.
 */
export const displayNumberOf = (order: {
  number: number;
  source: OrderSource;
}): string => `${PREFIXES[order.source]}${order.number}`;
