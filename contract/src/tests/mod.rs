//! Contract tests. Spec section 7.
//!
//! T17, T20, and the full T26 measurement live in `integration-tests/`.
//! T31, T32, and T38 are web tests (task 004). T33 is a manual README run.

use super::*;

mod common;
mod expire;
mod mint;
mod open_mint;
mod pay;
mod storage;
mod transfer;
