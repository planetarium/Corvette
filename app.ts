import { parse } from "https://deno.land/std@0.194.0/flags/mod.ts";
import * as path from "https://deno.land/std@0.194.0/path/mod.ts";

import { broker } from "https://deno.land/x/lop@0.0.0-alpha.2/mod.ts";

import { parseOptions } from "https://deno.land/x/amqp@v0.23.1/src/amqp_connect_options.ts";

import { api } from "./api.ts";
import { dataproxy, generateDataproxy } from "./dataproxy.ts";
import { emitter } from "./emitter.ts";
import { AmqpBrokerUrlEnvKey, combinedEnv } from "./envUtils.ts";
import { observer } from "./observer.ts";
import {
  block,
  runWithAmqp,
  runWithChainDefinition,
  runWithPrisma,
} from "./runHelpers.ts";
import { testWebhookReceiver } from "./testWebhookReceiver.ts";
import { getSchemaPath, shouldUseDataproxy } from "./prismaSchemaUtils.ts";

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
  let useDataproxy: boolean;
  try {
    useDataproxy = await shouldUseDataproxy();
  } catch (e) {
    console.error(`Could not load ${getSchemaPath({ useParams: true })}`);
    throw e;
  }
  if (useDataproxy) await generateDataproxy();

  const amqpOptions = parseOptions(combinedEnv[AmqpBrokerUrlEnvKey]);
  const abortBroker = broker({
    hostname: amqpOptions.hostname,
    port: amqpOptions.port,
  });
  let cleanupDataProxy: (() => Promise<void>) | undefined;
  if (useDataproxy) ({ cleanup: cleanupDataProxy } = await dataproxy());
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
    if (cleanupDataProxy !== undefined) await cleanupDataProxy();
    abortBroker();
  }
}

if (import.meta.main) {
  const params = parse(Deno.args, { boolean: ["main"] });
  if (params.main) await main();
  else prepareAndMain();
}
