import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { open: false },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        styles: resolve(__dirname, 'styles.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    coverage: {
      include: ['src/game/**', 'src/utils/**'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
