import { defineConfig } from 'vite';

export default defineConfig({
  // Use a relative base path. This makes the built app portable,
  // allowing it to be deployed to any path, including GitHub Pages
  // or a local file server, without configuration changes.
  base: './',
  build: {
    outDir: 'dist',
  },
});