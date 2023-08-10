import { getCookies } from "std/http/cookie.ts";
import { join, resolve } from "std/path/mod.ts";
import { LogLevels } from "std/log/mod.ts";

import { type ServeHandlerInfo, Status } from "fresh/server.ts";

import { listenUrl, logger, prisma } from "~/main.ts";
import type Prisma from "~root/prisma-shim.ts";
import type { User } from "~root/generated/client/index.d.ts";

export const getOrigin = (req: Request) => new URL(req.url).origin;
export const getServerSideUrl = (pathname: string) =>
  new URL(join(listenUrl.pathname, pathname), listenUrl);

export const redirect = (req: Request, ctx: ServeHandlerInfo, url?: string) => {
  const origin = getOrigin(req);
  if (!url) url = `${origin}/abi`;
  if (!url.startsWith(origin)) url = resolve(origin, url);
  logRequest(LogLevels.DEBUG, req, ctx, 302, `Redirect -> ${url}`);
  return new Response(null, { status: 302, headers: { location: url } });
};

export const getCookieString = (req: Request) =>
  Object.entries(getCookies(req.headers))
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

export const checkPermission = async (
  where: Prisma.PermissionWhereInput,
  user: User,
) => {
  delete where.userId;
  const entries = await prisma.permission.findMany({ where });
  if (entries.length === 0) return true;
  if (entries.find((e) => e.userId === user.id)) return true;
  return false;
};

export const logRequest = (
  logLevel: LogLevels,
  req: Request,
  ctx: ServeHandlerInfo,
  status: Status,
  message?: string,
) => {
  function bodyCallback(reqText?: string) {
    function log() {
      const requestDetails = `${reqText ?? ""}${
        message !== undefined ? `: ${message}` : ""
      }`;
      return `${status} ${
        new URL(req.url).pathname
      } ${req.method} ${ctx.remoteAddr.hostname}${
        requestDetails != "" ? ` ${requestDetails}` : ""
      }.`;
    }
    switch (logLevel) {
      case LogLevels.NOTSET:
      case LogLevels.DEBUG:
        logger.debug(log);
        break;
      case LogLevels.INFO:
        logger.info(log);
        break;
      case LogLevels.WARNING:
        logger.warning(log);
        break;
      case LogLevels.ERROR:
        logger.error(log);
        break;
      case LogLevels.CRITICAL:
        logger.critical(log);
        break;
    }
  }

  try {
    const clonedReq = req.clone();
    clonedReq.text().then(bodyCallback);
  } catch {
    bodyCallback();
  }
};
