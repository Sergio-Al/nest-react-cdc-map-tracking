/**
 * Civil date (YYYY-MM-DD) in an IANA timezone.
 *
 * "Today" for drivers and routes is the LOCAL day, not the UTC day: in La Paz
 * (UTC−4) the UTC date rolls over at 20:00, and treating that as "tomorrow"
 * made every evening's routes invisible to auto-arrival / auto-departure.
 */
export function localDate(timeZone: string, at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
