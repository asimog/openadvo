/**
 * M1: the Knowledge Library's files. The bytes go to `<userData>/library/blobs/<sha256>`; the
 * metadata is written by `AdvocateStore`, the one writer of `advocate.db` (decision 4). Plain
 * file work only. Spec: docs/specs/advocate-matters-browser.md section 4.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AdvocateStore } from "../lib/advocate-store/index.ts";
import { classifyLibraryFile, libraryScope, libraryTitle } from "../lib/library/index.ts";
import { libraryRoles, topPrecedents } from "../lib/library/positions.ts";
import type { LibraryRoleGroup, PrecedentOffer, PrecedentSubject } from "../shared/knowledge.ts";
import type { LibraryItem } from "../shared/stores.ts";

export interface LibraryImportResult {
  added: number;
  duplicates: number;
  refused: string[];
  items: LibraryItem[];
}

export class Library {
  private store: AdvocateStore;
  private root: string;

  constructor(store: AdvocateStore, root: string) {
    this.store = store;
    this.root = root;
  }

  private blob(sha256: string): string {
    return path.join(this.root, "blobs", sha256);
  }

  list(filter: { q?: string; kind?: string; status?: string } = {}): LibraryItem[] {
    return this.store.library(filter);
  }

  /** M2: the library grouped by role: positions, playbooks, styles, common errors, precedents. */
  roles(): LibraryRoleGroup[] {
    return libraryRoles(this.store.library());
  }

  /** M2: the approved precedents for a drafting task, best first. */
  precedents(subject: PrecedentSubject, n = 3): PrecedentOffer[] {
    return topPrecedents(this.store.library(), subject, n);
  }

  /** The file behind one item, or null. */
  fileFor(id: string): { item: LibraryItem; path: string } | null {
    const item = this.store.library().find((x) => x.id === id);
    if (!item) return null;
    return { item, path: this.blob(item.sha256) };
  }

  async importFiles(files: string[], root?: string): Promise<LibraryImportResult> {
    const out: LibraryImportResult = { added: 0, duplicates: 0, refused: [], items: [] };
    const author = this.store.profile().name ?? "";
    for (const file of files.slice(0, 1000)) {
      try {
        const info = await stat(file);
        if (!info.isFile()) {
          out.refused.push(`${path.basename(file)}: not a file`);
          continue;
        }
        if (info.size > 200 * 1024 * 1024) {
          out.refused.push(`${path.basename(file)}: larger than 200 MB`);
          continue;
        }
        const bytes = await readFile(file);
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        if (this.store.libraryBySha(sha256)) {
          out.duplicates++;
          continue;
        }
        await mkdir(path.dirname(this.blob(sha256)), { recursive: true });
        await writeFile(this.blob(sha256), bytes);
        const item = this.store.addLibraryItem(
          {
            title: libraryTitle(file),
            kind: classifyLibraryFile(file),
            status: "unreviewed",
            author,
            itemDate: new Date(info.mtimeMs).toISOString().slice(0, 10),
            matterId: null,
            court: "",
            scope: root ? libraryScope(root, file) : "",
            sourceName: path.basename(file),
            sha256,
            size: info.size,
            notes: "",
            tags: [],
          },
          { actor: "advocate" },
        );
        out.added++;
        out.items.push(item);
      } catch (e) {
        out.refused.push(`${path.basename(file)}: ${(e as Error).message}`);
      }
    }
    return out;
  }

  /** Every file under a folder, recursively, without symbolic links. */
  async importFolder(root: string): Promise<LibraryImportResult> {
    const files: string[] = [];
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 12 || files.length >= 1000) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full, depth + 1);
        else if (entry.isFile()) files.push(full);
        if (files.length >= 1000) break;
      }
    };
    await walk(root, 0);
    return this.importFiles(files, root);
  }
}
