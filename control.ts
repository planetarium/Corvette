import {
  controlEmitterRoutingKey,
  controlExchangeName,
  controlObserverRoutingKey,
} from "./constants.ts";

import type { AmqpChannel } from "https://deno.land/x/amqp@v0.23.1/mod.ts";
import type { ControlMessage } from "./ControlMessage.ts";

export const reload = (
  amqpChannel: AmqpChannel,
  destination:
    | typeof controlEmitterRoutingKey
    | typeof controlObserverRoutingKey,
) =>
  amqpChannel.publish(
    {
      exchange: controlExchangeName,
      routingKey: destination,
    },
    { contentEncoding: "application/json" },
    new TextEncoder().encode(
      JSON.stringify({ action: "reload" } satisfies ControlMessage),
    ),
  );
