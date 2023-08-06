import { ConsoleHandler } from "https://deno.land/std@0.196.0/log/handlers.ts";
import {
  getLogger,
  setup as setupLog,
} from "https://deno.land/std@0.196.0/log/mod.ts";

import { AmqpConnection } from "https://deno.land/x/amqp@v0.23.1/mod.ts";

import { Buffer } from "node:buffer";
import { AbiEvent } from "npm:abitype";
import {
  Chain,
  createPublicClient,
  http as httpViemTransport,
  Log as LogGeneric,
  toBytes,
  toHex,
  WatchEventReturnType,
} from "npm:viem";

import Prisma, { type PrismaClient } from "./prisma-shim.ts";

import { deserializeControlMessage } from "./ControlMessage.ts";
import { serializeEventMessage } from "./EventMessage.ts";
import {
  ControlExchangeName,
  ControlObserverRoutingKey,
  EvmEventsQueueName,
  LastRecoveredSharedStateKey,
} from "./constants.ts";
import {
  defaultLogFormatter,
  getInternalLoggers,
  getLoggingLevel,
  ObserverLoggerName,
} from "./logUtils.ts";
import {
  block,
  runWithAmqp,
  runWithChainDefinition,
  runWithPrisma,
} from "./runHelpers.ts";

type Log = LogGeneric<
  bigint,
  number,
  AbiEvent | undefined,
  undefined,
  [AbiEvent | undefined],
  string
>;

