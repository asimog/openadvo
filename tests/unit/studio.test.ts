/** V4-3: the argument loop, with a scripted model. Spec: docs/specs/v4.md. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aliases,
  eloUpdate,
  extractJson,
  groundedStatus,
  parseCandidates,
  pickCells,
  runLoop,
  validate,
  type ArchivedArgument,
  type LoopContext,
} from "../../src/lib/studio/index.ts";

const ctx: LoopContext = {
  matter: "Ram v. State",
  issue: "Whether bail was refused without considering the period of custody?",
  events: [
    { id: "ev:a", date: "12.03.2024", text: "The High Court refused regular bail on 12.03.2024 without reference to the period of custody.", source: "order.pdf, p. 1, l. 4" },
    { id: "ev:b", date: "01.01.2020", text: "The petitioner has been in custody since 01.01.2020.", source: "custody.pdf, p. 1, l. 2" },
  ],
  authorities: [
    { id: "au:1", citation: "2023 INSC 1043", parties: "X v. Y", paragraph: "12", proposition: "Long custody is a ground for bail.", role: "supporting", citationFailed: false },
    { id: "au:2", citation: "2019 INSC 9999", parties: "P v. Q", paragraph: "4", proposition: "Bad citation.", role: "supporting", citationFailed: true },
  ],
  provisions: [
    { id: "pr:1", act: "The Bharatiya Nagarik Suraksha Sanhita, 2023", section: "483", title: "Special powers regarding bail", text: "", repealed: false },
    { id: "pr:2", act: "The Code of Criminal Procedure, 1973", section: "439", title: "Special powers regarding bail", text: "", repealed: true },
  ],
};

const good = {
  claim: "The High Court erred in refusing bail without weighing four years of custody.",
  reasoning: "E2 shows custody since 2020 and E1 shows the order ignored it; A1 holds long custody is a ground for bail under P1.",
  events: [{ ref: "E1", quote: "without reference to the period of custody" }, { ref: "e2", quote: "in custody since 01.01.2020" }],
  authorities: [{ ref: "A1", paragraph: "12" }],
  provisions: ["P1"],
};

test("extractJson finds the JSON in fenced or chatty answers", () => {
  assert.deepEqual(extractJson('Here:\n```json\n{"a":[1,2]}\n```\nDone.'), { a: [1, 2] });
  assert.deepEqual(extractJson("[1]"), [1]);
  assert.equal(extractJson("no json"), null);
});

test("the staged validators reject with typed reasons and map aliases to ids", () => {
  const al = aliases(ctx);
  const cell = { ground: "procedural" as const, stance: "petitioner" as const };
  const parse = (o: object) => parseCandidates(JSON.stringify({ arguments: [o] }), cell)!.candidates[0];
  const ok = validate(parse(good), al, []);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.value.events.map((e) => e.id), ["ev:a", "ev:b"]);
    assert.deepEqual(ok.value.authorities, [{ id: "au:1", paragraph: "12" }]);
    assert.deepEqual(ok.value.provisions, ["pr:1"]);
    assert.match(ok.value.reasoning, /\[record 01\.01\.2020\].*\[2023 INSC 1043\].*\[The Bharatiya Nagarik Suraksha Sanhita, 2023 s\. 483\]/);
  }
  const reason = (o: object, archived: string[] = []) => {
    const v = validate(parse(o), al, archived);
    return v.ok ? "ok" : v.reason;
  };
  assert.equal(reason({ ...good, claim: "short" }), "SCHEMA");
  assert.equal(reason({ ...good, events: [{ ref: "E9", quote: "x y z w" }] }), "UNGROUNDED_FACT");
  assert.equal(reason({ ...good, events: [{ ref: "E1", quote: "bail was granted at once" }] }), "UNGROUNDED_FACT");
  assert.equal(reason({ ...good, authorities: [{ ref: "A7", paragraph: "1" }] }), "UNKNOWN_AUTHORITY");
  assert.equal(reason({ ...good, authorities: [{ ref: "A2", paragraph: "4" }] }), "FAILED_CITATION");
  assert.equal(reason({ ...good, provisions: ["P2"] }), "REPEALED_PROVISION");
  assert.equal(reason({ ...good, events: [], authorities: [], provisions: [] }), "NO_GROUNDING");
  if (ok.ok) assert.equal(reason(good, [`${ok.value.claim} ${ok.value.reasoning}`]), "DUPLICATE");
});

test("empty entries are no citation; aliases in a claim become labels", () => {
  const al = aliases(ctx);
  const c = parseCandidates(JSON.stringify({ arguments: [{ ...good, claim: "Under P1 and A1 the order in E1 is wrong.", provisions: [""], authorities: [{ ref: "", paragraph: "" }, { ref: "A1", paragraph: "12" }] }] }), { ground: "statutory", stance: "petitioner" })!.candidates[0];
  assert.deepEqual(c.provisions, []);
  assert.equal(c.authorities.length, 1);
  const v = validate(c, al, []);
  assert.equal(v.ok, true);
  if (v.ok) assert.equal(v.value.claim, "Under [The Bharatiya Nagarik Suraksha Sanhita, 2023 s. 483] and [2023 INSC 1043] the order in [record 12.03.2024] is wrong.");
});

test("grounded semantics: an unattacked argument is in; its attacker's attacker reinstates it; a cycle is undecided", () => {
  const s = groundedStatus([
    { id: "a", attacks: null, status: "candidate" },
    { id: "b", attacks: "a", status: "candidate" },
    { id: "c", attacks: "b", status: "accepted" },
    { id: "x", attacks: "y", status: "candidate" },
    { id: "y", attacks: "x", status: "candidate" },
    { id: "z", attacks: "a", status: "rejected" },
  ]);
  assert.equal(s.get("c"), "in");
  assert.equal(s.get("b"), "out");
  assert.equal(s.get("a"), "in");
  assert.equal(s.get("x"), "undecided");
  assert.equal(s.has("z"), false);
});

test("diversity: empty cells are chosen first; Elo moves toward the winner", () => {
  const counts = new Map([["jurisdictional/petitioner", 3], ["procedural/petitioner", 1]]);
  const cells = pickCells(counts, 3);
  assert.ok(!cells.some((c) => c.ground === "jurisdictional"));
  const [w, l] = eloUpdate(1000, 1000);
  assert.ok(w > 1000 && l < 1000 && Math.abs(w + l - 2000) < 1e-9);
});

test("the loop: generate, validate, critique, attack and compare, with typed rejection memory", async () => {
  const calls: string[] = [];
  const complete = async (_s: string, user: string, label: string) => {
    calls.push(label);
    if (label.includes("-gen")) {
      if (label.includes("gen1")) return JSON.stringify({ arguments: [good, { ...good, claim: "A fact not in the record proves the order wrong.", events: [{ ref: "E1", quote: "bail was granted" }] }] });
      if (label.includes("gen2")) return "I cannot answer in JSON.";
      return JSON.stringify({ arguments: [{ ...good, claim: "The refusal ignored the statutory power to grant bail after long custody.", reasoning: "P1 empowers the court; A1 applies it to long custody such as in E2 since the date recorded.", events: [{ ref: "E2", quote: "since 01.01.2020" }] }] });
    }
    if (label.includes("-critic")) return '{"questions":["Was the delay attributable to the accused?"]}';
    if (label.includes("-opponent")) return JSON.stringify({ arguments: [{ kind: "undercut", claim: "Custody length alone does not entitle the accused to bail here.", reasoning: "A1 at para 12 makes custody one factor among others, and E1 records the order itself.", events: [{ ref: "E1", quote: "refused regular bail" }], authorities: [{ ref: "A1", paragraph: "12" }], provisions: [] }] });
    if (label.includes("-judge")) return '{"better":"A"}';
    return "";
  };
  const archive: ArchivedArgument[] = [];
  const rejections: Array<{ cell: string; reason: string; detail: string }> = [];
  const questions = new Map<string, string[]>();
  let n = 0;
  const stats = await runLoop({
    complete,
    context: ctx,
    rounds: 1,
    generators: 3,
    archive: [],
    rejections: () => [],
    addArgument: (_round, v, attack) => {
      const a: ArchivedArgument = { id: `arg${++n}`, ground: v.ground, stance: v.stance, claim: v.claim, reasoning: v.reasoning, elo: 1000, attacks: attack?.target ?? null };
      archive.push(a);
      return a;
    },
    addRejection: (_r, cell, reason, detail) => rejections.push({ cell: `${cell.ground}/${cell.stance}`, reason, detail }),
    setQuestions: (id, q) => questions.set(id, q),
    setElo: () => undefined,
  });
  const main = archive.filter((a) => !a.attacks);
  assert.equal(main.length, 2, "two grounded arguments survive");
  assert.deepEqual(rejections.map((r) => r.reason).sort(), ["DUPLICATE", "SCHEMA", "UNGROUNDED_FACT"].sort());
  assert.equal(stats.attacks, 1, "the second identical attack is a duplicate of the first");
  assert.ok(archive.some((a) => a.attacks === main[0].id));
  assert.deepEqual(questions.get(main[0].id), ["Was the delay attributable to the accused?"]);
  assert.ok(stats.calls >= 3 + 2 * 2);
  assert.ok(calls.every((c) => !/predict|probab/i.test(c)));
});

test("round 2 replies to the standing attacks; a grounded reply defeats its attack and the argument is in again", async () => {
  const ids: Array<{ id: string; attacks: string | null; status: string }> = [];
  let n = 0;
  const complete = async (_s: string, user: string, label: string) => {
    if (label.includes("-gen")) return label.includes("gen1") ? JSON.stringify({ arguments: [good] }) : "{}";
    if (label.includes("-opponent")) return JSON.stringify({ arguments: [{ kind: "undercut", claim: "The order's silence on custody does not show custody was ignored.", reasoning: "E1 records only that the order did not refer to custody.", events: [{ ref: "E1", quote: "without reference to the period of custody" }], authorities: [], provisions: [] }] });
    if (label.includes("-reply")) {
      assert.match(user, /ARGUMENT OF THE RESPONDENT/);
      return JSON.stringify({ arguments: [{ kind: "rebut", claim: "Four years of custody since 2020 had to be weighed expressly before refusing bail.", reasoning: "E2 shows custody since 01.01.2020 and A1 at para 12 makes long custody a ground for bail.", events: [{ ref: "E2", quote: "in custody since 01.01.2020" }], authorities: [{ ref: "A1", paragraph: "12" }], provisions: [] }] });
    }
    return label.includes("-critic") ? '{"questions":[]}' : '{"better":"A"}';
  };
  const stats = await runLoop({
    complete,
    context: ctx,
    rounds: 2,
    generators: 1,
    archive: [],
    rejections: () => [],
    addArgument: (_r, v, attack) => {
      const a = { id: `x${++n}`, ground: v.ground, stance: v.stance, claim: v.claim, reasoning: v.reasoning, elo: 1000, attacks: attack?.target ?? null };
      ids.push({ id: a.id, attacks: a.attacks, status: "candidate" });
      return a;
    },
    addRejection: () => undefined,
    setQuestions: () => undefined,
    setElo: () => undefined,
  });
  assert.equal(stats.replies, 1);
  const status = groundedStatus(ids);
  const main = ids.find((x) => !x.attacks)!;
  const attack = ids.find((x) => x.attacks === main.id)!;
  const reply = ids.find((x) => x.attacks === attack.id)!;
  assert.deepEqual([status.get(reply.id), status.get(attack.id), status.get(main.id)], ["in", "out", "in"]);
});
