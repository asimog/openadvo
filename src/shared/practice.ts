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

export interface Contact {
  id: string;
  name: string;
  kind: "client" | "opposing_party" | "advocate" | "other";
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
}
