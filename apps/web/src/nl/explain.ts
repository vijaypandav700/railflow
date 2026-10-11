/** Template explanation from facts only (PRD section 14). No model, no invented numbers. */

export type Facts = {
	profile: string;
	metrics: {
		total_delay: number;
		weighted_delay: number;
		moved: number;
		delayed: number;
		max_delay: number;
		unscheduled: number;
	};
	changed: { train_id: string; class: string }[];
};

export function explainAlt(f: Facts): string {
	const m = f.metrics;
	return `${f.profile}: ${f.changed.length} trains changed, ${m.moved} moved, ${m.delayed} delayed. Total delay ${m.total_delay} min (weighted ${m.weighted_delay}), longest ${m.max_delay} min, ${m.unscheduled} unscheduled.`;
}

export function compareFacts(list: Facts[]): string | null {
	if (list.length < 2) return null;
	return list
		.map(
			(f) =>
				`${f.profile}: delay ${f.metrics.total_delay} min, moved ${f.metrics.moved}`,
		)
		.join(" | ");
}

const TOKEN = /[A-Za-z]*\d+/g;

/** Every number and ID in `text` must exist in the facts. Used before showing any LLM paraphrase. */
export function factGuard(text: string, f: Facts): boolean {
	const allowed = new Set(JSON.stringify(f).match(TOKEN) ?? []);
	return (text.match(TOKEN) ?? []).every((t) => allowed.has(t));
}
