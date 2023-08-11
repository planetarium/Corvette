import { ConsoleHandler } from "std/log/handlers.ts";
import { getLogger, setup as setupLog } from "std/log/mod.ts";

import type { AmqpConnection } from "amqp/mod.ts";

import { stringify as losslessJsonStringify } from "npm:lossless-json";
import { type Chain, getAddress, toHex } from "npm:viem";

import type { PrismaClient } from "./prisma-shim.ts";

import { deserializeControlMessage } from "./ControlMessage.ts";
import { deserializeEventMessage, EventMessage } from "./EventMessage.ts";
import {
  ControlEmitterRoutingKey,
  ControlExchangeName,
  EvmEventsQueueName,
} from "./constants.ts";
import {
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
import { createMutex } from "./concurrencyUtils.ts";

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

  const doEmitQueueMutex = createMutex();
  let emitQueue:
    (EventMessage & { retry?: true; lockedTimestamp: Date; url: string[] })[] =
      [];
  let abortWaitController = new AbortController();
  await amqpChannel.consume(
    { queue: EvmEventsQueueName },
    async (args, _, data) => {
      const message = deserializeEventMessage(data);
      const {
        address,
        sigHash,
        topics,
        logIndex,
        blockNumber,
        blockHash,
      } = message;
      if (blockNumber !== -1n) {
        // not webhook test request
        logger.debug(
          `Received event message, blockNumber: ${blockNumber}  logIndex: ${logIndex}  delivery tag: ${args.deliveryTag}.`,
        );
      }
      const destinationUrls = emitDestinations.filter((x) =>
        uint8ArrayEquals(x.sourceAddress as unknown as Uint8Array, address) &&
        uint8ArrayEquals(x.abiHash as unknown as Uint8Array, sigHash) &&
        (x.topic1 == null ||
          (uint8ArrayEquals(x.topic1 as unknown as Uint8Array, topics[1]) &&
            (x.topic2 == null ||
              (uint8ArrayEquals(
                x.topic2 as unknown as Uint8Array,
                topics[2],
              ) &&
                (x.topic3 == null ||
                  uint8ArrayEquals(
                    x.topic3 as unknown as Uint8Array,
                    topics[3],
                  ))))))
      ).map((x) => x.webhookUrl);
      if (blockNumber === -1n) {
        // Webhook Test Request
        const sourceAddress = getAddress(toHex(address));
        const abiHash = toHex(sigHash);
        logger.info(
          `Received webhook test request, address: ${sourceAddress}  event signature hash: ${abiHash}  destinations: ${
            destinationUrls.join(", ")
          }.`,
        );
        await Promise.all(destinationUrls.map((url) =>
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: losslessJsonStringify({
              blockIndex: blockNumber,
              logIndex: logIndex,
              blockHash: toHex(blockHash),
              sourceAddress,
              abiHash,
            }),
          })
        ));
      } else {
        const lockedTimestamp = new Date();
        if (
          (await prisma.event.updateMany({
            where: {
              blockNumber: Number(blockNumber),
              logIndex: Number(logIndex),
              lockedTimestamp: null,
            },
            data: { lockedTimestamp },
          })).count <= 0
        ) {
          logger.error(() =>
            `Message shouldn't be locked, but it is, blockNumber: ${blockNumber}  logIndex: ${logIndex}.`
          );
        } else {
          await doEmitQueueMutex(async () => {
            const doMutex = createMutex();
            logger.info(
              `Queueing event for emit, blockNumber: ${blockNumber}  logIndex: ${logIndex}.`,
            );
            await Promise.all(
              destinationUrls.map(async (url) =>
                await doMutex(() => {
                  let newEvt = true;
                  emitQueue = emitQueue.map((queuedItem) => {
                    if (
                      uint8ArrayEquals(queuedItem.blockHash, blockHash) &&
                      queuedItem.logIndex === logIndex
                    ) {
                      newEvt = false;
                      if (!queuedItem.url.includes(url)) {
                        return {
                          ...queuedItem,
                          url: [...queuedItem.url, url],
                        };
                      }
                    }
                    return queuedItem;
                  });
                  if (newEvt) {
                    emitQueue.push({ ...message, lockedTimestamp, url: [url] });
                  }
                })
              ),
            );

            if (emitQueue.length > 0) abortWaitController.abort();
          });
        }
      }
      logger.debug(
        `Acknowledging AMQP message for event, blockNumber: ${blockNumber}  logIndex: ${logIndex}  delivery tag: ${args.deliveryTag}.`,
      );
      await amqpChannel.ack({ deliveryTag: args.deliveryTag });
    },
  );

  const abortController = new AbortController();
  const runningPromise = emitEvents();

  async function cleanup() {
    logger.warning("Stopping emitter.");
    abortController.abort();
    abortWaitController.abort();
    await runningPromise;
  }

  async function emitEvents() {
    while (true) {
      if (abortController.signal.aborted) return;

      await doEmitQueueMutex(async () => {
        abortWaitController = new AbortController();

        emitQueue = (await Promise.all(
          emitQueue.map(async (x) => {
            const where = {
              blockNumber: Number(x.blockNumber),
              logIndex: Number(x.logIndex),
            };
            const newLockedTimestamp = new Date();
            if (
              (await prisma.event.updateMany({
                where: { ...where, lockedTimestamp: x.lockedTimestamp },
                data: { lockedTimestamp: newLockedTimestamp },
              })).count <= 0
            ) {
              logger.warning(
                `Lock was modified by another party, aborting emit, blockNumber: ${x.blockNumber}  logIndex: ${x.logIndex}.`,
              );
              return undefined;
            }
            const nextRetryUrls = (await Promise.all(x.url.map((url) => {
              logger.info(
                `${
                  x.retry ? "Retry p" : "P"
                }osting event destination: ${url}  blockNumber: ${x.blockNumber}  logIndex: ${x.logIndex}.`,
              );
              return fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: losslessJsonStringify(serializeEventResponse(x)),
              });
            }))).filter((x) => !x.ok).map((x) => x.url);
            if (nextRetryUrls.length <= 0) {
              logger.info(
                `Event post success for all webhook URLs, blockNumber: ${x.blockNumber}  logIndex: ${x.logIndex}.`,
              );

              await prisma.event.updateMany({
                where,
                data: {
                  lockedTimestamp: null,
                  emittedTimestamp: new Date(),
                },
              });
              return undefined;
            } else {
              logger.info(
                `Event post failed for some webhook URLs, will retry on next block index, blockNumber: ${x.blockNumber}  logIndex: ${x.logIndex}  destinations: ${nextRetryUrls}.`,
              );
              return {
                ...x,
                lockedTimestamp: newLockedTimestamp,
                retry: true,
                url: nextRetryUrls,
              };
            }
          }),
        )).filter((x) => x != undefined) as typeof emitQueue;
      });

      // TODO: interval config
      await new Promise<void>((resolve) => {
        abortWaitController.signal.onabort = () => resolve();
        if (abortWaitController.signal.aborted) resolve();
        setTimeout(resolve, 60000);
      });
    }
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
