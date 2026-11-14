/** V3-6: dates as the advocate writes them. ISO "2024-03-12" becomes "12.03.2024". */
export function dmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function dmyRange(start: string, end: string): string {
  return start === end ? dmy(start) : `${dmy(start)} – ${dmy(end)}`;
}
