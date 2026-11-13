/**
 * The one module that selects Euro-Office native parts by platform (decision 9).
 * Plain library: no Electron import, no Pi import.
 */
import path from "node:path";

export type PlatformKey = "win-x64" | "win-arm64" | "linux-x64" | "linux-arm64" | "mac-arm64";

export function platformKey(platform: string = process.platform, arch: string = process.arch): PlatformKey {
  if (platform === "win32" && arch === "x64") return "win-x64";
  if (platform === "win32" && arch === "arm64") return "win-arm64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  if (platform === "linux" && arch === "arm64") return "linux-arm64";
  if (platform === "darwin" && arch === "arm64") return "mac-arm64";
  throw new Error(`Euro-Office publishes no release for ${platform}-${arch}`);
}

/** Paths inside one vendored platform folder (`resources/euro-office/<key>`). */
export function euroOfficePaths(root: string, platform: string = process.platform) {
  const exe = platform === "win32" ? "x2t.exe" : "x2t";
  return {
    root,
    editors: path.join(root, "editors"),
    webApps: path.join(root, "editors", "web-apps"),
    sdkjs: path.join(root, "editors", "sdkjs"),
    converter: path.join(root, "converter"),
    x2t: path.join(root, "converter", exe),
    fonts: path.join(root, "fonts"),
    dictionaries: path.join(root, "dictionaries"),
    lock: path.join(root, "vendor.lock.json"),
  };
}
