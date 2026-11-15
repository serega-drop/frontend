import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("catalog-data.json")) return "catalog";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
});
