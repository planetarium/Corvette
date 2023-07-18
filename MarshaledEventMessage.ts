export type MarshaledEventMessage = {
  address: `0x${string}`;
  sigHash: `0x${string}`;
  topics: [`0x${string}`, ...`0x${string}`[]];
  blockTimestamp: bigint;
  txIndex: number;
  logIndex: number;
  blockNumber: bigint;
  blockHash: `0x${string}`;
};
