import { connect } from "https://deno.land/x/amqp@v0.23.1/mod.ts";

import {
  ControlEmitterRoutingKey,
  ControlExchangeName,
  ControlObserverRoutingKey,
} from "../constants.ts";
import { reload } from "../control.ts";

const conn = await connect();
const chan = await conn.openChannel();

// declare AMQP exchange for control
await chan.declareExchange({ exchange: ControlExchangeName });

await Promise.all([
  reload(chan, ControlObserverRoutingKey),
  reload(chan, ControlEmitterRoutingKey),
]);

await conn.close();
