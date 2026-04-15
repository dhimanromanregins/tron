import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WalletProvider } from "@tronweb3/tronwallet-adapter-react-hooks";
import { binanceAdapter, wcAdapter } from "./adapter";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <WalletProvider
        adapters={[binanceAdapter, wcAdapter]}
        autoConnect={false}
        onError={(err) => console.error("[Wallet Error]", err)}
      >
        <App />
      </WalletProvider>
    </BrowserRouter>
  </React.StrictMode>
);
