/** Matter record types. Types only: shared by the library, the main process and the renderer. */

export type Actor = "advocate" | "agent" | "system";
export type SourceStatus = "ok" | "missing" | "changed";

export interface MatterSummary {
  id: string;
  title: string;
  createdAt: string;
  folder: string;
}

export interface SourceRecord {
  id: string;
  sha256: string;
  name: string;
  size: number;
  mediaType: string;
  addedAt: string;
  status: SourceStatus;
  checkedAt: string | null;
  origins: number;
}

export interface OriginRecord {
  id: number;
  sourceId: string;
  originalName: string;
  originalPath: string;
  addedAt: string;
  actor: Actor;
}

export interface EventRecord {
  seq: number;
  at: string;
  actor: Actor;
  action: string;
  subject: string | null;
  sessionId: string | null;
  data: Record<string, unknown> | null;
}

export interface AddFileResult {
  path: string;
  outcome: "added" | "duplicate" | "refused";
  source?: SourceRecord;
  reason?: string;
}

export interface WriteContext {
  actor: Actor;
  sessionId?: string | null;
}
