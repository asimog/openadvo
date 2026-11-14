/**
 * V1-5: the record table (v1 spec; after Mike's tabular review). Columns are the advocate's
 * questions; rows are the sources. A cell is stored only when its quote occurs on the named
 * line of that source (whitespace and case normalised). Records reach the store through
 * main/matters.ts (decision 4).
 */
import type { Matters } from "./matters.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";
import type { RecordCell, RecordTable } from "../shared/work.ts";
import type { WriteContext } from "../shared/records.ts";

export function normalise(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}

/** True when the quote, normalised, occurs in the line, normalised. A quote of fewer than 3 characters never does. */
export function quoteOnLine(quote: string, line: string): boolean {
  const q = normalise(quote);
  return q.length >= 3 && normalise(line).includes(q);
}

export class RecordTables {
  private matters: Matters;

  constructor(matters: Matters) {
    this.matters = matters;
  }

  async table(matterId: string): Promise<RecordTable> {
    return (await this.matters.store(matterId)).work.recordTable();
  }

  async addColumn(matterId: string, question: string) {
    return (await this.matters.store(matterId)).work.addRecordColumn(question, { actor: "advocate" });
  }

  async decide(matterId: string, sourceId: string, columnId: string, decision: "confirm" | "clear") {
    return (await this.matters.store(matterId)).work.decideRecordCell(sourceId, columnId, decision, { actor: "advocate" });
  }

  /** The table as text for the agent's list_record_table. */
  async describe(matterId: string): Promise<string> {
    const t = await this.table(matterId);
    const sources = await this.matters.listSources(matterId);
    if (t.columns.length === 0) return "The record table has no columns yet. The advocate adds the questions on the Record table tab.";
    const lines = [`${t.columns.length} column(s), ${sources.length} source(s).`, "Columns:"];
    for (const c of t.columns) lines.push(`- ${c.id}: ${c.question}`);
    lines.push("Cells:");
    for (const s of sources) {
      for (const c of t.columns) {
        const cell = t.cells.find((x) => x.sourceId === s.id && x.columnId === c.id);
        lines.push(`- ${s.name} | ${c.question} | ${cell ? `${cell.answer} [${cell.status}; quote "${cell.quote}", p. ${cell.page}, l. ${cell.line}]` : "empty"}`);
      }
    }
    return lines.join("\n");
  }

  /** The agent's fill_record_cell: resolve the source and the column, then fill. Errors come back as text. */
  async fillByAgent(
    matterId: string,
    input: { source: string; column: string; answer: string; quote: string; page: number; line: number },
    sessionId: string,
    findSource: (sources: Awaited<ReturnType<Matters["listSources"]>>, ref: string) => { id: string; name: string } | string,
  ): Promise<string> {
    const found = findSource(await this.matters.listSources(matterId), input.source);
    if (typeof found === "string") return found;
    const { columns } = await this.table(matterId);
    const col = columns.find((c) => c.id === input.column || c.question.toLowerCase() === input.column.trim().toLowerCase());
    if (!col) return `No column matches "${input.column}". Use list_record_table to see the columns.`;
    try {
      const cell = await this.fill(matterId, { sourceId: found.id, columnId: col.id, answer: input.answer, quote: input.quote, page: input.page, line: input.line }, { actor: "agent", sessionId });
      return `Filled "${col.question}" for ${found.name}: ${cell.answer} (candidate; the advocate confirms it).`;
    } catch (e) {
      return `Not filled: ${(e as Error).message}`;
    }
  }

  /** Fill one cell. Refused with QUOTE_NOT_FOUND unless the quote is on that line of that source. */
  async fill(
    matterId: string,
    input: { sourceId: string; columnId: string; answer: string; quote: string; page: number; line: number },
    ctx: WriteContext,
  ): Promise<RecordCell> {
    const [page] = await this.matters.listPages(matterId, input.sourceId, input.page, input.page);
    const line = page?.lines.find((l) => l.line === input.line);
    if (!line) throw new MatterStoreError("LINE_NOT_FOUND", `the source has no page ${input.page}, line ${input.line}`);
    if (!quoteOnLine(input.quote, line.text)) {
      throw new MatterStoreError("QUOTE_NOT_FOUND", `the quote is not on page ${input.page}, line ${input.line}. That line reads: "${line.text}"`);
    }
    return (await this.matters.store(matterId)).work.fillRecordCell({ ...input, anchorId: line.id }, ctx);
  }
}
