import {
  Application as OakApplication,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { isInteger, parse as losslessJsonParse } from "npm:lossless-json";

function numberParser(str: string) {
  if (isInteger(str)) {
    const bigInt = BigInt(str);
    return bigInt > Number.MAX_SAFE_INTEGER || bigInt < Number.MIN_SAFE_INTEGER
      ? bigInt
      : Number(str);
  }
  return parseFloat(str);
}

export function testWebhookReceiver() {
  const app = new OakApplication();
  app.use(async (ctx) => {
    console.log(
      losslessJsonParse(
        await ctx.request.body({ type: "text" }).value,
        undefined,
        numberParser,
      ),
    );
    ctx.response.body = "";
  });

  return app.listen({ port: 8001 });
}
