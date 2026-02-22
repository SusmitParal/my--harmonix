import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env variables with an empty prefix to catch everything
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Force the app to serve from the root. This fixes the 'Purple Screen'.
    base: '/',
    plugins: [react()],
    define: {
      'process.env': {},
      // Fallback bridge: supports both VITE_ prefix and standard keys
      'import.meta.env.VITE_API_KEY': JSON.stringify(env.VITE_API_KEY || env.API_KEY || "")
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(warning);
        },
      },
    },
    // Required for some Vercel build environments to resolve paths correctly
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  };
});
