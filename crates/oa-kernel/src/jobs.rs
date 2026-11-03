//! Long jobs (spec A rule 12). Cancel sets a flag in `registry.db` that the
//! running job polls before each item, so a second `oa` process can cancel a
//! job started by the first. Stub runner until D07.

use oa_store::JobRow;
use oa_types::{ErrorCode, OaError};
use serde_json::{json, Value};

use crate::{store_err, Kernel};

fn job_json(j: &JobRow) -> Value {
    json!({
        "id": j.id,
        "kind": j.kind,
        "status": j.status.as_str(),
        "done": j.done,
        "total": j.total,
        "cancel_requested": j.cancel_requested,
        "message": j.message,
        "created_at": j.created_at,
        "updated_at": j.updated_at,
    })
}

impl Kernel {
    pub(crate) fn job_list(&self) -> Result<Vec<Value>, OaError> {
        Ok(self
            .registry()?
            .jobs()
            .map_err(store_err)?
            .iter()
            .map(job_json)
            .collect())
    }

    pub(crate) fn job_show(&self, id: &str) -> Result<Value, OaError> {
        self.registry()?
            .job(id)
            .map_err(store_err)?
            .map(|j| job_json(&j))
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no job {id}")))
    }

    pub(crate) fn job_cancel(&self, id: &str) -> Result<Value, OaError> {
        let registry = self.registry()?;
        if registry
            .request_cancel(id, &oa_types::now_utc())
            .map_err(store_err)?
        {
            return Ok(json!({ "id": id, "cancel_requested": true }));
        }
        match registry.job(id).map_err(store_err)? {
            Some(j) => Err(OaError::new(
                ErrorCode::Conflict,
                format!("job {id} is {}, not running", j.status.as_str()),
            )),
            None => Err(OaError::new(ErrorCode::NotFound, format!("no job {id}"))),
        }
    }
}
