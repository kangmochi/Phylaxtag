import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router";

import type { AppConfig } from "./config";
import type { Chain } from "./near/chain";
import { AssetPage } from "./pages/AssetPage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { HowPage } from "./pages/HowPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { IssuerPage } from "./pages/IssuerPage";
import { OwnerPage } from "./pages/OwnerPage";
import { WorkshopPage } from "./pages/WorkshopPage";
import { Shell } from "./ui";

export function App({ chain, config }: { chain: Chain; config: AppConfig }) {
  const [accountId, setAccountId] = useState<string | null>(chain.accountId());

  useEffect(() => {
    void chain.ready().then(() => setAccountId(chain.accountId()));
    return chain.subscribe(() => setAccountId(chain.accountId()));
  }, [chain]);

  return (
    <BrowserRouter>
      <Shell chain={chain} config={config} accountId={accountId}>
        <Routes>
          <Route path="/" element={<HomePage chain={chain} accountId={accountId} />} />
          <Route path="/asset/:tokenId" element={<AssetPage chain={chain} explorer={config.explorerTxUrl} />} />
          <Route path="/asset/:tokenId/history" element={<HistoryPage chain={chain} />} />
          <Route path="/asset/:tokenId/owner" element={<OwnerPage chain={chain} accountId={accountId} explorer={config.explorerTxUrl} />} />
          <Route path="/issuer" element={<IssuerPage chain={chain} accountId={accountId} contractId={config.contractId} explorer={config.explorerTxUrl} />} />
          <Route path="/workshop" element={<WorkshopPage chain={chain} />} />
          <Route path="/how-it-works" element={<HowPage chain={chain} contractId={config.contractId} />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
