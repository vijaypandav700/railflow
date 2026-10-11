import { scaleLinear } from "d3-scale";
import { fmt } from "./time";

export type GanttRow = {
	train_id: string;
	platform: string;
	arr: number;
	dep: number;
};
export type GanttClosure = {
	id: string;
	platform: string;
	start: number;
	end: number;
};

type Props = {
	platforms: string[];
	rows: GanttRow[];
	closures?: GanttClosure[];
	gap: number;
	conflicts?: string[];
	classes?: Record<string, string>;
	now?: number;
	width?: number;
};

const ROW_H = 46;
const LEFT = 56;
const TOP = 28;
const MARKER = 8;

export function Legend() {
	return (
		<div
			className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600"
			data-testid="legend"
		>
			<span>L local (solid edge)</span>
			<span>E express (stripes)</span>
			<span>P premium (dots)</span>
			<span>hatched = required gap</span>
			<span>crossed grey = closure</span>
			<span>red hatch + ! = conflict</span>
		</div>
	);
}

export function Gantt({
	platforms,
	rows,
	closures = [],
	gap,
	conflicts = [],
	classes = {},
	now,
	width = 900,
}: Props) {
	const bad = new Set(conflicts);
	const times = [
		...rows.flatMap((r) => [r.arr, r.dep + gap]),
		...closures.flatMap((c) => [c.start, c.end]),
		...(now === undefined ? [] : [now]),
	];
	const lo = Math.floor((times.length ? Math.min(...times) : 540) / 60) * 60;
	const hi = Math.ceil((times.length ? Math.max(...times) : 720) / 60) * 60;
	const x = scaleLinear()
		.domain([lo, hi])
		.range([LEFT, width - 8]);
	const height = TOP + platforms.length * ROW_H + 8;
	const rowY = (p: string) => TOP + platforms.indexOf(p) * ROW_H;
	const hours: number[] = [];
	for (let t = lo; t <= hi; t += 60) hours.push(t);

	return (
		<div className="overflow-x-auto rounded border border-slate-300 bg-white">
			<svg
				role="img"
				aria-label="Platform timetable"
				viewBox={`0 0 ${width} ${height}`}
				width="100%"
				style={{ minWidth: 640 }}
				data-testid="gantt"
			>
				<defs>
					<pattern
						id="gap"
						width="6"
						height="6"
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<line
							x1="0"
							y1="0"
							x2="0"
							y2="6"
							stroke="#64748b"
							strokeWidth="2"
						/>
					</pattern>
					<pattern
						id="closed"
						width="8"
						height="8"
						patternUnits="userSpaceOnUse"
					>
						<rect width="8" height="8" fill="#e2e8f0" />
						<path d="M0 0L8 8M8 0L0 8" stroke="#475569" strokeWidth="1" />
					</pattern>
					<pattern
						id="clash"
						width="6"
						height="6"
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(-45)"
					>
						<rect width="6" height="6" fill="#fed7aa" />
						<line
							x1="0"
							y1="0"
							x2="0"
							y2="6"
							stroke="#c2410c"
							strokeWidth="3"
						/>
					</pattern>
					<pattern
						id="mkExpress"
						width="5"
						height="5"
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<rect width="5" height="5" fill="#ffffff" />
						<line
							x1="0"
							y1="0"
							x2="0"
							y2="5"
							stroke="#0072b2"
							strokeWidth="3"
						/>
					</pattern>
					<pattern
						id="mkPremium"
						width="5"
						height="5"
						patternUnits="userSpaceOnUse"
					>
						<rect width="5" height="5" fill="#ffffff" />
						<circle cx="2.5" cy="2.5" r="1.6" fill="#0072b2" />
					</pattern>
				</defs>

				{platforms.map((p, i) =>
					i % 2 === 0 ? (
						<rect
							key={`band-${p}`}
							x={LEFT}
							y={rowY(p)}
							width={width - LEFT - 8}
							height={ROW_H}
							fill="#f7f9fc"
						/>
					) : null,
				)}

				{hours.map((t) => (
					<g key={t}>
						<line
							x1={x(t)}
							x2={x(t)}
							y1={TOP - 4}
							y2={height - 8}
							stroke="#cbd5e1"
							strokeWidth="1"
						/>
						<text
							x={x(t)}
							y={TOP - 10}
							fontSize="11"
							textAnchor="middle"
							fill="#334155"
						>
							{fmt(t)}
						</text>
					</g>
				))}

				{platforms.map((p) => (
					<g key={p}>
						<text
							x={8}
							y={rowY(p) + ROW_H / 2 + 4}
							fontSize="13"
							fontWeight="700"
							fill="#0f172a"
						>
							{p}
						</text>
						<line
							x1={LEFT}
							x2={width - 8}
							y1={rowY(p) + ROW_H}
							y2={rowY(p) + ROW_H}
							stroke="#e2e8f0"
						/>
					</g>
				))}

				{closures.map((c) => (
					<g key={c.id} data-testid={`closure-${c.id}`}>
						<rect
							x={x(c.start)}
							y={rowY(c.platform) + 4}
							width={Math.max(0, x(c.end) - x(c.start))}
							height={ROW_H - 8}
							rx="3"
							fill="url(#closed)"
							stroke="#475569"
						/>
						<text
							x={x(c.start) + 6}
							y={rowY(c.platform) + ROW_H / 2 + 4}
							fontSize="10"
							fontWeight="700"
							fill="#1e293b"
						>
							CLOSED {c.id}
						</text>
					</g>
				))}

				{rows.map((r) => {
					const isBad = bad.has(r.train_id);
					const cls = classes[r.train_id] ?? "local";
					const y = rowY(r.platform) + 8;
					const h = ROW_H - 16;
					const w = Math.max(MARKER + 4, x(r.dep) - x(r.arr));
					const marker =
						cls === "premium"
							? "url(#mkPremium)"
							: cls === "express"
								? "url(#mkExpress)"
								: "#0072b2";
					return (
						<g
							key={r.train_id}
							tabIndex={0}
							data-testid={`bar-${r.train_id}`}
							data-conflict={isBad ? "true" : "false"}
						>
							<title>{`${r.train_id} (${cls}) ${r.platform} ${fmt(r.arr)}-${fmt(r.dep)}`}</title>
							<rect
								x={x(r.dep)}
								y={y}
								width={Math.max(0, x(r.dep + gap) - x(r.dep))}
								height={h}
								fill="url(#gap)"
								opacity="0.6"
							/>
							<rect
								x={x(r.arr)}
								y={y}
								width={w}
								height={h}
								rx="3"
								fill={isBad ? "url(#clash)" : "#cfe6f7"}
								stroke={isBad ? "#c2410c" : "#0072b2"}
								strokeWidth={isBad ? 3 : 1.5}
							/>
							<rect
								x={x(r.arr)}
								y={y}
								width={MARKER}
								height={h}
								rx="2"
								fill={marker}
								stroke="#0072b2"
							/>
							<text
								x={x(r.arr) + MARKER + 4}
								y={y + h / 2 + 4}
								fontSize="11"
								fontWeight="700"
								fill="#0b2540"
							>
								{isBad ? "! " : ""}
								{cls[0]?.toUpperCase()}·{r.train_id}
							</text>
						</g>
					);
				})}

				{now === undefined ? null : (
					<g>
						<line
							x1={x(now)}
							x2={x(now)}
							y1={TOP - 6}
							y2={height - 6}
							stroke="#c2410c"
							strokeWidth="2"
							strokeDasharray="6 3"
						/>
						<text
							x={Math.min(x(now) + 5, width - 70)}
							y={height - 10}
							fontSize="11"
							fontWeight="700"
							fill="#c2410c"
						>
							now {fmt(now)}
						</text>
					</g>
				)}
			</svg>
		</div>
	);
}
