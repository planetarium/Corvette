import { Handler } from "fresh/server.ts";
import { redirect } from "~/util.ts";

export const handler: Handler = (req) => redirect(req);
