import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./ui/tokens.css";
import "./ui/base.css";
import { registerSW } from "virtual:pwa-register";

// Reload once when a new version has been deployed, so nobody keeps running last deploy's cached app.
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
