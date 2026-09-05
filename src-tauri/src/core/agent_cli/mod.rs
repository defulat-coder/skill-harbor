//! Agent CLI chat adapters: detection, streaming runs, and in-memory
//! CLI-native session resume. See `docs/design/` and the OpenDesign
//! `apps/daemon/src/runtimes/` sources this module is ported from.
pub mod defs;
pub mod detect;
pub mod parse;
pub mod session;
