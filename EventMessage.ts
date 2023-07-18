export type EventMessage = {
  address: Uint8Array;
  sigHash: Uint8Array;
  topics: Uint8Array[];
  blockTimestamp: bigint;
  txIndex: number;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Uint8Array;
};
