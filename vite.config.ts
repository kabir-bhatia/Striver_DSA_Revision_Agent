import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serverPort = Number(env.PORT || 8787);
  const vitePort = Number(env.VITE_PORT || 5173);

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: vitePort,
      proxy: {
        "/api": `http://127.0.0.1:${serverPort}`
      }
    },
    build: {
      outDir: "dist/client"
    }
  };
});
