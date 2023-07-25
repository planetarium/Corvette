/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import { load } from "std/dotenv/mod.ts";

const env = await load({ export: true });

import { start } from "fresh/server.ts";
import manifest from "./fresh.gen.ts";

import twindPlugin from "fresh/plugins/twind.ts";
import twindConfig from "./twind.config.ts";

import { WebUIUrlEnvKey } from "../constants.ts";
import { combinedEnv } from "../runHelpers.ts";

import { PrismaClient } from "../generated/client/deno/edge.ts";

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});

if (!env.APP_KEY) Deno.env.set("APP_KEY", crypto.randomUUID());

const listenUrl = new URL(combinedEnv[WebUIUrlEnvKey]);

await start(manifest, {
  hostname: listenUrl.hostname,
  port: Number(listenUrl.port) || 80,
  plugins: [twindPlugin(twindConfig)],
});

await prisma.$disconnect();
