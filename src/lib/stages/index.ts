/**
 * C4: the stage list of each proceeding. A proceeding's stages are not another's: a bail
 * application, a suit, a writ, an appeal, an execution and an arbitration petition each have
 * their own list. The advocate records the current stage; the list only proposes the order.
 * Spec: docs/specs/advocate-matters-browser.md section 5.
 */
export interface StageList {
  key: string;
  title: string;
  stages: string[];
}

export const STAGE_LISTS: Record<string, StageList> = {
  bail: {
    key: "bail",
    title: "Bail application",
    stages: ["Application filed", "Notice issued", "Reply", "Arguments", "Order", "Compliance"],
  },
  quashing: {
    key: "quashing",
    title: "Quashing petition",
    stages: ["Petition filed", "Notice issued", "Counter affidavit", "Rejoinder", "Arguments", "Order", "Compliance"],
  },
  writ: {
    key: "writ",
    title: "Writ petition",
    stages: ["Petition filed", "Notice issued", "Counter affidavit", "Rejoinder", "Arguments", "Judgment", "Compliance"],
  },
  suit: {
    key: "suit",
    title: "Civil suit",
    stages: ["Plaint filed", "Service", "Written statement", "Framing of issues", "Evidence", "Arguments", "Judgment", "Decree", "Execution"],
  },
  appeal: {
    key: "appeal",
    title: "Appeal",
    stages: ["Appeal filed", "Limitation", "Notice issued", "Paper book", "Arguments", "Judgment", "Compliance"],
  },
  revision: {
    key: "revision",
    title: "Revision",
    stages: ["Revision filed", "Notice issued", "Reply", "Arguments", "Order", "Compliance"],
  },
  review: {
    key: "review",
    title: "Review",
    stages: ["Review filed", "Notice issued", "Reply", "Arguments", "Order"],
  },
  execution: {
    key: "execution",
    title: "Execution",
    stages: ["Execution filed", "Notice issued", "Objections", "Attachment", "Sale", "Satisfaction"],
  },
  arbitration: {
    key: "arbitration",
    title: "Arbitration petition",
    stages: ["Petition filed", "Notice issued", "Reply", "Arguments", "Order", "Compliance"],
  },
  consumer: {
    key: "consumer",
    title: "Consumer complaint",
    stages: ["Complaint filed", "Admission", "Notice", "Reply", "Evidence", "Arguments", "Order", "Compliance"],
  },
  tax: {
    key: "tax",
    title: "Tax appeal",
    stages: ["Appeal filed", "Notice", "Reply", "Arguments", "Order", "Compliance"],
  },
  service: {
    key: "service",
    title: "Service matter",
    stages: ["Application filed", "Notice", "Reply", "Arguments", "Order", "Compliance"],
  },
  other: {
    key: "other",
    title: "Other proceeding",
    stages: ["Filed", "Notice", "Reply", "Arguments", "Order", "Compliance"],
  },
};

/** The stage list for a proceeding name, a case type or a practice area. Unknown words get "other". */
export function stageListFor(...words: Array<string | null | undefined>): StageList {
  const text = words.filter(Boolean).join(" ").toLowerCase();
  if (/bail|anticipatory bail/.test(text)) return STAGE_LISTS.bail;
  if (/quash|482|crpc/.test(text)) return STAGE_LISTS.quashing;
  if (/writ|article 226|article 32|mandamus|certiorari/.test(text)) return STAGE_LISTS.writ;
  if (/suit|injunction|plaint|specific performance/.test(text)) return STAGE_LISTS.suit;
  if (/revision|revisional/.test(text)) return STAGE_LISTS.revision;
  if (/review/.test(text)) return STAGE_LISTS.review;
  if (/execution|decree/.test(text)) return STAGE_LISTS.execution;
  if (/arbitration|section 34|section 11/.test(text)) return STAGE_LISTS.arbitration;
  if (/consumer/.test(text)) return STAGE_LISTS.consumer;
  if (/tax|gst|income tax|customs/.test(text)) return STAGE_LISTS.tax;
  if (/service|cadre|promotion/.test(text)) return STAGE_LISTS.service;
  if (/appeal|slp|special leave/.test(text)) return STAGE_LISTS.appeal;
  return STAGE_LISTS.other;
}

/** The current stage's place in the list, or -1 when the recorded stage is not in it. */
export function stageIndex(list: StageList, stage: string): number {
  return list.stages.findIndex((s) => s.toLowerCase() === stage.trim().toLowerCase());
}
