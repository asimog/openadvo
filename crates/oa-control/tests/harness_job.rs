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

#[test]
fn b_ac_18_a_process_in_the_harness_job_cannot_break_away_and_dies_when_job_closes() {
    let job = HarnessJob::new().unwrap();
    let mut child = Command::new("cmd")
        .args(["/C", "ping -n 10 127.0.0.1 >NUL"])
        .spawn()
        .unwrap();

    job.assign(child.id()).unwrap();
    assert!(
        job.contains(child.id()),
        "the child process is placed in the harness job"
    );
    assert!(
        child.try_wait().unwrap().is_none(),
        "the child is actively running"
    );

    // Dropping the job closes its handle. With JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    // the system terminates all processes in the job immediately.
    drop(job);

    let start = std::time::Instant::now();
    let mut terminated = false;
    while start.elapsed() < std::time::Duration::from_secs(3) {
        if child.try_wait().unwrap().is_some() {
            terminated = true;
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    assert!(
        terminated,
        "the child process died when the harness job closed"
    );
}
