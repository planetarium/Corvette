import { Status } from "https://deno.land/std@0.188.0/http/http_status.ts";
import {
  Application as OakApplication,
  isHttpError,
  Router,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { connect as connectAmqp } from "https://deno.land/x/amqp@v0.23.1/mod.ts";
import { Buffer } from "node:buffer";
import { getAddress, keccak256, toBytes, toHex } from "npm:viem";
import { AbiEvent, narrow } from "npm:abitype";
import { stringify as losslessJsonStringify } from "npm:lossless-json";

import { formatAbiItemPrototype } from "./abitype.ts";
import { evmEventsQueueName } from "./constants.ts";
import type { PrismaClient } from "./generated/client/deno/edge.ts";

export async function api(prisma: PrismaClient) {
  const amqpConnection = await connectAmqp();
  const amqpChannel = await amqpConnection.openChannel();
  await amqpChannel.declareQueue({ queue: evmEventsQueueName });

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
    ctx.response.body = JSON.stringify(
      (await prisma.eventSource.findMany({
        select: {
          address: true,
          Abi: {
            select: {
              hash: true,
              json: true,
            },
          },
        },
      })).map((item) => ({
        address: getAddress(toHex(item.address)),
        abi: formatAbiItemPrototype(JSON.parse(item.Abi.json)),
        abiHash: toHex(item.Abi.hash),
      })),
    );
  });
  router.put("/sources", async (ctx) => {
    const { address, abiHash } = await ctx.request.body({ type: "json" }).value;

    ctx.response.body = await prisma.eventSource.create({
      data: {
        address: Buffer.from(toBytes(address)),
        abiHash: Buffer.from(toBytes(abiHash)),
      },
      include: { Abi: { select: { json: true } } },
    }).then((item) => ({
      address: getAddress(toHex(item.address)),
      abi: formatAbiItemPrototype(JSON.parse(item.Abi.json)),
      abiHash: toHex(item.abiHash),
    }));
  });
  router.delete("/sources", async (ctx) => {
    const { address, abiHash } = await ctx.request.body({ type: "json" }).value;

    await prisma.eventSource.delete({
      where: {
        address_abiHash: {
          address: Buffer.from(toBytes(address)),
          abiHash: Buffer.from(toBytes(abiHash)),
        },
      },
    });

    ctx.response.status = Status.NoContent;
  });
  router.post("/sources/testWebhook", async (ctx) => {
    const { address, abiHash } = await ctx.request.body({ type: "json" }).value;

    amqpChannel.publish(
      { routingKey: evmEventsQueueName },
      { contentType: "application/json" },
      new TextEncoder().encode(losslessJsonStringify({
        address: address,
        sigHash: abiHash,
        topics: [],
        blockTimestamp: BigInt(Math.floor(Date.now() / 1000)),
        txIndex: -1,
        logIndex: -1,
        blockNumber: -1n,
        blockHash: "0x" + "0".repeat(64),
      })),
    );

    ctx.response.status = Status.NoContent;
  });

  router.get("/abi", (ctx) => {
    // TODO: show JSON Schema
    ctx.response.body = "Not yet implemented";
    ctx.response.status = Status.NotImplemented;
  });
  router.post("/abi", async (ctx) => {
    // TODO: parameters
    ctx.response.body = JSON.stringify(
      (await prisma.eventAbi.findMany()).reduce((acc, item) => {
        const abi = JSON.parse(item.json);
        Object.assign(acc, {
          [toHex(item.hash)]: {
            signature: formatAbiItemPrototype(abi),
            abi: abi,
          },
        });
        return acc;
      }, {}),
    );
  });
  router.put("/abi", async (ctx) => {
    const abiJson = await ctx.request.body({ type: "json" }).value;

    const testAbi = narrow(abiJson) as AbiEvent[];
    const testAbiEvent = testAbi.find((abi) => abi.name === "TestEvent");
    if (!testAbiEvent) {
      throw new Error("TestEvent not found in given ABI JSON.");
    }
    const hash = keccak256(
      new TextEncoder().encode(formatAbiItemPrototype(testAbiEvent)),
      "bytes",
    );

    ctx.response.body = await prisma.eventAbi.create({
      data: {
        hash: Buffer.from(hash),
        json: JSON.stringify(testAbiEvent),
      },
    }).then((item) => {
      const abi = JSON.parse(item.json);
      return {
        [toHex(item.hash)]: {
          signature: formatAbiItemPrototype(abi),
          abi: abi,
        },
      };
    });
  });
  router.delete("/abi/:hash", async (ctx) => {
    const hash = Buffer.from(toBytes(ctx.params.hash));

    await prisma.eventAbi.delete({ where: { hash } });

    ctx.response.status = Status.NoContent;
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
  router.put("/webhook", async (ctx) => {
    const { sourceAddress, abiHash, webhookUrl, topic1, topic2, topic3 } =
      await ctx.request.body({ type: "json" }).value;

    const topics = Object.fromEntries(
      [topic1, topic2, topic3].flatMap((val, idx) =>
        val ? [[`topic${idx + 1}`, Buffer.from(toBytes(val))]] : []
      ),
    );

    ctx.response.body = await prisma.emitDestination.create({
      data: {
        sourceAddress: Buffer.from(toBytes(sourceAddress)),
        abiHash: Buffer.from(toBytes(abiHash)),
        webhookUrl,
        ...topics,
      },
    }).then((item) => ({
      id: item.id,
      sourceAddress: getAddress(toHex(item.sourceAddress)),
      abiHash: toHex(item.abiHash),
      webhookUrl: item.webhookUrl,
      topic1: item.topic1 ? toHex(item.topic1) : undefined,
      topic2: item.topic2 ? toHex(item.topic2) : undefined,
      topic3: item.topic3 ? toHex(item.topic3) : undefined,
    }));
  });
  router.delete("/webhook/:id", async (ctx) => {
    const id = Number(ctx.params.id);

    await prisma.emitDestination.delete({ where: { id } });

    ctx.response.status = Status.NoContent;
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
  // TODO: configuration
  return app.listen({ port: 8000 });
}
