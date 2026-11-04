use std::fs;

use oa_repo_checks::{repo_root, workflow_sections};

#[test]
fn a_ac_14_the_workflow_exists_in_one_document_only() {
    let root = repo_root();
    let flow = fs::read_to_string(root.join("docs/advocate-workflow.md")).unwrap();
    let w = workflow_sections(&flow).expect("advocate-workflow.md has sections 1 to 12");
    assert!(!w.is_empty());
    for doc in ["docs/architecture.md", "docs/component-map.md", "docs/decisions.md"] {
        let text = fs::read_to_string(root.join(doc)).unwrap();
        assert!(
            workflow_sections(&text).is_none(),
            "{doc} carries a copy of the workflow; it lives only in advocate-workflow.md (X-22)"
        );
    }
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

fn crate_dirs() -> Vec<std::path::PathBuf> {
    fs::read_dir(repo_root().join("crates"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.join("Cargo.toml").is_file())
        .collect()
}

#[test]
fn c_ac_03_a_harness_crate_does_not_depend_on_a_canonical_store_crate() {
    let forbidden = ["oa-store", "oa-kernel", "rusqlite"];
    let mut checked = 0;
    for dir in crate_dirs() {
        let name = dir.file_name().unwrap().to_string_lossy().to_string();
        if !name.starts_with("oa-harness") {
            continue;
        }
        checked += 1;
        let text = fs::read_to_string(dir.join("Cargo.toml")).unwrap();
        for dep in forbidden {
            assert!(
                !text.lines().any(|l| {
                    let l = l.trim();
                    l.starts_with(dep) && l[dep.len()..].trim_start().starts_with(['=', '.'])
                }),
                "{name} depends on {dep}; the harness proposes through the control protocol (spec C rule 2)"
            );
        }
    }
    assert!(checked >= 1, "the harness crate exists");
}

#[test]
fn d_ac_11_exactly_one_crate_contains_a_turn_loop() {
    let marker = concat!("pub fn run_", "turn(");
    let mut holders = Vec::new();
    for dir in crate_dirs() {
        let mut stack = vec![dir.join("src")];
        while let Some(d) = stack.pop() {
            let Ok(rd) = fs::read_dir(&d) else { continue };
            for e in rd {
                let p = e.unwrap().path();
                if p.is_dir() {
                    stack.push(p);
                } else if p.extension().is_some_and(|x| x == "rs")
                    && fs::read_to_string(&p).unwrap().contains(marker)
                {
                    holders.push(dir.file_name().unwrap().to_string_lossy().to_string());
                }
            }
        }
    }
    holders.sort();
    holders.dedup();
    assert_eq!(holders, ["oa-harness"], "turn loop holders: {holders:?}");
}
