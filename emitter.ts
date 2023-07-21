import { connect as connectAmqp } from "https://deno.land/x/amqp@v0.23.1/mod.ts";

import { stringify as losslessJsonStringify } from "npm:lossless-json";
import {
  Chain,
  createPublicClient,
  getAddress,
  http as httpViemTransport,
  toHex,
} from "npm:viem";

import type { PrismaClient } from "./generated/client/deno/edge.ts";

import {
  deserializeControlMessage,
  ReloadControlMessage,
} from "./ControlMessage.ts";
import { deserializeEventMessage, EventMessage } from "./EventMessage.ts";
import { formatAbiItemPrototype } from "./abitype.ts";
import {
  ControlEmitterRoutingKey,
  ControlExchangeName,
  EvmEventsQueueName,
} from "./constants.ts";
import { decodeEventLog } from "./decodeEventLog.ts";
import { uint8ArrayEquals } from "./uint8ArrayUtils.ts";
import { block, runWithChainDefinition, runWithPrisma } from "./runHelpers.ts";

export async function emitter(chain: Chain, prisma: PrismaClient) {
  const client = createPublicClient({
    chain,
    transport: httpViemTransport(),
  });

  // TODO: configuration
  const amqpConnection = await connectAmqp();
  const amqpChannel = await amqpConnection.openChannel();
  await amqpChannel.declareExchange({ exchange: ControlExchangeName });
  const controlQueue = await amqpChannel.declareQueue({});
  await amqpChannel.bindQueue({
    queue: controlQueue.queue,
    exchange: ControlExchangeName,
    routingKey: ControlEmitterRoutingKey,
  });
  await amqpChannel.declareQueue({ queue: EvmEventsQueueName });
  // TODO: rework hierarchical mapping
  let emitDestinations = await prisma.emitDestination.findMany();
  await amqpChannel.consume(
    { queue: controlQueue.queue },
    async (_args, _props, data) => {
      if (
        deserializeControlMessage(data).action === ReloadControlMessage.action
      ) {
        emitDestinations = await prisma.emitDestination.findMany();
      }
    },
  );

  let finalizationQueue: (EventMessage & { url: string })[] = [];
  await amqpChannel.consume(
    { queue: EvmEventsQueueName },
    async (args, _, data) => {
      const message = deserializeEventMessage(data);
      const {
        address,
        sigHash,
        topics,
        blockTimestamp,
        txIndex,
        logIndex,
        blockNumber,
        blockHash,
      } = message;
      emitDestinations.filter((x) =>
        uint8ArrayEquals(x.sourceAddress as unknown as Uint8Array, address) &&
        uint8ArrayEquals(x.abiHash as unknown as Uint8Array, sigHash) &&
        (x.topic1 == null ||
          (uint8ArrayEquals(x.topic1 as unknown as Uint8Array, topics[1]) &&
            (x.topic2 == null ||
              (uint8ArrayEquals(x.topic2 as unknown as Uint8Array, topics[2]) &&
                (x.topic3 == null ||
                  uint8ArrayEquals(
                    x.topic3 as unknown as Uint8Array,
                    topics[3],
                  ))))))
      ).forEach((x) => {
        if (blockNumber == -1n) {
          // Webhook Test Request
          return fetch(x.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: losslessJsonStringify({
              timestamp: blockTimestamp,
              blockIndex: blockNumber,
              transactionIndex: txIndex,
              logIndex: logIndex,
              blockHash: toHex(blockHash),
              sourceAddress: getAddress(toHex(address)),
              abiHash: toHex(sigHash),
            }),
          });
        }

        finalizationQueue.push({ ...message, url: x.webhookUrl });
      });
      await amqpChannel.ack({ deliveryTag: args.deliveryTag });
    },
  );

  const unwatch = client.watchBlockNumber(
    {
      onBlockNumber: async () => {
        const finalizedBlockNumber =
          // polygon-edge does not support finalized tag at the moment
          //(await client.getBlock({ blockTag: "finalized" })).number!;
          (await client.getBlock({ blockTag: "latest" })).number! - 64n;
        const observed = finalizationQueue.filter((x) =>
          x.blockNumber <= finalizedBlockNumber
        );
        const finalizedBlocks: Record<string, bigint> = {};
        const finalized = await observed.reduce(async (acc, x) => {
          const hash = (await client.getBlock({ blockNumber: x.blockNumber }))
            .hash;

          const isFinal = toHex(x.blockHash) === hash;
          if (isFinal) finalizedBlocks[hash] = x.blockNumber;
          return isFinal ? [...(await acc), x] : acc;
        }, Promise.resolve([] as typeof observed));

        await Promise.all(
          finalized.map(async (x) => {
            const event = await prisma.event.findUnique({
              where: {
                blockTimestamp_txIndex_logIndex: {
                  blockTimestamp: new Date(
                    Number(x.blockTimestamp) * 1000,
                  ),
                  txIndex: Number(x.txIndex),
                  logIndex: Number(x.logIndex),
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
                `ERROR: event ${x.blockTimestamp}_${x.txIndex}_${x.logIndex} not found`,
              );
              return;
            }

            const { args } = decodeEventLog({
              abi: [JSON.parse(event.Abi.json)],
              data: toHex(event.data as unknown as Uint8Array),
              topics: [toHex(x.sigHash)].concat(
                event.topic1 !== null
                  ? [toHex(event.topic1 as unknown as Uint8Array)].concat(
                    event.topic2 !== null
                      ? [toHex(event.topic2 as unknown as Uint8Array)].concat(
                        event.topic3 !== null
                          ? [toHex(event.topic3 as unknown as Uint8Array)]
                          : [],
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
                timestamp: x.blockTimestamp,
                blockIndex: x.blockNumber,
                transactionIndex: x.txIndex,
                logIndex: x.logIndex,
                blockHash: toHex(x.blockHash),
                transactionHash: toHex(event.txHash as unknown as Uint8Array),
                sourceAddress: getAddress(
                  toHex(event.sourceAddress as unknown as Uint8Array),
                ),
                abiHash: toHex(x.sigHash),
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
          finalizedBlocks[toHex(x.blockHash)] !== x.blockNumber
        ).forEach(async (x) =>
          await prisma.event.delete({
            where: {
              blockTimestamp_txIndex_logIndex: {
                blockTimestamp: new Date(
                  Number(x.blockTimestamp) * 1000,
                ),
                txIndex: Number(x.txIndex),
                logIndex: Number(x.logIndex),
              },
            },
          })
        );

        finalizationQueue = finalizationQueue.filter(
          (x) => x.blockNumber > finalizedBlockNumber,
        );
      },
    },
  );

  const abortController = new AbortController();
  const runningPromise = block(abortController.signal);

  async function cleanup() {
    abortController.abort();
    unwatch();
    await amqpConnection.close();
  }

  return { runningPromise, cleanup };
}

if (import.meta.main) {
  await runWithChainDefinition((chain) =>
    new Promise(() => ({
      runningPromise: runWithPrisma((prisma) => emitter(chain, prisma)),
    }))
  );
}
