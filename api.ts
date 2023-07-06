import { Status } from "https://deno.land/std@0.188.0/http/http_status.ts";
import {
  Application as OakApplication,
  Router,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import type { DB } from "https://deno.land/x/sqlite@v3.7.2/mod.ts";
import { getAddress, toHex } from "npm:viem";

import { formatAbiItemPrototype } from "./abitype.ts";

export function api(db: DB) {
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
  router.post("/sources", (ctx) => {
    // TODO: parameters
    ctx.response.body = JSON.stringify(
      db.query(
        `SELECT EventSource.address, Abi.abiJson, Abi.id FROM EventSource
        INNER JOIN ABI ON EventSource.AbiId = ABI.id`,
      ).map((x) => ({
        address: getAddress(toHex(x[0] as Uint8Array)),
        abi: formatAbiItemPrototype(JSON.parse(x[1] as string)),
        abiId: toHex(x[2] as Uint8Array),
      })),
    );
  });
  router.get("/abi", (ctx) => {
    // TODO: show JSON Schema
    ctx.response.body = "Not yet implemented";
    ctx.response.status = Status.NotImplemented;
  });
  router.post("/abi", (ctx) => {
    // TODO: parameters
    ctx.response.body = JSON.stringify(
      db.query(
        `SELECT id, abiJson FROM EventSource
        INNER JOIN ABI ON EventSource.AbiId = ABI.id`,
      ).reduce((acc, x) => {
        const abi = JSON.parse(x[1] as string);
        Object.assign(acc, {
          [toHex(x[0] as Uint8Array)]: {
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
  return app.listen({ port: 8000 });
}
