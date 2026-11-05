//! Kernel shutdown and job checkpointing (spec C rule 22, C-AC-25, spec A rule 21).

use oa_store::{JobStatus, JobUpdate};
use oa_types::OaError;
use serde_json::{json, Value};

use crate::{store_err, Ctx, Kernel};

impl Kernel {
    /// Checkpoints running jobs, stops supervised processes, and requests shutdown.
    pub(crate) fn kernel_shutdown(&self, _ctx: &Ctx) -> Result<Value, OaError> {
        let reg = self.registry()?;
        let jobs = reg.jobs().map_err(store_err)?;
        let mut checkpointed_count = 0;
        let now = oa_types::now_utc();
        for job in jobs {
            if job.status == JobStatus::Running {
                reg.update_job(
                    &job.id,
                    &JobUpdate {
                        status: JobStatus::Checkpointed,
                        done: job.done,
                        total: job.total,
                        message: Some("checkpointed on shutdown".to_string()),
                        at: now.clone(),
                    },
                )
                .map_err(store_err)?;
                checkpointed_count += 1;
            }
        }
        // The serving process exits right after this reply without running
        // destructors, so supervised processes are stopped here.
        self.browser_stop_all();
        Ok(json!({
            "shutdown": true,
            "checkpointed_jobs": checkpointed_count,
        }))
    }

    /// Resumes checkpointed jobs upon startup (C-AC-25).
    pub fn resume_checkpointed_jobs(&self) -> Result<usize, OaError> {
        let reg = self.registry()?;
        let jobs = reg.jobs().map_err(store_err)?;
        let mut resumed_count = 0;
        let now = oa_types::now_utc();
        for job in jobs {
            if job.status == JobStatus::Checkpointed {
                reg.update_job(
                    &job.id,
                    &JobUpdate {
                        status: JobStatus::Running,
                        done: job.done,
                        total: job.total,
                        message: Some("resumed from checkpoint".to_string()),
                        at: now.clone(),
                    },
                )
                .map_err(store_err)?;
                resumed_count += 1;
            }
        }
        Ok(resumed_count)
    }
}
