import React from "react";
import ReactDOM from "react-dom/client";
import "@/shared/config/reset.css";
import "@/shared/config/theme.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("popup root element missing");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
