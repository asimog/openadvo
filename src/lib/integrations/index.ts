/**
 * Phase 11 (Y1): the integration manifest check. It refuses an unknown capability, an undeclared
 * permission, a write permission with no lifecycle step, a missing failure or disable rule, and a
 * version that is not n.n.n. Plain library (decision 6).
 */
import {
  INTEGRATION_CAPABILITIES,
  INTEGRATION_DISABLE_STATES,
  INTEGRATION_FAILURE_MODES,
  INTEGRATION_PERMISSIONS,
  type IntegrationCheck,
  type IntegrationField,
  type IntegrationManifest,
  type IntegrationPermission,
} from "../../shared/integrations.ts";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const fields = (v: unknown): IntegrationField[] =>
  (Array.isArray(v) ? v : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ name: str(x.name), type: str(x.type) }))
    .filter((x) => x.name && x.type);

/** Check a parsed manifest. A refused manifest is listed with its errors; it never runs. */
export function checkIntegrationManifest(raw: unknown): IntegrationCheck {
  const errors: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = str(o.id);
  const version = str(o.version);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`id must be lower case letters, digits and single hyphens, not "${id}"`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push(`version must be n.n.n, not "${version}"`);
  const title = str(o.title);
  if (!title) errors.push("title is required");
  const description = str(o.description);
  if (!description) errors.push("description is required");

  const capabilities = strs(o.capabilities);
  const unknownCap = capabilities.filter((c) => !(INTEGRATION_CAPABILITIES as readonly string[]).includes(c));
  if (unknownCap.length) errors.push(`unknown capabilities: ${unknownCap.join(", ")}`);
  if (capabilities.length === 0) errors.push("capabilities must name at least one of " + INTEGRATION_CAPABILITIES.join(", "));

  const permissions = strs(o.permissions);
  const unknownPerm = permissions.filter((p) => !(INTEGRATION_PERMISSIONS as readonly string[]).includes(p));
  if (unknownPerm.length) errors.push(`unknown permissions: ${unknownPerm.join(", ")}`);
  if (permissions.length === 0) errors.push("permissions must name what the integration may reach");

  const inputs = fields(o.inputs);
  const outputs = fields(o.outputs);
  if (outputs.length === 0) errors.push("outputs must name at least one field");

  const events = (o.events && typeof o.events === "object" ? o.events : {}) as Record<string, unknown>;
  const emits = strs(events.emits);
  const subscribes = strs(events.subscribes);
  if (emits.length === 0 && subscribes.length === 0) errors.push("events must name what it emits or subscribes to");

  const lifecycle = (o.lifecycle && typeof o.lifecycle === "object" ? o.lifecycle : {}) as Record<string, unknown>;
  for (const step of ["install", "enable", "disable", "remove"] as const) {
    if (!Array.isArray(lifecycle[step])) errors.push(`lifecycle.${step} must be a list of steps`);
  }
  const write = permissions.filter((p) => /\.write$/.test(p) || p === "network");
  if (write.length && (!Array.isArray(lifecycle.enable) || strs(lifecycle.enable).length === 0)) {
    errors.push(`a permission that writes or reaches the network needs lifecycle.enable steps: ${write.join(", ")}`);
  }

  const audit = (o.audit && typeof o.audit === "object" ? o.audit : {}) as Record<string, unknown>;
  const records = strs(audit.records);
  const where = str(audit.where);
  if (records.length === 0) errors.push("audit.records must name what it records");
  if (!where) errors.push("audit.where must name where the record is kept");

  const failure = (o.failure && typeof o.failure === "object" ? o.failure : {}) as Record<string, unknown>;
  const mode = str(failure.mode);
  if (!(INTEGRATION_FAILURE_MODES as readonly string[]).includes(mode)) errors.push(`failure.mode must be one of ${INTEGRATION_FAILURE_MODES.join(", ")}`);
  if (!str(failure.message)) errors.push("failure.message must say what the advocate sees");

  const disable = (o.disable && typeof o.disable === "object" ? o.disable : {}) as Record<string, unknown>;
  const state = str(disable.state);
  if (!(INTEGRATION_DISABLE_STATES as readonly string[]).includes(state)) errors.push(`disable.state must be one of ${INTEGRATION_DISABLE_STATES.join(", ")}`);

  if (errors.length) return { manifest: null, errors };
  return {
    errors,
    manifest: {
      id,
      version,
      title,
      description,
      capabilities: capabilities as IntegrationManifest["capabilities"],
      permissions: permissions as IntegrationPermission[],
      inputs,
      outputs,
      events: { emits, subscribes },
      lifecycle: {
        install: strs(lifecycle.install),
        enable: strs(lifecycle.enable),
        disable: strs(lifecycle.disable),
        remove: strs(lifecycle.remove),
      },
      audit: { records, where },
      failure: { mode: mode as IntegrationManifest["failure"]["mode"], message: str(failure.message) },
      disable: { state: state as IntegrationManifest["disable"]["state"] },
    },
  };
}

/** One line for the Settings list: what the integration may reach. */
export function permissionLine(manifest: IntegrationManifest): string {
  return `${manifest.capabilities.join(", ")}; may reach ${manifest.permissions.join(", ")}. Failure: ${manifest.failure.mode}. Disabled: ${manifest.disable.state.replace(/_/g, " ")}.`;
}
