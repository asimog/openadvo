//! Egress policy (M rules 3 and 7, H-15, M09). Deny by default for the agent
//! profile; a missing allow-list flag denies everything; filing destinations
//! are refused to the agent profile whatever its allow list says.

use serde::{Deserialize, Serialize};

use crate::profile::Profile;

/// The e-filing portal and other filing destinations. The agent profile is
/// refused these by a hard check, independent of any allow list (H-15).
pub const FILING_HOSTS: &[&str] = &["efiling.sci.gov.in", "efiling.ecourts.gov.in"];

/// The default allow list for the agent profile: public legal sources only.
pub const PUBLIC_LEGAL_SOURCES: &[&str] = &[
    "www.sci.gov.in",
    "main.sci.gov.in",
    "indiacode.nic.in",
    "www.indiacode.nic.in",
    "services.ecourts.gov.in",
    "judgments.ecourts.gov.in",
    "egazette.gov.in",
];

/// True for the e-filing portal and anything that looks like a filing host.
pub fn is_filing_destination(host: &str) -> bool {
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if FILING_HOSTS
        .iter()
        .any(|h| host == *h || host.ends_with(&format!(".{h}")))
    {
        return true;
    }
    host.split('.')
        .next()
        .is_some_and(|label| label.starts_with("efiling") || label.starts_with("e-filing"))
}

/// A parsed URL, as much as the browser needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Url {
    pub scheme: String,
    pub host: String,
    pub port: u16,
    /// Path and query, starting with `/`.
    pub path: String,
}

impl Url {
    pub fn parse(text: &str) -> Result<Url, String> {
        let text = text.trim();
        let (scheme, rest) = text
            .split_once("://")
            .ok_or_else(|| format!("not an absolute URL: {text:?}"))?;
        let scheme = scheme.to_ascii_lowercase();
        let default_port = match scheme.as_str() {
            "http" => 80,
            "https" => 443,
            other => return Err(format!("unsupported scheme {other:?}")),
        };
        let (authority, path) = match rest.find(['/', '?', '#']) {
            Some(i) => (&rest[..i], &rest[i..]),
            None => (rest, "/"),
        };
        let authority = authority.rsplit('@').next().unwrap_or(authority);
        let (host, port) = match authority.rsplit_once(':') {
            Some((h, p)) if p.chars().all(|c| c.is_ascii_digit()) && !p.is_empty() => (
                h,
                p.parse::<u16>()
                    .map_err(|_| format!("bad port in {text:?}"))?,
            ),
            _ => (authority, default_port),
        };
        if host.is_empty() {
            return Err(format!("no host in {text:?}"));
        }
        let path = path.split('#').next().unwrap_or("/");
        let path = if path.starts_with('/') {
            path.to_string()
        } else {
            format!("/{path}")
        };
        Ok(Url {
            scheme,
            host: host.to_ascii_lowercase(),
            port,
            path,
        })
    }

    /// Resolves `href` against this URL.
    pub fn join(&self, href: &str) -> Result<Url, String> {
        if href.contains("://") {
            return Url::parse(href);
        }
        let path = if let Some(rest) = href.strip_prefix("//") {
            return Url::parse(&format!("{}://{rest}", self.scheme));
        } else if href.starts_with('/') {
            href.to_string()
        } else {
            let base = self.path.split('?').next().unwrap_or("/");
            let dir = &base[..base.rfind('/').map(|i| i + 1).unwrap_or(1)];
            format!("{dir}{href}")
        };
        Ok(Url {
            path,
            ..self.clone()
        })
    }

    pub fn origin(&self) -> String {
        format!("{}://{}:{}", self.scheme, self.host, self.port)
    }
}

impl std::fmt::Display for Url {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let default = matches!(
            (self.scheme.as_str(), self.port),
            ("http", 80) | ("https", 443)
        );
        if default {
            write!(f, "{}://{}{}", self.scheme, self.host, self.path)
        } else {
            write!(
                f,
                "{}://{}:{}{}",
                self.scheme, self.host, self.port, self.path
            )
        }
    }
}

/// Who asked for a connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Initiator {
    Advocate,
    Agent,
}

impl Initiator {
    pub fn as_str(self) -> &'static str {
        match self {
            Initiator::Advocate => "advocate",
            Initiator::Agent => "agent",
        }
    }
}

