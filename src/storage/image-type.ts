import type { StoredImageInput } from './storage.service.js';

/**
 * Detects the image type from the file's first bytes, because the name and content
 * type sent by the client can be anything. SVG is deliberately not accepted: it can
 * carry scripts.
 */
export function detectImageType(
  buffer: Buffer,
): StoredImageInput['extension'] | null {
  if (
    buffer.length >= 3 &&
    buffer.subarray(0, 3).toString('hex') === 'ffd8ff'
  ) {
    return 'jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}
