/** R1: integer minutes since 00:00 of the service day, shown as HH:MM with +1d after midnight. */
export function fmt(minutes: number): string {
	const day = Math.floor(minutes / 1440);
	const rest = minutes - day * 1440;
	const hh = String(Math.floor(rest / 60)).padStart(2, "0");
	const mm = String(rest % 60).padStart(2, "0");
	return day > 0 ? `${hh}:${mm}+${day}d` : `${hh}:${mm}`;
}

/** Parse "HH:MM" or "HH:MM+1d" to integer minutes. Returns null if invalid. */
export function parseTime(text: string): number | null {
	const m = /^(\d{1,2}):(\d{2})(?:\+(\d+)d)?$/.exec(text.trim());
	if (!m) return null;
	const hh = Number(m[1]);
	const mm = Number(m[2]);
	if (hh > 23 || mm > 59) return null;
	return Number(m[3] ?? 0) * 1440 + hh * 60 + mm;
}
