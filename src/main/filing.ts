/**
 * Filing preparation and the filing set (build-plan step 8; workflow 8E, 9E, 10, 11).
 *
 * The advocate records the matter details and annexures, the system computes limitation and
 * the compliance results, and the advocate approves the filing: that action makes the filing
 * set. Each petition document is the approved DOCX revision rendered to PDF/A by the release's
 * own x2t. The manifest lists every file with its SHA-256; the payload hash is the SHA-256 of
 * the manifest, and every filing confirmation is bound to it. Spec: docs/specs/v0-filing.md.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Matters } from "./matters.ts";
import type { ManifestSigner } from "./signing.ts";
import { convertFile, FORMAT_PDF } from "../lib/converter/index.ts";
import { conversionCheck, copyExclusion, disclosureBlockers, disclosureBlocks, extendDeadline, paperBook, protectedNamesIn } from "../lib/filing/v5.ts";
import { generateStructured } from "../lib/drafting/structured.ts";
import { extractText } from "../lib/document-intelligence/index.ts";
import { checkCompliance, computeLimitation, delayDays, isPdfA, LIMITATION_RULE, manifestDigest, RULES_VERSION, verifyManifest } from "../lib/filing/index.ts";
import { readParagraphs } from "../lib/drafting/index.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";
import type { DraftKind } from "../shared/records.ts";
import type { ComplianceResult, FilingFile, FilingSetRecord, FilingState, ManifestApproval, ManifestCheck, MatterDetails } from "../shared/work.ts";

const sha256 = (text: string | Uint8Array) => createHash("sha256").update(text).digest("hex");

const advocate = { actor: "advocate" as const };

/** The petition documents in filing order. */
const REQUIRED: Array<{ kind: DraftKind; title: string }> = [
  { kind: "synopsis", title: "Synopsis" },
  { kind: "list_of_dates", title: "List of Dates" },
  { kind: "petition", title: "Petition" },
  { kind: "questions_of_law", title: "Questions of Law" },
  { kind: "grounds", title: "Grounds" },
];

/** V2-6: the condonation application is required when the confirmed limitation shows a delay today. */
export const CONDONATION = { kind: "condonation" as DraftKind, title: "Application for Condonation of Delay" };

export function required(limitation: { deadline: string; confirmedAt: string | null } | null): Array<{ kind: DraftKind; title: string }> {
  const late = limitation?.confirmedAt && delayDays(limitation.deadline, new Date().toISOString()) > 0;
  return late ? [...REQUIRED, CONDONATION] : REQUIRED;
}

/** The text of a PDF, every line of every page. */
async function pdfText(file: string): Promise<string> {
  const pages = await extractText(new Uint8Array(await readFile(file)));
  return pages.map((p) => p.lines.map((l) => l.text).join("\n")).join("\n");
}

export class Filing {
  private matters: Matters;
  private x2t: string;
  private signer: ManifestSigner | null;

  constructor(matters: Matters, x2t: string, signer: ManifestSigner | null = null) {
    this.matters = matters;
    this.x2t = x2t;
    this.signer = signer;
  }

  private async work(matterId: string) {
    return (await this.matters.store(matterId)).work;
  }

  async setDetails(matterId: string, input: Partial<MatterDetails>): Promise<MatterDetails> {
    if (input.impugnedEventId) {
      const nb = await this.matters.notebook(matterId);
      const e = nb.events.find((x) => x.id === input.impugnedEventId);
      if (!e) throw new MatterStoreError("EVENT_NOT_FOUND", input.impugnedEventId);
      if (e.status !== "confirmed") throw new MatterStoreError("EVENT_NOT_CONFIRMED", "the impugned judgment must be a confirmed Notebook event");
    }
    return (await this.work(matterId)).setDetails(input, advocate);
  }

  async details(matterId: string): Promise<MatterDetails> {
    return (await this.work(matterId)).details();
  }

  async setAnnexures(matterId: string, items: Array<{ sourceId: string; title: string }>) {
    return (await this.work(matterId)).setAnnexures(items, advocate);
  }

