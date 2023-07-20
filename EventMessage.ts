import { decode, encode } from "https://deno.land/x/bencodex@0.2.2/mod.ts";

export type EventMessage = {
  address: Uint8Array;
  sigHash: Uint8Array;
  topics: Uint8Array[];
  blockTimestamp: bigint;
  txIndex: bigint;
  logIndex: bigint;
  blockNumber: bigint;
  blockHash: Uint8Array;
};

export type MarshaledEventMessage = [
  Uint8Array,
  Uint8Array,
  Uint8Array[],
  bigint,
  bigint,
  bigint,
  bigint,
  Uint8Array,
];

export function serializeEventMessage(msg: EventMessage): Uint8Array {
  return encode(
    [
      msg.address,
      msg.sigHash,
      msg.topics,
      msg.blockTimestamp,
      msg.txIndex,
      msg.logIndex,
      msg.blockNumber,
      msg.blockHash,
    ] satisfies MarshaledEventMessage,
  );
}

export function deserializeEventMessage(data: Uint8Array): EventMessage {
  const [
    address,
    sigHash,
    topics,
    blockTimestamp,
    txIndex,
    logIndex,
    blockNumber,
    blockHash,
  ] = decode(data) as MarshaledEventMessage;
  return {
    address,
    sigHash,
    topics,
    blockTimestamp,
    txIndex,
    logIndex,
    blockNumber,
    blockHash,
  } satisfies EventMessage;
}
