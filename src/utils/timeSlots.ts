export const DAY_NAMES_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

export const DAY_NAMES_FULL = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

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

export function getDayOfWeekFromDateStr(dateStr?: string): number | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(`${dateStr}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay();
}

export function getWorkingDaysForProfessional(prof: any): number[] {
  const list = Array.isArray(prof?.workingHours) ? prof.workingHours : [];
  const days = list
    .filter((wh: any) => wh && wh.active !== false && wh.startTime && wh.endTime)
    .map((wh: any) => Number(wh.dayOfWeek))
    .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6);
  return Array.from(new Set<number>(days)).sort((a, b) => a - b);
}

export function getWorkingHourForDate(prof: any, dateStr?: string): any | null {
  if (!prof || !Array.isArray(prof.workingHours)) return null;
  const day = getDayOfWeekFromDateStr(dateStr);
  if (day === null) return null;
  const wh = prof.workingHours.find(
    (w: any) => Number(w.dayOfWeek) === day && w.active !== false && w.startTime && w.endTime
  );
  return wh || null;
}

export function formatWorkingDaysSummary(prof: any): string {
  const days = getWorkingDaysForProfessional(prof);
  if (days.length === 0) return 'Nenhum dia de atendimento configurado';
  return days.map((d) => DAY_NAMES_SHORT[d]).join(', ');
}

export function findNextWorkingDate(prof: any, startDateStr?: string): string | null {
  const days = getWorkingDaysForProfessional(prof);
  if (days.length === 0) return null;
  const base =
    startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)
      ? new Date(`${startDateStr}T12:00:00-03:00`)
      : new Date();
  if (Number.isNaN(base.getTime())) return null;

  for (let offset = 0; offset <= 14; offset++) {
    const candidate = new Date(base.getTime() + offset * 24 * 3600 * 1000);
    const day = candidate.getDay();
    if (days.includes(day)) {
      return candidate.toISOString().split('T')[0];
    }
  }
  return null;
}

export function isTimeInBreakWindow(timeStr: string, wh: any, durationMin = 60): boolean {
  if (!wh?.breakStart || !wh?.breakEnd) return false;
  const toMin = (hhmm: string) => {
    const [h, m = 0] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
  };
  const slotStart = toMin(timeStr);
  const slotEnd = slotStart + durationMin;
  const bStart = toMin(wh.breakStart);
  const bEnd = toMin(wh.breakEnd);
  return slotStart < bEnd && slotEnd > bStart;
}
