import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 开发时固定使用 1420 端口
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "safari15",
    outDir: "dist",
  },
});
