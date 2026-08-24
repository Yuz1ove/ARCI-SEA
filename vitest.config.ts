import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['simulation/**/*.test.ts', 'data/**/*.test.ts', 'domain/**/*.test.ts'],
  },
});
