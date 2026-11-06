const REQUIRED = [
  'DATABASE_HOST',
  'DATABASE_USER',
  'DATABASE_PASSWORD',
  'DATABASE_NAME',
  'JWT_ACCESS_SECRET',
  'CORS_ORIGINS',
  'MENU_APP_URL',
  'TELEGRAM_TOKEN_KEY',
] as const;

/** Fails at startup rather than on the first request that needs a missing value. */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(', ')}. See .env.example.`,
    );
  }
  if (String(config.JWT_ACCESS_SECRET).length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters long.');
  }
  if (Buffer.from(String(config.TELEGRAM_TOKEN_KEY), 'base64').length !== 32) {
    throw new Error('TELEGRAM_TOKEN_KEY must be 32 bytes in base64.');
  }
  return config;
}
