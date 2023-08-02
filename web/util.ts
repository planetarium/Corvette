import { getCookies } from "std/http/cookie.ts";
import { join, resolve } from "std/path/mod.ts";

import { listenUrl, prisma } from "~/main.ts";
import type Prisma from "~root/prisma-shim.ts";
import type { User } from "~root/generated/client/index.d.ts";

export const getOrigin = (req: Request) => new URL(req.url).origin;
export const getServerSideUrl = (pathname: string) =>
  new URL(join(listenUrl.pathname, pathname), listenUrl);

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

const globalThisShim = globalThis as {
  process?: { versions?: { node?: unknown } };
};
const needPatch = globalThisShim.process !== undefined &&
  globalThisShim.process.versions !== undefined &&
  globalThisShim.process.versions.node !== undefined;
if (needPatch) {
  Object.assign(globalThis, {
    process: {
      ...globalThisShim.process,
      versions: { ...globalThisShim.process!.versions, node: undefined },
    },
  });
}
import _argon2 from "https://esm.sh/argon2-browser@1.18.0/dist/argon2-bundled.min.js";
export import argon2 = _argon2;
await argon2.hash({ pass: new Uint8Array(0), salt: new Uint8Array(8) });
if (needPatch) {
  Object.assign(globalThis, {
    process: {
      ...globalThisShim.process,
      versions: {
        ...globalThisShim.process!.versions,
        node: globalThisShim.process!.versions!.node,
      },
    },
  });
}
