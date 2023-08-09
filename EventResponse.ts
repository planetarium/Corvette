import { getAddress, toHex } from "npm:viem";
import { decodeEventLog } from "./decodeEventLog.ts";
import { Event, EventAbi } from "./generated/client/index.d.ts";
import { formatAbiItemPrototype } from "./abitype.ts";

export const serializeEventResponse = (event: Event & { Abi: EventAbi }) => {
  const { args } = decodeEventLog({
    abi: [JSON.parse(event.Abi.json)],
    data: toHex(event.data as unknown as Uint8Array),
    topics: [toHex(event.abiHash)].concat(
      event.topic1 !== null
        ? [toHex(event.topic1 as unknown as Uint8Array)].concat(
          event.topic2 !== null
            ? [toHex(event.topic2 as unknown as Uint8Array)].concat(
              event.topic3 !== null
                ? [toHex(event.topic3 as unknown as Uint8Array)]
                : [],
            )
            : [],
        )
        : [],
    ) as [signature: `0x${string}`, ...args: `0x${string}`[]],
  });

  return {
    timestamp: event.blockTimestamp,
    blockIndex: event.blockNumber,
    logIndex: event.logIndex,
    blockHash: toHex(event.blockHash),
    transactionHash: toHex(event.txHash),
    sourceAddress: getAddress(toHex(event.sourceAddress)),
    abiHash: toHex(event.abiHash),
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
  };
};
