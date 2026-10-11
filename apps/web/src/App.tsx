import { createApi } from "./api/client";
import { PlanScreen } from "./components/PlanScreen";
import { ThemeToggle } from "./components/ThemeToggle";

const defaultApi = createApi();

type Props = { api?: ReturnType<typeof createApi> };

export default function App({ api = defaultApi }: Props) {
	return (
		<main className="app">
			<header className="topbar">
				<div className="brand">
					<h1>RailFlow</h1>
					<span className="tagline">Platform plan repair and proof</span>
				</div>
				<ThemeToggle />
			</header>
			<PlanScreen api={api} />
		</main>
	);
}
