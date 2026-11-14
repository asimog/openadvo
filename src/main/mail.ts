/**
 * Client email (build-plan step 9; workflow 2 "authorised email account", 3).
 *
 * Two paths, both read only toward the mailbox (deprecated OQ-13: one IMAP-compatible path):
 * - a saved message (.eml) the advocate drops or picks;
 * - the advocate's authorised IMAP mailbox: the INBOX is opened read only, messages are found by
 *   sender, subject and date, and nothing is marked, moved or deleted.
 * Only PDF attachments become sources. Each records its capture provenance: the message id,
 * sender, subject and date. The IMAP password is kept with Electron safeStorage by the caller
 * (decision 9); this module never writes it in clear text.
 * Spec: docs/specs/v0-capture.md.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import PostalMime from "postal-mime";
import { ImapFlow } from "imapflow";
import type { Matters } from "./matters.ts";
import { MatterStoreError } from "../lib/matter-store/index.ts";

export interface MailAccount {
  host: string;
  port: number;
  secure: boolean;
  user: string;
}

export interface MailImportResult {
  messages: number;
  attachments: Array<{ message: string; name: string; outcome: string }>;
}

export class Mail {
  private matters: Matters;

  constructor(matters: Matters) {
    this.matters = matters;
  }

  /** Import the PDF attachments of one raw message. `origin` names where the message came from. */
  private async importMessage(matterId: string, raw: Buffer | string, origin: string, out: MailImportResult): Promise<void> {
    const email = await PostalMime.parse(raw);
    const label = `${email.from?.address ?? "unknown sender"}: ${email.subject ?? "(no subject)"}`;
    out.messages++;
    const dir = path.join(tmpdir(), "openadvo-mail", randomUUID());
    await mkdir(dir, { recursive: true });
    try {
      for (const a of email.attachments) {
        const name = (a.filename || "attachment").replace(/[\\/:*?"<>|]+/g, " ").trim() || "attachment";
        const isPdfType = a.mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf");
        if (!isPdfType) {
          out.attachments.push({ message: label, name, outcome: "skipped: not a PDF" });
          continue;
        }
        const file = path.join(dir, name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`);
        const content = typeof a.content === "string" ? Buffer.from(a.content) : Buffer.from(a.content as ArrayBuffer);
        await writeFile(file, content);
        const [result] = await this.matters.addFiles(matterId, [file], { actor: "advocate" });
        if (result.source) {
          const store = await this.matters.store(matterId);
          store.work.addCapture(result.source.id, "email", email.messageId ? `mid:${email.messageId.replace(/[<>]/g, "")}` : origin, {
            from: email.from?.address ?? null,
            subject: email.subject ?? null,
            date: email.date ?? null,
            attachment: name,
            origin,
          }, { actor: "advocate" });
        }
        out.attachments.push({ message: label, name, outcome: result.outcome === "refused" ? `refused: ${result.reason}` : result.outcome });
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Saved messages (.eml) the advocate chose. */
  async importEmlFiles(matterId: string, paths: string[]): Promise<MailImportResult> {
    const out: MailImportResult = { messages: 0, attachments: [] };
    for (const p of paths) {
      if (!p.toLowerCase().endsWith(".eml")) throw new MatterStoreError("NOT_EML", `${path.basename(p)} is not a saved message (.eml)`);
      await this.importMessage(matterId, await readFile(p), `eml:${path.basename(p)}`, out);
    }
    return out;
  }

  /**
   * The advocate's authorised mailbox, read only. At most `limit` messages that match the filter.
   * Not run against a live mailbox in this build's tests (the v0 spec says so).
   */
  async importFromImap(
    matterId: string,
    account: MailAccount,
    password: string,
    filter: { from?: string; subject?: string; since?: string; limit?: number },
  ): Promise<MailImportResult> {
    if (!filter.from && !filter.subject) throw new MatterStoreError("MAIL_FILTER_REQUIRED", "name the sender or the subject to search for");
    const client = new ImapFlow({ host: account.host, port: account.port, secure: account.secure, auth: { user: account.user, pass: password }, logger: false });
    const out: MailImportResult = { messages: 0, attachments: [] };
    await client.connect();
    try {
      await client.mailboxOpen("INBOX", { readOnly: true });
      const query: Record<string, unknown> = {};
      if (filter.from) query.from = filter.from;
      if (filter.subject) query.subject = filter.subject;
      if (filter.since) query.since = new Date(filter.since);
      const found = await client.search(query, { uid: true });
      const uids = (Array.isArray(found) ? found : []).slice(-(filter.limit ?? 20));
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (msg && msg.source) await this.importMessage(matterId, msg.source, `imap:${account.user}@${account.host}/INBOX/${uid}`, out);
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
    return out;
  }
}
