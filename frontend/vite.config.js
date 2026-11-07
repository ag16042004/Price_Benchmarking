import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.jsx'],
    globalSetup: ['./test/globalSetup.js'],
    setupFiles: ['./test/setup.js'],
    testTimeout: 30000,
  },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
