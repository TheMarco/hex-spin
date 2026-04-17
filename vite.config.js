import { defineConfig } from 'vite';

export default defineConfig({
  server: { open: false },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    coverage: {
      include: ['src/game/**', 'src/utils/**'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
