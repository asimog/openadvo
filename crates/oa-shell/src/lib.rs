//! `oa-shell`: the advocate's window (spec A). It holds no canonical state.
//! Every action is a control command sent over the pipe to the kernel, the
//! same commands the agent and the CLI issue (spec A rule 6).

pub mod agentviews;
pub mod app;
pub mod bar;
pub mod browserviews;
pub mod chat;
pub mod conn;
pub mod docviews;
pub mod firmui;
pub mod firmviews;
pub mod gallery;
pub mod inbox;
pub mod inspector;
pub mod layout;
pub mod model;
pub mod paint;
pub mod ui;
pub mod views;

pub use app::{options, App, Content, PaneUi};
