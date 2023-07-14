import { Status } from "https://deno.land/std@0.188.0/http/http_status.ts";
import {
  Application as OakApplication,
  Router,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { getAddress, toHex } from "npm:viem";

import type { PrismaClient } from "./generated/client/deno/edge.ts";

import { formatAbiItemPrototype } from "./abitype.ts";

export function api(prisma: PrismaClient) {
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

  const app = new OakApplication();
  app.use(router.routes());
  app.use(router.allowedMethods());
  // TODO: configuration
  return app.listen({ port: 8000 });
}
