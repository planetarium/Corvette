import { AmqpConnection } from "https://deno.land/x/amqp@v0.23.1/mod.ts";

import { stringify as losslessJsonStringify } from "npm:lossless-json";
import {
  Chain,
  createPublicClient,
  getAddress,
  http as httpViemTransport,
  InvalidParamsRpcError,
  toHex,
} from "npm:viem";

import type { PrismaClient } from "./prisma-shim.ts";

import {
  deserializeControlMessage,
  ReloadControlMessage,
} from "./ControlMessage.ts";
import { deserializeEventMessage, EventMessage } from "./EventMessage.ts";
import {
  BlockFinalityEnvKey,
  ControlEmitterRoutingKey,
  ControlExchangeName,
  EvmEventsQueueName,
} from "./constants.ts";
import {
  block,
  combinedEnv,
  runWithAmqp,
  runWithChainDefinition,
  runWithPrisma,
} from "./runHelpers.ts";
import { uint8ArrayEquals } from "./uint8ArrayUtils.ts";
import { serializeEventResponse } from "./EventResponse.ts";

export async function emitter(
  chain: Chain,
  prisma: PrismaClient,
  amqpConnection: AmqpConnection,
) {
  const client = createPublicClient({
    chain,
    transport: httpViemTransport(),
  });

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
        if (blockNumber === -1n) {
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

  const blockFinalityEnvVar = combinedEnv[BlockFinalityEnvKey];
  const blockFinalityNumber = Number(blockFinalityEnvVar);
  const blockFinality =
    blockFinalityEnvVar === "safe" || blockFinalityEnvVar === "finalized"
      ? blockFinalityEnvVar
      : Number.isInteger(blockFinalityNumber)
      ? BigInt(blockFinalityEnvVar)
      : undefined;
  if (blockFinality === undefined) {
    throw new Error(
      `${BlockFinalityEnvKey} environment may only take either an integer or string "safe" or "finalized" as the value.`,
    );
  }
  if (typeof (blockFinality) === "string") {
    try {
      await client.getBlock({ blockTag: blockFinality });
    } catch (e) {
      if (e instanceof InvalidParamsRpcError) {
        throw new Error(
          `The given RPC node does not support the blockTag '${blockFinality}'.`,
        );
      }
      throw e;
    }
  }

  // TODO: customizable poll interval and transport
  const unwatch = typeof (blockFinality) === "bigint"
    ? client.watchBlockNumber({
      onBlockNumber: (blockNumber) =>
        blockFinalized(blockNumber - blockFinality),
    })
    : client.watchBlocks({
      blockTag: blockFinality,
      onBlock: (block) => blockFinalized(block.number!),
    });

  async function blockFinalized(blockNumber: bigint) {
    const observed = finalizationQueue.filter((x) =>
      x.blockNumber <= blockNumber
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
          include: { Abi: true },
        });

        if (event == null) {
          console.error(
            `ERROR: event ${x.blockTimestamp}_${x.txIndex}_${x.logIndex} not found`,
          );
          return;
        }

        return fetch(x.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: losslessJsonStringify(serializeEventResponse(event)),
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
      (x) => x.blockNumber > blockNumber,
    );
  }

  const abortController = new AbortController();
  const runningPromise = block(abortController.signal);

  async function cleanup() {
    abortController.abort();
    unwatch();
    await runningPromise;
  }

  return { runningPromise, cleanup };
}

if (import.meta.main) {
  await runWithChainDefinition((chain) =>
    Promise.resolve({
      runningPromise: runWithPrisma((prisma) =>
        Promise.resolve({
          runningPromise: runWithAmqp((amqpConnection) =>
            emitter(chain, prisma, amqpConnection)
          ),
        })
      ),
    })
  );
}
