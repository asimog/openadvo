/**
 * Phase 11 (Y1): the integration manifest. An integration declares what it does, what it may
 * reach, what it reads and writes, the events it emits and subscribes to, its lifecycle, its audit,
 * and what happens when it fails or is disabled. No integration ships with the application.
 */

export const INTEGRATION_CAPABILITIES = ["search", "fetch", "import", "export", "notify", "model", "court"] as const;
export type IntegrationCapability = (typeof INTEGRATION_CAPABILITIES)[number];

export const INTEGRATION_PERMISSIONS = ["files.read", "files.write", "network", "matter.read", "matter.write", "advocate.read"] as const;
export type IntegrationPermission = (typeof INTEGRATION_PERMISSIONS)[number];

export const INTEGRATION_FAILURE_MODES = ["disable", "retry", "ask"] as const;
export const INTEGRATION_DISABLE_STATES = ["read_only", "none"] as const;

export interface IntegrationField {
  name: string;
  type: string;
}

export interface IntegrationManifest {
  id: string;
  version: string;
  title: string;
  description: string;
  capabilities: IntegrationCapability[];
  permissions: IntegrationPermission[];
  inputs: IntegrationField[];
  outputs: IntegrationField[];
  events: { emits: string[]; subscribes: string[] };
  lifecycle: { install: string[]; enable: string[]; disable: string[]; remove: string[] };
  audit: { records: string[]; where: string };
  failure: { mode: (typeof INTEGRATION_FAILURE_MODES)[number]; message: string };
  disable: { state: (typeof INTEGRATION_DISABLE_STATES)[number] };
}

/** One installed manifest, as the store keeps it. */
export interface IntegrationRecord {
  id: string;
  version: string;
  title: string;
  enabled: boolean;
  error: string | null;
  manifest: IntegrationManifest | null;
  installedAt: string;
  updatedAt: string;
}

export interface IntegrationCheck {
  manifest: IntegrationManifest | null;
  errors: string[];
}
