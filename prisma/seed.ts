import { load as load_env } from "https://deno.land/std@0.194.0/dotenv/mod.ts";
import { AbiEvent, narrow } from "npm:abitype";
import { keccak256, toBytes } from "npm:viem";
import { Buffer } from "node:buffer";

import { PrismaClient } from "../generated/client/deno/edge.ts";

import { formatAbiItemPrototype } from "../abitype.ts";

import sampleAbiJson from "./sampleAbi.json" assert { type: "json" };

const env = await load_env();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});

async function main() {
  const sampleAbi = narrow(sampleAbiJson) as AbiEvent[];
  const sampleAbiEvent = sampleAbi.find((abi) => abi.name === "TestEvent")!;

  const hash = Buffer.from(keccak256(
    new TextEncoder().encode(formatAbiItemPrototype(sampleAbiEvent)),
    "bytes",
  ));

  await prisma.eventAbi.create({
    data: { hash, json: JSON.stringify(sampleAbiEvent) },
  });

  const sampleContractAddress = Buffer.from(
    toBytes("0x63ACcd2dfcfaEdaD403b46066a9F6CA459cABDdE"),
  );
  await prisma.eventSource.create({
    data: { address: sampleContractAddress, abiHash: hash },
  });

  await prisma.emitDestination.create(
    {
      data: {
        sourceAddress: sampleContractAddress,
        abiHash: hash,
        webhookUrl: "http://localhost:8001",
      },
    },
  );
}

main().catch((e) => {
  throw e;
}).finally(async () => {
  await prisma.$disconnect();
});
