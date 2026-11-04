//! `wordcraft --headless`: the engine as a pipe server (one JSON request per
//! line). `wordcraft --headless corpus <dir>`: the corpus regression.
//! `wordcraft --edit <working.docx> --script <ops.json>`: the hosted editor
//! stub. All of it stands in for the vendored WordCraft fork.

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["--headless"] => {
            oa_docs::engine::serve(std::io::stdin().lock(), std::io::stdout().lock());
            ExitCode::SUCCESS
        }
        ["--headless", "corpus", dir] => match oa_docs::corpus::check_dir(dir.as_ref()) {
            Ok(files) => {
                let clean = files.iter().all(|f| f.clean());
                for f in &files {
                    println!("{}", serde_json::to_string(f).unwrap_or_default());
                }
                if clean {
                    ExitCode::SUCCESS
                } else {
                    ExitCode::from(1)
                }
            }
            Err(e) => {
                eprintln!("wordcraft: {e}");
                ExitCode::from(2)
            }
        },
        ["--edit", working, "--script", script] => {
            let ops: Vec<oa_docs::editor::EditOp> = match std::fs::read_to_string(script)
                .map_err(|e| e.to_string())
                .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
            {
                Ok(ops) => ops,
                Err(e) => {
                    eprintln!("wordcraft: the script cannot be read: {e}");
                    return ExitCode::from(2);
                }
            };
            ExitCode::from(oa_docs::editor::run(working.as_ref(), &ops) as u8)
        }
        _ => {
            eprintln!(
                "usage: wordcraft --headless [corpus <dir>] | wordcraft --edit <docx> --script <json>"
            );
            ExitCode::from(2)
        }
    }
}
