import { tashkentDate } from './dates.js';

describe('tashkentDate', () => {
  it('rolls over at midnight Tashkent time (UTC+5), not at midnight UTC', () => {
    expect(tashkentDate(new Date('2026-03-10T18:59:59Z'))).toBe('2026-03-10');
    expect(tashkentDate(new Date('2026-03-10T19:00:00Z'))).toBe('2026-03-11');
  });
});
