import { format as formatDate } from "https://deno.land/std@0.196.0/datetime/mod.ts";
import { ConsoleHandler } from "https://deno.land/std@0.196.0/log/handlers.ts";
import {
  getLogger,
  setup as setupLog,
} from "https://deno.land/std@0.196.0/log/mod.ts";

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

import { deserializeControlMessage } from "./ControlMessage.ts";
import { deserializeEventMessage, EventMessage } from "./EventMessage.ts";
import {
  ControlEmitterRoutingKey,
  ControlExchangeName,
  EvmEventsQueueName,
} from "./constants.ts";
import { BlockFinalityEnvKey, combinedEnv } from "./envUtils.ts";
import {
  block,
  runWithAmqp,
  runWithChainDefinition,
  runWithPrisma,
} from "./runHelpers.ts";
import { uint8ArrayEquals } from "./uint8ArrayUtils.ts";
import { serializeEventResponse } from "./EventResponse.ts";
import {
  defaultLogFormatter,
  EmitterLoggerName,
  getInternalLoggers,
  getLoggingLevel,
} from "./logUtils.ts";

export async function emitter(
  chain: Chain,
  prisma: PrismaClient,
  amqpConnection: AmqpConnection,
) {
  const logger = getLogger(EmitterLoggerName);
  logger.info(
    `Emitter starting, chain name: ${chain.name}  id: ${chain.id}  url: ${
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
  logger.debug(`Declared AMQP control queue: ${controlQueue.queue}.`);
  logger.debug(
    `Binding AMQP control queue with exchange: ${ControlExchangeName}  routing key: ${ControlEmitterRoutingKey}.`,
  );
  await amqpChannel.bindQueue({
    queue: controlQueue.queue,
    exchange: ControlExchangeName,
    routingKey: ControlEmitterRoutingKey,
  });
  const eventsQueue = await amqpChannel.declareQueue({
    queue: EvmEventsQueueName,
  });
  logger.debug(
    `Declared AMQP events queue: ${eventsQueue.queue}  consumers: ${eventsQueue.consumerCount}  message count: ${eventsQueue.messageCount}.`,
  );

  async function getEmitDestinations() {
    const emitDestinations = await prisma.emitDestination.findMany();
    logger.info(() =>
      emitDestinations.length > 0
        ? `Loaded emit destinations, ${
          emitDestinations.map((dest) =>
            `address: ${toHex(dest.sourceAddress)}  event signature hash: ${
              toHex(dest.abiHash)
            }  topic filters: ${
              [dest.topic1, dest.topic2, dest.topic3]
                .map((topic, i) => [topic, i + 1])
                .filter(([topic, _]) => topic != null)
                .map(([topic, i]) =>
                  `[${i}] ${toHex(topic)}`
                ).join(" ")
            }  destination: ${dest.webhookUrl}`
          ).join(",  ")
        }.`
        : "No emit destinations to push events."
    );
    return emitDestinations;
  }

  // TODO: rework hierarchical mapping
  let emitDestinations = await getEmitDestinations();
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
        emitDestinations = await getEmitDestinations();
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
        logIndex,
        blockNumber,
        blockHash,
      } = message;
      const timestampDate = new Date(Number(blockTimestamp) * 1000);
      if (blockNumber !== -1n) {
        // not webhook test request
        logger.debug(
          `Received event message, blockNumber: ${blockNumber}  logIndex: ${logIndex}  blockTimestamp: ${
            formatDate(timestampDate, "yyyy-MM-dd HH:mm:ss")
          }  delivery tag: ${args.deliveryTag}.`,
        );
      }
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
          const sourceAddress = getAddress(toHex(address));
          const abiHash = toHex(sigHash);
          logger.info(
            `Received webhook test request, address: ${sourceAddress}  event signature hash: ${abiHash}  destination: ${x.webhookUrl}.`,
          );
          return fetch(x.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: losslessJsonStringify({
              timestamp: blockTimestamp,
              blockIndex: blockNumber,
              logIndex: logIndex,
              blockHash: toHex(blockHash),
              sourceAddress,
              abiHash,
            }),
          });
        }

        logger.info(
          `Queueing event for finalization, blockNumber: ${blockNumber}  logIndex: ${logIndex}  blockTimestamp: ${
            formatDate(timestampDate, "yyyy-MM-dd HH:mm:ss")
          }.`,
        );
        finalizationQueue.push({ ...message, url: x.webhookUrl });
      });
      logger.debug(
        `Acknowledging AMQP message for event, blockNumber: ${blockNumber}  logIndex: ${logIndex}  delivery tag: ${args.deliveryTag}.`,
      );
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
    const finalizedBlocks: Record<string, bigint> = {};
    const finalized = await observed.reduce(async (acc, x) => {
      const hash = (await client.getBlock({ blockNumber: x.blockNumber }))
        .hash;

      const isFinal = toHex(x.blockHash) === hash;
      if (isFinal) finalizedBlocks[hash] = x.blockNumber;
      return isFinal ? [...(await acc), x] : acc;
    }, Promise.resolve([] as typeof observed));
    logger.debug(() =>
      finalized.length > 0
        ? `Finalized events at ${blockNumber}  blockNumber-logIndex: ${
          finalized.map((evt) => `${evt.blockNumber}-${evt.logIndex}`)
            .join(", ")
        }.`
        : `No finalized block at ${blockNumber}`
    );

    await Promise.all(
      finalized.map(async (x) => {
        logger.debug(
          `Retrieving event from DB, blockNumber: ${x.blockNumber}  logIndex: ${x.logIndex}.`,
        );
        const event = await prisma.event.findUnique({
          where: {
            blockTimestamp_logIndex: {
              blockTimestamp: new Date(
                Number(x.blockTimestamp) * 1000,
              ),
              logIndex: Number(x.logIndex),
            },
          },
          include: { Abi: true },
        });

        if (event == null) {
          logger.error(() =>
            `Event does not exist in DB, blockNumber: ${x.blockNumber}  logIndex: ${x.logIndex}  blockHash: ${
              toHex(x.blockHash)
            }  address: ${toHex(x.address)}  event signature hash: ${
              toHex(x.sigHash)
            }  topics: ${
              x.topics.map((topic, i) => [topic, i + 1])
                .filter(([topic, _]) => topic != null)
                .map(([topic, i]) => `[${i}] ${toHex(topic)}`)
                .join(" ")
            }.`
          );
          return;
        }

        logger.info(
          `Posting event finalized at ${blockNumber}  destination: ${x.url}  blockNumber: ${x.blockNumber}  logIndex: ${x.logIndex}.`,
        );
        return fetch(x.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: losslessJsonStringify(serializeEventResponse(event)),
        });
      }),
    );

    const ommer = observed.filter((x) =>
      finalizedBlocks[toHex(x.blockHash)] !== x.blockNumber
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
    ommer.forEach(async (x) =>
      await prisma.event.delete({
        where: {
          blockTimestamp_logIndex: {
            blockTimestamp: new Date(
              Number(x.blockTimestamp) * 1000,
            ),
            logIndex: Number(x.logIndex),
          },
        },
      })
    );

    finalizationQueue = finalizationQueue.filter(
      (x) => x.blockNumber > blockNumber,
    );
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

  const abortController = new AbortController();
  const runningPromise = block(abortController.signal);

  async function cleanup() {
    logger.warning("Stopping emitter.");
    abortController.abort();
    unwatch();
    await runningPromise;
  }

  return { runningPromise, cleanup };
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
      [EmitterLoggerName]: {
        level: getLoggingLevel(),
        handlers: ["console"],
      },
    },
  });
  await runWithChainDefinition((chain) => ({
    runningPromise: runWithPrisma((prisma) => ({
      runningPromise: runWithAmqp((amqpConnection) =>
        emitter(chain, prisma, amqpConnection)
      ),
    })),
  }));
}
