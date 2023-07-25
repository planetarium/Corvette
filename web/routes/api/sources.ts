import { type Handlers, Status } from "fresh/server.ts";
import type { WithSession } from "fresh-session";

import { Buffer } from "node:buffer";
import { getAddress, toBytes, toHex } from "npm:viem";

import { formatAbiItemPrototype } from "~root/abitype.ts";
import type { User } from "~root/generated/client/deno/index.d.ts";
import { prisma } from "~/main.ts";
import type { SourceEntry } from "~/islands/ListSources.tsx";
import { checkPermission } from "~root/web/util.ts";

export const handler: Handlers<SourceEntry, WithSession> = {
  async GET() {
    const entries = (
      await prisma.eventSource.findMany({
        include: { Abi: true },
      })
    ).map((item) => ({
      address: getAddress(toHex(item.address)),
      abi: formatAbiItemPrototype(JSON.parse(item.Abi.json)),
      abiHash: toHex(item.abiHash),
    }));

    return new Response(JSON.stringify(entries));
  },
  async POST(req, ctx) {
    const user = ctx.state.session.get("user") as User;

    const { address, abiHash } = await req.json();

    const entries = await prisma.eventSource
      .create({
        data: {
          address: Buffer.from(toBytes(address)),
          abiHash: Buffer.from(toBytes(abiHash)),
          Permission: {
            create: {
              type: "EventSource",
              userId: user.id,
            },
          },
        },
        include: { Abi: true },
      })
      .then((item) => ({
        address: getAddress(toHex(item.address)),
        abi: formatAbiItemPrototype(JSON.parse(item.Abi.json)),
        abiHash: toHex(item.abiHash),
      }));
    return new Response(JSON.stringify(entries));
  },
  async DELETE(req, ctx) {
    const user = ctx.state.session.get("user") as User;

    const params = await req.json();
    const address = Buffer.from(toBytes(params.address));
    const abiHash = Buffer.from(toBytes(params.abiHash));

    if (
      !(await checkPermission(
        {
          type: "EventSource",
          sourceAddress: address,
          abiHash,
        },
        user,
      ))
    ) {
      return new Response(null, { status: Status.Forbidden });
    }

    await prisma.eventSource.delete({
      where: {
        address_abiHash: {
          address,
          abiHash,
        },
      },
    });

    return new Response(null, { status: Status.NoContent });
  },
};
