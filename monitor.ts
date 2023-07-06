import { Evt } from "https://deno.land/x/evt@v2.4.22/mod.ts";
import type { DB } from "https://deno.land/x/sqlite@v3.7.2/mod.ts";
import { AbiEvent } from "npm:abitype";
import {
  createPublicClient,
  http as httpViemTransport,
  toBytes,
  toHex,
} from "npm:viem";

import { EventMessage } from "./EventMessage.ts";
import { mothershipDevnet } from "./chains.ts";

export function monitor(db: DB) {
  const client = createPublicClient({
    chain: mothershipDevnet,
    transport: httpViemTransport(),
  });

  const evt = Evt.create<EventMessage>();
  const watchEvents = db.query(
    "SELECT EventSource.address, ABI.id, ABI.abiJson FROM EventSource INNER JOIN ABI ON EventSource.abiId = ABI.id",
  ).map((row) => {
    const event = JSON.parse(row[2] as string) as AbiEvent;
    return client.watchEvent({
      address: toHex(row[0] as Uint8Array),
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

          db.query(
            `INSERT INTO Event (
              blockTimestamp,
              txIndex,
              logIndex,
              blockNumber,
              blockHash,
              txHash,
              sourceAddress,
              abiId,
              topic1,
              topic2,
              topic3,
              data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              timestamp,
              log.transactionIndex,
              log.logIndex,
              log.blockNumber,
              blockHashBytes,
              toBytes(log.transactionHash),
              addressBytes,
              row[1] as Uint8Array,
              topicsBytes[0] ?? null,
              topicsBytes[1] ?? null,
              topicsBytes[2] ?? null,
              toBytes(log.data),
            ],
          );

          evt.post(
            {
              topic: {
                address: addressBytes,
                sigHash: row[1] as Uint8Array,
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
