export interface StoredImageInput {
  buffer: Buffer;
  extension: 'jpg' | 'png' | 'webp';
}

/** Implemented by local disk today; an S3/R2 implementation can replace it via DI. */
export abstract class StorageService {
  /** Stores the image and returns the URL it can be fetched from. */
  abstract save(image: StoredImageInput): Promise<string>;

  /** Removes a file by the URL `save` returned. Unknown URLs are ignored. */
  abstract remove(url: string): Promise<void>;
}
