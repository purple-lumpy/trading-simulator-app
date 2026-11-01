import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Basic local dev server for the simulator shell. No backend yet — see
// docs/implementation-plan.md for where the replay WebSocket plugs in later.
export default defineConfig({
  plugins: [react()],
  // Relative asset paths instead of Vite's default absolute "/" base -
  // this app has no client-side router (nothing needs a real absolute
  // path to resolve deep links against), so a relative base is what lets
  // the exact same build work unmodified served from a domain root
  // (localhost, a custom domain) AND from a subpath (a GitHub Pages
  // *project* page serves from https://<user>.github.io/<repo>/, not
  // the domain root - see .github/workflows/deploy-pages.yml) without
  // needing to know or hardcode the repo name here.
  base: "./",
  server: {
    port: 5173,
    strictPort: false,
  },
});
