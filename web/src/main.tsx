import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { loadConfig } from "./config";
import { createAppChain } from "./near/client";
import "./styles.css";

// The Ledger wallet chunk expects a Node-style Buffer; define it before any
// wallet module is loaded so that chunk cannot throw "Buffer is not defined".
const globalScope = window as unknown as { Buffer?: typeof Buffer };
globalScope.Buffer ??= Buffer;

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

try {
  const config = loadConfig();
  createRoot(root).render(
    <StrictMode>
      <App chain={createAppChain(config)} config={config} />
    </StrictMode>,
  );
} catch (caught) {
  const message = caught instanceof Error ? caught.message : String(caught);
  createRoot(root).render(
    <>
      <p className="banner" role="status">Testnet demo</p>
      <main>
        <h1>Phylaxtag</h1>
        <p className="alert" role="alert">{message}</p>
      </main>
    </>,
  );
}
