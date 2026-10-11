/**
 * Rule-based NL disruption parser (PRD section 14, AI-1..AI-4).
 * Output is only "delay" or "closure" proposals. There is no assignment field,
 * so this module cannot express a platform assignment.
 */
import { fmt } from "../components/time";
import type { NewEvent } from "../sim/logic";

export type NlContext = {
	trains: { id: string; name?: string | null }[];
	platforms: string[];
};

type Base = {
	id: string;
	span: [number, number];
	text: string;
	confidence: number;
	method: "rules" | "llm";
};
export type DelayProposal = Base & {
	kind: "delay";
	train_id: string;
	minutes: number;
};
export type ClosureProposal = Base & {
	kind: "closure";
	platform: string;
	start: number;
	end: number;
};
export type Proposal = DelayProposal | ClosureProposal;
export type Question = {
	text: string;
	mention?: string;
	options?: string[];
	span: [number, number];
};
export type Rejection = { text: string; span: [number, number] };
export type ParseResult = {
	proposals: Proposal[];
	questions: Question[];
	rejected: Rejection[];
	message: string | null;
};

const MAX_TEXT = 500;
const NO_DISRUPTION = "No valid disruption found";

const INJECTION =
	/\b(?:ignore|disregard|override|bypass|forget)\b[^.]*\b(?:rules?|constraints?|instructions?|checks?|validator)\b|\b(?:put|assign|move|place)\b[^.]*\b(?:every|all)\b[^.]*\btrains?\b|\bsystem prompt\b/i;

const DELAY_WORDS = /\b(?:late|delay|delays|delayed|lete|der|deri|vilamb)\b/;
const CLOSE_WORDS =
	/\b(?:close|closed|closure|block|blocked|bandh|band|shut|unavailable|out of service|not available)\b/;

const NB = String.raw`(?<![\w:])`;
const NA = String.raw`(?![\w:])`;
const TIME = String.raw`(\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm)|\d{4}|\d{1,2})`;
const SEP = "(?:to|till|until|and|se|-|–)";

const PLATFORM =
	/\b(?:platform(?:\s+(?:number|no\.?))?|plat|pf|p)\s*-?\s*(\d{1,2})\b/;
const DURATION = new RegExp(String.raw`${NB}(\d{1,3})\s*(?:minutes?|mins?)\b`);
const RANGE = new RegExp(
	String.raw`${NB}${TIME}\s*${SEP}\s*${TIME}(?:\s*tak)?${NA}`,
);
const END_A = new RegExp(
	String.raw`\b(?:till|until|upto|up\s+to)\s+${TIME}${NA}`,
);
const END_B = new RegExp(String.raw`${NB}${TIME}\s+tak\b`);
const START_A = new RegExp(String.raw`\b(?:from|since)\s+${TIME}${NA}`);
const START_B = new RegExp(String.raw`${NB}${TIME}\s+se\b`);
const STRONG_T = /\b(?:(?:train|gaadi|express|local|premium)\s+)?(t-?\d+)\b/;
const STRONG_W = /\b(?:train|gaadi|express|local|premium)\s+(\d+)\b/;
const BARE = new RegExp(String.raw`${NB}(\d{3,4})${NA}`);
const FALLBACK_NUM = new RegExp(String.raw`${NB}(\d{1,3})${NA}`);

const UNITS: Record<string, number> = {
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
};
const TENS: Record<string, number> = {
	twenty: 20,
	thirty: 30,
	forty: 40,
	fifty: 50,
	sixty: 60,
};
const WORDS: Record<string, number> = {
	...UNITS,
	...TENS,
	ten: 10,
	eleven: 11,
	twelve: 12,
	thirteen: 13,
	fourteen: 14,
	fifteen: 15,
	sixteen: 16,
	seventeen: 17,
	eighteen: 18,
	nineteen: 19,
	das: 10,
	pandrah: 15,
	bees: 20,
	pachees: 25,
	tees: 30,
	chalis: 40,
	pachaas: 50,
};

function lev(a: string, b: string): number {
	const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		let diag = prev[0] ?? 0;
		prev[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const up = prev[j] ?? 0;
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + cost);
			diag = up;
		}
	}
	return prev[b.length] ?? 0;
}

function blank(w: string, m: RegExpExecArray): string {
	return (
		w.slice(0, m.index) +
		" ".repeat(m[0].length) +
		w.slice(m.index + m[0].length)
	);
}

