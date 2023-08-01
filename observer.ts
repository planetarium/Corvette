import { AmqpConnection } from "https://deno.land/x/amqp@v0.23.1/mod.ts";

import { Buffer } from "node:buffer";
import { AbiEvent } from "npm:abitype";
import {
  Chain,
  createPublicClient,
  http as httpViemTransport,
  Log,
  toBytes,
  toHex,
} from "npm:viem";

import Prisma, { type PrismaClient } from "./prisma-shim.ts";

import {
  deserializeControlMessage,
  ReloadControlMessage,
} from "./ControlMessage.ts";
import { serializeEventMessage } from "./EventMessage.ts";
import {
  ControlExchangeName,
  ControlObserverRoutingKey,
  EvmEventsQueueName,
} from "./constants.ts";
import {
  block,
  runWithAmqp,
  runWithChainDefinition,
  runWithPrisma,
} from "./runHelpers.ts";

export async function observer(
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
    routingKey: ControlObserverRoutingKey,
  });
  await amqpChannel.declareQueue({ queue: EvmEventsQueueName });
  let unwatch = await createWatch();
  await amqpChannel.consume(
    { queue: controlQueue.queue },
    async (_args, _props, data) => {
      if (
        deserializeControlMessage(data).action === ReloadControlMessage.action
      ) {
        unwatch();
        unwatch = await createWatch();
      }
    },
  );

  const abortController = new AbortController();
  const runningPromise = block(abortController.signal);

  async function cleanup() {
    abortController.abort();
    unwatch();
    await runningPromise;
  }

  return { runningPromise, cleanup };

  // TODO: customizable poll interval and transport
  async function createWatch() {
    const sources = (await prisma.eventSource.findMany({
      select: { abiHash: true, address: true, Abi: { select: { json: true } } },
    })).reduce((acc, item) => {
      const address = toHex(item.address as unknown as Uint8Array);
      const entry = toHex(item.abiHash);
      if (acc[address] === undefined) acc = { ...acc, [address]: [entry] };
      else acc[address].push(entry);
      return acc;
    }, {} as Record<string, string[]>);
    return client.watchEvent({
      address: Object.keys(sources) as `0x${string}`[],
      onLogs: (logs) =>
        Promise.all(
          logs.map((log) => {
            if (
              sources[log.address] !== undefined &&
              log.topics[0] !== undefined &&
              sources[log.address].includes(log.topics[0])
            ) return processLog(log);
            return undefined;
          }).filter((onLog) => onLog !== undefined) as Promise<
            void
          >[] satisfies Promise<void>[],
        ),
    });
  }

  async function processLog(
    log: Log<
      bigint,
      number,
      AbiEvent | undefined,
      undefined,
      [AbiEvent | undefined],
      string
    >,
  ) {
    if (log.blockNumber == null) throw new Error("blockNumber is null");
    if (log.transactionIndex == null) {
      throw new Error("txIndex is null");
    }
    if (log.logIndex == null) throw new Error("logIndex is null");
    if (log.blockHash == null) throw new Error("blockHash is null");
    if (log.transactionHash == null) throw new Error("txHash is null");

    const timestamp =
      (await client.getBlock({ blockHash: log.blockHash! })).timestamp;
    const blockHashBytes = toBytes(log.blockHash);
    const addressBytes = toBytes(log.address);
    const topicsBytes = log.topics.map(toBytes).map(Buffer.from);
    const [abiHash, topic1, topic2, topic3] = topicsBytes;

    try {
      await prisma.event.create({
        data: {
          blockTimestamp: new Date(Number(timestamp) * 1000),
          txIndex: log.transactionIndex,
          logIndex: log.logIndex,
          blockNumber: Number(log.blockNumber),
          blockHash: Buffer.from(blockHashBytes),
          txHash: Buffer.from(toBytes(log.transactionHash)),
          sourceAddress: Buffer.from(addressBytes),
          abiHash,
          topic1,
          topic2,
          topic3,
          data: Buffer.from(toBytes(log.data)),
        },
      });

      amqpChannel.publish(
        { routingKey: EvmEventsQueueName },
        { contentType: "application/octet-stream" },
        serializeEventMessage({
          address: addressBytes,
          sigHash: abiHash,
          topics: topicsBytes,
          blockTimestamp: timestamp,
          txIndex: BigInt(log.transactionIndex),
          logIndex: BigInt(log.logIndex),
          blockNumber: log.blockNumber,
          blockHash: blockHashBytes,
        }),
      );
    } catch (e) {
      // ignore if the entry for the observed event exists in db (other observer already inserted)
      if (
        (e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002")
      ) {
        // log
        return;
      }
      throw e; // throw unexpected errors
    }
  }
}

if (import.meta.main) {
  await runWithChainDefinition((chain) =>
    Promise.resolve({
      runningPromise: runWithPrisma((prisma) =>
        Promise.resolve({
          runningPromise: runWithAmqp((amqpConnection) =>
            observer(chain, prisma, amqpConnection)
          ),
        })
      ),
    })
  );
}
