//! The profile process boundary is real even though Chromium is a stub. Each
//! test spawns the built `oa-browser-profile` executable once per profile and
//! talks to a local HTTP server that records every request it receives.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

use oa_browser::{
    intercept, sha256, BrowserError, EgressSpec, Initiator, ProcessLauncher, Profile,
    ProfileRequest, Supervisor,
};

const PDF: &[u8] = b"%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n";

#[derive(Debug, Clone)]
struct Seen {
    path: String,
    cookie: Option<String>,
}

struct Server {
    port: u16,
    seen: Arc<Mutex<Vec<Seen>>>,
}

impl Server {
    fn start() -> Server {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = seen.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap_or(0);
                let head = String::from_utf8_lossy(&buf[..n]).to_string();
                let path = head
                    .lines()
                    .next()
                    .and_then(|l| l.split_whitespace().nth(1))
                    .unwrap_or("/")
                    .to_string();
                let cookie = head
                    .lines()
                    .find_map(|l| l.strip_prefix("Cookie: "))
                    .map(str::to_string);
                log.lock().unwrap().push(Seen {
                    path: path.clone(),
                    cookie,
                });
                let (head, body): (String, Vec<u8>) = match path.as_str() {
                    "/login" => (
                        "HTTP/1.0 200 OK\r\nContent-Type: text/html\r\nSet-Cookie: session=advocate-secret; HttpOnly\r\n".into(),
                        b"<html><title>Logged in</title><body>Welcome</body></html>".to_vec(),
                    ),
                    "/case" => (
                        "HTTP/1.0 200 OK
Content-Type: text/html
".into(),
                        oa_capture::SC_CASE_OK.as_bytes().to_vec(),
                    ),
                    "/captcha" => (
                        "HTTP/1.0 200 OK
Content-Type: text/html
".into(),
                        oa_capture::SC_CAPTCHA.as_bytes().to_vec(),
                    ),
                    p if p.starts_with("/orders/") => (
                        "HTTP/1.0 200 OK
Content-Type: application/pdf
".into(),
                        PDF.to_vec(),
                    ),
                    "/order.pdf" => (
                        "HTTP/1.0 200 OK\r\nContent-Type: application/pdf\r\n".into(),
                        PDF.to_vec(),
                    ),
                    "/old" => (
                        "HTTP/1.0 302 Found\r\nLocation: /page\r\n".into(),
                        Vec::new(),
                    ),
                    "/logo.png" => (
                        "HTTP/1.0 200 OK\r\nContent-Type: image/png\r\n".into(),
                        b"png".to_vec(),
                    ),
                    _ => (
                        "HTTP/1.0 200 OK\r\nContent-Type: text/html\r\n".into(),
                        br#"<html><title>Case status</title><body><p id="x">Listing</p>
<img src="/logo.png"><img src="http://tracker.invalid/p.gif"></body></html>"#
                            .to_vec(),
                    ),
                };
                let _ = stream.write_all(head.as_bytes());
                let _ =
                    stream.write_all(format!("Content-Length: {}\r\n\r\n", body.len()).as_bytes());
                let _ = stream.write_all(&body);
            }
        });
        Server { port, seen }
    }

    fn url(&self, path: &str) -> String {
        format!("http://127.0.0.1:{}{path}", self.port)
    }

    fn requests(&self) -> Vec<Seen> {
        self.seen.lock().unwrap().clone()
    }
}

fn supervisor(root: &std::path::Path) -> Supervisor {
    Supervisor::new(
        Arc::new(ProcessLauncher::new(env!(
            "CARGO_BIN_EXE_oa-browser-profile"
        ))),
        root,
    )
}

fn local() -> Option<Vec<String>> {
    Some(vec!["127.0.0.1".into()])
}

fn matter() -> Profile {
    Profile::Matter("01JTESTMATTER".into())
}

