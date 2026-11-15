/**
 * Harness hardening H-12: a question from a Pi extension (ctx.ui.select, confirm, input, editor)
 * waits for the advocate's answer. Dismissed, cancelled, aborted or out-of-time questions get the
 * extension's default answer. No model and no Electron.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ExtensionQuestions, extensionUi } from "../../src/main/pi-extensions.ts";
import { EXTENSION_QUESTION_REASON, type ExtensionQuestion } from "../../src/shared/api.ts";

function board() {
  const changes: ExtensionQuestion[][] = [];
  const notices: string[] = [];
  const questions = new ExtensionQuestions((open) => changes.push(open));
  const ui = extensionUi({ notice: (t) => notices.push(t), status: () => undefined, questions });
  return { questions, ui, changes, notices };
}

test("select: the question is an AG-UI interrupt, and the extension gets the option it offered", async () => {
  const b = board();
  const offered = ["\u001b[1mstats\u001b[0m  - show stats", "help"];
  const pending = b.ui.select("pruner - choose", offered);
  const [q] = b.questions.list();
  assert.equal(q.reason, EXTENSION_QUESTION_REASON);
  assert.equal(q.message, "pruner - choose");
  assert.equal(q.metadata.kind, "select");
  assert.deepEqual(q.metadata.options, ["stats  - show stats", "help"], "terminal codes are removed for the window");
  assert.deepEqual(q.responseSchema, { type: "string", enum: ["stats  - show stats", "help"] });
  assert.throws(() => b.questions.answer(q.id, "something else"), /BAD_ANSWER/);
  assert.throws(() => b.questions.answer(q.id, true), /BAD_ANSWER/);
  b.questions.answer(q.id, "stats  - show stats");
  assert.equal(await pending, offered[0], "the extension receives its own string");
  assert.deepEqual(b.questions.list(), []);
  assert.deepEqual(b.changes.map((c) => c.length), [1, 0], "each change is reported");
  assert.throws(() => b.questions.answer(q.id, "help"), /QUESTION_CLOSED/);
});

test("confirm, input and editor return the answer; dismiss returns the default", async () => {
  const b = board();
  const yes = b.ui.confirm("Clear checklist?", "Remove all tasks?");
  let [q] = b.questions.list();
  assert.equal(q.metadata.detail, "Remove all tasks?");
  assert.throws(() => b.questions.answer(q.id, "yes"), /BAD_ANSWER/);
  b.questions.answer(q.id, true);
  assert.equal(await yes, true);

  const no = b.ui.confirm("Clear checklist?", "");
  [q] = b.questions.list();
  b.questions.answer(q.id, null);
  assert.equal(await no, false, "a dismissed confirmation is a no");

  const typed = b.ui.input("New value", "a number");
  [q] = b.questions.list();
  assert.equal(q.metadata.placeholder, "a number");
  b.questions.answer(q.id, "42");
  assert.equal(await typed, "42");

  const edited = b.ui.editor("Send input", "draft text");
  [q] = b.questions.list();
  assert.equal(q.metadata.kind, "editor");
  assert.equal(q.metadata.prefill, "draft text");
  assert.throws(() => b.questions.answer(q.id, "x".repeat(100_001)), /BAD_ANSWER/);
  b.questions.answer(q.id, null);
  assert.equal(await edited, undefined, "a dismissed text question has no answer");
  assert.deepEqual(b.notices, [], "answers and dismissals need no notice");
});

test("a timeout gives the default answer with a notice; an abort and cancelAll give it at once", async () => {
  const b = board();
  const timed = b.ui.confirm("Allow?", "", { timeout: 30 });
  assert.ok(b.questions.list()[0].expiresAt, "the question says when it expires");
  assert.equal(await timed, false);
  assert.match(b.notices.join(" "), /ran out of time/);

  const ctl = new AbortController();
  const aborted = b.ui.select("Pick", ["a", "b"], { signal: ctl.signal });
  assert.equal(b.questions.list().length, 1);
  ctl.abort();
  assert.equal(await aborted, undefined);
  assert.equal(b.questions.list().length, 0);

  const already = new AbortController();
  already.abort();
  assert.equal(await b.ui.input("Late", undefined, { signal: already.signal }), undefined);
  assert.equal(b.questions.list().length, 0, "an aborted signal opens no question");

  const one = b.ui.input("One");
  const two = b.ui.confirm("Two", "");
  assert.equal(b.questions.list().length, 2);
  b.questions.cancelAll();
  assert.deepEqual(await Promise.all([one, two]), [undefined, false]);
  assert.equal(b.questions.list().length, 0);
});

test("without a question board, a question gets its default answer and a notice says so", async () => {
  const notices: string[] = [];
  const ui = extensionUi({ notice: (t) => notices.push(t), status: () => undefined });
  assert.equal(await ui.confirm("Allow?", ""), false);
  assert.equal(await ui.select("Pick", ["a"]), undefined);
  assert.equal(notices.length, 2);
  assert.match(notices[0], /cannot show the question/);
});
