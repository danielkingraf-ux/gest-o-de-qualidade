import { defineConfig, loadEnv } from '../node_modules/vite/dist/node/index.js';
import react from '../node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath, URL } from 'node:url';

const projectRoot = 'C:/Users/Gustavo Oliveira/Desktop/Projetos/gestão de qualidade';
const projectUrl = 'file:///C:/Users/Gustavo%20Oliveira/Desktop/Projetos/gest%C3%A3o%20de%20qualidade/';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  return {
    root: projectRoot,
    cacheDir: 'C:/Users/Gustavo Oliveira/Desktop/Projetos/gestão de qualidade/.tmp/vite-cache-3002',
    server: {
      port: 3002,
      host: '127.0.0.1',
      strictPort: true,
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('.', projectUrl)),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
