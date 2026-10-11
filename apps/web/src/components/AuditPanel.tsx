import { useState } from "react";

export type AuditEntry = {
	seq: number;
	type: string;
	hash: string;
	ts: string;
};
export type ChainResult = {
	ok: boolean;
	brokenSeq: number | null;
	message: string;
};

export function normalizeEntries(raw: unknown): AuditEntry[] {
	const holder = raw as { entries?: unknown } | null;
	const list = Array.isArray(raw) ? raw : holder?.entries;
	if (!Array.isArray(list)) return [];
	return list.flatMap((item: unknown) => {
		const e = item as Record<string, unknown> | null;
		if (!e || typeof e.seq !== "number") return [];
		return [
			{
				seq: e.seq,
				type: String(e.type ?? "?"),
				hash: String(e.hash ?? ""),
				ts: String(e.ts ?? ""),
			},
		];
	});
}

export function normalizeVerify(raw: unknown): ChainResult {
	const r = (raw ?? {}) as Record<string, unknown>;
	const flag = r.ok ?? r.valid;
	const broken = r.first_broken ?? r.broken_seq ?? r.broken_at ?? null;
	const brokenSeq = typeof broken === "number" ? broken : null;
	if (typeof flag !== "boolean") {
		return { ok: false, brokenSeq, message: "unrecognised verify response" };
	}
	return {
		ok: flag && brokenSeq === null,
		brokenSeq,
		message: flag && brokenSeq === null ? "chain intact" : "chain broken",
	};
}

type Props = { base?: string; fetchImpl?: typeof fetch };

export function AuditPanel({ base = "/api", fetchImpl }: Props) {
	const [entries, setEntries] = useState<AuditEntry[] | null>(null);
	const [chain, setChain] = useState<ChainResult | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	async function getJson(path: string): Promise<unknown> {
		const f = fetchImpl ?? fetch;
		const res = await f(`${base}${path}`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	}

	async function refresh() {
		setBusy(true);
		setError("");
		try {
			setEntries(normalizeEntries(await getJson("/audit")));
		} catch (e: unknown) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}

	async function verify() {
		setBusy(true);
		setError("");
		try {
			setChain(normalizeVerify(await getJson("/audit/verify")));
		} catch (e: unknown) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}

	const shown = entries
		? [...entries].sort((a, b) => b.seq - a.seq).slice(0, 50)
		: [];

	return (
		<section aria-label="Audit log" data-testid="audit">
			<h2>Audit log</h2>
			<div className="flex flex-wrap items-center gap-2">
				<button type="button" disabled={busy} onClick={() => void refresh()}>
					Refresh log
				</button>
				<button type="button" disabled={busy} onClick={() => void verify()}>
					Verify chain
				</button>
				{chain ? (
					<b data-testid="chain" role="status">
						{chain.ok ? "✓ CHAIN OK" : "✗ CHAIN BROKEN"}
						{chain.brokenSeq !== null ? ` at entry #${chain.brokenSeq}` : ""} ·{" "}
						{chain.message}
					</b>
				) : null}
			</div>
			{error ? <p role="alert">Audit error: {error}</p> : null}
			{entries && entries.length === 0 ? <p>No audit entries yet.</p> : null}
			{shown.length > 0 ? (
				<table data-testid="audit-table">
					<thead>
						<tr>
							<th>#</th>
							<th>Type</th>
							<th>Time</th>
							<th>Hash</th>
						</tr>
					</thead>
					<tbody>
						{shown.map((e) => (
							<tr key={e.seq}>
								<td>{e.seq}</td>
								<td>{e.type}</td>
								<td>{e.ts}</td>
								<td>
									<code>{e.hash.slice(0, 12)}</code>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}
			<p>Tamper-evident, not tamper-proof.</p>
		</section>
	);
}
