import { Status } from "https://deno.land/std@0.188.0/http/http_status.ts";
import {
  Application as OakApplication,
  isHttpError,
  Router,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import type { DB } from "https://deno.land/x/sqlite@v3.7.2/mod.ts";
import { getAddress, keccak256, toBytes, toHex } from "npm:viem";
import { AbiEvent, narrow } from "npm:abitype";
import type { Evt } from "https://deno.land/x/evt@v2.4.22/mod.ts";
import type { EventMessage } from "./EventMessage.ts";
import { formatAbiItemPrototype } from "./abitype.ts";
import { emitter } from "./emitter.ts";

export function api(db: DB, evt: Evt<EventMessage>) {
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
    ctx.response.body = db.query(
      `INSERT INTO EventSource (address, abiId) VALUES (?, ?)
      RETURNING address, abiId`,
      [toBytes(address), toBytes(abiId)],
    ).map((x) => ({
      address: getAddress(toHex(x[0] as Uint8Array)),
      abi: formatAbiItemPrototype(JSON.parse(x[1] as string)),
      abiId: toHex(x[2] as Uint8Array),
    }))[0];
  });
  router.delete("/sources", async (ctx) => {
    const { address, abiId } = await ctx.request.body({ type: "json" }).value;
    db.query(
      `DELETE FROM EventSource WHERE address = ? AND abiId = ?`,
      [toBytes(address), toBytes(abiId)],
    );
    ctx.response.status = Status.NoContent;
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
    ctx.response.body = db.query(
      `INSERT INTO ABI (id, abiJson) VALUES (?, ?)
      RETURNING id, abiJson`,
      [id, JSON.stringify(testAbiEvent)],
    ).reduce((acc, x) => {
      const abi = JSON.parse(x[1] as string);
      Object.assign(acc, {
        [toHex(x[0] as Uint8Array)]: {
          signature: formatAbiItemPrototype(abi),
          abi: abi,
        },
      });
      return acc;
    }, {});
  });
  router.delete("/abi/:id", (ctx) => {
    const id = toBytes(ctx.params.id);
    db.query(`DELETE FROM ABI WHERE id = ?`, [id]);
    ctx.response.status = Status.NoContent;
  });

  router.post("/callback", (ctx) => {
    ctx.response.body = db.query(
      `SELECT address, abiId, callbackUrl FROM EventCallback`,
    ).map((row) => ({
      address: getAddress(toHex(row[0] as Uint8Array)),
      abiId: toHex(row[1] as Uint8Array),
      callbackUrl: row[2],
    }));
  });
  router.put("/callback", async (ctx) => {
    const { address, abiId, callbackUrl } = await ctx.request.body({
      type: "json",
    }).value;
    ctx.response.body = db.query(
      `INSERT INTO EventCallback
      (address, abiId, callbackUrl) values (?, ?, ?)
      RETURNING address, abiId, callbackUrl`,
      [toBytes(address), toBytes(abiId), callbackUrl],
    ).map((row) => ({
      address: getAddress(toHex(row[0] as Uint8Array)),
      abiId: toHex(row[1] as Uint8Array),
      callbackUrl: row[2],
    }))[0];
  });
  router.delete("/callback", async (ctx) => {
    const { address, abiId, callbackUrl } = await ctx.request.body({
      type: "json",
    }).value;
    db.query(
      `DELETE FROM EventCallback WHERE address = ? AND abiId = ? AND callbackUrl = ?`,
      [toBytes(address), toBytes(abiId), callbackUrl],
    );
    ctx.response.status = Status.NoContent;
  });
  router.post("/callback/test", async (ctx) => {
    const { address, abiId } = await ctx.request.body({ type: "json" }).value;
    const addressBytes = toBytes(address);
    const abiIdBytes = toBytes(abiId);

    const res = db.query(
      `SELECT EventCallback.callbackUrl, ABI.abiJson
      FROM EventCallback, ABI
      WHERE ABI.id = EventCallback.abiId
      AND address = ? AND abiId = ?`,
      [addressBytes, abiIdBytes],
    );

    const mappings = res.map((x) => ({
      address,
      abi: formatAbiItemPrototype(JSON.parse(x[1] as string)),
      url: x[0] as string,
    }));

    const { attaches } = emitter(db, evt, mappings);

    evt.post(
      {
        topic: {
          address: addressBytes,
          sigHash: abiIdBytes,
          topics: [],
        },
        message: {
          blockTimestamp: BigInt(Date.now()),
          txIndex: -1,
          logIndex: -1,
          blockNumber: 0n,
          blockHash: new Uint8Array([]),
        },
      },
    );

    attaches.detach();

    ctx.response.body = mappings;
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
