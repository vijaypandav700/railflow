import { useState } from "react";
import {
	describeProposal,
	type NlContext,
	type ParseResult,
	type Proposal,
	parseDisruptions,
	toEvent,
} from "../nl/parser";
import type { NewEvent } from "../sim/logic";

type Props = {
	ctx: NlContext;
	disabled?: boolean;
	onConfirm: (events: NewEvent[]) => void;
};

export function NlBox({ ctx, disabled = false, onConfirm }: Props) {
	const [text, setText] = useState("");
	const [result, setResult] = useState<ParseResult | null>(null);
	const [kept, setKept] = useState<Proposal[]>([]);

	function parse() {
		const r = parseDisruptions(text, ctx);
		setResult(r);
		setKept(r.proposals);
	}

	function confirm() {
		if (kept.length === 0) return;
		onConfirm(kept.map(toEvent));
		setResult(null);
		setKept([]);
		setText("");
	}

	return (
		<div data-testid="nl-box">
			<h3>Describe a disruption</h3>
			<div className="flex flex-wrap items-center gap-2">
				<input
					aria-label="Disruption text"
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") parse();
					}}
					placeholder="T101 25 min late, P2 band 10 se 10:30 tak"
					size={48}
				/>
				<button type="button" onClick={parse}>
					Parse
				</button>
			</div>

			{result ? (
				<div>
					{kept.length > 0 ? (
						<ul aria-label="Parsed disruptions">
							{kept.map((p) => (
								<li key={p.id} data-testid="chip">
									<b>{describeProposal(p)}</b> from "{p.text}" ·{" "}
									{Math.round(p.confidence * 100)}% · {p.method}{" "}
									<button
										type="button"
										aria-label={`Remove ${describeProposal(p)}`}
										onClick={() =>
											setKept((k) => k.filter((x) => x.id !== p.id))
										}
									>
										×
									</button>
								</li>
							))}
						</ul>
					) : null}
					{result.questions.map((q) => (
						<p key={`${q.span[0]}-${q.text}`} data-testid="question">
							❓ {q.text}{" "}
							{q.options?.map((opt) => (
								<button
									key={opt}
									type="button"
									onClick={() =>
										q.mention
											? setText((t) =>
													t.replace(new RegExp(`\\b${q.mention}\\b`, "i"), opt),
												)
											: undefined
									}
								>
									{opt}
								</button>
							))}
						</p>
					))}
					{result.rejected.map((r) => (
						<p key={`${r.span[0]}-${r.text}`} role="alert">
							✗ {r.text}
						</p>
					))}
					{result.message ? <p role="status">{result.message}</p> : null}
					<button
						type="button"
						disabled={disabled || kept.length === 0}
						onClick={confirm}
					>
						Confirm disruptions
					</button>
					<span> Nothing runs until you confirm.</span>
				</div>
			) : null}

			<details>
				<summary>Supported phrases</summary>
				<ul>
					<li>
						T101 is 25 min late · Vortexa Express running late by half an hour
					</li>
					<li>P2 closed from 10:00 to 11:30 · platform 3 blocked 9 to 10</li>
					<li>
						Hinglish: P2 band 10 se 11:30 tak · T101 pachees minute lete hai ·
						T205 dedh ghanta der
					</li>
					<li>
						Combine with a comma: P2 band 10 se 11:30 tak, T101 25 min late
					</li>
					<li>
						Unknown trains or platforms are rejected. Unclear input gets a
						question.
					</li>
				</ul>
			</details>
		</div>
	);
}
