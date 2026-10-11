export type Scenario = {
	station: {
		gap: number;
		platforms: string[];
		dwell_min: number;
		max_hold: number;
		closure_buffer?: number | null;
	};
	trains: {
		id: string;
		arr: number;
		dep: number;
		platform?: string | null;
		required_platform?: string | null;
	}[];
	closures: { id: string; platform: string; start: number; end: number }[];
	delays: { train_id: string; minutes: number }[];
	now: number;
};
