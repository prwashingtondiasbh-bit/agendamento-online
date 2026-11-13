export function generateThirtyMinuteSlots(
  openTime = '08:00',
  closeTime = '20:00',
  includeEnd = false
): string[] {
  const parseMin = (hhmm: string, fallback: number) => {
    const parts = String(hhmm || '').split(':');
    const h = Number(parts[0]);
    const m = parts[1] !== undefined ? Number(parts[1]) : 0;
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return fallback;
    }
    return h * 60 + m;
  };

  const start = parseMin(openTime, 8 * 60);
  const end = parseMin(closeTime, 20 * 60);
  const safeEnd = end >= start ? end : 20 * 60;

  const slots: string[] = [];
  for (let m = start; includeEnd ? m <= safeEnd : m < safeEnd; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

export function ensureSlotInList(slots: string[], currentValue?: string): string[] {
  if (!currentValue || slots.includes(currentValue)) return slots;
  return [...slots, currentValue].sort();
}
