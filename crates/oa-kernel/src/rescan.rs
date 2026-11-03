//! `oa registry rescan`: rebuilds the registry from the matter folders alone
//! (spec A rules 2 and 3). Runs as a cancellable long job (spec A rule 12).

use std::fs;

use oa_store::{JobRow, JobStatus, JobUpdate, MatterRow};
use oa_types::{ErrorCode, MatterId, OaError};
use serde_json::{json, Value};

use crate::layout::{self, STAGING};
use crate::matters::matter_dirs;
use crate::{store_err, Kernel};

impl Kernel {
    pub(crate) fn registry_rescan(&self) -> Result<Value, OaError> {
        let registry = self.registry()?;
        let root = self.workspace_root()?;
        let dirs = matter_dirs(&root)?;
        let staging_leftovers = fs::read_dir(root.join(STAGING))
            .map(|d| d.flatten().count())
            .unwrap_or(0);

        let now = oa_types::now_utc();
        let job = JobRow {
            id: ulid::Ulid::new().to_string(),
            kind: "registry.rescan".to_string(),
            status: JobStatus::Running,
            done: 0,
            total: dirs.len() as i64,
            cancel_requested: false,
            message: None,
            created_at: now.clone(),
            updated_at: now,
        };
        registry.create_job(&job).map_err(store_err)?;
        let update = |status, done: usize, message: Option<String>| {
            registry
                .update_job(
                    &job.id,
                    &JobUpdate {
                        status,
                        done: done as i64,
                        total: job.total,
                        message,
                        at: oa_types::now_utc(),
                    },
                )
                .map_err(store_err)
        };

        let mut found: Vec<MatterRow> = Vec::new();
        let mut skipped: Vec<Value> = Vec::new();
        let mut repaired: Vec<String> = Vec::new();
        for (i, dir) in dirs.iter().enumerate() {
            let cancelled = registry
                .job(&job.id)
                .map_err(store_err)?
                .is_some_and(|j| j.cancel_requested);
            if cancelled {
                update(
                    JobStatus::Cancelled,
                    i,
                    Some("cancelled; registry unchanged".into()),
                )?;
                return Err(OaError::new(
                    ErrorCode::Cancelled,
                    "rescan cancelled; registry unchanged",
                )
                .with_detail(json!({ "job_id": job.id, "done": i, "total": job.total })));
            }
            self.hooks.faults.before_job_item();

            let name = dir
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let mut skip =
                |reason: String| skipped.push(json!({ "folder": name, "reason": reason }));
            if name.parse::<MatterId>().is_err() {
                skip("not a matter id".into());
            } else {
                match layout::read_manifest(dir) {
                    Err(reason) => skip(reason),
                    Ok(manifest) if manifest.id != name => {
                        skip("manifest id does not match the folder".into())
                    }
                    Ok(manifest) => match self
                        .open_matter(dir)
                        .and_then(|s| s.state().map_err(store_err))
                    {
                        Err(e) => skip(format!("damaged: {}", e.message)),
                        Ok(state) => {
                            if manifest.title != state.title || manifest.archived != state.archived
                            {
                                let mut fixed = manifest.clone();
                                fixed.title = state.title.clone();
                                fixed.archived = state.archived;
                                if layout::write_manifest(dir, &fixed).is_ok() {
                                    repaired.push(state.id.clone());
                                }
                            }
                            found.push(MatterRow {
                                id: state.id,
                                path: dir.to_string_lossy().to_string(),
                                title: state.title,
                                archived: state.archived,
                                removed: false,
                                last_seen: oa_types::now_utc(),
                            });
                        }
                    },
                }
            }
            update(JobStatus::Running, i + 1, None)?;
        }

        let removed = registry
            .apply_rescan(&found, &oa_types::now_utc())
            .map_err(store_err)?;
        let summary = format!(
            "{} matters, {} newly removed, {} skipped",
            found.len(),
            removed.len(),
            skipped.len()
        );
        update(JobStatus::Done, dirs.len(), Some(summary))?;
        Ok(json!({
            "job_id": job.id,
            "status": "done",
            "matters": found.len(),
            "removed": removed,
            "skipped": skipped,
            "manifests_repaired": repaired,
            "staging_leftovers": staging_leftovers,
        }))
    }
}
