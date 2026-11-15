/**
 * C2: a matter the agent proposes in the chat. It is a record in user data until the advocate
 * creates or dismisses it; the agent never creates a matter. Spec: docs/specs/advocate-matters-browser.md.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { MatterProposal } from "../shared/work.ts";

export class MatterProposals {
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  list(): MatterProposal[] {
    if (!existsSync(this.file)) return [];
    try {
      const all = JSON.parse(readFileSync(this.file, "utf8")) as MatterProposal[];
      return Array.isArray(all) ? all : [];
    } catch {
      return [];
    }
  }

  private save(all: MatterProposal[]): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2));
    renameSync(tmp, this.file);
  }

  add(input: Omit<MatterProposal, "id" | "status" | "createdAt">): MatterProposal {
    const title = input.title.trim().slice(0, 240);
    if (!title) throw new Error("TITLE_REQUIRED: a proposed matter needs a title");
    const p: MatterProposal = { ...input, id: randomUUID(), title, status: "open", createdAt: new Date().toISOString() };
    this.save([...this.list(), p]);
    return p;
  }

  get(id: string): MatterProposal | undefined {
    return this.list().find((p) => p.id === id);
  }

  setStatus(id: string, status: MatterProposal["status"]): MatterProposal {
    const list = this.list();
    const p = list.find((x) => x.id === id);
    if (!p) throw new Error(`NOT_FOUND: no matter proposal ${id}`);
    p.status = status;
    this.save(list);
    return p;
  }
}
