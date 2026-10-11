import { describe, expect, it } from "vitest";
import { createApi } from "./client";

describe("api client", () => {
	it("posts replan to /api/replan", async () => {
		let seen = "";
		const fake = (async (req: Request) => {
			seen = `${req.method} ${new URL(req.url).pathname}`;
			return new Response(
				JSON.stringify({ alternatives: [], rejected_plans: [] }),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		}) as unknown as typeof fetch;
		const api = createApi("http://test", fake);
		const { data } = await api.POST("/api/replan", { body: {} });
		expect(seen).toBe("POST /api/replan");
		expect(data).toEqual({ alternatives: [], rejected_plans: [] });
	});
});