  /** Workflow 9E: the system computes limitation from the record (the impugned judgment's date). */
  async computeLimitation(matterId: string) {
    const w = await this.work(matterId);
    const d = w.details();
    if (!d.impugnedEventId) throw new MatterStoreError("IMPUGNED_NOT_RECORDED", "choose the impugned judgment on the Matter tab first");
    const e = (await this.matters.notebook(matterId)).events.find((x) => x.id === d.impugnedEventId);
    if (!e) throw new MatterStoreError("EVENT_NOT_FOUND", d.impugnedEventId);
    const base = computeLimitation(e.dateStart);
    // V5-16: the time taken to obtain the certified copy is excluded, with its working shown.
    const ex = copyExclusion(e.dateStart, d.copyApplied || null, d.copyReceived || null, LIMITATION_RULE.days);
    const deadline = ex.days ? extendDeadline(base.deadline, ex.days) : base.deadline;
    const working = `${base.working} ${ex.working}${ex.days ? ` Last day after the exclusion: ${deadline.split("-").reverse().join(".")}.` : ""}`;
    return w.addLimitation({
      rule: LIMITATION_RULE.id,
      startEventId: e.id,
      startDate: e.dateStart,
      days: LIMITATION_RULE.days + ex.days,
      deadline,
      working: `${working} Source line: ${e.sourceName}, p. ${e.page}, l. ${e.line}.`,
    });
  }

  async confirmLimitation(matterId: string, id: string) {
    return (await this.work(matterId)).confirmLimitation(id, advocate);
  }

  async state(matterId: string): Promise<FilingState> {
    const w = await this.work(matterId);
    const drafts = await this.matters.listDrafts(matterId);
    const rows = [];
    for (const r of required(w.limitation())) {
      const d = drafts.find((x) => x.kind === r.kind);
      const approved = d?.approved ?? null;
      const text = approved ? readParagraphs(await this.matters.revisionBytes(matterId, approved.id)).map((p) => p.text).join("\n") : null;
      rows.push({ kind: r.kind, title: r.title, approvedSeq: approved?.seq ?? null, text });
    }
    const annexures = w.listAnnexures();
    const limitation = w.limitation();
    const filingSet = w.filingSet();
    const details = w.details();
    const results = checkCompliance({
      details,
      drafts: rows,
      annexureLabels: annexures.map((a) => a.label),
      limitation: limitation ? { deadline: limitation.deadline, confirmed: limitation.confirmedAt !== null } : null,
      filingSet: filingSet ? { files: filingSet.manifest.files } : null,
    });
    // V5-15, V5-17: victim identity in an approved draft, the disclosure's blockers, the conversion check.
    const extra = await this.v5Rules(matterId, rows, filingSet);
    results.push(...extra);
    // P-5 and P-8 are checked on the set itself, so they cannot block making the set.
    const blockers = results.filter((r) => r.outcome === "defect" && r.rule !== "P-5" && r.rule !== "P-8").map((r) => `${r.rule}: ${r.detail}`);
    return { details, annexures, limitation, compliance: { version: RULES_VERSION, results }, blockers, filingSet };
  }

  /** The citations the disclosure lists: the newest check of each, with attestations. */
  private async disclosureCitations(matterId: string) {
    const w = await this.work(matterId);
    const latest = new Map<string, { citation: string; outcome: string; attested: boolean; reason: string | null }>();
    const attested = new Set(w.listAttestations().map((a) => a.citation));
    for (const c of w.listCitationChecks()) latest.set(c.citation, { citation: c.citation, outcome: c.outcome, attested: attested.has(c.citation), reason: c.reason });
    return [...latest.values()];
  }

