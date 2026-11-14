/** V2-2 to V2-8: plain libraries and the matter store. Spec: docs/specs/v2.md. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyDocument } from "../../src/lib/document-intelligence/classify.ts";
import { overlap, possibleDuplicates } from "../../src/lib/document-intelligence/similar.ts";
import { extractRelative } from "../../src/lib/notebook/index.ts";
import { condonationBlocks, petitionBlocks } from "../../src/lib/drafting/structured.ts";
import { delayDays, manifestDigest, verifyManifest } from "../../src/lib/filing/index.ts";
import { MatterStore } from "../../src/lib/matter-store/index.ts";

const sha = (t: string | Uint8Array) => createHash("sha256").update(t).digest("hex");

test("V2-2: the heading decides the type; the matched words are named", () => {
  assert.equal(classifyDocument("IN THE HIGH COURT OF DELHI\nJUDGMENT\nThe petition is dismissed.").type, "judgment");
  assert.equal(classifyDocument("FIRST INFORMATION REPORT\n(Under Section 154 Cr.P.C.)").type, "fir");
  assert.equal(classifyDocument("AFFIDAVIT\nI, the deponent above named, solemnly affirm").type, "affidavit");
  assert.equal(classifyDocument("Dear Sir,\nPlease find enclosed.\nYours faithfully").type, "letter");
  assert.equal(classifyDocument("Shopping list: milk, bread").type, "other");
  assert.match(classifyDocument("ORDER\nCoram: Hon'ble Justice X").matched, /"ORDER" in the heading/);
});

const long = (seed: string) => Array.from({ length: 80 }, (_, i) => `${seed} word${i} line ${i % 7}`).join(" ");

test("V2-3: near-identical texts are paired; short or different texts are not", () => {
  const a = long("the court");
  const b = `${a} certified copy`;
  assert.ok((overlap(a, b) ?? 0) >= 0.9);
  assert.equal(overlap("too short", "too short"), null);
  assert.ok((overlap(a, long("another matter")) ?? 1) < 0.5);
  assert.deepEqual(
    possibleDuplicates([{ id: "x", text: a }, { id: "y", text: b }, { id: "z", text: long("other") }]).map((p) => [p.a, p.b]),
    [["x", "y"]],
  );
});

test("V2-4: relative dates use the header date or the last explicit date, and are inferred", () => {
  const line = (page: number, n: number, text: string) => ({ anchorId: `a${page}-${n}`, sourceId: "s", page, line: n, text, reading: "text_layer" as const });
  const lines = [
    line(1, 1, "Dated 10.01.2024"),
    line(1, 2, "The accused was arrested on 12.03.2023."),
    line(1, 3, "He was produced before the Magistrate the next day."),
    line(1, 4, "Thereafter the bail application was moved."),
    line(2, 1, "The complainant came to the station yesterday."),
    line(2, 2, "This day the matter is listed."),
  ];
  const ev = extractRelative(lines);
  assert.deepEqual(ev.map((e) => [e.anchorId, e.dateStart, e.dateType]), [
    ["a1-3", "2023-03-13", "inferred"],
    ["a2-1", "2024-01-09", "inferred"],
    ["a2-2", "2024-01-10", "inferred"],
  ]);
  assert.match(ev[0].dateText, /"the next day" from 12\.03\.2023 \(earlier date, page 1 line 2\)/);
  assert.match(ev[1].dateText, /header date/);
  // With no header date, "today" gives nothing.
  assert.equal(extractRelative([line(1, 1, "The order is passed today.")]).length, 0);
});

test("V2-6: interim relief adds a section; the condonation application has a marker for the reasons", () => {
  const base = { petitioner: "A", respondent: "B", court: "High Court of Delhi", caseNumber: "WP 1/2024", impugnedDate: "2024-03-12", impugnedEventId: "e1", questions: ["Q"], grounds: ["G"], annexures: [], year: 2024 };
  assert.ok(!petitionBlocks(base).some((b) => b.text.includes("INTERIM")));
  const withRelief = petitionBlocks({ ...base, interimRelief: "stay the operation of the impugned judgment" }).map((b) => b.text);
  assert.ok(withRelief.includes("7. PRAYER FOR INTERIM RELIEF"));
  assert.ok(withRelief.includes("(a) stay the operation of the impugned judgment; and"));
  assert.ok(withRelief.indexOf("7. PRAYER FOR INTERIM RELIEF") < withRelief.findIndex((t) => t.startsWith("FILED BY")));
  const c = condonationBlocks({ ...base, deadline: "2024-06-10", delayDays: 25, asOf: "2024-07-05" }).map((b) => b.text);
  assert.ok(c.some((t) => t.includes("the last day of limitation was 10.06.2024. On 05.07.2024 the delay is 25 day(s).")));
  assert.ok(c.some((t) => t.includes("[TO BE COMPLETED: the reasons for the delay]")));
  assert.equal(delayDays("2024-06-10", "2024-07-05T10:00:00Z"), 25);
  assert.equal(delayDays("2024-06-10", "2024-06-10"), 0);
  assert.equal(delayDays("2024-06-10", "2024-05-01"), 0);
});

test("V2-7: a signed manifest verifies; a changed body or signature fails; an unsigned one is 'not signed'", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const body: Record<string, unknown> = { matter: "M", files: [{ name: "a.pdf", sha256: sha("A") }], publicKey: publicKey.export({ type: "spki", format: "pem" }).toString() };
  const digest = manifestDigest(body, sha);
  const signed = { ...body, digest, signature: sign(null, Buffer.from(digest), privateKey).toString("base64") } as never;
  const read = async () => sha("A");
  const ok = await verifyManifest(signed, sha, read);
  assert.equal(ok.ok, true);
  assert.equal(ok.signature, "valid");
  const forged = { ...(signed as object), signature: Buffer.alloc(64).toString("base64") } as never;
  assert.equal((await verifyManifest(forged, sha, read)).signature, "invalid");
  assert.equal((await verifyManifest(forged, sha, read)).ok, false);
  const plain: Record<string, unknown> = { matter: "M", files: [{ name: "a.pdf", sha256: sha("A") }] };
  const v1 = await verifyManifest({ ...plain, digest: manifestDigest(plain, sha) } as never, sha, read);
  assert.equal(v1.ok, true);
  assert.equal(v1.signature, "not_signed");
});

test("V2-2, V2-3, V2-5, V2-8 in the matter store: proposals, human decisions, events", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "oa-v2-"));
  const adv = { actor: "advocate" as const };
  try {
    const store = await MatterStore.create(path.join(root, "m"), "V2", adv);
    const fa = path.join(root, "a.txt");
    const fb = path.join(root, "b.txt");
    await writeFile(fa, "one");
    await writeFile(fb, "two");
    const a = (await store.addFile(fa, adv)).source!;
    const b = (await store.addFile(fb, adv)).source!;
    const w = store.work;
    // Type: a proposal once, then the advocate's choice.
    assert.equal(w.proposeSourceType(a.id, "order", '"ORDER" in the heading', "type-rules-v1"), true);
    assert.equal(w.proposeSourceType(a.id, "judgment", "x", "type-rules-v1"), false);
    assert.deepEqual(store.getSource(a.id)?.docType, { type: "order", status: "candidate", matched: '"ORDER" in the heading' });
    assert.throws(() => w.setSourceType(a.id, "judgment", { actor: "agent" }), /HUMAN_ONLY/);
    w.setSourceType(a.id, "judgment", adv);
    assert.deepEqual(store.getSource(a.id)?.docType?.status, "confirmed");
    assert.equal(store.getSource(a.id)?.docType?.type, "judgment");
    // Duplicates: one review item per pair, decided by the advocate, nothing merged.
    assert.equal(w.recordDuplicates([{ a: b.id, b: a.id, overlap: 0.95 }]), 1);
    assert.equal(w.recordDuplicates([{ a: a.id, b: b.id, overlap: 0.95 }]), 0);
    const item = store.listReviewItems().find((r) => r.kind === "possible_duplicate")!;
    assert.match(item.detail, /95% of their text in common/);
    assert.throws(() => w.decideDuplicate(item.id, "same", { actor: "agent" }), /HUMAN_ONLY/);
    assert.equal(w.decideDuplicate(item.id, "same", adv).decision, "same");
    assert.equal(store.listReviewItems().find((r) => r.id === item.id)?.status, "resolved");
    assert.equal(store.listSources().length, 2);
    // List of Dates rows: only confirmed events.
    assert.throws(() => w.setLodRows(["ev:none"], adv), /EVENT_NOT_CONFIRMED/);
    assert.deepEqual(w.setLodRows([], adv), []);
    // Memory proposals: the agent proposes, the advocate decides once.
    assert.throws(() => w.proposeMemory("x", "y", adv), /AGENT_ONLY/);
    const m = w.proposeMemory("Client wants no interim relief.", "said in chat", { actor: "agent" });
    assert.throws(() => w.decideMemoryProposal(m.id, true, { actor: "agent" }), /HUMAN_ONLY/);
    assert.equal(w.decideMemoryProposal(m.id, true, adv).status, "accepted");
    assert.throws(() => w.decideMemoryProposal(m.id, false, adv), /ALREADY_DECIDED/);
    // Interim relief in the matter details.
    assert.equal(w.setDetails({ interimRelief: "stay" }, adv).interimRelief, "stay");
    const actions = store.listEvents().map((e) => e.action);
    for (const a of ["source.type_proposed", "source.type_set", "duplicate.decided", "memory.proposed", "memory.proposal_accepted"]) assert.ok(actions.includes(a), a);
    store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
