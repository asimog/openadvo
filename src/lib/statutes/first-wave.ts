/**
 * RAG-1: the first wave of law. The owner reduced the 28-instrument list to ten on 2026-11-18:
 * the Constitution, the current and repealed criminal codes, the Evidence Act, the Civil
 * Procedure Code, the General Clauses Act and the Limitation Act. The item ids are India Code
 * DSpace item ids. The section-based instruments are read through the section items; the
 * Constitution and the repealed codes are read from the Act PDF's text extract.
 *
 * The list is data, not a decision: the owner can add or remove an instrument. Nothing is
 * fetched at import time.
 */
export type FirstWaveSource = "indiacode-sections" | "indiacode-text";

export interface FirstWaveInstrument {
  /** A stable local id: the India Code item id. */
  itemUuid: string;
  title: string;
  short: string;
  kind: "constitution" | "act";
  source: FirstWaveSource;
  /** For a text-based instrument: read the PDF text layer, or the TEXT bundle. */
  reader?: "pdf" | "text";
  /** A secondary full-text source, used only when the official parse is incomplete. */
  fallbackUrl?: string;
  /** The official parse must reach this many provisions before the fallback is not used. */
  minimumProvisions?: number;
  /** The India Code act id used by the section items, when the source is section-based. */
  actId?: string;
  number: string;
  year: string;
  repealed: boolean;
  /** The code this instrument replaced, or null. The link is a proposal, not a confirmed crosswalk. */
  replaces: string | null;
}

export const FIRST_WAVE: readonly FirstWaveInstrument[] = [
  {
    itemUuid: "544213ec-4072-44b2-a6fc-69fb84df2001",
    title: "The Constitution of India",
    short: "Constitution",
    kind: "constitution",
    source: "indiacode-text",
    reader: "pdf",
    number: "1",
    year: "1950",
    repealed: false,
    replaces: null,
  },
  {
    itemUuid: "4bb3e636-ed67-4731-8fb1-7ebfd83e1584",
    title: "The Bharatiya Nyaya Sanhita, 2023",
    short: "BNS",
    kind: "act",
    source: "indiacode-sections",
    actId: "AC_CEN_5_23_00048_2023-45_1719292564123",
    number: "45",
    year: "2023",
    repealed: false,
    replaces: "Indian Penal Code, 1860",
  },
  {
    itemUuid: "72592ac7-d084-4545-95d3-0c98dc49fac3",
    title: "The Bharatiya Nagarik Suraksha Sanhita, 2023",
    short: "BNSS",
    kind: "act",
    source: "indiacode-sections",
    actId: "AC_CEN_5_23_00049_202346_1719552320687",
    number: "46",
    year: "2023",
    repealed: false,
    replaces: "Code of Criminal Procedure, 1973",
  },
  {
    itemUuid: "9e461245-2c13-4171-9d9d-267425c01e1d",
    title: "The Bharatiya Sakshya Adhiniyam, 2023",
    short: "BSA",
    kind: "act",
    source: "indiacode-sections",
    actId: "AC_CEN_5_23_00049_2023-47_1719292804654",
    number: "47",
    year: "2023",
    repealed: false,
    replaces: "Indian Evidence Act, 1872",
  },
  {
    itemUuid: "972afbe0-a2de-415d-9df5-8d70038056ad",
    title: "The Indian Penal Code, 1860 (Rep., Act 45 of 2023)",
    short: "IPC",
    kind: "act",
    source: "indiacode-text",
    reader: "pdf",
    number: "45",
    year: "1860",
    repealed: true,
    replaces: null,
  },
  {
    itemUuid: "973d60aa-105c-4a2f-94f1-7640f0b5d6a7",
    title: "The Code of Criminal Procedure, 1973 (Rep., Act 46 of 2023)",
    short: "CrPC",
    kind: "act",
    source: "indiacode-text",
    reader: "pdf",
    fallbackUrl: "https://indiankanoon.org/doc/445276/",
    minimumProvisions: 400,
    number: "2",
    year: "1974",
    repealed: true,
    replaces: null,
  },
  {
    itemUuid: "b62073e0-4d33-4348-8eda-d92af40af24b",
    title: "The Indian Evidence Act, 1872 (Rep., Act 47 of 2023)",
    short: "Evidence Act",
    kind: "act",
    source: "indiacode-text",
    reader: "pdf",
    number: "1",
    year: "1872",
    repealed: true,
    replaces: null,
  },
  {
    itemUuid: "3d38ec80-965e-4df0-a2d2-3d97cb1dc702",
    title: "The Code of Civil Procedure, 1908",
    short: "CPC",
    kind: "act",
    source: "indiacode-sections",
    actId: "AC_CEN_3_20_00051_190805_1523340333624",
    number: "5",
    year: "1908",
    repealed: false,
    replaces: null,
  },
  {
    itemUuid: "9ce13761-0b81-44c8-b84e-8b42207ba88f",
    title: "The General Clauses Act, 1897",
    short: "General Clauses Act",
    kind: "act",
    source: "indiacode-sections",
    actId: "AC_CEN_3_20_00050_189710_1523337761854",
    number: "10",
    year: "1897",
    repealed: false,
    replaces: null,
  },
  {
    itemUuid: "5e69d11a-63e7-4a63-b86f-e063bcdeaee2",
    title: "The Limitation Act, 1963",
    short: "Limitation Act",
    kind: "act",
    source: "indiacode-sections",
    actId: "AC_CEN_3_20_00005_196336_1517807319297",
    number: "36",
    year: "1963",
    repealed: false,
    replaces: null,
  },
] as const;

export function firstWaveInstrument(itemUuid: string): FirstWaveInstrument | null {
  return FIRST_WAVE.find((instrument) => instrument.itemUuid === itemUuid) ?? null;
}
