//! Visual snapshot tests for Open Advocate window (spec A and spec D).
//!
//! Compares `egui_kittest` image snapshots of each gallery and frame state
//! against committed baseline PNGs using deterministic software renderer.

use eframe::egui::{self, Vec2};
use egui_kittest::Harness;
use oa_protocol::{Pane, Split, ViewArea, ViewId as ProtoViewId};
use oa_shell::chat::{
    ChatPane, MatterRun, RunState, ToolCardData, TranscriptItem, WaitingGateItem,
};
use oa_shell::paint;
use oa_shell::ui::widgets::{honest_treatment, HonestTreatment};
use oa_shell::views::{fixture, GalleryState, ViewId};
use oa_shell::App;

#[test]
fn a_vis_01_frame_three_regions_1920_and_1366() {
    // 1920x1080 resolution
    let mut app = App::new_offline();
    app.screen.left = Pane::Open;
    app.screen.chat = Pane::Open;
    app.screen.view = ViewArea {
        pane: Pane::Open,
        splits: vec![Split::new(ProtoViewId::Overview)],
        focus: 0,
    };
    app.selected = Some("matter-demo".into());
    app.chat.set_matter(Some("matter-demo"));

    let mut harness_1920 = Harness::new_state(
        |ctx, app| {
            app.update_ctx(ctx);
        },
        app,
    );
    harness_1920.set_size(Vec2::new(1920.0, 1080.0));
    harness_1920.run();
    harness_1920.snapshot("a_vis_01_frame_three_regions_1920");

    // 1366x768 resolution
    let mut app2 = App::new_offline();
    app2.screen.left = Pane::Open;
    app2.screen.chat = Pane::Open;
    app2.screen.view = ViewArea {
        pane: Pane::Open,
        splits: vec![Split::new(ProtoViewId::Overview)],
        focus: 0,
    };
    app2.selected = Some("matter-demo".into());
    app2.chat.set_matter(Some("matter-demo"));

    let mut harness_1366 = Harness::new_state(
        |ctx, app| {
            app.update_ctx(ctx);
        },
        app2,
    );
    harness_1366.set_size(Vec2::new(1366.0, 768.0));
    harness_1366.run();
    harness_1366.snapshot("a_vis_01_frame_three_regions_1366");
}

#[test]
fn a_vis_02_frame_view_collapsed_and_left_collapsed() {
    // Frame with view pane collapsed
    let mut app1 = App::new_offline();
    app1.screen.left = Pane::Open;
    app1.screen.chat = Pane::Open;
    app1.screen.view.pane = Pane::Collapsed;
    app1.selected = Some("matter-demo".into());
    app1.chat.set_matter(Some("matter-demo"));

    let mut harness_view_collapsed = Harness::new_state(
        |ctx, app| {
            app.update_ctx(ctx);
        },
        app1,
    );
    harness_view_collapsed.set_size(Vec2::new(1920.0, 1080.0));
    harness_view_collapsed.run();
    harness_view_collapsed.snapshot("a_vis_02_frame_view_collapsed");

    // Frame with left pane collapsed
    let mut app2 = App::new_offline();
    app2.screen.left = Pane::Collapsed;
    app2.screen.chat = Pane::Open;
    app2.screen.view = ViewArea {
        pane: Pane::Open,
        splits: vec![Split::new(ProtoViewId::Overview)],
        focus: 0,
    };
    app2.selected = Some("matter-demo".into());
    app2.chat.set_matter(Some("matter-demo"));

    let mut harness_left_collapsed = Harness::new_state(
        |ctx, app| {
            app.update_ctx(ctx);
        },
        app2,
    );
    harness_left_collapsed.set_size(Vec2::new(1920.0, 1080.0));
    harness_left_collapsed.run();
    harness_left_collapsed.snapshot("a_vis_02_frame_left_collapsed");
}

#[test]
fn a_vis_03_every_view_in_six_gallery_states() {
    let group_a_views = [
        ViewId::Matters,
        ViewId::Overview,
        ViewId::Ledger,
        ViewId::Evidence,
        ViewId::Drafts,
        ViewId::Approvals,
        ViewId::Rejected,
        ViewId::Jobs,
        ViewId::Settings,
        ViewId::Search,
        ViewId::Inspector,
    ];

    let mut harness = Harness::new_ui(|ui| {
        egui::ScrollArea::vertical().show(ui, |ui| {
            ui.heading("Group A Views - Gallery States");
            for &view in &group_a_views {
                ui.separator();
                ui.label(egui::RichText::new(format!("View: {:?}", view)).strong());
                for &state in &GalleryState::ALL {
                    ui.label(egui::RichText::new(format!("State: {}", state.name())).italics());
                    let t = fixture(view, state);
                    let mut selected = None;
                    paint::table(ui, (view, state.name()), &t, &mut selected);
                    ui.add_space(4.0);
                }
            }
        });
    });

    harness.set_size(Vec2::new(1280.0, 2400.0));
    harness.run_steps(2);
    harness.snapshot("a_vis_03_every_view_in_six_gallery_states");
}

