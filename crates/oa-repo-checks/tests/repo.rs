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

#[test]
fn q_ac_09_every_vendor_dir_has_version_license_recipe_and_hash() {
    use sha2::{Digest, Sha256};
    let root = repo_root();
    let vendor = root.join("vendor");
    assert!(vendor.is_dir(), "vendor directory exists (spec Q08)");
    let entries = fs::read_dir(&vendor).unwrap();
    let mut count = 0;
    for entry in entries {
        let path = entry.unwrap().path();
        if !path.is_dir() {
            continue;
        }
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        count += 1;

        // 1. VERSION
        let version_path = path.join("VERSION");
        assert!(version_path.is_file(), "vendor/{name} must have a VERSION file (Q-AC-09)");
        let version = fs::read_to_string(&version_path).unwrap();
        assert!(!version.trim().is_empty(), "vendor/{name}/VERSION must not be empty");

        // 2. LICENSE
        let license_path = path.join("LICENSE");
        assert!(license_path.is_file(), "vendor/{name} must have a LICENSE file (Q-AC-09)");
        let license = fs::read_to_string(&license_path).unwrap();
        assert!(!license.trim().is_empty(), "vendor/{name}/LICENSE must not be empty");

        // 3. Build recipe: build.ps1 (or build.sh)
        let recipe_path = path.join("build.ps1");
        assert!(recipe_path.is_file(), "vendor/{name} must have a build recipe (build.ps1) (Q-AC-09)");
        let recipe = fs::read_to_string(&recipe_path).unwrap();
        assert!(!recipe.trim().is_empty(), "vendor/{name}/build.ps1 must not be empty");

        // 4. HASH
        let hash_path = path.join("HASH");
        assert!(hash_path.is_file(), "vendor/{name} must have a HASH file (Q-AC-09)");
        let hash_content = fs::read_to_string(&hash_path).unwrap();
        assert!(!hash_content.trim().is_empty(), "vendor/{name}/HASH must not be empty");

        // Check each line in HASH
        for line in hash_content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let mut parts = line.split_whitespace();
            let expected_hash = parts.next().expect("hash value");
            let rel_file = parts.next().expect("file path");
            let target_file = path.join(rel_file);
            assert!(
                target_file.is_file(),
                "file {rel_file} listed in vendor/{name}/HASH must exist on disk"
            );
            let bytes = fs::read(&target_file).unwrap();
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            let actual_hash = hex::encode(hasher.finalize());
            assert_eq!(
                actual_hash, expected_hash,
                "SHA-256 hash mismatch for vendor/{name}/{rel_file}"
            );
        }
    }
    assert!(count >= 3, "at least pdfium, tesseract, and paddleocr must be vendored");
}

#[test]
fn q_ac_10_release_build_that_links_test_double_fails() {
    use std::process::Command;
    let root = repo_root();
    let output = Command::new("cargo")
        .args(["check", "--release", "--features", "test-doubles", "-p", "oa-ocr"])
        .current_dir(&root)
        .output()
        .expect("cargo command executes");

    assert!(
        !output.status.success(),
        "release build linking a test double must fail (Q-AC-10)"
    );
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("A release build that links a test double fails (Q-AC-10)"),
        "stderr should cite Q-AC-10 compile_error. Got: {stderr}"
    );
}
