import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // This helps debug if it fails again
    sourcemap: true, 
  },
  // This handles any leftover 'process.env' calls in your AI SDK
  define: {
    'process.env': {}
  }
});
