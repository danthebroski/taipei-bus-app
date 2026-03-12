export type Period = 'peak' | 'offpeak' | 'holiday';

/** Returns which headway period applies right now. */
export function getCurrentPeriod(): Period {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return 'holiday';
  const mins = now.getHours() * 60 + now.getMinutes();
  // Peak: 07:00–09:00 and 16:30–19:00
  if ((mins >= 420 && mins < 540) || (mins >= 990 && mins < 1140)) return 'peak';
  return 'offpeak';
}

/** "0500" → "05:00", "05:00" → "05:00" */
export function formatBusTime(t: string): string {
  if (!t) return '';
  if (t.includes(':')) return t.slice(0, 5);
  if (t.length === 4) return `${t.slice(0, 2)}:${t.slice(2)}`;
  return t;
}

/** "0406" → "4–6 分", "10" → "10 分" */
export function formatHeadway(h: string): string {
  if (!h) return '';
  if (h.length === 4 && !h.includes('-')) {
    const min = parseInt(h.slice(0, 2), 10);
    const max = parseInt(h.slice(2, 4), 10);
    if (!isNaN(min) && !isNaN(max) && min !== max) return `${min}–${max} 分`;
    if (!isNaN(min)) return `${min} 分`;
  }
  return `${h} 分`;
}