/** Lowercase, durations to "N min", number words (English and Hinglish) to digits. */
export function normalize(text: string): string {
	let w = text.toLowerCase();
	w = w.replace(
		/\bone and a half\s+hours?\b|\bdedh\s+(?:ghanta|ghante|hours?)\b/g,
		" 90 min ",
	);
	w = w.replace(
		/\bhalf an hour\b|\bhalf hour\b|\baa?dha\s+(?:ghanta|ghante)\b/g,
		" 30 min ",
	);
	w = w.replace(/\ban hour\b|\bek\s+(?:ghanta|ghante)\b/g, " 60 min ");
	w = w.replace(
		/\b(twenty|thirty|forty|fifty|sixty)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g,
		(_m, t: string, u: string) => String((TENS[t] ?? 0) + (UNITS[u] ?? 0)),
	);
	w = w.replace(/\b[a-z]+\b/g, (word) => {
		const v = WORDS[word];
		return v === undefined ? word : String(v);
	});
	w = w.replace(
		/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|ghante|ghanta)\b/g,
		(_m, n: string) => {
			return ` ${Math.round(Number(n) * 60)} min `;
		},
	);
	return w.replace(/\s+/g, " ").trim();
}

/** "10:30", "10am", "1030", "12" to minutes since 00:00. Null if invalid. */
export function parseClock(tok: string): number | null {
	const t = tok.trim().toLowerCase();
	const colon = /^(\d{1,2}):(\d{2})$/.exec(t);
	const ampm = /^(\d{1,2})\s*(am|pm)$/.exec(t);
	const four = /^(\d{4})$/.exec(t);
	const hourOnly = /^(\d{1,2})$/.exec(t);
	let h: number;
	let m = 0;
	if (colon) {
		h = Number(colon[1]);
		m = Number(colon[2]);
	} else if (ampm) {
		h = Number(ampm[1]);
		if (h < 1 || h > 12) return null;
		h = (h % 12) + (ampm[2] === "pm" ? 12 : 0);
	} else if (four) {
		h = Number(t.slice(0, 2));
		m = Number(t.slice(2));
	} else if (hourOnly) {
		h = Number(hourOnly[1]);
	} else {
		return null;
	}
	if (h > 23 || m > 59) return null;
	return h * 60 + m;
}

