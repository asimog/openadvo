//! Matter lifecycle (spec A rules 1, 3, 4 and 5).

use std::fs;
use std::path::{Path, PathBuf};

use oa_store::{Contact, MatterRow, MatterState, MatterWrite, Pending};
use oa_types::{ErrorCode, MatterId, OaError, Origin};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::command::{Attachment, ClientSpec};
use crate::hooks::Step;
use crate::layout::{self, Manifest, STAGING};
use crate::ledger::{self, NewEvent, GENESIS_PREV};
use crate::{io_err, rejected, store_err, Ctx, Kernel};

const NEW_CLIENT_MATTER: &str = "matter.create.new_client";

#[derive(Serialize, Deserialize)]
struct PendingMatter {
    title: String,
    client_name: String,
    key: String,
    /// An existing contact the agent added and no advocate has confirmed
    /// (spec O). Absent for a client not yet in firm data.
    #[serde(default)]
    contact: Option<String>,
}

fn matter_json(state: &MatterState, dir: &Path) -> Value {
    json!({
        "id": state.id,
        "urn": format!("urn:ulos:matter:{}", state.id),
        "title": state.title,
        "archived": state.archived,
        "client_id": state.client_id,
        "created_at": state.created_at,
        "standard_version": state.standard_version,
        "path": dir.to_string_lossy(),
    })
}

fn row_for(state: &MatterState, dir: &Path) -> MatterRow {
    MatterRow {
        id: state.id.clone(),
        path: dir.to_string_lossy().to_string(),
        title: state.title.clone(),
        archived: state.archived,
        removed: false,
        last_seen: oa_types::now_utc(),
    }
}

fn manifest_for(state: &MatterState, creation_key: &str) -> Manifest {
    Manifest {
        id: state.id.clone(),
        urn: format!("urn:ulos:matter:{}", state.id),
        title: state.title.clone(),
        archived: state.archived,
        client_id: state.client_id.clone(),
        created_at: state.created_at.clone(),
        standard_version: state.standard_version.clone(),
        rule_pack: layout::RULE_PACK.to_string(),
        creation_key: creation_key.to_string(),
    }
}

