use std::fs;

use oa_repo_checks::{repo_root, workflow_sections};

#[test]
fn a_ac_14_workflow_sections_1_to_12_are_identical() {
    let root = repo_root();
    let arch = fs::read_to_string(root.join("docs/architecture.md")).unwrap();
    let flow = fs::read_to_string(root.join("docs/advocate-workflow.md")).unwrap();
    let a = workflow_sections(&arch).expect("architecture.md has sections 1 to 12");
    let w = workflow_sections(&flow).expect("advocate-workflow.md has sections 1 to 12");
    assert!(!a.is_empty());
    if let Some((i, (x, y))) = a.iter().zip(&w).enumerate().find(|(_, (x, y))| x != y) {
        panic!("line {i} differs:\n architecture.md:      {x}\n advocate-workflow.md: {y}");
    }
    assert_eq!(a.len(), w.len(), "one document has extra lines at the end");
}

#[test]
fn r_ac_01_only_oa_store_depends_on_rusqlite() {
    let crates = repo_root().join("crates");
    for entry in fs::read_dir(&crates).unwrap() {
        let dir = entry.unwrap().path();
        let manifest = dir.join("Cargo.toml");
        let Ok(text) = fs::read_to_string(&manifest) else {
            continue;
        };
        let name = dir.file_name().unwrap().to_string_lossy().to_string();
        // Only normal dependencies count: tests may use rusqlite to tamper
        // with a database, but domain code may not (spec R rule 1).
        let mut section = String::new();
        let declares_rusqlite = text.lines().any(|l| {
            let l = l.trim();
            if l.starts_with('[') {
                section = l.to_string();
                return false;
            }
            let normal = section == "[dependencies]" || section.ends_with(".dependencies]");
            normal
                && !section.contains("dev-dependencies")
                && l.starts_with("rusqlite")
                && l["rusqlite".len()..].trim_start().starts_with(['=', '.'])
        });
        if name != "oa-store" {
            assert!(
                !declares_rusqlite,
                "{name} depends on rusqlite; domain code must use the repository traits (spec R rule 1)"
            );
        }
    }
}
