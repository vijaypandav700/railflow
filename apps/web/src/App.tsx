import { useEffect, useState } from "react";
import { createApi } from "./api/client";
import { PlanScreen } from "./components/PlanScreen";

const defaultApi = createApi();

type Props = { api?: ReturnType<typeof createApi> };
type Theme = "light" | "dark";

function initialTheme(): Theme {
	try {
		const saved = localStorage.getItem("railflow-theme");
		if (saved === "light" || saved === "dark") return saved;
	} catch {
		/* storage blocked */
	}
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

export default function App({ api = defaultApi }: Props) {
	const [theme, setTheme] = useState<Theme>(initialTheme);

	useEffect(() => {
		document.documentElement.setAttribute("data-theme", theme);
		try {
			localStorage.setItem("railflow-theme", theme);
		} catch {
			/* storage blocked */
		}
	}, [theme]);

	return (
		<main className="mx-auto min-h-screen max-w-6xl p-6">
			<header className="mb-4 flex flex-wrap items-center gap-3">
				<div className="mr-auto">
					<h1>RailFlow</h1>
					<p style={{ color: "var(--muted)" }}>Station platform simulator</p>
				</div>
				<button
					type="button"
					onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
				>
					{theme === "dark" ? "Light mode" : "Dark mode"}
				</button>
			</header>
			<div className="panel">
				<PlanScreen api={api} />
			</div>
		</main>
	);
}
