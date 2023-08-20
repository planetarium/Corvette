/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import { ConsoleHandler } from "std/log/handlers.ts";
import { getLogger, type Logger, setup as setupLog } from "std/log/mod.ts";

import { start } from "fresh/server.ts";
import manifest from "./fresh.gen.ts";

import twindPlugin from "fresh/plugins/twind.ts";
import twindConfig from "./twind.config.ts";

import type { AmqpChannel, AmqpConnection } from "amqp/mod.ts";

import {
  ControlExchangeName,
  EvmEventsQueueName,
} from "~/constants/constants.ts";
import {
  combinedEnv,
  WebUISessionAppKeyEnvKey,
  WebUIUrlEnvKey,
} from "~/utils/envUtils.ts";
import {
  defaultLogFormatter,
  getInternalLoggers,
  getLoggingLevel,
  WebLoggerName,
} from "~/utils/logUtils.ts";
import type { PrismaClient } from "~/prisma/shim.ts";
import { runWithAmqp, runWithPrisma } from "~/utils/runUtils.ts";

// Used for fresh-session cookie store JWT encryption key
Deno.env.set(
  "APP_KEY",
  combinedEnv[WebUISessionAppKeyEnvKey] ?? crypto.randomUUID(),
);

export const listenUrl = new URL(combinedEnv[WebUIUrlEnvKey]);
export let prisma: PrismaClient;
export let amqpChannel: AmqpChannel;
export let logger: Logger;

const initAmqpChannel = async (amqpConnection: AmqpConnection) => {
  logger.debug(`Opening AMQP channel.`);
  amqpChannel = await amqpConnection.openChannel();
  const eventsQueue = await amqpChannel.declareQueue({
    queue: EvmEventsQueueName,
    durable: true,
  });
  logger.debug(
    `Declared AMQP events queue: ${eventsQueue.queue}  consumers: ${eventsQueue.consumerCount}  message count: ${eventsQueue.messageCount}.`,
  );
  logger.debug(`Declaring AMQP control exchange: ${ControlExchangeName}.`);
  await amqpChannel.declareExchange({ exchange: ControlExchangeName });
};

runWithPrisma((_prisma) => ({
  runningPromise: runWithAmqp(async (_amqpConnection) => {
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
        [WebLoggerName]: {
          level: getLoggingLevel(),
          handlers: ["console"],
        },
      },
    });
    logger = getLogger(WebLoggerName);

    prisma = _prisma;
    await initAmqpChannel(_amqpConnection);

    const abortController = new AbortController();

    logger.info(`Web server listening on ${listenUrl}.`);
    const runningPromise = start(manifest, {
      hostname: listenUrl.hostname,
      port: Number(listenUrl.port) || 80,
      plugins: [twindPlugin(twindConfig)],
      signal: abortController.signal,
    });

    const cleanup = () => {
      logger.warning("Stopping web server.");
      abortController.abort();
      return runningPromise;
    };

    return { runningPromise, cleanup };
  }),
}));
