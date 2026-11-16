/**
 * D2: the law on the governing date. Given an instrument, one provision, its stored versions and
 * the events its source states, say whether the provision was in force on a date, and why.
 * The answer is a fact with its basis. When the record cannot settle it, the answer is
 * "undetermined" with the reason; this module never guesses. The advocate confirms the result
 * (ruling R-3). Plain library (decision 6).
 */
import type { CheckState, InForceState, Provision, StatuteAct, StatuteEvent } from "../../shared/law.ts";

export interface InForceInput {
  act: Pick<StatuteAct, "title" | "enforced" | "enforcedText" | "repealed" | "source">;
  /** Every stored version of the provision, any order. */
  versions: Provision[];
  /** The events of the provision and of the whole Act. */
  events: StatuteEvent[];
  date: string;
}

export interface InForceAnswer {
  state: InForceState;
  version: Provision | null;
  basis: string[];
  check: CheckState;
}

const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export function inForceOn(input: InForceInput): InForceAnswer {
  const { act, versions, events, date } = input;
  const basis: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { state: "undetermined", version: null, basis: ["The governing date is not a date (YYYY-MM-DD)."], check: "never" };
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const current = sorted[0] ?? null;
  const check = current?.check ?? "never";
  if (!current) return { state: "undetermined", version: null, basis: [`The library holds no text of this provision of ${act.title}.`], check };

  // 1. The Act's commencement.
  if (!act.enforced) {
    basis.push(act.enforcedText ? `The source states the commencement of ${act.title} as: "${act.enforcedText.slice(0, 300)}". It is not one date, so the commencement of this provision is for the advocate to settle.` : `The source gives no commencement date for ${act.title}.`);
    return { state: "undetermined", version: current, basis, check };
  }
  if (date < act.enforced) {
    basis.push(`${act.title} came into force on ${dmy(act.enforced)} (source). The governing date ${dmy(date)} is earlier.`);
    return { state: "not_yet_in_force", version: null, basis, check };
  }
  basis.push(`${act.title} came into force on ${dmy(act.enforced)} (source).`);

  // 2. The Act's repeal.
  const actEvents = events.filter((e) => e.provision === "");
  const repeal = actEvents.find((e) => e.kind === "repeal");
  if (act.repealed || repeal) {
    if (repeal?.date && repeal.datePrecision === "day") {
      if (date >= repeal.date) {
        basis.push(`The Act was repealed with effect from ${dmy(repeal.date)}: "${repeal.quote}".`);
        return { state: "repealed", version: current, basis, check };
      }
      basis.push(`The Act was repealed with effect from ${dmy(repeal.date)}, after the governing date.`);
    } else {
      basis.push("The source marks the Act as repealed, and the record holds no repeal date. Record the repeal date to settle this.");
      return { state: "undetermined", version: current, basis, check };
    }
  }

  // 3. The provision's own events. An event that names a clause, proviso or other part does not
  // decide the whole provision; it is recorded, and it stays visible in the basis.
  const ownAll = events.filter((e) => e.provision === current.number);
  const own = ownAll.filter((e) => e.scope !== "part").sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const partEvents = ownAll.filter((e) => e.scope === "part");
  if (partEvents.length) basis.push(`The source also records ${partEvents.length} change(s) to a part of this provision; they do not decide the whole provision.`);
  const sameYearOnly = (e: StatuteEvent) => e.datePrecision === "year" && e.date !== null && e.date.slice(0, 4) === date.slice(0, 4);
  const after = (e: StatuteEvent) => e.date !== null && (e.datePrecision === "day" ? e.date > date : Number(e.date.slice(0, 4)) > Number(date.slice(0, 4)));

  // An "Ins." note may attach to a clause, proviso or schedule entry, not the whole section.
  // Until events carry a part anchor, an insertion that follows a whole-section substitution
  // or amendment is treated as part-level and does not decide the section's own history.
  const wholeChange = own.find((e) => (e.kind === "substitution" || e.kind === "amendment") && e.date);
  const insertion = own.find((e) => e.kind === "insertion" && !(wholeChange?.date && e.date && e.date >= wholeChange.date));
  if (insertion) {
    if (sameYearOnly(insertion)) {
      basis.push(`The provision was inserted by ${insertion.byAct}; the source gives the year only, and it is the year of the governing date.`);
      return { state: "undetermined", version: current, basis, check };
    }
    if (after(insertion)) {
      basis.push(`The provision was inserted by ${insertion.byAct}${insertion.datePrecision === "day" ? ` with effect from ${dmy(insertion.date!)}` : ""}, after the governing date: "${insertion.quote}".`);
      return { state: "not_yet_in_force", version: null, basis, check };
    }
    basis.push(`Inserted by ${insertion.byAct}${insertion.datePrecision === "day" ? ` with effect from ${dmy(insertion.date!)}` : ` (year ${insertion.date!.slice(0, 4)})`}.`);
  }

  const gone = own.find((e) => e.kind === "repeal" || e.kind === "omission");
  if (current.status === "repealed" || current.status === "omitted" || gone) {
    const word = current.status === "omitted" || gone?.kind === "omission" ? "omitted" : "repealed";
    if (!gone || gone.date === null) {
      basis.push(`The source shows the provision as ${word}, and the record holds no date for it.`);
      return { state: "undetermined", version: current, basis, check };
    }
    if (sameYearOnly(gone)) {
      basis.push(`The provision was ${word} by ${gone.byAct}; the source gives the year only, and it is the year of the governing date.`);
      return { state: "undetermined", version: current, basis, check };
    }
    if (!after(gone)) {
      basis.push(`The provision was ${word} by ${gone.byAct}${gone.datePrecision === "day" ? ` with effect from ${dmy(gone.date)}` : ` (year ${gone.date.slice(0, 4)})`}: "${gone.quote}".`);
      return { state: word, version: current, basis, check };
    }
    basis.push(`The provision was ${word} by ${gone.byAct}, after the governing date. The text in force on the governing date is not in the record: the source gives the current text only.`);
    return { state: "undetermined", version: null, basis, check };
  }

  // 4. A stored version whose dates cover the governing date.
  const dated = sorted.find((v) => (v.validFrom === null || v.validFrom <= date) && (v.validUntil === null || date < v.validUntil));
  const laterChange = own.filter((e) => (e.kind === "substitution" || e.kind === "amendment") && (after(e) || sameYearOnly(e)));
  if (laterChange.length) {
    const older = sorted.find((v) => v.validUntil !== null && date < v.validUntil && (v.validFrom === null || v.validFrom <= date));
    if (older) {
      basis.push(`Version ${older.version} of the text was current until ${dmy(older.validUntil!)} (kept by this library).`);
      return { state: "in_force", version: older, basis, check: older.check };
    }
    for (const e of laterChange) basis.push(`The text was changed by ${e.byAct}${e.datePrecision === "day" ? ` with effect from ${dmy(e.date!)}` : ` (year ${e.date!.slice(0, 4)} only)`}: "${e.quote}".`);
    basis.push("The provision was in force, but the text stored is the text after that change. The earlier text is not in the record: the source gives the current text only.");
    return { state: "undetermined", version: current, basis, check };
  }
  const use = dated ?? current;
  for (const e of own.filter((x) => x.kind === "substitution" || x.kind === "amendment")) basis.push(`Changed by ${e.byAct}${e.datePrecision === "day" ? ` with effect from ${dmy(e.date!)}` : ` (year ${e.date!.slice(0, 4)})`}, before the governing date.`);
  basis.push(`Version ${use.version} of the text, read from the source on ${dmy(use.retrievedAt.slice(0, 10))}.`);
  return { state: "in_force", version: use, basis, check: use.check };
}

/** Days since the last check, against the interval (decision 16). Never checked is stale. */
export function isStale(checkedAt: string | null, intervalDays: number, now: Date = new Date()): boolean {
  if (!checkedAt) return true;
  return now.getTime() - new Date(checkedAt).getTime() > intervalDays * 86_400_000;
}
