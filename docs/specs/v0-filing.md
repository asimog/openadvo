# v0 spec: annexures, filing compliance, approval, filing PDF

Step 8 of [../build-plan.md](../build-plan.md). Serves workflow sections 8E, 9E and 10, and editor-design item h.

**Input.** The approved revisions of the List of Dates, Synopsis, Questions of Law and Grounds; the sources; the matter details.

**Output.** The annexure list; the limitation computation; the compliance results; the filing set: a folder `filing/<time>/` in the matter, with one PDF per document, `manifest.json`, and the payload hash.

**Rules.**

1. Matter details (petitioner, respondent, case number, CNR, court, impugned judgment) are recorded by the advocate on the Matter tab. Nothing is guessed.
2. Annexures are sources the advocate ticks, in order. Labels follow the order: Annexure P-1, P-2.
3. Limitation is computed from the confirmed Notebook event the advocate marked as the impugned judgment: 90 calendar days, day 1 the day after. The working names the rule, its source and what is not computed (certified-copy time, vacations, condonation). The advocate confirms it. The rule's source is to be confirmed by the owner (questions Q-7).
4. Compliance rules are versioned (`slp-package-v0`) and each names its source: P-1 required documents approved; P-2 parties and impugned judgment recorded; P-3 annexure references consistent both ways; P-4 limitation computed and confirmed; P-5 petition documents are PDF/A. R-0, the Registry's list of defects, is not encoded and always shows "not checked" (questions Q-6).
5. "Approve for filing" is human-only and refused while any rule except P-5 shows a defect. It renders each approved DOCX to PDF/A with the release's x2t (`m_bIsPDFA`), copies each annexure's stored bytes, and writes the manifest with every file's SHA-256 and a PDF/A flag. The payload hash is the SHA-256 of the manifest. Filing sets are written once.

**Surfaces.** Matter tab: matter details. Filing tab: annexures, limitation (Compute, Confirm), compliance table, blockers, "Approve for filing and make the filing set", the set with its files and payload hash, "Show the filing set folder".

**Not in v0.** The Registry's defect list; pagination, indexing and a single combined petition PDF; PDF/A conversion of annexures (copied as received, flagged "PDF/A: no"); affidavits and declarations; limitation exclusions.

**Proof task.** The owner prepares the filing set of a real SLP and checks it against the Registry's list of defects.
