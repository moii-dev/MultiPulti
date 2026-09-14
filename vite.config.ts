import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        // Visual Studio держит файлы индекса открытыми, из-за чего chokidar
        // на Windows завершает dev-сервер с EBUSY.
        ignored: ['**/.vs/**'],
      },
    },
  };
});
