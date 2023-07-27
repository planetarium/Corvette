/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import { start } from "fresh/server.ts";
import manifest from "./fresh.gen.ts";

import twindPlugin from "fresh/plugins/twind.ts";
import twindConfig from "./twind.config.ts";

import { DatabaseUrlEnvKey, WebUISessionAppKey, WebUIUrlEnvKey } from "../constants.ts";
import { combinedEnv } from "../runHelpers.ts";
import { PrismaClient } from "../prisma-shim.ts";

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: combinedEnv[DatabaseUrlEnvKey],
    },
  },
});

// Used for fresh-session cookie store JWT encryption key
Deno.env.set("APP_KEY", combinedEnv[WebUISessionAppKey] ?? crypto.randomUUID());

const listenUrl = new URL(combinedEnv[WebUIUrlEnvKey]);

await start(manifest, {
  hostname: listenUrl.hostname,
  port: Number(listenUrl.port) || 80,
  plugins: [twindPlugin(twindConfig)],
});

await prisma.$disconnect();
