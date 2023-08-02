import * as path from "https://deno.land/std@0.193.0/path/mod.ts";
import { exists as fileExists } from "https://deno.land/std@0.195.0/fs/mod.ts";

import { getFreePort } from "https://deno.land/x/free_port@v1.2.0/mod.ts";
import {
  Application as OakApplication,
  isHttpError,
  proxy,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";

import {
  combinedEnv,
  DatabaseUrlEnvKey,
  DataproxyInternalPortEnvKey,
} from "./envUtils.ts";
import { baseDir, getRelativeScriptPath } from "./moduleUtils.ts";
import { runAndCleanup } from "./runHelpers.ts";

const dataProxyPath = path.join(baseDir, "dataproxy");
const schemaPath = path.join(dataProxyPath, "schema.prisma");

export async function generateDataproxy() {
  const schema = new TextDecoder().decode(
    (await new Deno.Command("awk", {
      args: [
        `
        /datasource[[:space:]]+[^[:space:]]+[[:space:]]*\\{/ {datasource=1}
        /generator[[:space:]]+client[[:space:]]*\\{/ {generator=1}
        /}/ { if (datasource) datasource=0; if (generator) generator=0; }
        datasource && /url[[:space:]]*=/ {print "  url = env(\\"DIRECT_URL\\")"; next}
        datasource && /directUrl[[:space:]]*=/ {next}
        !generator || !/(previewFeatures|output)[[:space:]]*=/
        `,
        path.join(baseDir, "prisma", "schema.prisma"),
      ],
      stdout: "piped",
    }).output()).stdout,
  );
  await Deno.writeTextFile(schemaPath, schema);

  await new Deno.Command("yarn", {
    cwd: dataProxyPath,
    args: [
      "install",
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();

  await new Deno.Command("yarn", {
    cwd: dataProxyPath,
    args: [
      "prisma",
      "generate",
      `--schema=${schemaPath}`,
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
}

export async function dataproxy() {
  const listenUrl = new URL(combinedEnv.DATABASE_URL);
  if (listenUrl.protocol !== "prisma:") {
    throw new Error(
      `${DatabaseUrlEnvKey} should be a data proxy URL starting with 'prisma://' to work with data proxy.`,
    );
  }
  const apiKey = new URLSearchParams(listenUrl.search).get("api_key");
  if (!apiKey) throw new Error(`Missing api_key in ${DatabaseUrlEnvKey}`);
  if (!await fileExists(schemaPath)) {
    throw new Error(
      `Prisma schema does not exist at ${schemaPath}. Generate with \`${scriptString} generate\`.`,
    );
  }
  const port = Number(listenUrl.port) || 443;
  const parsedInternalPort = Number(combinedEnv[DataproxyInternalPortEnvKey]);
  const internalPort = parsedInternalPort === 0
    ? await getFreePort(8089)
    : Number.isNaN(parsedInternalPort)
    ? undefined
    : parsedInternalPort;
  if (!internalPort) {
    throw new Error("DATAPROXY_INTERNAL_PORT is given, but is not a number.");
  }

  const controller = new AbortController();
  const { signal } = controller;

  const app = new OakApplication();
  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (e) {
      if (!isHttpError(e)) {
        ctx.response.status = 500;
        ctx.response.body = e.message;
        return;
      }
    }
  });

  app.use(proxy("http://localhost:" + internalPort.toString()));

  const runningPromise = Promise.all([
    new Deno.Command("yarn", {
      cwd: dataProxyPath,
      args: ["pdp"],
      env: {
        "PRISMA_SCHEMA_PATH": schemaPath,
        "DIRECT_URL": combinedEnv.DIRECT_URL.startsWith("file:")
          ? "file:" +
            path.join(baseDir, "prisma", combinedEnv.DIRECT_URL.slice(5))
          : combinedEnv.DIRECT_URL,
        "DATA_PROXY_API_KEY": apiKey,
        "PORT": internalPort.toString(),
      },
      stdout: "inherit",
      stderr: "inherit",
      signal,
    }).spawn().status.then(() => controller.abort()),
    app.listen({
      hostname: listenUrl.hostname,
      port,
      cert: await Deno.readTextFile(path.join(baseDir, "dev.crt")),
      key: await Deno.readTextFile(path.join(baseDir, "dev.key")),
      signal,
    }),
  ]);

  async function cleanup() {
    controller.abort();
    await runningPromise;
  }

  await Promise.all([
    await waitUntilReady("https://localhost:" + port, cleanup),
    await waitUntilReady(
      "http://localhost:" + internalPort.toString(),
      cleanup,
    ),
  ]);

  return { runningPromise, cleanup };
}

async function waitUntilReady(url: string, cleanup: () => unknown) {
  while (true) {
    try {
      if (
        !((await (await fetch(url, { method: "OPTION" })).text())
          .includes("Connection refused"))
      ) break;
    } catch (e) {
      if (!e.message.includes("Connection refused")) {
        cleanup();
        throw e;
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

const filename = getRelativeScriptPath(import.meta.url);
const scriptString = (filename.endsWith(".ts") ? "deno run " : "") + filename;

async function main() {
  if (Deno.args.length == 0) await runAndCleanup(dataproxy);
  else if (Deno.args.length == 1 && Deno.args[0] == "generate") {
    await generateDataproxy();
  } else console.log("usage: " + scriptString + " [generate]");
}

if (import.meta.main) await main();
