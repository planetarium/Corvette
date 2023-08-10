import { format as formatDate } from "std/datetime/mod.ts";
import { ConsoleHandler } from "std/log/handlers.ts";
import { getLogger, setup as setupLog } from "std/log/mod.ts";

import type { AmqpConnection } from "amqp/mod.ts";
import type { AbiEvent } from "abitype";

import { Buffer } from "node:buffer";
import {
  type Chain,
  createPublicClient,
  http as httpViemTransport,
  InvalidParamsRpcError,
  type Log as LogGeneric,
  toBytes,
  toHex,
} from "npm:viem";

import Prisma, { type PrismaClient } from "./prisma-shim.ts";

import { deserializeControlMessage } from "./ControlMessage.ts";
import { EventMessage, serializeEventMessage } from "./EventMessage.ts";
import {
  ControlExchangeName,
  ControlObserverRoutingKey,
  EvmEventsQueueName,
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
import { BlockFinalityEnvKey, combinedEnv } from "./envUtils.ts";

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
  const finalizationQueue: EventMessage[] = [];
  let unwatchEvent = await createWatchEvent();
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
        unwatchEvent();
        unwatchEvent = await createWatchEvent();
      }
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
  logger.info(`Block finality is ${blockFinality}.`);
  if (blockFinality === undefined) {
    const message =
      `${BlockFinalityEnvKey} environment may only take either an integer or string "safe" or "finalized" as the value.`;
    logger.critical(`Irrecoverable error: ${message}`);
    throw new Error(message);
  }
  if (typeof (blockFinality) === "string") {
    try {
      await client.getBlock({ blockTag: blockFinality });
    } catch (e) {
      if (e instanceof InvalidParamsRpcError) {
        const message =
          `The given RPC node does not support the blockTag '${blockFinality}'.`;
        logger.critical(`Irrecoverable error: ${message}`);
        throw new Error(message);
      }
      throw e;
    }
  }

  // TODO: customizable poll interval and transport
  if (typeof (blockFinality) === "bigint") {
    logger.info(
      "Block finality is an offset, using eth_blockNumber to watch latest blocks.",
    );
  } else {
    logger.info(
      "Block finality is a blockTag, using eth_getBlockByNumber to watch latest blocks.",
    );
  }
  const unwatchBlockNumber = typeof (blockFinality) === "bigint"
    ? client.watchBlockNumber({
      onBlockNumber: (blockNumber) =>
        blockFinalized(blockNumber - blockFinality),
    })
    : client.watchBlocks({
      blockTag: blockFinality,
      onBlock: (block) => blockFinalized(block.number!),
    });

  const abortController = new AbortController();
  const runningPromise = block(abortController.signal);

  async function cleanup() {
    logger.warning("Stopping observer.");
    abortController.abort();
    unwatchEvent();
    unwatchBlockNumber();
    await runningPromise;
  }

  return { runningPromise, cleanup };

  // TODO: customizable poll interval and transport
  async function createWatchEvent() {
    const { sources, abis } = (await prisma.eventSource.findMany({
      select: { abiHash: true, address: true, Abi: { select: { json: true } } },
    })).reduce(
      ({ sources, abis }, item) => {
        const address = toHex(item.address as unknown as Uint8Array);
        const entry = toHex(item.abiHash);
        if (sources[address] === undefined) {
          sources = { ...sources, [address]: [entry] };
        } else sources[address].push(entry);
        return { sources, abis: { ...abis, [entry]: item.Abi.json } };
      },
      { sources: {}, abis: {} } as {
        sources: Record<string, string[]>;
        abis: Record<string, string>;
      },
    );
    logger.info(() =>
      Object.keys(sources).length > 0
        ? `Watching ${
          Object.entries(sources).map((entry) =>
            `address: ${entry[0]}  event signature hashes: ${
              entry[1].join(", ")
            }`
          ).join(",  ")
        }.`
        : "No event sources to watch."
    );
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

    async function processLog(log: Log) {
      if (log.blockNumber == null) {
        logProcessError("blockNumber is null", log);
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

      const addressBytes = toBytes(log.address);
      const topicsBytes = log.topics.map(toBytes).map(Buffer.from);
      const [abiHash, topic1, topic2, topic3] = topicsBytes;
      const dataBytes = toBytes(log.data);
      const timestamp =
        (await client.getBlock({ blockHash: log.blockHash! })).timestamp;
      const timestampDate = new Date(Number(timestamp) * 1000);
      const blockHashBytes = toBytes(log.blockHash);
      const txHashBytes = toBytes(log.transactionHash);

      try {
        await prisma.event.create({
          data: {
            sourceAddress: Buffer.from(addressBytes),
            abiHash,
            topic1,
            topic2,
            topic3,
            data: Buffer.from(dataBytes),
            blockTimestamp: timestampDate,
            logIndex: log.logIndex,
            blockNumber: Number(log.blockNumber),
            blockHash: Buffer.from(blockHashBytes),
            txHash: Buffer.from(txHashBytes),
          },
        });
        logger.debug(
          `Wrote event to DB, blockNumber: ${log.blockNumber}  logIndex: ${log.logIndex}  blockTimestamp: ${
            formatDate(timestampDate, "yyyy-MM-dd HH:mm:ss")
          }.`,
        );

        logger.info(
          `Queueing event for finalization, blockNumber: ${log.blockNumber}  logIndex: ${log.logIndex}  blockTimestamp: ${
            formatDate(timestampDate, "yyyy-MM-dd HH:mm:ss")
          }.`,
        );
        finalizationQueue.push({
          address: addressBytes,
          sigHash: abiHash,
          abi: abis[toHex(abiHash)],
          topics: topicsBytes,
          data: dataBytes,
          blockTimestamp: timestamp,
          logIndex: BigInt(log.logIndex),
          blockNumber: log.blockNumber,
          blockHash: blockHashBytes,
          txHash: txHashBytes,
        });
      } catch (e) {
        // ignore if the entry for the observed event exists in db (other observer already inserted)
        if (
          (e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002")
        ) {
          logger.debug(() =>
            `Ignoring event already present in DB, blockNumber: ${log.blockNumber}  logIndex: ${log.logIndex}  blockHash: ${log.blockHash}  topics: ${
              topicsToString(log.topics)
            }  data: ${log.data}`
          );
          return;
        }
        logger.error(`Unexpected error: ${e}`);
      }
    }
  }

  async function blockFinalized(blockNumber: bigint) {
    const consumeQueue = [];
    while (finalizationQueue.length > 0) {
      consumeQueue.push(finalizationQueue.shift()!);
    }
    const { observed, returnToQueue } = consumeQueue.reduce(
      ({ observed, returnToQueue }, x) =>
        x.blockNumber <= blockNumber
          ? { observed: [...observed, x], returnToQueue }
          : { observed, returnToQueue: [...returnToQueue, x] },
      { observed: [], returnToQueue: [] } as {
        observed: typeof finalizationQueue;
        returnToQueue: typeof finalizationQueue;
      },
    );
    while (returnToQueue.length > 0) {
      finalizationQueue.push(returnToQueue.shift()!);
    }
    if (observed.length <= 0) {
      logger.debug(
        `New finalized block at ${blockNumber}, but no events waiting in queue to be finalized.`,
      );
      return;
    }
    logger.debug(() =>
      `Events to be finalized at ${blockNumber}  blockNumber-logIndex: ${
        observed.map((evt) =>
          `${evt.blockNumber}-${evt.logIndex} (${
            formatDate(
              new Date(Number(evt.blockTimestamp) * 1000),
              "yyyy-MM-dd HH:mm:ss",
            )
          })`
        ).join(", ")
      }.`
    );
    const { finalized, ommer } = await observed.reduce(
      async (acc, x) => {
        const { finalized, ommer, finalizedBlock } = await acc;

        return finalizedBlock[String(x.blockNumber)] ??
            (finalizedBlock[String(x.blockNumber)] =
                (await client.getBlock({ blockNumber: x.blockNumber }))
                  .hash!) ===
              toHex(x.blockHash)
          ? { finalized: [...finalized, x], ommer, finalizedBlock }
          : { finalized, ommer: [...ommer, x], finalizedBlock };
      },
      Promise.resolve(
        { finalized: [], ommer: [], finalizedBlock: {} } as {
          finalized: typeof observed;
          ommer: typeof observed;
          finalizedBlock: Record<string, string>;
        },
      ),
    );
    logger.debug(() =>
      finalized.length > 0
        ? `Finalized events at ${blockNumber}  blockNumber-logIndex: ${
          finalized.map((evt) => `${evt.blockNumber}-${evt.logIndex}`)
            .join(", ")
        }.`
        : `No finalized block at ${blockNumber}`
    );

    await Promise.all(
      finalized.map((x) => {
        logger.info(
          `Publishing event finalized at ${blockNumber} to emitter queue:  blockNumber: ${x.blockNumber}  logIndex: ${x.logIndex}.`,
        );
        amqpChannel.publish(
          { routingKey: EvmEventsQueueName },
          { contentType: "application/octet-stream" },
          serializeEventMessage(x),
        );
      }),
    );

    logger.info(() =>
      ommer.length > 0
        ? `Removing ommered events from DB at block ${blockNumber}  ${
          ommer.map((evt) =>
            `blockNumber: ${evt.blockNumber}  logIndex: ${evt.logIndex}  blockHash: ${
              toHex(evt.blockHash)
            }`
          )
            .join(",  ")
        }.`
        : `No ommered block at ${blockNumber}.`
    );
    await Promise.all(ommer.map((x) =>
      prisma.event.delete({
        where: {
          blockTimestamp_logIndex: {
            blockTimestamp: new Date(
              Number(x.blockTimestamp) * 1000,
            ),
            logIndex: Number(x.logIndex),
          },
        },
      })
    ));
    logger.debug(() =>
      finalizationQueue.length > 0
        ? `Yet to be finalized, blockNumber-logIndex: ${
          finalizationQueue.map((evt) =>
            `${evt.blockNumber}-${evt.logIndex} (${
              formatDate(
                new Date(Number(evt.blockTimestamp) * 1000),
                "yyyy-MM-dd HH:mm:ss",
              )
            })`
          )
            .join(", ")
        }.`
        : "No events left in finalization queue."
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
