/**
 * Phase 11 (S9): event triggers. A trigger names the event, the skills it starts and the
 * automated responses it proposes. A fire starts nothing: the advocate starts it.
 */

export const TRIGGER_EVENTS = ["new_document", "email", "order", "hearing_date", "stage_change", "deadline_approaching", "instruction", "amendment", "citation_change", "defect_received"] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

export const TRIGGER_RESPONSES = ["rebuild_chronology", "update_context", "flag_issues", "research_task", "letter", "recalculate_deadlines", "reassess_arguments"] as const;
export type TriggerResponse = (typeof TRIGGER_RESPONSES)[number];

export const TRIGGER_FIRE_STATES = ["proposed", "started", "dismissed"] as const;
export type TriggerFireState = (typeof TRIGGER_FIRE_STATES)[number];

export interface TriggerDefinition {
  id: string;
  event: TriggerEvent;
  title: string;
  skills: string[];
  responses: TriggerResponse[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerFire {
  id: string;
  triggerId: string;
  event: TriggerEvent;
  matterId: string;
  /** What happened: a document name, a hearing date, a stage. */
  subject: string;
  skills: string[];
  responses: TriggerResponse[];
  state: TriggerFireState;
  createdAt: string;
  decidedAt: string | null;
}

export interface TriggerFireInput {
  event: TriggerEvent;
  matterId: string;
  subject: string;
}
