import { DB } from "https://deno.land/x/sqlite@v3.7.2/mod.ts";
import { keccak256, toBytes } from "npm:viem";
import { AbiEvent, narrow } from "npm:abitype";

import { formatAbiItemPrototype } from "./abitype.ts";
import { monitor } from "./monitor.ts";
import { api } from "./api.ts";

import testAbiJson from "./testAbi.json" assert { type: "json" };
import { emitter } from "./emitter.ts";
import { testWebhookReceiver } from "./testWebhookReceiver.ts";

const db = new DB("./dev.db");

const seed: boolean = db.query(
  "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='ABI')",
)[0][0] === 0;

db.execute(`
  CREATE TABLE IF NOT EXISTS ABI (
    id BLOB PRIMARY KEY NOT NULL,
    abiJson TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS EventSource (
    address BLOB NOT NULL,
    abiId BLOB NOT NULL,
    PRIMARY KEY (address, abiId),
    FOREIGN KEY (abiId) REFERENCES ABI(id)
  );
  CREATE TABLE IF NOT EXISTS Event (
    blockTimestamp INTEGER NOT NULL,
    txIndex INTEGER NOT NULL,
    logIndex INTEGER NOT NULL,
    blockNumber INTEGER NOT NULL,
    blockHash BLOB NOT NULL,
    txHash BLOB NOT NULL,
    sourceAddress BLOB NOT NULL,
    abiId BLOB NOT NULL,
    topic1 BLOB,
    topic2 BLOB,
    topic3 BLOB,
    data BLOB,
    PRIMARY KEY (blockTimestamp, txIndex, logIndex),
    FOREIGN KEY (sourceAddress, abiId) REFERENCES EventSource(address, abiId),
    FOREIGN KEY (abiId) REFERENCES ABI(id)
  );
`);

if (seed) {
  const testAbi = narrow(testAbiJson) as AbiEvent[];
  const testAbiEvent = testAbi.find((abi) => abi.name === "TestEvent")!;

  const id = keccak256(
    new TextEncoder().encode(formatAbiItemPrototype(testAbiEvent)),
    "bytes",
  );

  db.query("INSERT INTO ABI (id, abiJson) VALUES (?, ?)", [
    id,
    JSON.stringify(testAbiEvent),
  ]);
  db.query("INSERT INTO EventSource (address, abiId) VALUES (?, ?)", [
    toBytes("0x63ACcd2dfcfaEdaD403b46066a9F6CA459cABDdE"),
    id,
  ]);
}

async function main() {
  const { evt } = monitor(db);
  emitter(db, evt, [{
    address: "0x63ACcd2dfcfaEdaD403b46066a9F6CA459cABDdE",
    abi: "TestEvent(uint256,int8,bytes32,address,bool,address)",
    url: "http://localhost:8001",
  }]);
  await Promise.all([api(db), testWebhookReceiver()]);
  console.log("asdf");
}

main().then(() => {
  db.close();
}).catch((e) => {
  db.close();
  throw e;
});
