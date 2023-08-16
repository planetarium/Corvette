import { LogLevels } from "std/log/levels.ts";

import { type Handler, Status } from "fresh/server.ts";

import { logRequest, redirect } from "web/util.ts";

export const handler: Handler = (req, ctx) => {
  logRequest(
    LogLevels.WARNING,
    req,
    ctx,
    Status.NotFound,
    "Redirecting to default route",
  );
  return redirect(req, ctx);
};
