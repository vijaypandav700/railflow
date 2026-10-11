import { validate } from "@railflow/validator";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { createApi } from "../api/client";
import { fmt } from "../components/time";
import type { Scenario } from "../components/types";
import {
	applyEvents,
	breakPlan,
	type Closure,
	type Delay,
	describeEvent,
	initialPlan,
	type NewEvent,
	type Replan,
	type Row,
	replanBody,
	type SimEvent,
} from "./logic";

type Api = ReturnType<typeof createApi>;
type Unsched = { train_id: string; reason: string };
export type Pending = { delays: Delay[]; closures: Closure[]; replan: Replan };
export type LogEntry = {
	id: number;
	clock: number;
	text: string;
	tone: "info" | "ok" | "warn";
};

export function useSimulation(api: Api, scenario: Scenario) {
	const start = scenario.now;
	const end = useMemo(
		() => Math.max(start, ...scenario.trains.map((t) => t.dep)) + 60,
		[start, scenario.trains],
	);
	const [clock, setClock] = useState(start);
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [plan, setPlan] = useState<Row[]>(() => initialPlan(scenario));
	const [unscheduled, setUnscheduled] = useState<Unsched[]>([]);
	const [committed, setCommitted] = useState<{
		delays: Delay[];
		closures: Closure[];
	}>({
		delays: scenario.delays,
		closures: scenario.closures,
	});
	const [queue, setQueue] = useState<SimEvent[]>([]);
	const [pending, setPending] = useState<Pending | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [log, setLog] = useState<LogEntry[]>([]);
	const [broken, setBroken] = useState(false);
	const saved = useRef<Row[] | null>(null);
	const eventId = useRef(0);
	const logId = useRef(0);

	const addLog = useCallback(
		(at: number, text: string, tone: LogEntry["tone"]) => {
			const id = ++logId.current;
			setLog((l) => [{ id, clock: at, text, tone }, ...l].slice(0, 60));
		},
		[],
	);

	useEffect(() => {
		if (!playing || busy || pending) return;
		const id = setInterval(
			() => setClock((c) => Math.min(c + 1, end)),
			1000 / speed,
		);
		return () => clearInterval(id);
	}, [playing, busy, pending, speed, end]);

	useEffect(() => {
		if (clock >= end) setPlaying(false);
	}, [clock, end]);

	const run = useCallback(
		async (events: SimEvent[]) => {
			const next = applyEvents(committed.delays, committed.closures, events);
			setBusy(true);
			setError("");
			addLog(clock, `Replan: ${events.map(describeEvent).join("; ")}`, "info");
			try {
				const { data, error: err } = await api.POST("/api/replan", {
					body: replanBody(scenario, plan, next.delays, next.closures, clock),
				});
				if (err || !data) {
					const msg = JSON.stringify(err ?? "empty response");
					setError(msg);
					addLog(clock, `REFUSED: ${msg}`, "warn");
				} else {
					const replan = data as unknown as Replan;
					setPending({ ...next, replan });
					addLog(
						clock,
						`${replan.alternatives.length} valid, ${replan.rejected_plans.length} rejected as invalid`,
						replan.alternatives.length ? "ok" : "warn",
					);
				}
			} catch (e: unknown) {
				setError(String(e));
				addLog(clock, `REFUSED: ${String(e)}`, "warn");
			} finally {
				setBusy(false);
			}
		},
		[api, scenario, plan, committed, clock, addLog],
	);

	const due = useMemo(() => queue.filter((e) => e.at <= clock), [queue, clock]);
	useEffect(() => {
		if (busy || pending || due.length === 0) return;
		setQueue((q) => q.filter((e) => e.at > clock));
		setPlaying(false);
		void run(due);
	}, [due, busy, pending, clock, run]);

	const schedule = useCallback(
		(ev: NewEvent, at: number) => {
			const full: SimEvent = { ...ev, id: `E${++eventId.current}`, at };
			setQueue((q) => [...q, full]);
			addLog(
				clock,
				at <= clock
					? `Injected now: ${describeEvent(ev)}`
					: `Queued for ${fmt(at)}: ${describeEvent(ev)}`,
				"info",
			);
		},
		[clock, addLog],
	);

	const accept = useCallback(() => {
		if (!pending) return;
		const alt = pending.replan.alternatives[0];
		if (!alt) return;
		const twin = validate({
			station: scenario.station,
			trains: scenario.trains,
			delays: pending.delays,
			closures: pending.closures,
			now: clock,
			plan: alt.plan,
			unscheduled: alt.unscheduled,
			previous_plan: plan,
			diff: alt.diff,
		});
		if (!alt.validation.valid || !twin.valid) {
			addLog(clock, "Refused to apply: failed validation", "warn");
			return;
		}
		setPlan(alt.plan);
		setUnscheduled(alt.unscheduled);
		setCommitted({ delays: pending.delays, closures: pending.closures });
		setPending(null);
		addLog(clock, "Accepted revision", "ok");
	}, [pending, scenario, plan, clock, addLog]);

	const reject = useCallback(() => {
		setPending(null);
		addLog(clock, "Revision rejected, previous plan kept", "warn");
	}, [clock, addLog]);

	const breakIt = useCallback(() => {
		const next = breakPlan(plan, clock);
		if (!next) {
			addLog(clock, "Nothing open to break (all trains frozen)", "warn");
			return;
		}
		saved.current = plan;
		setPlan(next);
		setBroken(true);
		addLog(clock, "Plan deliberately broken", "warn");
	}, [plan, clock, addLog]);

	const restore = useCallback(() => {
		if (saved.current) setPlan(saved.current);
		saved.current = null;
		setBroken(false);
		addLog(clock, "Plan restored", "ok");
	}, [clock, addLog]);

	const live = useMemo(
		() =>
			validate({
				station: scenario.station,
				trains: scenario.trains,
				delays: committed.delays,
				closures: committed.closures,
				now: scenario.now,
				plan,
				unscheduled,
				previous_plan: null,
				diff: null,
			}),
		[scenario, committed, plan, unscheduled],
	);
	const frozen = useMemo(
		() => plan.filter((r) => r.arr <= clock).map((r) => r.train_id),
		[plan, clock],
	);

	return {
		start,
		end,
		clock,
		playing,
		speed,
		plan,
		unscheduled,
		queue,
		pending,
		busy,
		error,
		log,
		broken,
		live,
		frozen,
		delays: committed.delays,
		closures: committed.closures,
		play: () => setPlaying(true),
		pause: () => setPlaying(false),
		setSpeed,
		scrub: (m: number) => setClock(Math.max(start, Math.min(end, m))),
		schedule,
		accept,
		reject,
		breakIt,
		restore,
	};
}
