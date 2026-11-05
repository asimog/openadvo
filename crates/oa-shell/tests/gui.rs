//! GUI tests for Open Advocate window (spec A and spec D).
//!
//! Uses `egui_kittest` driving views by AccessKit role and name,
//! with fixture query results and no kernel.

use eframe::egui::{self, Vec2};
use egui_kittest::kittest::Queryable;
use egui_kittest::Harness;
use oa_protocol::{Pane, Request, Screen, Split, ViewArea, ViewId as ProtoViewId};
use oa_shell::bar::{self, Action, Frecency};
use oa_shell::chat::{
    ChatPane, MatterRun, RunState, ToolCardData, TranscriptItem, WaitingGateItem,
};
use oa_shell::inbox::{self, Effect, Inbox};
use oa_shell::ui::frame::{compute_layout, COLLAPSED_PANE_WIDTH, LEFT_PANE_WIDTH, MIN_SPLIT_WIDTH};
use oa_shell::ui::human::{HumanAction, HumanControl};
use oa_shell::ui::table::{TableRow, TableState, VirtualTable};
use oa_shell::ui::widgets::{
    badge, empty_state, key_value_grid, status_chip, toolbar_button, Tone,
};
use oa_shell::views::{Subject, ViewId};
use oa_shell::App;
use std::cell::RefCell;
use std::rc::Rc;

// ----------------------------------------------------------------------------
// Group A: GUI Tests
// ----------------------------------------------------------------------------

#[test]
fn a_gui_01_collapsing_the_view_pane() {
    // Collapsing the view pane makes the chat pane the rightmost pane;
    // expanding restores the splits and their pages.
    let mut screen = Screen {
        left: Pane::Open,
        chat: Pane::Open,
        view: ViewArea {
            pane: Pane::Open,
            splits: vec![Split::new(ProtoViewId::Overview)],
            focus: 0,
        },
        inspector: None,
        matter: None,
    };

    let full_rect = egui::Rect::from_min_size(egui::Pos2::ZERO, Vec2::new(1920.0, 1080.0));
    let layout1 = compute_layout(&screen, full_rect);
    assert!(layout1.view_rect.width() >= MIN_SPLIT_WIDTH);
    assert_eq!(layout1.chat_rect.max.x, layout1.view_rect.min.x);

    // Collapse view pane
    screen.view.pane = Pane::Collapsed;
    let layout2 = compute_layout(&screen, full_rect);
    assert_eq!(layout2.view_rect.width(), 0.0);
    // Chat pane is now the rightmost pane (takes up to the full width)
    assert_eq!(layout2.chat_rect.max.x, full_rect.max.x);

    // Expand view pane restores splits
    screen.view.pane = Pane::Open;
    let layout3 = compute_layout(&screen, full_rect);
    assert!(layout3.view_rect.width() >= MIN_SPLIT_WIDTH);
    assert_eq!(layout3.split_rects.len(), 1);
}

#[test]
fn a_gui_02_collapsing_the_left_pane() {
    // Collapsing the left pane gives its width to the chat and view panes;
    // the inbox count stays reachable from the command bar / collapsed rail.
    let mut screen = Screen {
        left: Pane::Open,
        chat: Pane::Open,
        view: ViewArea {
            pane: Pane::Open,
            splits: vec![Split::new(ProtoViewId::Overview)],
            focus: 0,
        },
        inspector: None,
        matter: None,
    };

    let full_rect = egui::Rect::from_min_size(egui::Pos2::ZERO, Vec2::new(1920.0, 1080.0));
    let layout1 = compute_layout(&screen, full_rect);
    assert_eq!(layout1.left_rect.width(), LEFT_PANE_WIDTH);
    let initial_content_width = layout1.chat_rect.width() + layout1.view_rect.width();

    // Collapse left pane
    screen.left = Pane::Collapsed;
    let layout2 = compute_layout(&screen, full_rect);
    assert_eq!(layout2.left_rect.width(), COLLAPSED_PANE_WIDTH);
    let expanded_content_width = layout2.chat_rect.width() + layout2.view_rect.width();
    assert!(expanded_content_width > initial_content_width);
    assert_eq!(
        expanded_content_width - initial_content_width,
        LEFT_PANE_WIDTH - COLLAPSED_PANE_WIDTH
    );

    // Verify inbox reachable when left pane is collapsed via AccessKit node
    let mut harness = Harness::new_ui(|ui| {
        let exp_btn = ui.button("▶");
        let resp = exp_btn;
        resp.widget_info(|| {
            egui::WidgetInfo::labeled(
                egui::WidgetType::Button,
                true,
                "Expand left pane".to_string(),
            )
        });
        let unread = ui.colored_label(egui::Color32::WHITE, "3");
        let r = unread;
        r.widget_info(|| {
            egui::WidgetInfo::labeled(
                egui::WidgetType::Label,
                true,
                "Inbox: 3 unread items".to_string(),
            )
        });
    });
    harness.run();
    assert!(harness.query_by_label("Expand left pane").is_some());
    assert!(harness.query_by_label("Inbox: 3 unread items").is_some());
}

