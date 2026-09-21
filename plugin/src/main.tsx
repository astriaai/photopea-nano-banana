import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { bootstrap } from "./app/bootstrap";
import { ControllerProvider } from "./app/hooks";
import "./styles/styles.css";

async function start() {
  const status = document.getElementById("boot-status");
  if (status) status.textContent = "Connecting to Photopea…";
  const { controller } = await bootstrap();
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ControllerProvider value={controller}>
        <App />
      </ControllerProvider>
    </React.StrictMode>
  );
  void controller.boot();
}

void start();
