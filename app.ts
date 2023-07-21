import { broker } from "https://deno.land/x/lop@0.0.0-alpha.2/mod.ts";

import { api } from "./api.ts";
import { dataproxy, generateDataproxy } from "./dataproxy.ts";
import { emitter } from "./emitter.ts";
import { observer } from "./observer.ts";
import { block, runWithChainDefinition, runWithPrisma } from "./runHelpers.ts";
import { testWebhookReceiver } from "./testWebhookReceiver.ts";

async function main() {
  await new Deno.Command("deno", {
    args: ["task", "prisma-generate"],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  await generateDataproxy();

  const abortBroker = broker();
  const { cleanup: cleanupDataProxy } = await dataproxy();
  try {
    await runWithChainDefinition((chain) =>
      Promise.resolve({
        runningPromise: runWithPrisma(async (prisma) => {
          const { cleanup: cleanupObserver } = await observer(chain, prisma);
          const { cleanup: cleanupEmitter } = await emitter(chain, prisma);
          const { cleanup: cleanupApi } = await api(prisma);
          const { cleanup: cleanupTestWebhookReceiver } =
            await testWebhookReceiver();

          return {
            runningPromise: block(),
            cleanup: async () => {
              await cleanupTestWebhookReceiver();
              await cleanupApi();
              await cleanupEmitter();
              await cleanupObserver();
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