#[test]
fn m_ac_01_killing_the_agent_process_leaves_the_visible_and_filing_profiles_running() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = supervisor(dir.path());
    let m = matter();
    s.start(&m, &EgressSpec::for_profile(&m, Some(vec![])))
        .unwrap();
    s.start(
        &Profile::Filing,
        &EgressSpec::for_profile(&Profile::Filing, local()),
    )
    .unwrap();
    s.start(
        &Profile::Agent,
        &EgressSpec::for_profile(&Profile::Agent, local()),
    )
    .unwrap();
    let pids: Vec<Option<u32>> = s.status().iter().map(|p| p.pid).collect();
    assert_eq!(pids.len(), 3);
    assert!(pids.iter().all(Option::is_some));
    assert_ne!(pids[0], pids[1]);

    s.kill(&Profile::Agent);
    assert!(!s.is_running(&Profile::Agent));
    assert!(s.is_running(&m));
    assert!(s.is_running(&Profile::Filing));
    for p in [&m, &Profile::Filing] {
        let pong = s.query(p, &ProfileRequest::Ping).unwrap();
        assert_eq!(pong.data["profile"], p.name());
    }
    // The agent comes back on its next use, as a fresh process.
    s.start(
        &Profile::Agent,
        &EgressSpec::for_profile(&Profile::Agent, local()),
    )
    .unwrap();
    let agent = s
        .status()
        .into_iter()
        .find(|p| p.profile == "agent")
        .unwrap();
    assert_eq!((agent.state.as_str(), agent.restarts), ("running", 1));
}

#[test]
fn m_ac_02_the_agent_profile_has_no_cookies_from_a_matter_login() {
    let server = Server::start();
    let dir = tempfile::tempdir().unwrap();
    let mut s = supervisor(dir.path());
    let m = matter();
    let m_egress = EgressSpec::for_profile(&m, Some(vec![]));
    s.navigate(&m, &m_egress, &server.url("/login"), Initiator::Advocate)
        .unwrap();
    let jar = s.query(&m, &ProfileRequest::Cookies).unwrap();
    assert_eq!(jar.data["cookies"][0]["value"], "advocate-secret");
    // The matter profile sends its cookie back.
    s.navigate(&m, &m_egress, &server.url("/again"), Initiator::Advocate)
        .unwrap();

    let a_egress = EgressSpec::for_profile(&Profile::Agent, local());
    s.navigate(
        &Profile::Agent,
        &a_egress,
        &server.url("/whoami"),
        Initiator::Agent,
    )
    .unwrap();
    let agent_jar = s.query(&Profile::Agent, &ProfileRequest::Cookies).unwrap();
    assert_eq!(agent_jar.data["cookies"], serde_json::json!([]));
    let seen = server.requests();
    let again = seen.iter().find(|r| r.path == "/again").unwrap();
    assert_eq!(again.cookie.as_deref(), Some("session=advocate-secret"));
    let whoami = seen.iter().find(|r| r.path == "/whoami").unwrap();
    assert_eq!(whoami.cookie, None, "the agent sent no cookie");

    // The agent folder is thrown away at the end of the run.
    let agent_dir = s.profile_dir(&Profile::Agent).unwrap().to_path_buf();
    assert!(agent_dir.exists());
    s.end_agent_run();
    assert!(!agent_dir.exists());
}

#[test]
fn m_ac_03_the_agent_profile_is_refused_the_filing_portal_even_when_allow_listed() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = supervisor(dir.path());
    let egress = EgressSpec::for_profile(&Profile::Agent, Some(vec!["efiling.sci.gov.in".into()]));
    let err = s
        .navigate(
            &Profile::Agent,
            &egress,
            "https://efiling.sci.gov.in/login",
            Initiator::Agent,
        )
        .unwrap_err();
    match err {
        BrowserError::Refused {
            reason,
            connections,
        } => {
            assert!(reason.contains("H-15"));
            assert_eq!(connections.len(), 1);
            assert!(!connections[0].allowed);
        }
        other => panic!("expected a refusal, got {other:?}"),
    }
    // The supervisor refused before any agent process started.
    assert!(!s.is_running(&Profile::Agent));
}

