import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  optimizeDeps: {
    include: ['three'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
