/**
 * The bridge contract between the preload script and the renderer.
 * Types only. The renderer calls these named functions; it has no other access.
 */
import type { AddFileResult, EventRecord, MatterSummary, OriginRecord, SourceRecord } from "./records.ts";

export type { AddFileResult, EventRecord, MatterSummary, OriginRecord, SourceRecord };

export type ChatRole = "advocate" | "agent" | "tool" | "notice";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

/** Streamed from the main process while the agent works. */
export type ChatEvent =
  | { matterId: string; type: "message"; message: ChatMessage }
  | { matterId: string; type: "delta"; messageId: string; delta: string }
  | { matterId: string; type: "busy"; busy: boolean };

export interface ChatState {
  messages: ChatMessage[];
  busy: boolean;
  model: string | null;
}

export interface OpenAdvoApi {
  // Queries
  listMatters(): Promise<MatterSummary[]>;
  openMatter(matterId: string): Promise<SourceRecord[]>;
  listSources(matterId: string): Promise<SourceRecord[]>;
  listOrigins(matterId: string, sourceId: string): Promise<OriginRecord[]>;
  listEvents(matterId: string): Promise<EventRecord[]>;
  getChat(matterId: string): Promise<ChatState>;
  // Actions
  createMatter(title: string): Promise<MatterSummary>;
  addFiles(matterId: string, paths: string[]): Promise<AddFileResult[]>;
  pickFiles(): Promise<string[]>;
  pathsForFiles(files: File[]): string[];
  sendChat(matterId: string, text: string): Promise<void>;
  onChatEvent(listener: (event: ChatEvent) => void): () => void;
}
