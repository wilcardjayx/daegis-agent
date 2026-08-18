import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// GitHub Pages project hosting: the site lives at https://wilcardjayx.github.io/daegis-agent/
// so every asset URL must be prefixed with /daegis-agent/. The production build is
// emitted into the repo's docs/ directory, which Pages serves from master:/docs.
export default defineConfig({
  base: '/daegis-agent/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
});
