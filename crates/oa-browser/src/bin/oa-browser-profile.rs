//! One browser profile process (stub until CEF is vendored). Started by the
//! browser supervisor with `--launch <launch.json>`.

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let launch = match args.iter().position(|a| a == "--launch") {
        Some(i) if i + 1 < args.len() => std::path::PathBuf::from(&args[i + 1]),
        _ => {
            eprintln!("usage: oa-browser-profile --launch <launch.json>");
            std::process::exit(2);
        }
    };
    std::process::exit(oa_browser::process::serve(&launch));
}
