import type { Result } from "@railflow/validator";

const TITLES: Record<string, string> = {
	V1: "Every train assigned or unscheduled",
	V2: "Platforms exist",
	V3: "Required platform respected",
	V4: "No overlap",
	V5: "Gap respected",
	V6: "No closure hit",
	V7: "Timing rules",
	V8: "Frozen trains unchanged",
	V9: "Unscheduled have a known reason",
	V10: "Changed trains have a reason",
};

type Props = { result: Result };

export function ValidatorPanel({ result }: Props) {
	return (
		<section aria-label="Validator">
			<h3>
				Validator (TypeScript twin):{" "}
				<span data-testid="validator-verdict">
					{result.valid ? "ALL PASS" : "FAILED"}
				</span>
			</h3>
			<ul
				data-testid="validator-checks"
				style={{ listStyle: "none", padding: 0, margin: 0 }}
			>
				{result.checks
					.filter((c) => c.id !== "INPUT")
					.map((c) => (
						<li
							key={c.id}
							data-testid={`check-${c.id}`}
							data-ok={c.ok ? "true" : "false"}
						>
							<b>{c.ok ? "✓ PASS" : "✗ FAIL"}</b> {c.id} {TITLES[c.id] ?? ""}
							{c.ok ? null : (
								<ul>
									{c.errors.map((e) => (
										<li key={`${e.check}-${e.message}`}>{e.message}</li>
									))}
								</ul>
							)}
						</li>
					))}
			</ul>
			{result.checks.some((c) => c.id === "INPUT") ? (
				<p role="alert">{result.checks[0]?.errors[0]?.message}</p>
			) : null}
			{result.warnings.map((w) => (
				<p key={`${w.code}-${w.closure}`}>
					⚠ {w.code}: closure {w.closure}, trains {w.trains.join(", ")}
				</p>
			))}
		</section>
	);
}
