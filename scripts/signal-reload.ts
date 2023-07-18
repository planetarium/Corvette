import { connect } from "https://deno.land/x/amqp@v0.23.1/mod.ts";

import {
  controlEmitterRoutingKey,
  controlExchangeName,
  controlObserverRoutingKey,
} from "../constants.ts";
import { ControlMessage } from "../ControlMessage.ts";

const encoder = new TextEncoder();
const conn = await connect();
const chan = await conn.openChannel();

// declare AMQP exchange for control
await chan.declareExchange({ exchange: controlExchangeName });

// send reload message for observer
await chan.publish(
  { exchange: controlExchangeName, routingKey: controlObserverRoutingKey },
  { contentEncoding: "application/json" },
  encoder.encode(
    JSON.stringify({ action: "reload" } satisfies ControlMessage),
  ),
);

// send reload message for emitter
await chan.publish(
  { exchange: controlExchangeName, routingKey: controlEmitterRoutingKey },
  { contentEncoding: "application/json" },
  encoder.encode(
    JSON.stringify({ action: "reload" } satisfies ControlMessage),
  ),
);

await conn.close();
