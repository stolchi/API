import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // All e2e files share one database.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_NAME: 'stolchi_test',
      UPLOAD_DIR: join(tmpdir(), 'stolchi-test-uploads'),
    },
  },
});
