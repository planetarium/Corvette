import { type Handlers, Status } from "fresh/server.ts";
import type { WithSession } from "fresh-session";

import { Buffer } from "node:buffer";
import { getAddress, toBytes, toHex } from "npm:viem";

import { reload as reloadControl } from "~root/control.ts";
import { ControlEmitterRoutingKey } from "~root/constants.ts";
import type { User } from "~root/generated/client/index.d.ts";
import { amqpChannel, prisma } from "~/main.ts";
import { checkPermission } from "~/util.ts";
import type { WebhookEntry } from "~/islands/ListWebhook.tsx";

export const handler: Handlers<WebhookEntry, WithSession> = {
  async GET() {
    const entries = (await prisma.emitDestination.findMany()).map((item) => ({
      id: item.id,
      sourceAddress: getAddress(toHex(item.sourceAddress)),
      abiHash: toHex(item.abiHash),
      webhookUrl: item.webhookUrl,
      topic1: item.topic1 ? toHex(item.topic1) : undefined,
      topic2: item.topic2 ? toHex(item.topic2) : undefined,
      topic3: item.topic3 ? toHex(item.topic3) : undefined,
    }));
    return new Response(JSON.stringify(entries));
  },
  async POST(req, ctx) {
    const user = ctx.state.session.get("user") as User;

    const { sourceAddress, abiHash, webhookUrl, topic1, topic2, topic3 } = await req.json();

    const topics = Object.fromEntries(
      [topic1, topic2, topic3].flatMap((val, idx) =>
        val ? [[`topic${idx + 1}`, Buffer.from(toBytes(val))]] : []
      )
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

    if (!(await checkPermission({ type: "EmitDestination", destinationId: id }, user))) {
      return new Response(null, { status: Status.Forbidden });
    }

    await prisma.emitDestination.delete({ where: { id } });

    reloadControl(amqpChannel, ControlEmitterRoutingKey);

    return new Response(null, { status: Status.NoContent });
  },
};
