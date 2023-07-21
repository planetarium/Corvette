import { load } from "https://deno.land/std@0.194.0/dotenv/mod.ts";

import { Chain } from "npm:viem";

import type { Prisma } from "./generated/client/deno/index.d.ts";
import { PrismaClient } from "./generated/client/deno/edge.ts";

import { importESOrJson } from "./moduleUtils.ts";

type CleanupFunction = () => Promise<void>;

type Runnable = {
  runningPromise: Promise<unknown>;
  cleanup?: CleanupFunction;
};

export const combinedEnv = { ...(await load()), ...Deno.env.toObject() };

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
        url: combinedEnv["DATABASE_URL"],
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

export async function runWithChainDefinition(
  func: (chain: Chain) => Promise<Runnable>,
) {
  const chain = await importESOrJson(combinedEnv["CHAIN_DEFINITION_URL"]);
  await runAndCleanup(() => func(chain));
}
