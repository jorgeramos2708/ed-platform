import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// jsdom para componentes; proxy de /api al server en desarrollo (mismo origen en producción via nginx)
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3100' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    fileParallelism: false,
  },
});
