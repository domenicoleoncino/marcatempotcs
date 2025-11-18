//src/index.js
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// single root
const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container not found in public/index.html");
}
const root = createRoot(container);
root.render(
  //<React.StrictMode>
    <App />
  //</React.StrictMode>
);

// Dev: unregister any service workers to avoid DOM interference
if (process.env.NODE_ENV === "development" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(()=>{});
}