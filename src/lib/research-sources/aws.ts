/**
 * V4-1: Supreme Court and High Court judgments from AWS Open Data (CC BY 4.0), read by HTTP
 * range requests. Plain library. Bucket layout as found on 2026-11-14:
 *   indian-supreme-court-judgments/metadata/parquet/year=YYYY/metadata.parquet
 *   indian-supreme-court-judgments/data/pdf/year=YYYY/english/<path>_EN.pdf
 *   indian-high-court-judgments/metadata/parquet/year=YYYY/court=<code>/bench=<bench>/metadata.parquet
 *   indian-high-court-judgments/data/pdf/year=YYYY/court=<code>/bench=<bench>/<file>.pdf
 */
import { parquetMetadataAsync, parquetReadObjects } from "hyparquet";
import { getText, rangeBuffer } from "./http.ts";

export const SC_BUCKET = "https://indian-supreme-court-judgments.s3.amazonaws.com";
export const HC_BUCKET = "https://indian-high-court-judgments.s3.amazonaws.com";
export const AWS_LICENCE = "AWS Open Data, CC BY 4.0";

/** One judgment's metadata, as the index keeps it. */
export interface JudgmentMeta {
  /** "sc:<path>" or "hc:<pdf file name without .pdf>". */
  id: string;
  court: "sc" | "hc";
  courtName: string;
  title: string;
  petitioner: string;
  respondent: string;
  judge: string;
  /** Reporter citation, e.g. "[2023] 16 S.C.R. 872". */
  citation: string;
  /** Supreme Court neutral citation, e.g. "2023 INSC 1043". */
  insc: string;
  cnr: string;
  /** ISO date. */
  decisionDate: string;
  disposal: string;
  /** The PDF's URL in the bucket. */
  pdfUrl: string;
  year: number;
}

const s = (v: unknown) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();

/** "30-11-2023" or a Date or "2023-02-27T00:00:00.000Z" → "2023-11-30". */
export function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = s(v);
  const dmy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(t);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  return iso ? iso[1] : "";
}

/** Parse S3 ListObjectsV2 XML: common prefixes and keys. */
export function parseListing(xml: string): { prefixes: string[]; keys: string[] } {
  const prefixes = [...xml.matchAll(/<CommonPrefixes><Prefix>([^<]+)<\/Prefix><\/CommonPrefixes>/g)].map((m) => m[1]);
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
  return { prefixes, keys };
}

async function list(bucket: string, prefix: string): Promise<{ prefixes: string[]; keys: string[] }> {
  return parseListing(await getText(`${bucket}/?list-type=2&delimiter=/&prefix=${encodeURIComponent(prefix)}`));
}

async function readRows(url: string, columns: string[]): Promise<Array<Record<string, unknown>>> {
  const file = await rangeBuffer(url);
  const meta = await parquetMetadataAsync(file);
  const have = new Set(meta.schema.map((c) => c.name));
  return (await parquetReadObjects({ file, metadata: meta, columns: columns.filter((c) => have.has(c)) })) as Array<Record<string, unknown>>;
}

const SC_COLUMNS = ["title", "petitioner", "respondent", "judge", "citation", "case_id", "cnr", "decision_date", "disposal_nature", "path", "nc_display"];

export function scRowToMeta(r: Record<string, unknown>, year: number): JudgmentMeta | null {
  const path = s(r.path);
  if (!path) return null;
  return {
    id: `sc:${path}`,
    court: "sc",
    courtName: "Supreme Court of India",
    title: s(r.title),
    petitioner: s(r.petitioner),
    respondent: s(r.respondent),
    judge: s(r.judge),
    citation: s(r.citation),
    insc: s(r.case_id),
    cnr: s(r.cnr),
    decisionDate: isoDate(r.decision_date),
    disposal: s(r.disposal_nature),
    pdfUrl: `${SC_BUCKET}/data/pdf/year=${year}/english/${encodeURIComponent(path)}_EN.pdf`,
    year,
  };
}

/** Every Supreme Court judgment of one year. */
export async function supremeCourtYear(year: number): Promise<JudgmentMeta[]> {
  const rows = await readRows(`${SC_BUCKET}/metadata/parquet/year=${year}/metadata.parquet`, SC_COLUMNS);
  return rows.map((r) => scRowToMeta(r, year)).filter((m): m is JudgmentMeta => m !== null);
}

/** The High Court codes that have judgments in a year ("10_8", …). */
export async function highCourtCodes(year: number): Promise<string[]> {
  const { prefixes } = await list(HC_BUCKET, `metadata/parquet/year=${year}/`);
  return prefixes.map((p) => /court=([^/]+)\//.exec(p)?.[1] ?? "").filter(Boolean);
}

const HC_COLUMNS = ["title", "judge", "cnr", "decision_date", "disposal_nature", "court", "pdf_link"];

export function hcRowToMeta(r: Record<string, unknown>, year: number, code: string, bench: string): JudgmentMeta | null {
  const link = s(r.pdf_link);
  const file = link.split("/").pop() ?? "";
  if (!file.endsWith(".pdf")) return null;
  const title = s(r.title);
  const parties = /\bof\s+(.+?)\s+Vs\.?\s+(.+)$/i.exec(title);
  return {
    id: `hc:${file.slice(0, -4)}`,
    court: "hc",
    courtName: s(r.court),
    title,
    petitioner: parties ? parties[1] : "",
    respondent: parties ? parties[2] : "",
    judge: s(r.judge).replace(/^Judge\s*:\s*/i, ""),
    citation: "",
    insc: "",
    cnr: s(r.cnr),
    decisionDate: isoDate(r.decision_date),
    disposal: s(r.disposal_nature),
    pdfUrl: `${HC_BUCKET}/data/pdf/year=${year}/court=${code}/bench=${bench}/${encodeURIComponent(file)}`,
    year,
  };
}

/** Every judgment of one High Court (all its benches) in one year. */
export async function highCourtYear(year: number, code: string, onBench?: (bench: string, rows: number) => void): Promise<JudgmentMeta[]> {
  const { prefixes } = await list(HC_BUCKET, `metadata/parquet/year=${year}/court=${code}/`);
  const out: JudgmentMeta[] = [];
  for (const p of prefixes) {
    const bench = /bench=([^/]+)\//.exec(p)?.[1];
    if (!bench) continue;
    const rows = await readRows(`${HC_BUCKET}/${p}metadata.parquet`, HC_COLUMNS);
    for (const r of rows) {
      const m = hcRowToMeta(r, year, code, bench);
      if (m) out.push(m);
    }
    onBench?.(bench, rows.length);
  }
  return out;
}

/** The court's name, from one row of its first bench. */
export async function highCourtName(year: number, code: string): Promise<string> {
  const { prefixes } = await list(HC_BUCKET, `metadata/parquet/year=${year}/court=${code}/`);
  if (!prefixes[0]) return code;
  const file = await rangeBuffer(`${HC_BUCKET}/${prefixes[0]}metadata.parquet`);
  const rows = (await parquetReadObjects({ file, columns: ["court"], rowEnd: 1 })) as Array<Record<string, unknown>>;
  return s(rows[0]?.court) || code;
}
