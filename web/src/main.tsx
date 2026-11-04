import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { loadConfig } from "./config";
import { createAppChain } from "./near/client";
import "./styles.css";

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
