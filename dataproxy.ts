import * as path from "std/path/mod.ts";
import { exists as fileExists } from "std/fs/mod.ts";
import { ConsoleHandler } from "std/log/handlers.ts";
import { getLogger, setup as setupLog } from "std/log/mod.ts";

import { Application as OakApplication, isHttpError, proxy } from "oak";

import { getFreePort } from "https://deno.land/x/free_port@v1.2.0/mod.ts";

import {
  combinedEnv,
  DatabaseUrlEnvKey,
  DataproxyInternalPortEnvKey,
} from "./envUtils.ts";
import { DataproxyLoggerName, defaultLogFormatter } from "./logUtils.ts";
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
  const logger = getLogger(DataproxyLoggerName);
  const listenUrl = new URL(combinedEnv.DATABASE_URL);
  if (listenUrl.protocol !== "prisma:") {
    const message =
      `${DatabaseUrlEnvKey} should be a data proxy URL starting with 'prisma://' to work with data proxy.`;
    logger.critical(`Irrecoverable error: ${message}`);
    throw new Error(message);
  }
  const apiKey = new URLSearchParams(listenUrl.search).get("api_key");
  if (!apiKey) {
    const message = `Missing api_key in ${DatabaseUrlEnvKey}`;
    logger.critical(`Irrecoverable error: ${message}`);
    throw new Error(message);
  }
  if (!await fileExists(schemaPath)) {
    const message =
      `Prisma schema does not exist at ${schemaPath}. Generate with \`${scriptString} generate\`.`;
    logger.critical(`Irrecoverable error: ${message}`);
    throw new Error(message);
  }
  const port = Number(listenUrl.port) || 443;
  const parsedInternalPort = Number(combinedEnv[DataproxyInternalPortEnvKey]);
  const internalPort = parsedInternalPort === 0
    ? await getFreePort(8089)
    : Number.isNaN(parsedInternalPort)
    ? undefined
    : parsedInternalPort;
  if (!internalPort) {
    const message = "DATAPROXY_INTERNAL_PORT is given, but is not a number.";
    logger.critical(`Irrecoverable error: ${message}`);
    throw new Error(message);
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
      }
    }
  });

  app.use(proxy("http://localhost:" + internalPort.toString()));

  logger.info(
    `Data proxy listening on ${listenUrl}, internal port: ${internalPort}.`,
  );
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
    logger.warning("Stopping data proxy.");
    controller.abort();
    await runningPromise;
  }

  async function waitUntilReady(url: string, cleanup: () => unknown) {
    while (true) {
      try {
        if (
          !((await (await fetch(url, { method: "OPTION" })).text())
            .includes("Connection refused"))
        ) {
          logger.info(`Port ready: ${new URL(url).port}.`);
          break;
        }
      } catch (e) {
        if (!e.message.includes("Connection refused")) {
          logger.critical(`Irrecoverable error: ${e}`);
          cleanup();
          throw e;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
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

const filename = getRelativeScriptPath(import.meta.url);
const scriptString = (filename.endsWith(".ts") ? "deno run " : "") + filename;

async function main() {
  if (Deno.args.length == 0) {
    setupLog({
      handlers: {
        console: new ConsoleHandler("DEBUG", {
          formatter: defaultLogFormatter,
        }),
      },

      loggers: {
        [DataproxyLoggerName]: {
          level: "DEBUG",
          handlers: ["console"],
        },
      },
    });
    await runAndCleanup(dataproxy);
  } else if (Deno.args.length == 1 && Deno.args[0] == "generate") {
    await generateDataproxy();
  } else console.log("usage: " + scriptString + " [generate]");
}

if (import.meta.main) await main();
