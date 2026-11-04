//! Spec J kernel acceptance: proposals, revert, the hosted editor's working
//! copy, the Changes viewer, the filing PDF/A and its conversion record. The
//! DOCX engine runs in process here; its process boundary is tested in
//! `oa-docs`.

use std::path::PathBuf;
use std::sync::Arc;

use oa_docs::docx::Block;
use oa_docs::InProcessEngine;
use oa_kernel::{
    Attachment, CheckInput, ClientSpec, Ctx, DraftChecks, GateBlocker, Hooks, Kernel,
    PresencePrompt, Request, StubDraftChecks,
};
use oa_store::sqlite::SqliteFactory;
use oa_types::{new_key, ErrorCode, OaError, Origin};
use serde_json::Value;
use tempfile::TempDir;

struct Present;

impl PresencePrompt for Present {
    fn confirm(&self, _summary: &str) -> bool {
        true
    }
}

/// A K stand-in that blocks every revision on one gate.
struct Blocked;

impl DraftChecks for Blocked {
    fn blockers(&self, _input: &CheckInput) -> Vec<GateBlocker> {
        vec![GateBlocker {
            gate: "citations".into(),
            detail: "one citation is unresolved".into(),
        }]
    }

    fn conversion(
        &self,
        paragraphs: &[Block],
        pdf_body: &[String],
    ) -> Vec<oa_docs::conversion::ParaCheck> {
        StubDraftChecks.conversion(paragraphs, pdf_body)
    }
}

struct Fx {
    _tmp: TempDir,
    k: Kernel,
    m: String,
    dir: PathBuf,
}