#[test]
fn a_vis_04_four_honest_label_treatments_side_by_side() {
    let mut harness = Harness::new_ui(|ui| {
        ui.heading("Honest Trust Labels (PH-10, A-VIS-04)");
        ui.label("None shares a colour, shape, or word:");
        ui.add_space(16.0);

        ui.horizontal(|ui| {
            // 1. Validator outcome: Strictly unavailable until ULOS verification exists
            honest_treatment(ui, HonestTreatment::ValidatorOutcome);
            ui.add_space(16.0);

            // 2. Quick check: Pattern match, explicitly unverified
            honest_treatment(ui, HonestTreatment::QuickCheck);
            ui.add_space(16.0);

            // 3. Advisory score: Model heuristic ranking
            honest_treatment(ui, HonestTreatment::AdvisoryScore);
            ui.add_space(16.0);

            // 4. Advocate attestation: Signed by human advocate
            honest_treatment(ui, HonestTreatment::Attestation);
        });
    });

    harness.set_size(Vec2::new(800.0, 200.0));
    harness.run();
    harness.snapshot("a_vis_04_four_honest_label_treatments_side_by_side");
}

#[test]
fn d_vis_01_chat_pane_states_and_long_tool_card() {
    let mut chat = ChatPane::new();
    let matter = "matter-visual-d";
    chat.set_matter(Some(matter));

    let mut run = MatterRun::new(matter.into());
    run.state = RunState::WaitingOnYou;
    run.plan_step = Some("Drafting Rejoinder Section 4".into());
    run.cost_cents = 345;

    // Transcript with instruction, answer, and long tool card
    run.transcript.push(TranscriptItem::Instruction {
        text: "Analyze citations and prepare draft of grounds of appeal against conviction".into(),
        turn: 1,
    });
    run.transcript.push(TranscriptItem::ToolCard(ToolCardData {
        id: "tool-call-long-01".into(),
        name: "verify.jurisdiction".into(),
        class: "query".into(),
        args: serde_json::json!({
            "court": "High Court of Karnataka",
            "statute": "Arbitration and Conciliation Act, 1996",
            "section": "Section 11(6)",
            "benchmark_bench": "Division Bench"
        }),
        result_preview: "Verified territorial jurisdiction under Section 11(6) with neutral citation 2024 INSC 481 and confirmed valid limitation period of 3 years under Article 137 of Limitation Act.".into(),
        full_result: "Jurisdiction and limitation verified without conflict.".into(),
        effect_state: "observed".into(),
        referenced_record: Some((matter.into(), "doc-petition-final".into())),
    }));
    run.transcript.push(TranscriptItem::Answer {
        text: "Jurisdiction grounds confirmed based on 2024 INSC 481. Standing ready for advocate attestation before filing."
            .into(),
        streaming: false,
    });

    run.waiting_gates.push(WaitingGateItem {
        id: "gate-limitation-check".into(),
        title: "Confirm Limitation Period".into(),
        gate: "notebook.confirm".into(),
        target: "gate-limitation-check".into(),
    });

    chat.add_run_fixture(run);

    let mut harness = Harness::new_ui(|ui| {
        chat.show(ui, Some(matter));
    });

    harness.set_size(Vec2::new(500.0, 800.0));
    harness.run();
    harness.snapshot("d_vis_01_chat_pane_states_and_long_tool_card");
}

#[test]
fn d_vis_02_chat_pane_rightmost_view_collapsed() {
    let mut app = App::new_offline();
    app.screen.left = Pane::Open;
    app.screen.chat = Pane::Open;
    app.screen.view.pane = Pane::Collapsed;
    app.selected = Some("matter-rightmost".into());
    app.chat.set_matter(Some("matter-rightmost"));

    let mut run = MatterRun::new("matter-rightmost".into());
    run.state = RunState::Running;
    run.plan_step = Some("Summarizing trial evidence".into());
    run.transcript.push(TranscriptItem::Instruction {
        text: "Summarize depositions of PW-1 and PW-2".into(),
        turn: 1,
    });
    run.transcript.push(TranscriptItem::Answer {
        text: "Analyzing trial court records...".into(),
        streaming: true,
    });
    app.chat.add_run_fixture(run);

    let mut harness = Harness::new_state(
        |ctx, app| {
            app.update_ctx(ctx);
        },
        app,
    );
    harness.set_size(Vec2::new(1920.0, 1080.0));
    harness.run();
    harness.snapshot("d_vis_02_chat_pane_rightmost_view_collapsed");
}

#[test]
fn d_vis_03_group_d_views_six_gallery_states() {
    let group_d_views = [
        ViewId::ToolCard,
        ViewId::ContextManifest,
        ViewId::WaitingOnYou,
        ViewId::SubAgents,
        ViewId::MatterMemory,
        ViewId::Effects,
        ViewId::Services,
    ];

    let mut harness = Harness::new_ui(|ui| {
        egui::ScrollArea::vertical().show(ui, |ui| {
            ui.heading("Group D Views - Gallery States");
            for &view in &group_d_views {
                ui.separator();
                ui.label(egui::RichText::new(format!("View: {:?}", view)).strong());
                for &state in &GalleryState::ALL {
                    ui.label(egui::RichText::new(format!("State: {}", state.name())).italics());
                    let t = fixture(view, state);
                    let mut selected = None;
                    paint::table(ui, (view, state.name()), &t, &mut selected);
                    ui.add_space(4.0);
                }
            }
        });
    });

    harness.set_size(Vec2::new(1280.0, 1600.0));
    harness.run_steps(2);
    harness.snapshot("d_vis_03_group_d_views_six_gallery_states");
}
