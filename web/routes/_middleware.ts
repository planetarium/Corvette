import { MiddlewareHandlerContext } from "fresh/server.ts";
import { cookieSession, WithSession } from "fresh-session";
import { redirect } from "~/util.ts";

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
    ctx.state.session.set("user", undefined);
    ctx.state.session.destroy();
    return redirect(req, "/login");
  }

  if (["/login", "/api/login", "/api/join"].includes(pathname)) {
    if (!ctx.state.session.get("user")) {
      return ctx.next();
    }
    return redirect(req);
  }

  if (ctx.destination !== "route" || ctx.state.session.get("user")) {
    return ctx.next();
  }

  return redirect(req, "/login");
};

export const handler = [sessionHandler, redirectionHandler];
