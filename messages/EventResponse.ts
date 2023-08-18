import { getAddress, toHex } from "npm:viem";

import { formatAbiItemPrototype } from "../abitype.ts";
import { decodeEventLog } from "../decodeEventLog.ts";
import { EventMessage } from "./EventMessage.ts";

export const serializeEventResponse = (evtMsg: EventMessage) => {
  const { args } = decodeEventLog({
    abi: [JSON.parse(evtMsg.abi)],
    data: toHex(evtMsg.data),
    topics: [...evtMsg.topics.toReversed(), evtMsg.sigHash].reduce(
      (acc, x) => x != undefined ? [toHex(x), ...acc] : [],
      [] as unknown as [] | [
        signature: `0x${string}`,
        ...args: `0x${string}`[],
      ],
    ),
  });

  return {
    blockIndex: evtMsg.blockNumber,
    logIndex: evtMsg.logIndex,
    blockHash: toHex(evtMsg.blockHash),
    transactionHash: toHex(evtMsg.txHash),
    sourceAddress: getAddress(toHex(evtMsg.address)),
    abiHash: toHex(evtMsg.sigHash),
    abiSignature: formatAbiItemPrototype(
      JSON.parse(evtMsg.abi),
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
