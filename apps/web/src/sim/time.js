// Time is integer minutes since 00:00 of the service day.
export function fmt(m) {
  const day = Math.floor(m / 1440);
  const r = m - day * 1440;
  const hh = String(Math.floor(r / 60)).padStart(2, "0");
  const mm = String(r % 60).padStart(2, "0");
  return `${hh}:${mm}${day > 0 ? `+${day}d` : ""}`;
}

export function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})(?:\+(\d)d)?$/.exec(String(s).trim());
  if (!m) throw new Error(`Time must look like 09:30 (got "${s}")`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) throw new Error(`Time out of range: "${s}"`);
  return (m[3] ? Number(m[3]) : 0) * 1440 + h * 60 + mi;
}