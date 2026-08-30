import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // 如需代理 API 请求到后端服务，在此配置
      // "/api": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
  },
});
