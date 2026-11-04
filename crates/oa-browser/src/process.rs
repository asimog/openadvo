//! The profile process: the protocol the supervisor speaks to it, and the stub
//! that stands in for a Chromium (CEF) profile until Chromium is vendored.
//!
//! The stub is a real process with a real profile folder, cookie jar and
//! network stack (plain HTTP over TCP). It applies the egress policy before
//! opening any socket, writes every download to disk for the interceptor,
//! and refuses DevTools when its launch spec says so. It does not render
//! pages, run scripts, or speak TLS: those need the real browser.

use std::io::{BufRead, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::egress::{decide, EgressSpec, Initiator, Url};
use crate::page;
use crate::profile::Profile;

/// What the supervisor starts a profile process with.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LaunchSpec {
    pub profile: Profile,
    pub profile_dir: PathBuf,
    pub egress: EgressSpec,
    pub devtools: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ProfileRequest {
    Ping,
    Navigate {
        url: String,
        initiator: Initiator,
    },
    State,
    Dom {
        selector: String,
    },
    Extract,
    Screenshot,
    Cookies,
    OpenDevtools,
    /// The current page's HTML, for F's portal adapter.
    Html,
    /// Brings a visible profile to the front (a CAPTCHA handoff).
    Focus,
    /// Types into a field. Recorded by the stub; never used on a CAPTCHA.
    Fill {
        selector: String,
        value: String,
    },
    Shutdown,
}

/// One connection the profile made or refused (the egress log, M-AC-10).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Connection {
    pub at: String,
    pub url: String,
    pub host: String,
    pub initiator: Initiator,
    /// navigation, redirect, subresource or download.
    pub kind: String,
    pub allowed: bool,
    pub reason: String,
    #[serde(default)]
    pub status: Option<u16>,
    #[serde(default)]
    pub error: Option<String>,
}

/// A file the profile wrote to its download folder. The supervisor hashes it
/// before anything opens it (M rule 5).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DownloadFile {
    pub url: String,
    pub final_url: String,
    pub file_name: String,
    pub content_type: String,
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ProfileResponse {
    pub ok: bool,
    #[serde(default)]
    pub refused: bool,
    /// A dependency the stub lacks (TLS, rendering): not the page's fault.
    #[serde(default)]
    pub unavailable: bool,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub connections: Vec<Connection>,
    #[serde(default)]
    pub download: Option<DownloadFile>,
    #[serde(default)]
    pub data: Value,
}

impl ProfileResponse {
    fn ok(data: Value) -> Self {
        ProfileResponse {
            ok: true,
            data,
            ..Default::default()
        }
    }

    fn refused(reason: impl Into<String>, connections: Vec<Connection>) -> Self {
        ProfileResponse {
            ok: false,
            refused: true,
            error: Some(reason.into()),
            connections,
            ..Default::default()
        }
    }