fn fx_with(checks: Arc<dyn DraftChecks>) -> Fx {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("root");
    let app = tmp.path().join("app");
    let k = Kernel::new(
        &app,
        Arc::new(SqliteFactory),
        Hooks {
            presence: Arc::new(Present),
            docx: Arc::new(InProcessEngine),
            checks,
            ..Hooks::default()
        },
    );
    k.dispatch(&cli(), Request::WorkspaceInit { root }).unwrap();
    let m = k
        .dispatch(
            &cli(),
            Request::MatterCreate {
                title: "Rao v. State".into(),
                client: ClientSpec::None,
                from: None,
            },
        )
        .unwrap()[0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let opened = k
        .dispatch(&cli(), Request::MatterOpen { id: m.clone() })
        .unwrap();
    let dir = PathBuf::from(opened[0]["path"].as_str().unwrap());
    Fx {
        _tmp: tmp,
        k,
        m,
        dir,
    }
}

fn fx() -> Fx {
    fx_with(Arc::new(StubDraftChecks))
}

fn cli() -> Ctx {
    Ctx::new(Origin::Cli, new_key())
}

fn harness() -> Ctx {
    Ctx::new(Origin::Harness, new_key())
}

impl Fx {
    fn call(&self, ctx: &Ctx, r: Request) -> Result<Value, OaError> {
        self.k.dispatch(ctx, r).map(|mut v| v.remove(0))
    }

    fn q(&self, r: Request) -> Value {
        self.call(&Ctx::query(Origin::Cli), r).unwrap()
    }

    fn new_draft(&self) -> (String, String) {
        let v = self
            .call(
                &cli(),
                Request::DraftNew {
                    matter: self.m.clone(),
                    title: "SLP against the High Court order".into(),
                    template: "slp".into(),
                    from_notebook: false,
                },
            )
            .unwrap();
        (
            v["draft"]["id"].as_str().unwrap().to_string(),
            v["revision"]["hash"].as_str().unwrap().to_string(),
        )
    }

    fn head(&self, draft: &str) -> String {
        self.q(Request::DraftLog {
            matter: self.m.clone(),
            draft: draft.into(),
        })["draft"]["head"]
            .as_str()
            .unwrap()
            .to_string()
    }

    fn revisions(&self, draft: &str) -> Vec<Value> {
        self.q(Request::DraftLog {
            matter: self.m.clone(),
            draft: draft.into(),
        })["revisions"]
            .as_array()
            .unwrap()
            .clone()
    }

    fn paragraphs(&self, rev: &str) -> Vec<Value> {
        self.q(Request::DraftParagraphs {
            matter: self.m.clone(),
            rev: rev.into(),
        })["paragraphs"]
            .as_array()
            .unwrap()
            .clone()
    }

    fn para(&self, rev: &str, n: usize) -> String {
        self.paragraphs(rev)[n]["id"].as_str().unwrap().to_string()
    }

    fn propose(&self, ctx: &Ctx, draft: &str, para: &str, text: &str) -> String {
        self.call(
            ctx,
            Request::DraftPropose {
                matter: self.m.clone(),
                draft: draft.into(),
                para: para.into(),
                replace: text.into(),
                reason: Some("tighten".into()),
                turn: Some("turn-7".into()),
            },
        )
        .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string()
    }

    fn accept(&self, proposal: &str) -> Value {
        self.call(
            &cli(),
            Request::DraftAccept {
                matter: self.m.clone(),
                proposal: proposal.into(),
            },
        )
        .unwrap()
    }

    /// An agent edit, proposed and accepted. Returns the new revision.
    fn agent_edit(&self, draft: &str, para: &str, text: &str) -> String {
        let p = self.propose(&harness(), draft, para, text);
        self.accept(&p)["revision"]["hash"]
            .as_str()
            .unwrap()
            .to_string()
    }

    fn approve(&self, rev: &str) {
        let a = self
            .call(
                &cli(),
                Request::ApprovalRequest {
                    matter: self.m.clone(),
                    gate: "final_revision".into(),
                    target: rev.into(),
                },
            )
            .unwrap();
        self.call(
            &cli(),
            Request::ApprovalDecide {
                matter: self.m.clone(),
                id: a["id"].as_str().unwrap().into(),
                accept: true,
                reason: "final".into(),
            },
        )
        .unwrap();
    }

    fn filing(&self, rev: &str) -> Result<Value, OaError> {
        self.call(
            &cli(),
            Request::FilingPdf {
                matter: self.m.clone(),
                rev: rev.into(),
                annexures: Vec::new(),
            },
        )
    }

    fn filings_on_disk(&self) -> usize {
        std::fs::read_dir(self.dir.join("filings"))
            .map(|d| d.count())
            .unwrap_or(0)
    }
}

#[test]
fn j_ac_03_an_accepted_proposal_is_exactly_one_revision_authored_by_the_agent_turn() {
    let f = fx();
    let (d, rev) = f.new_draft();
    let para = f.para(&rev, 6);
    let p = f.propose(
        &harness(),
        &d,
        &para,
        "07.03.2019: Interim order staying demolition",
    );
    assert_eq!(f.revisions(&d).len(), 1, "a proposal is not a revision");
    let out = f.accept(&p);
    assert_eq!(out["outcome"], "accepted");
    let revs = f.revisions(&d);
    assert_eq!(revs.len(), 2);
    let new = &revs[1];
    assert_eq!(new["author_kind"], "agent");
    assert_eq!(new["author"], "agent:turn-7");
    assert_eq!(f.head(&d), new["hash"].as_str().unwrap());
    assert_eq!(
        f.paragraphs(new["hash"].as_str().unwrap())[6]["text"],
        "07.03.2019: Interim order staying demolition"
    );
    // Accepting it again does nothing.
    let again = f.call(
        &cli(),
        Request::DraftAccept {
            matter: f.m.clone(),
            proposal: p,
        },
    );
    assert_eq!(again.unwrap_err().code, ErrorCode::Conflict);
    assert_eq!(f.revisions(&d).len(), 2);
}

#[test]
fn j_ac_04_a_proposal_on_a_stale_base_is_shown_again_and_not_committed() {
    let f = fx();
    let (d, rev) = f.new_draft();
    let stale = f.propose(
        &harness(),
        &d,
        &f.para(&rev, 6),
        "Stale edit of the stay order",
    );
    f.agent_edit(&d, &f.para(&rev, 4), "The synopsis, rewritten.");
    let before = f.revisions(&d).len();
    let out = f.accept(&stale);
    assert_eq!(out["outcome"], "rebased");
    assert_eq!(f.revisions(&d).len(), before, "nothing was committed");
    let fresh = out["proposal"]["id"].as_str().unwrap().to_string();
    assert_ne!(fresh, stale);
    assert_eq!(out["proposal"]["base"], f.head(&d).as_str());
    assert_eq!(out["proposal"]["rebased_from"], stale.as_str());
    let listed =
        f.k.dispatch(
            &Ctx::query(Origin::Cli),
            Request::DraftProposals {
                matter: f.m.clone(),
                draft: Some(d.clone()),
                all: false,
            },
        )
        .unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0]["id"], fresh.as_str());
    assert_eq!(f.accept(&fresh)["outcome"], "accepted");
    assert_eq!(f.revisions(&d).len(), before + 1);
}

