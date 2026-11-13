/**
 * Environment for the Playwright launches. This shell may run Electron itself with
 * these variables set for its own tooling; an inherited value stops the app from
 * starting as Electron (`ELECTRON_RUN_AS_NODE`) or changes the renderer.
 */
export function appEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key === "ELECTRON_RUN_AS_NODE") continue;
    env[key] = value;
  }
  return { ...env, ...extra };
}
