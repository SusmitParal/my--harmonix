import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// For Vite, we don't need to manually loadEnv for basic VITE_ variables
// as they are automatically injected into import.meta.env
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Ensure Rollup knows exactly where to start
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  // This replaces the complex 'define' block. 
  // It allows code using 'process.env' to not crash, 
  // though you should use import.meta.env instead.
  define: {
    'process.env': {},
  },
});
