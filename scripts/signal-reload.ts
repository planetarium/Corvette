import { connect } from "https://deno.land/x/amqp@v0.23.1/mod.ts";

import { controlExchangeName } from "../constants.ts";
import { reloadControl } from "../control.ts";

const conn = await connect();
const chan = await conn.openChannel();

// declare AMQP exchange for control
await chan.declareExchange({ exchange: controlExchangeName });

await Promise.all([
  reloadControl(chan, "observer"),
  reloadControl(chan, "emitter"),
]);

await conn.close();
