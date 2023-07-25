import { getCookies } from "std/http/cookie.ts";
import { resolve } from "std/path/mod.ts";

import { prisma } from "~/main.ts";
import type { Prisma, User } from "~root/generated/client/index.d.ts";

export const getOrigin = (req: Request) => new URL(req.url).origin;

export const redirect = (req: Request, url?: string) => {
  const origin = getOrigin(req);
  if (!url) url = `${origin}/abi`;
  if (!url.startsWith(origin)) url = resolve(origin, url);
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