#[test]
fn j_ac_05_draft_accept_and_reject_from_a_harness_connection_are_refused() {
    let f = fx();
    let (d, rev) = f.new_draft();
    let p = f.propose(&harness(), &d, &f.para(&rev, 6), "x");
    for r in [
        Request::DraftAccept {
            matter: f.m.clone(),
            proposal: p.clone(),
        },
        Request::DraftReject {
            matter: f.m.clone(),
            proposal: p.clone(),
            reason: None,
        },
    ] {
        let e = f.k.dispatch(&harness(), r).unwrap_err();
        assert_eq!(e.code, ErrorCode::HumanCommandRefused);
    }
    assert_eq!(f.revisions(&d).len(), 1);
}

#[test]
fn j_ac_06_reverting_the_third_of_five_agent_edits_equals_applying_the_other_four() {
    let f = fx();
    let texts = [
        "Edit one.",
        "Edit two.",
        "Edit three.",
        "Edit four.",
        "Edit five.",
    ];
    let (d, rev) = f.new_draft();
    let targets: Vec<String> = [4, 6, 7, 9, 11].iter().map(|&n| f.para(&rev, n)).collect();
    let mut edits = Vec::new();
    for (t, text) in targets.iter().zip(texts) {
        edits.push(f.agent_edit(&d, t, text));
    }
    let reverted = f
        .call(
            &cli(),
            Request::DraftRevert {
                matter: f.m.clone(),
                draft: d.clone(),
                rev: edits[2].clone(),
            },
        )
        .unwrap();
    let got = reverted["hash"].as_str().unwrap().to_string();
    assert_eq!(f.head(&d), got);
    assert_eq!(f.revisions(&d).len(), 7, "the revert is a new revision");
    let (d2, _) = f.new_draft();
    for (i, (t, text)) in targets.iter().zip(texts).enumerate() {
        if i != 2 {
            f.agent_edit(&d2, t, text);
        }
    }
    let want = f.head(&d2);
    let shape = |rev: &str| -> Vec<(Value, Value)> {
        f.paragraphs(rev)
            .iter()
            .map(|p| (p["id"].clone(), p["xml_hash"].clone()))
            .collect()
    };
    assert_eq!(shape(&got), shape(&want));
}

#[test]
fn j_ac_07_an_editor_file_inside_the_drafts_folder_is_detected_and_refused() {
    let f = fx();
    let (d, _) = f.new_draft();
    f.call(
        &cli(),
        Request::DraftOpenEditor {
            matter: f.m.clone(),
            draft: d.clone(),
        },
    )
    .unwrap();
    let inside = f.dir.join("drafts").join(&d);
    std::fs::create_dir_all(&inside).unwrap();
    std::fs::write(inside.join("saved-by-wordcraft.docx"), b"bytes").unwrap();
    let e = f
        .call(
            &cli(),
            Request::DraftImportWorkingCopy {
                matter: f.m.clone(),
                draft: d.clone(),
                autosave: false,
            },
        )
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::WriteRefused);
    let rejected =
        f.k.dispatch(
            &Ctx::query(Origin::Cli),
            Request::AuditRejected {
                matter: Some(f.m.clone()),
            },
        )
        .unwrap();
    assert!(rejected.iter().any(|r| r["reason"]
        .as_str()
        .unwrap_or_default()
        .contains("saved-by-wordcraft")));
    assert_eq!(f.revisions(&d).len(), 1);
}

