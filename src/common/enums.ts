/** Marks the default role a cafe's `StaffRole` came from. Custom roles have none. */
export enum Role {
  OWNER = 'OWNER',
  CASHIER = 'CASHIER',
  WAITER = 'WAITER',
  COOK = 'COOK',
  COURIER = 'COURIER',
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

/** How food reaches the customer, which decides who hears that an order is ready. */
export enum ServiceMode {
  /** A waiter takes the order and carries it to the table; the bill comes after. */
  TABLE_SERVICE = 'TABLE_SERVICE',
  /** Customers pay at the counter, watch the screen and collect it themselves. */
  SELF_SERVICE = 'SELF_SERVICE',
}

/** How a product is counted: by the piece, or weighed with the price per kilogram. */
export enum ProductUnit {
  PIECE = 'PIECE',
  KG = 'KG',
}

/** Who carries a cafe's deliveries. */
export enum DeliveryMode {
  /** Its own couriers, who are its staff. */
  OWN = 'OWN',
  /** Couriers from the shared network, anyone signed up on the courier site. */
  NETWORK = 'NETWORK',
  /** Its own first; the operator can put an order out to the network too. */
  BOTH = 'BOTH',
}

/** How a network courier gets around: it tells the cafe what to expect. */
export enum Vehicle {
  FOOT = 'FOOT',
  BICYCLE = 'BICYCLE',
  MOTORBIKE = 'MOTORBIKE',
  CAR = 'CAR',
}
