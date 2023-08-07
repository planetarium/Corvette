import { Status } from "https://deno.land/std@0.188.0/http/mod.ts";
import { ConsoleHandler } from "https://deno.land/std@0.196.0/log/handlers.ts";
import {
  getLogger,
  setup as setupLog,
} from "https://deno.land/std@0.196.0/log/mod.ts";

import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import {
  Application as OakApplication,
  Context,
  isHttpError,
  Router,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";

import { Buffer } from "node:buffer";

import { stringify as losslessJsonStringify } from "npm:lossless-json";
import { getAddress, keccak256, toBytes, toHex } from "npm:viem";

import type { PrismaClient } from "./prisma-shim.ts";

import { serializeEventResponse } from "./EventResponse.ts";
import { formatAbiItemPrototype } from "./abitype.ts";
import { validateEventRequest } from "./apiSchema.ts";
import {
  ApiBehindReverseProxyEnvKey,
  ApiUrlEnvKey,
  combinedEnv,
} from "./envUtils.ts";
import {
  ApiLoggerName,
  defaultLogFormatter,
  getInternalLoggers,
  getLoggingLevel,
} from "./logUtils.ts";
import { runWithPrisma } from "./runHelpers.ts";

export function api(prisma: PrismaClient) {
  const logger = getLogger(ApiLoggerName);
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
        blockNumber: request.blockIndex ??
          { gte: request.blockFrom, lte: request.blockTo },
        logIndex: request.logIndex,
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
  app.proxy = combinedEnv[ApiBehindReverseProxyEnvKey] === "true";
  app.use(async (context, next) => {
    function formatResponse(
      ctx: Context<Record<string, unknown>, Record<string, unknown>>,
    ) {
      return `${ctx.response.status} ${ctx.request.method} ${ctx.request.url.pathname} ${ctx.request.ip} ${
        JSON.stringify(ctx.state["requestBody"])
      }: ${
        typeof ctx.response.body === "function"
          ? ctx.response.body()
          : ctx.response.body
      }`;
    }

    try {
      context.state["requestBody"] = await context.request.body({
        type: "json",
      }).value;
      await next();
      logger.info(formatResponse(context));
    } catch (err) {
      if (isHttpError(err)) {
        context.response.status = err.status;
      } else {
        context.response.status = 500;
      }
      context.response.body = { error: err.message };
      context.response.type = "json";
      logger.error(formatResponse(context));
    } finally {
      delete context.state["requestBody"];
    }
  });
  app.use(oakCors());
  app.use(router.routes());
  app.use(router.allowedMethods());

  const listenUrl = new URL(combinedEnv[ApiUrlEnvKey]);
  logger.info(`API server listening on ${listenUrl}.`);
  const runningPromise = app.listen({
    port: Number(listenUrl.port) || 80,
    hostname: listenUrl.hostname,
    signal: abortController.signal,
  });

  async function cleanup() {
    logger.warning("Stopping API server.");
    abortController.abort();
    return await runningPromise;
  }

  return { runningPromise, cleanup };
}

if (import.meta.main) {
  setupLog({
    handlers: {
      console: new ConsoleHandler(getLoggingLevel(), {
        formatter: defaultLogFormatter,
      }),
    },

    loggers: {
      ...getInternalLoggers({
        level: getLoggingLevel(),
        handlers: ["console"],
      }),
      [ApiLoggerName]: {
        level: getLoggingLevel(),
        handlers: ["console"],
      },
    },
  });
  await runWithPrisma(api);
}
