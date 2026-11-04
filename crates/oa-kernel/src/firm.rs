//! Firm data (spec O): contacts in `firm.db`, party roles and the
//! correspondence log in `matter.db` through the single commit path, and the
//! activity timeline computed from the ledger. Nothing here makes a network
//! request (O-AC-03).

use oa_firm::{EventIn, MatterFacts, Party};
use oa_store::{Contact, DocRecordRow, MatterWrite};
use oa_types::{ErrorCode, OaError, Origin};
use serde_json::{json, Value};

use crate::command::ContactInput;
use crate::records::Live;
use crate::{store_err, Ctx, Kernel};

pub(crate) const PARTY: &str = "party";
pub(crate) const CORRESPONDENCE: &str = "correspondence";

fn usage(m: String) -> OaError {
    OaError::new(ErrorCode::Usage, m)
}

pub(crate) fn contact_json(c: &Contact) -> Value {
    json!({
        "id": c.id,
        "name": c.name,
        "kind": c.kind,
        "source": c.source,
        "details": serde_json::from_str::<Value>(&c.details).unwrap_or(json!({})),
        "confirmed": c.confirmed,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    })
}

/// Merges the input's detail fields into a details object: an absent field
/// is kept, an empty one is cleared.
fn details_of(base: &str, input: &ContactInput) -> String {
    let mut d = match serde_json::from_str::<Value>(base) {
        Ok(Value::Object(m)) => m,
        _ => serde_json::Map::new(),
    };
    for (k, v) in [
        ("organisation", &input.organisation),
        ("phone", &input.phone),
        ("email", &input.email),
        ("address", &input.address),
        ("note", &input.note),
    ] {
        match v.as_deref().map(str::trim) {
            None => {}
            Some("") => {
                d.remove(k);
            }
            Some(v) => {
                d.insert(k.into(), json!(v));
            }
        }
    }
    Value::Object(d).to_string()
}

fn party_of(row: &DocRecordRow) -> Option<Party> {
    serde_json::from_str(&row.body).ok()
}

/// What firm data being unavailable means for the advocate (O failure modes).
fn firm_unavailable(e: OaError) -> OaError {
    OaError::new(
        ErrorCode::Unavailable,
        format!(
            "firm data is unavailable ({}); contacts cannot change and matter creation for a new client is refused, other matter work continues",
            e.message
        ),
    )
}

impl Kernel {
    fn firm_or_unavailable(&self) -> Result<Box<dyn oa_store::FirmStore>, OaError> {
        self.firm().map_err(firm_unavailable)
    }

    fn contact_or_not_found(&self, id: &str) -> Result<Contact, OaError> {
        self.firm_or_unavailable()?
            .contact(id)
            .map_err(store_err)?
            .ok_or_else(|| OaError::new(ErrorCode::NotFound, format!("no contact {id}")))
    }

    /// Every contact, each with every matter and role (spec O GUI).
    pub(crate) fn contacts_list(&self, kind: Option<&str>) -> Result<Vec<Value>, OaError> {
        let kind = kind.map(|k| k.trim().to_lowercase());
        let contacts = self.firm_or_unavailable()?.contacts().map_err(store_err)?;
        let facts: Vec<MatterFacts> = self
            .all_matter_facts()?
            .into_iter()
            .map(|(f, _)| f)
            .collect();
        Ok(contacts
            .iter()
            .filter(|c| kind.as_deref().is_none_or(|k| c.kind == k))
            .map(|c| {
                let mut v = contact_json(c);
                v["matters"] = json!(oa_firm::contact_matters(&c.id, &facts));
                v
            })
            .collect())
    }

    pub(crate) fn contacts_add(&self, ctx: &Ctx, input: &ContactInput) -> Result<Value, OaError> {
        let firm = self.firm_or_unavailable()?;
        if let Some(done) = firm.contact_by_creation_key(ctx.key()).map_err(store_err)? {
            return Ok(contact_json(&done));
        }
        let kind = oa_firm::check_contact(&input.kind, &input.name, input.source.as_deref())
            .map_err(usage)?;
        let at = oa_types::now_utc();
        let contact = Contact {
            id: ulid::Ulid::new().to_string(),
            name: input.name.trim().to_string(),
            creation_key: Some(ctx.key().to_string()),
            created_at: at.clone(),
            kind,
            source: input.source.clone().filter(|s| !s.trim().is_empty()),
            details: details_of("{}", input),
            updated_at: at,
            confirmed: ctx.origin != Origin::Harness,
        };
        firm.insert_contact(&contact).map_err(store_err)?;
        Ok(contact_json(&contact))
    }

