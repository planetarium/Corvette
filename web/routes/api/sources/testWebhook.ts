import { Handlers, Status } from "fresh/server.ts";

import { toBytes } from "npm:viem";

import { EvmEventsQueueName } from "~root/constants.ts";
import { serializeEventMessage } from "~root/EventMessage.ts";
import { amqpChannel } from "~/main.ts";

export const handler: Handlers = {
  async POST(req) {
    const { address, abiHash } = await req.json();

    amqpChannel.publish(
      { routingKey: EvmEventsQueueName },
      { contentType: "application/octet-stream" },
      serializeEventMessage({
        address: toBytes(address),
        sigHash: toBytes(abiHash),
        topics: [],
        blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        txIndex: -1n,
        logIndex: -1n,
        blockNumber: -1n,
        blockHash: new Uint8Array(32),
      }),
    );

    return new Response(null, { status: Status.NoContent });
  },
};
