//! F's `BrowserPort` over a supervised profile process. This replaces the
//! fixture port spec F left: the capture driver now drives a real profile
//! process, and every order it downloads goes through the interceptor.

use oa_capture::BrowserPort;

use crate::egress::{EgressSpec, Initiator, Url};
use crate::process::{Connection, ProfileRequest};
use crate::profile::Profile;
use crate::supervisor::{intercept, BrowserError, Intercepted, Supervisor};

pub struct SupervisedPort<'a> {
    sup: &'a mut Supervisor,
    profile: Profile,
    egress: EgressSpec,
    initiator: Initiator,
    url: String,
    /// The current page's HTML, read from the process after each page load
    /// (a download leaves the page as it was).
    html: String,
    last_download: Option<(String, Intercepted)>,
    /// Every connection the port's navigations made or refused, for the
    /// egress log.
    pub connections: Vec<Connection>,
    /// Every download, hashed off disk before the driver saw its bytes.
    pub intercepted: Vec<Intercepted>,
}

fn reason(e: BrowserError) -> String {
    e.reason().to_string()
}

impl<'a> SupervisedPort<'a> {
    pub fn new(
        sup: &'a mut Supervisor,
        profile: Profile,
        egress: EgressSpec,
        initiator: Initiator,
    ) -> Self {
        SupervisedPort {
            sup,
            profile,
            egress,
            initiator,
            url: String::new(),
            html: String::new(),
            last_download: None,
            connections: Vec::new(),
            intercepted: Vec::new(),
        }
    }

    fn absolute(&self, url: &str) -> Result<String, String> {
        if url.contains("://") {
            return Ok(url.to_string());
        }
        let base = Url::parse(&self.url)?;
        Ok(base.join(url)?.to_string())
    }
}

impl BrowserPort for SupervisedPort<'_> {
    fn navigate(&mut self, url: &str) -> Result<(), String> {
        let url = self.absolute(url)?;
        let result = self
            .sup
            .navigate(&self.profile, &self.egress, &url, self.initiator);
        let resp = match result {
            Ok(r) => r,
            Err(e) => {
                self.connections.extend_from_slice(e.connections());
                return Err(reason(e));
            }
        };
        self.connections.extend(resp.connections.iter().cloned());
        match &resp.download {
            Some(file) => {
                let got = intercept(file)?;
                self.intercepted.push(got.clone());
                self.last_download = Some((url, got));
            }
            None => {
                self.url = resp.data["final_url"]
                    .as_str()
                    .unwrap_or(url.as_str())
                    .to_string();
                let page = self
                    .sup
                    .query(&self.profile, &ProfileRequest::Html)
                    .map_err(reason)?;
                self.html = page.data["html"].as_str().unwrap_or_default().to_string();
            }
        }
        Ok(())
    }

    fn current_url(&self) -> String {
        self.url.clone()
    }

    fn page_html(&self) -> String {
        self.html.clone()
    }

    fn focus(&mut self) -> Result<(), String> {
        self.sup
            .query(&self.profile, &ProfileRequest::Focus)
            .map(|_| ())
            .map_err(reason)
    }

    fn fill(&mut self, selector: &str, value: &str) -> Result<(), String> {
        self.sup
            .query(
                &self.profile,
                &ProfileRequest::Fill {
                    selector: selector.to_string(),
                    value: value.to_string(),
                },
            )
            .map(|_| ())
            .map_err(reason)
    }

    fn download(&mut self, url: &str) -> Result<Vec<u8>, String> {
        let url = self.absolute(url)?;
        if self.last_download.as_ref().map(|(u, _)| u) != Some(&url) {
            self.navigate(&url)?;
        }
        match self.last_download.take() {
            Some((u, got)) if u == url => Ok(got.bytes),
            _ => Err(format!("{url} did not download a file")),
        }
    }
}
