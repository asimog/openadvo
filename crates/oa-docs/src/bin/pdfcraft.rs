//! `pdfcraft --view <pdf>` and `pdfcraft --edit <pdf>`: the PdfCraft stub. It
//! refuses to open the filing PDF for editing (J rule 13).

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (edit, path) = match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["--view", p] => (false, p.to_string()),
        ["--edit", p] => (true, p.to_string()),
        _ => {
            eprintln!("usage: pdfcraft --view <pdf> | pdfcraft --edit <pdf>");
            return ExitCode::from(2);
        }
    };
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("pdfcraft: {path}: {e}");
            return ExitCode::from(2);
        }
    };
    match oa_docs::pdfcraft_open(&bytes, edit) {
        Ok(r) => {
            println!("{} pages", r.pages.len());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("pdfcraft: refused: {e}");
            ExitCode::from(3)
        }
    }
}
