import { Status } from "https://deno.land/std@0.188.0/http/http_status.ts";
import {
  Application as OakApplication,
  Router,
  isHttpError,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import type { DB } from "https://deno.land/x/sqlite@v3.7.2/mod.ts";
import { getAddress, toHex, fromHex, keccak256, Hex } from "npm:viem";
import { AbiEvent, narrow } from "npm:abitype";

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
  router.put("/sources", async (ctx) => {
    const { address, abiId } = await ctx.request.body({ type: "json" }).value;
    const addressBlob = fromHex(address, 'bytes');
    const abiIdBlob = fromHex(abiId, 'bytes');
    ctx.response.body = db.query(
      `INSERT INTO EventSource (address, abiId) VALUES (?, ?)`,
      [addressBlob, abiIdBlob],
    );
  });
  router.delete("/sources", async (ctx) => {
    const { address, abiId } = await ctx.request.body({ type: "json" }).value;
    const addressBlob = fromHex(address, 'bytes');
    const abiIdBlob = fromHex(abiId, 'bytes');
    ctx.response.body = db.query(
      `DELETE FROM EventSource WHERE address = ? AND abiId = ?`,
      [addressBlob, abiIdBlob],
    );
    ctx.response.body = db.query(
      `SELECT EventSource.address, Abi.abiJson, Abi.id FROM EventSource
        INNER JOIN ABI ON EventSource.AbiId = ABI.id
        WHERE address = ? AND AbiId = ?`,
      [addressBlob, abiIdBlob],
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
        `SELECT id, abiJson FROM ABI`,
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
  router.put("/abi", async (ctx) => {
  const abiJson = await ctx.request.body({ type: "json" }).value;
  const testAbi = narrow(abiJson) as AbiEvent[];
  const testAbiEvent = testAbi.find((abi) => abi.name === "TestEvent");
  if (!testAbiEvent) throw new Error();

  const id = keccak256(
    new TextEncoder().encode(formatAbiItemPrototype(testAbiEvent)),
    "bytes",
  );

    db.query(
      `INSERT INTO ABI (id, abiJson) VALUES (?, ?)`,
      [id, JSON.stringify(testAbiEvent)],
    );
    ctx.response.body = JSON.stringify(
      db.query(
        `SELECT EventSource.address, Abi.abiJson, Abi.id FROM EventSource
        INNER JOIN ABI ON EventSource.AbiId = ABI.id
        WHERE ABI.id = ?`, [id]
      ).map((x) => ({
        address: getAddress(toHex(x[0] as Uint8Array)),
        abi: formatAbiItemPrototype(JSON.parse(x[1] as string)),
        abiId: toHex(x[2] as Uint8Array),
      })),
    )
  });
  router.delete("/abi/:id", (ctx) => {
    const id = fromHex(ctx.params.id as Hex, "bytes");
    ctx.response.body = db.query(
      `DELETE FROM ABI WHERE id = ?`,
      [id],
    );
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
  return app.listen({ port: 8000 });
}
