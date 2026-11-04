//! The three kinds of profile (spec M "Profiles") and what each may do.

use std::fmt;

use serde::{Deserialize, Serialize};

/// One browser profile. Each runs as its own process (RQ-80, M rule 1).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub enum Profile {
    /// The advocate's visible browser for one open matter.
    Matter(String),
    /// The e-filing profile. Visible; DevTools off (M05).
    Filing,
    /// The agent's headless, throwaway profile (RQ-81).
    Agent,
}

impl Profile {
    pub fn parse(text: &str) -> Result<Profile, String> {
        match text {
            "filing" => Ok(Profile::Filing),
            "agent" => Ok(Profile::Agent),
            other => match other.strip_prefix("matter:") {
                Some(id)
                    if !id.trim().is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric()) =>
                {
                    Ok(Profile::Matter(id.to_string()))
                }
                _ => Err(format!(
                    "unknown profile {other:?}: use matter:<id>, filing or agent"
                )),
            },
        }
    }

    pub fn name(&self) -> String {
        match self {
            Profile::Matter(id) => format!("matter:{id}"),
            Profile::Filing => "filing".into(),
            Profile::Agent => "agent".into(),
        }
    }

    /// A name safe for a folder.
    pub fn dir_name(&self) -> String {
        match self {
            Profile::Matter(id) => format!("matter-{id}"),
            Profile::Filing => "filing".into(),
            Profile::Agent => "agent".into(),
        }
    }

    pub fn matter(&self) -> Option<&str> {
        match self {
            Profile::Matter(id) => Some(id),
            _ => None,
        }
    }

    pub fn config(&self) -> ProfileConfig {
        match self {
            Profile::Matter(_) => ProfileConfig {
                visible: true,
                persistent: true,
                devtools: true,
                autofill: true,
                advocate_navigation: true,
            },
            Profile::Filing => ProfileConfig {
                visible: true,
                persistent: true,
                devtools: false,
                autofill: true,
                advocate_navigation: false,
            },
            Profile::Agent => ProfileConfig {
                visible: false,
                persistent: false,
                devtools: false,
                autofill: false,
                advocate_navigation: false,
            },
        }
    }
}

impl fmt::Display for Profile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.name())
    }
}

impl From<Profile> for String {
    fn from(p: Profile) -> String {
        p.name()
    }
}

impl TryFrom<String> for Profile {
    type Error = String;
    fn try_from(s: String) -> Result<Self, String> {
        Profile::parse(&s)
    }
}

/// What a profile is allowed to be.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileConfig {
    /// Shown in our pane. The agent profile is headless.
    pub visible: bool,
    /// Keeps its profile folder (cookies, logins) between runs. The agent
    /// profile is created fresh for each run and discarded (M rule 2).
    pub persistent: bool,
    /// DevTools are off in the filing profile (M rule 9, M05).
    pub devtools: bool,
    /// Keychain autofill: visible profiles only (M rule 8, M08).
    pub autofill: bool,
    /// The advocate's own top-level navigation is allowed beyond the allow
    /// list (matter profiles only).
    pub advocate_navigation: bool,
}

/// How the real Chromium (CEF) process for a profile would be launched. The
/// stub profile process honours the same settings; this plan is what the
/// CEF host receives once Chromium is vendored.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaunchPlan {
    pub args: Vec<String>,
    /// Chromium enterprise policies, as name and JSON value.
    pub policies: Vec<(String, String)>,
}

pub fn launch_plan(profile: &Profile, user_data_dir: &str) -> LaunchPlan {
    let cfg = profile.config();
    let mut args = vec![
        format!("--user-data-dir={user_data_dir}"),
        "--no-first-run".to_string(),
        "--no-default-browser-check".to_string(),
        // Every download goes through our interceptor (M rule 5).
        "--disable-features=DownloadBubble".to_string(),
    ];
    if !cfg.visible {
        args.push("--headless=new".into());
    }
    let mut policies = vec![
        // Ask where to save is off: the interceptor owns the path.
        ("PromptForDownloadLocation".to_string(), "false".to_string()),
        ("PasswordManagerEnabled".to_string(), "false".to_string()),
    ];
    // 2 = DevTools disallowed everywhere.
    policies.push((
        "DeveloperToolsAvailability".to_string(),
        if cfg.devtools { "1" } else { "2" }.to_string(),
    ));
    policies.push((
        "AutofillAddressEnabled".to_string(),
        cfg.autofill.to_string(),
    ));
    LaunchPlan { args, policies }
}

/// A saved login for one host.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Credential {
    pub host: String,
    pub user: String,
    pub secret: String,
}

/// Where logins live. The application's store is the OS keychain (E07);
/// the browser never writes credentials into a profile folder.
pub trait CredentialStore {
    fn get(&self, host: &str) -> Option<Credential>;
}

/// Autofill for one page (M rule 8, M08): only a visible profile may be
/// offered a credential. The agent's headless profile never is, whatever
/// the store holds.
pub fn autofill(profile: &Profile, store: &dyn CredentialStore, host: &str) -> Option<Credential> {
    if !profile.config().autofill {
        return None;
    }
    store.get(host)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct OneLogin;
    impl CredentialStore for OneLogin {
        fn get(&self, host: &str) -> Option<Credential> {
            (host == "efiling.sci.gov.in").then(|| Credential {
                host: host.into(),
                user: "aor".into(),
                secret: "s".into(),
            })
        }
    }

    #[test]
    fn autofill_is_offered_to_visible_profiles_only() {
        let host = "efiling.sci.gov.in";
        assert!(autofill(&Profile::Filing, &OneLogin, host).is_some());
        assert!(autofill(&Profile::Matter("01A".into()), &OneLogin, host).is_some());
        assert!(autofill(&Profile::Agent, &OneLogin, host).is_none());
    }

    #[test]
    fn profiles_parse_and_print() {
        for text in ["matter:01ABC", "filing", "agent"] {
            assert_eq!(Profile::parse(text).unwrap().name(), text);
        }
        assert!(Profile::parse("matter:").is_err());
        assert!(Profile::parse("matter:../x").is_err());
        assert!(Profile::parse("default").is_err());
    }

    #[test]
    fn m_ac_08_the_filing_launch_plan_disallows_devtools() {
        let plan = launch_plan(&Profile::Filing, "C:/p");
        assert!(plan
            .policies
            .contains(&("DeveloperToolsAvailability".into(), "2".into())));
        let matter = launch_plan(&Profile::Matter("01A".into()), "C:/p");
        assert!(matter
            .policies
            .contains(&("DeveloperToolsAvailability".into(), "1".into())));
    }

    #[test]
    fn the_agent_profile_is_headless_throwaway_and_has_no_autofill() {
        let cfg = Profile::Agent.config();
        assert!(!cfg.visible && !cfg.persistent && !cfg.autofill && !cfg.devtools);
        assert!(launch_plan(&Profile::Agent, "x")
            .args
            .contains(&"--headless=new".to_string()));
        assert!(Profile::Filing.config().autofill);
    }
}
