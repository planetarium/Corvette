import { LogLevels } from "std/log/levels.ts";

import { type Handlers, Status } from "fresh/server.ts";

import { toBytes } from "npm:viem";

import { amqpChannel } from "web/main.ts";
import { logRequest } from "web/util.ts";
import { serializeEventMessage } from "~/EventMessage.ts";
import { EvmEventsQueueName } from "~/constants.ts";

export const handler: Handlers = {
  async POST(req, ctx) {
    const { address, abiHash } = await req.json();

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
        sigHash: toBytes(abiHash),
        topics: [],
        blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        logIndex: -1n,
        blockNumber: -1n,
        blockHash: new Uint8Array(32),
      }),
    );

    return new Response(null, { status: Status.NoContent });
  },
};
