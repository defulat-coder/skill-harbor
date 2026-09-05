import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest picks vitest.config.ts over vite.config.ts, so the dev-server and
// preview options there do not apply here. The tailwind plugin is skipped on
// purpose: unit tests never render real styles and CSS processing is off.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
