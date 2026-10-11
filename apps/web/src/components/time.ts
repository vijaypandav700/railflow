/** R1: integer minutes since 00:00 of the service day, shown as HH:MM with +1d after midnight. */
export function fmt(minutes: number): string {
	const day = Math.floor(minutes / 1440);
	const rest = minutes - day * 1440;
	const hh = String(Math.floor(rest / 60)).padStart(2, "0");
	const mm = String(rest % 60).padStart(2, "0");
	return day > 0 ? `${hh}:${mm}+${day}d` : `${hh}:${mm}`;
}
