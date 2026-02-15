export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/my-harmonix/', // <--- It must be inside these curly braces
    server: {
      // ... rest of your code
