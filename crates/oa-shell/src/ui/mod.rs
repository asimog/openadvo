//! The internal UI module (spec A18, PH-10).
//! Every view draws through this module. It knows nothing about matters or commands.

pub mod frame;
pub mod human;
pub mod table;
pub mod theme;
pub mod widgets;

pub use frame::*;
pub use human::*;
pub use table::*;
pub use theme::*;
pub use widgets::*;