    fn failed(reason: impl Into<String>, connections: Vec<Connection>) -> Self {
        ProfileResponse {
            ok: false,
            error: Some(reason.into()),
            connections,
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Cookie {
    pub host: String,
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone)]
struct Page {
    url: String,
    final_url: String,
    title: String,
    html: String,
    status: u16,
    at: String,
}

struct HttpResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl HttpResponse {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

pub fn now() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

/// The stub stand-in for one Chromium profile.
pub struct ProfileProcess {
    spec: LaunchSpec,
    cookies: Vec<Cookie>,
    page: Option<Page>,
    filled: Vec<String>,
}

const STUB_HTTPS: &str =
    "https needs Chromium (CEF), which is not vendored: the stub profile process speaks plain HTTP only";

impl ProfileProcess {
    pub fn new(spec: LaunchSpec) -> Self {
        let _ = std::fs::create_dir_all(spec.profile_dir.join("downloads"));
        let cookies = if spec.profile.config().persistent {
            std::fs::read(spec.profile_dir.join("cookies.json"))
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        ProfileProcess {
            spec,
            cookies,
            page: None,
            filled: Vec::new(),
        }
    }

    fn save_cookies(&self) {
        if self.spec.profile.config().persistent {
            let _ = std::fs::write(
                self.spec.profile_dir.join("cookies.json"),
                serde_json::to_vec_pretty(&self.cookies).unwrap_or_default(),
            );
        }
    }

    pub fn handle(&mut self, req: &ProfileRequest) -> ProfileResponse {
        match req {
            ProfileRequest::Ping => ProfileResponse::ok(json!({
                "profile": self.spec.profile.name(),
                "pid": std::process::id(),
                "engine": "stub",
            })),
            ProfileRequest::Navigate { url, initiator } => self.navigate(url, *initiator),
            ProfileRequest::State => ProfileResponse::ok(self.state()),
            ProfileRequest::Dom { selector } => match &self.page {
                None => ProfileResponse::failed("no page is loaded", Vec::new()),
                Some(p) => match page::select(&p.html, selector) {
                    Ok(found) => ProfileResponse::ok(json!({
                        "url": p.final_url,
                        "selector": selector,
                        "matches": found.into_iter().map(|(text, html)| json!({ "text": text, "html": html })).collect::<Vec<_>>(),
                    })),
                    Err(e) => ProfileResponse::failed(e, Vec::new()),
                },
            },
            ProfileRequest::Extract => match &self.page {
                None => ProfileResponse::failed("no page is loaded", Vec::new()),
                Some(p) => ProfileResponse::ok(
                    serde_json::to_value(page::extract(&p.html, &p.final_url, &now()))
                        .unwrap_or_default(),
                ),
            },
            ProfileRequest::Screenshot => match &self.page {
                None => ProfileResponse::failed("no page is loaded", Vec::new()),
                Some(p) => ProfileResponse::ok(screenshot(&p.html)),
            },
            ProfileRequest::Cookies => ProfileResponse::ok(json!({
                "cookies": self.cookies,
            })),
            ProfileRequest::OpenDevtools => {
                if self.spec.devtools {
                    ProfileResponse::ok(json!({ "devtools": "open" }))
                } else {
                    ProfileResponse::refused(
                        format!(
                            "DevTools are disabled in the {} profile (M05)",
                            self.spec.profile
                        ),
                        Vec::new(),
                    )
                }
            }
            ProfileRequest::Html => ProfileResponse::ok(json!({
                "url": self.page.as_ref().map(|p| p.final_url.clone()),
                "html": self.page.as_ref().map(|p| p.html.clone()).unwrap_or_default(),
            })),
            ProfileRequest::Focus => {
                if self.spec.profile.config().visible {
                    ProfileResponse::ok(json!({ "focused": true }))
                } else {
                    ProfileResponse::refused(
                        "a headless profile cannot take focus: hand the task to the advocate",
                        Vec::new(),
                    )
                }
            }
            ProfileRequest::Fill { selector, .. } => {
                // The stub has no form to type into; it records the selector
                // (never the value) so tests can see what was typed where.
                self.filled.push(selector.clone());
                ProfileResponse::ok(json!({ "filled": self.filled }))
            }
            ProfileRequest::Shutdown => ProfileResponse::ok(json!({ "shutdown": true })),
        }
    }

    fn state(&self) -> Value {
        let tab = match &self.page {
            None => json!({ "index": 0, "url": "about:blank", "title": "", "load_state": "empty" }),
            Some(p) => json!({
                "index": 0,
                "url": p.final_url,
                "requested_url": p.url,
                "title": p.title,
                "status": p.status,
                "load_state": "complete",
                "loaded_at": p.at,
            }),
        };
        json!({
            "profile": self.spec.profile.name(),
            "pid": std::process::id(),
            "engine": "stub",
            "tabs": [tab],
        })
    }

    fn connection(&self, url: &Url, initiator: Initiator, kind: &str) -> Connection {
        let d = decide(&self.spec.egress, &url.host, initiator);
        Connection {
            at: now(),
            url: url.to_string(),
            host: url.host.clone(),
            initiator,
            kind: kind.into(),
            allowed: d.allowed,
            reason: d.reason,
            status: None,
            error: None,
        }
    }

    fn cookie_header(&self, host: &str) -> Option<String> {
        let pairs: Vec<String> = self
            .cookies
            .iter()
            .filter(|c| c.host == host)
            .map(|c| format!("{}={}", c.name, c.value))
            .collect();
        (!pairs.is_empty()).then(|| pairs.join("; "))
    }

    fn take_cookies(&mut self, host: &str, resp: &HttpResponse) {
        let mut changed = false;
        for (k, v) in &resp.headers {
            if !k.eq_ignore_ascii_case("set-cookie") {
                continue;
            }
            let pair = v.split(';').next().unwrap_or_default();
            if let Some((name, value)) = pair.split_once('=') {
                let name = name.trim().to_string();
                self.cookies.retain(|c| !(c.host == host && c.name == name));
                self.cookies.push(Cookie {
                    host: host.to_string(),
                    name,
                    value: value.trim().to_string(),
                });
                changed = true;
            }
        }
        if changed {
            self.save_cookies();
        }
    }

    fn fetch(&mut self, url: &Url, conn: &mut Connection) -> Option<HttpResponse> {
        if url.scheme != "http" {
            conn.error = Some(STUB_HTTPS.into());
            return None;
        }
        let cookie = self.cookie_header(&url.host);
        match http_get(url, cookie.as_deref()) {
            Ok(resp) => {
                conn.status = Some(resp.status);
                self.take_cookies(&url.host, &resp);
                Some(resp)
            }
            Err(e) => {
                conn.error = Some(e);
                None
            }
        }
    }

    fn navigate(&mut self, url_text: &str, initiator: Initiator) -> ProfileResponse {
        let mut connections = Vec::new();
        let mut url = match Url::parse(url_text) {
            Ok(u) => u,
            Err(e) => return ProfileResponse::failed(e, connections),
        };
        let mut kind = "navigation";
        for _ in 0..6 {
            let mut conn = self.connection(&url, initiator, kind);
            if !conn.allowed {
                let reason = format!("{} refused: {}", url.host, conn.reason);
                connections.push(conn);
                return ProfileResponse::refused(reason, connections);
            }
            let resp = self.fetch(&url, &mut conn);
            let error = conn.error.clone();
            connections.push(conn);
            let Some(resp) = resp else {
                let mut out =
                    ProfileResponse::failed(error.clone().unwrap_or_default(), connections);
                out.unavailable = error.as_deref() == Some(STUB_HTTPS);
                return out;
            };
            if (300..400).contains(&resp.status) {
                if let Some(loc) = resp.header("location") {
                    match url.join(loc) {
                        Ok(next) => {
                            url = next;
                            kind = "redirect";
                            continue;
                        }
                        Err(e) => return ProfileResponse::failed(e, connections),
                    }
                }
            }
            let content_type = resp
                .header("content-type")
                .unwrap_or("application/octet-stream")
                .to_ascii_lowercase();
            let disposition = resp.header("content-disposition").unwrap_or_default();
            let is_download = disposition.to_ascii_lowercase().contains("attachment")
                || !(content_type.starts_with("text/html")
                    || content_type.starts_with("text/plain"));
            if is_download {
                // A PDF the portal would render inline is saved through the
                // same interceptor (spec M edge cases).
                let file_name = download_name(disposition, &url);
                let path = self
                    .spec
                    .profile_dir
                    .join("downloads")
                    .join(format!("{}-{file_name}", ulid::Ulid::new()));
                if let Some(last) = connections.last_mut() {
                    last.kind = "download".into();
                }
                if let Err(e) = std::fs::write(&path, &resp.body) {
                    return ProfileResponse::failed(
                        format!("could not write the download: {e}"),
                        connections,
                    );
                }
                let mut out = ProfileResponse::ok(json!({ "download": true }));
                out.connections = connections;
                out.download = Some(DownloadFile {
                    url: url_text.to_string(),
                    final_url: url.to_string(),
                    file_name,
                    content_type,
                    path: path.to_string_lossy().to_string(),
                    size: resp.body.len() as u64,
                });
                return out;
            }
            let html = String::from_utf8_lossy(&resp.body).to_string();
            for sub in page::subresources(&html) {
                let Ok(sub_url) = url.join(&sub) else {
                    continue;
                };
                let mut c = self.connection(&sub_url, initiator, "subresource");
                if c.allowed {
                    let _ = self.fetch(&sub_url, &mut c);
                }
                connections.push(c);
            }
            let p = Page {
                url: url_text.to_string(),
                final_url: url.to_string(),
                title: page::title(&html),
                html,
                status: resp.status,
                at: now(),
            };
            let data = json!({
                "url": p.url,
                "final_url": p.final_url,
                "title": p.title,
                "status": p.status,
                "load_state": "complete",
            });
            self.page = Some(p);
            let mut out = ProfileResponse::ok(data);
            out.connections = connections;
            return out;
        }
        ProfileResponse::failed("too many redirects", connections)
    }
}

fn download_name(disposition: &str, url: &Url) -> String {
    let from_header = disposition
        .split(';')
        .find_map(|p| p.trim().strip_prefix("filename="))
        .map(|v| v.trim_matches('"').to_string());
    let from_path = url
        .path
        .split('?')
        .next()
        .and_then(|p| p.rsplit('/').next())
        .map(str::to_string);
    let raw = from_header
        .or(from_path)
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "download".into());
    let safe: String = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    safe.trim_start_matches('.')
        .chars()
        .take(96)
        .collect::<String>()
}

fn http_get(url: &Url, cookie: Option<&str>) -> Result<HttpResponse, String> {
    let addr = (url.host.as_str(), url.port)
        .to_socket_addrs()
        .map_err(|e| format!("{}: {e}", url.host))?
        .next()
        .ok_or_else(|| format!("{}: no address", url.host))?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(5))
        .map_err(|e| format!("{}: {e}", url.host))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let mut req = format!(
        "GET {} HTTP/1.0\r\nHost: {}\r\nUser-Agent: oa-browser-profile/stub\r\nConnection: close\r\n",
        url.path, url.host
    );
    if let Some(c) = cookie {
        req.push_str(&format!("Cookie: {c}\r\n"));
    }
    req.push_str("\r\n");
    stream
        .write_all(req.as_bytes())
        .map_err(|e| format!("{}: {e}", url.host))?;
    let mut raw = Vec::new();
    stream
        .read_to_end(&mut raw)
        .map_err(|e| format!("{}: {e}", url.host))?;
    let split = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or("a malformed HTTP response")?;
    let head = String::from_utf8_lossy(&raw[..split]).to_string();
    let body = raw[split + 4..].to_vec();
    let mut lines = head.lines();
    let status = lines
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse().ok())
        .ok_or("a malformed status line")?;
    let headers = lines
        .filter_map(|l| l.split_once(':'))
        .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
        .collect();
    Ok(HttpResponse {
        status,
        headers,
        body,
    })
}

/// A stub raster: one dark bar per line of text, sized to the line. It shows
/// that a screenshot path exists; it is not a rendering of the page.
fn screenshot(html: &str) -> Value {
    use base64::Engine;
    let (w, h) = (640u32, 400u32);
    let mut img = image::RgbImage::from_pixel(w, h, image::Rgb([255, 255, 255]));
    for (i, line) in page::main_text(html).lines().take(30).enumerate() {
        let y0 = 12 + i as u32 * 13;
        let len = (line.chars().count() as u32 * 6).min(w - 24);
        for y in y0..(y0 + 8).min(h) {
            for x in 12..12 + len {
                img.put_pixel(x, y, image::Rgb([60, 60, 60]));
            }
        }
    }
    let mut png = Vec::new();
    let _ = image::DynamicImage::ImageRgb8(img)
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png);
    json!({
        "width": w,
        "height": h,
        "engine": "stub",
        "png": base64::engine::general_purpose::STANDARD.encode(png),
    })
}

