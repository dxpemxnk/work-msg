import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
  preview: { host: '127.0.0.1', port: 3000, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          ui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          application: ['@reduxjs/toolkit', 'formik', 'yup', 'socket.io-client'],
        },
      },
    },
  },
});
