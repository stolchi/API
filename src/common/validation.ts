export const PHONE_PATTERN = /^\+998\d{9}$/;
export const PHONE_MESSAGE = 'phone must look like +998901234567';

/** Largest money amount in so'm: keeps sums well inside a Postgres integer. */
export const MAX_MONEY = 2_000_000_000;

const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';

function pgCodeOf(error: unknown): string | undefined {
  return (error as { driverError?: { code?: string } }).driverError?.code;
}

export const isUniqueViolation = (error: unknown): boolean =>
  pgCodeOf(error) === PG_UNIQUE_VIOLATION;

export const isForeignKeyViolation = (error: unknown): boolean =>
  pgCodeOf(error) === PG_FOREIGN_KEY_VIOLATION;
