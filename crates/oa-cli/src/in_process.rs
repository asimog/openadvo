use oa_client::Client;
use oa_kernel::{Ctx, Kernel};
use oa_protocol::Request;
use oa_types::{OaError, Origin};
use serde_json::Value;

/// A headless kernel in this process, with a fixed origin.
pub struct InProcess {
    kernel: Kernel,
    origin: Origin,
}

impl InProcess {
    pub fn new(kernel: Kernel, origin: Origin) -> Self {
        InProcess { kernel, origin }
    }
}

impl Client for InProcess {
    fn call(&self, key: Option<String>, req: Request) -> Result<Vec<Value>, OaError> {
        let ctx = Ctx {
            origin: self.origin,
            key,
        };
        self.kernel.dispatch(&ctx, req)
    }
}
