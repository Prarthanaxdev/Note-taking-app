import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/App.tsx',
        'src/vite-env.d.ts',
        // Stubs/infrastructure with no unit-testable logic — covered in later tickets
        'src/lib/apiClient.ts',
        'src/lib/utils.ts',
        'src/store/uiStore.ts',
        'src/pages/**',
        'src/components/**',
        'src/hooks/**',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      shared: path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