/// The egress settings a profile process is started with. A missing `allow`
/// flag means deny everything (M rule 7: a missing flag fails safe).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct EgressSpec {
    #[serde(default)]
    pub allow: Option<Vec<String>>,
    #[serde(default)]
    pub advocate_navigation: bool,
    #[serde(default)]
    pub refuse_filing: bool,
}

impl EgressSpec {
    /// The spec for a profile with a given allow list.
    pub fn for_profile(profile: &Profile, allow: Option<Vec<String>>) -> EgressSpec {
        EgressSpec {
            allow,
            advocate_navigation: profile.config().advocate_navigation,
            refuse_filing: *profile == Profile::Agent,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Decision {
    pub allowed: bool,
    pub reason: String,
}

fn host_matches(host: &str, entry: &str) -> bool {
    let entry = entry.trim().trim_end_matches('.').to_ascii_lowercase();
    if entry.is_empty() {
        return false;
    }
    let entry = entry.split(':').next().unwrap_or_default().to_string();
    host == entry || host.ends_with(&format!(".{entry}"))
}

/// Decides one connection.
pub fn decide(spec: &EgressSpec, host: &str, initiator: Initiator) -> Decision {
    let host = host.to_ascii_lowercase();
    let deny = |reason: &str| Decision {
        allowed: false,
        reason: reason.to_string(),
    };
    if spec.refuse_filing && is_filing_destination(&host) {
        return deny("filing destination: refused to the agent profile (H-15)");
    }
    let Some(allow) = &spec.allow else {
        return deny("no allow-list flag: deny by default");
    };
    if allow.iter().any(|e| host_matches(&host, e)) {
        return Decision {
            allowed: true,
            reason: "on the allow list".into(),
        };
    }
    if spec.advocate_navigation && initiator == Initiator::Advocate {
        return Decision {
            allowed: true,
            reason: "the advocate's own navigation".into(),
        };
    }
    deny("not on the allow list")
}

/// Splits a comma or whitespace separated allow list from a setting.
pub fn parse_allow_list(text: &str) -> Vec<String> {
    text.split([',', ' ', '\n', ';'])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_ascii_lowercase)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn agent(allow: &[&str]) -> EgressSpec {
        EgressSpec::for_profile(
            &Profile::Agent,
            Some(allow.iter().map(|s| s.to_string()).collect()),
        )
    }

    #[test]
    fn m_ac_03_the_filing_portal_is_refused_to_the_agent_even_when_allow_listed() {
        let spec = agent(&["efiling.sci.gov.in", "www.sci.gov.in"]);
        let d = decide(&spec, "efiling.sci.gov.in", Initiator::Agent);
        assert!(!d.allowed);
        assert!(d.reason.contains("H-15"));
        assert!(!decide(&spec, "efiling.example.in", Initiator::Agent).allowed);
        assert!(decide(&spec, "www.sci.gov.in", Initiator::Agent).allowed);
    }

    #[test]
    fn m_ac_07_an_empty_or_missing_allow_list_denies_everything() {
        let empty = agent(&[]);
        assert!(!decide(&empty, "www.sci.gov.in", Initiator::Agent).allowed);
        let missing = EgressSpec::default();
        let d = decide(&missing, "127.0.0.1", Initiator::Advocate);
        assert!(!d.allowed);
        assert!(d.reason.contains("deny by default"));
    }

    #[test]
    fn the_advocate_navigates_freely_only_in_a_matter_profile() {
        let matter = EgressSpec::for_profile(&Profile::Matter("01A".into()), Some(vec![]));
        assert!(decide(&matter, "example.org", Initiator::Advocate).allowed);
        assert!(!decide(&matter, "example.org", Initiator::Agent).allowed);
        let filing = EgressSpec::for_profile(&Profile::Filing, Some(vec![]));
        assert!(!decide(&filing, "example.org", Initiator::Advocate).allowed);
    }

    #[test]
    fn urls_parse_and_join() {
        let u = Url::parse("http://127.0.0.1:8080/case/1?x=2#f").unwrap();
        assert_eq!(
            (u.host.as_str(), u.port, u.path.as_str()),
            ("127.0.0.1", 8080, "/case/1?x=2")
        );
        assert_eq!(u.join("order.pdf").unwrap().path, "/case/order.pdf");
        assert_eq!(u.join("/a").unwrap().to_string(), "http://127.0.0.1:8080/a");
        assert_eq!(
            Url::parse("https://www.sci.gov.in").unwrap().to_string(),
            "https://www.sci.gov.in/"
        );
        assert!(Url::parse("file:///c:/x").is_err());
    }
}
