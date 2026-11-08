import { describe, expect, it } from 'vitest';
import { signInitData, verifyInitData } from './init-data.js';

const TOKEN = '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NOW = 1_800_000_000_000;
const user = JSON.stringify({ id: 42, first_name: 'Aziz', username: 'aziz' });
const fields = {
  auth_date: String(NOW / 1000 - 60),
  query_id: 'AAE',
  user,
};

describe('verifyInitData', () => {
  it('trusts what the bot signed', () => {
    expect(verifyInitData(signInitData(fields, TOKEN), TOKEN, NOW)).toEqual({
      id: 42,
      firstName: 'Aziz',
      username: 'aziz',
    });
  });

  it('refuses another bot, a change and a missing signature', () => {
    const signed = signInitData(fields, TOKEN);
    expect(verifyInitData(signed, '654321:BBBB', NOW)).toBeNull();
    expect(
      verifyInitData(signed.replace('Aziz', 'Vali'), TOKEN, NOW),
    ).toBeNull();
    expect(
      verifyInitData(new URLSearchParams(fields).toString(), TOKEN, NOW),
    ).toBeNull();
    expect(verifyInitData('', TOKEN, NOW)).toBeNull();
  });

  it('refuses a session older than a day', () => {
    const old = signInitData(
      { ...fields, auth_date: String(NOW / 1000 - 25 * 60 * 60) },
      TOKEN,
    );
    expect(verifyInitData(old, TOKEN, NOW)).toBeNull();
  });

  it('needs a user', () => {
    const noUser = signInitData({ auth_date: fields.auth_date }, TOKEN);
    expect(verifyInitData(noUser, TOKEN, NOW)).toBeNull();
  });
});
