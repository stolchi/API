import { createHmac, timingSafeEqual } from 'node:crypto';

/** How long a Mini App session may place orders, in seconds. */
export const INIT_DATA_MAX_AGE = 24 * 60 * 60;

export interface TelegramUser {
  id: number;
  firstName: string;
  username: string | null;
}

/**
 * Checks what Telegram signed when it opened the Mini App, as Telegram describes:
 * an HMAC of the sorted fields, keyed with the bot's token. Returns the user, or null
 * for anything forged, stale or from another bot.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  now = Date.now(),
  maxAgeSeconds = INIT_DATA_MAX_AGE,
): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) return null;
  const age = now / 1000 - authDate;
  if (age > maxAgeSeconds || age < -60) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '') as {
      id?: unknown;
      first_name?: unknown;
      username?: unknown;
    };
    if (typeof user.id !== 'number') return null;
    return {
      id: user.id,
      firstName: typeof user.first_name === 'string' ? user.first_name : '',
      username: typeof user.username === 'string' ? user.username : null,
    };
  } catch {
    return null;
  }
}

/** Builds signed initData the way Telegram does. For tests. */
export function signInitData(
  fields: Record<string, string>,
  botToken: string,
): string {
  const checkString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
