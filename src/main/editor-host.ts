/**
 * Hosts the vendored Euro-Office editors inside the window (decision 18).
 *
 * One custom protocol, `oa-eo://app/`, serves:
 *   /eo/...          the vendored `editors/` folder, unchanged
 *   /eo/sdkjs/common/AllFonts.js   the font list built by x2t into user data
 *   /host/...        our host page, shim and boot script (src/editor-host)
 *   /fonts/<name>    a bundled font; /font?path=...  a font the font list names
 *   /api/info, /api/bin   the one document the main process opened for a view token
 *   /api/log         host page log lines
 * The editor frame reads nothing else.
 */
import { protocol, net } from "electron";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildFontList, normaliseFontPath, type FontList } from "../lib/converter/index.ts";
import { euroOfficePaths } from "../lib/euro-office/platform.ts";

export const EO_SCHEME = "oa-eo";
export const EO_ORIGIN = `${EO_SCHEME}://app`;

/** Must run before the app is ready. */
export function registerEditorScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: EO_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ]);
}

export type DocKind = "pdf" | "word";

interface OpenDoc {
  file: string;
  name: string;
  kind: DocKind;
  readOnly: boolean;
}

export interface EditorHostOptions {
  /** resources/euro-office/<platform> */
  eoRoot: string;
  /** src/editor-host */
  hostDir: string;
  /** user data folder for the font list */
  fontDataDir: string;
  logFile: string;
}

function within(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

function notFound(): Response {
  return new Response("not found", { status: 404 });
}

export class EditorHost {
  private paths: ReturnType<typeof euroOfficePaths>;
  private options: EditorHostOptions;
  private docs = new Map<string, OpenDoc>();
  private fonts: Promise<FontList> | null = null;

  constructor(options: EditorHostOptions) {
    this.options = options;
    this.paths = euroOfficePaths(options.eoRoot);
  }

  async available(): Promise<boolean> {
    return (await isFile(this.paths.x2t)) && (await isFile(path.join(this.paths.webApps, "apps", "api", "documents", "api.js")));
  }

  private fontList(): Promise<FontList> {
    this.fonts ??= buildFontList(this.paths.x2t, this.paths.fonts, this.options.fontDataDir);
    this.fonts.catch(() => (this.fonts = null));
    return this.fonts;
  }

  /** Open a file for viewing. Returns the URL of the host page for a sandboxed frame. */
  async open(file: string, name: string, kind: DocKind, readOnly = true): Promise<string> {
    if (!(await this.available())) throw new Error("Euro-Office is not vendored. Run: npm run vendor");
    await this.fontList();
    const token = randomUUID();
    this.docs.set(token, { file, name, kind, readOnly });
    return `${EO_ORIGIN}/host/host.html?doc=${token}`;
  }

  close(token: string): void {
    this.docs.delete(token);
  }

  register(): void {
    protocol.handle(EO_SCHEME, (request) => this.handle(request));
  }

  private async serveFile(root: string, rel: string): Promise<Response> {
    const target = path.resolve(root, rel);
    if (!within(root, target) || !(await isFile(target))) return notFound();
    return net.fetch(pathToFileURL(target).toString());
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.host !== "app") return notFound();
    const p = decodeURIComponent(url.pathname);
    try {
      if (p === "/eo/sdkjs/common/AllFonts.js") {
        const list = await this.fontList();
        return net.fetch(pathToFileURL(list.allFontsJs).toString());
      }
      if (p.startsWith("/eo/")) return this.serveFile(this.paths.editors, p.slice(4));
      if (p.startsWith("/host/")) return this.serveFile(this.options.hostDir, p.slice(6));
      if (p.startsWith("/fonts/")) return this.serveFile(this.paths.fonts, path.basename(p.slice(7)));
      if (p === "/font") {
        const wanted = url.searchParams.get("path") ?? "";
        const list = await this.fontList();
        if (!list.files.has(normaliseFontPath(wanted))) return notFound();
        return net.fetch(pathToFileURL(wanted.replace(/^\/\?\//, "")).toString());
      }
      if (p === "/api/info" || p === "/api/bin") {
        const doc = this.docs.get(url.searchParams.get("doc") ?? "");
        if (!doc) return notFound();
        if (p === "/api/info") return Response.json({ name: doc.name, kind: doc.kind, readOnly: doc.readOnly });
        return net.fetch(pathToFileURL(doc.file).toString());
      }
      if (p === "/api/log" && request.method === "POST") {
        const line = (await request.text()).slice(0, 2000);
        await mkdir(path.dirname(this.options.logFile), { recursive: true });
        await appendFile(this.options.logFile, `${new Date().toISOString()} ${line}\n`);
        return new Response(null, { status: 204 });
      }
    } catch (e) {
      return new Response(String((e as Error).message), { status: 500 });
    }
    return notFound();
  }
}
