/**
 * Phase 11 (H14): the quality of a read document. The page metrics come from the rendered page;
 * the document score and its issues come from the pages and their text.
 */

export interface PageQuality {
  /** 0 to 100, higher is sharper. */
  blur: number;
  /** Degrees from -10 to 10; 0 is straight. */
  skew: number;
}

export const QUALITY_ISSUE_KINDS = ["blank_page", "short_page", "low_confidence", "blur", "skew", "duplicate_page", "missing_page", "short_document"] as const;
export type QualityIssueKind = (typeof QUALITY_ISSUE_KINDS)[number];

export interface QualityIssue {
  kind: QualityIssueKind;
  page: number | null;
  detail: string;
  /** The points the issue takes from the score. */
  weight: number;
}

export interface DocumentQuality {
  sourceId: string;
  score: number;
  issues: QualityIssue[];
  pages: number;
  expectedPages: number | null;
  /** True when at least one page carries the image metrics. */
  imageMetrics: boolean;
  asOf: string;
}
