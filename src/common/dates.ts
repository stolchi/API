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

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tashkent',
  hour: '2-digit',
  hourCycle: 'h23',
});

/** The hour of the day in Tashkent, 0 to 23. */
export function tashkentHour(now: Date = new Date()): number {
  return Number(hourFormatter.format(now));
}

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tashkent',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `14:35`, as a clock in Tashkent shows it. */
export function tashkentClock(at: Date): string {
  return clockFormatter.format(at);
}
