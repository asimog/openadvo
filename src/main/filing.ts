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
import { checkCompliance, computeLimitation, delayDays, isPdfA, LIMITATION_RULE, manifestDigest, RULES_VERSION, verifyManifest } from "../lib/filing/index.ts";
import { readParagraphs } from "../lib/drafting/index.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";
import type { DraftKind } from "../shared/records.ts";
import type { FilingFile, FilingSetRecord, FilingState, ManifestApproval, ManifestCheck, MatterDetails } from "../shared/work.ts";

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
    const { deadline, working } = computeLimitation(e.dateStart);
    return w.addLimitation({
      rule: LIMITATION_RULE.id,
      startEventId: e.id,
      startDate: e.dateStart,
      days: LIMITATION_RULE.days,
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
    // P-5 is checked on the set itself, so it cannot block making the set.
    const blockers = results.filter((r) => r.outcome === "defect" && r.rule !== "P-5").map((r) => `${r.rule}: ${r.detail}`);
    return { details, annexures, limitation, compliance: { version: RULES_VERSION, results }, blockers, filingSet };
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
        files.push({ ...(await this.describe(folder, name, r.kind)), revisionId: rev.id, revisionSeq: rev.seq, revisionSha256: rev.sha256 });
        approvals.push({ what: `${r.title}, revision ${rev.seq}`, by: "advocate", at: rev.approvedAt ?? "" });
      }
      for (const a of st.annexures) {
        const name = `${String(++n).padStart(2, "0")} ${a.label}.pdf`;
        await copyFile(store.blobPath(a.sha256), path.join(folder, name));
        files.push(await this.describe(folder, name, "annexure"));
      }
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
