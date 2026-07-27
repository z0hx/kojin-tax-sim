import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const base = process.env.VITE_BASE ?? '/kojin-tax-sim/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/persistence/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/persistence/**', 'src/store/**'],
    },
  },
});
