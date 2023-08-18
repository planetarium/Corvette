import { ConsoleHandler } from "std/log/handlers.ts";
import { getLogger, setup as setupLog } from "std/log/mod.ts";

import { Application as OakApplication } from "oak";

import { parse, stringify as losslessJsonStringify } from "npm:lossless-json";

import {
  defaultLogFormatter,
  TestWebhookReceiverLoggerName,
} from "./logUtils.ts";
import { runAndCleanup } from "./runUtils.ts";

function numberParser(value: string) {
  const n = Number(value);
  if (!Number.isInteger(n) || Number.isSafeInteger(n)) return n;
  return BigInt(value);
}

export async function testWebhookReceiver() {
  const logger = getLogger(TestWebhookReceiverLoggerName);
  const abortController = new AbortController();
  const app = new OakApplication();
  app.use(async (ctx) => {
    logger.info(
      "Received Webhook:",
      losslessJsonStringify(
        parse(
          await ctx.request.body({ type: "text" }).value,
          undefined,
          numberParser,
        ),
        undefined,
        2,
      ),
    );
    ctx.response.body = "";
  });

  const port = 8888;
  logger.info(`Test webhook receiver listening on port ${port}.`);
  const runningPromise = app.listen({
    port,
    signal: abortController.signal,
  });

  async function cleanup() {
    logger.info(`Stopping test webhook receiver.`);
    abortController.abort();
    await runningPromise;
  }

  return await Promise.resolve({ runningPromise, cleanup });
}

if (import.meta.main) {
  setupLog({
    handlers: {
      console: new ConsoleHandler("DEBUG", {
        formatter: defaultLogFormatter,
      }),
    },

    loggers: {
      [TestWebhookReceiverLoggerName]: {
        level: "DEBUG",
        handlers: ["console"],
      },
    },
  });
  await runAndCleanup(testWebhookReceiver);
}
