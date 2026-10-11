import { createApi } from "./api/client";
import { PlanScreen } from "./components/PlanScreen";

const defaultApi = createApi();

type Props = { api?: ReturnType<typeof createApi> };

export default function App({ api = defaultApi }: Props) {
	return (
		<main className="min-h-screen bg-slate-900 p-8 text-white">
			<h1 className="text-3xl font-bold">RailFlow</h1>
			<p className="mb-6 text-slate-400">Station platform simulator</p>
			<div className="rounded bg-white p-4 text-slate-900">
				<PlanScreen api={api} />
			</div>
		</main>
	);
}
