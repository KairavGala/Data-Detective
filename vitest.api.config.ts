import { defineConfig } from 'vitest/config';

/**
 * Isolated Vitest configuration for backend /api/* serverless modules.
 * Runs in authentic Node.js environment with NO Vite `@/*` path aliases
 * so backend tests verify true Node ESM resolution parity with Vercel.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['api/**/*.test.ts'],
  },
});
