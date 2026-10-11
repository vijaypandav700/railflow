import type { AiMode } from "../nl/llm";

export type AiSettings = { mode: AiMode; baseUrl: string; model: string };

const KEY = "railflow-ai";
const DEFAULTS: AiSettings = {
	mode: "rules",
	baseUrl: "http://localhost:11434",
	model: "llama3.2:3b",
};

export function loadSettings(): AiSettings {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return DEFAULTS;
		const v = JSON.parse(raw) as Partial<AiSettings>;
		const mode: AiMode =
			v.mode === "off" || v.mode === "ollama" ? v.mode : "rules";
		return {
			mode,
			baseUrl:
				typeof v.baseUrl === "string" && v.baseUrl
					? v.baseUrl
					: DEFAULTS.baseUrl,
			model: typeof v.model === "string" && v.model ? v.model : DEFAULTS.model,
		};
	} catch {
		return DEFAULTS;
	}
}

function save(s: AiSettings) {
	try {
		localStorage.setItem(KEY, JSON.stringify(s));
	} catch {
		// storage blocked: setting still applies for this session
	}
}

type Props = { value: AiSettings; onChange: (s: AiSettings) => void };

export function Settings({ value, onChange }: Props) {
	function update(patch: Partial<AiSettings>) {
		const next = { ...value, ...patch };
		save(next);
		onChange(next);
	}
	return (
		<details data-testid="settings">
			<summary>Settings: AI mode ({value.mode})</summary>
			<div className="flex flex-wrap items-center gap-2">
				<label>
					AI mode{" "}
					<select
						value={value.mode}
						onChange={(e) => update({ mode: e.target.value as AiMode })}
					>
						<option value="off">Off (use the form only)</option>
						<option value="rules">Rules (offline, default)</option>
						<option value="ollama">Local LLM (Ollama)</option>
						<option value="cloud" disabled>
							Cloud LLM (off by default)
						</option>
					</select>
				</label>
				{value.mode === "ollama" ? (
					<>
						<label>
							Model{" "}
							<input
								value={value.model}
								onChange={(e) => update({ model: e.target.value })}
							/>
						</label>
						<label>
							URL{" "}
							<input
								value={value.baseUrl}
								onChange={(e) => update({ baseUrl: e.target.value })}
							/>
						</label>
					</>
				) : null}
			</div>
			<p>
				The LLM only reads text. If it fails or times out (5 s), rules answer
				instead.
			</p>
		</details>
	);
}
