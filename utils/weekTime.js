/**
 * Timezone + week math for the weekly planner.
 *
 * Decisions (client 2026-05-16): all week/"today" logic uses the user's
 * local timezone, GMT fallback if none stored. Week is Monday->Sunday for
 * launch but first-day-of-week must be configurable, so it's a parameter
 * here, not a hardcoded constant.
 *
 * No external date library: native Intl gives tz-correct wall-clock parts,
 * and ISO-week math is plain arithmetic.
 */

const FALLBACK_TZ = "GMT";

// Launch default. Configurable: pass a different firstDay to the functions
// (0=Sunday .. 6=Saturday) or change this when the product makes it a setting.
const WEEK_CONFIG = { firstDayOfWeek: 1 }; // 1 = Monday

const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function resolveTimeZone(tz) {
  if (!tz) return FALLBACK_TZ;
  try {
    // Throws RangeError for an invalid IANA zone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch (_) {
    return FALLBACK_TZ;
  }
}

/**
 * Wall-clock calendar parts of `date` as observed in `tz`.
 * @returns {{year:number,month:number,day:number,hour:number,minute:number,weekday:number}}
 *          month is 1-12, weekday is 0=Sun..6=Sat.
 */
function getZonedParts(date = new Date(), tz = FALLBACK_TZ) {
  const zone = resolveTimeZone(tz);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const weekdayShort = parts.weekday; // e.g. "Mon"
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? 0 : parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[weekdayShort],
  };
}

// Treat a Y/M/D as a UTC midnight anchor — safe for whole-day arithmetic
// because we only ever compare/shift by whole days here.
function ymdToUTC(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Start of the user's current week (a UTC-anchored calendar date at 00:00),
 * honoring the configurable first day of week.
 */
function getWeekStart(date = new Date(), tz = FALLBACK_TZ, firstDayOfWeek = WEEK_CONFIG.firstDayOfWeek) {
  const { year, month, day, weekday } = getZonedParts(date, tz);
  const anchor = ymdToUTC(year, month, day);
  const diff = (weekday - firstDayOfWeek + 7) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - diff);
  return anchor;
}

function getWeekEnd(date = new Date(), tz = FALLBACK_TZ, firstDayOfWeek = WEEK_CONFIG.firstDayOfWeek) {
  const start = getWeekStart(date, tz, firstDayOfWeek);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

// ISO-8601 week id (YYYY-Www) of the week containing `date` in `tz`.
// Uses the ISO rule (week 1 = the week with the year's first Thursday),
// independent of firstDayOfWeek so ids stay stable & comparable.
function getWeekId(date = new Date(), tz = FALLBACK_TZ) {
  const { year, month, day } = getZonedParts(date, tz);
  const d = ymdToUTC(year, month, day);
  // Shift to the Thursday of this ISO week.
  const isoDow = (d.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  d.setUTCDate(d.getUTCDate() - isoDow + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = ymdToUTC(isoYear, 1, 4);
  const firstThuDow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThuDow + 3);
  const week =
    1 + Math.round((d - firstThursday) / (7 * 24 * 60 * 60 * 1000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

// Next week's id relative to `date` in `tz`.
function getNextWeekId(date = new Date(), tz = FALLBACK_TZ) {
  const start = getWeekStart(date, tz);
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 7);
  return getWeekId(next, tz);
}

// The weekday key ("monday"...) for `date` in `tz`.
function getWeekdayKey(date = new Date(), tz = FALLBACK_TZ) {
  return WEEKDAY_KEYS[getZonedParts(date, tz).weekday];
}

/**
 * True when, in the user's tz, it is exactly the first day of the week at
 * the 00:00 hour — the trigger window for the per-user week transition.
 * (The transition runner is expected to tick at least hourly.)
 */
function isWeekTransitionMoment(date = new Date(), tz = FALLBACK_TZ, firstDayOfWeek = WEEK_CONFIG.firstDayOfWeek) {
  const { weekday, hour } = getZonedParts(date, tz);
  return weekday === firstDayOfWeek && hour === 0;
}

module.exports = {
  FALLBACK_TZ,
  WEEK_CONFIG,
  WEEKDAY_KEYS,
  resolveTimeZone,
  getZonedParts,
  getWeekStart,
  getWeekEnd,
  getWeekId,
  getNextWeekId,
  getWeekdayKey,
  isWeekTransitionMoment,
};
