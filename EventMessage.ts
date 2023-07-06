export type EventMessage = {
  topic: { address: Uint8Array; sigHash: Uint8Array; topics: Uint8Array[] };
  message: {
    blockTimestamp: bigint;
    txIndex: number;
    logIndex: number;
    blockNumber: bigint;
    blockHash: Uint8Array;
  };
};
