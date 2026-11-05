import { detectImageType } from './image-type.js';

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP by their bytes', () => {
    expect(detectImageType(Buffer.from('ffd8ffe000', 'hex'))).toBe('jpg');
    expect(detectImageType(Buffer.from('89504e470d0a1a0a00', 'hex'))).toBe(
      'png',
    );
    expect(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe(
      'webp',
    );
  });

  it.each([
    ['SVG', '<svg onload="alert(1)"></svg>'],
    ['HTML', '<!doctype html><script>alert(1)</script>'],
    ['an empty file', ''],
  ])('refuses %s', (_name, content) => {
    expect(detectImageType(Buffer.from(content))).toBeNull();
  });
});
