import { load } from "https://deno.land/std@0.194.0/dotenv/mod.ts";

import {
  AmqpConnection,
  AmqpConnectOptions,
  connect as connectAmqp,
} from "https://deno.land/x/amqp@v0.23.1/mod.ts";

import { parseOptions } from "https://deno.land/x/amqp@v0.23.1/src/amqp_connect_options.ts";

import { Chain } from "npm:viem";

import { type Prisma, PrismaClient } from "./prisma-shim.ts";

import {
  AmqpBrokerUrlEnvKey,
  ChainDefinitionUrlEnvKey,
  DatabaseUrlEnvKey,
} from "./constants.ts";
import { importESOrJson } from "./moduleUtils.ts";

type CleanupFunction = () => Promise<void>;

type Runnable = {
  runningPromise: Promise<unknown>;
  cleanup?: CleanupFunction;
};

export const combinedEnv = { ...await load(), ...Deno.env.toObject() };

export async function block(signal?: AbortSignal) {
  let intervalHandle: number;
  if (signal) signal.onabort = () => clearInterval(intervalHandle);
  return await new Promise((resolve) => {
    intervalHandle = setInterval(resolve, 0x7fffffff);
  });
}

export async function runAndCleanup(func: () => Promise<Runnable>) {
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
  func: (prisma: PrismaClient) => Promise<Runnable>,
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
  func: (amqpConnection: AmqpConnection) => Promise<Runnable>,
): Promise<void>;
export async function runWithAmqp(
  func: (amqpConnection: AmqpConnection) => Promise<Runnable>,
  options?: AmqpConnectOptions,
): Promise<void>;
export async function runWithAmqp(
  func: (amqpConnection: AmqpConnection) => Promise<Runnable>,
  uri?: string,
): Promise<void>;
export async function runWithAmqp(
  func: (amqpConnection: AmqpConnection) => Promise<Runnable>,
  optionsOrUrl?: AmqpConnectOptions | string,
): Promise<void> {
  const defaultOptions = parseOptions(combinedEnv[AmqpBrokerUrlEnvKey]);
  const options = optionsOrUrl === undefined
    ? defaultOptions
    : typeof (optionsOrUrl) === "string"
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
  func: (chain: Chain) => Promise<Runnable>,
) {
  const chain = await importESOrJson(combinedEnv[ChainDefinitionUrlEnvKey]);
  await runAndCleanup(() => func(chain));
}
