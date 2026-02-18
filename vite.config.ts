import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 1. Tell Vite the files are in the root directory
  root: './', 
  define: {
    // 2. This ensures the app doesn't crash if the key is missing
    'process.env': {}
  },
  build: {
    outDir: 'dist',
    // 3. Ensuring assets are bundled correctly
    assetsDir: 'assets',
    sourcemap: false
  }
});
