# v0 spec: research, memoranda, case conference, Questions of Law, Grounds

Step 6 of [../build-plan.md](../build-plan.md). Serves workflow sections 5E, 5F, 5G, 7A to 7E, 8C and 8D.

**Input.** The Notebook, the sources, and the advocate's instructions in the chat.

**Output.** In `matter.db` (`lib/matter-store/work.ts`): legal issues (Notebook E), authorities (Notebook F), memoranda, and the case-conference decisions. Two drafts, Questions of Law and Grounds, with revisions.

**Rules.**

1. An issue the agent proposes is a candidate. The advocate accepts or rejects it at the case conference, with a reason (human-only, decision 5). An issue the advocate adds is accepted when added.
2. An authority the agent records is a candidate. The advocate adopts or rejects it. An authority is never shown as verified unless the validator said so (step 7).
3. The citation index is the court's released list of neutral citations (1950 to 2023), read from the validator's database. It is a finding aid. A hit is never a verification outcome.
4. A memorandum states its grounding with references the matter resolves: `[event:<id>]`, `[issue:<id>]`, `[authority:<id>]`, `[source name, p. N, l. M]`. Each reference is resolved before the memorandum is stored. Unresolved references are stored and shown as unresolved. A memorandum with no resolved reference is refused (`MEMO_UNGROUNDED`).
5. Questions of Law and Grounds start with their title only. No generator writes legal text. The agent adds a paragraph with `propose_paragraph`: a tracked insertion in its own anchored content control, in a new revision by the agent. The advocate keeps or undoes it in the chat card (step 5 rules 12 to 14). Undo removes the paragraph.
6. Grounds are approved as a revision. Approval is refused while an agent change is undecided (step 5), and while step 7 holds the draft for legal review.

**Surfaces.** Research tab: issues with Accept and Reject, authorities with Adopt and Reject and their validator outcome, the citation index search, citation checks, the adverse-authority review, memoranda. Drafts: "Start Questions of Law", "Start Grounds". Agent tools: `list_research`, `search_citation_index`, `propose_issue`, `add_authority`, `write_memorandum`, `propose_paragraph`.

**Not in v0.** Retrieval of judgment text from the portal before quoting; support and voice assessment; treatment and overruling mechanics; advisory outcome scores (ruling R-1); multi-agent argument evaluation; a research index beyond the citation list.

**Proof task.** The owner runs a case conference on a real brief and approves at least one ground drafted by the agent.