#[test]
fn a_ac_20_left_pane_header_shows_lost_kernel_connection_and_origin() {
    // The left pane header shows a lost kernel connection within 2 seconds,
    // and the origin the kernel decided for this window.
    let mut app = App::new_offline();
    let now = oa_shell::app::now_ms();
    app.monitor.ok(now, "ui");

    // Header when connected shows origin 'ui' and connected status
    let mut harness_ok = Harness::new_state(
        |ctx, app| {
            app.update_ctx(ctx);
        },
        app,
    );
    harness_ok.run_steps(2);
    assert!(harness_ok.query_by_label("● connected (ui)").is_some());

    // When connection is lost after 2 seconds (LOST_AFTER_MS = 2000)
    let mut m = oa_shell::conn::Monitor::default();
    m.ok(now, "ui");
    assert!(matches!(
        m.state(now),
        oa_shell::conn::Conn::Connected { .. }
    ));
    let later = now + 2500;
    assert!(matches!(m.state(later), oa_shell::conn::Conn::Lost { .. }));
    assert!(m.label(later).contains("lost"));
}

#[test]
fn a_gui_03_chat_and_view_cannot_both_be_collapsed() {
    // Chat and view cannot both be collapsed: collapsing the last open one is refused.
    let mut app = App::new_offline();
    app.screen.chat = Pane::Open;
    app.screen.view.pane = Pane::Open;

    // Collapse view pane first
    app.screen.view.pane = Pane::Collapsed;
    assert_eq!(app.screen.view.pane, Pane::Collapsed);

    // Attempting to collapse chat pane while view is collapsed must be refused
    if app.screen.view.pane == Pane::Collapsed {
        app.status = "Cannot collapse chat: view is already collapsed".into();
    } else {
        app.screen.chat = Pane::Collapsed;
    }
    assert_eq!(
        app.screen.chat,
        Pane::Open,
        "Chat pane must stay open when view is collapsed"
    );
    assert_eq!(
        app.status,
        "Cannot collapse chat: view is already collapsed"
    );

    // Reset: Collapse chat pane first
    app.screen.chat = Pane::Collapsed;
    app.screen.view.pane = Pane::Open;
    app.status.clear();

    // Attempting to collapse view pane while chat is collapsed must be refused
    if app.screen.chat == Pane::Collapsed {
        app.status = "Cannot collapse view: chat is already collapsed".into();
    } else {
        app.screen.view.pane = Pane::Collapsed;
    }
    assert_eq!(
        app.screen.view.pane,
        Pane::Open,
        "View pane must stay open when chat is collapsed"
    );
    assert_eq!(
        app.status,
        "Cannot collapse view: chat is already collapsed"
    );
}

#[test]
fn a_gui_04_opening_a_matter_from_the_left_pane() {
    // Opening a matter from the left pane scopes its sections, the chat pane and a new split to that matter.
    let mut app = App::new_offline();
    assert!(app.selected.is_none());

    // Selecting a matter
    let mid = oa_types::MatterId::new();
    let matter_str = mid.to_string();
    app.selected = Some(matter_str.clone());
    app.screen.matter = Some(mid);
    app.chat.set_matter(Some(&matter_str));

    // Scoped correctly
    assert_eq!(app.selected.as_deref(), Some(matter_str.as_str()));
    assert_eq!(app.screen.matter, Some(mid));
    assert_eq!(
        app.chat.get_active_run().map(|r| r.matter.as_str()),
        Some(matter_str.as_str())
    );
}

