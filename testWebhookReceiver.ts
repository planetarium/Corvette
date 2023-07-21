import {
  Application as OakApplication,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { parse } from "npm:lossless-json";
import { runAndCleanup } from "./runHelpers.ts";

function numberParser(value: string) {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) return n;
  return BigInt(value);
}

export async function testWebhookReceiver() {
  const abortController = new AbortController();
  const app = new OakApplication();
  app.use(async (ctx) => {
    console.log(
      "Received Webhook:",
      parse(
        await ctx.request.body({ type: "text" }).value,
        undefined,
        numberParser,
      ),
    );
    ctx.response.body = "";
  });

  const runningPromise = app.listen({
    port: 8001,
    signal: abortController.signal,
  });

  async function cleanup() {
    abortController.abort();
    await runningPromise;
  }

  return await Promise.resolve({ runningPromise, cleanup });
}

if (import.meta.main) await runAndCleanup(testWebhookReceiver);
