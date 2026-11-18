/** RAG-1 fallback: Indian Kanoon's Akoma Ntoso-style Act page, used only when India Code OCR fails. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIndianKanoonAct } from "../../src/lib/statutes/indiankanoon.ts";

const html = `
<h1>The Code of Criminal Procedure, 1973</h1>
<span class="akn-body">
<section class="akn-chapter"><h2>Chapter XXXVII<br/>Miscellaneous</h2>
<section class="akn-section" id="section_481"><h3><a href="/doc/1898339/">481.</a> Public servant concerned in sale not to purchase or bid for property.</h3>
<span class="akn-content"><span class="akn-p">- A public servant having any duty to perform in connection with the sale of any property under this Code shall not purchase or bid for the property.</span></span></section>
<section class="akn-section" id="section_482"><h3><a href="/doc/1679850/">482.</a> Saving of inherent powers of High Court.</h3>
<span class="akn-content"><span class="akn-p">- Nothing in this Code shall be deemed to limit or affect the inherent powers of the High Court to make such orders as may be necessary to give effect to any order under this Code.</span>
<table><tr><td>State amendment that is not the central section text.</td></tr></table></section>
<section class="akn-section" id="section_483"><h3><a href="/doc/291563/">483.</a> Duty of High Court to exercise continuous superintendence.</h3>
<span class="akn-content"><span class="akn-p">- Every High Court shall so exercise its superintendence over the Courts of Judicial Magistrates subordinate to it.</span></span></section>
</section>
</section>`;

test("RAG-1: Indian Kanoon sections keep the heading, chapter and source document", () => {
  const act = parseIndianKanoonAct(html);
  assert.equal(act.title, "The Code of Criminal Procedure, 1973");
  assert.equal(act.sections.length, 3);
  const section = act.sections.find((row) => row.number === "482");
  assert.ok(section);
  assert.equal(section.heading, "Saving of inherent powers of High Court");
  assert.equal(section.under, "CHAPTER XXXVII");
  assert.equal(section.sourceRef, "ik:1679850");
  assert.equal(section.sourceUrl, "https://indiankanoon.org/doc/1679850/");
  assert.match(section.text, /Nothing in this Code/);
  assert.ok(!section.text.includes("State amendment"), "a state-amendment table is not the central section text");
});

test("RAG-1: an Indian Kanoon page with no section block yields no invented section", () => {
  const act = parseIndianKanoonAct("<html><h1>Not an Act</h1><p>No section.</p></html>");
  assert.equal(act.sections.length, 0);
});
