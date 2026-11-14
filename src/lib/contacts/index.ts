/**
 * V5-23: the firm's contacts (clients, opposing parties, advocates, others), one JSON file in the
 * user data folder. A matter's parties link to these by id. Plain library. Spec: docs/specs/v5.md.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const CONTACT_KINDS = ["client", "opposing_party", "advocate", "other"] as const;

export interface Contact {
  id: string;
  name: string;
  kind: (typeof CONTACT_KINDS)[number];
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
}

export class Contacts {
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  list(): Contact[] {
    if (!existsSync(this.file)) return [];
    try {
      const all = JSON.parse(readFileSync(this.file, "utf8")) as Contact[];
      return Array.isArray(all) ? all.sort((a, b) => a.name.localeCompare(b.name)) : [];
    } catch {
      return [];
    }
  }

  private save(all: Contact[]): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2));
    renameSync(tmp, this.file);
  }

  /** The contact with this name (case and spacing ignored), if any. */
  findByName(name: string): Contact | undefined {
    const key = name.replace(/\s+/g, " ").trim().toLowerCase();
    return this.list().find((c) => c.name.replace(/\s+/g, " ").trim().toLowerCase() === key);
  }

  add(input: { name: string; kind: string; email?: string; phone?: string; notes?: string }): Contact {
    const name = input.name.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!name) throw new Error("NAME_REQUIRED: a contact needs a name");
    if (!(CONTACT_KINDS as readonly string[]).includes(input.kind)) throw new Error(`BAD_KIND: one of ${CONTACT_KINDS.join(", ")}`);
    const existing = this.findByName(name);
    if (existing) return existing;
    const c: Contact = { id: randomUUID(), name, kind: input.kind as Contact["kind"], email: (input.email ?? "").trim().slice(0, 200), phone: (input.phone ?? "").trim().slice(0, 60), notes: (input.notes ?? "").trim().slice(0, 2000), createdAt: new Date().toISOString() };
    this.save([...this.list(), c]);
    return c;
  }

  remove(id: string): Contact[] {
    this.save(this.list().filter((c) => c.id !== id));
    return this.list();
  }
}
