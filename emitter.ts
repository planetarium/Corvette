import type { Evt } from "https://deno.land/x/evt@v2.4.22/mod.ts";
import type { DB } from "https://deno.land/x/sqlite@v3.7.2/mod.ts";
import { parseAbiItem } from "npm:abitype";
import {
  createPublicClient,
  getAddress,
  http as httpViemTransport,
  isAddress,
  keccak256,
  toBytes,
  toHex,
} from "npm:viem";
import { stringify as losslessJsonStringify } from "npm:lossless-json";
import {
  isConstructorSignature,
  isErrorSignature,
  isEventSignature,
  isFallbackSignature,
  isFunctionSignature,
  isReceiveSignature,
  isStructSignature,
} from "https://esm.sh/v128/abitype@0.9.0/es2022/dist/esm/human-readable/runtime/signatures.js";

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
  db: DB,
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
        const finalized = observed.filter(async (x) => {
          const hash =
            (await client.getBlock({ blockNumber: x.message.blockNumber }))
              .hash;

          const isFinal = toHex(x.message.blockHash) === hash;
          if (isFinal) finalizedBlocks[hash] = x.message.blockNumber;
          return isFinal;
        });

        await Promise.all(
          finalized.map((x) => {
            const res = db.query(
              `SELECT
              Event.txHash,
              Event.sourceAddress,
              Event.topic1,
              Event.topic2,
              Event.topic3,
              Event.data,
              ABI.abiJson
            FROM Event
            INNER JOIN ABI ON Event.abiId = ABI.id
            WHERE blockTimestamp = ? AND txIndex = ? AND logIndex = ?`,
              [x.message.blockTimestamp, x.message.txIndex, x.message.logIndex],
            )[0];
            if (!res) {
              // assume test event
              return x.url.map((url) =>
                fetch(url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: losslessJsonStringify({
                    message: x.message,
                    topic: x.topic,
                  }),
                })
              );
            }
            const [
              txHash,
              sourceAddress,
              topic1,
              topic2,
              topic3,
              data,
              abiJson,
            ] = res;
            const { args } = decodeEventLog({
              abi: [JSON.parse(abiJson as string)],
              data: toHex(data as Uint8Array),
              topics: [toHex(x.topic.sigHash)].concat(
                topic1 !== null
                  ? [toHex(topic1 as Uint8Array)].concat(
                    topic2 !== null
                      ? [toHex(topic2 as Uint8Array)].concat(
                        topic3 !== null ? [toHex(topic3 as Uint8Array)] : [],
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
                  transactionHash: toHex(txHash as Uint8Array),
                  sourceAddress: getAddress(toHex(sourceAddress as Uint8Array)),
                  abiId: toHex(x.topic.sigHash),
                  abi: formatAbiItemPrototype(JSON.parse(abiJson as string)),
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
        ).forEach((x) =>
          db.query(
            `DELETE FROM Event
            WHERE blockTimestamp = ? AND txIndex = ? AND logIndex = ?`,
            [x.message.blockTimestamp, x.message.txIndex, x.message.logIndex],
          )
        );

        queue = queue.filter(
          (x) => x.message.blockNumber > finalizedBlockNumber,
        );
      },
    },
  );
  return { attaches, watch };
}