#[test]
fn m_ac_05_a_download_in_every_profile_is_hashed_from_the_bytes_on_disk() {
    let server = Server::start();
    let dir = tempfile::tempdir().unwrap();
    let mut s = supervisor(dir.path());
    let m = matter();
    for (profile, egress, who) in [
        (
            m.clone(),
            EgressSpec::for_profile(&m, Some(vec![])),
            Initiator::Advocate,
        ),
        (
            Profile::Filing,
            EgressSpec::for_profile(&Profile::Filing, local()),
            Initiator::Advocate,
        ),
        (
            Profile::Agent,
            EgressSpec::for_profile(&Profile::Agent, local()),
            Initiator::Agent,
        ),
    ] {
        let resp = s
            .navigate(&profile, &egress, &server.url("/order.pdf"), who)
            .unwrap();
        let file = resp.download.expect("a download");
        assert_eq!(file.file_name, "order.pdf");
        let got = intercept(&file).unwrap();
        let on_disk = std::fs::read(&file.path).unwrap();
        assert_eq!(got.sha256, sha256(&on_disk), "{profile}");
        assert_eq!(got.sha256, sha256(PDF));
        assert!(file.path.contains("downloads"));
    }
}

#[test]
fn m_ac_07_with_the_allow_list_empty_the_agent_profile_makes_no_network_request() {
    let server = Server::start();
    let dir = tempfile::tempdir().unwrap();
    let mut s = supervisor(dir.path());
    for allow in [Some(vec![]), None] {
        let egress = EgressSpec::for_profile(&Profile::Agent, allow);
        let err = s
            .navigate(
                &Profile::Agent,
                &egress,
                &server.url("/page"),
                Initiator::Agent,
            )
            .unwrap_err();
        assert!(matches!(err, BrowserError::Refused { .. }), "{err:?}");
        assert!(err.connections().iter().all(|c| !c.allowed));
    }
    std::thread::sleep(std::time::Duration::from_millis(100));
    assert!(server.requests().is_empty(), "{:?}", server.requests());
}

#[test]
fn m_ac_08_devtools_cannot_be_opened_in_the_filing_profile() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = supervisor(dir.path());
    let filing = EgressSpec::for_profile(&Profile::Filing, local());
    let err = s.open_devtools(&Profile::Filing, &filing).unwrap_err();
    assert!(matches!(err, BrowserError::Refused { ref reason, .. } if reason.contains("M05")));
    // The process refuses on its own too, not only the supervisor.
    s.start(&Profile::Filing, &filing).unwrap();
    let err = s
        .query(&Profile::Filing, &ProfileRequest::OpenDevtools)
        .unwrap_err();
    assert!(matches!(err, BrowserError::Refused { .. }));
    let m = matter();
    assert!(s
        .open_devtools(&m, &EgressSpec::for_profile(&m, Some(vec![])))
        .is_ok());
}

#[test]
fn m_ac_10_every_agent_connection_is_logged_with_refused_ones_marked() {
    let server = Server::start();
    let dir = tempfile::tempdir().unwrap();
    let mut s = supervisor(dir.path());
    let egress = EgressSpec::for_profile(&Profile::Agent, local());
    let resp = s
        .navigate(
            &Profile::Agent,
            &egress,
            &server.url("/old"),
            Initiator::Agent,
        )
        .unwrap();
    let kinds: Vec<(String, String, bool)> = resp
        .connections
        .iter()
        .map(|c| (c.kind.clone(), c.host.clone(), c.allowed))
        .collect();
    assert_eq!(
        kinds,
        vec![
            ("navigation".into(), "127.0.0.1".into(), true),
            ("redirect".into(), "127.0.0.1".into(), true),
            ("subresource".into(), "127.0.0.1".into(), true),
            ("subresource".into(), "tracker.invalid".into(), false),
        ]
    );
    let refused = &resp.connections[3];
    assert_eq!(refused.reason, "not on the allow list");
    // Every allowed connection reached the server; the refused one did not.
    let paths: Vec<String> = server.requests().into_iter().map(|r| r.path).collect();
    assert_eq!(paths, vec!["/old", "/page", "/logo.png"]);
}

