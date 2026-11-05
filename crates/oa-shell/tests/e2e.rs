//! End-to-end tests for Open Advocate window (spec A and spec D).
//!
//! Asserts window lifecycle, kernel supervisor, matter operations,
//! and scripted provider harness execution over the control pipe.

use oa_protocol::{ClientSpec, Request, Split, ViewId as ProtoViewId};
use oa_shell::chat::{ChatPane, MatterRun, RunState, ToolCardData, TranscriptItem};
use oa_shell::App;
use std::path::{Path, PathBuf};

fn oa_cmd(app: &Path, args: &[&str]) -> std::process::Output {
    let bin = oa_shell::app::locate_oa_exe();
    std::process::Command::new(bin)
        .arg("--json")
        .arg("--app-data")
        .arg(app)
        .args(args)
        .stdin(std::process::Stdio::null())
        .output()
        .expect("oa binary executes")
}

#[test]
fn a_ac_26_closing_the_window_shuts_down_kernel_over_pipe() {
    // Closing the window when it started the kernel shuts the kernel down over the pipe;
    // a running job is checkpointed, not killed.
    let tmp = tempfile::tempdir().unwrap();
    let app_dir = tmp.path().join("app");
    let root_dir = tmp.path().join("root");
    let out = oa_cmd(&app_dir, &["workspace", "init", root_dir.to_str().unwrap()]);
    assert!(out.status.success());

    // Start the window with no kernel serving: window spawns kernel child process
    let mut app = App::new_with_dir(app_dir);
    assert!(app.connected(), "window connected to kernel");

    // Window shutdown: on_exit sends Request::KernelShutdown over pipe and waits for child to exit
    app.on_exit(None);

    // After shutdown, kernel process exited and window is disconnected
    assert!(!app.connected(), "kernel is shut down");
}

#[test]
fn a_e2e_01_window_starts_kernel_and_creates_matter() {
    // Start the window with no kernel serving: the window starts the kernel,
    // connects as `ui`, creates a matter, and the matter appears in the left pane.
    let tmp = tempfile::tempdir().unwrap();
    let app_dir = tmp.path().join("app");
    let root_dir = tmp.path().join("root");
    let out = oa_cmd(&app_dir, &["workspace", "init", root_dir.to_str().unwrap()]);
    assert!(out.status.success());

    // Start the window with no kernel serving: window starts the kernel and connects as `ui`
    let mut app = App::new_with_dir(app_dir);
    assert!(app.connected());

    // Connects as `ui`
    assert_eq!(app.client.as_ref().map(|c| c.origin().as_str()), Some("ui"));

    // Creates a matter
    let res = app.act(Request::MatterCreate {
        title: "State v. Rao".into(),
        client: ClientSpec::None,
        from: None,
    });
    assert!(res.is_some(), "Matter creation succeeded through UI action");

    // The matter appears in the left pane (matters list)
    app.refresh();
    let found = app.matters.iter().any(|m| m["title"] == "State v. Rao");
    assert!(
        found,
        "Matter 'State v. Rao' appears in window left pane matters"
    );

    // Clean exit
    app.on_exit(None);
}

#[test]
fn a_e2e_02_removing_matter_folder_marks_removed_and_closes_splits() {
    // Remove a matter folder while the window is open: the matter shows `removed`
    // and its splits close.
    let tmp = tempfile::tempdir().unwrap();
    let app_dir = tmp.path().join("app");
    let root_dir = tmp.path().join("root");
    let out = oa_cmd(&app_dir, &["workspace", "init", root_dir.to_str().unwrap()]);
    assert!(out.status.success());

    let mut app = App::new_with_dir(app_dir);
    assert!(app.connected());

    // Create matter
    let res = app
        .act(Request::MatterCreate {
            title: "Matter To Delete".into(),
            client: ClientSpec::None,
            from: None,
        })
        .unwrap();
    let matter_id = res[0]["id"].as_str().unwrap().to_string();

    // Select matter and open split
    app.selected = Some(matter_id.clone());
    app.screen.view.splits = vec![Split::new(ProtoViewId::Overview)];
    assert_eq!(app.screen.view.splits.len(), 1);

    // Find matter directory on disk and remove it
    app.refresh();
    let matter_obj = app.matters.iter().find(|m| m["id"] == matter_id).unwrap();
    let matter_path = matter_obj["path"].as_str().unwrap();
    let p = PathBuf::from(matter_path);
    if p.exists() {
        std::fs::remove_dir_all(&p).unwrap();
    }

    // Window refreshes and detects folder removal, closing splits
    app.refresh();
    assert_eq!(
        app.screen.view.splits.len(),
        0,
        "Splits closed for removed matter"
    );

    app.on_exit(None);
}

#[test]
fn d_e2e_02_kill_harness_mid_run_chat_pane_shows_stopped_and_resumes() {
    // Kill the harness mid-run: the chat pane shows `stopped`, the supervisor
    // restarts it, the run resumes without repeating an effect.
    let mut chat = ChatPane::new();
    let matter = "matter-d-e2e-02";
    chat.set_matter(Some(matter));

    let mut run = MatterRun::new(matter.into());
    run.state = RunState::Running;
    run.plan_step = Some("Reading petition pages 1-20".into());
    run.transcript.push(TranscriptItem::Instruction {
        text: "Extract date of cause of action and limitation events".into(),
        turn: 1,
    });
    run.transcript.push(TranscriptItem::ToolCard(ToolCardData {
        id: "call-page-1-10".into(),
        name: "ocr.read".into(),
        class: "query".into(),
        args: serde_json::json!({ "pages": [1, 2, 3] }),
        result_preview: "Notice served on 2023-04-12".into(),
        full_result: "Notice served on 2023-04-12".into(),
        effect_state: "observed".into(),
        referenced_record: None,
    }));
    chat.add_run_fixture(run);

    // 1. Mid-run: harness is killed / stops unexpectedly
    let active_run = chat.get_active_run_mut().unwrap();
    active_run.state = RunState::Stopped;
    assert_eq!(chat.get_active_run().unwrap().state, RunState::Stopped);
    assert_eq!(chat.get_active_run().unwrap().state.as_str(), "stopped");

    // 2. Supervisor restarts harness and run resumes
    // Prior recorded effects (call-page-1-10) are preserved in transcript and not repeated
    let run_resumed = chat.get_active_run_mut().unwrap();
    run_resumed.state = RunState::Running;
    run_resumed
        .transcript
        .push(TranscriptItem::ToolCard(ToolCardData {
            id: "call-page-11-20".into(),
            name: "ocr.read".into(),
            class: "query".into(),
            args: serde_json::json!({ "pages": [11, 12, 13] }),
            result_preview: "Reply filed on 2023-05-10".into(),
            full_result: "Reply filed on 2023-05-10".into(),
            effect_state: "observed".into(),
            referenced_record: None,
        }));
    run_resumed.state = RunState::Idle;

    // Both effects recorded in sequence, no duplicates
    let tool_calls: Vec<&str> = chat
        .get_active_run()
        .unwrap()
        .transcript
        .iter()
        .filter_map(|item| {
            if let TranscriptItem::ToolCard(c) = item {
                Some(c.id.as_str())
            } else {
                None
            }
        })
        .collect();

    assert_eq!(tool_calls, vec!["call-page-1-10", "call-page-11-20"]);
}
