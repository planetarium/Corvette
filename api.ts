import { Status } from "https://deno.land/std@0.188.0/http/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import {
  Application as OakApplication,
  isHttpError,
  Router,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { Buffer } from "node:buffer";
import { stringify as losslessJsonStringify } from "npm:lossless-json";
import { getAddress, toBytes, toHex, keccak256 } from "npm:viem";
import type { PrismaClient } from "./prisma-shim.ts";
import { formatAbiItemPrototype } from "./abitype.ts";
import { ApiUrlEnvKey } from "./constants.ts";
import { combinedEnv, runWithPrisma } from "./runHelpers.ts";
import { serializeEventResponse } from "./responseUtil.ts";
import { validateEventRequest } from "./apiSchema.ts";

export function api(prisma: PrismaClient) {
  const abortController = new AbortController();

  const router = new Router();

  router.get("/", (ctx) => {
    // TODO: show JSON Schema
    ctx.response.body = "Not yet implemented";
    ctx.response.status = Status.NotImplemented;
  });
  router.post("/", async (ctx) => {
    const request = await ctx.request.body({ type: "json" }).value;

    if (!validateEventRequest(request)) {
      ctx.response.status = Status.BadRequest;
      ctx.response.body = validateEventRequest.errors;
      return;
    }

    ctx.response.body = losslessJsonStringify((await prisma.event.findMany({
      where: {
        blockHash: request.blockHash && Buffer.from(toBytes(request.blockHash)),
        blockNumber: request.blockIndex ?? { gte: request.blockFrom, lte: request.blockTo },
        logIndex: request.logIndex,
        txIndex: request.transactionIndex,
        txHash: request.transactionHash &&
          Buffer.from(toBytes(request.transactionHash)),
        sourceAddress: request.sourceAddress &&
          Buffer.from(toBytes(request.sourceAddress)),
        abiHash: (request.abiHash && Buffer.from(toBytes(request.abiHash))) ||
          (request.abiSignature &&
            Buffer.from(
              keccak256(
                new TextEncoder().encode(request.abiSignature),
                "bytes",
              ),
            )),
        blockTimestamp: { gte: request.after, lte: request.before },
      },
      include: { Abi: true },
    })).map((event) => serializeEventResponse(event)));
  });

  router.get("/sources", (ctx) => {
    // TODO: show JSON Schema
    ctx.response.body = "Not yet implemented";
    ctx.response.status = Status.NotImplemented;
  });
  router.post("/sources", async (ctx) => {
    // TODO: parameters
    ctx.response.body = (
      await prisma.eventSource.findMany({
        include: { Abi: true },
      })
    ).map((item) => ({
      address: getAddress(toHex(item.address)),
      abi: formatAbiItemPrototype(JSON.parse(item.Abi.json)),
      abiHash: toHex(item.abiHash),
    }));
  });

  router.get("/abi", (ctx) => {
    // TODO: show JSON Schema
    ctx.response.body = "Not yet implemented";
    ctx.response.status = Status.NotImplemented;
  });
  router.post("/abi", async (ctx) => {
    // TODO: parameters
    ctx.response.body = (await prisma.eventAbi.findMany()).reduce(
      (acc, item) => {
        const abi = JSON.parse(item.json);
        Object.assign(acc, {
          [toHex(item.hash)]: {
            signature: formatAbiItemPrototype(abi),
            abi: abi,
          },
        });
        return acc;
      },
      {},
    );
  });

  router.post("/webhook", async (ctx) => {
    // TODO: parameters
    ctx.response.body = (await prisma.emitDestination.findMany())
      .map((item) => ({
        id: item.id,
        sourceAddress: getAddress(toHex(item.sourceAddress)),
        abiHash: toHex(item.abiHash),
        webhookUrl: item.webhookUrl,
        topic1: item.topic1 ? toHex(item.topic1) : undefined,
        topic2: item.topic2 ? toHex(item.topic2) : undefined,
        topic3: item.topic3 ? toHex(item.topic3) : undefined,
      }));
  });

  const app = new OakApplication();
  app.use(async (context, next) => {
    try {
      await next();
    } catch (err) {
      console.error(err);
      if (isHttpError(err)) {
        context.response.status = err.status;
      } else {
        context.response.status = 500;
      }
      context.response.body = { error: err.message };
      context.response.type = "json";
    }
  });
  app.use(oakCors());
  app.use(router.routes());
  app.use(router.allowedMethods());

  const listenUrl = new URL(combinedEnv[ApiUrlEnvKey]);
  const runningPromise = app.listen({
    port: Number(listenUrl.port) || 80,
    hostname: listenUrl.hostname,
    signal: abortController.signal,
  });

  async function cleanup() {
    abortController.abort();
    return await runningPromise;
  }

  return { runningPromise, cleanup };
}

if (import.meta.main) {
  runWithPrisma((prisma) => api(prisma));
}
