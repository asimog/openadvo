/**
 * Phase 11 (Y3): the storage providers. Shared by main, preload and renderer; no Node import.
 */
export type StorageProvider = "local" | "onedrive" | "google_drive";

export interface StorageFolder {
  provider: StorageProvider;
  root: string;
  exists: boolean;
  /** The env variable or folder the detection read. */
  how: string;
}
