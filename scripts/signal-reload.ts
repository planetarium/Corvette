import { connect } from "amqp/mod.ts";

import {
  ControlEmitterRoutingKey,
  ControlExchangeName,
  ControlObserverRoutingKey,
} from "../constants/constants.ts";
import { reload } from "../messages/control.ts";

const conn = await connect();
const chan = await conn.openChannel();

// declare AMQP exchange for control
await chan.declareExchange({ exchange: ControlExchangeName });

await Promise.all([
  reload(chan, ControlObserverRoutingKey),
  reload(chan, ControlEmitterRoutingKey),
]);

await conn.close();
