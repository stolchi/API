const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tashkent',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's calendar date in Tashkent, as YYYY-MM-DD. */
export function tashkentDate(now: Date = new Date()): string {
  return formatter.format(now);
}
