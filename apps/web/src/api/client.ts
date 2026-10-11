import createClient from "openapi-fetch";
import type { paths } from "./schema";

export function createApi(baseUrl = "", fetchImpl?: typeof fetch) {
	return createClient<paths>(
		fetchImpl ? { baseUrl, fetch: fetchImpl } : { baseUrl },
	);
}
