import type { Evt } from "https://deno.land/x/evt@v2.4.22/mod.ts";
import { stringify as losslessJsonStringify } from "npm:lossless-json";
import {
  createPublicClient,
  getAddress,
  http as httpViemTransport,
  toHex,
} from "npm:viem";

import type { PrismaClient } from "./generated/client/deno/edge.ts";

import { EventMessage } from "./EventMessage.ts";
import { formatAbiItemPrototype } from "./abitype.ts";
import { mothershipDevnet } from "./chains.ts";
import { decodeEventLog } from "./decodeEventLog.ts";
import { uint8ArrayEqual } from "./utils.ts";

export async function emitter(
  prisma: PrismaClient,
  evt: Evt<EventMessage>,
) {
  const client = createPublicClient({
    chain: mothershipDevnet,
    transport: httpViemTransport(),
  });
  // TODO: rework hierarchical mapping
  const emitDestinations = await prisma.emitDestination.findMany();
  let queue: (EventMessage & { url: string })[] = [];
  function filterMessage(
    x: typeof emitDestinations[number],
    message: EventMessage,
  ) {
    return (
      uint8ArrayEqual(x.sourceAddress, message.topic.address) &&
      uint8ArrayEqual(x.abiHash, message.topic.sigHash) &&
      (x.topic1 == null ||
        uint8ArrayEqual(x.topic1, message.topic.topics[1])) &&
      (x.topic2 == null ||
        uint8ArrayEqual(x.topic2, message.topic.topics[2])) &&
      (x.topic3 == null ||
        uint8ArrayEqual(x.topic3, message.topic.topics[3]))
    );
  }
  const attaches = evt.attach(
    (message) => emitDestinations.some((x) => filterMessage(x, message)),
    (message) =>
      emitDestinations.filter((x) => filterMessage(x, message)).forEach((x) => {
        if (message.message.blockNumber === -1n) {
          // Webhook Test Request
          return fetch(x.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: losslessJsonStringify({
              timestamp: message.message.blockTimestamp,
              blockIndex: message.message.blockNumber,
              transactionIndex: message.message.txIndex,
              logIndex: message.message.logIndex,
              blockHash: toHex(message.message.blockHash),
              sourceAddress: getAddress(toHex(message.topic.address)),
              abiHash: toHex(message.topic.sigHash),
            }),
          });
        }
        queue.push({ ...message, url: x.webhookUrl });
      }),
  );

  const watch = client.watchBlockNumber(
    {
      onBlockNumber: async () => {
        const finalizedBlockNumber =
          // polygon-edge does not support finalized tag at the moment
          //(await client.getBlock({ blockTag: "finalized" })).number!;
          (await client.getBlock({ blockTag: "latest" })).number! - 64n;
        const observed = queue.filter((x) =>
          x.message.blockNumber <= finalizedBlockNumber
        );
        const finalizedBlocks: Record<string, bigint> = {};
        const finalized = await observed.reduce(async (acc, x) => {
          const hash =
            (await client.getBlock({ blockNumber: x.message.blockNumber }))
              .hash;

          const isFinal = toHex(x.message.blockHash) === hash;
          if (isFinal) finalizedBlocks[hash] = x.message.blockNumber;
          return isFinal ? [...(await acc), x] : acc;
        }, Promise.resolve([] as typeof observed));

        await Promise.all(
          finalized.map(async (x) => {
            const event = await prisma.event.findUnique({
              where: {
                blockTimestamp_txIndex_logIndex: {
                  blockTimestamp: new Date(
                    Number(x.message.blockTimestamp) * 1000,
                  ),
                  txIndex: x.message.txIndex,
                  logIndex: x.message.logIndex,
                },
              },
              select: {
                txHash: true,
                sourceAddress: true,
                topic1: true,
                topic2: true,
                topic3: true,
                data: true,
                Abi: {
                  select: {
                    json: true,
                  },
                },
              },
            });

            if (event == null) {
              console.error(
                `ERROR: event ${x.message.blockTimestamp}_${x.message.txIndex}_${x.message.logIndex} not found`,
              );
              return;
            }

            const { args } = decodeEventLog({
              abi: [JSON.parse(event.Abi.json)],
              data: toHex(event.data),
              topics: [toHex(x.topic.sigHash)].concat(
                event.topic1 !== null
                  ? [toHex(event.topic1)].concat(
                    event.topic2 !== null
                      ? [toHex(event.topic2)].concat(
                        event.topic3 !== null ? [toHex(event.topic3)] : [],
                      )
                      : [],
                  )
                  : [],
              ) as [signature: `0x${string}`, ...args: `0x${string}`[]],
            });
            return fetch(x.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: losslessJsonStringify({
                timestamp: x.message.blockTimestamp,
                blockIndex: x.message.blockNumber,
                transactionIndex: x.message.txIndex,
                logIndex: x.message.logIndex,
                blockHash: toHex(x.message.blockHash),
                transactionHash: toHex(event.txHash),
                sourceAddress: getAddress(
                  toHex(event.sourceAddress),
                ),
                abiHash: toHex(x.topic.sigHash),
                abiSignature: formatAbiItemPrototype(
                  JSON.parse(event.Abi.json),
                ),
                args: {
                  named: Object.keys(args).filter((x) =>
                    !Object.keys([...(args as unknown[])]).includes(x)
                  ).reduce(
                    (acc, x) => ({
                      ...acc,
                      [x]: (args as Record<string, unknown>)[x],
                    }),
                    {},
                  ),
                  ordered: [...(args as unknown[])],
                },
              }),
            });
          }),
        );

        observed.filter((x) =>
          finalizedBlocks[toHex(x.message.blockHash)] !== x.message.blockNumber
        ).forEach(async (x) =>
          await prisma.event.delete({
            where: {
              blockTimestamp_txIndex_logIndex: {
                blockTimestamp: new Date(
                  Number(x.message.blockTimestamp) * 1000,
                ),
                txIndex: x.message.txIndex,
                logIndex: x.message.logIndex,
              },
            },
          })
        );

        queue = queue.filter(
          (x) => x.message.blockNumber > finalizedBlockNumber,
        );
      },
    },
  );
  return { attaches, watch };
}
