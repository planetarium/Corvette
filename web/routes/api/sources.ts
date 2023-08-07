import { LogLevels } from "std/log/levels.ts";

import { type Handlers, Status } from "fresh/server.ts";
import type { WithSession } from "fresh-session";

import { Buffer } from "node:buffer";
import { getAddress, toBytes, toHex } from "npm:viem";

import { formatAbiItemPrototype } from "~root/abitype.ts";
import { reload as reloadControl } from "~root/control.ts";
import { ControlObserverRoutingKey } from "~root/constants.ts";
import type { User } from "~root/generated/client/index.d.ts";
import { amqpChannel, prisma } from "~/main.ts";
import { checkPermission, logRequest } from "~/util.ts";
import type { SourceEntry } from "~/islands/ListSources.tsx";

export const handler: Handlers<SourceEntry, WithSession> = {
  async GET(req, ctx) {
    const entries = (
      await prisma.eventSource.findMany({
        include: { Abi: true },
      })
    ).map((item) => ({
      address: getAddress(toHex(item.address)),
      abi: formatAbiItemPrototype(JSON.parse(item.Abi.json)),
      abiHash: toHex(item.abiHash),
    }));

    const body = JSON.stringify(entries);
    logRequest(
      LogLevels.DEBUG,
      req,
      ctx,
      Status.OK,
      `Get source entries: ${body}`,
    );
    return new Response(body);
  },
  async POST(req, ctx) {
    const user = ctx.state.session.get("user") as User;

    const { address, abiHash } = await req.json();

    logRequest(
      LogLevels.INFO,
      req,
      ctx,
      Status.OK,
      `Creating source entry, address: ${address}  abiHash: ${abiHash}`,
    );
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

    reloadControl(amqpChannel, ControlObserverRoutingKey);

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
      logRequest(
        LogLevels.WARNING,
        req,
        ctx,
        Status.Forbidden,
        `Failed to remove source entry, no permission  address: ${address}  abiHash: ${abiHash}`,
      );
      return new Response(null, { status: Status.Forbidden });
    }

    logRequest(
      LogLevels.WARNING,
      req,
      ctx,
      Status.OK,
      `Removing source entry, address: ${address}  abiHash: ${abiHash}`,
    );
    await prisma.eventSource.delete({
      where: {
        address_abiHash: {
          address,
          abiHash,
        },
      },
    });

    reloadControl(amqpChannel, ControlObserverRoutingKey);

    return new Response(null, { status: Status.NoContent });
  },
};
