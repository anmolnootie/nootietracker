const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Reinterprets naive y/mo/d/h/mi/s components as IST, independent of server timezone. */
function istToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - IST_OFFSET_MS);
}

/**
 * Parses a bulk-upload timestamp cell ("YYYY-MM-DD HH:mm:ss", no timezone
 * marker) as IST - the data is from Indian vendor/quick-commerce exports.
 *
 * For a CSV upload, FileReaderService's cellDates option has SheetJS
 * auto-parse that text into a Date via an ambiguous, server-local-timezone-
 * dependent parse. Verified empirically (prn-import) that its LOCAL getters
 * still round-trip the exact naive components regardless of system TZ (the
 * ambiguous parse and these getters are each other's inverse), so
 * re-deriving from local getters and re-applying our own explicit IST
 * interpretation makes the result deterministic rather than drifting
 * between a dev machine and a UTC production container.
 */
export function parseIstTimestamp(value: any): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return istToUtc(value.getFullYear(), value.getMonth() + 1, value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds());
  }

  const str = String(value ?? '').trim();
  if (!str) return null;
  const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    return istToUtc(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s || 0));
  }

  const native = new Date(str);
  return Number.isNaN(native.getTime()) ? null : native;
}