function clauses(text: string): [number, number][] {
	const guarded = [...text.matchAll(/\bbetween\s+\S+\s+and\s+\S+/gi)].map(
		(m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const,
	);
	const out: [number, number][] = [];
	let last = 0;
	for (const m of text.matchAll(/[,;&]|\b(?:and|aur|phir|plus|also)\b/gi)) {
		const i = m.index ?? 0;
		if (guarded.some(([a, b]) => i >= a && i < b)) continue;
		out.push([last, i]);
		last = i + m[0].length;
	}
	out.push([last, text.length]);
	return out.filter(([s, e]) => text.slice(s, e).trim().length > 0);
}

type Link =
	| { kind: "ok"; id: string }
	| { kind: "ask"; options: string[] }
	| { kind: "unknown" };

function link(mention: string, ctx: NlContext): Link {
	const m = mention.toUpperCase().replace(/-/g, "");
	const ids = ctx.trains.map((t) => t.id);
	const exact = ids.find((id) => id.toUpperCase() === m);
	if (exact) return { kind: "ok", id: exact };
	if (/^\d+$/.test(m)) {
		const byDigits = ids.filter((id) => id.replace(/\D/g, "") === m);
		if (byDigits.length === 1 && byDigits[0])
			return { kind: "ok", id: byDigits[0] };
	}
	if (m.length >= 3) {
		const options = ids
			.filter((id) => {
				const u = id.toUpperCase();
				return u.startsWith(m) || lev(u, m) <= 1;
			})
			.sort();
		if (options.length > 0) return { kind: "ask", options };
	}
	return { kind: "unknown" };
}

type Clause = {
	w: string;
	raw: string;
	span: [number, number];
	ctx: NlContext;
	out: ParseResult;
	nextId: () => string;
	pm: RegExpExecArray | null;
	dm: RegExpExecArray | null;
	startTok: string | null;
	endTok: string | null;
};

function buildDelay(c: Clause): void {
	let w = c.w;
	let id: string | null = null;
	for (const t of c.ctx.trains) {
		const nm = t.name?.toLowerCase().trim();
		if (nm && nm.length > 2 && w.includes(nm)) {
			id = t.id;
			w = w.replace(nm, " ");
			break;
		}
	}
	if (!id) {
		const mm = STRONG_T.exec(w) ?? STRONG_W.exec(w) ?? BARE.exec(w);
		if (!mm) {
			c.out.questions.push({ text: "Which train is delayed?", span: c.span });
			return;
		}
		w = blank(w, mm);
		const mention = mm[1] ?? "";
		const found = link(mention, c.ctx);
		if (found.kind === "unknown") {
			c.out.rejected.push({
				text: `Unknown train ${mention.toUpperCase().replace(/-/g, "")}`,
				span: c.span,
			});
			return;
		}
		if (found.kind === "ask") {
			c.out.questions.push({
				text: `Which train: ${found.options.join(" or ")}?`,
				mention,
				options: found.options,
				span: c.span,
			});
			return;
		}
		id = found.id;
	}
	let minutes = c.dm ? Number(c.dm[1]) : null;
	if (minutes === null) {
		const fb = FALLBACK_NUM.exec(w);
		if (fb) minutes = Number(fb[1]);
	}
	if (minutes === null) {
		c.out.questions.push({
			text: `How many minutes late is ${id}?`,
			span: c.span,
		});
		return;
	}
	if (minutes < 1 || minutes > 600) {
		c.out.rejected.push({ text: "Delay must be 1-600 minutes", span: c.span });
		return;
	}
	c.out.proposals.push({
		id: c.nextId(),
		kind: "delay",
		train_id: id,
		minutes,
		span: c.span,
		text: c.raw,
		confidence: c.dm ? 0.97 : 0.85,
		method: "rules",
	});
}

function buildClosure(c: Clause): void {
	if (!c.pm) {
		c.out.questions.push({ text: "Which platform is closed?", span: c.span });
		return;
	}
	const num = Number(c.pm[1]);
	const platform = c.ctx.platforms.find(
		(p) => Number(p.replace(/\D/g, "")) === num,
	);
	if (!platform) {
		c.out.rejected.push({ text: `Unknown platform P${num}`, span: c.span });
		return;
	}
	if (!c.startTok && !c.endTok) {
		c.out.questions.push({
			text: `When is ${platform} closed? Give start and end time.`,
			span: c.span,
		});
		return;
	}
	if (!c.startTok) {
		c.out.questions.push({
			text: `Start time for ${platform} closure?`,
			span: c.span,
		});
		return;
	}
	if (!c.endTok) {
		c.out.questions.push({
			text: `End time for ${platform} closure?`,
			span: c.span,
		});
		return;
	}
	const start = parseClock(c.startTok);
	const end = parseClock(c.endTok);
	if (start === null || end === null) {
		c.out.rejected.push({
			text: `Invalid time in ${platform} closure`,
			span: c.span,
		});
		return;
	}
	if (end <= start) {
		c.out.rejected.push({
			text: "Closure end must be after start",
			span: c.span,
		});
		return;
	}
	c.out.proposals.push({
		id: c.nextId(),
		kind: "closure",
		platform,
		start,
		end,
		span: c.span,
		text: c.raw,
		confidence: 0.95,
		method: "rules",
	});
}

function parseClause(
	raw: string,
	span: [number, number],
	ctx: NlContext,
	out: ParseResult,
	nextId: () => string,
): void {
	let w = normalize(raw);
	const wantsDelay = DELAY_WORDS.test(w);
	const wantsClose = CLOSE_WORDS.test(w);
	if (!wantsDelay && !wantsClose) return;

	const take = (re: RegExp): RegExpExecArray | null => {
		const m = re.exec(w);
		if (m) w = blank(w, m);
		return m;
	};
	const pm = take(PLATFORM);
	const dm = take(DURATION);
	let startTok: string | null = null;
	let endTok: string | null = null;
	const rg = take(RANGE);
	if (rg) {
		startTok = rg[1] ?? null;
		endTok = rg[2] ?? null;
	} else {
		const e = take(END_A) ?? take(END_B);
		const s = take(START_A) ?? take(START_B);
		endTok = e?.[1] ?? null;
		startTok = s?.[1] ?? null;
	}
	const clause: Clause = {
		w,
		raw: raw.trim(),
		span,
		ctx,
		out,
		nextId,
		pm,
		dm,
		startTok,
		endTok,
	};
	if (wantsDelay) buildDelay(clause);
	if (wantsClose) buildClosure(clause);
}

export function parseDisruptions(text: string, ctx: NlContext): ParseResult {
	const out: ParseResult = {
		proposals: [],
		questions: [],
		rejected: [],
		message: null,
	};
	const raw = text.trim();
	if (!raw) {
		out.message = "Type a disruption first";
		return out;
	}
	if (raw.length > MAX_TEXT) {
		out.rejected.push({
			text: `Text too long (max ${MAX_TEXT} characters)`,
			span: [0, raw.length],
		});
		out.message = NO_DISRUPTION;
		return out;
	}
	if (INJECTION.test(raw)) {
		out.rejected.push({
			text: "Instruction-like text ignored",
			span: [0, raw.length],
		});
		out.message = NO_DISRUPTION;
		return out;
	}
	let n = 0;
	const nextId = () => `p${++n}`;
	for (const [s, e] of clauses(text)) {
		parseClause(text.slice(s, e), [s, e], ctx, out, nextId);
	}
	if (out.proposals.length === 0 && out.questions.length === 0)
		out.message = NO_DISRUPTION;
	return out;
}

export function describeProposal(p: Proposal): string {
	return p.kind === "delay"
		? `Delay ${p.train_id} +${p.minutes} min`
		: `Close ${p.platform} ${fmt(p.start)}-${fmt(p.end)}`;
}

export function toEvent(p: Proposal): NewEvent {
	return p.kind === "delay"
		? { kind: "delay", train_id: p.train_id, minutes: p.minutes }
		: { kind: "closure", platform: p.platform, start: p.start, end: p.end };
}
