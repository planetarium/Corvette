import { type AbiEvent, narrow } from "abitype";

import { Buffer } from "node:buffer";
import { keccak256, toBytes } from "npm:viem";

import { PrismaClient } from "~/prisma-shim.ts";

import { formatAbiItemPrototype } from "../abitype.ts";
import { combinedEnv, DatabaseUrlEnvKey } from "../utils/envUtils.ts";

import sampleAbiJson from "./contracts/sampleAbi.json" assert { type: "json" };

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: combinedEnv[DatabaseUrlEnvKey],
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
          webhookUrl: "http://localhost:8888",
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
