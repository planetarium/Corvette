import {
  type AmqpConnection,
  type AmqpConnectOptions,
  connect as connectAmqp,
} from "amqp/mod.ts";
import { parseOptions } from "amqp/src/amqp_connect_options.ts";

import type { Chain } from "npm:viem";

import type Prisma from "../prisma-shim.ts";
import { PrismaClient } from "../prisma-shim.ts";

import { Awaitable } from "./concurrencyUtils.ts";
import {
  AmqpBrokerUrlEnvKey,
  ChainDefinitionUrlEnvKey,
  combinedEnv,
  DatabaseUrlEnvKey,
} from "./envUtils.ts";
import { importESOrJson } from "./moduleUtils.ts";

export type CleanupFunction = () => Awaitable<void>;

type Runnable = {
  runningPromise: Awaitable<unknown>;
  cleanup?: CleanupFunction;
};

export async function block(signal?: AbortSignal) {
  let intervalHandle: number;
  if (signal) signal.onabort = () => clearInterval(intervalHandle);
  return await new Promise((resolve) => {
    intervalHandle = setInterval(resolve, 0x7fffffff);
  });
}

export async function runAndCleanup(func: () => Awaitable<Runnable>) {
  let cleanup: CleanupFunction | undefined;
  try {
    const { runningPromise, cleanup: abort } = await func();
    cleanup = abort;
    await runningPromise;
  } finally {
    if (cleanup) await cleanup();
  }
}

export async function runWithPrisma(
  func: (prisma: PrismaClient) => Awaitable<Runnable>,
  optionsArg?: Prisma.PrismaClientOptions,
) {
  optionsArg = optionsArg || {};
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: combinedEnv[DatabaseUrlEnvKey],
      },
    },
    ...optionsArg,
  });
  try {
    await runAndCleanup(() => func(prisma));
  } finally {
    await prisma.$disconnect();
  }
}

export async function runWithAmqp(
  func: (amqpConnection: AmqpConnection) => Awaitable<Runnable>,
): Promise<void>;
export async function runWithAmqp(
  func: (amqpConnection: AmqpConnection) => Awaitable<Runnable>,
  options?: AmqpConnectOptions,
): Promise<void>;
export async function runWithAmqp(
  func: (amqpConnection: AmqpConnection) => Awaitable<Runnable>,
  uri?: string,
): Promise<void>;
export async function runWithAmqp(
  func: (amqpConnection: AmqpConnection) => Awaitable<Runnable>,
  optionsOrUrl?: AmqpConnectOptions | string,
): Promise<void> {
  const defaultOptions = parseOptions(combinedEnv[AmqpBrokerUrlEnvKey]);
  const options = optionsOrUrl === undefined
    ? defaultOptions
    : typeof optionsOrUrl === "string"
    ? parseOptions(optionsOrUrl)
    : parseOptions({ ...defaultOptions, ...optionsOrUrl });
  const amqpConnection = await connectAmqp(options);
  try {
    await runAndCleanup(() => func(amqpConnection));
  } finally {
    await amqpConnection.close();
  }
}

export async function runWithChainDefinition(
  func: (chain: Chain) => Awaitable<Runnable>,
) {
  const chain = await importESOrJson(combinedEnv[ChainDefinitionUrlEnvKey]);
  await runAndCleanup(() => func(chain));
}
