import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const marker = "PHYLAX_TEST_WALLET_MARKER";
const enabled = readFileSync(new URL("../src/test-wallet/enabled.ts", import.meta.url), "utf8");
if (!enabled.includes(marker)) {
  console.error("The test wallet source no longer contains its marker, so the bundle check cannot work.");
  process.exit(1);
}

const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".html")) {
      files.push(path);
    }
  }
}
walk(new URL("../dist", import.meta.url).pathname);
const bundled = files.map((path) => readFileSync(path, "utf8")).join("\n");
if (bundled.includes(marker)) {
  console.error("Production bundle contains the test wallet.");
  process.exit(1);
}
if (bundled.includes("fonts.googleapis.com")) {
  console.error("Production bundle loads a remote font.");
  process.exit(1);
}
console.log(`Production bundle is clean (${files.length} files, no test wallet).`);
