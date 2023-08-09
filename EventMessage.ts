import { decode, encode } from "bencodex";

export type EventMessage = {
  address: Uint8Array;
  sigHash: Uint8Array;
  abi: string;
  topics: Uint8Array[];
  data: Uint8Array;
  blockTimestamp: bigint;
  logIndex: bigint;
  blockNumber: bigint;
  blockHash: Uint8Array;
  txHash: Uint8Array;
};

export type MarshaledEventMessage = [
  EventMessage["address"],
  EventMessage["sigHash"],
  EventMessage["abi"],
  EventMessage["topics"],
  EventMessage["data"],
  EventMessage["blockTimestamp"],
  EventMessage["logIndex"],
  EventMessage["blockNumber"],
  EventMessage["blockHash"],
  EventMessage["txHash"],
];

export function serializeEventMessage(msg: EventMessage): Uint8Array {
  return encode(
    [
      msg.address,
      msg.sigHash,
      msg.abi,
      msg.topics,
      msg.data,
      msg.blockTimestamp,
      msg.logIndex,
      msg.blockNumber,
      msg.blockHash,
      msg.txHash,
    ] satisfies MarshaledEventMessage,
  );
}

export function deserializeEventMessage(msgData: Uint8Array): EventMessage {
  const [
    address,
    sigHash,
    abi,
    topics,
    data,
    blockTimestamp,
    logIndex,
    blockNumber,
    blockHash,
    txHash,
  ] = decode(msgData) as MarshaledEventMessage;
  return {
    address,
    sigHash,
    abi,
    topics,
    data,
    blockTimestamp,
    logIndex,
    blockNumber,
    blockHash,
    txHash,
  } satisfies EventMessage;
}
