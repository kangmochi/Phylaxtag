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
      // The EVM wallet stack (WalletConnect / web3modal) ships a Google Fonts
      // URL in its CSS and in one of its JS constants. This app loads no fonts
      // from a CDN, so the CSS import is dropped and the JS URL is pointed at an
      // empty data: URL, which keeps the modal code working without a request.
      name: "strip-remote-fonts",
      transform(code, id) {
        const isModalCss = id.includes("modal-ui") && id.endsWith(".css");
        const isDependencyJs = id.includes("node_modules") && /\.(js|mjs)$/.test(id);
        if (isModalCss) {
          return code.replace(
            /@import\s+url\(["']https:\/\/fonts\.googleapis\.com[^"']+["']\);/g,
            "/* Remote font removed. This demo loads no fonts from a CDN. */",
          );
        }
        if (isDependencyJs && code.includes("fonts.googleapis.com")) {
          return code.replaceAll(
            "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
            "data:text/css,",
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
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
