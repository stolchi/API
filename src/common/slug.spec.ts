import { slugify } from './slug.js';

describe('slugify', () => {
  it.each([
    ['Demo Kafe', 'demo-kafe'],
    ["O'zbek Oshxonasi", 'ozbek-oshxonasi'],
    ['G‘ijduvon  Kabob!', 'gijduvon-kabob'],
    ['  --Cafe--  ', 'cafe'],
    ['Кафе', ''],
  ])('%s -> "%s"', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('caps the length without leaving a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});
