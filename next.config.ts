import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Pacotes que usam binários/bindings nativos — não devem ser
  // processados pelo bundler do Next, só carregados como módulos Node normais.
  serverExternalPackages: [
    "@xenova/transformers",
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "@ffprobe-installer/ffprobe",
    "onnxruntime-node",
    "sharp",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
