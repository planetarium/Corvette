import { getLogger } from "std/log/mod.ts";

import type { AmqpChannel } from "amqp/mod.ts";

import {
  type EmitterControlMessages,
  type ObserverControlMessages,
  serializeControlMessage,
} from "./ControlMessage.ts";
import {
  ControlEmitterRoutingKey,
  ControlExchangeName,
  ControlObserverRoutingKey,
} from "../constants.ts";
import { ControlLoggerName } from "../utils/logUtils.ts";

export function reload(
  amqpChannel: AmqpChannel,
  destination:
    | typeof ControlEmitterRoutingKey
    | typeof ControlObserverRoutingKey,
) {
  const logger = getLogger(ControlLoggerName);
  logger.info(`Sending reload message to control: ${destination}.`);
  const { routingKey, reloadMessage }: {
    routingKey: typeof ControlEmitterRoutingKey;
    reloadMessage: EmitterControlMessages;
  } | {
    routingKey: typeof ControlObserverRoutingKey;
    reloadMessage: ObserverControlMessages;
  } = { routingKey: destination, reloadMessage: { action: "reload" } };
  amqpChannel.publish(
    {
      exchange: ControlExchangeName,
      routingKey,
    },
    { contentEncoding: "application/octet-stream" },
    serializeControlMessage(reloadMessage),
  );
}
