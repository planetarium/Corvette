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

import { createMutex } from "./concurrencyUtils.ts";
import {
  ControlExchangeName,
  ControlObserverRoutingKey,
  EvmEventsQueueName,
} from "./constants.ts";
import { deserializeControlMessage } from "./ControlMessage.ts";
import { BlockFinalityEnvKey, combinedEnv } from "./envUtils.ts";
import { serializeEventMessage } from "./EventMessage.ts";
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

  // TODO: replace with ReadWriteLockable structure where write lock has priority to ensure proper concurrency for blockFinalized
  const doSourcesMutex = createMutex();
  let { sources, addresses, abis } = await getSources();
  retryFailedBlocks();
  repostExpired();
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
        ({ sources, addresses, abis } = await getSources());
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
  const lastObservedNumber = (await prisma.observedLog.findFirst({
    orderBy: { blockNumber: "desc" },
  }))?.blockNumber;
  const unwatchBlockNumber = typeof (blockFinality) === "bigint"
    ? client.watchBlockNumber({
      emitMissed: true,
      onBlockNumber: (blockNumber) =>
        Promise.all([
          blockFinalized(blockNumber - blockFinality),
          retryFailedBlocks(),
          repostExpired(),
        ]),
      onError: (e) =>
        logger.error(`Error while watching blocks: ${e.stack ?? e.message}`),
    })
    : client.watchBlocks({
      emitMissed: true,
      blockTag: blockFinality,
      onBlock: (block) =>
        Promise.all([
          blockFinalized(block.number!),
          retryFailedBlocks(),
          repostExpired(),
        ]),
      onError: (e) =>
        logger.error(`Error while watching blocks: ${e.stack ?? e.message}`),
    });
  if (lastObservedNumber != undefined) {
    const lastObserved = BigInt(lastObservedNumber);
    const finalized = typeof (blockFinality) === "bigint"
      ? await client.getBlockNumber() - blockFinality
      : (await client.getBlock({ blockTag: blockFinality })).number!;
    if (lastObserved < finalized) {
      logger.info(
        `Recovering missed events, last observed: ${lastObserved}  finalized in chain: ${finalized}.`,
      );
      for (let i = lastObserved + 1n; i <= finalized; i++) blockFinalized(i);
    } else {
      logger.info(
        `Already caught up to finalized block ${finalized}.`,
      );
    }
  }

  const abortController = new AbortController();
  const runningPromise = block(abortController.signal);

  async function cleanup() {
    logger.warning("Stopping observer.");
    abortController.abort();
    unwatchBlockNumber();
    await runningPromise;
  }

  return { runningPromise, cleanup };

  async function getSources() {
    return await doSourcesMutex(async () => {
      const { sources, addresses, abis } = (await prisma.eventSource.findMany({
        select: {
          abiHash: true,
          address: true,
          Abi: { select: { json: true } },
        },
      })).reduce(
        ({ sources, addresses, abis }, item) => {
          const address = toHex(item.address as unknown as Uint8Array);
          const entry = toHex(item.abiHash);
          return {
            sources: {
              ...sources,
              [address]: [...(sources[address] ?? []), entry],
            },
            addresses: addresses.includes(address)
              ? addresses
              : [...addresses, address],
            abis: { ...abis, [entry]: item.Abi.json },
          };
        },
        { sources: {}, addresses: [], abis: {} } as {
          sources: Record<string, string[]>;
          addresses: `0x${string}`[];
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
      return { sources, addresses, abis };
    });
  }

  async function retryFailedBlocks() {
    return Promise.all(
      (await prisma.blockProcessError.findMany()).map((x) =>
        blockFinalized(BigInt(x.blockNumber), true)
      ),
    );
  }

  async function blockFinalized(blockNumber: bigint, retry?: true) {
    return await doSourcesMutex(async () => {
      if (addresses.length <= 0) return;
      try {
        const events = (await client.getLogs({
          address: addresses,
          fromBlock: blockNumber,
          toBlock: blockNumber,
        })).filter((log) =>
          log.topics[0] !== undefined &&
          sources[log.address].includes(log.topics[0])
        );
        logger.debug(() =>
          events.length > 0
            ? `${
              retry ? "Retry f" : "F"
            }inalized events, blockNumber-logIndex: ${
              events.map((evt) => `${blockNumber}-${evt.logIndex}`)
                .join(", ")
            }.`
            : `New finalized block at ${blockNumber}, but no finalized events are present in the block.`
        );

        const errors = (await Promise.all(
          events.sort(() =>
            crypto.getRandomValues(new Uint8Array(1))[0] > 127 ? 1 : -1
          ).map(publishEvent),
        )).filter((x) => x != undefined) as Error[];
        if (errors.length > 0) {
          logger.error(
            `Errors occurred while processing block ${blockNumber}:\n${
              errors.map((e) => e.stack ?? e.message).join("\n")
            }`,
          );
          throw new AggregateError(errors);
        }

        try {
          await prisma.blockProcessError.deleteMany({
            where: { blockNumber: Number(blockNumber) },
          });
          await prisma.observedLog.create({
            data: { blockNumber: Number(blockNumber) },
          });
        } catch (e) {
          if (
            (e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code !== "P2002")
          ) logger.error(`Unexpected error: ${e}`);
        }
      } catch {
        try {
          if (
            retry &&
            (await prisma.blockProcessError.findUnique({
                where: { blockNumber: Number(blockNumber) },
              })) == null
          ) {
            logger.warning(
              `Retry blockNumber ${blockNumber} failed, but other instance succeeded.`,
            );
            return;
          }
          await prisma.blockProcessError.create({
            data: { blockNumber: Number(blockNumber) },
          });
        } catch (e) {
          if (
            (e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code !== "P2002")
          ) logger.error(`Unexpected error: ${e}`);
        }
      }
    });

    async function publishEvent(log: Log): Promise<Error | undefined> {
      if (log.blockNumber == null) {
        return logProcessError("blockNumber is null", log);
      }
      if (log.logIndex == null) {
        return logProcessError("logIndex is null", log);
      }
      if (log.blockHash == null) {
        return logProcessError("blockHash is null", log);
      }
      if (log.transactionHash == null) {
        return logProcessError("txHash is null", log);
      }

      const addressBytes = toBytes(log.address);
      const topicsBytes = log.topics.map(toBytes).map(Buffer.from);
      const [abiHash, topic1, topic2, topic3] = topicsBytes;
      const dataBytes = toBytes(log.data);
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
            logIndex: log.logIndex,
            blockNumber: Number(log.blockNumber),
            blockHash: Buffer.from(blockHashBytes),
            txHash: Buffer.from(txHashBytes),
          },
        });
        logger.debug(
          `Wrote event to DB, blockNumber: ${log.blockNumber}  logIndex: ${log.logIndex}.`,
        );

        logger.info(
          `Publishing finalized event to emitter queue,  blockNumber: ${blockNumber}  logIndex: ${log.logIndex}.`,
        );
        await amqpChannel.publish(
          { routingKey: EvmEventsQueueName },
          { contentType: "application/octet-stream" },
          serializeEventMessage({
            address: addressBytes,
            sigHash: abiHash,
            abi: abis[toHex(abiHash)],
            topics: topicsBytes,
            data: dataBytes,
            logIndex: BigInt(log.logIndex),
            blockNumber: log.blockNumber,
            blockHash: blockHashBytes,
            txHash: txHashBytes,
          }),
        );
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
        return e;
      }
      return;
    }

    function logProcessError(message: string, log: Log) {
      const errorMessage =
        `Error encountered while processing log: ${message}, address: ${log.address}  topics: ${
          topicsToString(log.topics)
        }  data: ${log.data}.`;
      logger.error(errorMessage);
      return new Error(errorMessage);
    }

    function topicsToString(topics: [`0x${string}`, ...`0x${string}`[]] | []) {
      return topics.map((topic, i) => `[${i}] ${topic}`).join(" ");
    }
  }

  async function repostExpired() {
    return Promise.all(
      (await Promise.all(
        (await prisma.event.findMany({
          where: {
            lockedTimestamp: { lt: new Date(new Date().getTime() - 300000) },
          },
        })).map((x) =>
          prisma.event.updateMany({
            where: {
              blockNumber: x.blockNumber,
              logIndex: x.logIndex,
              lockedTimestamp: x.lockedTimestamp,
            },
            data: { lockedTimestamp: null },
          }).then(({ count }) => count > 0 ? x : undefined)
        ),
      )).map((x) => {
        if (x == undefined) return;
        logger.warning(
          `Emit lock expired, re-publishing to emit queue, blockNumber: ${x.blockNumber}  logIndex: ${x.logIndex}`,
        );
        return amqpChannel.publish(
          { routingKey: EvmEventsQueueName },
          { contentType: "application/octet-stream" },
          serializeEventMessage({
            address: x.sourceAddress,
            sigHash: x.abiHash,
            abi: abis[toHex(x.abiHash)],
            topics: [x.topic3, x.topic2, x.topic1].reduce(
              (acc, x) => x != undefined ? [x, ...acc] : [],
              [],
            ),
            data: x.data,
            logIndex: BigInt(x.logIndex),
            blockNumber: BigInt(x.blockNumber),
            blockHash: x.blockHash,
            txHash: x.txHash,
          }),
        );
      }),
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
