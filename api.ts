import { Status } from "https://deno.land/std@0.188.0/http/http_status.ts";

import { AmqpConnection } from "https://deno.land/x/amqp@v0.23.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import {
  Application as OakApplication,
  isHttpError,
  Router,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";

import { getAddress, toBytes, toHex } from "npm:viem";

import type { PrismaClient } from "./prisma-shim.ts";

import { serializeEventMessage } from "./EventMessage.ts";
import { formatAbiItemPrototype } from "./abitype.ts";
import {
  ApiUrlEnvKey,
  ControlExchangeName,
  EvmEventsQueueName,
} from "./constants.ts";
import { combinedEnv, runWithAmqp, runWithPrisma } from "./runHelpers.ts";

export async function api(
  prisma: PrismaClient,
  amqpConnection: AmqpConnection,
) {
  const abortController = new AbortController();
  const amqpChannel = await amqpConnection.openChannel();
  await amqpChannel.declareQueue({ queue: EvmEventsQueueName });
  await amqpChannel.declareExchange({ exchange: ControlExchangeName });

  const router = new Router();

  router.get("/", (ctx) => {
    // TODO: show JSON Schema
    ctx.response.body = "Not yet implemented";
    ctx.response.status = Status.NotImplemented;
  });
  router.post("/", async (ctx) => {
    // TODO: validation with Ajv
    const request = await ctx.request.body({ type: "json" }).value;
    if (request["before"] == null) {
      ctx.response.body = `{"error": "missing required field: 'before'."}`;
      ctx.response.status = Status.BadRequest;
      return;
    }
    if (request["after"] == null) {
      ctx.response.body = `{"error": "missing required field: 'after'."}`;
      ctx.response.status = Status.BadRequest;
      return;
    }
    if (request["prototype"] != null && request["abiId"] != null) {
      ctx.response.body =
        `{"error": "both mutually exclusive fields exist: 'prototype' and 'abiId'."}`;
      ctx.response.status = Status.BadRequest;
      return;
    }
    if (
      request["args"] != null && request["prototype"] == null &&
      request["abiId"] == null
    ) {
      ctx.response.body =
        `{"error": "'args' field requires either 'prototype' or 'abiId'."}`;
      ctx.response.status = Status.BadRequest;
      return;
    }
    // TODO
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
  runWithPrisma((prisma) =>
    Promise.resolve({
      runningPromise: runWithAmqp((amqpConnection) =>
        api(prisma, amqpConnection)
      ),
    })
  );
}
