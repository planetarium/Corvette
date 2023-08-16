import { LogLevels } from "std/log/levels.ts";

import { type Handlers, Status } from "fresh/server.ts";
import type { WithSession } from "fresh-session";

import type { Abi, AbiEvent } from "abitype";

import { Buffer } from "node:buffer";
import { keccak256, toBytes, toHex } from "npm:viem";

import { prisma } from "web/main.ts";
import { checkPermission, logRequest } from "web/util.ts";
import { formatAbiItemPrototype } from "~/abitype.ts";
import type { User } from "~/generated/client/index.d.ts";

import type { AbiEntry } from "web/islands/ListAbi.tsx";

export const handler: Handlers<AbiEntry, WithSession> = {
  async GET(req, ctx) {
    const entries = (await prisma.eventAbi.findMany()).map((entry) => {
      const abi = JSON.parse(entry.json) as AbiEvent;
      return {
        hash: toHex(entry.hash),
        abi: abi,
        signature: formatAbiItemPrototype(abi),
      };
    });
    const body = JSON.stringify(entries);
    logRequest(
      LogLevels.DEBUG,
      req,
      ctx,
      Status.OK,
      `Get abi entries: ${body}`,
    );
    return new Response(body);
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

    const fulfilled = rows.flatMap((
      res,
    ) => (res.status === "fulfilled" ? [res.value] : []));
    if (fulfilled.length === 0) {
      logRequest(
        LogLevels.DEBUG,
        req,
        ctx,
        Status.Forbidden,
        "Failed to create abi entries, none fulfilled",
      );
      return new Response(null, { status: Status.Forbidden });
    }

    const body = JSON.stringify(fulfilled);
    logRequest(
      LogLevels.INFO,
      req,
      ctx,
      Status.OK,
      `Created abi entries: ${body}`,
    );
    return new Response(body);
  },

  async DELETE(req, ctx) {
    const user = ctx.state.session.get("user") as User;
    const params = await req.json();
    const hash = Buffer.from(toBytes(params.hash));

    if (!(await checkPermission({ type: "EventAbi", abiHash: hash }, user))) {
      logRequest(
        LogLevels.WARNING,
        req,
        ctx,
        Status.Forbidden,
        `Failed to remove abi entry, no permission  abiHash: ${hash}`,
      );
      return new Response(null, { status: Status.Forbidden });
    }

    logRequest(
      LogLevels.WARNING,
      req,
      ctx,
      Status.OK,
      `Removing abi entry, abiHash: ${hash}`,
    );
    await prisma.eventAbi.delete({ where: { hash } });

    return new Response(null, { status: Status.NoContent });
  },
};
