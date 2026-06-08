import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.integration.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.integration.ts',
        'src/test/**',
        'src/index.ts',
        // Stubs with no logic yet — covered by integration tests in later tickets
        'src/routes/**',
        'src/lib/prisma.ts',
        'src/middleware/rateLimit.middleware.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
      },
    },
  },
});