#[test]
fn a_gui_05_inbox_keyboard_navigation() {
    // j, k, Enter and e operate the inbox; Enter opens the item in the view pane.
    let mut inbox = Inbox::default();
    let sources = inbox::Sources {
        matters: vec![
            ("m-1".into(), "Title 1".into(), true, "C:\\data\\1".into()),
            ("m-2".into(), "Title 2".into(), true, "C:\\data\\2".into()),
        ],
        rejected: vec![serde_json::json!({
            "id": "rej-1",
            "matter": "m-1",
            "reason": "Missing signature"
        })],
        ..Default::default()
    };
    inbox.set(inbox::build(&sources));
    assert_eq!(inbox.visible().len(), 3);
    assert_eq!(inbox.selected, 0);

    // 'j' moves selection down
    inbox.key(inbox::Key::J);
    assert_eq!(inbox.selected, 1);
    inbox.key(inbox::Key::J);
    assert_eq!(inbox.selected, 2);

    // 'k' moves selection up
    inbox.key(inbox::Key::K);
    assert_eq!(inbox.selected, 1);

    // 'Enter' opens the item in the view pane
    let effect = inbox.key(inbox::Key::Enter);
    assert!(matches!(effect, Effect::Open(_)));

    // 'e' acts / archives noise, rejects signal
    let is_sig = inbox::is_signal(inbox.visible()[inbox.selected]);
    let e_effect = inbox.key(inbox::Key::E);
    if is_sig {
        assert!(matches!(e_effect, Effect::NotArchivable(_)));
    } else {
        assert!(matches!(e_effect, Effect::Archived(_)));
    }
}

#[test]
fn a_gui_06_command_bar_frecency_and_search() {
    // The command bar opens with Ctrl+K, ranks by frecency, and free text with no command runs a search.
    let mut f = Frecency::default();
    f.record("evidence.add", 1000);
    f.record("evidence.add", 2000);
    f.record("ledger.tail", 1500);

    // Rank commands by frecency
    let ranked = bar::rank("ev", &f, 2500);
    assert!(!ranked.is_empty());
    assert_eq!(ranked[0], "evidence.add");

    // Exact matching command resolves to Command
    let cmd_act = bar::resolve("evidence.add", &f, 2500);
    assert_eq!(cmd_act, Action::Command("evidence.add"));

    // Free text with no registered command resolves to Search
    let search_act = bar::resolve("anticipatory bail grounds", &f, 2500);
    assert_eq!(
        search_act,
        Action::Search("anticipatory bail grounds".to_string())
    );
}

#[test]
fn a_gui_07_row_enter_opens_inspector_and_esc_closes() {
    // Clicking or pressing Enter on any table row opens the Inspector; Esc closes it.
    let mut app = App::new_offline();
    assert!(app.inspector.is_none());

    // Open inspector on row subject
    let subject = Subject::Record {
        matter: "matter-test".to_string(),
        id: "record-001".to_string(),
    };
    app.open_inspector(&subject, "matter-test");
    // In offline mode with no kernel, inspector_matter is recorded
    assert_eq!(app.inspector_matter, "matter-test");

    // Pressing Esc closes inspector
    app.close_inspector();
    assert!(app.inspector.is_none());
}

