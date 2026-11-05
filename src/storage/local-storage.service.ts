import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { StorageService, type StoredImageInput } from './storage.service.js';

export const UPLOADS_URL_PREFIX = '/uploads/';

export function uploadDirOf(config: ConfigService): string {
  return resolve(config.get<string>('UPLOAD_DIR') ?? 'uploads');
}

@Injectable()
export class LocalStorageService extends StorageService {
  private readonly directory: string;

  constructor(config: ConfigService) {
    super();
    this.directory = uploadDirOf(config);
  }

  async save({ buffer, extension }: StoredImageInput): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    const name = `${randomUUID()}.${extension}`;
    await writeFile(join(this.directory, name), buffer);
    return `${UPLOADS_URL_PREFIX}${name}`;
  }

  async remove(url: string): Promise<void> {
    if (!url.startsWith(UPLOADS_URL_PREFIX)) return;
    // basename: a stored URL can never reach outside the upload directory.
    await unlink(join(this.directory, basename(url))).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      },
    );
  }
}