#[test]
fn extraction_dom_and_screenshot_come_from_the_profile_process() {
    let server = Server::start();
    let dir = tempfile::tempdir().unwrap();
    let mut s = supervisor(dir.path());
    let m = matter();
    s.navigate(
        &m,
        &EgressSpec::for_profile(&m, Some(vec![])),
        &server.url("/page"),
        Initiator::Advocate,
    )
    .unwrap();
    let e = s.query(&m, &ProfileRequest::Extract).unwrap();
    assert_eq!(e.data["label"], "untrusted");
    assert_eq!(e.data["url"], server.url("/page"));
    assert!(e.data["at"].as_str().unwrap().ends_with('Z'));
    let d = s
        .query(
            &m,
            &ProfileRequest::Dom {
                selector: "#x".into(),
            },
        )
        .unwrap();
    assert_eq!(d.data["matches"][0]["text"], "Listing");
    let shot = s.query(&m, &ProfileRequest::Screenshot).unwrap();
    assert_eq!(shot.data["engine"], "stub");
    let st = s.query(&m, &ProfileRequest::State).unwrap();
    assert_eq!(st.data["tabs"][0]["title"], "Case status");
}

#[test]
fn a_missing_profile_executable_is_an_honest_unavailable() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Supervisor::new(
        Arc::new(ProcessLauncher::new(dir.path().join("no-such-browser.exe"))),
        dir.path(),
    );
    let m = matter();
    let err = s
        .navigate(
            &m,
            &EgressSpec::for_profile(&m, Some(vec![])),
            "http://127.0.0.1:1/",
            Initiator::Advocate,
        )
        .unwrap_err();
    assert!(matches!(err, BrowserError::Unavailable(ref r) if r.contains("failed to start")));
    let st = s.status();
    assert_eq!(st[0].state, "failed");
}

/// Spec F's capture driver, which ran against a fixture port, now drives a
/// real profile process: the recorded listing and every order, through the
/// download interceptor.
#[test]
fn f_capture_driver_runs_through_a_supervised_profile() {
    use oa_capture::{BrowserPort, CaptureDriver, CaptureState};
    let server = Server::start();
    let dir = tempfile::tempdir().unwrap();
    let mut s = supervisor(dir.path());
    let m = matter();
    let egress = EgressSpec::for_profile(&m, Some(vec![]));

    let port =
        oa_browser::SupervisedPort::new(&mut s, m.clone(), egress.clone(), Initiator::Advocate);
    let mut driver = CaptureDriver::new(port);
    let docs = driver.capture_case(&server.url("/case")).unwrap();
    assert_eq!(driver.state(), CaptureState::Completed);
    assert_eq!(docs.len(), 3);
    assert!(docs.iter().all(|d| d.bytes == PDF));
    assert_eq!(docs[0].format.actual.as_str(), "pdf");
    let port = driver.port();
    assert_eq!(
        port.intercepted.len(),
        3,
        "every order went through the interceptor"
    );
    assert!(port.intercepted.iter().all(|i| i.sha256 == sha256(PDF)));
    assert_eq!(port.current_url(), server.url("/case"));

    // A CAPTCHA hands off to the advocate: focus, and nothing typed.
    let port = oa_browser::SupervisedPort::new(&mut s, m.clone(), egress, Initiator::Advocate);
    let mut driver = CaptureDriver::new(port);
    driver.begin_case(&server.url("/captcha")).unwrap();
    assert_eq!(driver.state(), CaptureState::CaptchaPending);
    assert!(driver.typed().is_empty());

    // The headless agent profile cannot take a CAPTCHA handoff.
    let agent = EgressSpec::for_profile(&Profile::Agent, local());
    let port = oa_browser::SupervisedPort::new(&mut s, Profile::Agent, agent, Initiator::Agent);
    let mut driver = CaptureDriver::new(port);
    let err = driver.begin_case(&server.url("/captcha")).unwrap_err();
    assert!(err.contains("hand the task to the advocate"), "{err}");
}