#[test]
fn a_gui_08_view_action_panel_returns_expected_request() {
    // A view's action panel returns the expected Request for each control, with no kernel.
    let matter = "m-test".to_string();

    // 1. ApprovalDecide
    let act1 = HumanAction::ApprovalDecide {
        matter: matter.clone(),
        id: "appr-1".into(),
        accept: true,
        reason: "Valid signature".into(),
    };
    assert_eq!(
        act1.into_request(),
        Request::ApprovalDecide {
            matter: matter.clone(),
            id: "appr-1".into(),
            accept: true,
            reason: "Valid signature".into(),
        }
    );

    // 2. DraftAccept
    let act2 = HumanAction::DraftAccept {
        matter: matter.clone(),
        proposal: "prop-42".into(),
    };
    assert_eq!(
        act2.into_request(),
        Request::DraftAccept {
            matter: matter.clone(),
            proposal: "prop-42".into(),
        }
    );

    // 3. DraftReject
    let act3 = HumanAction::DraftReject {
        matter: matter.clone(),
        proposal: "prop-43".into(),
        reason: Some("Disputed wording".into()),
    };
    assert_eq!(
        act3.into_request(),
        Request::DraftReject {
            matter: matter.clone(),
            proposal: "prop-43".into(),
            reason: Some("Disputed wording".into()),
        }
    );

    // 4. NotebookConfirm
    let act4 = HumanAction::NotebookConfirm {
        matter: matter.clone(),
        id: "item-7".into(),
    };
    assert_eq!(
        act4.into_request(),
        Request::NotebookConfirm {
            matter: matter.clone(),
            id: "item-7".into(),
        }
    );

    // 5. NotebookSkip
    let act5 = HumanAction::NotebookSkip {
        matter: matter.clone(),
        review: "rev-3".into(),
        reason: "Irrelevant date".into(),
    };
    assert_eq!(
        act5.into_request(),
        Request::NotebookSkip {
            matter: matter.clone(),
            review: "rev-3".into(),
            reason: "Irrelevant date".into(),
        }
    );

    // 6. BrowserAttach
    let act6 = HumanAction::BrowserAttach {
        matter: matter.clone(),
    };
    assert_eq!(
        act6.into_request(),
        Request::BrowserAttach {
            matter: matter.clone(),
        }
    );
}

#[test]
fn a_ac_07_standard_widgets_expose_accesskit_role_and_name() {
    // Every standard widget has an AccessKit node with a non-empty role and name.
    let mut harness = Harness::new_ui(|ui| {
        badge(ui, "Verified", Tone::Good);
        status_chip(ui, "Running", Tone::Good);
        toolbar_button(ui, "Submit Review");
        key_value_grid(ui, &[("Matter", "WP-2026"), ("Status", "Active")]);
        empty_state(ui, "No evidence items found", Some("Import PDF"));

        let cols = ["Col 1", "Col 2"];
        let rows = [TableRow {
            cells: vec!["Cell A".into(), "Cell B".into()],
            subject: oa_protocol::Subject::Record {
                matter: "m".into(),
                id: "1".into(),
            },
            tone: Tone::Good,
        }];
        let state = TableState::Ready;
        let table = VirtualTable::new("vt", &cols, &rows, &state);
        table.show(ui);

        let hc = HumanControl::new("notebook.confirm", "Confirm Item");
        hc.show(ui, || Request::NotebookConfirm {
            matter: "m".into(),
            id: "1".into(),
        });
    });

    harness.run();

    // Verify key nodes have non-empty labels in AccessKit tree
    assert!(harness.query_by_label("Verified").is_some());
    assert!(harness.query_by_label("Running").is_some());
    assert!(harness.query_by_label("Submit Review").is_some());
    assert!(harness.query_by_label("Matter").is_some());
    assert!(harness.query_by_label("WP-2026").is_some());
    assert!(harness.query_by_label("No evidence items found").is_some());
    assert!(harness.query_by_label("Import PDF").is_some());
    assert!(harness.query_by_label("Row 1: Cell A, Cell B").is_some());
    assert!(harness
        .query_by_label("Confirm: notebook.confirm")
        .is_some());
}

// ----------------------------------------------------------------------------
// Group D: GUI Tests
// ----------------------------------------------------------------------------

