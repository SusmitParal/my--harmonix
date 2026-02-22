import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env variables based on the current mode (development/production)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // This prevents the 'process is not defined' error in the browser
      'process.env': {},
      // Specifically maps the Vercel env variable to your code
      'import.meta.env.VITE_API_KEY': JSON.stringify(env.VITE_API_KEY || env.API_KEY)
    },
    build: {
      outDir: 'dist',
      sourcemap: false, // Set to false for faster, cleaner Vercel builds
      rollupOptions: {
        // This ignores minor syntax warnings that can block the AST parser
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(warning);
        },
      },
    },
  };
});
