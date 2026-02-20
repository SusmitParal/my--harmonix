import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'; // Essential for 2026 "Zero-Config" styling

export default defineConfig(({ mode }) => {
  // Load env file based on `mode`. 
  // On Vercel, this will pick up your dashboard Environment Variables automatically.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      tailwindcss(), // This replaces the missing tailwind.config.js file
    ],
    define: {
      // Correct way to expose the API key to your Gemini Service
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.API_KEY)
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      // Ensures the build doesn't crash on minor warnings
      chunkSizeWarningLimit: 1600, 
    },
    server: {
      port: 3000,
    }
  };
});
