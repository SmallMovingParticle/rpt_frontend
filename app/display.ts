export const CLINIC_TZ = 'America/Los_Angeles';
export const CLINIC_TZ_LABEL = 'PT';

const LABELS: Record<string, string> = {
  declined: 'Not interested',
  callback_scheduled: 'Callback scheduled',
  booking_link_sent: 'Booking link sent',
  transferred_human: 'Transferred to staff',
  closed_no_response: 'Closed, no response',
  do_not_contact: 'Do not contact',
  invalid_phone: 'Invalid phone number',
  wrong_person: 'Wrong person',
};

function key(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function displayEnum(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Unknown';
  const normalized = key(raw);
  return LABELS[normalized] ?? normalized.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

export function sourceLabel(value: unknown) {
  const normalized = key(value).replace(/_+/g, '_');
  if (/^(google|n8n)_sheets?$/.test(normalized)) return 'Google Sheets';
  return displayEnum(value);
}

export function timezoneLabel(value: unknown) {
  const raw = String(value ?? '').trim();
  return raw ? raw.replace(/[\/_-]+/g, ' ').replace(/\s+/g, ' ') : 'Not recorded';
}

export type StatusTone = 'success' | 'warning' | 'error' | 'neutral';
export function statusTone(value: unknown): StatusTone {
  const normalized = key(value).replaceAll('_', ' ');
  if (/failed|undelivered|invalid|error|rejected/.test(normalized)) return 'error';
  if (/attention|pending|busy|voicemail|no answer|did not answer|cancel|gated|disabled|unknown|awaiting|manual/.test(normalized)) return 'warning';
  if (/booked|delivered|completed|connected|active|scheduled|permitted|ready|published|yes/.test(normalized)) return 'success';
  return 'neutral';
}

export type ActivityKind = 'appointment' | 'link' | 'handoff' | 'call' | 'message' | 'created' | 'closed' | 'history';
export function activityKind(item: Record<string, unknown>): ActivityKind {
  const value = `${item.to_status ?? ''} ${item.reason ?? ''} ${item.source ?? ''}`.toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ');
  if (/booking link/.test(value)) return 'link';
  if (/transfer|handoff|staff|human/.test(value)) return 'handoff';
  if (/appointment|booked|stride/.test(value)) return 'appointment';
  if (/sms|message|text|twilio/.test(value)) return 'message';
  if (/call|callback|vapi|in progress/.test(value)) return 'call';
  if (/created|new lead/.test(value)) return 'created';
  if (/closed|do not contact|dnc/.test(value)) return 'closed';
  return 'history';
}

type WallParts = { year: number; month: number; day: number; hour: number; minute: number };
const clinicFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function zonedParts(date: Date): WallParts {
  const parts = Object.fromEntries(clinicFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute) };
}

function sameWallTime(left: WallParts, right: WallParts) {
  return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute;
}

function parseWallTime(value: string): WallParts {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Choose a valid date and time.');
  const wall = { year: +match[1], month: +match[2], day: +match[3], hour: +match[4], minute: +match[5] };
  const check = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute));
  if (check.getUTCFullYear() !== wall.year || check.getUTCMonth() !== wall.month - 1 || check.getUTCDate() !== wall.day || wall.hour > 23 || wall.minute > 59) {
    throw new Error('Choose a valid date and time.');
  }
  return wall;
}

export function clinicDateTimeValue(value: unknown) {
  const parsed = new Date(String(value ?? ''));
  if (Number.isNaN(parsed.valueOf())) return '';
  const wall = zonedParts(parsed);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}T${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`;
}

export function clinicWallTimeToIso(value: string, now = new Date()) {
  const wall = parseWallTime(value);
  const target = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  let candidate = target;
  for (let pass = 0; pass < 3; pass += 1) {
    const shown = zonedParts(new Date(candidate));
    const offset = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute) - candidate;
    candidate = target - offset;
  }
  const matches = [...new Set([candidate - 3_600_000, candidate, candidate + 3_600_000])]
    .filter((instant) => sameWallTime(zonedParts(new Date(instant)), wall));
  if (matches.length !== 1) throw new Error(matches.length ? 'Choose a time outside the daylight-saving transition hour.' : 'That time does not exist in Pacific Time because of daylight saving.');
  if (matches[0] <= now.valueOf()) throw new Error('Choose a future time.');
  return new Date(matches[0]).toISOString();
}