    /// Changes a contact. An empty name or kind and an absent field keep what
    /// is there; an empty field clears it. An edit by the advocate also
    /// confirms a contact the agent added.
    pub(crate) fn contacts_edit(
        &self,
        ctx: &Ctx,
        id: &str,
        input: &ContactInput,
    ) -> Result<Value, OaError> {
        let mut c = self.contact_or_not_found(id)?;
        let keep = |given: &str, current: &str| {
            if given.trim().is_empty() {
                current.to_string()
            } else {
                given.trim().to_string()
            }
        };
        let name = keep(&input.name, &c.name);
        let source = match input.source.as_deref().map(str::trim) {
            None => c.source.clone(),
            Some("") => None,
            Some(s) => Some(s.to_string()),
        };
        c.kind = oa_firm::check_contact(&keep(&input.kind, &c.kind), &name, source.as_deref())
            .map_err(usage)?;
        c.name = name;
        c.source = source;
        c.details = details_of(&c.details, input);
        c.updated_at = oa_types::now_utc();
        c.confirmed = c.confirmed || ctx.origin != Origin::Harness;
        self.firm_or_unavailable()?
            .update_contact(&c)
            .map_err(store_err)?;
        Ok(contact_json(&c))
    }

    /// What every live matter says about its people. A matter that cannot be
    /// opened is skipped, so one damaged matter does not hide the rest.
    fn all_matter_facts(&self) -> Result<Vec<(MatterFacts, Live)>, OaError> {
        let mut out = Vec::new();
        for row in self.registry()?.matters().map_err(store_err)? {
            if row.removed {
                continue;
            }
            let Ok(live) = self.live(&row.id) else {
                continue;
            };
            let facts = Self::facts_of(&live)?;
            out.push((facts, live));
        }
        Ok(out)
    }

    fn facts_of(live: &Live) -> Result<MatterFacts, OaError> {
        let state = live.store.state().map_err(store_err)?;
        let parties = live
            .store
            .doc_records(PARTY)
            .map_err(store_err)?
            .iter()
            .filter_map(party_of)
            .collect();
        Ok(MatterFacts {
            matter: live.row.id.clone(),
            title: live.row.title.clone(),
            client: state.client_id,
            parties,
        })
    }

    /// A contact page: the contact and every matter and role (O-AC-05).
    pub(crate) fn contacts_show(&self, id: &str) -> Result<Value, OaError> {
        let c = self.contact_or_not_found(id)?;
        let facts: Vec<MatterFacts> = self
            .all_matter_facts()?
            .into_iter()
            .map(|(f, _)| f)
            .collect();
        let mut v = contact_json(&c);
        v["matters"] = json!(oa_firm::contact_matters(id, &facts));
        Ok(v)
    }

    /// Party roles for a matter. When firm data is unavailable the record
    /// names still show, marked, and matter work continues.
    pub(crate) fn parties_list(&self, matter: &str) -> Result<Vec<Value>, OaError> {
        let live = self.live(matter)?;
        let firm = self.firm().ok();
        let rows = live.store.doc_records(PARTY).map_err(store_err)?;
        Ok(rows
            .iter()
            .filter_map(|row| party_of(row).map(|p| (row, p)))
            .map(|(row, p)| {
                let display = firm
                    .as_ref()
                    .and_then(|f| f.contact(&p.contact).ok().flatten())
                    .map(|c| c.name);
                json!({
                    "id": row.id,
                    "matter": live.row.id,
                    "contact": p.contact,
                    "role": p.role,
                    "record_name": p.record_name,
                    "contact_name": display,
                    "label": oa_firm::party_label(display.as_deref(), &p.record_name),
                    "names_differ": display.as_deref().is_some_and(|d| oa_firm::party_label(Some(d), &p.record_name) != d),
                    "firm_unavailable": firm.is_none(),
                    "updated_at": row.updated_at,
                })
            })
            .collect())
    }

