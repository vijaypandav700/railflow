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
	width?: number;
};

const ROW_H = 44;
const LEFT = 56;
const TOP = 28;

export function Gantt({
	platforms,
	rows,
	closures = [],
	gap,
	conflicts = [],
	width = 900,
}: Props) {
	const bad = new Set(conflicts);
	const times = [
		...rows.flatMap((r) => [r.arr, r.dep + gap]),
		...closures.flatMap((c) => [c.start, c.end]),
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
		<svg
			role="img"
			aria-label="Platform timetable"
			viewBox={`0 0 ${width} ${height}`}
			width="100%"
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
					<line x1="0" y1="0" x2="0" y2="6" stroke="#64748b" strokeWidth="2" />
				</pattern>
				<pattern id="closed" width="8" height="8" patternUnits="userSpaceOnUse">
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
					<rect width="6" height="6" fill="#fecaca" />
					<line x1="0" y1="0" x2="0" y2="6" stroke="#b91c1c" strokeWidth="3" />
				</pattern>
			</defs>

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
						fontWeight="600"
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
						fill="url(#closed)"
						stroke="#475569"
					/>
					<text
						x={x(c.start) + 4}
						y={rowY(c.platform) + 16}
						fontSize="10"
						fill="#1e293b"
					>
						CLOSED {c.id}
					</text>
				</g>
			))}

			{rows.map((r) => {
				const isBad = bad.has(r.train_id);
				const y = rowY(r.platform) + 8;
				const w = Math.max(2, x(r.dep) - x(r.arr));
				return (
					<g
						key={r.train_id}
						tabIndex={0}
						data-testid={`bar-${r.train_id}`}
						data-conflict={isBad ? "true" : "false"}
					>
						<title>{`${r.train_id} ${r.platform} ${fmt(r.arr)}-${fmt(r.dep)}`}</title>
						<rect
							x={x(r.dep)}
							y={y}
							width={Math.max(0, x(r.dep + gap) - x(r.dep))}
							height={ROW_H - 16}
							fill="url(#gap)"
							opacity="0.6"
						/>
						<rect
							x={x(r.arr)}
							y={y}
							width={w}
							height={ROW_H - 16}
							rx="3"
							fill={isBad ? "url(#clash)" : "#bfdbfe"}
							stroke={isBad ? "#b91c1c" : "#1d4ed8"}
							strokeWidth={isBad ? 2 : 1}
						/>
						<text
							x={x(r.arr) + 4}
							y={y + (ROW_H - 16) / 2 + 4}
							fontSize="11"
							fill="#0f172a"
						>
							{isBad ? "! " : ""}
							{r.train_id}
						</text>
					</g>
				);
			})}
		</svg>
	);
}
