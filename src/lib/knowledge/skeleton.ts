/**
 * RAG-0: the integration skeleton for Phase 5. It composes one registry over the existing
 * `LawStore` (statute, procedure, research), a matter adapter bound to one matter when a port is
 * supplied, and the firm, advocate and session scopes as deferred when their stores are absent.
 * It builds no store, writes nothing, builds no vector index and exposes no tool. TypeScript
 * only, no Rust Kernel (RAG-26).
 *
 * `createPhase5Knowledge` is the production registry: it adds verification at use, the CPC in
 * the procedure scope, and the RAG-3 firm and advocate scopes over the Phase 10 stores. The
 * session scope remains deferred. The spec is docs/specs/law-research-authority.md.
 */
import type { LawStore } from "../law-store/index.ts";
import { KnowledgeRegistry } from "./index.ts";
import type { VectorIndex } from "./index.ts";
import { advocateAdapter, boundMatterAdapter, deferredAdapter, libraryAdapter, provisionAdapter, researchAdapter, type AdvocateKnowledgePort, type FirmKnowledgePort } from "./adapters.ts";
import type { LawAdapterOptions, MatterKnowledgePort } from "./adapters.ts";

export interface SkeletonKnowledgeOptions {
  law: LawStore;
  /** The one matter this session may search. Omit it and the matter scope is deferred. */
  matter?: { id: string; port: MatterKnowledgePort } | null;
}

export function createSkeletonKnowledge(options: SkeletonKnowledgeOptions): KnowledgeRegistry {
  const adapters = [
    provisionAdapter("statute", options.law),
    provisionAdapter("procedure", options.law),
    researchAdapter(options.law),
    options.matter
      ? boundMatterAdapter(options.matter.id, options.matter.port)
      : deferredAdapter("matter", "No matter is bound to this session. Open a matter to search its record."),
    deferredAdapter("firm", "The firm library is deferred to RAG-3 (Phase 10). No firm store is connected."),
    deferredAdapter("advocate", "Advocate memory is deferred to RAG-3 (Phase 12). No memory store is connected."),
    deferredAdapter("session", "The session adapter is deferred to RAG-3 (Phase 12). No session log is connected."),
  ];
  return new KnowledgeRegistry(adapters);
}

export interface Phase5KnowledgeOptions {
  law: LawStore;
  /** The one matter this session may search. Omit it and the matter scope is deferred. */
  matter?: { id: string; port: MatterKnowledgePort } | null;
  /** Verify a stale provision against its official source when it is used. */
  verify?: LawAdapterOptions["verify"];
  /** Acts that belong in the procedure scope, such as the Civil Procedure Code. */
  procedureActIds?: string[];
  /** A judgment-paragraph vector index, when one is installed. Off by default. */
  vectors?: { index: VectorIndex; scope: string } | null;
  /** The Phase 10 Knowledge Library. Omit it and the firm scope is deferred. */
  firm?: FirmKnowledgePort | null;
  /** The Phase 10 advocate memory and preferences. Omit it and the advocate scope is deferred. */
  advocate?: AdvocateKnowledgePort | null;
}

/**
 * The Phase 5 production registry. It is the RAG-0 skeleton plus verification at use, the Civil
 * Procedure Code in the procedure scope, and the RAG-3 firm and advocate scopes over the Phase 10
 * stores. The session scope stays deferred to its owning phase.
 */
export function createPhase5Knowledge(options: Phase5KnowledgeOptions): KnowledgeRegistry {
  const adapters = [
    provisionAdapter("statute", options.law, { verify: options.verify }),
    provisionAdapter("procedure", options.law, { verify: options.verify, includeActIds: options.procedureActIds }),
    researchAdapter(options.law, options.vectors),
    options.matter
      ? boundMatterAdapter(options.matter.id, options.matter.port)
      : deferredAdapter("matter", "No matter is bound to this session. Open a matter to search its record."),
    options.firm ? libraryAdapter(options.firm) : deferredAdapter("firm", "No library store is connected. Import an item in Knowledge."),
    options.advocate ? advocateAdapter(options.advocate) : deferredAdapter("advocate", "No advocate memory store is connected. Confirm a memory record or approve a preference."),
    deferredAdapter("session", "The session adapter is deferred to RAG-3 (Phase 12). No session log is connected."),
  ];
  return new KnowledgeRegistry(adapters);
}
