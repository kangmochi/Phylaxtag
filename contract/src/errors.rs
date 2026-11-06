//! Rejection helper.
//!
//! The release profile sets `panic = "abort"`, so a plain panic reaches the client as
//! `WebAssembly trap` and the reason is lost. Logging the reason first keeps it in the
//! receipt logs, where a client or a block explorer can read it.

use near_sdk::env;

/// Log the reason, then abort with the same text.
pub(crate) fn refuse(message: &str) -> ! {
    env::log_str(&format!("Phylaxtag error: {message}"));
    env::panic_str(message);
}

/// `require!` with the reason logged first. Same shape as `require!`.
macro_rules! refuse_unless {
    ($cond:expr, $($arg:tt)*) => {
        if !$cond {
            $crate::errors::refuse(&format!($($arg)*));
        }
    };
}

pub(crate) use refuse_unless;
