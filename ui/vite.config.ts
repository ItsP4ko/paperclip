import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      lexical: path.resolve(__dirname, "./node_modules/lexical/Lexical.mjs"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core - changes rarely
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor'
          }
          // TanStack - changes rarely
          if (id.includes('@tanstack/')) {
            return 'tanstack'
          }
          // Heavy editors - only on specific pages
          if (id.includes('@mdxeditor/')) {
            return 'mdx-editor'
          }
          // Charts - only on analytics/dashboard
          if (id.includes('recharts') || id.includes('mermaid')) {
            return 'charts'
          }
          // Radix UI components
          if (id.includes('@radix-ui/') || id.includes('node_modules/radix-ui/')) {
            return 'radix'
          }
          // rest of node_modules
          if (id.includes('node_modules/')) {
            return 'vendor'
          }
        },
      },
    },
  },
});