  private async v5Rules(matterId: string, rows: Array<{ title: string; text: string | null }>, filingSet: FilingSetRecord | null): Promise<ComplianceResult[]> {
    const w = await this.work(matterId);
    const d = w.details();
    const out: ComplianceResult[] = [];
    const named = d.victimProtected ? rows.flatMap((r) => (r.text ? protectedNamesIn(r.text, d.victimNames).map((n) => `${r.title} names "${n}"`) : [])) : [];
    out.push({
      rule: "P-6",
      title: "A protected victim is not named in any petition document",
      source: "Workflow section 9E; deprecated spec K rule 14 (masking)",
      outcome: !d.victimProtected ? "not_checked" : named.length ? "defect" : "pass",
      detail: !d.victimProtected ? "The matter is not marked as one where a victim's identity is protected." : named.length ? `${named.join("; ")}.` : `None of the ${d.victimNames.length} protected name(s) appears.`,
    });
    const blocked = disclosureBlockers(await this.disclosureCitations(matterId));
    out.push({
      rule: "P-7",
      title: "The AI-use disclosure can be made: no citation failed or unresolved without an attestation",
      source: "Ruling R-3; deprecated spec C rule 17 and L rule 3",
      outcome: blocked.length ? "defect" : "pass",
      detail: blocked.length ? `${blocked.join("; ")}.` : "Every checked citation is verified or attested.",
    });
    const conv = filingSet?.manifest.files.filter((f) => f.conversion) ?? [];
    out.push({
      rule: "P-8",
      title: "Each petition PDF holds the text of its approved DOCX revision (conversion check)",
      source: "Deprecated spec K rule 18",
      outcome: !filingSet || conv.length === 0 ? "not_checked" : conv.every((f) => f.conversion!.ok) ? "pass" : "defect",
      detail: !filingSet || conv.length === 0 ? "No filing set yet." : conv.filter((f) => !f.conversion!.ok).map((f) => `${f.name}: ${f.conversion!.missing.length} paragraph(s) not found`).join("; ") || `${conv.length} document(s) match their approved revisions.`,
    });
    return out;
  }