#[test]
fn j_ac_14_a_crash_with_unsaved_edits_loses_no_revision_and_recovers_the_autosave() {
    let f = fx();
    let (d, rev) = f.new_draft();
    f.agent_edit(&d, &f.para(&rev, 4), "Committed before the editor opened.");
    let committed: Vec<Value> = f.revisions(&d);
    let session = f
        .call(
            &cli(),
            Request::DraftOpenEditor {
                matter: f.m.clone(),
                draft: d.clone(),
            },
        )
        .unwrap();
    let working = PathBuf::from(session["working"].as_str().unwrap());
    // WordCraft autosaved an edit, then crashed before saving.
    let bytes = std::fs::read(&working).unwrap();
    let mut doc = oa_docs::docx::Docx::open(&bytes).unwrap();
    let target = f.para(&rev, 9);
    doc.replace_paragraph(&target, "Recovered from the autosave.")
        .unwrap();
    std::fs::write(oa_docs::editor::autosave_path(&working), doc.save()).unwrap();
    let status = f.q(Request::DraftEditorStatus {
        matter: f.m.clone(),
        draft: d.clone(),
    });
    assert!(status["autosave"].is_string());
    assert_eq!(status["unimported_save"], false);
    assert_eq!(f.revisions(&d), committed, "no committed revision changed");
    let out = f
        .call(
            &cli(),
            Request::DraftImportWorkingCopy {
                matter: f.m.clone(),
                draft: d.clone(),
                autosave: true,
            },
        )
        .unwrap();
    assert_eq!(out["outcome"], "imported");
    assert_eq!(out["revision"]["author_kind"], "wordcraft");
    assert_eq!(out["revision"]["note"], "wordcraft autosave recovered");
    let revs = f.revisions(&d);
    assert_eq!(revs.len(), committed.len() + 1);
    assert_eq!(&revs[..committed.len()], &committed[..]);
    assert_eq!(
        f.paragraphs(&f.head(&d))[9]["text"],
        "Recovered from the autosave."
    );
}

#[test]
fn a_wordcraft_save_on_a_moved_head_becomes_a_proposal_for_the_advocate() {
    let f = fx();
    let (d, rev) = f.new_draft();
    let session = f
        .call(
            &cli(),
            Request::DraftOpenEditor {
                matter: f.m.clone(),
                draft: d.clone(),
            },
        )
        .unwrap();
    f.agent_edit(
        &d,
        &f.para(&rev, 4),
        "The agent edited the synopsis meanwhile.",
    );
    let working = PathBuf::from(session["working"].as_str().unwrap());
    let mut doc = oa_docs::docx::Docx::open(&std::fs::read(&working).unwrap()).unwrap();
    doc.replace_paragraph(&f.para(&rev, 9), "The advocate edited a date in WordCraft.")
        .unwrap();
    std::fs::write(&working, doc.save()).unwrap();
    let head_before = f.head(&d);
    let out = f
        .call(
            &cli(),
            Request::DraftImportWorkingCopy {
                matter: f.m.clone(),
                draft: d.clone(),
                autosave: false,
            },
        )
        .unwrap();
    assert_eq!(out["outcome"], "conflict");
    assert_eq!(f.head(&d), head_before, "the head did not move");
    let accepted = f.accept(out["proposal"]["id"].as_str().unwrap());
    assert_eq!(accepted["outcome"], "accepted");
    let paras = f.paragraphs(&f.head(&d));
    assert_eq!(paras[4]["text"], "The agent edited the synopsis meanwhile.");
    assert_eq!(paras[9]["text"], "The advocate edited a date in WordCraft.");
}

#[test]
fn j_ac_17_conversion_of_an_unapproved_or_blocked_revision_exits_1_with_no_pdf() {
    let f = fx();
    let (_, rev) = f.new_draft();
    let e = f.filing(&rev).unwrap_err();
    assert_eq!(e.code, ErrorCode::CheckFailed);
    assert_eq!(e.code.exit_code(), 1);
    assert!(e.message.contains("final_revision"));
    assert_eq!(f.filings_on_disk(), 0);

    let b = fx_with(Arc::new(Blocked));
    let (_, rev) = b.new_draft();
    b.approve(&rev);
    let e = b.filing(&rev).unwrap_err();
    assert_eq!(e.code, ErrorCode::CheckFailed);
    assert!(e.message.contains("citations"));
    assert_eq!(b.filings_on_disk(), 0);

    // Not the head any more, even though approved.
    let (d, rev) = f.new_draft();
    f.approve(&rev);
    f.agent_edit(&d, &f.para(&rev, 4), "Later edit.");
    assert_eq!(f.filing(&rev).unwrap_err().code, ErrorCode::CheckFailed);
    assert_eq!(f.filings_on_disk(), 0);
}

