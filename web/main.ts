/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import { start } from "fresh/server.ts";
import manifest from "./fresh.gen.ts";

import twindPlugin from "fresh/plugins/twind.ts";
import twindConfig from "./twind.config.ts";

import {
  ControlExchangeName,
  EvmEventsQueueName,
  WebUISessionAppKey,
  WebUIUrlEnvKey,
} from "../constants.ts";
import { combinedEnv, runWithAmqp, runWithPrisma } from "../runHelpers.ts";
import type { PrismaClient } from "../prisma-shim.ts";
import type {
  AmqpChannel,
  AmqpConnection,
} from "https://deno.land/x/amqp@v0.23.1/mod.ts";

// Used for fresh-session cookie store JWT encryption key
Deno.env.set("APP_KEY", combinedEnv[WebUISessionAppKey] ?? crypto.randomUUID());

const listenUrl = new URL(combinedEnv[WebUIUrlEnvKey]);

export let prisma: PrismaClient;
export let amqpChannel: AmqpChannel;

const initAmqpChannel = async (amqpConnection: AmqpConnection) => {
  amqpChannel = await amqpConnection.openChannel();
  await amqpChannel.declareQueue({ queue: EvmEventsQueueName });
  await amqpChannel.declareExchange({ exchange: ControlExchangeName });
};

runWithPrisma((_prisma) => ({
  runningPromise: runWithAmqp(async (_amqpConnection) => {
    prisma = _prisma;
    await initAmqpChannel(_amqpConnection);

    const abortController = new AbortController();

    const runningPromise = start(manifest, {
      hostname: listenUrl.hostname,
      port: Number(listenUrl.port) || 80,
      plugins: [twindPlugin(twindConfig)],
      signal: abortController.signal,
    });

    const cleanup = () => {
      abortController.abort();
      return runningPromise;
    };

    return { runningPromise, cleanup };
  }),
}));
