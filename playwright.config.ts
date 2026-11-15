import { defineConfig } from "@playwright/test";

// Each test launches its own application with its own temporary folders, so tests run in parallel.
// Four workers: measured on 2026-11-16, the suite took 4.8 min with one worker and 1.7 min with four.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  workers: 4,
  fullyParallel: true,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