#[test]
fn j_ac_19_the_conversion_record_links_the_docx_hash_to_the_pdfa_hash_on_disk() {
    let f = fx();
    let (_, rev) = f.new_draft();
    f.approve(&rev);
    let c = f.filing(&rev).unwrap();
    assert_eq!(c["state"], "passed", "{c}");
    let r = f.q(Request::DraftShow {
        matter: f.m.clone(),
        rev: rev.clone(),
    });
    assert_eq!(c["docx_hash"], r["blob"]);
    let on_disk = std::fs::read(c["path"].as_str().unwrap()).unwrap();
    let hash = oa_docs::docx::sha256_hex(&on_disk);
    assert_eq!(c["pdf_hash"], hash.as_str());
    assert!(c["renderer"].as_str().unwrap().contains("wordcraft-engine"));
    assert!(c["page_count"].as_u64().unwrap() >= 3);
    let list =
        f.k.dispatch(
            &Ctx::query(Origin::Cli),
            Request::FilingConversions {
                matter: f.m.clone(),
            },
        )
        .unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["file_matches"], true);
    let links =
        f.k.dispatch(
            &Ctx::query(Origin::Cli),
            Request::LinksOut {
                matter: f.m.clone(),
                id: c["id"].as_str().unwrap().into(),
            },
        )
        .unwrap();
    assert!(links.iter().any(|l| l["to"] == rev.as_str()));
    assert!(links.iter().any(|l| l["to"] == hash.as_str()));
}

#[test]
fn j_ac_18_pdfcraft_is_refused_the_filing_pdf() {
    let f = fx();
    let (_, rev) = f.new_draft();
    f.approve(&rev);
    let c = f.filing(&rev).unwrap();
    for target in [c["id"].as_str().unwrap(), c["pdf_hash"].as_str().unwrap()] {
        let e = f
            .call(
                &cli(),
                Request::PdfOpenEditor {
                    matter: f.m.clone(),
                    target: target.into(),
                },
            )
            .unwrap_err();
        assert_eq!(e.code, ErrorCode::WriteRefused, "{target}");
    }
}

#[test]
fn j_ac_20_the_changes_viewer_shows_proposals_wordcraft_saves_and_restores_with_authors() {
    let f = fx();
    let (d, rev) = f.new_draft();
    f.call(
        &cli(),
        Request::DraftCheckpoint {
            matter: f.m.clone(),
            draft: d.clone(),
            name: "generated".into(),
        },
    )
    .unwrap();
    f.agent_edit(&d, &f.para(&rev, 4), "Agent synopsis.");
    let session = f
        .call(
            &cli(),
            Request::DraftOpenEditor {
                matter: f.m.clone(),
                draft: d.clone(),
            },
        )
        .unwrap();
    let working = PathBuf::from(session["working"].as_str().unwrap());
    let mut doc = oa_docs::docx::Docx::open(&std::fs::read(&working).unwrap()).unwrap();
    doc.replace_paragraph(&f.para(&rev, 9), "WordCraft edit.")
        .unwrap();
    std::fs::write(&working, doc.save()).unwrap();
    f.call(
        &cli(),
        Request::DraftImportWorkingCopy {
            matter: f.m.clone(),
            draft: d.clone(),
            autosave: false,
        },
    )
    .unwrap();
    f.call(
        &cli(),
        Request::DraftRestore {
            matter: f.m.clone(),
            draft: d.clone(),
            checkpoint: "generated".into(),
        },
    )
    .unwrap();
    let ch = f.q(Request::DraftChanges {
        matter: f.m.clone(),
        draft: d.clone(),
    });
    let revs = ch["revisions"].as_array().unwrap();
    let kinds: Vec<(&str, &str)> = revs
        .iter()
        .map(|r| (r["kind"].as_str().unwrap(), r["author"].as_str().unwrap()))
        .collect();
    assert_eq!(
        kinds,
        vec![
            ("generated", "advocate"),
            ("proposal", "agent:turn-7"),
            ("wordcraft_save", "wordcraft"),
            ("restore", "advocate"),
        ]
    );
    assert_eq!(revs[1]["revertable"], true);
    assert_eq!(revs[1]["changes"][0]["after"], "Agent synopsis.");
    assert_eq!(revs[2]["changes"][0]["after"], "WordCraft edit.");
    assert_eq!(revs[3]["changes"].as_array().unwrap().len(), 2);
}