/// The profile process's main loop: one JSON request per stdin line, one
/// JSON response per stdout line. Stdin closing ends the process, so a dead
/// supervisor leaves no orphan.
pub fn serve(launch: &Path) -> i32 {
    let spec: LaunchSpec = match std::fs::read(launch)
        .map_err(|e| e.to_string())
        .and_then(|b| serde_json::from_slice(&b).map_err(|e| e.to_string()))
    {
        Ok(s) => s,
        Err(e) => {
            eprintln!("oa-browser-profile: bad launch spec: {e}");
            return 2;
        }
    };
    let mut process = ProfileProcess::new(spec);
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let resp = match serde_json::from_str::<ProfileRequest>(&line) {
            Ok(req) => {
                let resp = process.handle(&req);
                if req == ProfileRequest::Shutdown {
                    let _ = writeln!(
                        stdout,
                        "{}",
                        serde_json::to_string(&resp).unwrap_or_default()
                    );
                    let _ = stdout.flush();
                    return 0;
                }
                resp
            }
            Err(e) => ProfileResponse::failed(format!("bad request: {e}"), Vec::new()),
        };
        if writeln!(
            stdout,
            "{}",
            serde_json::to_string(&resp).unwrap_or_default()
        )
        .is_err()
        {
            break;
        }
        let _ = stdout.flush();
    }
    0
}
