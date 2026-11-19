/**
 * C3: the classification proposal. Plain rules read the title, the source names, the parties and
 * the matter profile, and propose a practice area, case type, court, stage and the parties. The
 * proposal is a candidate; the advocate confirms or corrects it (decision 5).
 * Spec: docs/specs/advocate-matters-browser.md section 5.
 */
import type { MatterProfile } from "../../shared/work.ts";
import { stageListFor } from "../stages/index.ts";

export interface ClassificationProposal {
  practiceArea: string;
  caseType: string;
  court: string;
  proceeding: string;
  stage: string;
  parties: Array<{ role: string; name: string }>;
  /** Why each proposal was made. The advocate sees the basis, never a bare guess. */
  basis: string[];
}

export function proposeClassification(input: {
  title: string;
  profile: MatterProfile;
  parties: Array<{ role: string; nameInRecord: string }>;
  sourceNames: string[];
}): ClassificationProposal {
  const text = [input.title, ...input.sourceNames, input.profile.proceeding, input.profile.court].join(" ").toLowerCase();
  const basis: string[] = [];
  const has = (re: RegExp) => re.test(text);

  let practiceArea = "";
  if (has(/bail|fir|quash|482|crpc|ipc|bns|bnss|criminal|accused|complaint/)) practiceArea = "criminal";
  else if (has(/writ|article 226|article 32|mandamus|certiorari|constitutional/)) practiceArea = "constitutional";
  else if (has(/arbitration|section 34|section 11/)) practiceArea = "arbitration";
  else if (has(/tax|gst|income tax|customs/)) practiceArea = "tax";
  else if (has(/service|cadre|promotion/)) practiceArea = "service";
  else if (has(/consumer/)) practiceArea = "consumer";
  else if (has(/company|nclt|insolvency|ibc/)) practiceArea = "commercial";
  else if (has(/family|divorce|maintenance|custody/)) practiceArea = "family";
  else if (has(/suit|injunction|plaint|property|specific performance/)) practiceArea = "civil";
  if (practiceArea) basis.push(`The title or the files name a ${practiceArea} matter.`);

  let caseType = "";
  if (has(/anticipatory bail/)) caseType = "Anticipatory bail";
  else if (has(/regular bail|bail/)) caseType = "Bail application";
  else if (has(/quash|482/)) caseType = "Quashing petition";
  else if (has(/writ|article 226|article 32/)) caseType = "Writ petition";
  else if (has(/slp|special leave/)) caseType = "Special leave petition";
  else if (has(/revision/)) caseType = "Revision";
  else if (has(/review/)) caseType = "Review";
  else if (has(/execution/)) caseType = "Execution";
  else if (has(/arbitration/)) caseType = "Arbitration petition";
  else if (has(/consumer/)) caseType = "Consumer complaint";
  else if (has(/appeal/)) caseType = "Appeal";
  else if (has(/suit|injunction|plaint/)) caseType = "Civil suit";
  if (caseType) basis.push(`The words of the matter fit a ${caseType.toLowerCase()}.`);

  let court = input.profile.court.trim();
  if (!court) {
    const found = input.sourceNames.map((n) => n.toLowerCase()).find((n) => /supreme court|high court|district court|tribunal/.test(n));
    if (found) {
      court = found.includes("supreme") ? "Supreme Court of India" : found.includes("high") ? "High Court" : found.includes("district") ? "District Court" : "Tribunal";
      basis.push(`A file name names the ${court}.`);
    }
  }
  if (court) basis.push(`The court is taken from the recorded court or a file name.`);

  const proceeding = input.profile.proceeding.trim() || caseType;
  const list = stageListFor(proceeding, caseType, input.title);
  const stage = input.profile.stage.trim() || list.stages[0];
  basis.push(`The stage list for ${list.title.toLowerCase()} has ${list.stages.length} stages.`);

  const parties: Array<{ role: string; name: string }> = [];
  for (const p of input.parties) if (p.nameInRecord.trim()) parties.push({ role: p.role, name: p.nameInRecord.trim() });
  if (parties.length) basis.push(`${parties.length} party record(s) are already linked.`);

  return { practiceArea, caseType, court, proceeding, stage, parties, basis };
}
