import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve:{alias:{'@':fileURLToPath(new URL('./',import.meta.url))}},
  test: {
    environment: 'node',
    include: ['simulation/**/*.test.ts', 'data/**/*.test.ts', 'domain/**/*.test.ts', 'lib/**/*.test.ts'],
  },
});
