import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    watch: {
      usePolling: true,
      interval: 1000
    }
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
});
