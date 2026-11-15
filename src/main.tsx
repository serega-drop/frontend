import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { DemoProvider } from "./app/context";
import "./styles/main.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DemoProvider>
      <App />
    </DemoProvider>
  </StrictMode>,
);