export async function observer(
  chain: Chain,
  prisma: PrismaClient,
  amqpConnection: AmqpConnection,
) {
  const logger = getLogger(ObserverLoggerName);
  logger.info(
    `Observer starting, chain name: ${chain.name}  id: ${chain.id}  url: ${
      chain.rpcUrls.default.http[0]
    }.`,
  );
  const client = createPublicClient({
    chain,
    transport: httpViemTransport(),
  });

  logger.debug(`Opening AMQP channel.`);
  const amqpChannel = await amqpConnection.openChannel();
  logger.debug(`Declaring AMQP control exchange: ${ControlExchangeName}.`);
  await amqpChannel.declareExchange({ exchange: ControlExchangeName });
  const controlQueue = await amqpChannel.declareQueue({});
  logger.debug(
    `Declared AMQP control queue: ${controlQueue.queue}  consumers: ${controlQueue.consumerCount}  message count: ${controlQueue.messageCount}.`,
  );
  logger.debug(
    `Binding AMQP control queue with exchange: ${ControlExchangeName}  routing key: ${ControlObserverRoutingKey}.`,
  );
  await amqpChannel.bindQueue({
    queue: controlQueue.queue,
    exchange: ControlExchangeName,
    routingKey: ControlObserverRoutingKey,
  });
  const eventsQueue = await amqpChannel.declareQueue({
    queue: EvmEventsQueueName,
  });
  logger.debug(
    `Declared AMQP events queue: ${eventsQueue.queue}  consumers: ${eventsQueue.consumerCount}  message count: ${eventsQueue.messageCount}.`,
  );
  const recoverUntil = await client.getBlockNumber();
  let [unwatch, sources] = await createWatch();
  await amqpChannel.consume(
    { queue: controlQueue.queue },
    async (_args, _props, data) => {
      const message = deserializeControlMessage(data);
      logger.debug(
        `Received message from control queue, action: ${message.action}.`,
      );
      if (
        message.action === "reload"
      ) {
        logger.info(
          "Received reload control message, reloading configuration.",
        );
        unwatch();
        [unwatch] = await createWatch();
      }
    },
  );

  if (Object.keys(sources).length > 0) {
    const lastRecoveredString = (await prisma.sharedState.findUnique({
      where: { key: LastRecoveredSharedStateKey },
      select: { value: true },
    }))?.value;
    if (lastRecoveredString != undefined) {
      const lastRecovered = BigInt(lastRecoveredString);
      const lastSeen = (await prisma.event.findFirst({
        orderBy: { blockNumber: "desc" },
        select: { blockNumber: true },
      }))?.blockNumber;
      const recoverFrom = (lastSeen == undefined || lastRecovered > lastSeen
        ? lastRecovered
        : BigInt(lastSeen)) + 1n;
      if (recoverFrom <= recoverUntil) {
        logger.info(
          `Recovering events between blocks ${recoverFrom} and ${recoverUntil}.`,
        );
        await processLogs(
          await client.getLogs({
            address: Object.keys(sources) as `0x${string}`[],
            fromBlock: recoverFrom,
            toBlock: recoverUntil,
          }),
        );
        logger.info(
          `Done recovering events.`,
        );
      } else {
        logger.info(
          "Already recovered to the block tip, not recovering.",
        );
      }
    } else {
      logger.info(
        "Last recovered block number does not exist in DB, not recovering.",
      );
    }
  } else {
    logger.info(
      "No event sources available, not recovering.",
    );
  }

  await prisma.sharedState.upsert({
    where: { key: LastRecoveredSharedStateKey },
    create: {
      key: LastRecoveredSharedStateKey,
      value: recoverUntil.toString(),
    },
    update: { value: recoverUntil.toString() },
  });

  const abortController = new AbortController();
  const runningPromise = block(abortController.signal);

  async function cleanup() {
    logger.warning("Stopping observer.");
    abortController.abort();
    unwatch();
    await runningPromise;
  }

  return { runningPromise, cleanup };

  // TODO: customizable poll interval and transport
  async function createWatch(): Promise<
    [WatchEventReturnType, Record<string, string[]>]
  > {
    const sources = (await prisma.eventSource.findMany()).reduce(
      (acc, item) => {
        const address = toHex(item.address as unknown as Uint8Array);
        const entry = toHex(item.abiHash);
        if (acc[address] === undefined) acc = { ...acc, [address]: [entry] };
        else acc[address].push(entry);
        return acc;
      },
      {} as Record<string, string[]>,
    );
    logger.info(() =>
      Object.keys(sources).length > 0
        ? `Watching ${
          Object.entries(sources).map(([address, sigHash]) =>
            `address: ${address}  event signature hashes: ${sigHash.join(", ")}`
          ).join(",  ")
        }.`
        : "No event sources to watch."
    );
    return [
      client.watchEvent({
        address: Object.keys(sources) as `0x${string}`[],
        onLogs: processLogs,
      }),
      sources,
    ];
  }

  function logProcessError(message: string, log: Log) {
    logger.error(
      `Error encountered while processing log: ${message}, address: ${log.address}  topics: ${
        topicsToString(log.topics)
      }  data: ${log.data}.`,
    );
  }

  function topicsToString(topics: [`0x${string}`, ...`0x${string}`[]] | []) {
    return topics.map((topic, i) => `[${i}] ${topic}`).join(" ");
  }

  async function processLogs(logs: Log[]) {
    return await Promise.all(
      logs.map((log) => {
        if (
          sources[log.address] === undefined ||
          log.topics[0] === undefined ||
          !sources[log.address].includes(log.topics[0])
        ) return undefined;
        return (async () => {
          if (log.blockNumber == null) {
            logProcessError("blockNumber is null", log);
            return;
          }
          if (log.transactionIndex == null) {
            logProcessError("txIndex is null", log);
            return;
          }
          if (log.logIndex == null) {
            logProcessError("logIndex is null", log);
            return;
          }
          if (log.blockHash == null) {
            logProcessError("blockHash is null", log);
            return;
          }
          if (log.transactionHash == null) {
            logProcessError("txHash is null", log);
            return;
          }

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
            logger.debug(
              `Wrote event to DB, blockNumber-txIndex-logIndex: ${log.blockNumber}-${log.transactionIndex}-${log.logIndex}.`,
            );

            logger.info(
              `Publishing event, blockNumber-txIndex-logIndex: ${log.blockNumber}-${log.transactionIndex}-${log.logIndex}.`,
            );
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
              logger.debug(() =>
                `Ignoring event already present in DB, blockNumber-txIndex-logIndex: ${log.blockNumber}-${log.transactionIndex}-${log.logIndex}  topics: ${
                  topicsToString(log.topics)
                }  data: ${log.data}`
              );
              return;
            }
            logger.error(`Unexpected error: ${e}`);
          }
        })();
      }).filter((onLog) => onLog !== undefined) as Promise<
        void
      >[] satisfies Promise<void>[],
    );
  }
}

if (import.meta.main) {
  setupLog({
    handlers: {
      console: new ConsoleHandler(getLoggingLevel(), {
        formatter: defaultLogFormatter,
      }),
    },

    loggers: {
      ...getInternalLoggers({
        level: getLoggingLevel(),
        handlers: ["console"],
      }),
      [ObserverLoggerName]: {
        level: getLoggingLevel(),
        handlers: ["console"],
      },
    },
  });
  await runWithChainDefinition((chain) => ({
    runningPromise: runWithPrisma((prisma) => ({
      runningPromise: runWithAmqp((amqpConnection) =>
        observer(chain, prisma, amqpConnection)
      ),
    })),
  }));
}
