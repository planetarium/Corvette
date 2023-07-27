import { type Handlers, Status } from "fresh/server.ts";
import type { WithSession } from "fresh-session";

import { Buffer } from "node:buffer";
import { keccak256, toBytes, toHex } from "npm:viem";

import type { Abi, AbiEvent } from "https://esm.sh/abitype@0.9.0";

import { formatAbiItemPrototype } from "~root/abitype.ts";
import type { User } from "~root/generated/client/index.d.ts";
import { prisma } from "~/main.ts";
import { checkPermission } from "~/util.ts";
import type { AbiEntry } from "~/islands/ListAbi.tsx";

export const handler: Handlers<AbiEntry, WithSession> = {
  async GET() {
    const entries = (await prisma.eventAbi.findMany()).map((entry) => {
      const abi = JSON.parse(entry.json) as AbiEvent;
      return {
        hash: toHex(entry.hash),
        abi: abi,
        signature: formatAbiItemPrototype(abi),
      };
    });
    return new Response(JSON.stringify(entries));
  },
  async POST(req, ctx) {
    const user = ctx.state.session.get("user") as User;

    const abiJson: Abi = await req.json();

    const abiHashMapping = abiJson
      .map(
        (abiElement) =>
          [
            abiElement,
            keccak256(
              new TextEncoder().encode(formatAbiItemPrototype(abiElement)),
              "bytes",
            ),
          ] as [Abi[number], Uint8Array],
      )
      .filter(([abi]) => abi.type === "event");

    // Prisma with SQLite doesn't support createMany...
    // TODO: replace Promise.allSettled with prisma.$transaction
    const rows = await Promise.allSettled(
      abiHashMapping.map(([abiElement, hash]) =>
        prisma.eventAbi.create({
          data: {
            hash: Buffer.from(hash),
            json: JSON.stringify(abiElement),
            Permission: {
              create: {
                type: "EventAbi",
                userId: user.id,
              },
            },
          },
        })
      ),
    );
    return new Response(
      JSON.stringify(
        rows.flatMap((res) => (res.status === "fulfilled" ? [res.value] : [])),
      ),
    );
  },
  async DELETE(req, ctx) {
    const user = ctx.state.session.get("user") as User;
    const params = await req.json();
    const hash = Buffer.from(toBytes(params.hash));

    if (!(await checkPermission({ type: "EventAbi", abiHash: hash }, user))) {
      return new Response(null, { status: Status.Forbidden });
    }

    await prisma.eventAbi.delete({ where: { hash } });

    return new Response(null, { status: Status.NoContent });
  },
};
