//! A process in the harness job is the harness, whatever it claims (X-19).
//! This file is its own test process, because it puts itself in the job.
#![cfg(windows)]

use std::process::Command;
use std::sync::Arc;

use oa_client::{Client, PipeClient};
use oa_control::{serve, HarnessJob, PipeListener};
use oa_kernel::{ClientSpec, Hooks, Kernel, Request};
use oa_protocol::pipe_name;
use oa_store::sqlite::SqliteFactory;
use oa_types::{new_key, ErrorCode, Origin};

#[test]
fn b_ac_03_and_b_ac_05_the_harness_job_decides_the_origin() {
    let tmp = tempfile::tempdir().unwrap();
    let app = tmp.path().join("app");
    let kernel = Arc::new(Kernel::new(&app, Arc::new(SqliteFactory), Hooks::default()));
    kernel
        .dispatch(
            &oa_kernel::Ctx::new(Origin::Cli, new_key()),
            Request::WorkspaceInit {
                root: tmp.path().join("root"),
            },
        )
        .unwrap();

    let job = Arc::new(HarnessJob::new().unwrap());
    job.assign_current_process().unwrap();
    let listener = PipeListener::bind(&pipe_name(&app));
    let served = job.clone();
    std::thread::spawn(move || serve(kernel, Some(served), listener));

    // B-AC-05: the client claims `cli`, the kernel records `harness`.
    let c = PipeClient::connect(&app, Origin::Cli).unwrap();
    assert_eq!(c.origin(), Origin::Harness);

    // An agent may propose a matter for a new client, but not confirm it.
    let proposed = c
        .call(
            Some(new_key()),
            Request::MatterCreate {
                title: "M".into(),
                client: ClientSpec::New("Client".into()),
                from: None,
            },
        )
        .unwrap_err();
    assert_eq!(proposed.code, ErrorCode::ConfirmationRequired);
    let pending = proposed.detail.unwrap()["pending_id"]
        .as_str()
        .unwrap()
        .to_string();

    // B-AC-03: a human command on a harness connection is refused.
    let refused = c
        .call(Some(new_key()), Request::MatterConfirm { pending })
        .unwrap_err();
    assert_eq!(refused.code, ErrorCode::HumanCommandRefused);
    assert_eq!(refused.code.exit_code(), 3);

    // Children inherit the job, so `oa` started by the agent is the agent too.
    let mut child = Command::new("cmd")
        .args(["/C", "ping -n 3 127.0.0.1 >NUL"])
        .spawn()
        .unwrap();
    assert!(
        job.contains(child.id()),
        "a child of the harness is in the job"
    );
    let _ = child.kill();
    let _ = child.wait();
}
