import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "./app.css";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { App } from "./App.tsx";
import { APPEARANCE_EVENT } from "./V3.tsx";
import type { Appearance } from "../../shared/api.ts";

/** V3-4: the appearance follows the advocate's setting. */
function Root() {
  const [mode, setMode] = useState<Appearance>("system");
  useEffect(() => {
    void window.openadvo.getAppearance().then(setMode, () => undefined);
    const on = (e: Event) => setMode((e as CustomEvent<Appearance>).detail);
    window.addEventListener(APPEARANCE_EVENT, on);
    return () => window.removeEventListener(APPEARANCE_EVENT, on);
  }, []);
  return (
    <Theme theme={neutralTheme} mode={mode}>
      <App />
    </Theme>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
