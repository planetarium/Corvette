import { load as load_env } from "https://deno.land/std@0.194.0/dotenv/mod.ts";
import { broker } from "https://deno.land/x/lop@0.0.0-alpha.0/mod.ts";

import { PrismaClient } from "./generated/client/deno/edge.ts";

import { api } from "./api.ts";
import { dataproxy } from "./dataproxy.ts";
import { emitter } from "./emitter.ts";
import { observer } from "./observer.ts";
import { testWebhookReceiver } from "./testWebhookReceiver.ts";

const env = await load_env();
const { abort: abortDataproxy } = await dataproxy();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});

const abortBroker = broker();

async function main() {
  await observer(prisma);
  await emitter(prisma);
  await Promise.all([api(prisma), testWebhookReceiver()]);
}

main().catch((e) => {
  throw e;
}).finally(async () => {
  abortBroker();
  await prisma.$disconnect();
  abortDataproxy();
});
