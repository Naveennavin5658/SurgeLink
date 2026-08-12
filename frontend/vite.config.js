import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'surgelink-ui.onrender.com',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
