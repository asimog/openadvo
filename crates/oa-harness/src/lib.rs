//! The harness (spec D). It coordinates and proposes; it never commits
//! canonical state and never issues a `human` command.
//!
//! This crate has no dependency on the canonical store crates (spec C rule 2,
//! C-AC-03): its session store is the `oa-session` trait.

pub mod context;
pub mod playbook;
pub mod provider;
pub mod replay;
pub mod router;
pub mod runner;
pub mod supervise;
pub mod tools;

pub use runner::{
    waiting, Boundary, Config, HarnessError, Outcome, Reconciled, Report, Runner, SubAgentSpec,
    SubFailure, SubReturn, ToolCard, TurnInput,
};