  /**
   * Human-only (decision 5; workflow 10): the advocate approves the petition for filing. The
   * approval is refused while any compliance rule shows a defect. It makes the filing set.
   */
  async approveForFiling(matterId: string): Promise<FilingSetRecord> {
    const st = await this.state(matterId);
    if (st.blockers.length > 0) throw new MatterStoreError("FILING_BLOCKED", st.blockers.join(" "));
    const store = await this.matters.store(matterId);
    const drafts = await this.matters.listDrafts(matterId);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const folder = path.join(store.folder, "filing", stamp);
    await mkdir(folder, { recursive: true });
    const files: FilingFile[] = [];
    const approvals: ManifestApproval[] = [];
    const work = path.join(folder, ".work");
    try {
      let n = 0;
      for (const r of required(store.work.limitation())) {
        const d = drafts.find((x) => x.kind === r.kind)!;
        const docxPath = path.join(work, `${r.kind}.docx`);
        await mkdir(work, { recursive: true });
        await writeFile(docxPath, await this.matters.revisionBytes(matterId, d.approved!.id));
        const name = `${String(++n).padStart(2, "0")} ${r.title}.pdf`;
        await convertFile(this.x2t, {
          from: docxPath,
          to: path.join(folder, name),
          format: FORMAT_PDF,
          tempDir: path.join(work, `x2t-${r.kind}`),
          extra: "<m_bIsPDFA>true</m_bIsPDFA>\n",
        });
        const rev = d.approved!;
        const conversion = conversionCheck(readParagraphs(await this.matters.revisionBytes(matterId, rev.id)).map((p) => p.text), await pdfText(path.join(folder, name)));
        files.push({ ...(await this.describe(folder, name, r.kind)), revisionId: rev.id, revisionSeq: rev.seq, revisionSha256: rev.sha256, conversion });
        approvals.push({ what: `${r.title}, revision ${rev.seq}`, by: "advocate", at: rev.approvedAt ?? "" });
      }
      // V5-17: the AI-use disclosure, generated from the records and rendered like the other documents.
      {
        const w = store.work;
        const events = store.listEvents(5000);
        const model = (events.find((e) => e.action === "agent.session_started")?.data?.model as string | undefined) ?? null;
        const assistance = [
          events.some((e) => e.action === "agent.session_started") ? "The agent of the application assisted with research and drafting under the advocate's instructions; every change it proposed was kept or undone by the advocate." : "",
          store.studio.runs().length ? `The argument loop proposed candidate arguments (${store.studio.runs().length} run(s)); the advocate accepted or rejected each.` : "",
          events.some((e) => e.action === "ocr.read") ? "Scanned pages were read by optical character recognition; disputed readings were decided by the advocate." : "",
          "Dates and events were extracted from the record by fixed rules and confirmed by the advocate.",
        ].filter(Boolean);
        const blocks = disclosureBlocks({
          matter: store.matter().title,
          generatedAt: new Date().toISOString(),
          model,
          assistance,
          citations: await this.disclosureCitations(matterId),
          provisions: store.studio.listProvisions().filter((x) => x.status !== "rejected").map((x) => ({ act: x.act, section: x.section, repealed: x.repealed })),
          attestations: w.listAttestations().map((a) => ({ citation: a.citation, reason: a.reason, at: a.at })),
        });
        const g = generateStructured(blocks, { title: "AI-USE DISCLOSURE", generatedAt: new Date().toISOString() });
        const docxPath = path.join(work, "disclosure.docx");
        await mkdir(work, { recursive: true });
        await writeFile(docxPath, g.docx);
        const name = `${String(++n).padStart(2, "0")} AI-use disclosure.pdf`;
        await convertFile(this.x2t, { from: docxPath, to: path.join(folder, name), format: FORMAT_PDF, tempDir: path.join(work, "x2t-disclosure"), extra: "<m_bIsPDFA>true</m_bIsPDFA>\n" });
        const conversion = conversionCheck(readParagraphs(g.docx).map((x) => x.text), await pdfText(path.join(folder, name)));
        files.push({ ...(await this.describe(folder, name, "disclosure")), conversion });
      }
      for (const a of st.annexures) {
        const name = `${String(++n).padStart(2, "0")} ${a.label}.pdf`;
        await copyFile(store.blobPath(a.sha256), path.join(folder, name));
        files.push(await this.describe(folder, name, "annexure"));
      }
      // V5-17: one paper book of every document, with an index page, page numbers and bookmarks.
      const book = await paperBook(store.matter().title, await Promise.all(files.map(async (f) => ({ title: f.name.replace(/^\d+\s+/, "").replace(/\.pdf$/i, ""), bytes: new Uint8Array(await readFile(path.join(folder, f.name))) }))));
      await writeFile(path.join(folder, "Paper book.pdf"), book.bytes);
      files.push(await this.describe(folder, "Paper book.pdf", "paper_book"));
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
    const lim = st.limitation;
    const createdAt = new Date().toISOString();
    if (lim?.confirmedAt) approvals.push({ what: `Limitation, last day ${lim.deadline}`, by: "advocate", at: lim.confirmedAt });
    approvals.push({ what: "Approved for filing", by: "advocate", at: createdAt });
    const body: Record<string, unknown> = {
      matter: store.matter().title,
      createdAt,
      files,
      rules: RULES_VERSION,
      limitation: lim ? `${lim.deadline} (confirmed ${lim.confirmedAt})` : null,
      approvals,
      // V5-1: the head of the matter's event chain when the set was made.
      recordHead: store.verifyChain().head,
    };
    // V2-7: the public key is part of the body; the signature is over the digest.
    if (this.signer) body.publicKey = this.signer.publicKey();
    const digest = manifestDigest(body, sha256);
    const manifest: Record<string, unknown> = { ...body, digest };
    if (this.signer) manifest.signature = this.signer.sign(digest);
    await writeFile(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2));
    return store.work.addFilingSet(manifest, folder, advocate);
  }

  private async describe(folder: string, name: string, role: string): Promise<FilingFile> {
    const bytes = await readFile(path.join(folder, name));
    return { name, role, sha256: sha256(bytes), size: bytes.length, pdfa: isPdfA(bytes) };
  }

  /** V1-8: recompute the manifest digest and every file hash of the newest filing set. */
  async verifyManifest(matterId: string): Promise<ManifestCheck | null> {
    const set = (await this.work(matterId)).filingSet();
    if (!set) return null;
    return verifyManifest(set.manifest as never, sha256, async (name) => {
      try {
        return sha256(await readFile(path.join(set.folder, name)));
      } catch {
        return null;
      }
    });
  }

  /** Human-only (workflow 11): one of the two confirmations, bound to the payload hash. */
  async confirmFiling(matterId: string, filingSetId: string, payloadSha256: string, step: 1 | 2) {
    return (await this.work(matterId)).confirmFiling(filingSetId, payloadSha256, step, advocate);
  }
}
