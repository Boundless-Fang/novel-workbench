import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { useChatStore } from "../store";

(window as any).__useChatStore = useChatStore;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="app-phone-frame">
      <App />
    </div>
  </React.StrictMode>,
);
