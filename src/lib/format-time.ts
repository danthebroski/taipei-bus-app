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
