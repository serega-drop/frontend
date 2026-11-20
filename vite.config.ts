import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const backend = process.env.API_PROXY_TARGET;
const proxy = backend ? { "/api/v1": { target: backend, changeOrigin: true } } : undefined;

export default defineConfig({
  server: { proxy },
  preview: { proxy: proxy ?? { "/api/v1": { target: "https://backend-yyow.onrender.com", changeOrigin: true } } },
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