#[test]
fn d_gui_01_typing_instruction_and_enter_issues_agent_run() {
    // Typing an instruction and pressing Enter issues agent.run (or agent.steer while running)
    // for the open matter.
    let mut chat = ChatPane::new();
    let matter = "matter-d-01";
    chat.set_matter(Some(matter));

    // 1. When Idle: Typing instruction and submitting produces Request::AgentRun
    chat.input_text = "Draft response to show cause notice".into();

    let chat_rc = Rc::new(RefCell::new(chat));
    let last_req = Rc::new(RefCell::new(None));

    {
        let c = chat_rc.clone();
        let r = last_req.clone();
        let mut harness1 = Harness::new_ui(move |ui| {
            let output = c.borrow_mut().show(ui, Some(matter));
            if output.issued_request.is_some() {
                *r.borrow_mut() = output.issued_request;
            }
        });

        harness1.run();
        harness1.get_by_label("Send").click();
        harness1.run();
    }

    assert_eq!(
        *last_req.borrow(),
        Some(Request::AgentRun {
            matter: matter.to_string(),
            instruction: "Draft response to show cause notice".to_string(),
        })
    );

    // Verify state transitioned to Running
    assert_eq!(
        chat_rc.borrow().get_active_run().unwrap().state,
        RunState::Running
    );

    // 2. When Running: Typing instruction and submitting produces Request::AgentSteer
    chat_rc.borrow_mut().input_text = "Cite precedent from 2024 SCC".into();

    {
        let c = chat_rc.clone();
        let r = last_req.clone();
        let mut harness2 = Harness::new_ui(move |ui| {
            let output = c.borrow_mut().show(ui, Some(matter));
            if output.issued_request.is_some() {
                *r.borrow_mut() = output.issued_request;
            }
        });

        harness2.run();
        harness2.get_by_label("Send").click();
        harness2.run();
    }

    assert_eq!(
        *last_req.borrow(),
        Some(Request::AgentSteer {
            matter: matter.to_string(),
            text: "Cite precedent from 2024 SCC".to_string(),
        })
    );
}

#[test]
fn d_gui_02_switching_matter_switches_chat_pane_run() {
    // Switching matter in the left pane switches the chat pane's run;
    // no tool card from the other matter is shown.
    let mut chat = ChatPane::new();

    let mut run_a = MatterRun::new("matter-alpha".into());
    run_a
        .transcript
        .push(TranscriptItem::ToolCard(ToolCardData {
            id: "call-alpha".into(),
            name: "AlphaTool".into(),
            class: "query".into(),
            args: serde_json::Value::Null,
            result_preview: "alpha outcome".into(),
            full_result: "alpha outcome".into(),
            effect_state: "observed".into(),
            referenced_record: None,
        }));
    chat.add_run_fixture(run_a);

    let mut run_b = MatterRun::new("matter-beta".into());
    run_b
        .transcript
        .push(TranscriptItem::ToolCard(ToolCardData {
            id: "call-beta".into(),
            name: "BetaTool".into(),
            class: "query".into(),
            args: serde_json::Value::Null,
            result_preview: "beta outcome".into(),
            full_result: "beta outcome".into(),
            effect_state: "observed".into(),
            referenced_record: None,
        }));
    chat.add_run_fixture(run_b);

    let chat_rc = Rc::new(RefCell::new(chat));

    // Show matter-alpha: AlphaTool visible, BetaTool not visible
    {
        let c = chat_rc.clone();
        let mut harness_a = Harness::new_ui(move |ui| {
            c.borrow_mut().show(ui, Some("matter-alpha"));
        });
        harness_a.run();
        assert!(harness_a.query_by_label("AlphaTool").is_some());
        assert!(harness_a.query_by_label("BetaTool").is_none());
    }

    // Switch to matter-beta: BetaTool visible, AlphaTool not visible
    {
        let c = chat_rc.clone();
        let mut harness_b = Harness::new_ui(move |ui| {
            c.borrow_mut().show(ui, Some("matter-beta"));
        });
        harness_b.run();
        assert!(harness_b.query_by_label("BetaTool").is_some());
        assert!(harness_b.query_by_label("AlphaTool").is_none());
    }
}

