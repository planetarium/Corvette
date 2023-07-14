import type { Evt } from "https://deno.land/x/evt@v2.4.22/mod.ts";
import { parseAbiItem } from "npm:abitype";
import { stringify as losslessJsonStringify } from "npm:lossless-json";
import {
  createPublicClient,
  getAddress,
  http as httpViemTransport,
  isAddress,
  keccak256,
  toBytes,
  toHex,
} from "npm:viem";

import {
  isConstructorSignature,
  isErrorSignature,
  isEventSignature,
  isFallbackSignature,
  isFunctionSignature,
  isReceiveSignature,
  isStructSignature,
} from "https://esm.sh/v128/abitype@0.9.0/es2022/dist/esm/human-readable/runtime/signatures.js";

import type { PrismaClient } from "./generated/client/deno/edge.ts";

import { EventMessage } from "./EventMessage.ts";
import { formatAbiItemPrototype } from "./abitype.ts";
import { mothershipDevnet } from "./chains.ts";
import { decodeEventLog } from "./decodeEventLog.ts";
import { uint8ArrayEqual } from "./utils.ts";

type TopicMapping = { address: string; abi: string; url: string | string[] };
type ResolvedMapping = {
  address: Uint8Array;
  sigHash: Uint8Array;
  url: string[];
};

export function emitter(
  prisma: PrismaClient,
  evt: Evt<EventMessage>,
  topicMapping: TopicMapping[],
) {
  const encoder = new TextEncoder();
  const client = createPublicClient({
    chain: mothershipDevnet,
    transport: httpViemTransport(),
  });
  let queue: (EventMessage & { url: string[] })[] = [];
  let invalidAddresses: string[];
  if (
    (invalidAddresses = topicMapping.filter((x) => !isAddress(x.address)).map((
      x,
    ) => x.address)).length > 0
  ) {
    throw new Error(
      `Invalid address${
        invalidAddresses.length > 1 ? "es" : ""
      }: ${invalidAddresses.toString()}`,
    );
  }
  const mapping = topicMapping.reduce((acc, x) => {
    const address = toBytes(x.address);
    const abi = isEventSignature(x.abi)
      ? x.abi
      : isErrorSignature(x.abi) || isFunctionSignature(x.abi) ||
          isStructSignature(x.abi) || isConstructorSignature(x.abi) ||
          isFallbackSignature(x.abi) || isReceiveSignature(x.abi)
      ? undefined
      : "event " + x.abi;
    if (!abi) throw new Error("Only event ABIs can be used.");
    const sigHash = keccak256(
      encoder.encode(formatAbiItemPrototype(parseAbiItem(abi))),
      "bytes",
    );
    let entry: ResolvedMapping;
    return (entry = acc.filter((x) =>
        uint8ArrayEqual(x.address, address) &&
        uint8ArrayEqual(x.sigHash, sigHash)
      )[0]) !=
        null
      ? [
        ...acc.filter((x) =>
          !uint8ArrayEqual(x.address, address) ||
          !uint8ArrayEqual(x.sigHash, sigHash)
        ),
        {
          ...entry,
          url: entry.url.concat(x.url),
        },
      ]
      : acc.concat({
        address,
        sigHash,
        url: x.url instanceof Array ? x.url : [x.url],
      });
  }, [] as ResolvedMapping[]);
  const attaches = evt.attach(
    (message) => {
      return mapping.some(
        (x) =>
          uint8ArrayEqual(x.address, message.topic.address) &&
          uint8ArrayEqual(x.sigHash, message.topic.sigHash),
      );
    },
    (message) => {
      mapping.filter((x) =>
        uint8ArrayEqual(x.address, message.topic.address) &&
        uint8ArrayEqual(x.sigHash, message.topic.sigHash)
      ).forEach((x) => queue.push({ ...message, url: x.url }));
    },
  );

  const watch = client.watchBlockNumber(
    {
      onBlockNumber: async () => {
        const finalizedBlockNumber =
          // polygon-edge does not support finalized tag at the moment
          //(await client.getBlock({ blockTag: "finalized" })).number!;
          (await client.getBlock({ blockTag: "latest" })).number! - 64n;
        const observed = queue.filter((x) =>
          x.message.blockNumber <= finalizedBlockNumber
        );
        const finalizedBlocks: Record<string, bigint> = {};
        const finalized = await observed.reduce(async (acc, x) => {
          const hash =
            (await client.getBlock({ blockNumber: x.message.blockNumber }))
              .hash;

          const isFinal = toHex(x.message.blockHash) === hash;
          if (isFinal) finalizedBlocks[hash] = x.message.blockNumber;
          return isFinal ? [...(await acc), x] : acc;
        }, Promise.resolve([] as typeof observed));

        await Promise.all(
          finalized.map(async (x) => {
            const event = await prisma.event.findUnique({
              where: {
                blockTimestamp_txIndex_logIndex: {
                  blockTimestamp: new Date(
                    Number(x.message.blockTimestamp) * 1000,
                  ),
                  txIndex: x.message.txIndex,
                  logIndex: x.message.logIndex,
                },
              },
              select: {
                txHash: true,
                sourceAddress: true,
                topic1: true,
                topic2: true,
                topic3: true,
                data: true,
                Abi: {
                  select: {
                    json: true,
                  },
                },
              },
            });

            if (event == null) {
              console.error(
                `ERROR: event ${x.message.blockTimestamp}_${x.message.txIndex}_${x.message.logIndex} not found`,
              );
              return;
            }

            const { args } = decodeEventLog({
              abi: [JSON.parse(event.Abi.json)],
              data: toHex(event.data),
              topics: [toHex(x.topic.sigHash)].concat(
                event.topic1 !== null
                  ? [toHex(event.topic1)].concat(
                    event.topic2 !== null
                      ? [toHex(event.topic2)].concat(
                        event.topic3 !== null ? [toHex(event.topic3)] : [],
                      )
                      : [],
                  )
                  : [],
              ) as [signature: `0x${string}`, ...args: `0x${string}`[]],
            });
            return x.url.map((url) =>
              fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: losslessJsonStringify({
                  timestamp: x.message.blockTimestamp,
                  blockIndex: x.message.blockNumber,
                  transactionIndex: x.message.txIndex,
                  logIndex: x.message.logIndex,
                  blockHash: toHex(x.message.blockHash),
                  transactionHash: toHex(event.txHash),
                  sourceAddress: getAddress(
                    toHex(event.sourceAddress),
                  ),
                  abiHash: toHex(x.topic.sigHash),
                  abiSignature: formatAbiItemPrototype(
                    JSON.parse(event.Abi.json),
                  ),
                  args: {
                    named: Object.keys(args).filter((x) =>
                      !Object.keys([...(args as unknown[])]).includes(x)
                    ).reduce(
                      (acc, x) => ({
                        ...acc,
                        [x]: (args as Record<string, unknown>)[x],
                      }),
                      {},
                    ),
                    ordered: [...(args as unknown[])],
                  },
                }),
              })
            );
          }),
        );

        observed.filter((x) =>
          finalizedBlocks[toHex(x.message.blockHash)] !== x.message.blockNumber
        ).forEach(async (x) =>
          await prisma.event.delete({
            where: {
              blockTimestamp_txIndex_logIndex: {
                blockTimestamp: new Date(
                  Number(x.message.blockTimestamp) * 1000,
                ),
                txIndex: x.message.txIndex,
                logIndex: x.message.logIndex,
              },
            },
          })
        );

        queue = queue.filter(
          (x) => x.message.blockNumber > finalizedBlockNumber,
        );
      },
    },
  );
  return { attaches, watch };
}
