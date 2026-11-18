/**
 * Phase 11 (Y1): the integration registry. It reads the manifests in
 * `<userData>/integrations/<id>/integration.json` and keeps their state in advocate.db. No
 * integration ships, and no manifest is code: the registry checks what it declares.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { AdvocateStore } from "../lib/advocate-store/index.ts";
import type { IntegrationRecord } from "../shared/integrations.ts";

const MAX_BYTES = 256 * 1024;

export class Integrations {
  private store: AdvocateStore;
  private root: string;

  constructor(store: AdvocateStore, root: string) {
    this.store = store;
    this.root = root;
  }

  /** Read every manifest folder and keep the record. A broken file is skipped with a log line. */
  sync(): IntegrationRecord[] {
    if (!existsSync(this.root)) return this.store.integrations();
    for (const name of readdirSync(this.root).sort()) {
      const file = path.join(this.root, name, "integration.json");
      try {
        if (!statSync(file).isFile() || statSync(file).size > MAX_BYTES) continue;
        const raw = JSON.parse(readFileSync(file, "utf8"));
        this.store.upsertIntegration(raw, { actor: "system" });
      } catch (e) {
        console.error(`integration ${name}: ${(e as Error).message}`);
      }
    }
    return this.store.integrations();
  }

  list(): IntegrationRecord[] {
    return this.store.integrations();
  }

  /** The advocate adds a manifest file. It is copied nowhere: the registry records what it says. */
  add(file: string): IntegrationRecord {
    const info = statSync(file);
    if (!info.isFile() || info.size > MAX_BYTES) throw new Error("BAD_MANIFEST: a manifest is a file of at most 256 KB");
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return this.store.upsertIntegration(raw, { actor: "advocate" });
  }

  setEnabled(id: string, enabled: boolean): IntegrationRecord {
    return this.store.setIntegrationEnabled(id, enabled, { actor: "advocate" });
  }
}