/// Matter folders directly under the root, skipping dot folders.
pub(crate) fn matter_dirs(root: &Path) -> Result<Vec<PathBuf>, OaError> {
    let mut dirs = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| io_err("workspace root", e))? {
        let entry = entry.map_err(|e| io_err("workspace root", e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with('.') && entry.path().is_dir() {
            dirs.push(entry.path());
        }
    }
    dirs.sort();
    Ok(dirs)
}

pub(crate) fn safe_file_name(name: &str) -> Result<String, OaError> {
    let base = Path::new(name)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    crate::paths::classify(&format!("inbox/{base}"))
        .map(|_| base)
        .map_err(|reason| {
            OaError::new(
                ErrorCode::Usage,
                format!("attachment name refused: {reason}"),
            )
        })
}

impl Kernel {
    pub(crate) fn matter_create(
        &self,
        ctx: &Ctx,
        title: &str,
        client: ClientSpec,
        from: Option<Attachment>,
    ) -> Result<Value, OaError> {
        let title = title.trim();
        if title.is_empty() {
            return Err(OaError::new(ErrorCode::Usage, "a matter needs a title"));
        }
        let registry = self.registry()?;
        self.workspace_root()?;
        if let Some(done) = registry.idempotent_result(ctx.key()).map_err(store_err)? {
            return serde_json::from_str(&done)
                .map_err(|e| OaError::new(ErrorCode::Internal, e.to_string()));
        }
        let firm = self.firm()?;
        let client_id = match client {
            ClientSpec::None => None,
            ClientSpec::Existing(id) => {
                let mut contact = firm.contact(&id).map_err(store_err)?.ok_or_else(|| {
                    OaError::new(ErrorCode::NotFound, format!("no client with id {id}"))
                })?;
                // A contact only the agent has seen is still a new client
                // (RQ-87): it needs the same confirmation.
                if !contact.confirmed {
                    if ctx.origin == Origin::Harness {
                        if from.is_some() {
                            return Err(OaError::new(
                                ErrorCode::Usage,
                                "a matter for an unconfirmed client cannot carry a file until it is confirmed; write the file after confirmation",
                            ));
                        }
                        return Err(self.propose_client_matter(
                            ctx,
                            title,
                            &contact.name,
                            Some(&contact.id),
                        )?);
                    }
                    self.require_presence(&format!(
                        "Confirm the client \"{}\" and create the matter \"{title}\"",
                        contact.name
                    ))?;
                    contact.confirmed = true;
                    contact.updated_at = oa_types::now_utc();
                    firm.update_contact(&contact).map_err(store_err)?;
                }
                Some(contact.id)
            }
            ClientSpec::New(name) => {
                let name = name.trim().to_string();
                if name.is_empty() {
                    return Err(OaError::new(ErrorCode::Usage, "a new client needs a name"));
                }
                if let Some(existing) =
                    firm.contact_by_creation_key(ctx.key()).map_err(store_err)?
                {
                    Some(existing.id)
                } else if ctx.origin == Origin::Harness {
                    if from.is_some() {
                        return Err(OaError::new(
                            ErrorCode::Usage,
                            "a matter for a new client cannot carry a file until it is confirmed; write the file after confirmation",
                        ));
                    }
                    return Err(self.propose_client_matter(ctx, title, &name, None)?);
                } else {
                    self.require_presence(&format!(
                        "Create a new client record \"{name}\" and the matter \"{title}\""
                    ))?;
                    Some(self.insert_client(&name, ctx.key())?)
                }
            }
        };
        self.create_matter_folder(ctx, ctx.key(), title, client_id, from)
    }

    /// The agent may propose a matter for a new client. The advocate confirms
    /// it with `oa matter confirm` (RQ-87).
    fn propose_client_matter(
        &self,
        ctx: &Ctx,
        title: &str,
        name: &str,
        contact: Option<&str>,
    ) -> Result<OaError, OaError> {
        let id = ulid::Ulid::new().to_string();
        let payload = PendingMatter {
            title: title.to_string(),
            client_name: name.to_string(),
            key: ctx.key().to_string(),
            contact: contact.map(str::to_string),
        };
        self.firm()?
            .insert_pending(&Pending {
                id: id.clone(),
                kind: NEW_CLIENT_MATTER.to_string(),
                payload: serde_json::to_string(&payload).expect("serialisable"),
                created_at: oa_types::now_utc(),
            })
            .map_err(store_err)?;
        Ok(OaError::new(
            ErrorCode::ConfirmationRequired,
            format!("creating the client \"{name}\" needs the advocate's confirmation: oa matter confirm {id}"),
        )
        .with_detail(json!({ "pending_id": id })))
    }

    fn insert_client(&self, name: &str, key: &str) -> Result<String, OaError> {
        let id = ulid::Ulid::new().to_string();
        self.firm()?
            .insert_contact(&Contact::person(
                &id,
                name,
                Some(key.to_string()),
                &oa_types::now_utc(),
            ))
            .map_err(store_err)?;
        Ok(id)
    }

    pub(crate) fn matter_confirm(&self, ctx: &Ctx, pending_id: &str) -> Result<Value, OaError> {
        let firm = self.firm()?;
        let pending = firm
            .pending(pending_id)
            .map_err(store_err)?
            .filter(|p| p.kind == NEW_CLIENT_MATTER)
            .ok_or_else(|| {
                OaError::new(
                    ErrorCode::NotFound,
                    format!("no pending confirmation {pending_id}"),
                )
            })?;
        let p: PendingMatter = serde_json::from_str(&pending.payload)
            .map_err(|e| OaError::new(ErrorCode::Internal, e.to_string()))?;
        self.require_presence(&if p.contact.is_some() {
            format!(
                "Confirm the client \"{}\" and create the matter \"{}\"",
                p.client_name, p.title
            )
        } else {
            format!(
                "Create a new client record \"{}\" and the matter \"{}\"",
                p.client_name, p.title
            )
        })?;
        let existing = match &p.contact {
            Some(id) => firm.contact(id).map_err(store_err)?,
            None => firm.contact_by_creation_key(&p.key).map_err(store_err)?,
        };
        let client_id = match existing {
            Some(mut c) => {
                if !c.confirmed {
                    c.confirmed = true;
                    c.updated_at = oa_types::now_utc();
                    firm.update_contact(&c).map_err(store_err)?;
                }
                c.id
            }
            None => self.insert_client(&p.client_name, &p.key)?,
        };
        let result = self.create_matter_folder(ctx, &p.key, &p.title, Some(client_id), None)?;
        firm.remove_pending(pending_id).map_err(store_err)?;
        Ok(result)
    }

    /// Spec A rule 1: the folder, its manifest and `matter.db` with the genesis
    /// event exist before the registry row. The folder is built under
    /// `.staging/` and moved into place in one rename, so a killed create never
    /// leaves a half-built matter in the root. A retry with the same key
    /// resumes.
    fn create_matter_folder(
        &self,
        ctx: &Ctx,
        key: &str,
        title: &str,
        client_id: Option<String>,
        from: Option<Attachment>,
    ) -> Result<Value, OaError> {
        let registry = self.registry()?;
        if let Some(done) = registry.idempotent_result(key).map_err(store_err)? {
            return serde_json::from_str(&done)
                .map_err(|e| OaError::new(ErrorCode::Internal, e.to_string()));
        }
        let root = self.workspace_root()?;

        // Resume: the folder was moved into place but the row was not written.
        for dir in matter_dirs(&root)? {
            if layout::read_manifest(&dir).is_ok_and(|m| m.creation_key == key) {
                let state = self.open_matter(&dir)?.state().map_err(store_err)?;
                let result = matter_json(&state, &dir);
                registry
                    .insert_created_matter(&row_for(&state, &dir), key, &result.to_string())
                    .map_err(store_err)?;
                return Ok(result);
            }
        }
        // The staged folder is named after the key, so a create killed at any
        // step, even before its manifest exists, is found and started again.
        let staged = root
            .join(STAGING)
            .join(&ledger::sha256_hex(key.as_bytes())["sha256:".len()..][..32]);
        if staged.exists() {
            fs::remove_dir_all(&staged).map_err(|e| io_err("staging cleanup", e))?;
        }

        let faults = &self.hooks.faults;
        let id = MatterId::new().to_string();
        let state = MatterState {
            id: id.clone(),
            title: title.to_string(),
            archived: false,
            client_id,
            created_at: oa_types::now_utc(),
            standard_version: layout::STANDARD_VERSION.to_string(),
        };

        faults.before(Step::StageFolder)?;
        layout::create_layout(&staged).map_err(|e| io_err("matter folder", e))?;

        faults.before(Step::WriteManifest)?;
        layout::write_manifest(&staged, &manifest_for(&state, key))
            .map_err(|e| io_err("manifest", e))?;

        faults.before(Step::CreateMatterDb)?;
        let store = self.stores.create_matter(&staged).map_err(store_err)?;

        faults.before(Step::WriteGenesis)?;
        let genesis = ledger::build(NewEvent {
            seq: 1,
            prev_hash: GENESIS_PREV,
            origin: ctx.origin,
            command: "matter.created",
            key: Some(key),
            body: json!({
                "matter": format!("urn:ulos:matter:{id}"),
                "title": state.title,
                "client_id": state.client_id,
                "standard_version": state.standard_version,
                "rule_pack": layout::RULE_PACK,
            }),
        });
        store.initialise(&state, &genesis).map_err(store_err)?;
        drop(store);
        if let Some(att) = &from {
            let name = safe_file_name(&att.file_name)?;
            layout::write_atomic(&staged.join("inbox").join(name), &att.bytes)
                .map_err(|e| io_err("attachment", e))?;
        }

        faults.before(Step::MoveIntoPlace)?;
        let dir = root.join(&id);
        fs::rename(&staged, &dir).map_err(|e| io_err("moving the matter folder into place", e))?;

        faults.before(Step::WriteRegistryRow)?;
        let result = matter_json(&state, &dir);
        registry
            .insert_created_matter(&row_for(&state, &dir), key, &result.to_string())
            .map_err(store_err)?;
        Ok(result)
    }

    pub(crate) fn matter_list(&self, include_removed: bool) -> Result<Vec<Value>, OaError> {
        let rows = self.registry()?.matters().map_err(store_err)?;
        Ok(rows
            .into_iter()
            .filter(|r| include_removed || !r.removed)
            .map(|r| {
                let present = Path::new(&r.path).join(layout::MANIFEST).is_file();
                json!({
                    "id": r.id,
                    "urn": format!("urn:ulos:matter:{}", r.id),
                    "title": r.title,
                    "archived": r.archived,
                    "removed": r.removed,
                    "folder_present": present,
                    "path": r.path,
                    "last_seen": r.last_seen,
                })
            })
            .collect())
    }

    /// Finds a live matter. A folder that has gone is recorded as removed
    /// (spec A rule 3) and refused.
    pub(crate) fn locate(&self, id: &str) -> Result<(MatterRow, PathBuf), OaError> {
        let id: MatterId = id.parse()?;
        let registry = self.registry()?;
        let mut row = registry
            .matter(&id.to_string())
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no matter {id}")))?;
        if row.removed {
            return Err(OaError::new(
                ErrorCode::MatterRemoved,
                format!("matter {id} was removed"),
            ));
        }
        let dir = PathBuf::from(&row.path);
        if !dir.join(layout::MANIFEST).is_file() {
            row.removed = true;
            row.last_seen = oa_types::now_utc();
            registry.upsert_matter(&row).map_err(store_err)?;
            return Err(OaError::new(
                ErrorCode::MatterRemoved,
                format!("the folder of matter {id} is gone; it is now marked removed"),
            ));
        }
        Ok((row, dir))
    }

    pub(crate) fn matter_open(&self, id: &str) -> Result<Value, OaError> {
        let (mut row, dir) = self.locate(id)?;
        let state = self.open_matter(&dir)?.state().map_err(store_err)?;
        row.last_seen = oa_types::now_utc();
        self.registry()?.upsert_matter(&row).map_err(store_err)?;
        Ok(matter_json(&state, &dir))
    }

    pub(crate) fn matter_rename(&self, ctx: &Ctx, id: &str, title: &str) -> Result<Value, OaError> {
        let title = title.trim().to_string();
        if title.is_empty() {
            return Err(OaError::new(ErrorCode::Usage, "a matter needs a title"));
        }
        self.change_state(ctx, id, "matter.renamed", |s| {
            if s.title == title {
                return None;
            }
            let body = json!({ "from": s.title, "to": title });
            s.title = title.clone();
            Some(body)
        })
    }

    pub(crate) fn matter_archive(&self, ctx: &Ctx, id: &str) -> Result<Value, OaError> {
        self.change_state(ctx, id, "matter.archived", |s| {
            if s.archived {
                return None;
            }
            s.archived = true;
            Some(json!({}))
        })
    }

    /// One ledger event and the new current state in one transaction, then the
    /// manifest copy and the registry row. `change` returns `None` when there
    /// is nothing to change.
    fn change_state(
        &self,
        ctx: &Ctx,
        id: &str,
        command: &str,
        change: impl FnOnce(&mut MatterState) -> Option<Value>,
    ) -> Result<Value, OaError> {
        let (mut row, dir) = self.locate(id)?;
        let store = self.open_matter(&dir)?;
        if store.event_by_key(ctx.key()).map_err(store_err)?.is_some() {
            return Ok(matter_json(&store.state().map_err(store_err)?, &dir));
        }
        let mut state = store.state().map_err(store_err)?;
        let Some(body) = change(&mut state) else {
            return Ok(matter_json(&state, &dir));
        };
        let head = store.last_event().map_err(store_err)?.ok_or_else(|| {
            OaError::new(ErrorCode::MatterDamaged, "the ledger has no genesis event")
        })?;
        let mut body = body;
        body["matter"] = json!(format!("urn:ulos:matter:{}", state.id));
        let event = ledger::build(NewEvent {
            seq: head.seq + 1,
            prev_hash: &head.hash,
            origin: ctx.origin,
            command,
            key: Some(ctx.key()),
            body,
        });
        store
            .commit(&event, &[MatterWrite::State(state.clone())])
            .map_err(store_err)?;

        let creation_key = layout::read_manifest(&dir)
            .map(|m| m.creation_key)
            .unwrap_or_default();
        layout::write_manifest(&dir, &manifest_for(&state, &creation_key))
            .map_err(|e| io_err("manifest", e))?;
        row.title = state.title.clone();
        row.archived = state.archived;
        row.last_seen = oa_types::now_utc();
        self.registry()?.upsert_matter(&row).map_err(store_err)?;
        Ok(matter_json(&state, &dir))
    }

    /// Raw writes go only under `inbox/` and `harness/scratch/`. Everything
    /// else is written by the kernel's own commands (spec A rule 5).
    pub(crate) fn matter_write_file(
        &self,
        ctx: &Ctx,
        id: &str,
        relpath: &str,
        bytes: &[u8],
    ) -> Result<Value, OaError> {
        const COMMAND: &str = "matter.write_file";
        let (row, dir) = self.locate(id)?;
        let store = self.open_matter(&dir)?;
        let refuse = |reason: String| -> OaError {
            let audit = store.record_rejected(&rejected(ctx, COMMAND, &reason, bytes));
            match audit {
                Ok(()) => OaError::new(ErrorCode::WriteRefused, reason),
                Err(e) => store_err(e),
            }
        };
        let (area, segments) = crate::paths::classify(relpath).map_err(refuse)?;
        if ctx.origin == Origin::Harness && !self.hooks.grants.harness_may_write(&row.id, area) {
            return Err(refuse(format!(
                "the harness holds no grant to write {relpath:?}"
            )));
        }
        let target = segments.iter().fold(dir.clone(), |p, s| p.join(s));
        let hash = ledger::sha256_hex(bytes);
        if target.exists() {
            let existing = fs::read(&target).map_err(|e| io_err("existing file", e))?;
            if ledger::sha256_hex(&existing) != hash {
                return Err(OaError::new(
                    ErrorCode::Conflict,
                    format!("{relpath:?} already exists with different content"),
                ));
            }
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| io_err("folder", e))?;
            }
            layout::write_atomic(&target, bytes).map_err(|e| io_err("file", e))?;
        }
        Ok(json!({
            "matter": row.id,
            "path": segments.join("/"),
            "bytes": bytes.len(),
            "sha256": hash,
        }))
    }
}
