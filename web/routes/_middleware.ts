import { LogLevels } from "std/log/levels.ts";

import { cookieSession, type WithSession } from "fresh-session";
import { type MiddlewareHandlerContext, Status } from "fresh/server.ts";

import { logRequest, redirect } from "web/util.ts";
import type { User } from "~/generated/client/index.d.ts";

const session = cookieSession();

const sessionHandler = (
  req: Request,
  ctx: MiddlewareHandlerContext<WithSession>,
) => {
  return session(req, ctx);
};

const redirectionHandler = (
  req: Request,
  ctx: MiddlewareHandlerContext<WithSession>,
) => {
  const pathname = new URL(req.url).pathname;

  if (pathname === "/logout") {
    const email = (ctx.state.session.get("user") as User)?.email;
    ctx.state.session.set("user", undefined);
    ctx.state.session.destroy();
    if (email) {
      logRequest(
        LogLevels.INFO,
        req,
        ctx,
        Status.OK,
        `User ${email} logged out`,
      );
    } else logRequest(LogLevels.INFO, req, ctx, Status.NotModified);
    return redirect(req, ctx, "/login");
  }

  if (["/login", "/api/login", "/api/join"].includes(pathname)) {
    if (!ctx.state.session.get("user")) {
      return ctx.next();
    }
    return redirect(req, ctx);
  }

  if (ctx.destination !== "route" || ctx.state.session.get("user")) {
    return ctx.next();
  }

  logRequest(LogLevels.WARNING, req, ctx, Status.Unauthorized);
  return redirect(req, ctx, "/login");
};

export const handler = [sessionHandler, redirectionHandler];
