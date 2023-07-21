import { AbiEvent, narrow } from "npm:abitype";
import { keccak256, toBytes } from "npm:viem";
import { Buffer } from "node:buffer";

import { PrismaClient } from "../generated/client/deno/edge.ts";

import { formatAbiItemPrototype } from "../abitype.ts";

import sampleAbiJson from "./contracts/sampleAbi.json" assert { type: "json" };
import { combinedEnv } from "../runHelpers.ts";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: combinedEnv["DATABASE_URL"],
    },
  },
});

async function main() {
  const sampleAbi = narrow(sampleAbiJson).filter((abi) =>
    abi.type == "event"
  ) as AbiEvent[];
  const sampleContractAddress = Buffer.from(
    toBytes("0x17ec6f0ad5e7b141f7d750bfc3f8639b7a85e377"),
  );

  await Promise.all(sampleAbi.map(async (abi) => {
    const hash = Buffer.from(keccak256(
      new TextEncoder().encode(formatAbiItemPrototype(abi)),
      "bytes",
    ));

    await prisma.eventAbi.create({
      data: { hash, json: JSON.stringify(abi) },
    });

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
  }));
}

main().catch((e) => {
  throw e;
}).finally(async () => {
  await prisma.$disconnect();
});
