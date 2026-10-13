import { CLINIC_TZ } from "./display.ts";

export const HOUR_HEIGHT = 64;
const calendarFormatters = new Map<string, Intl.DateTimeFormat>();
export type CalendarView = "Day" | "Week" | "Month" | "Locations" | "Capacity";
export type Appointment = {
  id: string;
  lead_id: string | null;
  full_name: string;
  start_utc: string;
  end_utc: string | null;
  duration_minutes: number | null;
  practitioner_id: string;
  practitioner_name: string;
  location: string;
  case_title: string;
  type: string;
  state: string;
  source: string;
  lead_source: string | null;
  needs_staff_review: boolean;
  stride_appointment_id: number | null;
};
export type Practitioner = { id: string; name: string; location: string };
export type CalendarData = {
  appointments: Appointment[];
  practitioners: Practitioner[];
  timezone: string;
  business_hours: Record<string, { open: string; close: string } | null>;
  booking_enabled: boolean;
  stride_import_enabled: boolean;
  last_import_at: string | null;
  truncated: boolean;
  generated_at: string;
};

export function calendarWallTime(value: string, timezone = CLINIC_TZ) {
  if (!value || Number.isNaN(Date.parse(value))) return "";
  let formatter = calendarFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    calendarFormatters.set(timezone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function calendarDay(
  value = new Date().toISOString(),
  timezone = CLINIC_TZ,
) {
  return calendarWallTime(value, timezone).slice(0, 10);
}
export function shiftCalendarDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isCalendarDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(day.valueOf()) &&
    day.getUTCFullYear() > 0 &&
    day.toISOString().slice(0, 10) === value
  );
}
export function calendarDays(day: string, view: CalendarView) {
  if (view !== "Week" && view !== "Month") return [day];
  const anchor = view === "Month" ? `${day.slice(0, 7)}-01` : day;
  const weekday = new Date(`${anchor}T12:00:00Z`).getUTCDay();
  const start = shiftCalendarDay(anchor, -((weekday + 6) % 7));
  return Array.from({ length: view === "Month" ? 42 : 7 }, (_, i) =>
    shiftCalendarDay(start, i),
  );
}
export function moveCalendarDate(
  day: string,
  view: CalendarView,
  direction: number,
) {
  if (view !== "Month")
    return shiftCalendarDay(day, direction * (view === "Week" ? 7 : 1));
  const date = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 10);
}
export function appointmentMinutes(item: Appointment, timezone = CLINIC_TZ) {
  const wall = calendarWallTime(item.start_utc, timezone);
  return Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));
}
export function occupiesTime(item: Appointment) {
  return !/cancel|no[ _-]?show|removed|failed/i.test(item.state);
}
export function workingHours(
  day: string,
  hours: CalendarData["business_hours"],
) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7;
  const span = hours[String(weekday)];
  if (!span) return 0;
  const minutes = (clock: string) =>
    Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  return Math.max(0, minutes(span.close) - minutes(span.open)) / 60;
}
// Imported schedules can overlap. Split simultaneous events into lanes instead of hiding one.
export function layoutAppointments(items: Appointment[]) {
  const sorted = [...items].sort(
    (a, b) => Date.parse(a.start_utc) - Date.parse(b.start_utc),
  );
  const result: { item: Appointment; lane: number; lanes: number }[] = [];
  let cluster: typeof result = [],
    ends: number[] = [],
    clusterEnd = 0;
  function finish() {
    cluster.forEach((entry) => {
      entry.lanes = ends.length;
      result.push(entry);
    });
    cluster = [];
    ends = [];
    clusterEnd = 0;
  }
  for (const item of sorted) {
    const start = Date.parse(item.start_utc);
    const end = item.end_utc
      ? Date.parse(item.end_utc)
      : start + (item.duration_minutes ?? 30) * 60_000;
    if (start >= clusterEnd) finish();
    let lane = ends.findIndex((endTime) => endTime <= start);
    if (lane === -1) lane = ends.length;
    ends[lane] = Math.max(start + 60_000, end);
    clusterEnd = Math.max(clusterEnd, ends[lane]);
    cluster.push({ item, lane, lanes: 1 });
  }
  finish();
  return result;
}
