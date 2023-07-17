import { Evt } from "https://deno.land/x/evt@v2.4.22/mod.ts";
import { Buffer } from "node:buffer";
import { AbiEvent } from "npm:abitype";
import {
  createPublicClient,
  http as httpViemTransport,
  toBytes,
  toHex,
} from "npm:viem";

import type { PrismaClient } from "./generated/client/deno/edge.ts";

import { EventMessage } from "./EventMessage.ts";
import { mothershipDevnet } from "./chains.ts";

export async function observer(prisma: PrismaClient) {
  const client = createPublicClient({
    chain: mothershipDevnet,
    transport: httpViemTransport(),
  });

  const evt = Evt.create<EventMessage>();
  const watchEvents = (await prisma.eventSource.findMany({
    select: { abiHash: true, address: true, Abi: { select: { json: true } } },
  })).map((item) => {
    const event = JSON.parse(item.Abi.json) as AbiEvent;
    return client.watchEvent({
      address: toHex(item.address),
      event,
      onLogs: async (logs) => {
        for (const log of logs) {
          if (log.blockNumber == null) throw new Error("blockNumber is null");
          if (log.transactionIndex == null) throw new Error("txIndex is null");
          if (log.logIndex == null) throw new Error("logIndex is null");
          if (log.blockHash == null) throw new Error("blockHash is null");
          if (log.transactionHash == null) throw new Error("txHash is null");

          const timestamp =
            (await client.getBlock({ blockHash: log.blockHash! })).timestamp;
          const blockHashBytes = toBytes(log.blockHash);
          const addressBytes = toBytes(log.address);
          const topicsBytes = log.topics.map(toBytes);

          await prisma.event.create({
            data: {
              blockTimestamp: new Date(Number(timestamp) * 1000),
              txIndex: log.transactionIndex,
              logIndex: log.logIndex,
              blockNumber: Number(log.blockNumber),
              blockHash: Buffer.from(blockHashBytes),
              txHash: Buffer.from(toBytes(log.transactionHash)),
              sourceAddress: Buffer.from(addressBytes),
              abiHash: item.abiHash,
              topic1: topicsBytes[1] != null
                ? Buffer.from(topicsBytes[1])
                : undefined,
              topic2: topicsBytes[2] != null
                ? Buffer.from(topicsBytes[2])
                : undefined,
              topic3: topicsBytes[3] != null
                ? Buffer.from(topicsBytes[3])
                : undefined,
              data: Buffer.from(toBytes(log.data)),
            },
          });

          evt.post(
            {
              topic: {
                address: addressBytes,
                sigHash: item.abiHash,
                topics: topicsBytes,
              },
              message: {
                blockTimestamp: timestamp,
                txIndex: log.transactionIndex,
                logIndex: log.logIndex,
                blockNumber: log.blockNumber,
                blockHash: blockHashBytes,
              },
            },
          );
        }
      },
    });
  });

  return { watchEvents, evt };
}
