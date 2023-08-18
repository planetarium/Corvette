import { LogLevels } from "std/log/mod.ts";

import { type Handlers, Status } from "fresh/server.ts";
import type { WithSession } from "fresh-session";

import { Buffer } from "node:buffer";
import { getAddress, toBytes, toHex } from "npm:viem";

import { amqpChannel, prisma } from "web/main.ts";
import { checkPermission, logRequest } from "web/util.ts";
import { reload as reloadControl } from "~/messages/control.ts";
import { ControlEmitterRoutingKey } from "~/constants.ts";
import type { User } from "~/prisma/shim.ts";

import type { WebhookEntry } from "web/islands/ListWebhook.tsx";

export const handler: Handlers<WebhookEntry, WithSession> = {
  async GET(req, ctx) {
    const entries = (await prisma.emitDestination.findMany()).map((item) => ({
      id: item.id,
      sourceAddress: getAddress(toHex(item.sourceAddress)),
      abiHash: toHex(item.abiHash),
      webhookUrl: item.webhookUrl,
      topic1: item.topic1 ? toHex(item.topic1) : undefined,
      topic2: item.topic2 ? toHex(item.topic2) : undefined,
      topic3: item.topic3 ? toHex(item.topic3) : undefined,
    }));
    const body = JSON.stringify(entries);
    logRequest(LogLevels.DEBUG, req, ctx, 200, `Get webhook entries: ${body}`);
    return new Response(body);
  },
  async POST(req, ctx) {
    const user = ctx.state.session.get("user") as User;

    const { sourceAddress, abiHash, webhookUrl, topic1, topic2, topic3 } =
      await req.json();

    const topics = Object.fromEntries(
      [topic1, topic2, topic3].flatMap((val, idx) =>
        val ? [[`topic${idx + 1}`, Buffer.from(toBytes(val))]] : []
      ),
    );

    logRequest(
      LogLevels.INFO,
      req,
      ctx,
      Status.OK,
      `Creating webhook entry, address: ${sourceAddress}  abiHash: ${abiHash}  url: ${webhookUrl}  topics: ${
        [topic1, topic2, topic3].map((topic, i) => [i, topic]).filter((x) =>
          x[1]
        ).map((x) => `[${x[0]}] ${x[1]}`).join(" ")
      }`,
    );
    const entries = await prisma.emitDestination
      .create({
        data: {
          sourceAddress: Buffer.from(toBytes(sourceAddress)),
          abiHash: Buffer.from(toBytes(abiHash)),
          webhookUrl,
          ...topics,
          Permission: {
            create: {
              type: "EmitDestination",
              userId: user.id,
            },
          },
        },
      })
      .then((item) => ({
        id: item.id,
        sourceAddress: getAddress(toHex(item.sourceAddress)),
        abiHash: toHex(item.abiHash),
        webhookUrl: item.webhookUrl,
        topic1: item.topic1 ? toHex(item.topic1) : undefined,
        topic2: item.topic2 ? toHex(item.topic2) : undefined,
        topic3: item.topic3 ? toHex(item.topic3) : undefined,
      }));

    reloadControl(amqpChannel, ControlEmitterRoutingKey);

    return new Response(JSON.stringify(entries));
  },
  async DELETE(req, ctx) {
    const user = ctx.state.session.get("user") as User;
    const params = await req.json();
    const id = Number(params.id);

    if (
      !(await checkPermission(
        { type: "EmitDestination", destinationId: id },
        user,
      ))
    ) {
      logRequest(
        LogLevels.WARNING,
        req,
        ctx,
        Status.Forbidden,
        `Failed to remove webhook entry, no permission  id: ${id}`,
      );
      return new Response(null, { status: Status.Forbidden });
    }

    logRequest(
      LogLevels.WARNING,
      req,
      ctx,
      Status.OK,
      `Removing webhook entry, id: ${id}`,
    );
    await prisma.emitDestination.delete({ where: { id } });

    reloadControl(amqpChannel, ControlEmitterRoutingKey);

    return new Response(null, { status: Status.NoContent });
  },
};
