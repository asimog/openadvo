/**
 * M1: the Knowledge Library's plain rules. A file's kind is proposed by its name and extension;
 * the advocate corrects it. The bytes live outside the store. Plain library (decision 6).
 * Spec: docs/specs/advocate-matters-browser.md section 4.
 */
import path from "node:path";
import type { LibraryKind } from "../../shared/stores.ts";

const BY_EXTENSION: Record<string, LibraryKind> = {
  ".pdf": "judgment",
  ".docx": "pleading",
  ".doc": "pleading",
  ".odt": "pleading",
  ".txt": "note",
  ".md": "note",
  ".csv": "note",
  ".xlsx": "note",
  ".pptx": "other",
  ".html": "other",
  ".htm": "other",
  ".eml": "other",
  ".msg": "other",
  ".zip": "other",
};

const WORDS: Array<[RegExp, LibraryKind]> = [
  [/\b(court rules?|high court rules?|supreme court rules?)\b/i, "court_rule"],
  [/\b(judgment|judgement|order|decree)\b/i, "judgment"],
  [/\b(statute|act|section|rule|rules|regulation|code)\b/i, "statute"],
  [/\b(petition|plaint|written statement|pleading|affidavit|application|appeal|revision)\b/i, "pleading"],
  [/\b(template|format|proforma|precedent)\b/i, "template"],
  [/\b(submissions?|written submissions?|arguments?|note of arguments)\b/i, "submission"],
  [/\b(memorandum|memo|opinion|advice)\b/i, "memorandum"],
  [/\b(checklist|list of documents|index)\b/i, "checklist"],
  [/\b(proposition|principle|ratio)\b/i, "proposition"],
  [/\b(note|notes|research)\b/i, "note"],
];

/** The file's proposed kind. The advocate changes it in the library. */
export function classifyLibraryFile(fileName: string): LibraryKind {
  const ext = path.extname(fileName).toLowerCase();
  const words = WORDS.find(([re]) => re.test(path.basename(fileName, ext)))?.[1];
  if (words) return words;
  return BY_EXTENSION[ext] ?? "other";
}

/** The title at rest: the file name without its extension. */
export function libraryTitle(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName)).replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return base || path.basename(fileName);
}

/** The folder of an imported file, relative to the folder the advocate chose. */
export function libraryScope(root: string, file: string): string {
  const rel = path.relative(root, path.dirname(file));
  return rel && rel !== "." ? rel.split(path.sep).join("/").slice(0, 500) : "";
}

/** A supported library file. The library accepts any file; this list only says what is common. */
export const LIBRARY_EXTENSIONS = Object.keys(BY_EXTENSION);
