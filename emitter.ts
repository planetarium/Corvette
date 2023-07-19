import { connect as connectAmqp } from "https://deno.land/x/amqp@v0.23.1/mod.ts";
import {
  isInteger,
  parse as loselessJsonParse,
  stringify as losslessJsonStringify,
} from "npm:lossless-json";
import {
  Chain,
  createPublicClient,
  getAddress,
  http as httpViemTransport,
  toBytes,
  toHex,
} from "npm:viem";

import type { PrismaClient } from "./generated/client/deno/edge.ts";

import { EventMessage } from "./EventMessage.ts";
import { MarshaledEventMessage } from "./MarshaledEventMessage.ts";
import { formatAbiItemPrototype } from "./abitype.ts";
import {
  controlEmitterRoutingKey,
  controlExchangeName,
  evmEventsQueueName,
} from "./constants.ts";
import { decodeEventLog } from "./decodeEventLog.ts";
import { uint8ArrayEqual } from "./utils.ts";
import { ControlMessage } from "./ControlMessage.ts";

export async function emitter(chain: Chain, prisma: PrismaClient) {
  const textDecoder = new TextDecoder();
  const client = createPublicClient({
    chain,
    transport: httpViemTransport(),
  });

  // TODO: configuration
  const amqpConnection = await connectAmqp();
  const amqpChannel = await amqpConnection.openChannel();
  await amqpChannel.declareExchange({ exchange: controlExchangeName });
  const controlQueue = await amqpChannel.declareQueue({});
  await amqpChannel.bindQueue({
    queue: controlQueue.queue,
    exchange: controlExchangeName,
    routingKey: controlEmitterRoutingKey,
  });
  await amqpChannel.declareQueue({ queue: evmEventsQueueName });
  // TODO: rework hierarchical mapping
  let emitDestinations = await prisma.emitDestination.findMany();
  await amqpChannel.consume(
    { queue: controlQueue.queue },
    async (_args, _props, data) => {
      if (
        (JSON.parse(textDecoder.decode(data)) as ControlMessage).action ===
          "reload"
      ) {
        emitDestinations = await prisma.emitDestination.findMany();
      }
    },
  );

  let finalizationQueue: (EventMessage & { url: string })[] = [];
  await amqpChannel.consume(
    { queue: evmEventsQueueName },
    async (args, _, data) => {
      const marshal = loselessJsonParse(
        textDecoder.decode(data),
        undefined,
        (value) => {
          if (!isInteger(value)) return Number(value);
          const b = BigInt(value);
          const n = Number(b);
          return Number.isSafeInteger(n) ? n : b;
        },
      ) as MarshaledEventMessage;
      const message: EventMessage = {
        ...marshal,
        address: toBytes(marshal.address),
        sigHash: toBytes(marshal.sigHash),
        topics: marshal.topics.map((x) => toBytes(x)),
        blockHash: toBytes(marshal.blockHash),
      };
      emitDestinations.filter((x) =>
        uint8ArrayEqual(
          x.sourceAddress as unknown as Uint8Array,
          message.address,
        ) &&
        uint8ArrayEqual(
          x.abiHash as unknown as Uint8Array,
          message.sigHash,
        ) &&
        (x.topic1 == null ||
          uint8ArrayEqual(
            x.topic1 as unknown as Uint8Array,
            message.topics[1],
          )) &&
        (x.topic2 == null ||
          uint8ArrayEqual(
            x.topic2 as unknown as Uint8Array,
            message.topics[2],
          )) &&
        (x.topic3 == null ||
          uint8ArrayEqual(
            x.topic3 as unknown as Uint8Array,
            message.topics[3],
          ))
      ).forEach((x) => {
        if (message.blockNumber == -1n) {
          // Webhook Test Request
          return fetch(x.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: losslessJsonStringify({
              timestamp: message.blockTimestamp,
              blockIndex: message.blockNumber,
              transactionIndex: message.txIndex,
              logIndex: message.logIndex,
              blockHash: toHex(message.blockHash),
              sourceAddress: getAddress(toHex(message.address)),
              abiHash: toHex(message.sigHash),
            }),
          });
        }

        finalizationQueue.push({ ...message, url: x.webhookUrl });
      });
      await amqpChannel.ack({ deliveryTag: args.deliveryTag });
    },
  );

  const watch = client.watchBlockNumber(
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
                  txIndex: x.txIndex,
                  logIndex: x.logIndex,
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
                transactionHash: toHex(event.txHash),
                sourceAddress: getAddress(
                  toHex(event.sourceAddress),
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
                txIndex: x.txIndex,
                logIndex: x.logIndex,
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
  return { watch };
}
