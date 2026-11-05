import { buildMenuUrl } from './menu-url.js';

describe('buildMenuUrl', () => {
  it('builds the /:cafeSlug?table={qrToken} route of menu-app', () => {
    expect(buildMenuUrl('https://m.stolchi.uz', 'demo-kafe', 'abc')).toBe(
      'https://m.stolchi.uz/demo-kafe?table=abc',
    );
  });

  it('tolerates a trailing slash in the configured address', () => {
    expect(buildMenuUrl('https://m.stolchi.uz/', 'demo', 'abc')).toBe(
      'https://m.stolchi.uz/demo?table=abc',
    );
  });
});
