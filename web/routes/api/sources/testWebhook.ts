import { LogLevels } from "std/log/levels.ts";

import { type Handlers, Status } from "fresh/server.ts";

import { Buffer } from "node:buffer";
import { toBytes } from "npm:viem";

import { amqpChannel, prisma } from "web/main.ts";
import { logRequest } from "web/util.ts";
import { serializeEventMessage } from "~/messages/EventMessage.ts";
import { EvmEventsQueueName } from "~/constants.ts";

export const handler: Handlers = {
  async POST(req, ctx) {
    const {
      address,
      abiHash,
      topic1,
      topic2,
      topic3,
      data,
      txHash,
      blockHash,
    } = await req.json();

    const sigHash = Buffer.from(toBytes(abiHash));
    const abi = await prisma.eventAbi.findUnique({ where: { hash: sigHash } });

    if (!abi) {
      return new Response(`abiHash ${abiHash} not found`, {
        status: Status.NotFound,
      });
    }

    logRequest(
      LogLevels.INFO,
      req,
      ctx,
      Status.Accepted,
      `Publishing event message: address ${address}  abiHash ${abiHash}`,
    );

    amqpChannel.publish(
      { routingKey: EvmEventsQueueName },
      { contentType: "application/octet-stream" },
      serializeEventMessage({
        address: toBytes(address),
        sigHash,
        abi: abi.json,
        topics: [topic1, topic2, topic3].flatMap((t) => t ? [toBytes(t)] : []),
        data: data ? toBytes(data) : new Uint8Array(32),
        txHash: txHash ? toBytes(txHash) : new Uint8Array(32),
        blockHash: blockHash ? toBytes(blockHash) : new Uint8Array(32),
        logIndex: -1n,
        blockNumber: -1n,
      }),
    );

    return new Response(null, { status: Status.NoContent });
  },
};
