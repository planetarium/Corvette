import * as path from "https://deno.land/std@0.193.0/path/mod.ts";
import { Application as OakApplication } from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { proxy as oakHttpProxy } from "https://deno.land/x/oak_http_proxy@2.1.0/mod.ts";
import { load as load_env } from "https://deno.land/std@0.193.0/dotenv/mod.ts";

export async function dataproxy() {
  const env = await load_env();
  const apiKey = new URLSearchParams(new URL(env.DATABASE_URL).search).get(
    "api_key",
  );
  if (!apiKey) throw new Error("Missing api_key in DATABASE_URL");
  const __dirname = path.dirname(path.fromFileUrl(import.meta.url));
  const dataProxyPath = path.join(__dirname, "dataproxy");

  const schema = new TextDecoder().decode(
    (await new Deno.Command("awk", {
      args: [
        `/datasource[[:space:]]+[^[:space:]]+[[:space:]]*\{/ {datasource=1}
      /generator[[:space:]]+client[[:space:]]+{/ {generator=1}
      /}/ { if (datasource) datasource=0; if (generator) generator=0; }
      datasource && /directUrl[[:space:]]*=/ {next}
      !generator || !/(previewFeatures|output)[[:space:]]*=/`,
        path.join(__dirname, "prisma", "schema.prisma"),
      ],
      stdout: "piped",
    }).output()).stdout,
  );
  const schemaPath = path.join(dataProxyPath, "schema.prisma");
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

  const controller = new AbortController();
  const { signal } = controller;

  new Deno.Command("yarn", {
    cwd: dataProxyPath,
    args: ["pdp"],
    env: {
      "PRISMA_SCHEMA_PATH": schemaPath,
      "DATABASE_URL": env.DIRECT_URL.startsWith("file:")
        ? "file:" +
          new URL(path.join("prisma", env.DIRECT_URL.slice(5)), import.meta.url)
            .pathname
        : env.DIRECT_URL,
      "DATA_PROXY_API_KEY": apiKey,
      "PORT": "8003", // TODO: configuration
    },
    stdout: "inherit",
    stderr: "inherit",
    signal,
  }).spawn();

  while (true) {
    try {
      // TODO: configuration
      await fetch("http://localhost:8003", { method: "OPTION" });
      break;
    } catch (e) {
      if (!e.message.includes("Connection refused")) throw e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  const app = new OakApplication();

  // TODO: configuration
  app.use(oakHttpProxy("http://localhost:8003"));
  app.listen({
    port: 8002,
    cert: await Deno.readTextFile(path.join(__dirname, "dev.crt")),
    key: await Deno.readTextFile(path.join(__dirname, "dev.key")),
    signal,
  });

  while (true) {
    try {
      // TODO: configuration
      await fetch("https://localhost:8002", { method: "OPTION" });
      break;
    } catch (e) {
      if (!e.message.includes("Connection refused")) throw e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return { abort: () => controller.abort() };
}
