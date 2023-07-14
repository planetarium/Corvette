import { load as load_env } from "https://deno.land/std@0.194.0/dotenv/mod.ts";

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

async function main() {
  const { evt } = await observer(prisma);
  emitter(prisma, evt, [{
    address: "0x63ACcd2dfcfaEdaD403b46066a9F6CA459cABDdE",
    abi: "TestEvent(uint256,int8,bytes32,address,bool,address)",
    url: "http://localhost:8001",
  }]);
  await Promise.all([api(prisma), testWebhookReceiver()]);
}

main().catch((e) => {
  throw e;
}).finally(async () => {
  await prisma.$disconnect();
  abortDataproxy();
});
