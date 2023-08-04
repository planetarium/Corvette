import { Handler, Status } from "fresh/server.ts";
import { logRequest, redirect } from "~/util.ts";
import { logger } from "~root/web/main.ts";

export const handler: Handler = (req, ctx) => {
  logRequest(logger.warning, req, ctx, Status.NotFound, "Redirecting to default route")
  return redirect(req, ctx);
};