    /// Records a party role. The record name defaults to the contact's name;
    /// when given it is kept beside the contact's name (O rule 1).
    pub(crate) fn parties_set(
        &self,
        ctx: &Ctx,
        matter: &str,
        contact: &str,
        role: &str,
        record_name: Option<&str>,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let role = oa_firm::check_role(role).map_err(usage)?;
        let c = self.contact_or_not_found(contact)?;
        let record_name = record_name
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(&c.name)
            .to_string();
        let id = oa_firm::party_id(contact);
        let party = Party {
            contact: contact.to_string(),
            role: role.clone(),
            record_name: record_name.clone(),
        };
        let body = serde_json::to_string(&party).expect("serialisable");
        let at = oa_types::now_utc();
        let previous = live.store.doc_record(PARTY, &id).map_err(store_err)?;
        let write = match &previous {
            Some(_) => MatterWrite::UpdateDocRecord {
                kind: PARTY.into(),
                id: id.clone(),
                expected: "current".into(),
                state: "current".into(),
                body,
                updated_at: at.clone(),
            },
            None => MatterWrite::InsertDocRecord(DocRecordRow {
                kind: PARTY.into(),
                id: id.clone(),
                draft_id: String::new(),
                state: "current".into(),
                body,
                created_at: at.clone(),
                updated_at: at,
            }),
        };
        let event_body = json!({
            "party": id,
            "contact": contact,
            "role": role,
            "record_name": record_name,
            "previous_role": previous.as_ref().and_then(party_of).map(|p| p.role),
        });
        let e = self.commit_event(&live, ctx, oa_firm::PARTY_EVENT, event_body, &[write])?;
        Ok(
            json!({ "party": id, "contact": contact, "role": role, "record_name": record_name, "seq": e.seq }),
        )
    }

    pub(crate) fn correspondence_log(
        &self,
        ctx: &Ctx,
        matter: &str,
        kind: &str,
        summary: &str,
        contact: Option<&str>,
        occurred_at: Option<&str>,
    ) -> Result<Value, OaError> {
        let live = self.live(matter)?;
        if let Some(done) = self.replayed(&live, ctx)? {
            return Ok(done);
        }
        let kind = oa_firm::check_correspondence(kind, summary).map_err(usage)?;
        if let Some(c) = contact {
            self.contact_or_not_found(c)?;
        }
        let at = oa_types::now_utc();
        let id = ulid::Ulid::new().to_string();
        let occurred = occurred_at
            .map(str::to_string)
            .unwrap_or_else(|| at.clone());
        let body = oa_firm::correspondence_body(&id, &kind, summary, contact, &occurred);
        let write = MatterWrite::InsertDocRecord(DocRecordRow {
            kind: CORRESPONDENCE.into(),
            id: id.clone(),
            draft_id: String::new(),
            state: "logged".into(),
            body: body.to_string(),
            created_at: at.clone(),
            updated_at: at,
        });
        let e = self.commit_event(
            &live,
            ctx,
            oa_firm::CORRESPONDENCE_EVENT,
            body.clone(),
            &[write],
        )?;
        let mut out = body;
        out["seq"] = json!(e.seq);
        Ok(out)
    }

    fn events_in(live: &Live) -> Result<Vec<EventIn>, OaError> {
        Ok(live
            .store
            .events()
            .map_err(store_err)?
            .into_iter()
            .map(|e| EventIn {
                matter: live.row.id.clone(),
                matter_title: live.row.title.clone(),
                seq: e.seq,
                at: e.recorded_at,
                actor: e.actor,
                origin: e.origin,
                command: e.command,
                body: serde_json::from_str(&e.body).unwrap_or(Value::Null),
            })
            .collect())
    }

    /// The activity timeline of a matter or a contact, computed from the
    /// ledger on every call. Nothing is stored (O rule 2, RQ-31).
    pub(crate) fn timeline(
        &self,
        matter: Option<&str>,
        contact: Option<&str>,
    ) -> Result<Vec<Value>, OaError> {
        let entries = match (matter, contact) {
            (Some(m), None) => oa_firm::timeline(&Self::events_in(&self.live(m)?)?),
            (None, Some(c)) => {
                self.contact_or_not_found(c)?;
                let mut events = Vec::new();
                for (_, live) in self.all_matter_facts()? {
                    events.extend(Self::events_in(&live)?);
                }
                oa_firm::contact_timeline(&events, c)
            }
            _ => {
                return Err(usage(
                    "timeline needs exactly one of a matter or a contact".into(),
                ))
            }
        };
        Ok(entries
            .iter()
            .map(|e| serde_json::to_value(e).expect("serialisable"))
            .collect())
    }

    /// A party or correspondence row for the Inspector.
    pub(crate) fn firm_record_of(
        live: &Live,
        id: &str,
    ) -> Result<Option<(&'static str, Value)>, OaError> {
        for kind in [PARTY, CORRESPONDENCE] {
            if let Some(row) = live.store.doc_record(kind, id).map_err(store_err)? {
                let mut v: Value = serde_json::from_str(&row.body).unwrap_or(Value::Null);
                v["id"] = json!(row.id);
                v["created_at"] = json!(row.created_at);
                v["updated_at"] = json!(row.updated_at);
                return Ok(Some((kind, v)));
            }
        }
        Ok(None)
    }
}
