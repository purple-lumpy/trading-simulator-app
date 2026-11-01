import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnnotationApp } from "./annotations/AnnotationApp";
import { App as ReplayApp } from "./App";

function App() {
  const [mode, setMode] = useState<"annotations" | "replay">("annotations");
  return <>
    <nav className="workspace-modes" aria-label="工作模式">
      <button aria-pressed={mode === "annotations"} onClick={() => setMode("annotations")}>决策标注</button>
      <button aria-pressed={mode === "replay"} onClick={() => setMode("replay")}>原版行情演示</button>
    </nav>
    {mode === "annotations" ? <AnnotationApp /> : <ReplayApp />}
  </>;
}

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
