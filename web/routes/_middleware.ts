import { cookieSession, WithSession } from "fresh-session";
import { MiddlewareHandlerContext, Status } from "fresh/server.ts";

import { User } from "~root/generated/client/index.d.ts";
import { logger } from "~root/web/main.ts";

import { logRequest, redirect } from "~/util.ts";

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
      logRequest(logger.info, req, ctx, Status.OK, `User ${email} logged out`);
    } else logRequest(logger.info, req, ctx, Status.NotModified);
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

  logRequest(logger.warning, req, ctx, Status.Unauthorized);
  return redirect(req, ctx, "/login");
};

export const handler = [sessionHandler, redirectionHandler];
