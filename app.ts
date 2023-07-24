import { broker } from "https://deno.land/x/lop@0.0.0-alpha.2/mod.ts";

import { parseOptions } from "https://deno.land/x/amqp@v0.23.1/src/amqp_connect_options.ts";

import { api } from "./api.ts";
import { dataproxy, generateDataproxy } from "./dataproxy.ts";
import { emitter } from "./emitter.ts";
import { observer } from "./observer.ts";
import {
  block,
  combinedEnv,
  runWithAmqp,
  runWithChainDefinition,
  runWithPrisma,
} from "./runHelpers.ts";
import { testWebhookReceiver } from "./testWebhookReceiver.ts";

async function main() {
  await new Deno.Command("deno", {
    args: ["task", "prisma-generate"],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  await generateDataproxy();

  const amqpOptions = parseOptions(combinedEnv["AMQP_BROKER_URL"]);
  const abortBroker = broker({
    hostname: amqpOptions.hostname,
    port: amqpOptions.port,
  });
  const { cleanup: cleanupDataProxy } = await dataproxy();
  try {
    await runWithChainDefinition((chain) =>
      Promise.resolve({
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
            const { cleanup: cleanupApi } = await api(prisma, amqpConnection);
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
      })
    );
  } finally {
    await cleanupDataProxy();
    abortBroker();
  }
}

if (import.meta.main) await main();
