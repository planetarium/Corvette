import type { AmqpChannel } from "https://deno.land/x/amqp@v0.23.1/mod.ts";

import {
  EmitterControlMessages,
  ObserverControlMessages,
  ReloadControlMessage,
  serializeControlMessage,
} from "./ControlMessage.ts";
import {
  ControlEmitterRoutingKey,
  ControlExchangeName,
  ControlObserverRoutingKey,
} from "./constants.ts";

export function reload(
  amqpChannel: AmqpChannel,
  destination:
    | typeof ControlEmitterRoutingKey
    | typeof ControlObserverRoutingKey,
) {
  const { routingKey, reloadMessage }: {
    routingKey: typeof ControlEmitterRoutingKey;
    reloadMessage: EmitterControlMessages;
  } | {
    routingKey: typeof ControlObserverRoutingKey;
    reloadMessage: ObserverControlMessages;
  } = { routingKey: destination, reloadMessage: ReloadControlMessage };
  amqpChannel.publish(
    {
      exchange: ControlExchangeName,
      routingKey,
    },
    { contentEncoding: "application/octet-stream" },
    serializeControlMessage(reloadMessage),
  );
}
