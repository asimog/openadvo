use oa_shell::views::REGISTRY;
use oa_shell::{gallery, options, views, App};
use std::path::PathBuf;

fn main() -> eframe::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let flag = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    if let Some(view) = flag("--gallery") {
        let Some(def) = views::by_key(&view) else {
            let keys: Vec<_> = REGISTRY.iter().map(|d| d.key).collect();
            eprintln!("unknown view {view:?}; views are {}", keys.join(", "));
            std::process::exit(2);
        };
        let shot = flag("--screenshot").map(PathBuf::from);
        let only = flag("--state");
        return eframe::run_native(
            "Open Advocate gallery",
            options(false, [1700.0, 1000.0]),
            Box::new(move |_cc| Ok(Box::new(gallery::Gallery::new(def.id, shot, only)))),
        );
    }
    eframe::run_native(
        "Open Advocate",
        options(true, [1100.0, 700.0]),
        Box::new(|_cc| Ok(Box::new(App::new()))),
    )
}