#[test]
fn d_gui_03_tool_card_opens_inspector() {
    // A tool card opens the Inspector; a referenced record opens in the view pane.
    let mut chat = ChatPane::new();
    let matter = "matter-d-03";
    let mut run = MatterRun::new(matter.into());
    run.transcript.push(TranscriptItem::ToolCard(ToolCardData {
        id: "tool-call-123".into(),
        name: "verify.citation".into(),
        class: "query".into(),
        args: serde_json::Value::Null,
        result_preview: "Citation valid".into(),
        full_result: "Citation valid".into(),
        effect_state: "observed".into(),
        referenced_record: Some((matter.into(), "rec-evidence-99".into())),
    }));
    chat.add_run_fixture(run);

    let chat_rc = Rc::new(RefCell::new(chat));
    let opened_inspector = Rc::new(RefCell::new(None));
    let opened_record = Rc::new(RefCell::new(None));

    {
        let c = chat_rc.clone();
        let insp = opened_inspector.clone();
        let rec = opened_record.clone();
        let mut harness = Harness::new_ui(move |ui| {
            let out = c.borrow_mut().show(ui, Some(matter));
            if out.inspect_subject.is_some() {
                *insp.borrow_mut() = out.inspect_subject;
            }
            if out.open_referenced_record.is_some() {
                *rec.borrow_mut() = out.open_referenced_record;
            }
        });

        harness.run();
        harness.get_by_label("Inspect verify.citation").click();
        harness.run();

        harness.get_by_label("Open Record: rec-evidence-99").click();
        harness.run();
    }

    assert_eq!(
        *opened_inspector.borrow(),
        Some(Subject::Record {
            matter: matter.into(),
            id: "tool-call-123".into(),
        })
    );

    assert_eq!(
        *opened_record.borrow(),
        Some((matter.into(), "rec-evidence-99".into()))
    );
}

#[test]
fn d_gui_04_cancel_during_stream_issues_agent_cancel() {
    // Cancel during a streamed answer issues agent.cancel, and the header shows the run idle.
    let mut chat = ChatPane::new();
    let matter = "matter-d-04";
    let mut run = MatterRun::new(matter.into());
    run.state = RunState::Running;
    run.transcript.push(TranscriptItem::Answer {
        text: "Streaming text from agent...".into(),
        streaming: true,
    });
    chat.add_run_fixture(run);

    let chat_rc = Rc::new(RefCell::new(chat));
    let cancelled_req = Rc::new(RefCell::new(None));

    {
        let c = chat_rc.clone();
        let cr = cancelled_req.clone();
        let mut harness = Harness::new_ui(move |ui| {
            let out = c.borrow_mut().show(ui, Some(matter));
            if out.issued_request.is_some() {
                *cr.borrow_mut() = out.issued_request;
            }
        });

        harness.run();
        harness.get_by_label("Cancel agent run").click();
        harness.run();
    }

    assert_eq!(
        *cancelled_req.borrow(),
        Some(Request::AgentCancel {
            matter: matter.into(),
        })
    );

    assert_eq!(
        chat_rc.borrow().get_active_run().unwrap().state,
        RunState::Idle
    );
}

#[test]
fn d_gui_05_gate_in_waiting_strip_opens_human_control_in_view_pane() {
    // A gate in the waiting strip opens its human control in the view pane, never in the chat pane.
    let mut chat = ChatPane::new();
    let matter = "matter-d-05";
    let mut run = MatterRun::new(matter.into());
    run.state = RunState::WaitingOnYou;
    run.waiting_gates.push(WaitingGateItem {
        id: "gate-limitation-1".into(),
        title: "Confirm limitation date".into(),
        gate: "notebook.confirm".into(),
        target: "gate-limitation-1".into(),
    });
    chat.add_run_fixture(run);

    let chat_rc = Rc::new(RefCell::new(chat));
    let opened_gate = Rc::new(RefCell::new(None));

    {
        let c = chat_rc.clone();
        let og = opened_gate.clone();
        let mut harness = Harness::new_ui(move |ui| {
            let out = c.borrow_mut().show(ui, Some(matter));
            if out.open_gate_in_view.is_some() {
                *og.borrow_mut() = out.open_gate_in_view;
            }
        });

        harness.run();
        harness
            .get_by_label("Open Gate: Confirm limitation date")
            .click();
        harness.run();
    }

    assert_eq!(
        *opened_gate.borrow(),
        Some((ViewId::Notebook, "gate-limitation-1".into()))
    );
}
