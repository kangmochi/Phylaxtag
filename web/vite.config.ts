import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const testWallet = process.env.VITE_TEST_WALLET === "1";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "phylaxtag-test-wallet",
      enforce: "pre",
      resolveId(source) {
        if (source === "phylaxtag-test-wallet") {
          return path.join(root, testWallet ? "src/test-wallet/enabled.ts" : "src/test-wallet/disabled.ts");
        }
        return undefined;
      },
    },
    {
      name: "strip-remote-fonts",
      transform(code, id) {
        if (id.includes("modal-ui") && id.endsWith(".css")) {
          return code.replace(
            /@import\s+url\(["']https:\/\/fonts\.googleapis\.com[^"']+["']\);/g,
            "/* Remote font removed. This demo loads no fonts from a CDN. */",
          );
        }
        return undefined;
      },
    },
  ],
  resolve: {
    alias: {
      buffer: path.join(root, "node_modules/buffer/index.js"),
    },
  },
  server: {
    host: "127.0.0.1",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
