import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

const config = defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    cloudflare({
      configPath: process.env.TRACKRANK_CONFIG || (command === "serve" ? "wrangler.local.jsonc" : "wrangler.jsonc"),
      viteEnvironment: { name: "ssr" },
    }),

    tanstackStart(),
    viteReact(),
  ],
}));

export default config;
