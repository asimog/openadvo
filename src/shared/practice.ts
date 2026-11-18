/** Types of hearings, reminders and contacts (v5 spec, V5-19 to V5-23). */

export interface Hearing {
  id: string;
  date: string;
  bench: string;
  directions: string;
  nextDate: string;
  nextDateStatus: "confirmed" | "inferred";
  notes: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  text: string;
  dueAt: string;
  status: "open" | "notified" | "done";
  createdAt: string;
}

/** Phase 7 (K8): one compliance task proposed from a hearing's directions. */
export interface TaskProposal {
  id: string;
  hearingId: string;
  text: string;
  /** "" or YYYY-MM-DD. */
  dueAt: string;
  status: "open" | "accepted" | "rejected";
  author: "advocate" | "agent";
  createdAt: string;
  decidedAt: string;
}

/** Phase 7 (K9): one cross-examination question, tied to a contradiction or a recorded statement. */
export interface CrossQuestion {
  id: string;
  witness: string;
  question: string;
  targetKind: "contradiction" | "evidence";
  targetId: string;
  author: "advocate" | "agent";
  status: "candidate" | "accepted" | "rejected";
  createdAt: string;
  decidedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  kind: "client" | "opposing_party" | "advocate" | "other";
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
}
