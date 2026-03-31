import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Ducphan-AIconvertPDFtoDoc/',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
