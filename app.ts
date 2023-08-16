import { parse } from "std/flags/mod.ts";
import * as path from "std/path/mod.ts";
import { ConsoleHandler } from "std/log/handlers.ts";
import { getLogger, setup as setupLog } from "std/log/mod.ts";

import { parseOptions } from "amqp/src/amqp_connect_options.ts";

import { broker } from "https://deno.land/x/lop@0.0.0-alpha.2/mod.ts";

import { api } from "./api.ts";
import { dataproxy, generateDataproxy } from "./dataproxy.ts";
import { emitter } from "./emitter.ts";
import { AmqpBrokerUrlEnvKey, combinedEnv } from "./envUtils.ts";
import {
  ApiLoggerName,
  DataproxyLoggerName,
  defaultLogFormatter,
  DevLoggerName,
  EmitterLoggerName,
  getInternalLoggers,
  ObserverLoggerName,
  TestWebhookReceiverLoggerName,
  WebLoggerName,
} from "./logUtils.ts";
import { observer } from "./observer.ts";
import { getSchemaPath, shouldUseDataproxy } from "./prismaSchemaUtils.ts";
import {
  block,
  type CleanupFunction,
  runWithAmqp,
  runWithChainDefinition,
  runWithPrisma,
} from "./runHelpers.ts";
import { testWebhookReceiver } from "./testWebhookReceiver.ts";

async function prepareAndMain() {
  await new Deno.Command("deno", {
    args: ["task", "prisma-generate"],
    stdout: "inherit",
    stderr: "inherit",
  }).spawn().status;
  await new Deno.Command("deno", {
    args: [
      "run",
      ...(
        await shouldUseDataproxy()
          ? ["--unsafely-ignore-certificate-errors=localhost"]
          : []
      ),
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-run",
      "--allow-net",
      "--allow-ffi",
      path.fromFileUrl(import.meta.url),
      "--main",
    ],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    cwd: Deno.cwd(),
    uid: Deno.uid() !== null ? Deno.uid()! : undefined,
    gid: Deno.gid() !== null ? Deno.gid()! : undefined,
  }).spawn().status;
}

async function main() {
  setupLog({
    handlers: {
      console: new ConsoleHandler("DEBUG", {
        formatter: defaultLogFormatter,
      }),
    },

    loggers: {
      ...getInternalLoggers({ level: "DEBUG", handlers: ["console"] }),
      [DevLoggerName]: {
        level: "DEBUG",
        handlers: ["console"],
      },
      [ObserverLoggerName]: {
        level: "DEBUG",
        handlers: ["console"],
      },
      [EmitterLoggerName]: {
        level: "DEBUG",
        handlers: ["console"],
      },
      [ApiLoggerName]: {
        level: "DEBUG",
        handlers: ["console"],
      },
      [WebLoggerName]: {
        level: "DEBUG",
        handlers: ["console"],
      },
      [DataproxyLoggerName]: {
        level: "DEBUG",
        handlers: ["console"],
      },
      [TestWebhookReceiverLoggerName]: {
        level: "INFO",
        handlers: ["console"],
      },
      lop: {
        level: "INFO",
        handlers: ["console"],
      },
    },
  });

  const logger = getLogger(DevLoggerName);

  let useDataproxy: boolean;
  try {
    useDataproxy = await shouldUseDataproxy();
  } catch (e) {
    logger.critical(
      `Irrecoverable error, could not load ${
        getSchemaPath({ useParams: true })
      }.`,
    );
    throw e;
  }
  if (useDataproxy) {
    logger.warning(
      "Using data proxy, as sqlite is being used for the database.",
    );
    await generateDataproxy();
  }

  logger.debug(
    `Serving AMQP Broker, URL: ${combinedEnv[AmqpBrokerUrlEnvKey]}.`,
  );
  const amqpOptions = parseOptions(combinedEnv[AmqpBrokerUrlEnvKey]);
  const abortBroker = broker({
    hostname: amqpOptions.hostname,
    port: amqpOptions.port,
  });
  let cleanupDataProxy: CleanupFunction | undefined;
  if (useDataproxy) ({ cleanup: cleanupDataProxy } = await dataproxy());
  try {
    await runWithChainDefinition((chain) => ({
      runningPromise: runWithPrisma(async (prisma) => {
        const runningPromise = runWithAmqp(async (amqpConnection) => {
          const { cleanup: cleanupObserver } = await observer(
            chain,
            prisma,
            amqpConnection,
          );
          const { cleanup: cleanupEmitter } = await emitter(
            chain,
            prisma,
            amqpConnection,
          );
          const { cleanup: cleanupApi } = await api(prisma);
          return {
            runningPromise: block(),
            cleanup: async () => {
              await cleanupApi();
              await cleanupEmitter();
              await cleanupObserver();
            },
          };
        });
        const { cleanup: cleanupTestWebhookReceiver } =
          await testWebhookReceiver();

        return {
          runningPromise,
          cleanup: async () => {
            await cleanupTestWebhookReceiver();
          },
        };
      }),
    }));
  } finally {
    if (cleanupDataProxy !== undefined) await cleanupDataProxy();
    abortBroker();
  }
}

if (import.meta.main) {
  const params = parse(Deno.args, { boolean: ["main"] });
  if (params.main) await main();
  else prepareAndMain();
}