#[test]
fn j_ac_21_a_review_note_stays_on_its_paragraph_id_in_later_revisions() {
    let f = fx();
    let (d, rev) = f.new_draft();
    let para = f.para(&rev, 6);
    f.call(
        &cli(),
        Request::DraftNote {
            matter: f.m.clone(),
            draft: d.clone(),
            rev: rev.clone(),
            para: para.clone(),
            text: "Check this date against the order.".into(),
            to_agent: false,
        },
    )
    .unwrap();
    f.agent_edit(&d, &f.para(&rev, 4), "Another paragraph changes.");
    let later = f.agent_edit(&d, &para, "07.03.2019: The noted paragraph itself changes.");
    let paras = f.paragraphs(&later);
    let noted = paras.iter().find(|p| p["id"] == para.as_str()).unwrap();
    assert_eq!(
        noted["notes"][0]["text"],
        "Check this date against the order."
    );
    assert!(paras
        .iter()
        .filter(|p| p["id"] != para.as_str())
        .all(|p| p["notes"].as_array().unwrap().is_empty()));
    let diff = f.q(Request::DraftDiff {
        matter: f.m.clone(),
        a: rev.clone(),
        b: later,
    });
    assert_eq!(diff["notes"][0]["para"], para.as_str());
    // Sending a note to the agent needs the capability.
    let e = f
        .call(
            &cli(),
            Request::DraftNote {
                matter: f.m.clone(),
                draft: d,
                rev,
                para,
                text: "Agent, recheck.".into(),
                to_agent: true,
            },
        )
        .unwrap_err();
    assert_eq!(e.code, ErrorCode::WriteRefused);
}

#[test]
fn j_ac_22_the_conversion_report_shows_a_failing_paragraph_from_both_sides() {
    let f = fx();
    let (d, rev) = f.new_draft();
    let para = f.para(&rev, 11);
    let head = f.agent_edit(&d, &para, "Costs of \u{20b9}5,00,000 were awarded.");
    f.approve(&head);
    let c = f.filing(&head).unwrap();
    assert_eq!(c["state"], "failed");
    let failing: Vec<&Value> = c["check"]["paragraphs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|p| p["outcome"] != "same")
        .collect();
    assert_eq!(failing.len(), 1, "{failing:?}");
    assert_eq!(failing[0]["para"], para.as_str());
    assert!(failing[0]["docx"].as_str().unwrap().contains('\u{20b9}'));
    assert!(failing[0]["pdf"].as_str().unwrap().contains("?5,00,000"));
}

#[test]
fn an_unreadable_revision_is_shown_unreadable_in_the_viewer() {
    let f = fx();
    let (d, rev) = f.new_draft();
    let bad = f
        .call(
            &cli(),
            Request::DraftCommit {
                matter: f.m.clone(),
                draft: d,
                base: rev,
                file: Attachment {
                    file_name: "broken.docx".into(),
                    bytes: b"not a zip".to_vec(),
                },
                note: None,
            },
        )
        .unwrap();
    let v = f.q(Request::View {
        matter: f.m.clone(),
        target: bad["hash"].as_str().unwrap().into(),
        page: None,
    });
    assert_eq!(v["state"], "unreadable");
    assert!(v["reason"].as_str().unwrap().contains("ZIP"));
}

#[test]
fn the_fidelity_check_compares_the_engine_with_the_viewer_and_says_word_is_absent() {
    let f = fx();
    let (_, rev) = f.new_draft();
    let r = f.q(Request::FidelityCheck {
        matter: f.m.clone(),
        rev,
    });
    assert_eq!(r["passed"], true);
    assert_eq!(r["renderers"][2]["renderer"], "word");
    assert!(r["renderers"][2]["pages"].is_null());
}
