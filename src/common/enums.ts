/** Marks the default role a cafe's `StaffRole` came from. Custom roles have none. */
export enum Role {
  OWNER = 'OWNER',
  CASHIER = 'CASHIER',
  WAITER = 'WAITER',
  COOK = 'COOK',
}

export enum OrderSource {
  POS = 'POS',
  QR = 'QR',
  TELEGRAM = 'TELEGRAM',
}

export enum OrderType {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
  DELIVERY = 'DELIVERY',
}

export enum OrderStatus {
  NEW = 'NEW',
  ACCEPTED = 'ACCEPTED',
  COOKING = 'COOKING',
  READY = 'READY',
  SERVED = 'SERVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  CLICK = 'CLICK',
  PAYME = 'PAYME',
}
